import { Produto } from "@/domain/entities/produtos.entity";
import { User } from "@/domain/entities/user.entity";
import { lastedProds } from "@/helpers/prds";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";
import { IsNull, Not } from "typeorm";

@Injectable()
export class ProdutoService {
  constructor(private uow: UnitOfWorkService) {}

  async upsert(produto: Produto) {
    produto.updatedAt = new Date();
    if (!produto.companyId) produto.companyId = 1;
    return await this.uow.produtoRepository.save(produto);
  }

  async save(produtos: Produto[]) {
    return await this.uow.produtoRepository.save(produtos);
  }
  async getAll() {
    return await this.uow.produtoRepository.find({
      where: {
        deletedAt: IsNull(),
      },
      order: {
        updatedAt: "DESC",
      },
    });
  }
  async getOne(produtoId: number): Promise<Produto> {
    return await this.uow.produtoRepository.findOne({
      where: {
        id: produtoId,
      },
    });
  }
  async delete(produto: any) {
    const id = Number(produto?.produtoId);
    const prd: Produto = { id, deletedAt: new Date() } as Produto;
    return await this.uow.produtoRepository.delete(prd.id);
  }

  async processExcelData(data: any[]): Promise<any> {
    const results: Produto[] = [];
    let index = 0;
    for (const item of data) {
      index++;
      let existingProduct = null;
      if (item?.id) {
        existingProduct = await this.getOne(item.id);
      }
      if (!existingProduct) {
        existingProduct = item;
      }
      if (existingProduct) {
        // Atualizar o produto existente
        existingProduct = { ...existingProduct, ...item };
      }
      const updatedProduct = await this.upsert(existingProduct);
      console.log({ tudo: data.length, index, name: updatedProduct.descricao });
      results.push(updatedProduct);
    }
    return results;
  }

  async mapPayloadToProduto(
    payload: {
      id: string;
      codigo: string;
      descricao: string;
      codigoDeBarras: string;
      valorUnitario: number;
      unidadeComercial: string;
      ncm: string;
    },
    companyId: number,
    user: User
  ) {
    const produto: any = {};

    // Usando o código como ID conforme solicitado
    produto.id = null;

    produto.descricao = payload.descricao;
    produto.valor = payload.valorUnitario;
    produto.companyId = companyId;
    produto.ean = payload.codigoDeBarras;
    produto.ncm = payload.ncm;

    // Categoria pode ser derivada da unidade comercial ou deixada vazia
    produto.categoria = payload.unidadeComercial || null;

    // Campos de auditoria
    produto.createdAt = new Date();
    produto.updatedAt = new Date();
    produto.createdByUser = +user.id.toString();
    produto.updatedByUser = +user.id.toString();

    return produto;
  }

  async processarProdutos(
    payloads: Array<{
      id: string;
      codigo: string;
      descricao: string;
      codigoDeBarras: string;
      valorUnitario: number;
      unidadeComercial: string;
      ncm: string;
    }>,
    companyId: number,
    userId: string
  ): Promise<any[]> {
    const produtos: any[] = [];
    const user = await this.uow.userRepository.findOne({
      where: { id: +userId },
    });
    for (const payload of payloads) {
      const produto = await this.mapPayloadToProduto(payload, companyId, user);
      produtos.push(produto);
    }

    return produtos;
  }

  async createOrUpdateFromPayload() {
    const payloads: any[] = lastedProds,
      companyId: number = 1,
      userId: string = "1";
    const dbProducts = await this.getAll();

    const produtos = await this.processarProdutos(payloads, companyId, userId);
    const uniquePrds = produtos.filter((prd) => {
      return !dbProducts.some(
        (dbPrd) => dbPrd.ean === prd.ean || dbPrd.descricao === prd.descricao
      );
    });
    uniquePrds.forEach((prd) => {
      if (!prd.id || isNaN(prd.id)) {
        prd.id = null;
      }
    });
    await this.save(uniquePrds);
    return produtos.length;
  }
}
