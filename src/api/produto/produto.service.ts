import { Produto } from "@/domain/entities/produtos.entity";
import { User } from "@/domain/entities/user.entity";
import { lastedProds } from "@/helpers/prds";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";
import { IsNull, Not, ILike } from "typeorm";

export interface SearchProductsParams {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
  companyId?: number;
}

export interface SearchProductsResult {
  data: Produto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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

  async search(params: SearchProductsParams): Promise<SearchProductsResult> {
    const { search, category, page = 1, limit = 30, companyId } = params;
    const skip = (page - 1) * limit;

    const queryBuilder = this.uow.produtoRepository
      .createQueryBuilder("produto")
      .where("produto.deletedAt IS NULL");

    // Filtrar por companyId se fornecido
    if (companyId) {
      queryBuilder.andWhere("produto.companyId = :companyId", { companyId });
    }

    // Filtro por busca (descrição, id, ean)
    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      queryBuilder.andWhere(
        "(LOWER(produto.descricao) LIKE :search OR CAST(produto.id AS TEXT) LIKE :search OR produto.ean LIKE :search)",
        { search: searchTerm }
      );
    }

    // Filtro por categoria
    if (category && category !== "todos") {
      if (category.toLowerCase() === "produtos") {
        queryBuilder.andWhere(
          "(LOWER(produto.categoria) = :cat1 OR LOWER(produto.categoria) = :cat2)",
          { cat1: "produto", cat2: "produtos" }
        );
      } else if (
        category.toLowerCase() === "serviços" ||
        category.toLowerCase() === "servicos"
      ) {
        queryBuilder.andWhere(
          "(LOWER(produto.categoria) = :cat1 OR LOWER(produto.categoria) = :cat2 OR LOWER(produto.categoria) = :cat3 OR LOWER(produto.categoria) = :cat4)",
          {
            cat1: "serviço",
            cat2: "serviços",
            cat3: "servico",
            cat4: "servicos",
          }
        );
      } else {
        queryBuilder.andWhere("LOWER(produto.categoria) = :category", {
          category: category.toLowerCase(),
        });
      }
    }

    // Ordenação e paginação
    queryBuilder.orderBy("produto.updatedAt", "DESC").skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    // Buscar imagens da tabela product_images para produtos sem imageUrl
    const produtosSemImagem = data.filter(p => !p.imageUrl && p.ean);
    if (produtosSemImagem.length > 0) {
      const eans = produtosSemImagem.map(p => p.ean);
      const imagens = await this.uow.productImagesRepository.find({
        where: eans.map(ean => ({ ean })),
      });

      // Mapear imagens por EAN
      const imagensPorEan = new Map(imagens.map(img => [img.ean, img.base_64]));

      // Atribuir imagens aos produtos
      data.forEach(produto => {
        if (!produto.imageUrl && produto.ean && imagensPorEan.has(produto.ean)) {
          produto.imageUrl = imagensPorEan.get(produto.ean);
        }
      });
    }

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAll(companyId?: number) {
    const where: any = {
      deletedAt: IsNull(),
    };

    if (companyId) {
      where.companyId = companyId;
    }

    const produtos = await this.uow.produtoRepository.find({
      where,
      order: {
        updatedAt: "DESC",
      },
    });

    // Buscar imagens da tabela product_images para produtos sem imageUrl
    const produtosSemImagem = produtos.filter(p => !p.imageUrl && p.ean);
    if (produtosSemImagem.length > 0) {
      const eans = produtosSemImagem.map(p => p.ean);
      const imagens = await this.uow.productImagesRepository.find({
        where: eans.map(ean => ({ ean })),
      });

      // Mapear imagens por EAN
      const imagensPorEan = new Map(imagens.map(img => [img.ean, img.base_64]));

      // Atribuir imagens aos produtos
      produtos.forEach(produto => {
        if (!produto.imageUrl && produto.ean && imagensPorEan.has(produto.ean)) {
          produto.imageUrl = imagensPorEan.get(produto.ean);
        }
      });
    }

    return produtos;
  }
  async getOne(produtoId: number): Promise<Produto> {
    return await this.uow.produtoRepository.findOne({
      where: {
        id: produtoId,
      },
    });
  }

  // Buscar produto por código de barras (EAN) ou ID
  async findByCode(code: string, companyId?: number): Promise<Produto | null> {
    const cleanCode = code.toString().trim();
    console.log(
      `🔍 Buscando produto por código: "${cleanCode}" (companyId: ${companyId})`
    );

    // Verificar se é um ID válido (número pequeno, até 10 dígitos e menor que MAX_SAFE_INTEGER)
    const parsedId = parseInt(cleanCode);
    const isValidId =
      !isNaN(parsedId) &&
      parsedId > 0 &&
      parsedId <= 2147483647 &&
      cleanCode.length <= 10;

    // Primeiro tenta buscar por ID (apenas se for um número válido para integer)
    if (isValidId) {
      const whereById: any = {
        id: parsedId,
        deletedAt: IsNull(),
      };
      if (companyId) {
        whereById.companyId = companyId;
      }

      const byId = await this.uow.produtoRepository.findOne({
        where: whereById,
      });

      if (byId) {
        console.log(`✅ Produto encontrado por ID: ${byId.descricao}`);
        // Buscar imagem se não tiver
        if (!byId.imageUrl && byId.ean) {
          const imagem = await this.uow.productImagesRepository.findOne({
            where: { ean: byId.ean },
          });
          if (imagem) {
            byId.imageUrl = imagem.base_64;
          }
        }
        return byId;
      }
    }

    // Busca por EAN (exato)
    const whereByEan: any = {
      ean: cleanCode,
      deletedAt: IsNull(),
    };
    if (companyId) {
      whereByEan.companyId = companyId;
    }

    const byEan = await this.uow.produtoRepository.findOne({
      where: whereByEan,
    });

    if (byEan) {
      console.log(`✅ Produto encontrado por EAN: ${byEan.descricao}`);
      // Buscar imagem se não tiver
      if (!byEan.imageUrl && byEan.ean) {
        const imagem = await this.uow.productImagesRepository.findOne({
          where: { ean: byEan.ean },
        });
        if (imagem) {
          byEan.imageUrl = imagem.base_64;
        }
      }
      return byEan;
    }

    // Tenta buscar por EAN com LIKE (caso tenha espaços ou zeros à esquerda)
    const queryBuilder = this.uow.produtoRepository
      .createQueryBuilder("produto")
      .where("produto.deletedAt IS NULL")
      .andWhere("(produto.ean LIKE :code OR TRIM(produto.ean) = :cleanCode)", {
        code: `%${cleanCode}%`,
        cleanCode: cleanCode,
      });

    if (companyId) {
      queryBuilder.andWhere("produto.companyId = :companyId", { companyId });
    }

    const byEanLike = await queryBuilder.getOne();

    if (byEanLike) {
      console.log(
        `✅ Produto encontrado por EAN (LIKE): ${byEanLike.descricao}`
      );
      // Buscar imagem se não tiver
      if (!byEanLike.imageUrl && byEanLike.ean) {
        const imagem = await this.uow.productImagesRepository.findOne({
          where: { ean: byEanLike.ean },
        });
        if (imagem) {
          byEanLike.imageUrl = imagem.base_64;
        }
      }
      return byEanLike;
    }

    console.log(`❌ Produto não encontrado com código: "${cleanCode}"`);
    return null;
  }
  async delete(produto: any) {
    const id = Number(produto?.produtoId);
    const prd: Produto = { id, deletedAt: new Date() } as Produto;
    return await this.uow.produtoRepository.delete(prd.id);
  }

  /**
   * Atualiza a URL da imagem do produto
   */
  async updateImageUrl(productId: number, imageUrl: string): Promise<Produto> {
    const produto = await this.getOne(productId);
    if (!produto) {
      throw new Error("Produto não encontrado");
    }
    
    produto.imageUrl = imageUrl;
    produto.updatedAt = new Date();
    
    return await this.uow.produtoRepository.save(produto);
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
