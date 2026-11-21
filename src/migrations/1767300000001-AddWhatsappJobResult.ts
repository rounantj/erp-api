import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWhatsappJobResult1767300000001 implements MigrationInterface {
  name = "AddWhatsappJobResult1767300000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE whatsapp_jobs ADD COLUMN IF NOT EXISTS result JSONB`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE whatsapp_jobs DROP COLUMN IF EXISTS result`);
  }
}
