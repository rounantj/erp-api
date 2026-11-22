import { randomUUID } from "crypto";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { DateTime } from "luxon";
import { BusinessHoursService } from "../hours/business-hours.service";
import { formatHour } from "../hours/schedule";
import { MessagingService } from "../messaging.service";
import { WhatsappOrdersService } from "../orders/orders.service";
import { CatalogService, isService } from "../products/catalog.service";
import { ProductImagesService } from "../products/product-images.service";
import { WhatsappDb } from "../whatsapp-db";

const MAX_CARDS_PER_REPLY = 3;

export interface PendingSummary {
  id: string;
  instrucao: string;
  recado_cliente?: string | null;
  arquivos: { id: string; nome: string }[];
  itens: { produto_id: number; descricao: string; quantidade: number; valor_unitario: number }[];
  registrado_em: string;
}

const PRODUCT_CARD_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "enviar_card_produto",
    description:
      "Envia ao cliente, no WhatsApp, um card com a foto, o nome e o preço de um produto do catálogo. Use para produtos físicos (não serviços) que o cliente perguntou.",
    parameters: {
      type: "object",
      properties: { produto_id: { type: "integer", description: "produto_id vindo de buscar_produtos" } },
      required: ["produto_id"],
      additionalProperties: false,
    },
  },
};

const BASE_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "buscar_produtos",
      description: 'Busca produtos e serviços no catálogo real da loja (ERP). Use termos simples, ex.: "caderno 10 materias", "plastificação A4".',
      parameters: {
        type: "object",
        properties: { termo: { type: "string", description: "Texto de busca" } },
        required: ["termo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_pedidos_do_cliente",
      description:
        "Consulta os pedidos deste cliente e o status atual de cada um (em aberto e finalizados recentemente). Use quando o cliente perguntar sobre seus pedidos.",
      parameters: {
        type: "object",
        properties: { numero: { type: "integer", description: "Número de um pedido específico, se o cliente informou." } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_resumo_pedido",
      description:
        "Registra o resumo de UM pedido para o cliente confirmar. Não cria o pedido. Para vários pedidos, chame uma vez para cada. Para corrigir um resumo existente, informe substituir_resumo_id.",
      parameters: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            enum: ["impressao_copia", "servico_online", "produto", "outro"],
            description:
              "servico_online = certidões, 2ª via de contas e serviços feitos em site de empresa ou órgão SEM login do cliente. Serviços que exigem conta/senha gov.br ou de aplicativo (ex.: carteira de trabalho digital, Meu INSS) não viram pedido: oriente ir à loja.",
          },
          servico_online: {
            type: "object",
            description: "Obrigatório quando tipo = servico_online. Somente dados que o CLIENTE informou ou confirmou nesta conversa.",
            properties: {
              empresa: { type: "string", description: 'Empresa ou órgão, com a cidade se for municipal (ex.: "SAAE de <cidade>", "EDP", "Receita Federal").' },
              referencia: {
                type: "string",
                description:
                  'Para contas e boletos: o MÊS/ANO dito pelo cliente (ex.: "novembro/2026", "a deste mês", "todas em aberto"). Para documentos: qual documento. "Segunda via" ou "conta de água" NÃO é referência: se o cliente não disse o mês, deixe vazio e pergunte.',
              },
              identificacao: { type: "string", description: "Matrícula/instalação/inscrição, ou CPF e nome do titular." },
            },
            required: ["empresa", "referencia", "identificacao"],
            additionalProperties: false,
          },
          instrucao: { type: "string", description: "Instrução final, clara e completa para o operador executar o serviço." },
          arquivo_ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs dos arquivos desta conversa que fazem parte deste pedido. Vazio se não houver.",
          },
          itens: {
            type: "array",
            description: "Produtos do catálogo a separar neste pedido, se houver.",
            items: {
              type: "object",
              properties: { produto_id: { type: "integer" }, quantidade: { type: "number" } },
              required: ["produto_id", "quantidade"],
              additionalProperties: false,
            },
          },
          recado_cliente: {
            type: "string",
            description:
              "Recado do cliente para a loja sobre este pedido, nas palavras dele (ex.: \"vou buscar às 15h\", \"pode ser papel fosco\", \"é urgente\"). Omita se não houver.",
          },
          substituir_resumo_id: {
            type: "string",
            description: "ID do resumo pendente que este substitui (correção do cliente). Omita para um pedido novo.",
          },
        },
        required: ["tipo", "instrucao", "arquivo_ids", "itens"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "descartar_resumo",
      description: "Remove um resumo pendente que o cliente desistiu de pedir.",
      parameters: { type: "object", properties: { resumo_id: { type: "string" } }, required: ["resumo_id"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "confirmar_pedidos",
      description:
        "Cria uma ordem de serviço para cada resumo informado. Use SOMENTE com os resumos que o cliente confirmou explicitamente depois de vê-los.",
      parameters: {
        type: "object",
        properties: { resumo_ids: { type: "array", items: { type: "string" }, minItems: 1 } },
        required: ["resumo_ids"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_horario_funcionamento",
      description: "Horário de funcionamento da loja. Use apenas quando o cliente perguntar diretamente.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

export function toolDefinitions(productCardsEnabled: boolean): ChatCompletionTool[] {
  return productCardsEnabled ? [BASE_TOOLS[0], PRODUCT_CARD_TOOL, ...BASE_TOOLS.slice(1)] : BASE_TOOLS;
}

export interface ToolContext {
  companyId: number;
  conversationId: string;
  customerId: string;
  autoProductImages: boolean;
  latestCustomerMessage: { providerMessageId: string; createdAt: Date } | null;
}

export interface ToolServices {
  db: WhatsappDb;
  catalog: CatalogService;
  orders: WhatsappOrdersService;
  hours: BusinessHoursService;
  images: ProductImagesService;
  messaging: MessagingService;
}

export interface CreatedOrder {
  number: number;
  alreadyExisted: boolean;
}

export class ToolExecutor {
  createdOrders: CreatedOrder[] = [];
  remainingSummaries = 0;
  private cardsSent = 0;

  constructor(private readonly ctx: ToolContext, private readonly s: ToolServices) {}

  async run(name: string, args: any): Promise<unknown> {
    switch (name) {
      case "buscar_produtos":
        return this.searchProducts(String(args.termo || ""));
      case "enviar_card_produto":
        return this.sendCard(Number(args.produto_id));
      case "consultar_pedidos_do_cliente": {
        const pedidos = await this.s.orders.listForCustomer(this.ctx.companyId, this.ctx.customerId, Number(args.numero) || undefined);
        return pedidos.length ? { pedidos } : { pedidos: [], observacao: "Nenhum pedido encontrado para este cliente." };
      }
      case "registrar_resumo_pedido":
        return this.registerSummary(args);
      case "descartar_resumo":
        return this.discardSummary(String(args.resumo_id || ""));
      case "confirmar_pedidos":
        return this.confirm(Array.isArray(args.resumo_ids) ? args.resumo_ids.map(String) : []);
      case "consultar_horario_funcionamento":
        return this.storeHours();
      default:
        return { erro: `Ferramenta desconhecida: ${name}` };
    }
  }

  private async searchProducts(term: string) {
    const products = await this.s.catalog.search(this.ctx.companyId, term);
    if (!products.length) return { resultados: [] as unknown[], observacao: "Nada encontrado no catálogo com esse termo." };

    if (this.ctx.autoProductImages) {
      // O atraso deixa o enviar_card_produto (que busca na hora) chegar antes; o job pula se a foto já existir.
      for (const p of products.filter((p) => !p.imageUrl && !isService(p.categoria, p.descricao)).slice(0, 3)) {
        this.s.images.enqueueLookup(this.ctx.companyId, p.id, { delayMs: 60_000 }).catch((err) =>
          console.warn(`[whatsapp] não foi possível enfileirar a busca de foto #${p.id}: ${err.message}`)
        );
      }
    }
    return {
      resultados: products.map((p) => ({
        produto_id: p.id,
        descricao: p.descricao,
        valor_unitario: p.valor,
        unidade: p.unidade,
        tipo: isService(p.categoria, p.descricao) ? "serviço" : "produto",
        estoque_sistema: p.estoque,
      })),
    };
  }

  private async sendCard(productId: number) {
    if (this.cardsSent >= MAX_CARDS_PER_REPLY) {
      return { erro: `Limite de ${MAX_CARDS_PER_REPLY} cards por resposta. Liste os demais produtos em texto.` };
    }
    const [product] = await this.s.catalog.getByIds(this.ctx.companyId, [productId]);
    if (!product) return { erro: `Produto ${productId} não existe no catálogo.` };
    if (isService(product.categoria, product.descricao)) return { erro: "Serviços não têm card; informe o valor em texto." };
    if (await this.s.messaging.isHumanTakeoverActive(this.ctx.conversationId)) {
      return { erro: "Atendimento humano em andamento; não envie nada." };
    }

    const target = await this.s.messaging.loadTarget(this.ctx.conversationId);
    const result = await this.s.images.sendCard(target, product, this.ctx.autoProductImages);
    if (!("motivo" in result)) {
      this.cardsSent++;
      return { ok: true, observacao: "Card com foto, nome e preço já foi entregue ao cliente. Não repita o preço no texto." };
    }
    return result.motivo === "ja_enviado"
      ? { ok: true, observacao: "Este card já foi enviado há pouco nesta conversa; não reenvie, apenas responda." }
      : { erro: "Produto sem foto disponível. Informe nome e valor em texto." };
  }

  private async loadSummaries(): Promise<PendingSummary[]> {
    const { rows } = await this.s.db.query("SELECT pending_summaries FROM whatsapp_conversations WHERE id = $1", [this.ctx.conversationId]);
    return rows[0]?.pending_summaries ?? [];
  }

  private async saveSummaries(summaries: PendingSummary[]) {
    await this.s.db.query("UPDATE whatsapp_conversations SET pending_summaries = $2, updated_at = NOW() WHERE id = $1", [
      this.ctx.conversationId,
      JSON.stringify(summaries),
    ]);
  }

  private async registerSummary(args: {
    tipo?: string;
    servico_online?: { empresa?: string; referencia?: string; identificacao?: string };
    instrucao: string;
    recado_cliente?: string;
    arquivo_ids?: string[];
    itens?: { produto_id: number; quantidade: number }[];
    substituir_resumo_id?: string;
  }) {
    const instrucao = (args.instrucao || "").trim();
    if (instrucao.length < 5) return { erro: "Instrução vazia ou curta demais." };
    if (args.tipo === "servico_online") {
      const labels = { empresa: "a empresa/órgão (e a cidade, se for municipal)", referencia: "a referência (mês da conta, qual documento)", identificacao: "os dados de identificação (matrícula/instalação ou CPF e nome do titular; para certidões, CPF/RG e demais dados pedidos)" };
      const missing = (Object.keys(labels) as (keyof typeof labels)[]).filter((k) => !String(args.servico_online?.[k] ?? "").trim());
      // CPF, RG, matrícula e instalação são números; sem dígitos o modelo preencheu um marcador ("pendente", "não informado").
      if (!missing.includes("identificacao") && (String(args.servico_online?.identificacao).match(/\d/g) || []).length < 5) {
        missing.push("identificacao");
      }
      if (!missing.includes("empresa") && /sua cidade|da regi[aã]o|do cliente|a confirmar|n[aã]o informad/i.test(String(args.servico_online?.empresa))) {
        missing.push("empresa");
      }
      if (missing.length) {
        return {
          erro: `Resumo NÃO registrado. Falta perguntar ao cliente: ${missing.map((k) => labels[k]).join("; ")}. Pergunte antes de registrar e não diga que o pedido foi feito.`,
        };
      }
    }

    const summaries = await this.loadSummaries();
    const replacing = args.substituir_resumo_id ? summaries.find((s) => s.id === args.substituir_resumo_id) : null;
    if (args.substituir_resumo_id && !replacing) return { erro: "Resumo a substituir não encontrado entre os pendentes." };
    const others = summaries.filter((s) => s.id !== replacing?.id);

    const requestedFiles = Array.isArray(args.arquivo_ids) ? [...new Set(args.arquivo_ids)] : [];
    const files = requestedFiles.length
      ? await this.s.db.query(
          `SELECT id, original_name FROM whatsapp_order_files
           WHERE company_id = $1 AND conversation_id = $2 AND order_id IS NULL AND id::text = ANY($3::text[])`,
          [this.ctx.companyId, this.ctx.conversationId, requestedFiles]
        )
      : { rows: [] as any[] };
    const missing = requestedFiles.filter((id) => !files.rows.some((f) => f.id === id));
    if (missing.length) return { erro: `Arquivos inexistentes ou já vinculados a um pedido criado: ${missing.join(", ")}` };
    const inOtherSummary = requestedFiles.filter((id) => others.some((s) => s.arquivos.some((a) => a.id === id)));
    if (inOtherSummary.length) {
      return {
        erro: `Os arquivos ${inOtherSummary.join(", ")} já estão em outro resumo pendente. Um arquivo pertence a um único pedido: junte as instruções num só resumo ou substitua o outro.`,
      };
    }

    const requestedItems = Array.isArray(args.itens) ? args.itens : [];
    const products = await this.s.catalog.getByIds(this.ctx.companyId, requestedItems.map((i) => Number(i.produto_id)));
    const itens: PendingSummary["itens"] = [];
    for (const item of requestedItems) {
      const product = products.find((p) => p.id === Number(item.produto_id));
      if (!product) return { erro: `Produto ${item.produto_id} não existe no catálogo.` };
      if (!(Number(item.quantidade) > 0)) return { erro: `Quantidade inválida para ${product.descricao}.` };
      itens.push({ produto_id: product.id, descricao: product.descricao, quantidade: Number(item.quantidade), valor_unitario: product.valor });
    }

    const summary: PendingSummary = {
      id: randomUUID(),
      instrucao,
      recado_cliente: (args.recado_cliente || "").trim().slice(0, 500) || null,
      arquivos: files.rows.map((f) => ({ id: f.id, nome: f.original_name })),
      itens,
      registrado_em: new Date().toISOString(),
    };
    await this.saveSummaries([...others, summary]);
    return {
      resumo_id: summary.id,
      ...summary,
      resumos_pendentes: others.length + 1,
      proximo_passo:
        "Mostre ao cliente, em um fechamento curto e natural, o que será feito e o valor estimado, e faça UMA pergunta para fechar (ex.: \"Posso fechar assim? 😊\"). Não use nomes internos de serviços. Os pedidos ainda NÃO foram criados.",
    };
  }

  private async discardSummary(summaryId: string) {
    const summaries = await this.loadSummaries();
    if (!summaries.some((s) => s.id === summaryId)) return { erro: "Resumo não encontrado." };
    await this.saveSummaries(summaries.filter((s) => s.id !== summaryId));
    return { ok: true, resumos_pendentes: summaries.length - 1 };
  }

  private async confirm(summaryIds: string[]) {
    const latest = this.ctx.latestCustomerMessage;
    if (!latest) return { erro: "Não há mensagem do cliente confirmando." };
    if (!summaryIds.length) return { erro: "Informe ao menos um resumo_id." };

    const schedule = await this.s.hours.status(this.ctx.companyId);
    const expectedFrom = schedule.isOpen ? new Date() : schedule.nextOpening;
    const { companyId, conversationId, customerId } = this.ctx;

    const result = await this.s.db.transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT pending_summaries, human_takeover_until > NOW() AS paused FROM whatsapp_conversations WHERE id = $1 FOR UPDATE`,
        [conversationId]
      );
      const conv = rows[0];
      if (conv.paused) return { erro: "Atendimento humano em andamento; não crie pedidos agora." };
      const pending: PendingSummary[] = conv.pending_summaries ?? [];

      const created: CreatedOrder[] = [];
      const createdSummaryIds = new Set<string>();
      const problems: string[] = [];
      for (const summaryId of [...new Set(summaryIds)]) {
        const existing = await client.query("SELECT number FROM whatsapp_orders WHERE company_id = $1 AND summary_id::text = $2", [
          companyId,
          summaryId,
        ]);
        if (existing.rows[0]) {
          created.push({ number: existing.rows[0].number, alreadyExisted: true });
          createdSummaryIds.add(summaryId);
          continue;
        }
        const summary = pending.find((s) => s.id === summaryId);
        if (!summary) {
          problems.push(`${summaryId}: não é um resumo pendente (pode ter sido substituído).`);
          continue;
        }
        if (new Date(latest.createdAt) <= new Date(summary.registrado_em)) {
          problems.push(`${summaryId}: o cliente ainda não respondeu a este resumo.`);
          continue;
        }

        // Numeração própria de cada empresa; o UPDATE trava a linha até o fim da transação.
        const numbering = await client.query(
          `UPDATE whatsapp_settings SET next_order_number = next_order_number + 1 WHERE company_id = $1 RETURNING next_order_number - 1 AS number`,
          [companyId]
        );
        const inserted = await client.query(
          `INSERT INTO whatsapp_orders (company_id, number, customer_id, conversation_id, description, confirmed_message_id, expected_processing_from, summary_id, customer_note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, number`,
          [companyId, numbering.rows[0].number, customerId, conversationId, summary.instrucao, latest.providerMessageId, expectedFrom, summary.id, summary.recado_cliente ?? null]
        );
        const order = inserted.rows[0];

        const fileIds = summary.arquivos.map((f) => f.id);
        if (fileIds.length) {
          await client.query(
            `UPDATE whatsapp_order_files SET order_id = $1
             WHERE company_id = $2 AND conversation_id = $3 AND order_id IS NULL AND id = ANY($4::uuid[])`,
            [order.id, companyId, conversationId, fileIds]
          );
        }
        for (const item of summary.itens) {
          await client.query(
            `INSERT INTO whatsapp_order_items (company_id, order_id, produto_id, description, quantity, unit_price)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [companyId, order.id, item.produto_id, item.descricao, item.quantidade, item.valor_unitario]
          );
        }
        created.push({ number: order.number, alreadyExisted: false });
        createdSummaryIds.add(summaryId);
      }

      const remaining = pending.filter((s) => !createdSummaryIds.has(s.id));
      await client.query("UPDATE whatsapp_conversations SET pending_summaries = $2 WHERE id = $1", [conversationId, JSON.stringify(remaining)]);
      return { created, problems, remaining: remaining.length };
    });

    if ("erro" in result) return result;
    this.createdOrders.push(...result.created);
    this.remainingSummaries = result.remaining;
    if (!result.created.length) return { erro: result.problems.join(" ") };
    return { ok: true, pedidos_criados: result.created.map((o) => o.number), problemas: result.problems };
  }

  private async storeHours() {
    const s = await this.s.hours.status(this.ctx.companyId);
    return {
      aberta_agora: s.isOpen,
      fecha_hoje_as: s.isOpen && s.closesAt ? formatHour(DateTime.fromISO(s.closesAt)) : null,
      proxima_abertura: s.isOpen ? null : s.nextOpeningText,
      horario_semanal: s.weeklyText,
      excecoes_proximas: s.upcomingExceptions,
    };
  }
}
