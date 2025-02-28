import { Module } from "@nestjs/common";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { CaixaService } from "./caixa.service";
import { CaixaController } from "./caixa.controller";

@Module({
  providers: [CaixaService, UnitOfWorkService],
  controllers: [CaixaController],
})
export class CaixaModule {}
