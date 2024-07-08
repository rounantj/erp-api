import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1720397678961 implements MigrationInterface {
    name = 'Postgres1720397678961'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "despesa" ("id" SERIAL NOT NULL, "descricao" character varying NOT NULL, "status" character varying NOT NULL, "fixa" boolean NOT NULL, "vencimento" TIMESTAMP NOT NULL, "valor" double precision NOT NULL, "companyId" integer NOT NULL, "categoria" character varying NOT NULL, "ean" character varying, "ncm" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL, "updated_by_user" integer, "created_by_user" integer, "deleted_at" TIMESTAMP, CONSTRAINT "PK_180d33aa63e7bae94e289ad23e0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "despesa" ADD CONSTRAINT "FK_e81b2714a10f5d20d0424509924" FOREIGN KEY ("updated_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "despesa" ADD CONSTRAINT "FK_e1f1b168f192e987323cfbf2dfb" FOREIGN KEY ("created_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "despesa" DROP CONSTRAINT "FK_e1f1b168f192e987323cfbf2dfb"`);
        await queryRunner.query(`ALTER TABLE "despesa" DROP CONSTRAINT "FK_e81b2714a10f5d20d0424509924"`);
        await queryRunner.query(`DROP TABLE "despesa"`);
    }

}
