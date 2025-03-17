import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1742225141913 implements MigrationInterface {
    name = 'Postgres1742225141913'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "curriculum" ("id" SERIAL NOT NULL, "usingAi" boolean NOT NULL, "content" character varying NOT NULL, "prompt" character varying, "companyId" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL, "updated_by_user" integer, "created_by_user" integer, "deleted_at" TIMESTAMP, CONSTRAINT "PK_ea7cdfd52edbddc8d7352e2a747" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "curriculum" ADD CONSTRAINT "FK_7293bdb7acc6d8347863aa53f1e" FOREIGN KEY ("updated_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "curriculum" ADD CONSTRAINT "FK_0486a12e5bfc01105409c33e345" FOREIGN KEY ("created_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "curriculum" DROP CONSTRAINT "FK_0486a12e5bfc01105409c33e345"`);
        await queryRunner.query(`ALTER TABLE "curriculum" DROP CONSTRAINT "FK_7293bdb7acc6d8347863aa53f1e"`);
        await queryRunner.query(`DROP TABLE "curriculum"`);
    }

}
