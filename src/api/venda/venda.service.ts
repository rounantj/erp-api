import { Venda } from "@/domain/entities/vendas.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";
import * as moment from "moment";
import { Between, In } from "typeorm";
import "moment-timezone"; // Importa a extensão de timezone do moment
import { Produto } from "@/domain/entities/produtos.entity";
// Configura o timezone padrão
moment.tz.setDefault("America/Sao_Paulo");

@Injectable()
export class VendasService {
  constructor(private uow: UnitOfWorkService) {}

  async create(venda: Venda, companyId?: number) {
    // Buscar caixa no banco de dados
    const caixa = await this.uow.caixaRepository.findOne({
      where: { id: venda.caixaId },
    });
    if (!caixa) {
      throw new Error("Caixa não encontrado");
    }
    venda.caixa = caixa;
    venda.updatedAt = new Date();

    // Definir companyId se fornecido
    if (companyId) {
      venda.companyId = companyId;
    } else if (!venda.companyId) {
      venda.companyId = 1; // fallback para compatibilidade
    }

    return await this.uow.vendaRepository.save(venda);
  }

  /**
   * Gera dados do dashboard incluindo estatísticas de vendas, produtos vendidos,
   * e métricas de desempenho mensal de forma otimizada
   *
   * @param companyId - ID da empresa para filtrar os dados
   * @returns Objeto com métricas completas de vendas e desempenho
   */
  async dashboard(companyId?: number): Promise<any> {
    try {
      // Períodos de data
      const firstDayOfMonth = moment().startOf("month").format("YYYY-MM-DD");
      const lastDayOfMonth = moment().endOf("month").format("YYYY-MM-DD");

      // Filtro de companyId para queries SQL
      const companyFilter = companyId ? `AND "companyId" = ${companyId}` : "";

      // Consultas otimizadas para maior velocidade
      const [despesa, serverDateTime] = await Promise.all([
        // Consulta de despesas total (filtrada por companyId)
        this.uow.vendaRepository.query(
          `SELECT COALESCE(sum(valor), 0) as total from despesa WHERE 1=1 ${companyFilter}`
        ),

        // Consulta da data/hora do servidor
        this.uow.vendaRepository.query(`SELECT now()`),
      ]);

      // Consulta de vendas do mês atual e do ano - executadas em paralelo
      const [vendasMes, vendasAno] = await Promise.all([
        // Vendas do mês (filtradas por companyId)
        this.uow.vendaRepository.query(`
        SELECT * FROM venda 
        WHERE created_at BETWEEN '${firstDayOfMonth}' AND '${lastDayOfMonth}'
        AND deleted_at IS NULL
        ${companyFilter}
      `),

        // Vendas do ano (filtradas por companyId)
        this.uow.vendaRepository.query(`
        SELECT * FROM venda
        WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND deleted_at IS NULL
        ${companyFilter}
      `),
      ]);

      // Ajuste de fuso horário para dados de vendas
      const vendas = vendasMes.map((venda: any) => ({
        ...venda,
        created_at: moment(venda.created_at).add(-3, "hour").toDate(),
        total: parseFloat(venda.total || 0), // Garantir que total seja número
      }));

      // Processamento de produtos vendidos
      let produtosVendidos: any[] = [];
      const todosProdutosIds = new Set<number>();

      // Extrair IDs dos produtos para consulta em lote
      vendas.forEach((venda: any) => {
        let produtos = [];

        // Tratamento seguro do campo produtos
        try {
          if (typeof venda.produtos === "string") {
            produtos = JSON.parse(venda.produtos || "[]");
          } else if (Array.isArray(venda.produtos)) {
            produtos = venda.produtos;
          }
        } catch (error) {
          console.error(
            "Erro ao processar produtos da venda:",
            venda.id,
            error
          );
          produtos = [];
        }

        if (Array.isArray(produtos)) {
          produtos.forEach((produto: any) => {
            if (produto && produto.id) {
              todosProdutosIds.add(produto.id);
            }
          });
        }
      });

      // Consulta eficiente de produtos usando IN
      let produtosDetails: any[] = [];
      if (todosProdutosIds.size > 0) {
        try {
          produtosDetails = await this.uow.produtoRepository.find({
            where: { id: In([...todosProdutosIds]), deletedAt: null },
          });
        } catch (error) {
          console.error("Erro ao buscar detalhes dos produtos:", error);
        }
      }

      // Mapa para lookup rápido de produtos
      const produtosMap = new Map();
      produtosDetails.forEach((produto) => {
        if (produto && produto.id) {
          produtosMap.set(produto.id, {
            ...produto,
            categoria: produto.categoria || "Produto", // Categoria padrão se não definida
          });
        }
      });

      // Processar produtos vendidos no mês atual
      vendas.forEach((venda: any) => {
        let produtos = [];

        try {
          if (typeof venda.produtos === "string") {
            produtos = JSON.parse(venda.produtos || "[]");
          } else if (Array.isArray(venda.produtos)) {
            produtos = venda.produtos;
          }
        } catch (error) {
          console.error(
            "Erro ao processar produtos da venda:",
            venda.id,
            error
          );
          produtos = [];
        }

        if (Array.isArray(produtos)) {
          produtos.forEach((produtoVenda: any) => {
            if (!produtoVenda || !produtoVenda.id) return;

            const produtoDetalhes = produtosMap.get(produtoVenda.id);

            // Se não encontrou no mapa, usar dados mínimos
            const baseInfo = produtoDetalhes || {
              id: produtoVenda.id,
              descricao: produtoVenda.descricao || `Produto ${produtoVenda.id}`,
              categoria: produtoVenda.categoria || "Produto",
            };

            const quantidade = Number(produtoVenda.quantidade || 1);
            const valor = Number(produtoVenda.valor || baseInfo.valor || 0);
            const desconto = Number(produtoVenda.desconto || 0);

            // Calcular valor total
            const valorTotal = valor * quantidade - desconto;

            produtosVendidos.push({
              ...baseInfo,
              quantidade: quantidade,
              createdAt: venda.created_at,
              valorTotal: valorTotal > 0 ? valorTotal : 0, // Nunca permitir valor negativo
            });
          });
        }
      });

      // Processamento de vendas do ano para análise mensal
      let produtosNoAno: any[] = [];

      vendasAno.forEach((venda: any) => {
        let produtos = [];

        try {
          if (typeof venda.produtos === "string") {
            produtos = JSON.parse(venda.produtos || "[]");
          } else if (Array.isArray(venda.produtos)) {
            produtos = venda.produtos;
          }
        } catch (error) {
          console.error(
            "Erro ao processar produtos anuais da venda:",
            venda.id,
            error
          );
          produtos = [];
        }

        if (Array.isArray(produtos)) {
          produtos.forEach((produtoVenda: any) => {
            if (!produtoVenda) return;

            const quantidade = Number(produtoVenda.quantidade || 1);
            const valor = Number(produtoVenda.valor || 0);
            const desconto = Number(produtoVenda.desconto || 0);

            // Calcular valor total
            const valorTotal = valor * quantidade - desconto;

            produtosNoAno.push({
              ...produtoVenda,
              createdAt: venda.created_at,
              valorTotal: valorTotal > 0 ? valorTotal : 0, // Nunca permitir valor negativo
              categoria: produtoVenda.categoria || "Produto", // Categoria padrão se não definida
            });
          });
        }
      });

      // Garantir produtos são tratados corretamente
      produtosVendidos = Array.isArray(produtosVendidos)
        ? produtosVendidos
        : [];

      // Garantir que todos os produtos tenham categoria definida
      produtosVendidos = produtosVendidos.map((p) => ({
        ...p,
        categoria: p.categoria || "Produto", // Garantir categoria padrão
      }));

      // Categorização de produtos e serviços com validação
      const produtos = produtosVendidos.filter(
        (p) =>
          !p.categoria ||
          p.categoria.toLowerCase().includes("prod") ||
          (!p.categoria.toLowerCase().includes("servi") &&
            !p.categoria.toLowerCase().includes("serviç"))
      );

      const servicos = produtosVendidos.filter(
        (p) =>
          p.categoria &&
          (p.categoria.toLowerCase().includes("servi") ||
            p.categoria.toLowerCase().includes("serviç"))
      );

      // Dias com vendas com validação de data
      const diasSet = new Set();
      produtosVendidos.forEach((p) => {
        if (p.createdAt) {
          diasSet.add(moment(p.createdAt).format("DD/MM"));
        }
      });

      const dias = Array.from(diasSet) as string[];
      dias.sort((a: any, b: any) => {
        const [dayA, monthA] = a.split("/").map(Number);
        const [dayB, monthB] = b.split("/").map(Number);
        return monthA === monthB ? dayA - dayB : monthA - monthB;
      });

      // Meses com vendas no ano atual com validação
      const mesesSet = new Set();
      produtosNoAno.forEach((p) => {
        if (p.createdAt) {
          mesesSet.add(moment(p.createdAt).format("MM/YYYY"));
        }
      });

      const monthNames = [
        "",
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
      ];

      const meses: string[] = [];
      const mesesIndices: number[] = [];

      mesesSet.forEach((monthYear: any) => {
        const parts = monthYear.split("/");
        if (parts.length === 2) {
          const monthIndex = +parts[0];
          if (monthIndex >= 1 && monthIndex <= 12) {
            mesesIndices.push(monthIndex);
            meses.push(monthNames[monthIndex]);
          }
        }
      });

      // Cálculos de totais com validação de valores
      const totalProdutos = produtos.reduce(
        (sum: any, item: any) =>
          sum + (isNaN(item.valorTotal) ? 0 : item.valorTotal),
        0
      );

      const totalServicos = servicos.reduce(
        (sum: any, item: any) =>
          sum + (isNaN(item.valorTotal) ? 0 : item.valorTotal),
        0
      );

      // Vendas de hoje com validação
      const hoje = moment().format("DD/MM/YYYY");
      const vendidosHoje = vendas.filter(
        (v: any) =>
          v.created_at && moment(v.created_at).format("DD/MM/YYYY") === hoje
      );

      const totalHoje = vendidosHoje.reduce(
        (sum: number, item: any) =>
          sum + (isNaN(parseFloat(item.total)) ? 0 : parseFloat(item.total)),
        0
      );

      // Vendas do mês atual com validação
      const mesAtual = moment().format("MM/YYYY");
      const vendidosNoMes = vendas.filter(
        (v: any) =>
          v.created_at && moment(v.created_at).format("MM/YYYY") === mesAtual
      );

      const totalEsseMes = vendidosNoMes.reduce(
        (sum: number, item: any) =>
          sum + (isNaN(parseFloat(item.total)) ? 0 : parseFloat(item.total)),
        0
      );

      // Valores diários
      const servicosValues: number[] = [];
      const produtosValues: number[] = [];
      const fullValues: number[] = [];

      // Cálculo de valores por dia com validação
      dias.forEach((dia) => {
        // Filtrar por dia
        const prodsDia = produtosVendidos.filter(
          (p) => p.createdAt && moment(p.createdAt).format("DD/MM") === dia
        );

        // Calcular valores para o dia
        const totalDia = prodsDia.reduce(
          (sum: any, item: any) =>
            sum + (isNaN(item.valorTotal) ? 0 : item.valorTotal),
          0
        );
        fullValues.push(totalDia);

        // Serviços do dia - verificando categoria corretamente
        const servicosDia = prodsDia.filter(
          (p) =>
            p.categoria &&
            (p.categoria.toLowerCase().includes("servi") ||
              p.categoria.toLowerCase().includes("serviç"))
        );

        const totalServicoDia = servicosDia.reduce(
          (sum: any, item: any) =>
            sum + (isNaN(item.valorTotal) ? 0 : item.valorTotal),
          0
        );
        servicosValues.push(totalServicoDia);

        // Produtos do dia - verificando categoria corretamente
        const produtosDia = prodsDia.filter(
          (p) =>
            !p.categoria ||
            !(
              p.categoria.toLowerCase().includes("servi") ||
              p.categoria.toLowerCase().includes("serviç")
            )
        );

        const totalProdutoDia = produtosDia.reduce(
          (sum: any, item: any) =>
            sum + (isNaN(item.valorTotal) ? 0 : item.valorTotal),
          0
        );
        produtosValues.push(totalProdutoDia);
      });

      // Valores mensais
      const mesesSerValues: number[] = Array(meses.length).fill(0);
      const mesesPrdValues: number[] = Array(meses.length).fill(0);

      // Garantir categorias para produtos anuais
      produtosNoAno = produtosNoAno.map((p) => ({
        ...p,
        categoria: p.categoria || "Produto", // Categoria padrão
      }));

      // Cálculo de valores por mês com validação
      meses.forEach((mes, index) => {
        const monthIndex = mesesIndices[index];

        // Filtrar por mês com validação
        const prodsMes = produtosNoAno.filter(
          (p) => p.createdAt && +moment(p.createdAt).format("MM") === monthIndex
        );

        // Categorizar produtos e serviços corretamente
        const produtosMes = prodsMes.filter(
          (p) =>
            !p.categoria ||
            !(
              p.categoria.toLowerCase().includes("servi") ||
              p.categoria.toLowerCase().includes("serviç")
            )
        );

        const servicosMes = prodsMes.filter(
          (p) =>
            p.categoria &&
            (p.categoria.toLowerCase().includes("servi") ||
              p.categoria.toLowerCase().includes("serviç"))
        );

        // Calcular totais mensais com verificação de NaN
        const totalProdutosMes = produtosMes.reduce(
          (sum: any, item: any) =>
            sum + (isNaN(item.valorTotal) ? 0 : item.valorTotal),
          0
        );

        const totalServicosMes = servicosMes.reduce(
          (sum: any, item: any) =>
            sum + (isNaN(item.valorTotal) ? 0 : item.valorTotal),
          0
        );

        // Atribuir valores aos arrays (invertido conforme o original)
        mesesPrdValues[index] = totalServicosMes;
        mesesSerValues[index] = totalProdutosMes;
      });

      // Retornar dados do dashboard
      return {
        produtosVendidos,
        totalProdutos,
        totalServicos,
        totalHoje,
        totalEsseMes,
        dias,
        servicosValues,
        fullValues,
        produtosValues,
        meses,
        mesesSerValues,
        mesesPrdValues,
        despesa,
        serverDateTime,
      };
    } catch (error) {
      console.error("Erro ao gerar dados do dashboard:", error);
      // Retornar dados vazios em caso de erro
      return {
        produtosVendidos: [],
        totalProdutos: 0,
        totalServicos: 0,
        totalHoje: 0,
        totalEsseMes: 0,
        dias: [],
        servicosValues: [],
        fullValues: [],
        produtosValues: [],
        meses: [],
        mesesSerValues: [],
        mesesPrdValues: [],
        despesa: [{ total: 0 }],
        serverDateTime: [{ now: new Date() }],
      };
    }
  }

  async getAll(rangeDate: any, companyId?: number) {
    console.log(
      "getAll called with rangeDate:",
      rangeDate,
      "companyId:",
      companyId
    );

    const today = moment().format("YYYY-MM-DD");
    const oneMonthAgo = moment().subtract(1, "months").format("YYYY-MM-DD");

    // Use default dates if not provided or if values are undefined/string 'undefined'
    const start =
      rangeDate?.startDate && rangeDate.startDate !== "undefined"
        ? rangeDate.startDate
        : oneMonthAgo;
    const end =
      rangeDate?.endDate && rangeDate.endDate !== "undefined"
        ? rangeDate.endDate
        : today;

    console.log("Using dates - start:", start, "end:", end);

    // Validar e formatar as datas com tratamento mais robusto
    let startDate, endDate;

    try {
      startDate = moment(start).isValid()
        ? moment(start).toDate()
        : moment(oneMonthAgo).toDate();
    } catch (error) {
      console.log("Error parsing start date, using default:", error);
      startDate = moment(oneMonthAgo).toDate();
    }

    try {
      endDate = moment(end).isValid()
        ? moment(end).toDate()
        : moment(today).toDate();
    } catch (error) {
      console.log("Error parsing end date, using default:", error);
      endDate = moment(today).toDate();
    }

    const where: any = {
      createdAt: Between(startDate, endDate),
    };

    if (companyId) {
      where.companyId = companyId;
    }

    return await this.uow.vendaRepository.find({
      where,
    });
  }

  async getOne(vendaId: number) {
    // Validar vendaId para evitar NaN
    const validId = vendaId && !isNaN(Number(vendaId)) ? Number(vendaId) : null;
    if (!validId) {
      throw new Error("ID de venda inválido");
    }
    return await this.uow.vendaRepository.findOne({
      where: {
        id: validId,
      },
    });
  }
  async delete(vendaId: number) {
    return await this.uow.vendaRepository.delete(vendaId);
  }

  // Metodos novos
  /**
   * Solicita a exclusão de uma venda
   *
   * @param vendaId ID da venda a ser excluída
   * @param requestedById ID do usuário que está solicitando a exclusão
   * @param reason Motivo da solicitação de exclusão
   * @returns A venda atualizada com a solicitação de exclusão
   */
  async requestExclusion(
    vendaId: number,
    requestedById: number,
    reason: string
  ): Promise<Venda> {
    // Verificar se a venda existe
    const venda = await this.uow.vendaRepository.findOne({
      where: {
        id: vendaId,
      },
    });

    if (!venda) {
      throw new Error("Venda não encontrada");
    }

    // Verificar se já existe uma solicitação pendente
    if (venda.exclusionRequested && venda.exclusionStatus === "pending") {
      throw new Error(
        "Já existe uma solicitação de exclusão pendente para esta venda"
      );
    }

    // Atualizar a venda com os dados da solicitação
    venda.exclusionRequested = true;
    venda.exclusionRequestedAt = new Date();
    venda.exclusionRequestedBy = requestedById;
    venda.exclusionReason = reason;
    venda.exclusionStatus = "pending";

    // Salvar as alterações
    return await this.uow.vendaRepository.save(venda);
  }

  /**
   * Aprova uma solicitação de exclusão de venda
   *
   * @param vendaId ID da venda cuja exclusão será aprovada
   * @param reviewedById ID do administrador que está aprovando a exclusão
   * @param notes Observações adicionais sobre a aprovação (opcional)
   * @returns A venda que foi excluída (soft-delete)
   */
  async approveExclusion(
    vendaId: number,
    reviewedById: number,
    notes?: string
  ): Promise<Venda> {
    // Verificar se a venda existe e se há uma solicitação pendente
    const venda = await this.uow.vendaRepository.findOne({
      where: {
        id: vendaId,
      },
    });

    if (!venda) {
      throw new Error("Venda não encontrada");
    }

    if (!venda.exclusionRequested || venda.exclusionStatus !== "pending") {
      throw new Error(
        "Não existe uma solicitação de exclusão pendente para esta venda"
      );
    }

    // Atualizar status da solicitação
    venda.exclusionStatus = "approved";
    venda.exclusionReviewedAt = new Date();
    venda.exclusionReviewedBy = reviewedById;
    venda.exclusionReviewNotes = notes || "";

    // Salvar as alterações
    await this.uow.vendaRepository.save(venda);

    // Executar o soft-delete
    return await this.uow.vendaRepository.softRemove(venda);
  }

  /**
   * Rejeita uma solicitação de exclusão de venda
   *
   * @param vendaId ID da venda cuja exclusão será rejeitada
   * @param reviewedById ID do administrador que está rejeitando a exclusão
   * @param notes Motivo da rejeição da solicitação
   * @returns A venda atualizada com a solicitação rejeitada
   */
  async rejectExclusion(
    vendaId: number,
    reviewedById: number,
    notes: string
  ): Promise<Venda> {
    // Verificar se a venda existe e se há uma solicitação pendente
    const venda = await this.uow.vendaRepository.findOne({
      where: {
        id: vendaId,
      },
    });

    if (!venda) {
      throw new Error("Venda não encontrada");
    }

    if (!venda.exclusionRequested || venda.exclusionStatus !== "pending") {
      throw new Error(
        "Não existe uma solicitação de exclusão pendente para esta venda"
      );
    }

    // Atualizar status da solicitação
    venda.exclusionStatus = "rejected";
    venda.exclusionReviewedAt = new Date();
    venda.exclusionReviewedBy = reviewedById;
    venda.exclusionReviewNotes = notes;

    // Salvar as alterações
    return await this.uow.vendaRepository.save(venda);
  }

  /**
   * Lista todas as vendas com solicitação de exclusão pendente
   *
   * @param companyId - ID da empresa para filtrar as solicitações
   * @returns Lista de vendas com solicitação de exclusão pendente
   */
  async getPendingExclusionRequests(companyId?: number): Promise<Venda[]> {
    const where: any = {
      exclusionRequested: true,
      exclusionStatus: "pending",
    };

    if (companyId) {
      where.companyId = companyId;
    }

    return await this.uow.vendaRepository.find({
      where,
      relations: ["exclusionRequestedByUser"], // Carrega o relacionamento com o usuário que solicitou
    });
  }

  /**
   * Obtém estatísticas detalhadas de produtos e serviços mais vendidos para dashboard
   *
   * @param startDate Data de início do período
   * @param endDate Data de fim do período
   * @param companyId ID da empresa para filtrar
   * @returns Estatísticas de produtos e serviços mais vendidos
   */
  async getTopSellingItems(
    startDate: Date,
    endDate: Date,
    companyId?: number
  ): Promise<any> {
    try {
      // Formatar datas para pesquisa SQL
      const formattedStart = moment(startDate).format("YYYY-MM-DD");
      const formattedEnd = moment(endDate).format("YYYY-MM-DD");

      // Filtro de companyId
      const companyFilter = companyId ? `AND v."companyId" = ${companyId}` : "";

      // Consulta SQL que funcionava anteriormente
      const query = `
        WITH RECURSIVE produtos_expandidos AS (
          SELECT 
            v.id as venda_id,
            v.created_at,
            (p->>'id')::integer as produto_id,
            p->>'descricao' as produto_descricao,
            p->>'categoria' as categoria_json,
            CASE 
              WHEN p->>'categoria' IS NULL OR LOWER(p->>'categoria') = 'serviço' OR LOWER(p->>'categoria') = 'servico' THEN 'serviço'
              ELSE 'produto'
            END as tipo_item,
            (p->>'quantidade')::integer as quantidade,
            CASE WHEN p->>'valor' IS NOT NULL THEN (p->>'valor')::numeric ELSE NULL END as valor_unitario_json,
            v.total
          FROM 
            venda v,
            jsonb_array_elements(v.produtos::jsonb) AS p
          WHERE 
            v.deleted_at IS NULL
            AND v.created_at BETWEEN '${formattedStart}' AND '${formattedEnd}'
            ${companyFilter}
        ),
        
        produtos_completos AS (
          SELECT
            pe.*,
            -- Priorizar a categoria da tabela de produtos, só usar a do JSON se não existir na tabela
            COALESCE(p.categoria, pe.categoria_json) as categoria_final,
            -- Fornecer um valor padrão (0) quando ambos forem NULL
            COALESCE(pe.valor_unitario_json, p.valor, 0) as valor_unitario,
            -- Calcular valor total com tratamento de NULL
            (COALESCE(pe.valor_unitario_json, p.valor, 0) * pe.quantidade) as valor_total_item
          FROM
            produtos_expandidos pe
            LEFT JOIN produto p ON pe.produto_id = p.id
        ),
        
        produtos_finais AS (
          SELECT
            *,
            CASE 
              WHEN categoria_final IS NULL OR LOWER(categoria_final) = 'serviço' OR LOWER(categoria_final) = 'servico' THEN 'serviço'
              ELSE 'produto'
            END as tipo_final
          FROM
            produtos_completos
        ),
        
        totais AS (
          SELECT 
            produto_id,
            produto_descricao,
            categoria_final,
            tipo_final as tipo_item,
            SUM(quantidade) as total_quantidade,
            COUNT(DISTINCT venda_id) as total_vendas,
            SUM(valor_total_item) as valor_total_vendido,
            AVG(valor_unitario) as preco_medio_unitario
          FROM 
            produtos_finais
          GROUP BY 
            produto_id, produto_descricao, categoria_final, tipo_final
        ),
        
        ranking_produtos_qtd AS (
          SELECT 
            'Produto' as tipo,
            produto_id,
            produto_descricao,
            categoria_final,
            total_quantidade,
            total_vendas,
            preco_medio_unitario,
            valor_total_vendido,
            RANK() OVER (ORDER BY total_quantidade DESC) as ranking_qtd,
            RANK() OVER (ORDER BY valor_total_vendido DESC) as ranking_valor
          FROM 
            totais
          WHERE 
            tipo_item = 'produto'
        ),
        
        ranking_servicos_qtd AS (
          SELECT 
            'Serviço' as tipo,
            produto_id,
            produto_descricao,
            categoria_final,
            total_quantidade,
            total_vendas,
            preco_medio_unitario,
            valor_total_vendido,
            RANK() OVER (ORDER BY total_quantidade DESC) as ranking_qtd,
            RANK() OVER (ORDER BY valor_total_vendido DESC) as ranking_valor
          FROM 
            totais
          WHERE 
            tipo_item = 'serviço'
        )
        
        (SELECT 
          tipo,
          produto_id,
          produto_descricao,
          categoria_final as categoria,
          preco_medio_unitario as preco_unitario,
          total_quantidade,
          total_vendas,
          valor_total_vendido,
          ranking_qtd as ranking_por_quantidade,
          ranking_valor as ranking_por_valor
        FROM 
          ranking_produtos_qtd
        WHERE 
          ranking_qtd <= 100 OR ranking_valor <= 100)
        
        UNION ALL
        
        (SELECT 
          tipo,
          produto_id,
          produto_descricao,
          categoria_final as categoria,
          preco_medio_unitario as preco_unitario,
          total_quantidade,
          total_vendas,
          valor_total_vendido,
          ranking_qtd as ranking_por_quantidade,
          ranking_valor as ranking_por_valor
        FROM 
          ranking_servicos_qtd
        WHERE 
          ranking_qtd <= 100 OR ranking_valor <= 100)
        
        ORDER BY 
          tipo, 
          ranking_por_quantidade
      `;

      const rawResults = await this.uow.vendaRepository.query(query);

      // O restante do método permanece igual
      // Calcular totais gerais
      const totalProdutos = rawResults
        .filter((item: any) => item.tipo === "Produto")
        .reduce(
          (sum: any, item: any) => sum + parseFloat(item.valor_total_vendido),
          0
        );

      const totalServicos = rawResults
        .filter((item: any) => item.tipo === "Serviço")
        .reduce(
          (sum: any, item: any) => sum + parseFloat(item.valor_total_vendido),
          0
        );

      const totalQuantidadeProdutos = rawResults
        .filter((item: any) => item.tipo === "Produto")
        .reduce(
          (sum: any, item: any) => sum + parseInt(item.total_quantidade),
          0
        );

      const totalQuantidadeServicos = rawResults
        .filter((item: any) => item.tipo === "Serviço")
        .reduce(
          (sum: any, item: any) => sum + parseInt(item.total_quantidade),
          0
        );

      // Organizar resultados por tipo (produto/serviço) e ranking (quantidade/valor)
      const topProdutosPorQuantidade = rawResults
        .filter((item: any) => item.tipo === "Produto")
        .sort(
          (a: any, b: any) =>
            a.ranking_por_quantidade - b.ranking_por_quantidade
        )
        .slice(0, 100);

      const topProdutosPorValor = rawResults
        .filter((item: any) => item.tipo === "Produto")
        .sort((a: any, b: any) => a.ranking_por_valor - b.ranking_por_valor)
        .slice(0, 100);

      const topServicosPorQuantidade = rawResults
        .filter((item: any) => item.tipo === "Serviço")
        .sort(
          (a: any, b: any) =>
            a.ranking_por_quantidade - b.ranking_por_quantidade
        )
        .slice(0, 100);

      const topServicosPorValor = rawResults
        .filter((item: any) => item.tipo === "Serviço")
        .sort((a: any, b: any) => a.ranking_por_valor - b.ranking_por_valor)
        .slice(0, 100);

      // Retornar dados organizados para o dashboard
      return {
        periodo: {
          inicio: startDate,
          fim: endDate,
          diasTotal: moment(endDate).diff(moment(startDate), "days") + 1,
        },
        resumo: {
          totalProdutos: totalProdutos,
          totalServicos: totalServicos,
          totalVendas: totalProdutos + totalServicos,
          percentualProdutos:
            (totalProdutos / (totalProdutos + totalServicos || 1)) * 100,
          percentualServicos:
            (totalServicos / (totalProdutos + totalServicos || 1)) * 100,
          totalQuantidadeProdutos,
          totalQuantidadeServicos,
        },
        rankings: {
          produtosPorQuantidade: topProdutosPorQuantidade,
          produtosPorValor: topProdutosPorValor,
          servicosPorQuantidade: topServicosPorQuantidade,
          servicosPorValor: topServicosPorValor,
        },
        // Raw data para uso avançado
        rawData: rawResults,
      };
    } catch (error: any) {
      console.error(
        "Erro ao obter estatísticas de itens mais vendidos:",
        error
      );
      throw new Error(
        `Falha ao processar dados para dashboard: ${error.message}`
      );
    }
  }

  /**
   * Retorna vendas e despesas dos últimos 12 meses agrupadas por mês
   * @param companyId - ID da empresa para filtrar os dados
   * @returns Objeto com meses, vendas e despesas
   */
  async getMonthlySalesAndExpenses(companyId?: number): Promise<any> {
    try {
      // Validar companyId para evitar NaN ou undefined
      const validCompanyId =
        companyId && !isNaN(Number(companyId)) ? Number(companyId) : null;
      const companyFilter = validCompanyId
        ? `AND "companyId" = ${validCompanyId}`
        : "";

      // Query para vendas dos últimos 12 meses
      // Soma os totais igual ao dashboard (totalEsseMes e totalHoje)
      const vendasQuery = `
        SELECT 
          TO_CHAR(created_at, 'Mon') as mes,
          EXTRACT(MONTH FROM created_at) as mes_num,
          EXTRACT(YEAR FROM created_at) as ano,
          COALESCE(SUM(CAST(total AS NUMERIC)), 0) as total_vendas
        FROM venda
        WHERE created_at >= NOW() - INTERVAL '12 months'
          AND deleted_at IS NULL
          ${companyFilter}
        GROUP BY mes, mes_num, ano
        ORDER BY ano, mes_num
      `;

      // Query para despesas dos últimos 12 meses
      const despesasQuery = `
        SELECT 
          TO_CHAR(created_at, 'Mon') as mes,
          EXTRACT(MONTH FROM created_at) as mes_num,
          EXTRACT(YEAR FROM created_at) as ano,
          COALESCE(SUM(valor), 0) as total_despesas
        FROM despesa
        WHERE created_at >= NOW() - INTERVAL '12 months'
          ${companyFilter}
        GROUP BY mes, mes_num, ano
        ORDER BY ano, mes_num
      `;

      const [vendasData, despesasData] = await Promise.all([
        this.uow.vendaRepository.query(vendasQuery),
        this.uow.vendaRepository.query(despesasQuery),
      ]);

      // Criar mapa dos últimos 12 meses
      const mesesMap = new Map();
      const mesesNomes = [
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
      ];

      // Inicializar últimos 12 meses com valores zerados
      for (let i = 11; i >= 0; i--) {
        const date = moment().subtract(i, "months");
        const mesNum = date.month() + 1;
        const ano = date.year();
        const mesNome = mesesNomes[date.month()];
        const key = `${ano}-${mesNum}`;
        mesesMap.set(key, {
          mes: mesNome,
          mesNum,
          ano,
          vendas: 0,
          despesas: 0,
        });
      }

      // Preencher vendas - garantindo conversão numérica igual ao dashboard
      vendasData.forEach((row: any) => {
        const key = `${row.ano}-${row.mes_num}`;
        if (mesesMap.has(key)) {
          const total = parseFloat(row.total_vendas) || 0;
          // Garantir que não seja NaN, igual ao dashboard
          mesesMap.get(key).vendas = isNaN(total) ? 0 : total;
        }
      });

      // Preencher despesas - garantindo conversão numérica
      despesasData.forEach((row: any) => {
        const key = `${row.ano}-${row.mes_num}`;
        if (mesesMap.has(key)) {
          const total = parseFloat(row.total_despesas) || 0;
          // Garantir que não seja NaN
          mesesMap.get(key).despesas = isNaN(total) ? 0 : total;
        }
      });

      // Converter para arrays ordenados
      const meses = Array.from(mesesMap.values()).map((m) => m.mes);
      const vendas = Array.from(mesesMap.values()).map((m) => m.vendas);
      const despesas = Array.from(mesesMap.values()).map((m) => m.despesas);

      return {
        meses,
        vendas,
        despesas,
      };
    } catch (error: any) {
      console.error("Erro ao buscar dados mensais:", error);
      throw new Error(`Falha ao processar dados mensais: ${error.message}`);
    }
  }

  /**
   * Retorna quantidade de currículos criados por mês dos últimos 12 meses
   * @param companyId - ID da empresa para filtrar os dados
   * @returns Objeto com meses e quantidade de currículos
   */
  async getMonthlyCurriculums(companyId?: number): Promise<any> {
    try {
      // Validar companyId para evitar NaN ou undefined
      const validCompanyId =
        companyId && !isNaN(Number(companyId)) ? Number(companyId) : null;
      const companyFilter = validCompanyId
        ? `AND "companyId" = ${validCompanyId}`
        : "";

      // Query para currículos dos últimos 12 meses
      const curriculumsQuery = `
        SELECT 
          TO_CHAR(created_at, 'Mon') as mes,
          EXTRACT(MONTH FROM created_at) as mes_num,
          EXTRACT(YEAR FROM created_at) as ano,
          COUNT(*)::integer as total_curriculos
        FROM curriculum
        WHERE created_at >= NOW() - INTERVAL '12 months'
          ${companyFilter}
        GROUP BY mes, mes_num, ano
        ORDER BY ano, mes_num
      `;

      const curriculumsData = await this.uow.curriculumRepository.query(
        curriculumsQuery
      );

      console.log("Currículos encontrados:", curriculumsData);
      console.log("Total de registros retornados:", curriculumsData.length);
      console.log("CompanyId usado:", validCompanyId);

      // Log total de currículos para debug - SEM filtro de data
      const totalQueryAll = `
        SELECT COUNT(*)::integer as total
        FROM curriculum
        ${validCompanyId ? `WHERE "companyId" = ${validCompanyId}` : ""}
      `;
      const totalResultAll = await this.uow.curriculumRepository.query(
        totalQueryAll
      );
      console.log(
        "Total de currículos (TODOS, sem filtro de data):",
        totalResultAll[0]?.total || 0
      );

      // Log total de currículos dos últimos 12 meses
      const totalQuery = `
        SELECT COUNT(*)::integer as total
        FROM curriculum
        WHERE created_at >= NOW() - INTERVAL '12 months'
          ${companyFilter}
      `;
      const totalResult = await this.uow.curriculumRepository.query(totalQuery);
      console.log(
        "Total de currículos (últimos 12 meses):",
        totalResult[0]?.total || 0
      );

      // Log para verificar distribuição por ano
      const yearDistributionQuery = `
        SELECT 
          EXTRACT(YEAR FROM created_at) as ano,
          COUNT(*)::integer as total
        FROM curriculum
        ${validCompanyId ? `WHERE "companyId" = ${validCompanyId}` : ""}
        GROUP BY ano
        ORDER BY ano
      `;
      const yearDistribution = await this.uow.curriculumRepository.query(
        yearDistributionQuery
      );
      console.log("Distribuição por ano:", yearDistribution);

      // Criar mapa dos últimos 12 meses
      const mesesMap = new Map();
      const mesesNomes = [
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
      ];

      // Inicializar últimos 12 meses com valores zerados
      for (let i = 11; i >= 0; i--) {
        const date = moment().subtract(i, "months");
        const mesNum = date.month() + 1;
        const ano = date.year();
        const mesNome = mesesNomes[date.month()];
        const key = `${ano}-${mesNum}`;
        mesesMap.set(key, {
          mes: mesNome,
          mesNum,
          ano,
          curriculos: 0,
        });
      }

      // Preencher currículos
      curriculumsData.forEach((row: any) => {
        const key = `${row.ano}-${row.mes_num}`;
        if (mesesMap.has(key)) {
          mesesMap.get(key).curriculos = parseInt(row.total_curriculos) || 0;
        }
      });

      // Converter para arrays ordenados
      const meses = Array.from(mesesMap.values()).map((m) => m.mes);
      const curriculos = Array.from(mesesMap.values()).map((m) => m.curriculos);

      return {
        meses,
        curriculos,
      };
    } catch (error: any) {
      console.error("Erro ao buscar dados de currículos:", error);
      throw new Error(
        `Falha ao processar dados de currículos: ${error.message}`
      );
    }
  }
}
