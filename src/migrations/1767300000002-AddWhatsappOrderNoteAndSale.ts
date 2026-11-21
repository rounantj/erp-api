import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWhatsappOrderNoteAndSale1767300000002 implements MigrationInterface {
  name = "AddWhatsappOrderNoteAndSale1767300000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE whatsapp_orders ADD COLUMN IF NOT EXISTS customer_note TEXT`);
    await queryRunner.query(`ALTER TABLE whatsapp_orders ADD COLUMN IF NOT EXISTS venda_id INT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE whatsapp_orders DROP COLUMN IF EXISTS venda_id`);
    await queryRunner.query(`ALTER TABLE whatsapp_orders DROP COLUMN IF EXISTS customer_note`);
  }
}
