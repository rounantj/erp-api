import { Module } from "@nestjs/common";
import { AuthModule } from "./api/auth/auth.module";
import { HealthModule } from "./api/health/health.module";
import { CustomTypeOrmModule } from "./api/config/custom-typpeorm.module";
import { typeormConfig } from "./api/config/typeorm.config";
import { CompaniesModule } from "./api/companies/companies.module";
import { UsersModule } from "./api/users/users.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UnitOfWorkService } from "./infra/unit-of-work";
import { ProductImagesModule } from "./api/product_images/product_images.module";
import { VendasModule } from "./api/venda/venda.module";
import { ProdutosModule } from "./api/produto/produto.module";
import { DespesaModule } from "./api/despesa/despesa.module";

@Module({
  imports: [
    TypeOrmModule.forRoot(typeormConfig()),
    CustomTypeOrmModule,
    AuthModule,
    CompaniesModule,
    UsersModule,
    DespesaModule,
    HealthModule,
    VendasModule,
    ProdutosModule,
    ProductImagesModule,
  ],
  controllers: [],
  providers: [UnitOfWorkService],
})
export class AppModule {}
