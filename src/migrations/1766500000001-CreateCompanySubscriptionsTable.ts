import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from "typeorm";

export class CreateCompanySubscriptionsTable1766500000001 implements MigrationInterface {
  name = "CreateCompanySubscriptionsTable1766500000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "company_subscriptions",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "company_id",
            type: "int",
          },
          {
            name: "plan_id",
            type: "int",
          },
          {
            name: "asaas_customer_id",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "asaas_subscription_id",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "status",
            type: "varchar",
            default: "'trial'",
          },
          {
            name: "trial_ends_at",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "current_period_start",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "current_period_end",
            type: "timestamp",
            isNullable: true,
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

    // Índices
    await queryRunner.createIndex(
      "company_subscriptions",
      new TableIndex({
        name: "IDX_company_subscriptions_company_id",
        columnNames: ["company_id"],
      })
    );

    await queryRunner.createIndex(
      "company_subscriptions",
      new TableIndex({
        name: "IDX_company_subscriptions_plan_id",
        columnNames: ["plan_id"],
      })
    );

    await queryRunner.createIndex(
      "company_subscriptions",
      new TableIndex({
        name: "IDX_company_subscriptions_asaas_customer_id",
        columnNames: ["asaas_customer_id"],
      })
    );

    await queryRunner.createIndex(
      "company_subscriptions",
      new TableIndex({
        name: "IDX_company_subscriptions_status",
        columnNames: ["status"],
      })
    );

    // Foreign Keys
    await queryRunner.createForeignKey(
      "company_subscriptions",
      new TableForeignKey({
        columnNames: ["company_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "companies",
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createForeignKey(
      "company_subscriptions",
      new TableForeignKey({
        columnNames: ["plan_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "plans",
        onDelete: "RESTRICT",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("company_subscriptions");
    
    // Remove foreign keys
    const foreignKeys = table?.foreignKeys || [];
    for (const foreignKey of foreignKeys) {
      await queryRunner.dropForeignKey("company_subscriptions", foreignKey);
    }

    // Remove indexes
    await queryRunner.dropIndex("company_subscriptions", "IDX_company_subscriptions_company_id");
    await queryRunner.dropIndex("company_subscriptions", "IDX_company_subscriptions_plan_id");
    await queryRunner.dropIndex("company_subscriptions", "IDX_company_subscriptions_asaas_customer_id");
    await queryRunner.dropIndex("company_subscriptions", "IDX_company_subscriptions_status");

    await queryRunner.dropTable("company_subscriptions");
  }
}



