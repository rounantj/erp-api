import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1720980157426 implements MigrationInterface {
    name = ' $npmConfigName1720980157426'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "companie-setup" DROP COLUMN "companyName"`);
        await queryRunner.query(`ALTER TABLE "companie-setup" ADD "companyName" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "companie-setup" DROP COLUMN "companyName"`);
        await queryRunner.query(`ALTER TABLE "companie-setup" ADD "companyName" boolean NOT NULL`);
    }

}
