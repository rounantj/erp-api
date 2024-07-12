import { MigrationInterface, QueryRunner } from "typeorm";

export class Teste_1720827091103 implements MigrationInterface {
    name = 'Teste_1720827091103'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "despesa" DROP COLUMN "ean"`);
        await queryRunner.query(`ALTER TABLE "despesa" DROP COLUMN "ncm"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "despesa" ADD "ncm" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "despesa" ADD "ean" character varying`);
    }

}
