import { MigrationInterface, QueryRunner } from "typeorm";

export class MovimentacaoCaixaFinal1740697649513 implements MigrationInterface {
    name = 'MovimentacaoCaixaFinal1740697649513'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" RENAME COLUMN "caixa_id" TO "caixaId"`);
        await queryRunner.query(`ALTER TABLE "venda" ALTER COLUMN "caixaId" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" ALTER COLUMN "caixaId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "venda" RENAME COLUMN "caixaId" TO "caixa_id"`);
    }

}
