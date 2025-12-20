import { MovimentacaoCaixa } from "@/domain/entities/movimentacao_caixa.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";
import { IsNull, Not } from "typeorm";

@Injectable()
export class MovimentacaoService {
  constructor(private uow: UnitOfWorkService) {}

  async upsert(movimentacao: MovimentacaoCaixa, companyId?: number) {
    if (!movimentacao.caixa_id) return null;

    if (companyId) {
      movimentacao.companyId = companyId;
    } else if (!movimentacao.companyId) {
      movimentacao.companyId = 1; // fallback para compatibilidade
    }

    return await this.uow.movimentacaoCaixaRepository.save(movimentacao);
  }

  async save(movimentacaos: MovimentacaoCaixa[]) {
    return await this.uow.movimentacaoCaixaRepository.save(movimentacaos);
  }
  async getAll(companyId?: number) {
    const where: any = {
      deletedAt: IsNull(),
    };

    if (companyId) {
      where.companyId = companyId;
    }

    return await this.uow.movimentacaoCaixaRepository.find({
      where,
      order: {
        createdAt: "DESC",
      },
    });
  }
  async getOne(movimentacaoId: number): Promise<MovimentacaoCaixa> {
    return await this.uow.movimentacaoCaixaRepository.findOne({
      where: {
        id: movimentacaoId,
      },
    });
  }
  async delete(movimentacaoId: any) {
    const id = Number(movimentacaoId);
    const prd: MovimentacaoCaixa = {
      id,
      deletedAt: new Date(),
    } as MovimentacaoCaixa;
    return await this.uow.movimentacaoCaixaRepository.delete(prd.id);
  }
}
