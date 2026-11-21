import { Injectable, Logger } from "@nestjs/common";
import { StorageService } from "@/infra/storage.service";
import { JobQueueService } from "../job-queue.service";
import { ConversationTarget, MessagingService } from "../messaging.service";
import { WhatsappDb } from "../whatsapp-db";
import { CatalogProduct, CatalogService, isService } from "./catalog.service";
import { downloadImage, findProductImage } from "./image-finder";

const MISS_COOLDOWN_DAYS = 7;
const CARD_RESEND_WINDOW_MINUTES = 30;
const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type LookupResult =
  | { status: "found"; imageUrl: string; sourceUrl: string; pageUrl: string | null; confidence: number; reason: string }
  | { status: "not_found"; reason: string }
  | { status: "skipped"; reason: string };

export type CardResult = { enviado: true } | { enviado: false; motivo: "ja_enviado" | "sem_foto" };

// Formatação do WhatsApp: *negrito*, _itálico_.
export function buildProductCaption(product: CatalogProduct): string {
  const unit = product.unidade ? ` _/ ${product.unidade.toLowerCase()}_` : "";
  const availability = product.estoque > 0 ? "✅ Consta disponível na loja" : "🔎 A equipe confirma a disponibilidade";
  return [
    `🛍️ *${product.descricao.trim()}*`,
    "",
    `💰 *${brl(product.valor)}*${unit}`,
    availability,
    `🏷️ Cód. ${product.id}`,
    "",
    "_Valor de referência, confirmado pela loja._",
    "👉 Quer que eu separe pra você? É só me dizer a quantidade.",
  ].join("\n");
}

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger("WhatsappProductImages");

  constructor(
    private readonly db: WhatsappDb,
    private readonly jobs: JobQueueService,
    private readonly catalog: CatalogService,
    private readonly storage: StorageService,
    private readonly messaging: MessagingService
  ) {}

  private dedupKey(companyId: number, productId: number) {
    return `img:${companyId}:${productId}`;
  }

  // force ignora o intervalo após uma busca sem resultado (botão manual da tela).
  async enqueueLookup(companyId: number, productId: number, options: { force?: boolean; delayMs?: number } = {}) {
    const key = this.dedupKey(companyId, productId);
    if (!options.force) {
      const recentMiss = await this.db.query(
        `SELECT 1 FROM whatsapp_jobs
         WHERE dedup_key = $1 AND status = 'done' AND result->>'status' = 'not_found'
           AND finished_at > NOW() - make_interval(days => $2) LIMIT 1`,
        [key, MISS_COOLDOWN_DAYS]
      );
      if (recentMiss.rowCount) return false;
    }
    await this.jobs.enqueue("product-image", { companyId, productId }, { dedupKey: key, groupKey: key, delayMs: options.delayMs, maxAttempts: 2 });
    return true;
  }

  async lastResults(companyId: number, productIds: number[]): Promise<Record<number, any>> {
    if (!productIds.length) return {};
    const { rows } = await this.db.query(
      `SELECT DISTINCT ON (dedup_key) dedup_key, status, result, last_error, finished_at
       FROM whatsapp_jobs
       WHERE type = 'product-image' AND dedup_key = ANY($1::text[])
       ORDER BY dedup_key, created_at DESC`,
      [productIds.map((id) => this.dedupKey(companyId, id))]
    );
    const byId: Record<number, any> = {};
    for (const r of rows) {
      const id = Number(String(r.dedup_key).split(":")[2]);
      byId[id] = r.result ? { ...r.result, at: r.finished_at } : { status: r.status === "failed" ? "error" : "searching", reason: r.last_error };
    }
    return byId;
  }

  // Salva a imagem no Space do ERP (mesma pasta do upload manual) para não depender do site de origem.
  private async findAndSave(companyId: number, product: CatalogProduct) {
    const found = await findProductImage(product);
    if ("notFound" in found) return { found: null, result: { status: "not_found", reason: found.reason } as LookupResult };
    const { folder } = this.storage.getProductImagePath(companyId, product.id);
    const ext = EXTENSION[found.mimeType] || "jpg";
    const imageUrl = await this.storage.uploadFile(found.buffer, `${product.id}_${Date.now()}.${ext}`, folder, found.mimeType);
    const updated = await this.catalog.setImageUrlIfEmpty(companyId, product.id, imageUrl);
    if (!updated) {
      await this.storage.deleteFile(imageUrl).catch((): undefined => undefined);
      return { found: null, result: { status: "skipped", reason: "O produto ganhou foto enquanto a busca rodava." } as LookupResult };
    }
    this.logger.log(`#${product.id} "${product.descricao}": foto salva (${found.confidence.toFixed(2)}) a partir de ${found.imageUrl}`);
    return {
      found,
      result: {
        status: "found",
        imageUrl,
        sourceUrl: found.imageUrl,
        pageUrl: found.pageUrl,
        confidence: found.confidence,
        reason: found.reason,
      } as LookupResult,
    };
  }

  async processLookup(data: { companyId: number; productId: number }): Promise<LookupResult> {
    const [product] = await this.catalog.getByIds(data.companyId, [data.productId]);
    if (!product) return { status: "skipped", reason: "Produto não encontrado." };
    if (product.imageUrl) return { status: "skipped", reason: "Produto já tem foto." };
    if (isService(product.categoria, product.descricao)) return { status: "skipped", reason: "Serviço não recebe foto." };
    const { result } = await this.findAndSave(data.companyId, product);
    if (result.status === "not_found") this.logger.log(`#${product.id} "${product.descricao}": foto não encontrada — ${result.reason}`);
    return result;
  }

  private async imageForCard(companyId: number, product: CatalogProduct, allowSearch: boolean) {
    if (product.imageUrl) return downloadImage(product.imageUrl);
    if (!allowSearch) return null;
    const { found, result } = await this.findAndSave(companyId, product);
    await this.db.query(
      `INSERT INTO whatsapp_jobs (type, payload, dedup_key, status, attempts, result, finished_at)
       VALUES ('product-image', $1, $2, 'done', 1, $3, NOW())`,
      [JSON.stringify({ companyId, productId: product.id, source: "card" }), this.dedupKey(companyId, product.id), JSON.stringify(result)]
    );
    return found ? { buffer: found.buffer, mimeType: found.mimeType } : null;
  }

  async sendCard(target: ConversationTarget, product: CatalogProduct, allowSearch: boolean): Promise<CardResult> {
    const recent = await this.db.query(
      `SELECT 1 FROM whatsapp_messages
       WHERE conversation_id = $1 AND sender = 'automation' AND type = 'image'
         AND text ~ ('Cód\\. ' || $2 || '(\\D|$)') AND created_at > NOW() - make_interval(mins => $3)
       LIMIT 1`,
      [target.id, String(product.id), CARD_RESEND_WINDOW_MINUTES]
    );
    if (recent.rowCount) return { enviado: false, motivo: "ja_enviado" };

    const image = await this.imageForCard(target.company_id, product, allowSearch).catch((err) => {
      this.logger.warn(`Sem imagem para o card #${product.id}: ${err?.message}`);
      return null;
    });
    if (!image) return { enviado: false, motivo: "sem_foto" };
    await this.messaging.sendImage(target, {
      buffer: image.buffer,
      mimeType: image.mimeType,
      caption: buildProductCaption(product),
      fileName: `produto-${product.id}.${EXTENSION[image.mimeType] || "jpg"}`,
    });
    return { enviado: true };
  }
}
