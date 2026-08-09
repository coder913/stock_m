import { useEffect, useMemo, useState } from "react";
import type { MarketApiClient } from "../market/marketApiClient";
import { LocalThesisRepository } from "../thesis/localThesisRepository";
import { ConditionEditor, validateConditionDraft } from "./ConditionEditor";
import { ConditionRepository } from "./conditionRepository";
import { ConditionStatusList } from "./ConditionStatusList";
import type { ConditionDraft, ConditionView, ThesisReview } from "./domain";
import { EvaluationRepository } from "./evaluationRepository";
import { MonitorAlertRepository } from "./monitorAlertRepository";
import { MonitorSnapshotLoader } from "./monitorSnapshotLoader";
import { ThesisMonitorService } from "./thesisMonitorService";
import { ThesisReviewRepository } from "./thesisReviewRepository";
import "./monitoring.css";

type MonitorClient = Pick<MarketApiClient, "getQuotes" | "getUniverse" | "getEvents">;
type MonitorService = Pick<ThesisMonitorService, "evaluate" | "getConditionView">;

export interface ResearchMonitorPanelProps {
  symbol: string;
  marketClient: MonitorClient;
  onThesisSaved: (thesisId: string) => void;
  thesisRepository?: LocalThesisRepository;
  conditionRepository?: ConditionRepository;
  reviewRepository?: ThesisReviewRepository;
  monitorService?: MonitorService;
}

export function ResearchMonitorPanel(props: ResearchMonitorPanelProps) {
  const repositories = useMemo(() => {
    const thesisRepository = props.thesisRepository ?? new LocalThesisRepository(localStorage);
    const conditionRepository = props.conditionRepository ?? new ConditionRepository(localStorage);
    const reviewRepository = props.reviewRepository ?? new ThesisReviewRepository(localStorage);
    const monitorService = props.monitorService ?? new ThesisMonitorService({ conditionRepository, evaluationRepository: new EvaluationRepository(localStorage), alertRepository: new MonitorAlertRepository(localStorage), reviewRepository, thesisRepository, snapshotLoader: new MonitorSnapshotLoader(props.marketClient) });
    return { thesisRepository, conditionRepository, reviewRepository, monitorService };
  }, [props.thesisRepository, props.conditionRepository, props.reviewRepository, props.monitorService, props.marketClient]);
  const [coreJudgment, setCoreJudgment] = useState("数据中心需求支持增长");
  const [evidence, setEvidence] = useState("收入趋势");
  const [risks, setRisks] = useState("估值压缩");
  const [legacyValidation, setLegacyValidation] = useState("下季财报");
  const [drafts, setDrafts] = useState<ConditionDraft[]>([]);
  const [thesisId, setThesisId] = useState<string>();
  const [views, setViews] = useState<ConditionView[]>([]);
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reviewDecision, setReviewDecision] = useState<ThesisReview["decision"]>("reaffirmed");
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    let active = true;
    const latest = repositories.thesisRepository.getLatest(props.symbol);
    setThesisId(latest?.id);
    setWarnings([]);
    if (latest) {
      setCoreJudgment(latest.coreJudgment);
      setEvidence(latest.evidence.join("\n"));
      setRisks(latest.risks.join("\n"));
      setLegacyValidation(latest.validationConditions.join("\n"));
      setViews(repositories.monitorService.getConditionView(latest.id));
      props.onThesisSaved(latest.id);
      void repositories.monitorService.evaluate({ symbols: [props.symbol], now: new Date().toISOString() }).then((result) => {
        if (!active) return;
        setWarnings(result.warnings);
        setViews(repositories.monitorService.getConditionView(latest.id));
      }).catch(() => { if (active) setMessage("监控刷新失败，已保留上次有效结论"); });
    } else {
      setViews([]);
    }
    return () => { active = false; };
  }, [props.symbol, props.onThesisSaved, repositories]);

  const save = async () => {
    const errors = drafts.flatMap(validateConditionDraft);
    if (errors.length) { setMessage(errors[0]); return; }
    try {
      const now = new Date().toISOString();
      const thesis = repositories.thesisRepository.save({ symbol: props.symbol, coreJudgment, evidence: evidence.split("\n").map((item) => item.trim()).filter(Boolean), risks: risks.split("\n").map((item) => item.trim()).filter(Boolean), validationConditions: legacyValidation.split("\n").map((item) => item.trim()).filter(Boolean) }, now);
      repositories.conditionRepository.saveForThesis({ symbol: props.symbol, thesisVersionId: thesis.id, conditions: drafts, now });
      setThesisId(thesis.id);
      props.onThesisSaved(thesis.id);
      const result = await repositories.monitorService.evaluate({ symbols: [props.symbol], now });
      setWarnings(result.warnings);
      setViews(repositories.monitorService.getConditionView(thesis.id));
      setDrafts([]);
      setMessage("投资逻辑已保存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "投资逻辑保存失败"); }
  };

  const refresh = async () => {
    try { const result = await repositories.monitorService.evaluate({ symbols: [props.symbol], now: new Date().toISOString() }); setWarnings(result.warnings); if (thesisId) setViews(repositories.monitorService.getConditionView(thesisId)); setMessage("监控已刷新"); }
    catch { setMessage("监控刷新失败，已保留上次有效结论"); }
  };

  const removeSaved = (conditionId: string) => {
    repositories.conditionRepository.softDelete(conditionId, new Date().toISOString());
    if (thesisId) setViews(repositories.monitorService.getConditionView(thesisId));
  };

  const createVersionDraft = () => {
    setDrafts(views.map(({ condition }) => condition.kind === "metric" ? {
      id: crypto.randomUUID(), kind: "metric", name: condition.name, direction: condition.direction, severity: condition.severity, deadline: condition.deadline, note: condition.note,
      metric: condition.metric, operator: condition.operator, target: structuredClone(condition.target), period: condition.period,
    } : {
      id: crypto.randomUUID(), kind: "event", name: condition.name, direction: condition.direction, severity: condition.severity, deadline: condition.deadline, note: condition.note,
      eventType: condition.eventType, occurrence: condition.occurrence, from: condition.from, to: condition.to,
    }));
    setMessage("已复制当前条件；保存后将创建新的投资逻辑版本");
  };

  const saveReview = () => {
    if (!thesisId) return;
    if ((reviewDecision === "invalidated" || reviewDecision === "archived") && !reviewNote.trim()) { setMessage("失效或归档必须填写复核备注"); return; }
    repositories.reviewRepository.record({ thesisVersionId: thesisId, symbol: props.symbol, decision: reviewDecision, note: reviewNote.trim() || undefined, conditionSnapshot: views.map(({ condition, evaluation }) => ({ conditionId: condition.id, conditionVersion: condition.conditionVersion!, name: condition.name, severity: condition.severity, status: evaluation?.status ?? "pending" })) });
    setMessage(reviewDecision === "reaffirmed" ? "已确认逻辑仍成立" : reviewDecision === "invalidated" ? "已标记逻辑失效" : "已归档投资逻辑");
  };

  return <section className="research-monitor-panel" aria-labelledby="thesis-monitor-title">
    <h2 id="thesis-monitor-title">投资逻辑与监控</h2>
    <div className="thesis-fields">
      <label>核心判断<textarea value={coreJudgment} onChange={(event) => setCoreJudgment(event.target.value)} /></label>
      <label>证据（每行一项）<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} /></label>
      <label>风险（每行一项）<textarea value={risks} onChange={(event) => setRisks(event.target.value)} /></label>
      <label>旧验证条件（每行一项，不参与自动监控）<textarea value={legacyValidation} onChange={(event) => setLegacyValidation(event.target.value)} /></label>
    </div>
    <ConditionEditor drafts={drafts} onChange={setDrafts} />
    <div className="monitor-actions"><button type="button" onClick={() => void save()}>保存投资逻辑</button><button type="button" disabled={!thesisId} onClick={() => void refresh()}>刷新监控</button>{views.length > 0 && <button type="button" onClick={createVersionDraft}>基于当前条件新建版本</button>}</div>
    <p role="status">{message}</p>
    {warnings.length > 0 && <ul className="monitor-warnings" aria-label="监控数据恢复提示">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    <ConditionStatusList views={views} onDelete={removeSaved} />
    {thesisId && <section className="thesis-review"><h3>人工复核</h3><div className="monitor-actions"><button type="button" onClick={() => setReviewDecision("reaffirmed")}>确认逻辑仍成立</button><button type="button" onClick={() => setReviewDecision("invalidated")}>标记逻辑失效</button><button type="button" onClick={() => setReviewDecision("archived")}>归档逻辑</button></div><label>复核备注<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label><button type="button" onClick={saveReview}>保存复核</button></section>}
  </section>;
}
