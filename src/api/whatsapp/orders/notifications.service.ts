import { Injectable, Logger } from "@nestjs/common";
import { MessagingService } from "../messaging.service";
import { openai } from "../openai.client";
import { WhatsappDb } from "../whatsapp-db";
import { whatsappConfig } from "../whatsapp.config";
import { WhatsappOrdersService } from "./orders.service";

export function readyMessage(whatWasDone: string): string {
  return `Oba, seu pedido ficou pronto! 🎉\n\n✅ ${whatWasDone}\n\nJá pode passar aqui na loja pra retirar. Te esperamos! 😊`;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger("WhatsappNotifications");

  constructor(
    private readonly db: WhatsappDb,
    private readonly messaging: MessagingService,
    private readonly orders: WhatsappOrdersService
  ) {}

  async describeWhatWasDone(orderId: string): Promise<string> {
    const { rows } = await this.db.query(
      `SELECT o.description,
         COALESCE((SELECT json_agg(json_build_object('descricao', i.description, 'quantidade', i.quantity))
                   FROM whatsapp_order_items i WHERE i.order_id = o.id), '[]') AS items,
         COALESCE((SELECT json_agg(f.original_name) FROM whatsapp_order_files f
                   WHERE f.order_id = o.id AND f.mime_type NOT LIKE 'audio/%'), '[]') AS files
       FROM whatsapp_orders o WHERE o.id = $1`,
      [orderId]
    );
    const order = rows[0];
    try {
      const completion = await openai().chat.completions.create({
        model: whatsappConfig.openaiModel,
        messages: [
          {
            role: "system",
            content: `Você escreve para o cliente de uma loja, no WhatsApp, o que a loja fez no pedido dele, que acabou de ficar pronto.
Responda com UMA frase curta, no passado, em primeira pessoa do plural (ex.: "Imprimimos o seu currículo em cores, 2 cópias." / "Separamos 3 cadernos de 10 matérias pra você.").
Use só as informações dadas. Não cite preços, número de pedido, IDs, nem instruções internas da equipe (ex.: "conferir", "retirada na loja"). Sem emojis.
Não use nomes internos do cadastro da loja (ex.: "Serviços gov.br", textos em maiúsculas): descreva com palavras normais. Não repita CPF, RG, matrícula, número de instalação nem outros dados pessoais (ex.: "Emitimos a 2ª via da sua conta de água.").`,
          },
          { role: "user", content: JSON.stringify({ instrucao: order.description, itens: order.items, arquivos: order.files }) },
        ],
      });
      const sentence = (completion.choices[0].message.content || "").trim().replace(/^["“]|["”]$/g, "");
      if (sentence.length >= 5 && sentence.length <= 400) return sentence;
    } catch (err: any) {
      this.logger.warn(`Falha ao resumir o pedido ${orderId}: ${err.message}`);
    }
    return order.description;
  }

  // Texto gerado uma única vez: reenvios usam o mesmo texto e a correlação abaixo continua válida.
  private async messageText(notification: { id: string; order_id: string; message_text: string | null }) {
    if (notification.message_text) return notification.message_text;
    const text = readyMessage(await this.describeWhatWasDone(notification.order_id));
    const { rows } = await this.db.query(
      `UPDATE whatsapp_order_notifications SET message_text = COALESCE(message_text, $2) WHERE id = $1 RETURNING message_text`,
      [notification.id, text]
    );
    return rows[0].message_text as string;
  }

  async process(data: { notificationId: string }, isLastAttempt: boolean): Promise<void> {
    const { rows } = await this.db.query(
      `UPDATE whatsapp_order_notifications SET status = 'sending', attempts = attempts + 1
       WHERE id = $1 AND status IN ('pending', 'sending')
       RETURNING id, company_id, order_id, created_at, attempts, message_text`,
      [data.notificationId]
    );
    const notification = rows[0];
    if (!notification) return;

    const order = (await this.db.query("SELECT conversation_id FROM whatsapp_orders WHERE id = $1", [notification.order_id])).rows[0];
    const text = await this.messageText(notification);

    // Após timeout o envio pode ter ocorrido: procura a mensagem já registrada antes de reenviar.
    if (notification.attempts > 1) {
      const already = await this.db.query(
        `SELECT provider_message_id FROM whatsapp_messages
         WHERE conversation_id = $1 AND sender = 'automation' AND text = $2 AND created_at >= $3 LIMIT 1`,
        [order.conversation_id, text, notification.created_at]
      );
      if (already.rows[0]) {
        await this.markSent(notification.id, already.rows[0].provider_message_id);
        return;
      }
    }

    try {
      const target = await this.messaging.loadTarget(order.conversation_id);
      const providerId = await this.messaging.sendText(target, text);
      await this.markSent(notification.id, providerId);
    } catch (err: any) {
      const message = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : String(err?.message || err);
      await this.db.query(`UPDATE whatsapp_order_notifications SET status = $2, last_error = $3 WHERE id = $1`, [
        notification.id,
        isLastAttempt ? "failed" : "pending",
        message,
      ]);
      throw err;
    }
  }

  private async markSent(id: string, providerMessageId: string) {
    await this.db.query(
      `UPDATE whatsapp_order_notifications SET status = 'sent', provider_message_id = $2, sent_at = NOW(), last_error = NULL WHERE id = $1`,
      [id, providerMessageId]
    );
  }

  // Outbox: reenfileira avisos que ficaram pendentes (ex.: o processo caiu entre o commit e o enqueue).
  async sweepPending(): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT id FROM whatsapp_order_notifications
       WHERE status IN ('pending', 'sending') AND created_at < NOW() - INTERVAL '1 minute' LIMIT 50`
    );
    for (const row of rows) await this.orders.enqueueNotification(row.id);
  }
}
