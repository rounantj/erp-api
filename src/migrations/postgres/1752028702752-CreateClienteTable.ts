import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateClienteTable1752028702752 implements MigrationInterface {
    name = 'CreateClienteTable1752028702752'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "cliente" ("id" SERIAL NOT NULL, "nome" character varying NOT NULL, "cpf_cnpj" character varying, "email" character varying, "telefone" character varying, "endereco" character varying, "cidade" character varying, "estado" character varying, "cep" character varying, "observacoes" character varying, "ativo" boolean NOT NULL DEFAULT true, "companyId" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_18990e8df6cf7fe71b9dc0f5f39" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "venda" ALTER COLUMN "updated_at" SET DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venda" ALTER COLUMN "updated_at" DROP DEFAULT`);
        await queryRunner.query(`DROP TABLE "cliente"`);
    }

}
