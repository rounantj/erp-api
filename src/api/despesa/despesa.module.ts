import { Module } from "@nestjs/common";
import { DespesaController } from "./despesa.controller";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { DespesaService } from "./despesa.service";

@Module({
  providers: [DespesaService, UnitOfWorkService],
  controllers: [DespesaController],
})
export class DespesaModule {}
