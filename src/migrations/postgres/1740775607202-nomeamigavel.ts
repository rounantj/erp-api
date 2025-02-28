import { MigrationInterface, QueryRunner } from "typeorm";

export class Nomeamigavel1740775607202 implements MigrationInterface {
    name = 'Nomeamigavel1740775607202'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produto" DROP COLUMN "nomeComum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produto" ADD "nomeComum" character varying`);
    }

}
