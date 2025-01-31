import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1719188501592 implements MigrationInterface {
    name = 'Postgres1719188501592'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" ADD "metodoPagamento" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "metodoPagamento"`);
    }

}
