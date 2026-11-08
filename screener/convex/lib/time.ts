// Clock times in a client's timezone, without a date library: Intl knows the zones.

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

/** The wall-clock time at `at` in `timeZone`. */
export function wallClock(at: Date, timeZone: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute };
}

/** The instant a wall-clock time happens in `timeZone` (DST-safe to the minute). */
export function atWallClock(parts: Parts, timeZone: string): Date {
  const want = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let guess = want;
  // Two passes settle the zone's offset, including on a DST change day.
  for (let i = 0; i < 2; i++) {
    const seen = wallClock(new Date(guess), timeZone);
    guess += want - Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  }
  return new Date(guess);
}

/** Texts only go out from 8am to 9pm where the client is. */
export const QUIET_START = 21;
export const QUIET_END = 8;

export function inQuietHours(at: Date, timeZone: string): boolean {
  const { hour } = wallClock(at, timeZone);
  return hour >= QUIET_START || hour < QUIET_END;
}

/** `at`, or 8am the next morning (client time) when `at` falls in quiet hours. */
export function nextSendable(at: Date, timeZone: string): Date {
  if (!inQuietHours(at, timeZone)) return at;
  const now = wallClock(at, timeZone);
  // Before 8am: this morning. After 9pm: tomorrow morning.
  return now.hour < QUIET_END ? atWallClock({ ...now, hour: QUIET_END, minute: 0 }, timeZone) : atWallClock(addDay(now), timeZone);
}

const addDay = (p: Parts): Parts => {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: QUIET_END, minute: 0 };
};

/** 8pm the evening before an interview, client time. */
export function nightBefore(interviewAt: Date, timeZone: string): Date {
  const day = wallClock(interviewAt, timeZone);
  const prev = new Date(Date.UTC(day.year, day.month - 1, day.day - 1));
  return atWallClock({ year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1, day: prev.getUTCDate(), hour: 20, minute: 0 }, timeZone);
}

/** "Tue, Nov 10 at 2:30 PM" in the client's timezone, for texts. */
export function spoken(at: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(at);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
  return `${day} at ${time}`;
}
