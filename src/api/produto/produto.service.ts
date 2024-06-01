import { Produto } from "@/domain/entities/produtos.entity";
import { Venda } from "@/domain/entities/vendas.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";

@Injectable()
export class ProdutoService {
  constructor(private uow: UnitOfWorkService) {}

  async create(produto: Produto) {
    return await this.uow.vendaRepository.create(produto);
  }
  async getAll() {
    return await this.uow.vendaRepository.find();
  }
  async getOne(produtoId: number) {
    return await this.uow.vendaRepository.findOne({
      where: {
        id: produtoId,
      },
    });
  }
  async delete(produtoId: number) {
    return await this.uow.vendaRepository.delete(produtoId);
  }
}
