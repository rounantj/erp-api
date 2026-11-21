import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { StorageService } from "@/infra/storage.service";
import { JobQueueService } from "../job-queue.service";
import { openai } from "../openai.client";
import { CatalogService } from "../products/catalog.service";
import { WhatsappDb } from "../whatsapp-db";
import { whatsappConfig } from "../whatsapp.config";

export type OrderStatus = "pending" | "in_progress" | "ready" | "delivered" | "cancelled";
export type PreviewKind = "image" | "pdf" | "audio" | "video" | "text" | "none";

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["in_progress", "cancelled"],
  in_progress: ["ready", "pending", "cancelled"],
  ready: ["delivered", "in_progress"],
  delivered: [],
  cancelled: [],
};

const TIMESTAMP_COLUMN: Partial<Record<OrderStatus, string>> = {
  in_progress: "started_at",
  ready: "ready_at",
  delivered: "delivered_at",
  cancelled: "cancelled_at",
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "aguardando execução",
  in_progress: "em execução",
  ready: "pronto para retirada",
  delivered: "entregue",
  cancelled: "cancelado",
};

// SVG e HTML ficam de fora de propósito: exibidos inline poderiam executar script.
function previewKind(mime: string): PreviewKind {
  if (/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "text/plain") return "text";
  return "none";
}

@Injectable()
export class WhatsappOrdersService {
  constructor(
    private readonly db: WhatsappDb,
    private readonly storage: StorageService,
    private readonly jobs: JobQueueService,
    private readonly catalog: CatalogService
  ) {}

  enqueueNotification(notificationId: string) {
    return this.jobs.enqueue("notification", { notificationId }, { dedupKey: `notif:${notificationId}`, maxAttempts: 6 });
  }

  async list(companyId: number, status?: string) {
    const params: unknown[] = [companyId];
    let filter = "";
    if (status && status !== "all") {
      params.push(status.split(","));
      filter = `AND o.status = ANY($2::text[])`;
    }
    const { rows } = await this.db.query(
      `SELECT o.id, o.number, o.status, o.description, o.customer_note, o.venda_id, o.created_at, o.updated_at,
              o.expected_processing_from, o.started_at, o.ready_at,
              cu.name AS customer_name, cu.phone AS customer_phone, u.name AS operator_name,
              (SELECT count(*) FROM whatsapp_order_files f WHERE f.order_id = o.id)::int AS file_count,
              (SELECT COALESCE(SUM(i.quantity * i.unit_price), 0)::float FROM whatsapp_order_items i WHERE i.order_id = o.id) AS total,
              (SELECT json_agg(json_build_object('descricao', i.description, 'quantidade', i.quantity::float, 'valor_unitario', i.unit_price::float))
                 FROM whatsapp_order_items i WHERE i.order_id = o.id) AS items,
              (SELECT n.status FROM whatsapp_order_notifications n WHERE n.order_id = o.id AND n.type = 'ready') AS notification_status
       FROM whatsapp_orders o
       JOIN whatsapp_customers cu ON cu.id = o.customer_id
       LEFT JOIN users u ON u.id = o.assigned_user_id
       WHERE o.company_id = $1 ${filter}
       ORDER BY CASE o.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END, o.created_at ASC
       LIMIT 300`,
      params
    );
    return rows;
  }

  async summary(companyId: number) {
    const { rows } = await this.db.query(
      `SELECT
         count(*) FILTER (WHERE o.status = 'pending')::int AS pending,
         count(*) FILTER (WHERE o.status = 'in_progress')::int AS in_progress,
         count(*) FILTER (WHERE o.status = 'ready')::int AS ready,
         count(*) FILTER (WHERE o.status = 'delivered' AND (o.delivered_at AT TIME ZONE s.timezone)::date = (NOW() AT TIME ZONE s.timezone)::date)::int AS delivered_today,
         COALESCE(SUM(t.total) FILTER (WHERE o.status IN ('pending', 'in_progress', 'ready')), 0)::float AS open_total,
         COALESCE(SUM(t.total) FILTER (WHERE o.status = 'delivered' AND (o.delivered_at AT TIME ZONE s.timezone)::date = (NOW() AT TIME ZONE s.timezone)::date), 0)::float AS delivered_today_total
       FROM whatsapp_orders o
       JOIN whatsapp_settings s ON s.company_id = o.company_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(i.quantity * i.unit_price), 0) AS total FROM whatsapp_order_items i WHERE i.order_id = o.id
       ) t ON TRUE
       WHERE o.company_id = $1`,
      [companyId]
    );
    return rows[0];
  }

  // Pedidos sem itens (ex.: criados antes da tabela de serviços) ganham itens deduzidos da descrição.
  private async inferItems(companyId: number, order: { id: string; description: string }) {
    const services = await this.catalog.listServices(companyId);
    if (!services.length) return;
    const completion = await openai().chat.completions.create({
      model: whatsappConfig.openaiModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você recebe a instrução de um pedido de papelaria e a tabela de serviços da loja.
Responda em JSON {"itens":[{"produto_id":number,"quantidade":number}]} com os serviços da tabela que correspondem exatamente ao pedido.
A quantidade é o total de unidades cobradas (ex.: 5 cópias de 1 imagem = 5). Se não der para saber a quantidade ou não houver serviço correspondente, devolva {"itens":[]}.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            pedido: order.description,
            tabela: services.map((s) => ({ produto_id: s.id, descricao: s.descricao, valor: s.valor })),
          }),
        },
      ],
    });
    let parsed: { itens?: { produto_id: number; quantidade: number }[] } = {};
    try {
      parsed = JSON.parse(completion.choices[0].message.content || "{}");
    } catch {
      return;
    }
    const valid = (parsed.itens || [])
      .map((i) => ({ service: services.find((s) => s.id === Number(i.produto_id)), quantity: Number(i.quantidade) }))
      .filter((i) => i.service && i.quantity > 0 && i.quantity <= 10000);
    if (!valid.length) return;
    await this.db.transaction(async (client) => {
      await client.query("SELECT 1 FROM whatsapp_orders WHERE id = $1 FOR UPDATE", [order.id]);
      const existing = await client.query("SELECT 1 FROM whatsapp_order_items WHERE order_id = $1 LIMIT 1", [order.id]);
      if (existing.rowCount) return;
      for (const { service, quantity } of valid) {
        await client.query(
          `INSERT INTO whatsapp_order_items (company_id, order_id, produto_id, description, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [companyId, order.id, service!.id, service!.descricao, quantity, service!.valor]
        );
      }
    });
  }

  // Monta o carrinho do caixa a partir dos itens do pedido, com os dados atuais do produto.
  async checkoutPayload(companyId: number, id: string) {
    let order = await this.get(companyId, id);
    if (order.status === "cancelled" || order.venda_id) throw new BadRequestException("Este pedido não pode mais virar venda");
    if (!order.items.length) {
      await this.inferItems(companyId, order).catch((err): undefined => {
        console.warn(`[whatsapp] não foi possível deduzir os itens do pedido ${order.number}: ${err?.message}`);
        return undefined;
      });
      order = await this.get(companyId, id);
    }
    const { rows } = await this.db.query(
      `SELECT i.quantity::float AS quantity, i.unit_price::float AS unit_price, i.description,
              p.id, p.descricao, p.valor, p.categoria, p.unidade, p.ean, p.ncm, p.image_url AS "imageUrl"
       FROM whatsapp_order_items i
       JOIN produto p ON p.id = i.produto_id AND p."companyId" = i.company_id AND p.deleted_at IS NULL
       WHERE i.company_id = $1 AND i.order_id = $2`,
      [companyId, order.id]
    );
    let cliente = null;
    if (order.cliente_id) {
      const found = await this.db.query(`SELECT * FROM cliente WHERE "companyId" = $1 AND id = $2 AND deleted_at IS NULL`, [
        companyId,
        order.cliente_id,
      ]);
      cliente = found.rows[0] ?? null;
    }
    return {
      orderId: order.id,
      number: order.number,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      description: order.description,
      customerNote: order.customer_note,
      cliente,
      items: rows.map((r) => ({
        id: r.id,
        descricao: r.descricao,
        valor: Number(r.valor),
        categoria: r.categoria,
        unidade: r.unidade,
        ean: r.ean,
        ncm: r.ncm,
        imageUrl: r.imageUrl,
        qtd: Math.max(1, Math.round(r.quantity)),
        ...(r.unit_price != null && Number(r.unit_price) !== Number(r.valor) ? { valorEditado: Number(r.unit_price) } : {}),
      })),
    };
  }

  async markSold(companyId: number, id: string, vendaId: number | null, userId: number) {
    const { rows } = await this.db.query(
      `UPDATE whatsapp_orders
       SET status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()), venda_id = COALESCE($3, venda_id),
           assigned_user_id = COALESCE(assigned_user_id, $4), updated_at = NOW()
       WHERE company_id = $1 AND id::text = $2 AND status IN ('pending', 'in_progress', 'ready', 'delivered')
       RETURNING id`,
      [companyId, id, Number.isFinite(vendaId) ? vendaId : null, userId || null]
    );
    if (!rows[0]) throw new BadRequestException("Pedido não encontrado ou cancelado");
    return this.get(companyId, id);
  }

  async get(companyId: number, id: string) {
    const { rows } = await this.db.query(
      `SELECT o.*, cu.name AS customer_name, cu.phone AS customer_phone, cu.cliente_id, u.name AS operator_name
       FROM whatsapp_orders o
       JOIN whatsapp_customers cu ON cu.id = o.customer_id
       LEFT JOIN users u ON u.id = o.assigned_user_id
       WHERE o.company_id = $1 AND (o.id::text = $2 OR o.number::text = $2)`,
      [companyId, id]
    );
    const order = rows[0];
    if (!order) throw new NotFoundException("Pedido não encontrado");
    const [files, items, notifications] = await Promise.all([
      this.db.query(
        `SELECT id, original_name, mime_type, size_bytes, created_at FROM whatsapp_order_files
         WHERE company_id = $1 AND order_id = $2 ORDER BY created_at`,
        [companyId, order.id]
      ),
      this.db.query(
        `SELECT produto_id, description, quantity, unit_price FROM whatsapp_order_items WHERE company_id = $1 AND order_id = $2`,
        [companyId, order.id]
      ),
      this.db.query(
        `SELECT id, type, status, attempts, last_error, sent_at, created_at FROM whatsapp_order_notifications
         WHERE company_id = $1 AND order_id = $2`,
        [companyId, order.id]
      ),
    ]);
    return {
      ...order,
      files: files.rows.map((f) => ({ ...f, preview_kind: previewKind(f.mime_type || "") })),
      items: items.rows,
      notifications: notifications.rows,
    };
  }

  async updateStatus(companyId: number, id: string, next: OrderStatus, userId: number) {
    if (!(next in TRANSITIONS)) throw new BadRequestException("Status inválido");
    const notificationId = await this.db.transaction(async (client) => {
      const { rows } = await client.query(
        "SELECT id, status FROM whatsapp_orders WHERE company_id = $1 AND id::text = $2 FOR UPDATE",
        [companyId, id]
      );
      const order = rows[0];
      if (!order) throw new NotFoundException("Pedido não encontrado");
      const current = order.status as OrderStatus;
      if (!TRANSITIONS[current].includes(next)) {
        throw new BadRequestException(`Transição não permitida: ${STATUS_LABEL[current]} → ${STATUS_LABEL[next]}`);
      }
      const column = TIMESTAMP_COLUMN[next];
      await client.query(
        `UPDATE whatsapp_orders
         SET status = $3::varchar, updated_at = NOW(),
             assigned_user_id = CASE WHEN $3::varchar = 'in_progress' THEN $4::int ELSE COALESCE(assigned_user_id, $4::int) END
             ${column ? `, ${column} = NOW()` : ""}
         WHERE company_id = $1 AND id = $2`,
        [companyId, order.id, next, userId || null]
      );
      if (next !== "ready") return null;
      const notification = await client.query(
        `INSERT INTO whatsapp_order_notifications (company_id, order_id, type) VALUES ($1, $2, 'ready')
         ON CONFLICT (order_id, type) DO NOTHING RETURNING id`,
        [companyId, order.id]
      );
      return (notification.rows[0]?.id as string) ?? null;
    });
    if (notificationId) await this.enqueueNotification(notificationId);
    return this.get(companyId, id);
  }

  async retryNotification(companyId: number, orderId: string) {
    const { rows } = await this.db.query(
      `UPDATE whatsapp_order_notifications SET status = 'pending', last_error = NULL
       WHERE company_id = $1 AND order_id::text = $2 AND status = 'failed' RETURNING id`,
      [companyId, orderId]
    );
    if (!rows[0]) throw new BadRequestException("Não há aviso com falha para reenviar");
    await this.enqueueNotification(rows[0].id);
    return this.get(companyId, orderId);
  }

  private async findFile(companyId: number, fileId: string) {
    const { rows } = await this.db.query(
      "SELECT id, storage_key, original_name, mime_type FROM whatsapp_order_files WHERE company_id = $1 AND id::text = $2",
      [companyId, fileId]
    );
    if (!rows[0]) throw new NotFoundException("Arquivo não encontrado");
    return rows[0];
  }

  async filePreview(companyId: number, fileId: string) {
    const file = await this.findFile(companyId, fileId);
    const mime: string = file.mime_type || "application/octet-stream";
    const kind = previewKind(mime);
    if (kind === "none") return { kind, url: null as string | null };
    return {
      kind,
      url: this.storage.getSignedUrl(file.storage_key, { fileName: file.original_name, contentType: mime, inline: true }),
    };
  }

  async fileDownloadUrl(companyId: number, fileId: string) {
    const file = await this.findFile(companyId, fileId);
    return { url: this.storage.getSignedUrl(file.storage_key, { fileName: file.original_name }), expiresInSeconds: 600 };
  }

  // Visão para a IA: todos os pedidos em aberto e os últimos finalizados, com datas no fuso da loja.
  async listForCustomer(companyId: number, customerId: string, number?: number) {
    const params: unknown[] = [companyId, customerId];
    let filter = `AND (o.status IN ('pending', 'in_progress', 'ready') OR o.updated_at > NOW() - INTERVAL '30 days')`;
    if (number) {
      params.push(number);
      filter = "AND o.number = $3";
    }
    const { rows } = await this.db.query(
      `SELECT o.number, o.status, o.description, o.created_at, o.started_at, o.ready_at, o.delivered_at,
              o.cancelled_at, o.expected_processing_from, s.timezone,
              (SELECT count(*) FROM whatsapp_order_files f WHERE f.order_id = o.id)::int AS arquivos,
              (SELECT string_agg(i.quantity::float || 'x ' || i.description, '; ') FROM whatsapp_order_items i WHERE i.order_id = o.id) AS itens
       FROM whatsapp_orders o JOIN whatsapp_settings s ON s.company_id = o.company_id
       WHERE o.company_id = $1 AND o.customer_id = $2 ${filter}
       ORDER BY o.created_at DESC LIMIT 20`,
      params
    );
    const fmt = (d: Date | null, tz: string) =>
      d ? DateTime.fromJSDate(d).setZone(tz).setLocale("pt-BR").toFormat("dd/MM 'às' HH:mm") : null;
    return rows.map((r) => ({
      numero: r.number,
      status: STATUS_LABEL[r.status as OrderStatus],
      descricao: r.description,
      itens: r.itens,
      arquivos: r.arquivos,
      registrado_em: fmt(r.created_at, r.timezone),
      previsao_inicio_execucao:
        r.status === "pending" && r.expected_processing_from && new Date(r.expected_processing_from) > new Date()
          ? fmt(r.expected_processing_from, r.timezone)
          : null,
      iniciado_em: fmt(r.started_at, r.timezone),
      pronto_em: fmt(r.ready_at, r.timezone),
      entregue_em: fmt(r.delivered_at, r.timezone),
      cancelado_em: fmt(r.cancelled_at, r.timezone),
    }));
  }
}
