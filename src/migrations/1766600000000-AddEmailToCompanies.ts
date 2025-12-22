import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailToCompanies1766600000000 implements MigrationInterface {
  name = "AddEmailToCompanies1766600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies" 
      ADD COLUMN IF NOT EXISTS "email" VARCHAR(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies" 
      DROP COLUMN IF EXISTS "email"
    `);
  }
}

