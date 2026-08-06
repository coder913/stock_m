import { useState } from "react";
import { Link } from "react-router-dom";
import type { CompanyEvent } from "./domain";

export function EventCalendar({ events }: { events: CompanyEvent[] }) {
  const [view, setView] = useState<"week" | "list">("week");
  const ordered = [...events].sort((left, right) => left.date.localeCompare(right.date));
  return <section><h2>财报日历</h2><div><button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>周视图</button><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>列表视图</button></div>{view === "week" ? <div className="event-week">{ordered.map((event) => <article key={event.id}><time dateTime={event.date}>{event.date}</time><Link to={`/stocks/${event.symbol}`}>{event.title}</Link><span>{event.status === "confirmed" ? "已确认" : "预计"}</span></article>)}</div> : <ul className="event-calendar">{ordered.map((event) => <li key={event.id}><time dateTime={event.date}>{event.date}</time> · <Link to={`/stocks/${event.symbol}`}>{event.title}</Link> · {event.status === "confirmed" ? "已确认" : "预计"}</li>)}</ul>}</section>;
}
