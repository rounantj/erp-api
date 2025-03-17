import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1742037495867 implements MigrationInterface {
    name = 'Postgres1742037495867'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "bot_colih_analytics" ("id" SERIAL NOT NULL, "chat_id" integer NOT NULL, "search_query" text, "results_count" integer, "feedback" character varying(10), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a60a6f071259edce5ba8bdecf24" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bot_colih_autenticados" ("id" SERIAL NOT NULL, "chat_id" integer NOT NULL, "usuario_id" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_eea784b24706be43e5185802658" UNIQUE ("chat_id"), CONSTRAINT "PK_beb5ec183a7be23fd63755ceb66" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bot_colih_usuarios" ("id" SERIAL NOT NULL, "nome" character varying(100) NOT NULL, "cpf" character varying(11) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_4673c61a4ea5c4b2230c0417450" UNIQUE ("cpf"), CONSTRAINT "PK_71125aec4f4b6cbdc1ec53bd695" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bot_colih_medicos" ("id" SERIAL NOT NULL, "nome" character varying(100) NOT NULL, "especialidade" character varying(100) NOT NULL, "endereco" text NOT NULL, "telefone" character varying(20) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_2dbfcba4248160d4fda3754eb54" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "bot_colih_analytics" ADD CONSTRAINT "FK_fdd65d5227706578efe04ac9735" FOREIGN KEY ("chat_id") REFERENCES "bot_colih_autenticados"("chat_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bot_colih_autenticados" ADD CONSTRAINT "FK_7a54d56905eee6da2a84f8bc002" FOREIGN KEY ("usuario_id") REFERENCES "bot_colih_usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bot_colih_autenticados" DROP CONSTRAINT "FK_7a54d56905eee6da2a84f8bc002"`);
        await queryRunner.query(`ALTER TABLE "bot_colih_analytics" DROP CONSTRAINT "FK_fdd65d5227706578efe04ac9735"`);
        await queryRunner.query(`DROP TABLE "bot_colih_medicos"`);
        await queryRunner.query(`DROP TABLE "bot_colih_usuarios"`);
        await queryRunner.query(`DROP TABLE "bot_colih_autenticados"`);
        await queryRunner.query(`DROP TABLE "bot_colih_analytics"`);
    }

}
