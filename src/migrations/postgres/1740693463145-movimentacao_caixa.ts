import { MigrationInterface, QueryRunner } from "typeorm";

export class MovimentacaoCaixa1740693463145 implements MigrationInterface {
    name = 'MovimentacaoCaixa1740693463145'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "caixa" DROP COLUMN "saldo_inicial"`);
        await queryRunner.query(`ALTER TABLE "caixa" DROP COLUMN "saldo_final"`);
        await queryRunner.query(`ALTER TABLE "caixa" ADD "companyId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "caixa" ADD "saldoInicial" double precision NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "caixa" ADD "saldoFinal" double precision NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "caixa" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "caixa_id" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "venda" ADD "caixa" integer`);
        await queryRunner.query(`ALTER TABLE "venda" ADD CONSTRAINT "FK_05aab301bfad11dd5c82ef31ea6" FOREIGN KEY ("caixa") REFERENCES "caixa"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" DROP CONSTRAINT "FK_05aab301bfad11dd5c82ef31ea6"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "caixa"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP COLUMN "caixa_id"`);
        await queryRunner.query(`ALTER TABLE "caixa" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "caixa" DROP COLUMN "saldoFinal"`);
        await queryRunner.query(`ALTER TABLE "caixa" DROP COLUMN "saldoInicial"`);
        await queryRunner.query(`ALTER TABLE "caixa" DROP COLUMN "companyId"`);
        await queryRunner.query(`ALTER TABLE "caixa" ADD "saldo_final" double precision NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "caixa" ADD "saldo_inicial" double precision NOT NULL DEFAULT '0'`);
    }

}
