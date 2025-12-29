import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompanyIdToEntities1766238596000 implements MigrationInterface {
  name = "AddCompanyIdToEntities1766238596000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adicionar companyId na tabela venda
    await queryRunner.query(`
      ALTER TABLE "venda" ADD COLUMN IF NOT EXISTS "companyId" INTEGER NOT NULL DEFAULT 1
    `);

    // Adicionar companyId na tabela movimentacao_caixa
    await queryRunner.query(`
      ALTER TABLE "movimentacao_caixa" ADD COLUMN IF NOT EXISTS "companyId" INTEGER NOT NULL DEFAULT 1
    `);

    // Adicionar companyId na tabela product_images
    await queryRunner.query(`
      ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "companyId" INTEGER NOT NULL DEFAULT 1
    `);

    // Adicionar companyId na tabela audit_log
    await queryRunner.query(`
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "companyId" INTEGER NOT NULL DEFAULT 1
    `);

    // Criar índices para melhor performance nas queries filtradas por companyId
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_venda_companyId" ON "venda" ("companyId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_movimentacao_caixa_companyId" ON "movimentacao_caixa" ("companyId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_images_companyId" ON "product_images" ("companyId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_log_companyId" ON "audit_log" ("companyId")
    `);

    // Criar índices compostos para queries comuns
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_venda_companyId_createdAt" ON "venda" ("companyId", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_produto_companyId" ON "produto" ("companyId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_despesa_companyId" ON "despesa" ("companyId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cliente_companyId" ON "cliente" ("companyId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover índices
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_venda_companyId_createdAt"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_venda_companyId"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_movimentacao_caixa_companyId"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_images_companyId"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_log_companyId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_produto_companyId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_despesa_companyId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cliente_companyId"`);

    // Remover colunas
    await queryRunner.query(
      `ALTER TABLE "venda" DROP COLUMN IF EXISTS "companyId"`
    );
    await queryRunner.query(
      `ALTER TABLE "movimentacao_caixa" DROP COLUMN IF EXISTS "companyId"`
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP COLUMN IF EXISTS "companyId"`
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "companyId"`
    );
  }
}



