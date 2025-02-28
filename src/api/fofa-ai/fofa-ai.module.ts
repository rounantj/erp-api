import { Module } from "@nestjs/common";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { FofaAiService } from "./fofa-ai.service";
import { FofaAiController } from "./fofa-ai.controller";
import { ConfigService } from "@nestjs/config";

@Module({
  providers: [FofaAiService, UnitOfWorkService, ConfigService],
  controllers: [FofaAiController],
})
export class FofaAi {}
