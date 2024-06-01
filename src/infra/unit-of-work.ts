import { Company } from "@/domain/entities/company.entity";
import { ProductImages } from "@/domain/entities/product_image.entity";
import { Produto } from "@/domain/entities/produtos.entity";
import { User } from "@/domain/entities/user.entity";
import { Venda } from "@/domain/entities/vendas.entity";
import { Injectable } from "@nestjs/common";
import { Repository, EntityManager } from "typeorm";
@Injectable()
export class UnitOfWorkService {
  constructor(private readonly entityManager: EntityManager) {}

  get companyRepository(): Repository<Company> {
    return this.entityManager.getRepository(Company);
  }

  get vendaRepository(): Repository<Venda> {
    return this.entityManager.getRepository(Venda);
  }

  get produtoRepository(): Repository<Produto> {
    return this.entityManager.getRepository(Produto);
  }

  get userRepository(): Repository<User> {
    return this.entityManager.getRepository(User);
  }

  get productImagesRepository(): Repository<ProductImages> {
    return this.entityManager.getRepository(ProductImages);
  }
}
