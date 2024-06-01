import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1717262938109 implements MigrationInterface {
    name = 'Postgres1717262938109'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "companies" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "is_active" boolean NOT NULL, "address" character varying NOT NULL, "phone" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL, "updated_by_user" integer, "created_by_user" integer, "deleted_at" TIMESTAMP, CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "username" character varying NOT NULL, "email" character varying, "name" character varying, "role" character varying, "is_active" boolean NOT NULL, "last_login" TIMESTAMP, "last_logout" TIMESTAMP, "companyId" integer NOT NULL, "password" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL, "updated_by_user" integer, "created_by_user" integer, "deleted_at" TIMESTAMP, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "venda" ("id" SERIAL NOT NULL, "nome_cliente" character varying NOT NULL, "desconto" integer NOT NULL, "total" integer NOT NULL, "produtoIds" text NOT NULL, "user_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL, "updated_by_user" integer, "created_by_user" integer, "deleted_at" TIMESTAMP, CONSTRAINT "PK_e54dc36860bef073e9ab638b444" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "produto" ("id" SERIAL NOT NULL, "descricao" character varying NOT NULL, "valor" integer NOT NULL, "ativa" boolean NOT NULL, "contato_credor" character varying NOT NULL, "vencimento" TIMESTAMP NOT NULL, "categoria" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL, "updated_by_user" integer, "created_by_user" integer, "deleted_at" TIMESTAMP, "companyId" integer, CONSTRAINT "PK_99c4351f9168c50c0736e6a66be" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "product_images" ("id" SERIAL NOT NULL, "filename" character varying NOT NULL, "ean" character varying NOT NULL, "base_64" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL, "updated_by_user" integer, "created_by_user" integer, "deleted_at" TIMESTAMP, CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "audit_log" ("id" SERIAL NOT NULL, "entity_name" character varying NOT NULL, "entity_id" integer NOT NULL, "action" character varying NOT NULL, "changed_fields" json, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "companies" ADD CONSTRAINT "FK_c586cf3cf390c51b716e43d35d7" FOREIGN KEY ("updated_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "companies" ADD CONSTRAINT "FK_fccb9bb7b5a269c39575c344d79" FOREIGN KEY ("created_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_6f9395c9037632a31107c8a9e58" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_643d710729602fb78e99f728063" FOREIGN KEY ("updated_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_f5326c605f5d72057a91828306c" FOREIGN KEY ("created_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "venda" ADD CONSTRAINT "FK_588ebf0fb80c34760886379dce6" FOREIGN KEY ("updated_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "venda" ADD CONSTRAINT "FK_14a495f324efae5b2cb1ed9c03f" FOREIGN KEY ("created_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "produto" ADD CONSTRAINT "FK_f004fb0fe6b09bd6cbec738d08e" FOREIGN KEY ("companyId") REFERENCES "venda"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "produto" ADD CONSTRAINT "FK_53261107b94dceeba27be6b2b58" FOREIGN KEY ("updated_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "produto" ADD CONSTRAINT "FK_72acb697635fbb3bae8ee27ef94" FOREIGN KEY ("created_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_images" ADD CONSTRAINT "FK_8c235e63af969b9ce4c74bdcf30" FOREIGN KEY ("updated_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_images" ADD CONSTRAINT "FK_c1c2cd2d69acc179a60328759cf" FOREIGN KEY ("created_by_user") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_images" DROP CONSTRAINT "FK_c1c2cd2d69acc179a60328759cf"`);
        await queryRunner.query(`ALTER TABLE "product_images" DROP CONSTRAINT "FK_8c235e63af969b9ce4c74bdcf30"`);
        await queryRunner.query(`ALTER TABLE "produto" DROP CONSTRAINT "FK_72acb697635fbb3bae8ee27ef94"`);
        await queryRunner.query(`ALTER TABLE "produto" DROP CONSTRAINT "FK_53261107b94dceeba27be6b2b58"`);
        await queryRunner.query(`ALTER TABLE "produto" DROP CONSTRAINT "FK_f004fb0fe6b09bd6cbec738d08e"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP CONSTRAINT "FK_14a495f324efae5b2cb1ed9c03f"`);
        await queryRunner.query(`ALTER TABLE "venda" DROP CONSTRAINT "FK_588ebf0fb80c34760886379dce6"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_f5326c605f5d72057a91828306c"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_643d710729602fb78e99f728063"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_6f9395c9037632a31107c8a9e58"`);
        await queryRunner.query(`ALTER TABLE "companies" DROP CONSTRAINT "FK_fccb9bb7b5a269c39575c344d79"`);
        await queryRunner.query(`ALTER TABLE "companies" DROP CONSTRAINT "FK_c586cf3cf390c51b716e43d35d7"`);
        await queryRunner.query(`DROP TABLE "audit_log"`);
        await queryRunner.query(`DROP TABLE "product_images"`);
        await queryRunner.query(`DROP TABLE "produto"`);
        await queryRunner.query(`DROP TABLE "venda"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "companies"`);
    }

}
