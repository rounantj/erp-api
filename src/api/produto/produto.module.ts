import { Module } from "@nestjs/common";
import { ProdutoController } from "./produto.controller";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { ProdutoService } from "./produto.service";
import { StorageService } from "@/infra/storage.service";

@Module({
  providers: [ProdutoService, UnitOfWorkService, StorageService],
  controllers: [ProdutoController],
})
export class ProdutosModule {}
