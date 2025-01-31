import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1719190521814 implements MigrationInterface {
    name = 'Postgres1719190521814'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "total"`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "total" double precision NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "total"`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "total" integer NOT NULL`);
    }

}
