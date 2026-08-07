import { useState } from "react";
import { Link } from "react-router-dom";
import type { CompanyEvent } from "./domain";

export function EventCalendar({ events }: { events: CompanyEvent[] }) {
  const [view, setView] = useState<"week" | "list">("week");
  const [type, setType] = useState<"all" | CompanyEvent["type"]>("all");
  const ordered = [...events].filter((event) => type === "all" || event.type === type).sort((left, right) => left.date.localeCompare(right.date)); const title = (event: CompanyEvent) => event.symbol ? <Link to={`/stocks/${event.symbol}`}>{event.title}</Link> : <span>{event.title}</span>;
  return <section><h2>事件日历</h2><label>事件类型<select aria-label="事件类型" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="all">全部</option><option value="earnings">财报</option><option value="macro">宏观</option><option value="dividend">分红</option><option value="split">拆股</option></select></label><div><button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>周视图</button><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>列表视图</button></div>{view === "week" ? <div className="event-week">{ordered.map((event) => <article key={event.id}><time dateTime={event.date}>{event.date}</time>{title(event)}<span>{event.type}</span></article>)}</div> : <ul className="event-calendar">{ordered.map((event) => <li key={event.id}><time dateTime={event.date}>{event.date}</time> · {title(event)} · {event.type}</li>)}</ul>}</section>;
}
