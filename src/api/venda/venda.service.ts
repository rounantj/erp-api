import { Venda } from "@/domain/entities/vendas.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";

@Injectable()
export class VendasService {
  constructor(private uow: UnitOfWorkService) {}

  async create(venda: Venda) {
    return await this.uow.vendaRepository.create(venda);
  }
  async getAll() {
    return await this.uow.vendaRepository.find();
  }
  async getOne(vendaId: number) {
    return await this.uow.vendaRepository.findOne({
      where: {
        id: vendaId,
      },
    });
  }
  async delete(vendaId: number) {
    return await this.uow.vendaRepository.delete(vendaId);
  }
}
