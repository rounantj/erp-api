import { DateTime } from 'luxon';

export interface WeeklySlot {
  weekday: number; // 0 = domingo ... 6 = sábado
  opensAt: string; // HH:mm[:ss]
  closesAt: string;
}

export interface DateException {
  localDate: string; // YYYY-MM-DD
  closed: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
}

export interface ScheduleStatus {
  isOpen: boolean;
  closesAt: DateTime | null;
  nextOpening: DateTime | null;
}

const LOOKAHEAD_DAYS = 60;

function atTime(day: DateTime, hhmm: string): DateTime {
  const [hour, minute] = hhmm.split(':').map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

function intervalsForDay(day: DateTime, weekly: WeeklySlot[], exceptions: DateException[]) {
  const exception = exceptions.find((e) => e.localDate === day.toISODate());
  if (exception) {
    if (exception.closed || !exception.opensAt || !exception.closesAt) return [];
    return [{ start: atTime(day, exception.opensAt), end: atTime(day, exception.closesAt) }];
  }
  return weekly
    .filter((slot) => slot.weekday === day.weekday % 7)
    .map((slot) => ({ start: atTime(day, slot.opensAt), end: atTime(day, slot.closesAt) }))
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

export function computeSchedule(
  timezone: string,
  weekly: WeeklySlot[],
  exceptions: DateException[],
  now: Date = new Date(),
): ScheduleStatus {
  const localNow = DateTime.fromJSDate(now).setZone(timezone);
  const today = localNow.startOf('day');
  let isOpen = false;
  let closesAt: DateTime | null = null;

  for (let offset = 0; offset < LOOKAHEAD_DAYS; offset++) {
    const day = today.plus({ days: offset });
    for (const { start, end } of intervalsForDay(day, weekly, exceptions)) {
      if (localNow >= start && localNow < end) {
        isOpen = true;
        closesAt = end;
      } else if (start > localNow) {
        return { isOpen, closesAt, nextOpening: start };
      }
    }
  }
  return { isOpen, closesAt, nextOpening: null };
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function formatHour(dt: DateTime): string {
  return dt.minute ? `${dt.hour}h${String(dt.minute).padStart(2, '0')}` : `${dt.hour}h`;
}

// "hoje, às 8h" | "amanhã, às 8h" | "segunda-feira, às 8h" | "segunda-feira (10/11), às 8h"
export function describeOpening(opening: DateTime, now: Date = new Date()): string {
  const localNow = DateTime.fromJSDate(now).setZone(opening.zone);
  const days = Math.round(opening.startOf('day').diff(localNow.startOf('day'), 'days').days);
  const hour = formatHour(opening);
  if (days === 0) return `hoje, às ${hour}`;
  if (days === 1) return `amanhã, às ${hour}`;
  const weekday = WEEKDAYS[opening.weekday % 7];
  if (days < 7) return `${weekday}, às ${hour}`;
  return `${weekday} (${opening.toFormat('dd/MM')}), às ${hour}`;
}

export function weeklySummary(weekly: WeeklySlot[]): string {
  const lines: string[] = [];
  for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
    const slots = weekly.filter((s) => s.weekday === weekday);
    const text = slots.length
      ? slots.map((s) => `${s.opensAt.slice(0, 5)}–${s.closesAt.slice(0, 5)}`).join(' e ')
      : 'fechado';
    lines.push(`${WEEKDAYS[weekday]}: ${text}`);
  }
  return lines.join('\n');
}
