import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1720977870394 implements MigrationInterface {
    name = ' $npmConfigName1720977870394'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "companie-setup" ("id" SERIAL NOT NULL, "companyId" integer NOT NULL, "companyName" boolean NOT NULL, "companyAddress" character varying, "companyCNPJ" character varying, "companyNCM" boolean, "company_integration" jsonb, "companyCnpj" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL, "updated_by_user" integer, "created_by_user" integer, "deleted_at" TIMESTAMP, CONSTRAINT "PK_0adc34aac3751a7c0c6e3ea1bda" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "companie-setup" ADD CONSTRAINT "FK_7745b4f340f221e37d31a9571d4" FOREIGN KEY ("updated_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "companie-setup" ADD CONSTRAINT "FK_a964faae2efa9a0a85104c5ac80" FOREIGN KEY ("created_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "companie-setup" DROP CONSTRAINT "FK_a964faae2efa9a0a85104c5ac80"`);
        await queryRunner.query(`ALTER TABLE "companie-setup" DROP CONSTRAINT "FK_7745b4f340f221e37d31a9571d4"`);
        await queryRunner.query(`DROP TABLE "companie-setup"`);
    }

}
