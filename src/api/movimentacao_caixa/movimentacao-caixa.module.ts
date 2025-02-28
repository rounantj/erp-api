import { Module } from "@nestjs/common";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { MovimentacaoService } from "./movimentacao-caixa.service";
import { MovimentacaoCaixaController } from "./movimentacao-caixa.controller";

@Module({
  providers: [MovimentacaoService, UnitOfWorkService],
  controllers: [MovimentacaoCaixaController],
})
export class MovimentacaoCaixaModule {}
