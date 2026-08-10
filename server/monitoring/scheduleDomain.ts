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

function observedFixedHoliday(year: number, month: number, day: number): Temporal.PlainDate {
  const date = Temporal.PlainDate.from({ year, month, day });
  if (date.dayOfWeek === 6) return date.subtract({ days: 1 });
  if (date.dayOfWeek === 7) return date.add({ days: 1 });
  return date;
}

function nthWeekday(year: number, month: number, weekday: number, occurrence: number): Temporal.PlainDate {
  const first = Temporal.PlainDate.from({ year, month, day: 1 });
  return first.add({ days: (weekday - first.dayOfWeek + 7) % 7 + (occurrence - 1) * 7 });
}

function lastWeekday(year: number, month: number, weekday: number): Temporal.PlainDate {
  const last = Temporal.PlainDate.from({ year, month, day: 1 }).add({ months: 1 }).subtract({ days: 1 });
  return last.subtract({ days: (last.dayOfWeek - weekday + 7) % 7 });
}

function easterSunday(year: number): Temporal.PlainDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return Temporal.PlainDate.from({ year, month, day });
}

function isUsEquityHoliday(date: Temporal.PlainDate): boolean {
  const holidays = [
    observedFixedHoliday(date.year, 1, 1),
    nthWeekday(date.year, 1, 1, 3),
    nthWeekday(date.year, 2, 1, 3),
    easterSunday(date.year).subtract({ days: 2 }),
    lastWeekday(date.year, 5, 1),
    ...(date.year >= 2022 ? [observedFixedHoliday(date.year, 6, 19)] : []),
    observedFixedHoliday(date.year, 7, 4),
    nthWeekday(date.year, 9, 1, 1),
    nthWeekday(date.year, 11, 4, 4),
    observedFixedHoliday(date.year, 12, 25),
    observedFixedHoliday(date.year + 1, 1, 1),
  ];
  return holidays.some((holiday) => Temporal.PlainDate.compare(holiday, date) === 0);
}

export function createUsEquityMarketCalendar(options: { closedDates?: readonly string[] } = {}): MarketScheduleCalendar {
  const closedDates = new Set(options.closedDates ?? []);
  const isTradingDay = (value: Temporal.ZonedDateTime): boolean => value.dayOfWeek <= 5 && !isUsEquityHoliday(value.toPlainDate()) && !closedDates.has(value.toPlainDate().toString());

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
