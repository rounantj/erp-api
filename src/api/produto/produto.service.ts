import { Produto } from "@/domain/entities/produtos.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";

@Injectable()
export class ProdutoService {
  constructor(private uow: UnitOfWorkService) {}

  async upsert(produto: Produto) {
    return await this.uow.produtoRepository.save(produto);
  }

  async save(produtos: Produto[]) {
    return await this.uow.produtoRepository.save(produtos);
  }
  async getAll() {
    return await this.uow.produtoRepository.find();
  }
  async getOne(produtoId: number): Promise<Produto> {
    return await this.uow.produtoRepository.findOne({
      where: {
        id: produtoId,
      },
    });
  }
  async delete(produtoId: number) {
    return await this.uow.produtoRepository.delete(produtoId);
  }
  async processExcelData(data: any[]): Promise<any> {
    const results: Produto[] = [];

    for (const item of data) {
      let existingProduct = (await this.getOne(item.id)) ?? ({} as Produto);
      if (existingProduct) {
        // Atualizar o produto existente
        existingProduct = { ...existingProduct, ...item };
      }
      const updatedProduct = await this.upsert(existingProduct);
      results.push(updatedProduct);
    }
    return results;
  }
}
