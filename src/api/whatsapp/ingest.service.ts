import { Injectable, Logger } from "@nestjs/common";
import { JobQueueService } from "./job-queue.service";
import { MEDIA_TYPES, ParsedMessage, parseEvolutionMessage } from "./message-parser";
import { CatalogService } from "./products/catalog.service";
import { SettingsService, WhatsappSettings } from "./settings.service";
import { WhatsappDb } from "./whatsapp-db";

export const AI_REPLY_DELAY_MS = 4000;

@Injectable()
export class IngestService {
  private readonly logger = new Logger("WhatsappIngest");

  constructor(
    private readonly db: WhatsappDb,
    private readonly jobs: JobQueueService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService
  ) {}

  scheduleAiReply(conversationId: string, delayMs = AI_REPLY_DELAY_MS) {
    // Agrupa rajadas (arquivo + texto em sequência) numa única resposta por conversa.
    return this.jobs.enqueue(
      "ai-reply",
      { conversationId },
      { delayMs, dedupKey: `ai:${conversationId}`, groupKey: `conv:${conversationId}`, extendDelay: true, maxAttempts: 3 }
    );
  }

  async handleWebhook(settings: WhatsappSettings, body: any): Promise<void> {
    const event = String(body?.event || "").toLowerCase().replace(/_/g, ".");
    if (event === "connection.update") {
      const state = body?.data?.state ? String(body.data.state) : null;
      const phone = body?.data?.wuid ? String(body.data.wuid).split("@")[0] : undefined;
      await this.settings.setConnection(settings.company_id, state, state === "open" ? phone : undefined);
      return;
    }
    if (event !== "messages.upsert" && event !== "send.message") return;

    const items = Array.isArray(body.data) ? body.data : [body.data];
    for (const data of items) {
      const parsed = parseEvolutionMessage(data);
      if (!parsed || parsed.type === "ignored") continue;
      await this.ingest(settings, parsed, event === "send.message");
    }
  }

  private async upsertConversation(companyId: number, msg: ParsedMessage) {
    const customer = await this.db.query(
      `INSERT INTO whatsapp_customers (company_id, phone, name) VALUES ($1, $2, $3)
       ON CONFLICT (company_id, phone) DO UPDATE SET name = COALESCE(whatsapp_customers.name, EXCLUDED.name)
       RETURNING id, (xmax = 0) AS inserted`,
      [companyId, msg.phone, msg.fromMe ? null : msg.pushName]
    );
    const customerRow = customer.rows[0];
    if (customerRow.inserted) {
      this.catalog
        .findClienteByPhone(companyId, msg.phone)
        .then((cliente) =>
          cliente
            ? this.db.query("UPDATE whatsapp_customers SET cliente_id = $1, name = COALESCE($2, name) WHERE id = $3", [
                cliente.id,
                cliente.nome,
                customerRow.id,
              ])
            : null
        )
        .catch((err) => this.logger.warn(`Falha ao buscar cliente do ERP: ${err.message}`));
    }

    const conversation = await this.db.query(
      `INSERT INTO whatsapp_conversations (company_id, customer_id, remote_jid) VALUES ($1, $2, $3)
       ON CONFLICT (company_id, customer_id) DO UPDATE SET remote_jid = EXCLUDED.remote_jid, updated_at = NOW()
       RETURNING id, human_takeover_until`,
      [companyId, customerRow.id, msg.chatJid]
    );
    return conversation.rows[0] as { id: string; human_takeover_until: Date | null };
  }

  private async ingest(settings: WhatsappSettings, msg: ParsedMessage, fromSendEvent: boolean): Promise<void> {
    const companyId = settings.company_id;
    let sender: "customer" | "automation" | "pending" = "customer";
    if (msg.fromMe) {
      const known = await this.db.query("SELECT 1 FROM whatsapp_automation_sent_ids WHERE provider_message_id = $1", [
        msg.providerMessageId,
      ]);
      sender = fromSendEvent || known.rowCount ? "automation" : "pending";
    }

    const conversation = await this.upsertConversation(companyId, msg);
    const isMedia = MEDIA_TYPES.includes(msg.type);
    const inserted = await this.db.query(
      `INSERT INTO whatsapp_messages (company_id, conversation_id, provider_message_id, direction, sender, type, text, media_status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (company_id, provider_message_id) DO NOTHING
       RETURNING id`,
      [
        companyId,
        conversation.id,
        msg.providerMessageId,
        msg.fromMe ? "out" : "in",
        sender,
        msg.type,
        msg.text,
        isMedia && !msg.fromMe ? "pending" : null,
        msg.timestamp,
      ]
    );

    if (!inserted.rowCount) {
      if (sender === "automation") {
        await this.db.query(
          `UPDATE whatsapp_messages SET sender = 'automation' WHERE company_id = $1 AND provider_message_id = $2 AND sender = 'pending'`,
          [companyId, msg.providerMessageId]
        );
      }
      return;
    }

    if (sender === "pending") {
      // O ID do envio automático pode chegar depois do evento; decide se foi humano após uma folga.
      await this.jobs.enqueue(
        "classify-from-me",
        { companyId, conversationId: conversation.id, providerMessageId: msg.providerMessageId },
        { delayMs: 6000 }
      );
      return;
    }
    if (sender !== "customer") return;

    if (isMedia) {
      await this.jobs.enqueue(
        "media",
        {
          companyId,
          conversationId: conversation.id,
          providerMessageId: msg.providerMessageId,
          type: msg.type,
          fileName: msg.fileName,
          mimeType: msg.mimeType,
        },
        { maxAttempts: 4 }
      );
      return;
    }

    if (!settings.bot_enabled) return;
    const pausedUntil = conversation.human_takeover_until;
    if (pausedUntil && new Date(pausedUntil) > new Date()) return;
    await this.scheduleAiReply(conversation.id);
  }
}
