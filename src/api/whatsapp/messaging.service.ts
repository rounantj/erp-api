import { Injectable } from "@nestjs/common";
import { EvolutionClient } from "./evolution.client";
import { WhatsappDb } from "./whatsapp-db";

export interface ConversationTarget {
  id: string;
  company_id: number;
  remote_jid: string;
  instance_name: string;
}

function destination(remoteJid: string): string {
  return remoteJid.endsWith("@s.whatsapp.net") ? remoteJid.split("@")[0] : remoteJid;
}

@Injectable()
export class MessagingService {
  constructor(private readonly db: WhatsappDb, private readonly evolution: EvolutionClient) {}

  async loadTarget(conversationId: string): Promise<ConversationTarget> {
    const { rows } = await this.db.query(
      `SELECT c.id, c.company_id, c.remote_jid, s.instance_name
       FROM whatsapp_conversations c JOIN whatsapp_settings s ON s.company_id = c.company_id
       WHERE c.id = $1`,
      [conversationId]
    );
    if (!rows[0]) throw new Error(`Conversa ${conversationId} não encontrada`);
    return rows[0];
  }

  async isHumanTakeoverActive(conversationId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      "SELECT human_takeover_until > NOW() AS active FROM whatsapp_conversations WHERE id = $1",
      [conversationId]
    );
    return Boolean(rows[0]?.active);
  }

  // Todo envio automático passa por aqui para que o ID nunca seja confundido com mensagem humana.
  async sendText(target: ConversationTarget, text: string): Promise<string> {
    const id = await this.evolution.sendText(target.instance_name, destination(target.remote_jid), text);
    await this.record(target, id, "text", text);
    return id;
  }

  async sendImage(
    target: ConversationTarget,
    image: { buffer: Buffer; mimeType: string; caption: string; fileName: string }
  ): Promise<string> {
    const id = await this.evolution.sendImage(target.instance_name, destination(target.remote_jid), {
      base64: image.buffer.toString("base64"),
      mimeType: image.mimeType,
      caption: image.caption,
      fileName: image.fileName,
    });
    await this.record(target, id, "image", image.caption);
    return id;
  }

  private async record(target: ConversationTarget, id: string, type: "text" | "image", text: string) {
    await this.db.query(
      "INSERT INTO whatsapp_automation_sent_ids (provider_message_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [id, target.company_id]
    );
    await this.db.query(
      `INSERT INTO whatsapp_messages (company_id, conversation_id, provider_message_id, direction, sender, type, text)
       VALUES ($1, $2, $3, 'out', 'automation', $4, $5)
       ON CONFLICT (company_id, provider_message_id) DO UPDATE SET sender = 'automation', text = EXCLUDED.text`,
      [target.company_id, target.id, id, type, text]
    );
  }
}
