import { BadRequestException, Injectable } from "@nestjs/common";
import { WhatsappDb } from "../whatsapp-db";
import { computeSchedule, describeOpening, weeklySummary, DateException, WeeklySlot } from "./schedule";

const TIME = /^\d{2}:\d{2}$/;

export interface ExceptionInput {
  localDate: string;
  description?: string;
  closed: boolean;
  opensAt?: string;
  closesAt?: string;
}

@Injectable()
export class BusinessHoursService {
  constructor(private readonly db: WhatsappDb) {}

  async load(companyId: number) {
    const [settings, weekly, exceptions] = await Promise.all([
      this.db.query("SELECT timezone FROM whatsapp_settings WHERE company_id = $1", [companyId]),
      this.db.query(
        `SELECT weekday, to_char(opens_at, 'HH24:MI') AS "opensAt", to_char(closes_at, 'HH24:MI') AS "closesAt"
         FROM whatsapp_business_hours WHERE company_id = $1 ORDER BY weekday, opens_at`,
        [companyId]
      ),
      this.db.query(
        `SELECT id, to_char(local_date, 'YYYY-MM-DD') AS "localDate", description, closed,
                to_char(opens_at, 'HH24:MI') AS "opensAt", to_char(closes_at, 'HH24:MI') AS "closesAt"
         FROM whatsapp_business_hour_exceptions
         WHERE company_id = $1 AND local_date >= CURRENT_DATE - 1
         ORDER BY local_date`,
        [companyId]
      ),
    ]);
    return {
      timezone: (settings.rows[0]?.timezone as string) || "America/Sao_Paulo",
      weekly: weekly.rows as WeeklySlot[],
      exceptions: exceptions.rows as (DateException & { id: number; description: string | null })[],
    };
  }

  async status(companyId: number, at: Date = new Date()) {
    const { timezone, weekly, exceptions } = await this.load(companyId);
    const schedule = computeSchedule(timezone, weekly, exceptions, at);
    return {
      timezone,
      isOpen: schedule.isOpen,
      closesAt: schedule.closesAt?.toISO() ?? null,
      nextOpening: schedule.nextOpening?.toJSDate() ?? null,
      nextOpeningText: schedule.nextOpening ? describeOpening(schedule.nextOpening, at) : null,
      weeklyText: weeklySummary(weekly),
      upcomingExceptions: exceptions.map((e) => ({
        data: e.localDate,
        descricao: e.description,
        fechado: e.closed,
        horario: e.closed ? null : `${e.opensAt}–${e.closesAt}`,
      })),
    };
  }

  async replaceWeekly(companyId: number, slots: { weekday: number; opensAt: string; closesAt: string }[]) {
    for (const s of slots) {
      if (!(s.weekday >= 0 && s.weekday <= 6) || !TIME.test(s.opensAt) || !TIME.test(s.closesAt) || s.opensAt >= s.closesAt) {
        throw new BadRequestException(`Turno inválido: ${JSON.stringify(s)}`);
      }
    }
    await this.db.transaction(async (client) => {
      await client.query("DELETE FROM whatsapp_business_hours WHERE company_id = $1", [companyId]);
      for (const s of slots) {
        await client.query(
          "INSERT INTO whatsapp_business_hours (company_id, weekday, opens_at, closes_at) VALUES ($1, $2, $3, $4)",
          [companyId, s.weekday, s.opensAt, s.closesAt]
        );
      }
    });
  }

  async upsertException(companyId: number, body: ExceptionInput) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.localDate || "")) throw new BadRequestException("Data inválida");
    const closed = body.closed !== false;
    if (!closed && (!TIME.test(body.opensAt || "") || !TIME.test(body.closesAt || "") || body.opensAt! >= body.closesAt!)) {
      throw new BadRequestException("Horário especial inválido");
    }
    await this.db.query(
      `INSERT INTO whatsapp_business_hour_exceptions (company_id, local_date, description, closed, opens_at, closes_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (company_id, local_date) DO UPDATE
       SET description = EXCLUDED.description, closed = EXCLUDED.closed, opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at`,
      [companyId, body.localDate, body.description || null, closed, closed ? null : body.opensAt, closed ? null : body.closesAt]
    );
  }

  async removeException(companyId: number, id: number) {
    await this.db.query("DELETE FROM whatsapp_business_hour_exceptions WHERE company_id = $1 AND id = $2", [companyId, id]);
  }
}
