import { MigrationInterface, QueryRunner } from "typeorm";

export class Caixa1740619488744 implements MigrationInterface {
    name = 'Caixa1740619488744'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "caixa" ("id" SERIAL NOT NULL, "company_id" integer NOT NULL, "saldo_inicial" double precision NOT NULL DEFAULT '0', "saldo_final" double precision NOT NULL DEFAULT '0', "fechado" boolean NOT NULL DEFAULT false, "abertura_data" TIMESTAMP NOT NULL DEFAULT now(), "fechamento_data" TIMESTAMP, "aberto_por" integer, "fechado_por" integer, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_7bda1bc828f2ac8014f060e9719" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "movimentacao_caixa" ("id" SERIAL NOT NULL, "valor" double precision NOT NULL, "tipo" character varying NOT NULL, "destino" character varying, "descricao" character varying, "caixa_id" integer NOT NULL, "usuario_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_6cd8e316e6770ee7ae53024d92e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "caixa" ADD CONSTRAINT "FK_edc2d8514a16f190b1d9c5e04af" FOREIGN KEY ("aberto_por") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "caixa" ADD CONSTRAINT "FK_e447d4dc5da742bb9b4ac967f52" FOREIGN KEY ("fechado_por") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "caixa" ADD CONSTRAINT "FK_38f66d745436f69cddf57947313" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "movimentacao_caixa" ADD CONSTRAINT "FK_c37f8b98c3fb5a46fc50996b059" FOREIGN KEY ("caixa_id") REFERENCES "caixa"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "movimentacao_caixa" ADD CONSTRAINT "FK_96e3a13b41425cbbeecbf124392" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "movimentacao_caixa" DROP CONSTRAINT "FK_96e3a13b41425cbbeecbf124392"`);
        await queryRunner.query(`ALTER TABLE "movimentacao_caixa" DROP CONSTRAINT "FK_c37f8b98c3fb5a46fc50996b059"`);
        await queryRunner.query(`ALTER TABLE "caixa" DROP CONSTRAINT "FK_38f66d745436f69cddf57947313"`);
        await queryRunner.query(`ALTER TABLE "caixa" DROP CONSTRAINT "FK_e447d4dc5da742bb9b4ac967f52"`);
        await queryRunner.query(`ALTER TABLE "caixa" DROP CONSTRAINT "FK_edc2d8514a16f190b1d9c5e04af"`);
        await queryRunner.query(`DROP TABLE "movimentacao_caixa"`);
        await queryRunner.query(`DROP TABLE "caixa"`);
    }

}
