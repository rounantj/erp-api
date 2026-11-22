import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { FiscalEmissionService } from "./fiscal-emission.service";

// Ligado por padrão; FISCAL_JOBS_ENABLED=false desliga (ex.: API local apontando para o banco de produção).
const ENABLED = process.env.FISCAL_JOBS_ENABLED !== "false";
const INTERVAL_MS = 2 * 60 * 1000;

@Injectable()
export class FiscalWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("FiscalWorker");
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly emission: FiscalEmissionService) {}

  onApplicationBootstrap() {
    if (!ENABLED) return;
    this.timer = setInterval(() => this.tick(), INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const sent = await this.emission.transmitPendingContingency();
      if (sent) this.logger.log(`${sent} NFC-e em contingência processada(s)`);
    } catch (err: any) {
      this.logger.error(`Falha ao transmitir contingências: ${err?.message || err}`);
    } finally {
      this.running = false;
    }
  }
}
