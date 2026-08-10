import type { AlertActionInput, AlertListQuery, ConditionEvaluation, MonitorAlert, MonitorAlertAction, ReviewInput, ThesisReview } from "../../../shared/monitoring";
import { ApiClient } from "../../app/apiClient";

const key = (provided?: string) => provided ?? globalThis.crypto.randomUUID();
export interface MonitorStateService {
  listEvaluations(conditionId: string): Promise<ConditionEvaluation[]>;
  recordEvaluation(evaluation: ConditionEvaluation, idempotencyKey?: string): Promise<{ evaluation: ConditionEvaluation; inserted: boolean }>;
  listAlerts(query: AlertListQuery): Promise<MonitorAlert[]>;
  getAlert(id: string): Promise<MonitorAlert>;
  recordAlert(alert: MonitorAlert, idempotencyKey?: string): Promise<MonitorAlert>;
  act(id: string, action: AlertActionInput, idempotencyKey?: string): Promise<MonitorAlertAction>;
  listAlertActions(id: string): Promise<MonitorAlertAction[]>;
  listReviews(thesisVersionId: string): Promise<ThesisReview[]>;
  recordReview(review: ReviewInput, idempotencyKey?: string): Promise<ThesisReview>;
}
export class MonitorApiRepository implements MonitorStateService {
  constructor(private readonly client = new ApiClient("/api/v1")) {}
  listEvaluations(conditionId: string): Promise<ConditionEvaluation[]> { return this.client.requestJson({ path: `/monitor/evaluations?conditionId=${encodeURIComponent(conditionId)}` }); }
  recordEvaluation(evaluation: ConditionEvaluation, idempotencyKey?: string): Promise<{ evaluation: ConditionEvaluation; inserted: boolean }> { return this.client.requestJson({ method: "POST", path: "/monitor/evaluations", body: evaluation, idempotencyKey: key(idempotencyKey) }); }
  listAlerts(query: AlertListQuery): Promise<MonitorAlert[]> { const params = new URLSearchParams(); Object.entries(query).forEach(([name, value]) => { if (value !== undefined) params.set(name, String(value)); }); return this.client.requestJson({ path: `/monitor/alerts?${params.toString()}` }); }
  getAlert(id: string): Promise<MonitorAlert> { return this.client.requestJson({ path: `/monitor/alerts/${encodeURIComponent(id)}` }); }
  recordAlert(alert: MonitorAlert, idempotencyKey?: string): Promise<MonitorAlert> { return this.client.requestJson({ method: "POST", path: "/monitor/alerts", body: alert, idempotencyKey: key(idempotencyKey) }); }
  act(id: string, action: AlertActionInput, idempotencyKey?: string): Promise<MonitorAlertAction> { return this.client.requestJson({ method: "POST", path: `/monitor/alerts/${encodeURIComponent(id)}/actions`, body: action, idempotencyKey: key(idempotencyKey) }); }
  listAlertActions(id: string): Promise<MonitorAlertAction[]> { return this.client.requestJson({ path: `/monitor/alerts/${encodeURIComponent(id)}/actions` }); }
  listReviews(thesisVersionId: string): Promise<ThesisReview[]> { return this.client.requestJson({ path: `/monitor/reviews?thesisVersionId=${encodeURIComponent(thesisVersionId)}` }); }
  recordReview(review: ReviewInput, idempotencyKey?: string): Promise<ThesisReview> { return this.client.requestJson({ method: "POST", path: "/monitor/reviews", body: review, idempotencyKey: key(idempotencyKey) }); }
}
