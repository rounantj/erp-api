import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1719188377475 implements MigrationInterface {
    name = 'Postgres1719188377475'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" RENAME COLUMN "produtoIds" TO "produtos"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" RENAME COLUMN "produtos" TO "produtoIds"`);
    }

}
