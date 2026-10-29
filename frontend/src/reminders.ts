import type { ScheduleNotificationItem } from "./types";

const WEEKDAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Avisos do agendamento em minutos antes do evento, do mais cedo para o mais tarde. */
export function getReminderOffsets(item: ScheduleNotificationItem): number[] {
  const list = item.reminder_offsets?.length
    ? item.reminder_offsets
    : [item.remind_minutes_before ?? 0];
  return [...new Set(list)].sort((a, b) => b - a);
}

/** "0" → "na hora", 90 → "1h 30min antes", 1440 → "1 dia antes". */
export function formatReminderOffset(minutes: number): string {
  if (minutes <= 0) return "na hora";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "dia" : "dias"}`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}min`);
  return `${parts.join(" ")} antes`;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** O agendamento tem um evento exatamente nesta data e horário? */
function hasEventAt(item: ScheduleNotificationItem, when: Date): boolean {
  const hhmm = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  if ((item.notify_time || "").slice(0, 5) !== hhmm) return false;
  if (item.schedule_type === "daily") return true;
  if (item.schedule_type === "one_time") return item.target_date === toISODate(when);
  if (item.schedule_type === "recurring_weekly") {
    const days = (item.days_of_week || "").toLowerCase().split(",").map((d) => d.trim());
    return days.includes(WEEKDAY_CODES[when.getDay()]);
  }
  return false;
}

export interface DueReminder {
  item: ScheduleNotificationItem;
  offset: number;
  eventDate: string;
  /** Identifica este aviso específico, para não disparar duas vezes. */
  stamp: string;
}

/**
 * Avisos que devem disparar neste minuto. Para cada aviso (ex: 1 dia antes),
 * verifica se existe um evento em "agora + antecedência" — assim funciona
 * mesmo quando o aviso cai em outro dia.
 */
export function getDueReminders(schedules: ScheduleNotificationItem[], now: Date): DueReminder[] {
  const base = new Date(now);
  base.setSeconds(0, 0);
  const due: DueReminder[] = [];
  for (const item of schedules) {
    if (!item.enabled) continue;
    for (const offset of getReminderOffsets(item)) {
      const eventAt = new Date(base.getTime() + offset * 60000);
      if (hasEventAt(item, eventAt)) {
        const eventDate = toISODate(eventAt);
        due.push({ item, offset, eventDate, stamp: `${eventDate}_${item.notify_time}_${offset}` });
      }
    }
  }
  return due;
}
