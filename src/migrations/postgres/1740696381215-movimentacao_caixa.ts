import { MigrationInterface, QueryRunner } from "typeorm";

export class MovimentacaoCaixa1740696381215 implements MigrationInterface {
    name = 'MovimentacaoCaixa1740696381215'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "caixa" DROP COLUMN "companyId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "caixa" ADD "companyId" integer NOT NULL`);
    }

}
