import { Injectable, Logger } from "@nestjs/common";
import { DateTime } from "luxon";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { BusinessHoursService } from "../hours/business-hours.service";
import { IngestService } from "../ingest.service";
import { MessagingService } from "../messaging.service";
import { openai } from "../openai.client";
import { WhatsappOrdersService } from "../orders/orders.service";
import { CatalogService } from "../products/catalog.service";
import { ProductImagesService } from "../products/product-images.service";
import { WhatsappDb } from "../whatsapp-db";
import { whatsappConfig } from "../whatsapp.config";
import { buildSystemPrompt } from "./prompt";
import { toolDefinitions, ToolExecutor } from "./tools";

const HISTORY_LIMIT = 40;
const MAX_TOOL_ROUNDS = 6;
const MEDIA_WAIT_LIMIT_MS = 90_000;
const FALLBACK_REPLY = "Desculpe, tive um probleminha aqui. Pode repetir, por favor? 🙏";

function statusNote(m: any): string {
  if (m.media_status === "rejected_type") return " — ARQUIVO RECUSADO: tipo não aceito";
  if (m.media_status === "rejected_size") return ` — ARQUIVO RECUSADO: maior que ${whatsappConfig.maxFileBytes / 1024 / 1024} MB`;
  if (m.media_status === "download_failed") return " — falha ao baixar o arquivo, peça para reenviar";
  return "";
}

function describeMessage(m: any): string {
  const file = m.file_id ? `arquivo_id=${m.file_id}` : "";
  switch (m.type) {
    case "text":
      return m.text || "";
    case "image":
      return `[Cliente enviou uma imagem${file ? ` (${file})` : ""}${m.text ? `, legenda: "${m.text}"` : ""}${statusNote(m)}]`;
    case "document":
      return `[Cliente enviou o documento "${m.original_name || "arquivo"}"${file ? ` (${file})` : ""}${m.text ? `, legenda: "${m.text}"` : ""}${statusNote(m)}]`;
    case "video":
      return `[Cliente enviou um vídeo${file ? ` (${file})` : ""}${statusNote(m)}]`;
    case "audio":
      if (m.media_status === "transcribed") return `[Áudio do cliente, transcrição]: ${m.text}`;
      return "[Cliente enviou um áudio que não pôde ser transcrito]";
    case "sticker":
      return "[Cliente enviou uma figurinha]";
    default:
      return m.text || "[Cliente enviou uma mensagem de tipo não suportado]";
  }
}

@Injectable()
export class AiReplyService {
  private readonly logger = new Logger("WhatsappAI");

  constructor(
    private readonly db: WhatsappDb,
    private readonly messaging: MessagingService,
    private readonly ingest: IngestService,
    private readonly orders: WhatsappOrdersService,
    private readonly hours: BusinessHoursService,
    private readonly catalog: CatalogService,
    private readonly images: ProductImagesService
  ) {}

  async reply(conversationId: string): Promise<void> {
    if (await this.messaging.isHumanTakeoverActive(conversationId)) return;

    const { rows: convRows } = await this.db.query(
      `SELECT c.*, cu.name AS customer_name, s.bot_enabled, s.bot_name, s.instructions, s.timezone,
              s.product_cards_enabled, s.auto_product_images, COALESCE(co.name, 'nossa loja') AS company_name
       FROM whatsapp_conversations c
       JOIN whatsapp_customers cu ON cu.id = c.customer_id
       JOIN whatsapp_settings s ON s.company_id = c.company_id
       JOIN companies co ON co.id = c.company_id
       WHERE c.id = $1`,
      [conversationId]
    );
    const conv = convRows[0];
    if (!conv || !conv.bot_enabled) return;

    const { rows: history } = await this.db.query(
      `SELECT * FROM (
         SELECT m.provider_message_id, m.sender, m.type, m.text, m.media_status, m.created_at,
                f.id AS file_id, f.original_name
         FROM whatsapp_messages m
         LEFT JOIN whatsapp_order_files f ON f.company_id = m.company_id AND f.source_message_id = m.provider_message_id
         WHERE m.conversation_id = $1 AND m.sender <> 'pending'
         ORDER BY m.created_at DESC LIMIT $2
       ) h ORDER BY created_at ASC`,
      [conversationId, HISTORY_LIMIT]
    );

    const lastReplyIndex = history.map((m) => m.sender).lastIndexOf("automation");
    const lastHumanIndex = history.map((m) => m.sender).lastIndexOf("human");
    const unanswered = history.slice(Math.max(lastReplyIndex, lastHumanIndex) + 1).filter((m) => m.sender === "customer");
    if (!unanswered.length) return;

    const stillDownloading = unanswered.some(
      (m) => m.media_status === "pending" && Date.now() - new Date(m.created_at).getTime() < MEDIA_WAIT_LIMIT_MS
    );
    if (stillDownloading) {
      await this.ingest.scheduleAiReply(conversationId, 3000);
      return;
    }

    const latestCustomer = [...history].reverse().find((m) => m.sender === "customer");
    const { rows: unattached } = await this.db.query(
      `SELECT id, original_name, mime_type FROM whatsapp_order_files
       WHERE conversation_id = $1 AND order_id IS NULL AND mime_type NOT LIKE 'audio/%'
       ORDER BY created_at`,
      [conversationId]
    );

    const today = DateTime.now().setZone(conv.timezone).setLocale("pt-BR").toFormat("cccc, dd 'de' LLLL 'de' yyyy");
    const system = buildSystemPrompt({
      storeName: conv.company_name,
      botName: conv.bot_name || "Assistente",
      storeInstructions: conv.instructions || "",
      productCardsEnabled: conv.product_cards_enabled,
      today,
      customerName: conv.customer_name,
      pendingSummaries: (conv.pending_summaries || []).map((s: any) => ({
        resumo_id: s.id,
        instrucao: s.instrucao,
        arquivos: s.arquivos,
        itens: s.itens,
      })),
      unattachedFiles: unattached.map((f) => ({ id: f.id, nome: f.original_name, tipo: f.mime_type })),
      openOrders: await this.orders.listForCustomer(conv.company_id, conv.customer_id),
      services: (await this.catalog.listServices(conv.company_id)).map((s) => ({
        produto_id: s.id,
        descricao: s.descricao,
        valor_unitario: s.valor,
      })),
    });

    const messages: ChatCompletionMessageParam[] = [{ role: "system", content: system }];
    for (const m of history) {
      if (m.sender === "customer") messages.push({ role: "user", content: describeMessage(m) });
      else if (m.sender === "automation") messages.push({ role: "assistant", content: m.text || "" });
      else if (m.sender === "human") messages.push({ role: "assistant", content: `[Atendente humano]: ${m.text || "(mídia)"}` });
    }

    const executor = new ToolExecutor(
      {
        companyId: conv.company_id,
        conversationId,
        customerId: conv.customer_id,
        autoProductImages: conv.auto_product_images,
        latestCustomerMessage: latestCustomer
          ? { providerMessageId: latestCustomer.provider_message_id, createdAt: latestCustomer.created_at }
          : null,
      },
      { db: this.db, catalog: this.catalog, orders: this.orders, hours: this.hours, images: this.images, messaging: this.messaging }
    );
    const tools = toolDefinitions(conv.product_cards_enabled);

    let reply: string | null = null;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await openai().chat.completions.create({
        model: whatsappConfig.openaiModel,
        messages,
        tools,
        tool_choice: "auto",
        reasoning_effort: whatsappConfig.openaiReasoningEffort,
        max_completion_tokens: 2500,
      } as any);
      const choice = completion.choices[0].message;
      messages.push(choice as ChatCompletionMessageParam);

      if (!choice.tool_calls?.length) {
        reply = (choice.content || "").trim();
        break;
      }
      for (const call of choice.tool_calls) {
        let result: unknown;
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          result = await executor.run(call.function.name, args);
        } catch (err: any) {
          this.logger.error(`Ferramenta ${call.function.name} falhou: ${err?.message}`);
          result = { erro: "Falha interna ao executar a ferramenta." };
        }
        this.logger.log(`empresa ${conv.company_id} conversa ${conversationId} tool=${call.function.name}`);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      if (executor.createdOrders.length) break;
    }

    if (executor.createdOrders.length) {
      reply = await this.finalOrderMessage(conv.company_id, executor.createdOrders, executor.remainingSummaries);
    }
    if (!reply) reply = FALLBACK_REPLY;

    if (await this.messaging.isHumanTakeoverActive(conversationId)) return;
    const target = await this.messaging.loadTarget(conversationId);
    await this.messaging.sendText(target, reply);
  }

  private async finalOrderMessage(companyId: number, created: { number: number; alreadyExisted: boolean }[], remainingSummaries: number) {
    const numbers = created.map((o) => `*${o.number}*`);
    const plural = created.length > 1;
    const { rows: totals } = await this.db.query(
      `SELECT COALESCE(SUM(i.quantity * i.unit_price), 0)::float AS total
       FROM whatsapp_orders o JOIN whatsapp_order_items i ON i.order_id = o.id
       WHERE o.company_id = $1 AND o.number = ANY($2::int[])`,
      [companyId, created.map((o) => o.number)]
    );
    const total = Number(totals[0]?.total || 0);
    const totalLine =
      total > 0
        ? `\nValor estimado: *${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}* (confirmado pela loja)`
        : "";
    const numbersLine = `${plural ? `Números dos pedidos: ${numbers.join(", ")}` : `Número do pedido: ${numbers[0]}`}${totalLine}`;
    const remainingLine = remainingSummaries
      ? `\n\nAinda ${remainingSummaries > 1 ? `há ${remainingSummaries} pedidos` : "há 1 pedido"} aguardando sua confirmação. É só me dizer se está tudo certo!`
      : "";

    if (created.every((o) => o.alreadyExisted)) {
      return `${plural ? "Esses pedidos já estão registrados" : "Esse pedido já está registrado"}! 😊 Avisaremos por aqui assim que ${plural ? "estiverem prontos" : "estiver pronto"}.\n\n${numbersLine}${remainingLine}`;
    }

    const status = await this.hours.status(companyId);
    const registered = plural ? "Seus pedidos foram registrados" : "Seu pedido foi registrado";
    const ready = plural ? "estiverem prontos" : "estiver pronto";
    if (status.isOpen) {
      return `Perfeito! 😊 ${registered} e ${plural ? "encaminhados" : "encaminhado"} para nossa equipe. Avisaremos por aqui assim que ${ready}.\n\n${numbersLine}${remainingLine}`;
    }
    if (status.nextOpeningText) {
      return `Perfeito! 😊 ${registered} com sucesso!\n\nNossa equipe vai começar a ${plural ? "prepará-los" : "prepará-lo"} a partir de ${status.nextOpeningText}, quando a loja abrir.\n\nAvisaremos por aqui assim que ${ready}!\n\n${numbersLine}${remainingLine}`;
    }
    return `Perfeito! 😊 ${registered} com sucesso! Avisaremos por aqui assim que ${ready}.\n\n${numbersLine}${remainingLine}`;
  }
}
