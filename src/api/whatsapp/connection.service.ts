import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from "@nestjs/common";
import { StorageService } from "@/infra/storage.service";
import { EvolutionClient } from "./evolution.client";
import { previewKind } from "./orders/orders.service";
import { SettingsService } from "./settings.service";
import { WhatsappDb } from "./whatsapp-db";
import { whatsappConfig } from "./whatsapp.config";

@Injectable()
export class ConnectionService implements OnApplicationBootstrap {
  private readonly logger = new Logger("WhatsappConnection");

  constructor(
    private readonly db: WhatsappDb,
    private readonly evolution: EvolutionClient,
    private readonly settings: SettingsService,
    private readonly storage: StorageService
  ) {}

  // Só o servidor que processa a fila reaponta os webhooks: assim um ambiente local com a fila
  // desligada nunca rouba as mensagens de produção.
  onApplicationBootstrap() {
    if (!whatsappConfig.jobsEnabled) return;
    this.syncWebhooks().catch((err) => this.logger.error(`Falha ao sincronizar webhooks: ${err?.message}`));
  }

  private async syncWebhooks() {
    if (!whatsappConfig.evolutionUrl || !whatsappConfig.evolutionApiKey || !whatsappConfig.webhookBaseUrl) return;
    const { rows } = await this.db.query(`SELECT company_id, instance_name, webhook_token FROM whatsapp_settings`);
    for (const row of rows) {
      try {
        if (!(await this.evolution.instanceExists(row.instance_name))) continue;
        await this.evolution.setWebhook(row.instance_name, row.company_id, row.webhook_token);
        this.logger.log(`Webhook de ${row.instance_name} apontado para ${whatsappConfig.webhookBaseUrl}`);
      } catch (err: any) {
        this.logger.error(`Falha ao apontar webhook de ${row.instance_name}: ${err?.message}`);
      }
    }
  }

  private ensureConfigured() {
    if (!whatsappConfig.evolutionUrl || !whatsappConfig.evolutionApiKey || !whatsappConfig.webhookBaseUrl) {
      throw new ServiceUnavailableException("Integração com o WhatsApp não configurada no servidor");
    }
  }

  async status(companyId: number) {
    const settings = await this.settings.getOrCreate(companyId);
    let state = settings.connection_state || "close";
    let phone = settings.connected_phone;
    let profileName: string | null = null;
    if (whatsappConfig.evolutionUrl && (await this.evolution.instanceExists(settings.instance_name).catch(() => false))) {
      state = await this.evolution.connectionState(settings.instance_name).catch(() => state);
      if (state === "open") {
        const info = await this.evolution.instanceInfo(settings.instance_name).catch((): null => null);
        phone = info?.ownerJid ? String(info.ownerJid).split("@")[0] : phone;
        profileName = info?.profileName ?? null;
      }
      if (state !== settings.connection_state || phone !== settings.connected_phone) {
        await this.settings.setConnection(companyId, state, state === "open" ? phone : undefined);
      }
    } else {
      state = "close";
    }
    return {
      state,
      connected: state === "open",
      phone: state === "open" ? phone : null,
      profileName,
      botEnabled: settings.bot_enabled,
    };
  }

  // Cada empresa tem sua instância; o limite protege a Evolution, que é compartilhada com o dexd.
  async connect(companyId: number) {
    try {
      return await this.connectInstance(companyId);
    } catch (err: any) {
      const detail = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : err?.message;
      this.logger.error(`Falha ao conectar o WhatsApp da empresa ${companyId}: ${detail}`);
      throw err;
    }
  }

  private async connectInstance(companyId: number) {
    this.ensureConfigured();
    const settings = await this.settings.getOrCreate(companyId);
    const exists = await this.evolution.instanceExists(settings.instance_name);
    if (!exists) {
      const count = await this.evolution.countOwnInstances();
      if (count >= whatsappConfig.maxInstances) {
        throw new BadRequestException(
          "Limite de conexões de WhatsApp do servidor atingido. Fale com o suporte para liberar uma nova conexão."
        );
      }
    }
    await this.evolution.ensureInstance(settings.instance_name, companyId, settings.webhook_token);
    const state = await this.evolution.connectionState(settings.instance_name).catch(() => "unknown");
    if (state === "open") return { state, qrCode: null as string | null, pairingCode: null as string | null };
    const result = await this.evolution.connect(settings.instance_name);
    this.logger.log(`QR gerado para a empresa ${companyId}`);
    return { state: "connecting", qrCode: result.base64 ?? null, pairingCode: result.pairingCode ?? null };
  }

  async disconnect(companyId: number) {
    this.ensureConfigured();
    const settings = await this.settings.getOrCreate(companyId);
    if (await this.evolution.instanceExists(settings.instance_name)) {
      await this.evolution.logout(settings.instance_name).catch((err) => {
        if (err?.response?.status !== 400 && err?.response?.status !== 404) throw err;
      });
    }
    await this.settings.setBotEnabled(companyId, false);
    await this.settings.setConnection(companyId, "close", null);
    return { ok: true };
  }

  async pausedConversations(companyId: number) {
    const { rows } = await this.db.query(
      `SELECT c.id, cu.name, cu.phone, c.human_takeover_until
       FROM whatsapp_conversations c JOIN whatsapp_customers cu ON cu.id = c.customer_id
       WHERE c.company_id = $1 AND c.human_takeover_until > NOW()
       ORDER BY c.human_takeover_until DESC`,
      [companyId]
    );
    return rows;
  }

  async conversationHistory(companyId: number, conversationId: string) {
    const { rows: convRows } = await this.db.query(
      `SELECT c.id, cu.name, cu.phone,
              (c.human_takeover_until IS NOT NULL AND c.human_takeover_until > NOW()) AS paused
       FROM whatsapp_conversations c JOIN whatsapp_customers cu ON cu.id = c.customer_id
       WHERE c.company_id = $1 AND c.id = $2`,
      [companyId, conversationId]
    );
    if (!convRows[0]) throw new NotFoundException("Conversa não encontrada");

    const { rows } = await this.db.query(
      `SELECT * FROM (
         SELECT m.id, m.sender, m.type, m.text, m.media_status, m.created_at,
                f.id AS file_id, f.original_name, f.mime_type, f.storage_key, o.number AS order_number
         FROM whatsapp_messages m
         LEFT JOIN whatsapp_order_files f ON f.company_id = m.company_id AND f.source_message_id = m.provider_message_id
         LEFT JOIN whatsapp_orders o ON o.id = f.order_id
         WHERE m.company_id = $1 AND m.conversation_id = $2 AND m.sender <> 'pending'
         ORDER BY m.created_at DESC LIMIT 2000
       ) h ORDER BY created_at ASC`,
      [companyId, conversationId]
    );

    return {
      conversation: convRows[0],
      messages: rows.map(({ storage_key, mime_type, ...m }) => {
        const kind = mime_type ? previewKind(mime_type) : "none";
        const inline = storage_key && (kind === "image" || kind === "audio" || kind === "video");
        return {
          ...m,
          file_kind: m.file_id ? kind : null,
          media_url: inline
            ? this.storage.getSignedUrl(storage_key, { fileName: m.original_name, contentType: mime_type, inline: true })
            : null,
        };
      }),
    };
  }

  async listConversations(companyId: number) {
    const { rows } = await this.db.query(
      `SELECT c.id, cu.name, cu.phone, c.human_takeover_until,
              (c.human_takeover_until IS NOT NULL AND c.human_takeover_until > NOW()) AS paused,
              last.created_at AS last_message_at, last.sender AS last_sender, left(last.text, 140) AS last_text, last.type AS last_type
       FROM whatsapp_conversations c
       JOIN whatsapp_customers cu ON cu.id = c.customer_id
       LEFT JOIN LATERAL (
         SELECT m.created_at, m.sender, m.text, m.type FROM whatsapp_messages m
         WHERE m.conversation_id = c.id AND m.sender <> 'pending'
         ORDER BY m.created_at DESC LIMIT 1
       ) last ON TRUE
       WHERE c.company_id = $1
       ORDER BY paused DESC, last.created_at DESC NULLS LAST
       LIMIT 60`,
      [companyId]
    );
    return rows;
  }

  async pauseAi(companyId: number, conversationId: string) {
    const { rowCount } = await this.db.query(
      `UPDATE whatsapp_conversations c
       SET human_takeover_until = NOW() + make_interval(mins => s.human_takeover_minutes), updated_at = NOW()
       FROM whatsapp_settings s
       WHERE c.company_id = $1 AND c.id::text = $2 AND s.company_id = c.company_id`,
      [companyId, conversationId]
    );
    if (!rowCount) throw new BadRequestException("Conversa não encontrada");
    return { ok: true };
  }

  async resumeAi(companyId: number, conversationId: string) {
    const { rowCount } = await this.db.query(
      `UPDATE whatsapp_conversations SET human_takeover_until = NULL, updated_at = NOW() WHERE company_id = $1 AND id::text = $2`,
      [companyId, conversationId]
    );
    if (!rowCount) throw new BadRequestException("Conversa não encontrada");
    return { ok: true };
  }
}
