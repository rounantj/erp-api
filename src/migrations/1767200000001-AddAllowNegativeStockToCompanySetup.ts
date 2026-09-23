import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAllowNegativeStockToCompanySetup1767200000001
  implements MigrationInterface
{
  name = "AddAllowNegativeStockToCompanySetup1767200000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companie-setup"
      ADD COLUMN IF NOT EXISTS "allow_negative_stock" BOOLEAN NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companie-setup"
      DROP COLUMN IF EXISTS "allow_negative_stock"
    `);
  }
}
