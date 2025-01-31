import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1719188433440 implements MigrationInterface {
    name = 'Postgres1719188433440'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produto" DROP CONSTRAINT "FK_e002bb258dc7a347299c9511c61"`);
        await queryRunner.query(`ALTER TABLE "produto" DROP COLUMN "vendasId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produto" ADD "vendasId" integer`);
        await queryRunner.query(`ALTER TABLE "produto" ADD CONSTRAINT "FK_e002bb258dc7a347299c9511c61" FOREIGN KEY ("vendasId") REFERENCES "venda"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
