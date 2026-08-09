import type { ConditionEvaluation, ThesisReview } from "./domain";

const evaluationLabels = { pending: "待验证", confirmed: "成立", breached: "受损", expired: "已过期" } as const;
const reviewLabels = { reaffirmed: "已复核：逻辑仍成立", invalidated: "已复核：逻辑失效", archived: "已复核：逻辑归档" } as const;
const timeLabel = (value: string) => new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

export function ConditionTimeline({ evaluations, reviews }: { evaluations: ConditionEvaluation[]; reviews: ThesisReview[] }) {
  const entries = [
    ...evaluations.map((evaluation) => ({ id: `evaluation-${evaluation.id}`, at: evaluation.evaluatedAt, label: evaluationLabels[evaluation.status], detail: evaluation.explanation })),
    ...reviews.map((review) => ({ id: `review-${review.id}`, at: review.createdAt, label: reviewLabels[review.decision], detail: review.note ?? "" })),
  ].sort((left, right) => left.at.localeCompare(right.at));
  if (!entries.length) return <p>暂无评估或复核记录。</p>;
  return <ol className="condition-timeline">{entries.map((entry) => <li key={entry.id}><time dateTime={entry.at}>{timeLabel(entry.at)}</time> <strong>{entry.label}</strong>{entry.detail && <span> · {entry.detail}</span>}</li>)}</ol>;
}
