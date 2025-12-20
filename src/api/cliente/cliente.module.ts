import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Cliente } from "@/domain/entities/cliente.entity";
import { ClienteController } from "./cliente.controller";
import { ClienteService } from "./cliente.service";
import { UnitOfWorkService } from "@/infra/unit-of-work";

@Module({
  imports: [TypeOrmModule.forFeature([Cliente])],
  controllers: [ClienteController],
  providers: [ClienteService, UnitOfWorkService],
  exports: [ClienteService],
})
export class ClienteModule {}
