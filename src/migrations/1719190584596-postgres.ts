import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1719190584596 implements MigrationInterface {
    name = 'Postgres1719190584596'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" ALTER COLUMN "desconto" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" ALTER COLUMN "desconto" SET NOT NULL`);
    }

}
