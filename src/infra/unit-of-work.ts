import { Caixa } from "@/domain/entities/caixa.entity";
import { CompanySetup } from "@/domain/entities/company-setup.entity";
import { Company } from "@/domain/entities/company.entity";
import { Despesa } from "@/domain/entities/despesas.entity";
import { MovimentacaoCaixa } from "@/domain/entities/movimentacao_caixa.entity";
import { ProductImages } from "@/domain/entities/product_image.entity";
import { Produto } from "@/domain/entities/produtos.entity";
import { User } from "@/domain/entities/user.entity";
import { Venda } from "@/domain/entities/vendas.entity";
import { Injectable } from "@nestjs/common";
import { Repository, EntityManager, QueryRunner, DataSource } from "typeorm";

@Injectable()
export class UnitOfWorkService {
  private queryRunner: QueryRunner | null = null;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly dataSource: DataSource
  ) {}

  // Métodos de transação
  async startTransaction(): Promise<void> {
    this.queryRunner = this.dataSource.createQueryRunner();
    await this.queryRunner.connect();
    await this.queryRunner.startTransaction();
  }

  async commitTransaction(): Promise<void> {
    if (this.queryRunner) {
      await this.queryRunner.commitTransaction();
      await this.queryRunner.release();
      this.queryRunner = null;
    }
  }

  async rollbackTransaction(): Promise<void> {
    if (this.queryRunner) {
      await this.queryRunner.rollbackTransaction();
      await this.queryRunner.release();
      this.queryRunner = null;
    }
  }

  // Helpers para obter o EntityManager correto
  private getManager(): EntityManager {
    return this.queryRunner?.manager || this.entityManager;
  }

  // Repositórios
  get companyRepository(): Repository<Company> {
    return this.getManager().getRepository(Company);
  }

  get companySetupRepository(): Repository<CompanySetup> {
    return this.getManager().getRepository(CompanySetup);
  }

  get vendaRepository(): Repository<Venda> {
    return this.getManager().getRepository(Venda);
  }

  get despesaRepository(): Repository<Despesa> {
    return this.getManager().getRepository(Despesa);
  }

  get produtoRepository(): Repository<Produto> {
    return this.getManager().getRepository(Produto);
  }

  get userRepository(): Repository<User> {
    return this.getManager().getRepository(User);
  }

  get productImagesRepository(): Repository<ProductImages> {
    return this.getManager().getRepository(ProductImages);
  }

  get movimentacaoCaixaRepository(): Repository<MovimentacaoCaixa> {
    return this.getManager().getRepository(MovimentacaoCaixa);
  }

  get caixaRepository(): Repository<Caixa> {
    return this.getManager().getRepository(Caixa);
  }
}
