import { Injectable, Logger } from "@nestjs/common";
import { StorageService } from "@/infra/storage.service";
import { EvolutionClient } from "./evolution.client";
import { IngestService } from "./ingest.service";
import { JobContext } from "./job-queue.service";
import { MessagingService } from "./messaging.service";
import { transcribeAudio } from "./openai.client";
import { WhatsappDb } from "./whatsapp-db";
import { whatsappConfig } from "./whatsapp.config";

const ALLOWED_MIME = [
  /^image\//,
  /^audio\//,
  /^video\//,
  /^application\/pdf$/,
  /^application\/msword$/,
  /^application\/vnd\.openxmlformats-officedocument\./,
  /^application\/vnd\.ms-(excel|powerpoint)$/,
  /^application\/vnd\.oasis\.opendocument\./,
  /^text\/plain$/,
];

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

function safeName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

interface MediaJob {
  companyId: number;
  conversationId: string;
  providerMessageId: string;
  type: string;
  fileName: string | null;
  mimeType: string | null;
}

@Injectable()
export class IncomingMediaService {
  private readonly logger = new Logger("WhatsappMedia");

  constructor(
    private readonly db: WhatsappDb,
    private readonly evolution: EvolutionClient,
    private readonly storage: StorageService,
    private readonly messaging: MessagingService,
    private readonly ingest: IngestService
  ) {}

  async processMedia(data: MediaJob, ctx: JobContext): Promise<void> {
    const target = await this.messaging.loadTarget(data.conversationId);
    const setStatus = (status: string, text?: string | null) =>
      this.db.query(
        `UPDATE whatsapp_messages SET media_status = $1, text = COALESCE($2, text) WHERE company_id = $3 AND provider_message_id = $4`,
        [status, text ?? null, data.companyId, data.providerMessageId]
      );

    try {
      const media = await this.evolution.getMediaBase64(target.instance_name, data.providerMessageId);
      const buffer = Buffer.from(media.base64, "base64");
      const mimeType = (media.mimetype || data.mimeType || "application/octet-stream").split(";")[0].trim();

      if (buffer.length > whatsappConfig.maxFileBytes || !ALLOWED_MIME.some((re) => re.test(mimeType))) {
        await setStatus(buffer.length > whatsappConfig.maxFileBytes ? "rejected_size" : "rejected_type");
      } else {
        const ext = EXTENSION_BY_MIME[mimeType] || mimeType.split("/")[1]?.split(".").pop() || "bin";
        const originalName = data.fileName || media.fileName || `${data.type}-${data.providerMessageId}.${ext}`;
        const key = await this.storage.uploadPrivate(
          buffer,
          `companies/${data.companyId}/whatsapp/${data.conversationId}/${data.providerMessageId}-${safeName(originalName)}`,
          mimeType
        );
        await this.db.query(
          `INSERT INTO whatsapp_order_files (company_id, conversation_id, original_name, storage_key, mime_type, size_bytes, source_message_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (company_id, source_message_id) DO NOTHING`,
          [data.companyId, data.conversationId, originalName, key, mimeType, buffer.length, data.providerMessageId]
        );

        if (data.type === "audio") {
          try {
            const transcript = await transcribeAudio(buffer, `audio.${ext === "bin" ? "ogg" : ext}`, mimeType);
            await setStatus(transcript ? "transcribed" : "transcription_failed", transcript || null);
          } catch (err: any) {
            this.logger.warn(`Falha na transcrição: ${err?.message}`);
            await setStatus("transcription_failed");
          }
        } else {
          await setStatus("stored");
        }
      }
    } catch (err: any) {
      if (!ctx.isLastAttempt) throw err;
      this.logger.error(`Download de mídia falhou definitivamente: ${err?.message}`);
      await setStatus("download_failed");
    }

    const { rows } = await this.db.query("SELECT bot_enabled FROM whatsapp_settings WHERE company_id = $1", [data.companyId]);
    if (rows[0]?.bot_enabled && !(await this.messaging.isHumanTakeoverActive(data.conversationId))) {
      await this.ingest.scheduleAiReply(data.conversationId, 2500);
    }
  }

  async classifyFromMe(data: { companyId: number; conversationId: string; providerMessageId: string }) {
    const known = await this.db.query("SELECT 1 FROM whatsapp_automation_sent_ids WHERE provider_message_id = $1", [
      data.providerMessageId,
    ]);
    if (known.rowCount) {
      await this.db.query(
        `UPDATE whatsapp_messages SET sender = 'automation' WHERE company_id = $1 AND provider_message_id = $2`,
        [data.companyId, data.providerMessageId]
      );
      return;
    }
    const updated = await this.db.query(
      `UPDATE whatsapp_messages SET sender = 'human' WHERE company_id = $1 AND provider_message_id = $2 AND sender = 'pending' RETURNING id`,
      [data.companyId, data.providerMessageId]
    );
    if (!updated.rowCount) return;
    await this.db.query(
      `UPDATE whatsapp_conversations c
       SET human_takeover_until = NOW() + make_interval(mins => s.human_takeover_minutes),
           last_human_message_at = NOW(), updated_at = NOW()
       FROM whatsapp_settings s
       WHERE c.id = $1 AND s.company_id = c.company_id`,
      [data.conversationId]
    );
    this.logger.log(`Conversa ${data.conversationId} pausada: atendente humano assumiu`);
  }
}
