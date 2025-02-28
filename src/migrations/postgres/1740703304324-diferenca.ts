import { MigrationInterface, QueryRunner } from "typeorm";

export class Diferenca1740703304324 implements MigrationInterface {
    name = 'Diferenca1740703304324'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "caixa" ADD "diferenca" double precision NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "caixa" DROP COLUMN "diferenca"`);
    }

}
