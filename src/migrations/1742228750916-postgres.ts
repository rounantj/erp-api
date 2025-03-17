import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1742228750916 implements MigrationInterface {
    name = 'Postgres1742228750916'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" ADD "exclusion_requested" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "exclusion_requested_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "exclusion_requested_by" integer`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "exclusion_reason" text`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "exclusion_status" character varying`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "exclusion_reviewed_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "exclusion_reviewed_by" integer`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "exclusion_review_notes" text`);
        await queryRunner.query(`ALTER TABLE "venda" ADD CONSTRAINT "FK_92c9eb10895dc333ab74c33769d" FOREIGN KEY ("exclusion_requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "venda" ADD CONSTRAINT "FK_5ca5bd66880dc02daa2f9b236a2" FOREIGN KEY ("exclusion_reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" DROP CONSTRAINT "FK_5ca5bd66880dc02daa2f9b236a2"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP CONSTRAINT "FK_92c9eb10895dc333ab74c33769d"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "exclusion_review_notes"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "exclusion_reviewed_by"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "exclusion_reviewed_at"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "exclusion_status"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "exclusion_reason"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "exclusion_requested_by"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "exclusion_requested_at"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "exclusion_requested"`);
    }

}
