import { Module } from "@nestjs/common";
import { FiscalDb } from "./fiscal-db";
import { FiscalEmissionService } from "./fiscal-emission.service";
import { FiscalSettingsService } from "./fiscal-settings.service";
import { FiscalWorkerService } from "./fiscal-worker.service";
import { FiscalController } from "./fiscal.controller";

@Module({
  controllers: [FiscalController],
  providers: [FiscalDb, FiscalSettingsService, FiscalEmissionService, FiscalWorkerService],
})
export class FiscalModule {}
