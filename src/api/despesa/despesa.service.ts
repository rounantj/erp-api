import { Despesa } from "@/domain/entities/despesas.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";
import { IsNull, Not } from "typeorm";

@Injectable()
export class DespesaService {
  constructor(private uow: UnitOfWorkService) {}

  async upsert(despesa: Despesa) {
    despesa.updatedAt = new Date();
    if (!despesa.companyId) despesa.companyId = 1;
    return await this.uow.despesaRepository.save(despesa);
  }

  async save(despesas: Despesa[]) {
    return await this.uow.despesaRepository.save(despesas);
  }
  async getAll() {
    return await this.uow.despesaRepository.find({
      where: {
        deletedAt: IsNull(),
      },
      order: {
        updatedAt: "DESC",
      },
    });
  }
  async getOne(despesaId: number): Promise<Despesa> {
    return await this.uow.despesaRepository.findOne({
      where: {
        id: despesaId,
      },
    });
  }
  async delete(despesa: any) {
    const id = Number(despesa?.id);
    const prd: Despesa = { id, deletedAt: new Date() } as Despesa;
    return await this.uow.despesaRepository.delete(prd.id);
  }
}
