import { Body, Controller, HttpCode, Logger, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { timingSafeEqual } from "crypto";
import { FeatureService } from "../subscription/feature.service";
import { IngestService } from "./ingest.service";
import { SettingsService } from "./settings.service";
import { WHATSAPP_FEATURE } from "./whatsapp.config";

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  return left.length === right.length && timingSafeEqual(left, right);
}

// Chamado pela Evolution. Sempre responde 200 para a Evolution não reenviar eventos que decidimos ignorar.
@Controller("whatsapp/webhook")
export class WhatsappWebhookController {
  private readonly logger = new Logger("WhatsappWebhook");

  constructor(
    private readonly settings: SettingsService,
    private readonly ingest: IngestService,
    private readonly features: FeatureService
  ) {}

  @Post(":companyId")
  @HttpCode(200)
  async receive(@Param("companyId", ParseIntPipe) companyId: number, @Query("token") token: string, @Body() body: any) {
    const settings = await this.settings.find(companyId);
    if (!settings || !sameToken(token, settings.webhook_token)) return { ok: false };
    if (body?.instance && body.instance !== settings.instance_name) return { ok: false };

    const event = String(body?.event || "").toLowerCase();
    if (!event.startsWith("connection")) {
      const access = await this.features.checkFeature(companyId, WHATSAPP_FEATURE as any);
      if (!access.allowed) return { ok: true, ignored: "plan" };
    }
    try {
      await this.ingest.handleWebhook(settings, body);
    } catch (err: any) {
      this.logger.error(`Falha ao processar webhook da empresa ${companyId}: ${err?.message}`);
    }
    return { ok: true };
  }
}
