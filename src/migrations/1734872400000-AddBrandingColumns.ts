import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBrandingColumns1734872400000 implements MigrationInterface {
  name = "AddBrandingColumns1734872400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adicionar novas colunas para branding na tabela companie-setup
    await queryRunner.query(`
      ALTER TABLE "companie-setup" ADD COLUMN IF NOT EXISTS "logo_url" TEXT
    `);

    await queryRunner.query(`
      ALTER TABLE "companie-setup" ADD COLUMN IF NOT EXISTS "sidebar_color" VARCHAR(50) DEFAULT '#667eea'
    `);

    await queryRunner.query(`
      ALTER TABLE "companie-setup" ADD COLUMN IF NOT EXISTS "company_phone" VARCHAR(50)
    `);

    await queryRunner.query(`
      ALTER TABLE "companie-setup" ADD COLUMN IF NOT EXISTS "company_email" VARCHAR(100)
    `);

    await queryRunner.query(`
      ALTER TABLE "companie-setup" ADD COLUMN IF NOT EXISTS "receipt_footer" TEXT
    `);

    await queryRunner.query(`
      ALTER TABLE "companie-setup" ADD COLUMN IF NOT EXISTS "onboarding_completed" BOOLEAN DEFAULT FALSE
    `);

    // Adicionar coluna image_url na tabela produto
    await queryRunner.query(`
      ALTER TABLE "produto" ADD COLUMN IF NOT EXISTS "image_url" TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover colunas de branding
    await queryRunner.query(`
      ALTER TABLE "companie-setup" DROP COLUMN IF EXISTS "logo_url"
    `);

    await queryRunner.query(`
      ALTER TABLE "companie-setup" DROP COLUMN IF EXISTS "sidebar_color"
    `);

    await queryRunner.query(`
      ALTER TABLE "companie-setup" DROP COLUMN IF EXISTS "company_phone"
    `);

    await queryRunner.query(`
      ALTER TABLE "companie-setup" DROP COLUMN IF EXISTS "company_email"
    `);

    await queryRunner.query(`
      ALTER TABLE "companie-setup" DROP COLUMN IF EXISTS "receipt_footer"
    `);

    await queryRunner.query(`
      ALTER TABLE "companie-setup" DROP COLUMN IF EXISTS "onboarding_completed"
    `);

    // Remover coluna image_url do produto
    await queryRunner.query(`
      ALTER TABLE "produto" DROP COLUMN IF EXISTS "image_url"
    `);
  }
}

