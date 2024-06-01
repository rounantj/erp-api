import { Module } from "@nestjs/common";
import { ProdutoController } from "./produto.controller";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { ProdutoService } from "./produto.service";

@Module({
  providers: [ProdutoService, UnitOfWorkService],
  controllers: [ProdutoController],
})
export class ProdutosModule {}
