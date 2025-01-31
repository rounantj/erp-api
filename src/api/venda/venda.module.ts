import { Module } from "@nestjs/common";
import { VendasController } from "./venda.controller";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { VendasService } from "./venda.service";

@Module({
  providers: [VendasService, UnitOfWorkService],
  controllers: [VendasController],
})
export class VendasModule {}
