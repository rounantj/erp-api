import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { Pool, PoolClient, QueryResult } from "pg";

@Injectable()
export class FiscalDb {
  constructor(private readonly dataSource: DataSource) {}

  private get pool(): Pool {
    return (this.dataSource.driver as any).master as Pool;
  }

  query<T = any>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params as any[]);
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch((): undefined => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
