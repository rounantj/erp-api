import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreatePlansTable1766500000000 implements MigrationInterface {
  name = "CreatePlansTable1766500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "plans",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "name",
            type: "varchar",
            isUnique: true,
          },
          {
            name: "display_name",
            type: "varchar",
          },
          {
            name: "price",
            type: "decimal",
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: "billing_cycle",
            type: "varchar",
            default: "'monthly'",
          },
          {
            name: "max_users",
            type: "int",
            default: 1,
          },
          {
            name: "features",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "is_active",
            type: "boolean",
            default: true,
          },
          {
            name: "trial_days",
            type: "int",
            default: 15,
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "contact_phone",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "sort_order",
            type: "int",
            default: 0,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "deleted_at",
            type: "timestamp",
            isNullable: true,
          },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      "plans",
      new TableIndex({
        name: "IDX_plans_name",
        columnNames: ["name"],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("plans", "IDX_plans_name");
    await queryRunner.dropTable("plans");
  }
}


