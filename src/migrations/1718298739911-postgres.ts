import { MigrationInterface, QueryRunner } from "typeorm";

export class Postgres1718298739911 implements MigrationInterface {
  name = "Postgres1718298739911";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "produto" DROP COLUMN "valor"`);
    await queryRunner.query(
      `ALTER TABLE "produto" ADD "valor" double precision NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "produto" DROP COLUMN "valor"`);
    await queryRunner.query(
      `ALTER TABLE "produto" ADD "valor" integer NOT NULL`
    );
  }
}
