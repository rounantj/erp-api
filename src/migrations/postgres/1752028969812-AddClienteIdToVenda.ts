import { MigrationInterface, QueryRunner } from "typeorm";

export class AddClienteIdToVenda1752028969812 implements MigrationInterface {
    name = 'AddClienteIdToVenda1752028969812'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" ADD "clienteId" integer`);
        await queryRunner.query(`ALTER TABLE "venda" ADD CONSTRAINT "FK_15b70438372ffad25249a2c6fec" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" DROP CONSTRAINT "FK_15b70438372ffad25249a2c6fec"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "clienteId"`);
    }

}
