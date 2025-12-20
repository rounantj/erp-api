import { Caixa } from "@/domain/entities/caixa.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";
import { IsNull, Not } from "typeorm";

@Injectable()
export class CaixaService {
  constructor(private uow: UnitOfWorkService) {}

  async upsert(caixa: Caixa) {
    if (!caixa.id) return null;
    return await this.uow.caixaRepository.save(caixa);
  }

  async save(movimentacaos: Caixa[]) {
    return await this.uow.caixaRepository.save(movimentacaos);
  }
  async getAll(companyId?: number) {
    const queryBuilder = this.uow.caixaRepository
      .createQueryBuilder("caixa")
      .leftJoinAndSelect("caixa.company", "company")
      .where("caixa.deletedAt IS NULL")
      .orderBy("caixa.createdAt", "DESC");

    if (companyId) {
      queryBuilder.andWhere("company.id = :companyId", { companyId });
    }

    return await queryBuilder.getMany();
  }
  async getOne(movimentacaoId: number): Promise<Caixa> {
    return await this.uow.caixaRepository.findOne({
      where: {
        id: movimentacaoId,
      },
    });
  }

  async getNoCloseds(companyId: number): Promise<Caixa[]> {
    if (!companyId) {
      throw new Error("companyId é obrigatório");
    }

    return await this.uow.caixaRepository
      .createQueryBuilder("caixa")
      .leftJoinAndSelect("caixa.company", "company")
      .where("caixa.fechamentoData IS NULL")
      .andWhere("company.id = :companyId", { companyId })
      .getMany();
  }

  async open(
    companyId: number,
    userId: number,
    valorAbertura: number
  ): Promise<Caixa> {
    if (!companyId) {
      throw new Error("companyId é obrigatório");
    }

    // Buscar a empresa no banco de dados
    const company = await this.uow.companyRepository.findOne({
      where: { id: companyId },
    });

    if (!company) {
      throw new Error("Empresa não encontrada");
    }

    // Verifica se já existe um caixa aberto para essa empresa
    const openCaixa = await this.uow.caixaRepository.findOne({
      where: { company, fechado: false },
    });

    if (openCaixa) {
      return openCaixa;
    }

    // Criar um novo caixa
    const caixa = new Caixa();
    caixa.company = company; // Passando a empresa como objeto
    caixa.aberturaData = new Date();
    caixa.saldoInicial = valorAbertura;
    caixa.saldoFinal = 0;
    caixa.fechado = false;
    caixa.fechamentoData = null;
    caixa.abertoPor = userId || null;
    caixa.fechadoPor = null;
    caixa.vendas = [];
    caixa.despesas = [];
    caixa.movimentacoes = [];

    // Salvar no banco
    const newCaixa = await this.uow.caixaRepository.save(caixa);
    return newCaixa;
  }

  async close(
    id: number,
    userId: number,
    saldoFinal: number,
    diferenca: number
  ): Promise<Caixa> {
    const openedCaixa = await this.uow.caixaRepository.findOne({
      where: { id },
    });

    if (!openedCaixa) {
      return null;
    }
    openedCaixa.saldoFinal = saldoFinal;
    openedCaixa.fechado = true;
    openedCaixa.diferenca = diferenca;
    openedCaixa.fechamentoData = new Date();
    openedCaixa.fechadoPor = userId || null;

    // Salvar no banco
    const newCaixa = await this.uow.caixaRepository.save(openedCaixa);
    return newCaixa;
  }

  async resumoVendasDoDia(caixaId: number) {
    try {
      const resumo = await this.uow.vendaRepository
        .createQueryBuilder("venda")
        .where("venda.caixaId = :caixaId", { caixaId })
        .select([
          "COALESCE(SUM(CASE WHEN venda.metodoPagamento = 'dinheiro' THEN venda.total ELSE 0 END), 0) AS dinheiro",
          "COALESCE(SUM(CASE WHEN venda.metodoPagamento = 'pix' THEN venda.total ELSE 0 END), 0) AS pix",
          "COALESCE(SUM(CASE WHEN venda.metodoPagamento = 'credito' THEN venda.total ELSE 0 END), 0) AS credito",
          "COALESCE(SUM(CASE WHEN venda.metodoPagamento = 'debito' THEN venda.total ELSE 0 END), 0) AS debito",
          "COALESCE(SUM(venda.total), 0) AS total",
          "COUNT(venda.id) AS totalVendas",
        ])
        .getRawOne();

      // Converter para números (o SQL retorna strings)
      return {
        dinheiro: parseFloat(resumo.dinheiro) || 0,
        pix: parseFloat(resumo.pix) || 0,
        credito: parseFloat(resumo.credito) || 0,
        debito: parseFloat(resumo.debito) || 0,
        total: parseFloat(resumo.total) || 0,
        totalVendas: parseInt(resumo.totalvendas) || 0,
      };
    } catch (error) {
      console.error("Erro ao buscar resumo de vendas:", error);
      throw new Error("Erro ao buscar resumo de vendas.");
    }
  }

  async delete(movimentacaoId: any) {
    const id = Number(movimentacaoId);
    const prd: Caixa = {
      id,
      deletedAt: new Date(),
    } as Caixa;
    return await this.uow.caixaRepository.delete(prd.id);
  }
}
