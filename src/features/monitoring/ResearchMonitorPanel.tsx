import { useCallback, useEffect, useMemo, useState } from "react";
import type { MarketApiClient } from "../market/marketApiClient";
import type { ThesisStateService } from "../thesis/thesisApiRepository";
import { ConditionEditor, validateConditionDraft } from "./ConditionEditor";
import { ConditionStatusList } from "./ConditionStatusList";
import type { ConditionDraft, ConditionView, ThesisReview } from "./domain";
import type { MonitorStateService } from "./monitorApiRepository";
import { useRepositories } from "../../app/repositories";
import "./monitoring.css";

type MonitorClient = Pick<MarketApiClient, "getQuotes" | "getUniverse" | "getEvents">;
export interface ResearchMonitorPanelProps { symbol: string; marketClient: MonitorClient; onThesisSaved: (thesisId: string) => void; thesisService?: ThesisStateService; monitorState?: MonitorStateService; }

export function ResearchMonitorPanel(props: ResearchMonitorPanelProps) {
  const repositories = useRepositories();
  const thesisService = useMemo(() => props.thesisService ?? repositories.theses, [props.thesisService, repositories.theses]);
  const monitorState = useMemo(() => props.monitorState ?? repositories.monitoring, [props.monitorState, repositories.monitoring]);
  const [coreJudgment, setCoreJudgment] = useState("数据中心需求支持增长");
  const [evidence, setEvidence] = useState("收入趋势");
  const [risks, setRisks] = useState("估值压缩");
  const [legacyValidation, setLegacyValidation] = useState("下季财报");
  const [drafts, setDrafts] = useState<ConditionDraft[]>([]);
  const [thesisId, setThesisId] = useState<string>();
  const [views, setViews] = useState<ConditionView[]>([]);
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewDecision, setReviewDecision] = useState<ThesisReview["decision"]>("reaffirmed");
  const [reviewNote, setReviewNote] = useState("");

  const loadViews = useCallback(async (id: string): Promise<ConditionView[]> => {
    const conditions = await thesisService.listConditions(id);
    return Promise.all(conditions.map(async (condition) => {
      if (monitorState.getConditionState) {
        const state = await monitorState.getConditionState(condition.id);
        return { condition, evaluation: state.effective ?? state.latest, latestEvaluation: state.latest };
      }
      const evaluations = await monitorState.listEvaluations(condition.id);
      return { condition, evaluation: evaluations.at(-1) };
    }));
  }, [monitorState, thesisService]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const latest = await thesisService.getLatest(props.symbol);
      setThesisId(latest?.id); setWarnings([]);
      if (!latest) { setViews([]); return; }
      setCoreJudgment(latest.coreJudgment); setEvidence(latest.evidence.join("\n")); setRisks(latest.risks.join("\n")); setLegacyValidation(latest.validationConditions.join("\n"));
      setViews(await loadViews(latest.id)); props.onThesisSaved(latest.id);
    } catch { setWarnings(["投资逻辑状态暂时不可用，行情与研究数据仍可继续使用"]); }
    finally { setLoading(false); }
  }, [loadViews, props.onThesisSaved, props.symbol, thesisService]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const errors = drafts.flatMap(validateConditionDraft); if (errors.length) { setMessage(errors[0]); return; }
    try {
      const thesis = await thesisService.create({ symbol: props.symbol, coreJudgment, evidence: evidence.split("\n").map((item) => item.trim()).filter(Boolean), risks: risks.split("\n").map((item) => item.trim()).filter(Boolean), validationConditions: legacyValidation.split("\n").map((item) => item.trim()).filter(Boolean) });
      if (drafts.length) await thesisService.createConditions({ symbol: props.symbol, thesisVersionId: thesis.id, conditions: drafts });
      setThesisId(thesis.id); props.onThesisSaved(thesis.id); setViews(await loadViews(thesis.id)); setDrafts([]); setMessage("投资逻辑已保存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "投资逻辑保存失败"); }
  };
  const refresh = async () => { try { await monitorState.requestRun(); if (thesisId) setViews(await loadViews(thesisId)); setMessage("后台监控任务已提交"); } catch { setMessage("监控刷新失败，已保留上次有效结论"); } };
  const removeSaved = async (conditionId: string) => { try { await thesisService.softDeleteCondition(conditionId); if (thesisId) setViews(await loadViews(thesisId)); } catch { setMessage("条件删除失败，当前显示未变更"); } };
  const createVersionDraft = () => { setDrafts(views.map(({ condition }) => condition.kind === "metric" ? { id: crypto.randomUUID(), kind: "metric", name: condition.name, direction: condition.direction, severity: condition.severity, deadline: condition.deadline, note: condition.note, metric: condition.metric, operator: condition.operator, target: structuredClone(condition.target), period: condition.period } : { id: crypto.randomUUID(), kind: "event", name: condition.name, direction: condition.direction, severity: condition.severity, deadline: condition.deadline, note: condition.note, eventType: condition.eventType, occurrence: condition.occurrence, from: condition.from, to: condition.to })); setMessage("已复制当前条件；保存后将创建新的投资逻辑版本"); };
  const saveReview = async () => { if (!thesisId) return; if ((reviewDecision === "invalidated" || reviewDecision === "archived") && !reviewNote.trim()) { setMessage("失效或归档必须填写复核备注"); return; } try { await monitorState.recordReview({ thesisVersionId: thesisId, symbol: props.symbol, decision: reviewDecision, note: reviewNote.trim() || undefined, conditionSnapshot: views.map(({ condition, evaluation }) => ({ conditionId: condition.id, conditionVersion: condition.conditionVersion!, name: condition.name, severity: condition.severity, status: evaluation?.status ?? "pending" })) }); setMessage(reviewDecision === "reaffirmed" ? "已确认逻辑仍成立" : reviewDecision === "invalidated" ? "已标记逻辑失效" : "已归档投资逻辑"); } catch { setMessage("复核保存失败，当前显示未变更"); } };

  return <section className="research-monitor-panel" aria-labelledby="thesis-monitor-title"><h2 id="thesis-monitor-title">投资逻辑与监控</h2>
    {loading && <p role="status">正在加载投资逻辑</p>}
    <div className="thesis-fields"><label>核心判断<textarea value={coreJudgment} onChange={(event) => setCoreJudgment(event.target.value)} /></label><label>证据（每行一项）<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} /></label><label>风险（每行一项）<textarea value={risks} onChange={(event) => setRisks(event.target.value)} /></label><label>旧验证条件（每行一项，不参与自动监控）<textarea value={legacyValidation} onChange={(event) => setLegacyValidation(event.target.value)} /></label></div>
    <ConditionEditor drafts={drafts} onChange={setDrafts} /><div className="monitor-actions"><button type="button" onClick={() => void save()}>保存投资逻辑</button><button type="button" disabled={!thesisId} onClick={() => void refresh()}>刷新监控</button>{views.length > 0 && <button type="button" onClick={createVersionDraft}>基于当前条件新建版本</button>}</div>
    <p role="status">{message}</p>{warnings.length > 0 && <ul className="monitor-warnings" aria-label="监控数据恢复提示">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    <ConditionStatusList views={views} onDelete={(id) => { void removeSaved(id); }} />
    {thesisId && <section className="thesis-review"><h3>人工复核</h3><div className="monitor-actions"><button type="button" onClick={() => setReviewDecision("reaffirmed")}>确认逻辑仍成立</button><button type="button" onClick={() => setReviewDecision("invalidated")}>标记逻辑失效</button><button type="button" onClick={() => setReviewDecision("archived")}>归档逻辑</button></div><label>复核备注<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label><button type="button" onClick={() => void saveReview()}>保存复核</button></section>}
  </section>;
}
