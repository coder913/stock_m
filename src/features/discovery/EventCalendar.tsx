import { Link } from "react-router-dom";
import type { CompanyEvent } from "./domain";

export function EventCalendar({ events }: { events: CompanyEvent[] }) {
  return <section><h2>财报日历</h2><ul className="event-calendar">{events.map((event) => <li key={event.id}><time dateTime={event.date}>{event.date}</time> · <Link to={`/stocks/${event.symbol}`}>{event.title}</Link> · {event.status === "confirmed" ? "已确认" : "预计"}</li>)}</ul></section>;
}
