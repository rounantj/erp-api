import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WhatsappDb } from "./whatsapp-db";
import { whatsappConfig } from "./whatsapp.config";

export interface JobContext {
  id: string;
  attempts: number;
  isLastAttempt: boolean;
}

type Handler = (payload: any, ctx: JobContext) => Promise<unknown>;

export interface EnqueueOptions {
  delayMs?: number;
  dedupKey?: string;
  // Jobs com o mesmo group_key nunca rodam ao mesmo tempo (ex.: respostas da IA de uma conversa).
  groupKey?: string;
  maxAttempts?: number;
  // Com dedupKey: se já existe um job pendente, empurra o horário de execução (debounce).
  extendDelay?: boolean;
}

const POLL_INTERVAL_MS = 1000;
const STALE_AFTER_MINUTES = 10;
const BACKOFF_MS = [5_000, 15_000, 60_000, 180_000, 600_000];

// Fila de jobs sobre Postgres: o erp-api não tem Redis e roda num único dyno.
// Jobs sobrevivem a reinícios do dyno; um job "running" esquecido volta para a fila após STALE_AFTER_MINUTES.
@Injectable()
export class JobQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("WhatsappJobs");
  private readonly handlers = new Map<string, Handler>();
  private readonly periodic: { everyMs: number; fn: () => Promise<void>; lastRun: number }[] = [];
  private timer: NodeJS.Timeout | null = null;
  private active = 0;
  private polling = false;
  private stopping = false;

  constructor(private readonly db: WhatsappDb) {}

  register(type: string, handler: Handler) {
    this.handlers.set(type, handler);
  }

  every(everyMs: number, fn: () => Promise<void>) {
    this.periodic.push({ everyMs, fn, lastRun: 0 });
  }

  async enqueue(type: string, payload: unknown, options: EnqueueOptions = {}): Promise<void> {
    const delay = Math.max(0, options.delayMs ?? 0);
    const params = [type, JSON.stringify(payload ?? {}), options.dedupKey ?? null, options.groupKey ?? null, delay, options.maxAttempts ?? 3];
    if (!options.dedupKey) {
      await this.db.query(
        `INSERT INTO whatsapp_jobs (type, payload, dedup_key, group_key, run_at, max_attempts)
         VALUES ($1, $2, $3, $4, NOW() + make_interval(secs => $5::float / 1000), $6)`,
        params
      );
      return;
    }
    const onConflict = options.extendDelay
      ? `DO UPDATE SET run_at = GREATEST(whatsapp_jobs.run_at, EXCLUDED.run_at), payload = EXCLUDED.payload`
      : `DO NOTHING`;
    await this.db.query(
      `INSERT INTO whatsapp_jobs (type, payload, dedup_key, group_key, run_at, max_attempts)
       VALUES ($1, $2, $3, $4, NOW() + make_interval(secs => $5::float / 1000), $6)
       ON CONFLICT (dedup_key) WHERE status = 'pending' AND dedup_key IS NOT NULL ${onConflict}`,
      params
    );
  }

  onModuleInit() {
    if (!whatsappConfig.jobsEnabled) {
      this.logger.log("Processamento de jobs do WhatsApp desligado (WHATSAPP_JOBS_ENABLED != true)");
      return;
    }
    this.every(60_000, () => this.recoverStale());
    this.every(6 * 3600_000, () => this.cleanup());
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.logger.log(`Processamento de jobs do WhatsApp ligado (concorrência ${whatsappConfig.jobConcurrency})`);
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.polling || this.stopping) return;
    this.polling = true;
    try {
      const now = Date.now();
      for (const task of this.periodic) {
        if (now - task.lastRun >= task.everyMs) {
          task.lastRun = now;
          task.fn().catch((err) => this.logger.error(`Tarefa periódica falhou: ${err?.message}`));
        }
      }
      const free = whatsappConfig.jobConcurrency - this.active;
      if (free <= 0) return;
      const { rows } = await this.db.query(
        `UPDATE whatsapp_jobs j SET status = 'running', locked_at = NOW(), attempts = j.attempts + 1
         WHERE j.id IN (
           SELECT c.id FROM whatsapp_jobs c
           WHERE c.status = 'pending' AND c.run_at <= NOW()
             AND (c.group_key IS NULL OR NOT EXISTS (
               SELECT 1 FROM whatsapp_jobs r WHERE r.status = 'running' AND r.group_key = c.group_key))
           ORDER BY c.run_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED)
         RETURNING j.id, j.type, j.payload, j.attempts, j.max_attempts`,
        [free]
      );
      for (const job of rows) {
        this.active++;
        void this.run(job).finally(() => this.active--);
      }
    } catch (err: any) {
      this.logger.error(`Falha ao buscar jobs: ${err?.message}`);
    } finally {
      this.polling = false;
    }
  }

  private async run(job: { id: string; type: string; payload: any; attempts: number; max_attempts: number }) {
    const handler = this.handlers.get(job.type);
    const isLastAttempt = job.attempts >= job.max_attempts;
    try {
      if (!handler) throw new Error(`Sem handler para o job ${job.type}`);
      const result = await handler(job.payload, { id: String(job.id), attempts: job.attempts, isLastAttempt });
      await this.db.query(
        `UPDATE whatsapp_jobs SET status = 'done', finished_at = NOW(), result = $2, last_error = NULL WHERE id = $1`,
        [job.id, result === undefined ? null : JSON.stringify(result)]
      );
    } catch (err: any) {
      const message = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : String(err?.message || err);
      this.logger.warn(`Job ${job.type}#${job.id} falhou (tentativa ${job.attempts}/${job.max_attempts}): ${message}`);
      const backoff = BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)];
      await this.db
        .query(
          `UPDATE whatsapp_jobs
           SET status = CASE WHEN $3 THEN 'failed' ELSE 'pending' END,
               run_at = NOW() + make_interval(secs => $4::float / 1000),
               last_error = $2, locked_at = NULL, finished_at = CASE WHEN $3 THEN NOW() ELSE NULL END
           WHERE id = $1`,
          [job.id, message, isLastAttempt, backoff]
        )
        .catch((e: any) => this.logger.error(`Não foi possível registrar a falha do job ${job.id}: ${e?.message}`));
    }
  }

  private async recoverStale() {
    await this.db.query(
      `UPDATE whatsapp_jobs
       SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
           locked_at = NULL, last_error = COALESCE(last_error, 'interrompido (reinício do servidor)')
       WHERE status = 'running' AND locked_at < NOW() - make_interval(mins => $1)`,
      [STALE_AFTER_MINUTES]
    );
  }

  private async cleanup() {
    await this.db.query(
      `DELETE FROM whatsapp_jobs WHERE status IN ('done', 'failed') AND finished_at < NOW() - INTERVAL '30 days'`
    );
  }
}
