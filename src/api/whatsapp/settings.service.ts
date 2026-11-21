import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { EvolutionClient } from "./evolution.client";
import { WhatsappDb } from "./whatsapp-db";

export interface WhatsappSettings {
  company_id: number;
  instance_name: string;
  webhook_token: string;
  bot_enabled: boolean;
  bot_name: string;
  instructions: string;
  human_takeover_minutes: number;
  product_cards_enabled: boolean;
  auto_product_images: boolean;
  timezone: string;
  connected_phone: string | null;
  connection_state: string | null;
  company_name: string;
}

export interface SettingsUpdate {
  botName?: string;
  instructions?: string;
  humanTakeoverMinutes?: number;
  productCardsEnabled?: boolean;
  autoProductImages?: boolean;
}

// Horário inicial ao ativar o módulo: seg–sex 08–18, sáb 08–12 (editável na tela de configuração).
const DEFAULT_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: "08:00", closes: "18:00" })).concat({
  weekday: 6,
  opens: "08:00",
  closes: "12:00",
});

@Injectable()
export class SettingsService {
  constructor(private readonly db: WhatsappDb, private readonly evolution: EvolutionClient) {}

  async find(companyId: number): Promise<WhatsappSettings | null> {
    const { rows } = await this.db.query(
      `SELECT s.*, COALESCE(c.name, 'nossa loja') AS company_name
       FROM whatsapp_settings s JOIN companies c ON c.id = s.company_id
       WHERE s.company_id = $1`,
      [companyId]
    );
    return rows[0] ?? null;
  }

  async getOrCreate(companyId: number): Promise<WhatsappSettings> {
    const existing = await this.find(companyId);
    if (existing) return existing;
    await this.db.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO whatsapp_settings (company_id, instance_name, webhook_token, bot_name)
         VALUES ($1, $2, $3, 'Assistente')
         ON CONFLICT (company_id) DO NOTHING RETURNING company_id`,
        [companyId, this.evolution.instanceNameFor(companyId), randomBytes(24).toString("hex")]
      );
      if (!inserted.rowCount) return;
      for (const h of DEFAULT_HOURS) {
        await client.query(
          `INSERT INTO whatsapp_business_hours (company_id, weekday, opens_at, closes_at) VALUES ($1, $2, $3, $4)`,
          [companyId, h.weekday, h.opens, h.closes]
        );
      }
    });
    return (await this.find(companyId))!;
  }

  async update(companyId: number, patch: SettingsUpdate): Promise<WhatsappSettings> {
    await this.getOrCreate(companyId);
    await this.db.query(
      `UPDATE whatsapp_settings SET
         bot_name = COALESCE($2, bot_name),
         instructions = COALESCE($3, instructions),
         human_takeover_minutes = COALESCE($4, human_takeover_minutes),
         product_cards_enabled = COALESCE($5, product_cards_enabled),
         auto_product_images = COALESCE($6, auto_product_images),
         updated_at = NOW()
       WHERE company_id = $1`,
      [
        companyId,
        patch.botName?.trim().slice(0, 60) || null,
        typeof patch.instructions === "string" ? patch.instructions.slice(0, 4000) : null,
        Number.isFinite(patch.humanTakeoverMinutes) ? Math.min(24 * 60, Math.max(5, Math.round(patch.humanTakeoverMinutes!))) : null,
        typeof patch.productCardsEnabled === "boolean" ? patch.productCardsEnabled : null,
        typeof patch.autoProductImages === "boolean" ? patch.autoProductImages : null,
      ]
    );
    return (await this.find(companyId))!;
  }

  async setBotEnabled(companyId: number, enabled: boolean) {
    await this.db.query(`UPDATE whatsapp_settings SET bot_enabled = $2, updated_at = NOW() WHERE company_id = $1`, [companyId, enabled]);
  }

  async setConnection(companyId: number, state: string | null, phone: string | null | undefined) {
    await this.db.query(
      `UPDATE whatsapp_settings
       SET connection_state = $2, connected_phone = CASE WHEN $3::boolean THEN $4 ELSE connected_phone END, updated_at = NOW()
       WHERE company_id = $1`,
      [companyId, state, phone !== undefined, phone ?? null]
    );
  }
}
