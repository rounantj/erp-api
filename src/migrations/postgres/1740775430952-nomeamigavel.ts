import { MigrationInterface, QueryRunner } from "typeorm";

export class Nomeamigavel1740775430952 implements MigrationInterface {
    name = 'Nomeamigavel1740775430952'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produto" RENAME COLUMN "nomeHumanizado" TO "nomeComum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produto" RENAME COLUMN "nomeComum" TO "nomeHumanizado"`);
    }

}
