import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1718297068529 implements MigrationInterface {
    name = 'Postgres1718297068529'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "produto" ("id" SERIAL NOT NULL, "descricao" character varying NOT NULL, "valor" integer NOT NULL, "companyId" integer NOT NULL, "categoria" character varying NOT NULL, "ncm" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL, "updated_by_user" integer, "created_by_user" integer, "deleted_at" TIMESTAMP, "vendasId" integer, CONSTRAINT "PK_99c4351f9168c50c0736e6a66be" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "produto" ADD CONSTRAINT "FK_e002bb258dc7a347299c9511c61" FOREIGN KEY ("vendasId") REFERENCES "venda"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "produto" ADD CONSTRAINT "FK_53261107b94dceeba27be6b2b58" FOREIGN KEY ("updated_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "produto" ADD CONSTRAINT "FK_72acb697635fbb3bae8ee27ef94" FOREIGN KEY ("created_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "produto" DROP CONSTRAINT "FK_72acb697635fbb3bae8ee27ef94"`);
        await queryRunner.query(`ALTER TABLE "produto" DROP CONSTRAINT "FK_53261107b94dceeba27be6b2b58"`);
        await queryRunner.query(`ALTER TABLE "produto" DROP CONSTRAINT "FK_e002bb258dc7a347299c9511c61"`);
        await queryRunner.query(`DROP TABLE "produto"`);
    }

}
