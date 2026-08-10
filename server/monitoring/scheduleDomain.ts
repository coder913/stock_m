import { Temporal } from "@js-temporal/polyfill";

const marketTimeZone = "America/New_York";

export type MonitorRunType = "price" | "financial" | "event";

export interface RequiredRun {
  type: MonitorRunType;
  naturalPeriod: string;
  scheduledFor: string;
  catchUp: boolean;
}

export interface MarketScheduleCalendar {
  toMarketTime(iso: string): string;
  isRegularSession(marketIso: string): boolean;
  currentFiveMinutePriceRun(marketIso: string): RequiredRun;
  latestDueDailyRun(type: "financial" | "event", marketIso: string, dueTime: "18:00" | "18:15"): Omit<RequiredRun, "catchUp"> | undefined;
}

export interface ScheduleInput {
  now: string;
  calendar: MarketScheduleCalendar;
  lastSuccess: Partial<Record<MonitorRunType, string>>;
}

function instantString(value: Temporal.ZonedDateTime): string {
  return value.toInstant().toString({ fractionalSecondDigits: 3 });
}

function marketDateTime(value: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(value).toZonedDateTimeISO(marketTimeZone);
}

function localMinuteKey(value: Temporal.ZonedDateTime): string {
  return `${value.toPlainDate().toString()}T${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}${value.offset}`;
}

export function createUsEquityMarketCalendar(options: { closedDates?: readonly string[] } = {}): MarketScheduleCalendar {
  const closedDates = new Set(options.closedDates ?? []);
  const isTradingDay = (value: Temporal.ZonedDateTime): boolean => value.dayOfWeek <= 5 && !closedDates.has(value.toPlainDate().toString());

  return {
    toMarketTime(iso) {
      return marketDateTime(iso).toString({ timeZoneName: "never", fractionalSecondDigits: 0 });
    },
    isRegularSession(marketIso) {
      const value = marketDateTime(marketIso);
      const minutes = value.hour * 60 + value.minute;
      return isTradingDay(value) && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
    },
    currentFiveMinutePriceRun(marketIso) {
      const value = marketDateTime(marketIso).with({
        minute: Math.floor(marketDateTime(marketIso).minute / 5) * 5,
        second: 0,
        millisecond: 0,
        microsecond: 0,
        nanosecond: 0,
      });
      return {
        type: "price",
        naturalPeriod: localMinuteKey(value),
        scheduledFor: instantString(value),
        catchUp: false,
      };
    },
    latestDueDailyRun(type, marketIso, dueTime) {
      const now = marketDateTime(marketIso);
      const [hour, minute] = dueTime.split(":").map(Number);
      let candidate = now.with({ hour, minute, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
      if (Temporal.ZonedDateTime.compare(candidate, now) > 0) candidate = candidate.subtract({ days: 1 });
      while (!isTradingDay(candidate)) candidate = candidate.subtract({ days: 1 });
      return {
        type,
        naturalPeriod: candidate.toPlainDate().toString(),
        scheduledFor: instantString(candidate),
      };
    },
  };
}

export function requiredRunPeriods(input: ScheduleInput): RequiredRun[] {
  const runs: RequiredRun[] = [];
  const marketNow = input.calendar.toMarketTime(input.now);

  if (input.calendar.isRegularSession(marketNow)) {
    const price = input.calendar.currentFiveMinutePriceRun(marketNow);
    if (price.naturalPeriod !== input.lastSuccess.price) {
      runs.push({ ...price, catchUp: price.scheduledFor < new Date(input.now).toISOString() });
    }
  }

  for (const [type, dueTime] of [["financial", "18:00"], ["event", "18:15"]] as const) {
    const daily = input.calendar.latestDueDailyRun(type, marketNow, dueTime);
    if (daily && daily.naturalPeriod !== input.lastSuccess[type]) {
      runs.push({ ...daily, catchUp: daily.scheduledFor < new Date(input.now).toISOString() });
    }
  }
  return runs;
}
