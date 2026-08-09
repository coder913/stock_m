import type { LocalThesisRepository } from "../thesis/localThesisRepository";
import { evaluateCondition } from "./conditionEvaluator";
import type { ConditionRepository } from "./conditionRepository";
import type { EvaluationRepository } from "./evaluationRepository";
import type { MonitorAlertRepository } from "./monitorAlertRepository";
import type { ThesisReviewRepository } from "./thesisReviewRepository";
import type { ConditionEvaluation, ConditionView, MonitorRunResult, MonitorSnapshot, ReviewConditionSnapshot, ThesisCondition, ThesisHealthStatus, ThesisHealthSummary } from "./domain";

interface SnapshotLoader { load(conditions: ThesisCondition[], now: string): Promise<Map<string, MonitorSnapshot>>; }

export interface ThesisMonitorDependencies {
  conditionRepository: ConditionRepository;
  evaluationRepository: EvaluationRepository;
  alertRepository: MonitorAlertRepository;
  reviewRepository: ThesisReviewRepository;
  thesisRepository: LocalThesisRepository;
  snapshotLoader: SnapshotLoader;
  evaluator?: typeof evaluateCondition;
}

const concernKey = (item: Pick<ReviewConditionSnapshot, "conditionId" | "conditionVersion" | "status">) => `${item.conditionId}:${item.conditionVersion}:${item.status}`;

export class ThesisMonitorService {
  private readonly evaluator: typeof evaluateCondition;
  constructor(private readonly dependencies: ThesisMonitorDependencies) { this.evaluator = dependencies.evaluator ?? evaluateCondition; }

  async evaluate(input: { symbols?: string[]; now?: string } = {}): Promise<MonitorRunResult> {
    const now = input.now ?? new Date().toISOString();
    const activeConditions = this.dependencies.conditionRepository.listActive(input.symbols);
    const latestBySymbol = new Map(activeConditions.map((condition) => [condition.symbol, this.dependencies.thesisRepository.getLatest(condition.symbol)]));
    const conditions = activeConditions.filter((condition) => {
      const latest = latestBySymbol.get(condition.symbol);
      return latest?.id === condition.thesisVersionId && this.dependencies.reviewRepository.latest(condition.thesisVersionId)?.decision !== "archived";
    });
    if (!conditions.length) return { conditions: [], alertsCreated: 0, warnings: this.dependencies.conditionRepository.getWarnings() };
    const snapshots = await this.dependencies.snapshotLoader.load(conditions, now);
    const evaluations: ConditionEvaluation[] = [];
    let alertsCreated = 0;
    const warnings = [...this.dependencies.conditionRepository.getWarnings()];

    for (const condition of conditions) {
      const snapshot = snapshots.get(condition.symbol);
      if (!snapshot) { warnings.push(`${condition.symbol} 缺少监控快照`); continue; }
      const previousDecisive = this.dependencies.evaluationRepository.latestDecisive(condition.id);
      const previousLatest = this.dependencies.evaluationRepository.latest(condition.id);
      const evaluation = this.evaluator({ condition, snapshot, previousDecisive, now });
      const appended = this.dependencies.evaluationRepository.append(evaluation);
      evaluations.push(appended.evaluation);
      const fromStatus = previousLatest?.status ?? "pending";
      const isTransition = appended.inserted && evaluation.status !== "pending" && evaluation.status !== fromStatus && (evaluation.dataState === "fresh" || evaluation.status === "expired");
      if (isTransition) {
        const alert = this.dependencies.alertRepository.createTransition({ symbol: condition.symbol, thesisVersionId: condition.thesisVersionId, conditionId: condition.id, conditionVersion: condition.conditionVersion!, fromStatus, toStatus: evaluation.status, severity: condition.severity, title: `${condition.symbol} ${condition.name}`, explanation: evaluation.explanation, asOf: evaluation.asOf, createdAt: now });
        if (alert) alertsCreated += 1;
      }
    }
    return { conditions: evaluations, alertsCreated, warnings };
  }

  getConditionView(thesisVersionId: string): ConditionView[] {
    return this.dependencies.conditionRepository.listForThesis(thesisVersionId).map((condition) => ({ condition, evaluation: this.dependencies.evaluationRepository.latest(condition.id) }));
  }

  getHealth(symbols: string[], now = new Date().toISOString()): ThesisHealthSummary {
    const items = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))].map((symbol) => {
      const thesis = this.dependencies.thesisRepository.getLatest(symbol);
      const conditions = thesis ? this.dependencies.conditionRepository.listForThesis(thesis.id) : [];
      const views = conditions.map((condition) => ({ condition, evaluation: this.dependencies.evaluationRepository.latest(condition.id) }));
      const review = thesis ? this.dependencies.reviewRepository.latest(thesis.id) : undefined;
      const status = this.healthStatus(views, review);
      const breachedCount = views.filter(({ evaluation }) => evaluation?.status === "breached").length;
      const expiringCount = conditions.filter((condition) => {
        const end = condition.deadline ?? (condition.kind === "event" ? condition.to : undefined);
        if (!end) return false;
        const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(now)) / 86_400_000;
        return days >= 0 && days <= 7;
      }).length;
      const unreadAlertCount = this.dependencies.alertRepository.list({ view: "pending", now, symbol }).filter((alert) => !alert.readAt).length;
      return { symbol, thesisVersionId: thesis?.id, status, breachedCount, expiringCount, unreadAlertCount };
    });
    return { items, breachedCount: items.reduce((sum, item) => sum + item.breachedCount, 0), expiringCount: items.reduce((sum, item) => sum + item.expiringCount, 0), unreadAlertCount: items.reduce((sum, item) => sum + item.unreadAlertCount, 0) };
  }

  private healthStatus(views: ConditionView[], review: ReturnType<ThesisReviewRepository["latest"]>): ThesisHealthStatus {
    if (!views.length) return "unmonitored";
    if (review?.decision === "invalidated") return "invalidated";
    if (review?.decision === "archived") return "archived";
    const currentConcerns = views.filter(({ evaluation }) => evaluation?.status === "breached" || evaluation?.status === "expired");
    const reviewedConcerns = new Set((review?.conditionSnapshot ?? []).filter((item) => item.status === "breached" || item.status === "expired").map(concernKey));
    const unreviewed = currentConcerns.filter(({ condition, evaluation }) => {
      const key = concernKey({ conditionId: condition.id, conditionVersion: condition.conditionVersion!, status: evaluation!.status });
      if (!review || !reviewedConcerns.has(key)) return true;
      return this.dependencies.evaluationRepository.list(condition.id).some((item) => item.evaluatedAt > review.createdAt && item.changed && (item.status === "breached" || item.status === "expired"));
    });
    if (review?.decision === "reaffirmed" && unreviewed.length === 0) return "normal";
    const highBreaches = views.filter(({ condition, evaluation }) => condition.severity === "high" && evaluation?.status === "breached").length;
    const expired = views.filter(({ evaluation }) => evaluation?.status === "expired").length;
    const mediumBreaches = views.filter(({ condition, evaluation }) => condition.severity === "medium" && evaluation?.status === "breached").length;
    return unreviewed.length && (highBreaches > 0 || expired > 0 || mediumBreaches >= 2) ? "review-needed" : "normal";
  }
}
