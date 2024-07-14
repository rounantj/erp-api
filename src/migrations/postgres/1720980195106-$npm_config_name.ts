import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1720980195106 implements MigrationInterface {
    name = ' $npmConfigName1720980195106'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "companie-setup" DROP COLUMN "companyCnpj"`);
        await queryRunner.query(`ALTER TABLE "companie-setup" DROP COLUMN "companyName"`);
        await queryRunner.query(`ALTER TABLE "companie-setup" ADD "companyName" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "companie-setup" DROP COLUMN "companyName"`);
        await queryRunner.query(`ALTER TABLE "companie-setup" ADD "companyName" boolean NOT NULL`);
        await queryRunner.query(`ALTER TABLE "companie-setup" ADD "companyCnpj" character varying NOT NULL`);
    }

}
