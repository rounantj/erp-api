import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEstoqueTable1767200000000 implements MigrationInterface {
  name = "CreateEstoqueTable1767200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "estoque" (
        "id" SERIAL PRIMARY KEY,
        "companyId" INTEGER NOT NULL,
        "productId" INTEGER NOT NULL,
        "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "FK_estoque_productId_produto" FOREIGN KEY ("productId") REFERENCES "produto"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_estoque_company_product" ON "estoque" ("companyId", "productId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_estoque_companyId" ON "estoque" ("companyId")
    `);

    await queryRunner.query(`
      INSERT INTO "estoque" ("companyId", "productId", "quantity", "created_at", "updated_at")
      SELECT p."companyId", p."id", 0, NOW(), NOW()
      FROM "produto" p
      LEFT JOIN "estoque" e
        ON e."companyId" = p."companyId"
       AND e."productId" = p."id"
      WHERE e."id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_estoque_companyId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_estoque_company_product"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "estoque"`);
  }
}
