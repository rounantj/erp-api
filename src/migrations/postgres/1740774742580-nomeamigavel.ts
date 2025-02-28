import { MigrationInterface, QueryRunner } from "typeorm";

export class Nomeamigavel1740774742580 implements MigrationInterface {
    name = 'Nomeamigavel1740774742580'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produto" ADD "nomeHumanizado" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produto" DROP COLUMN "nomeHumanizado"`);
    }

}
