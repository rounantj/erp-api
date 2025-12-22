import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from "typeorm";

export class CreatePaymentHistoryTable1766500000002 implements MigrationInterface {
  name = "CreatePaymentHistoryTable1766500000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "payment_history",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "company_subscription_id",
            type: "int",
          },
          {
            name: "asaas_payment_id",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "amount",
            type: "decimal",
            precision: 10,
            scale: 2,
          },
          {
            name: "status",
            type: "varchar",
            default: "'pending'",
          },
          {
            name: "payment_method",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "billing_type",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "invoice_url",
            type: "text",
            isNullable: true,
          },
          {
            name: "pix_qr_code",
            type: "text",
            isNullable: true,
          },
          {
            name: "pix_copy_paste",
            type: "text",
            isNullable: true,
          },
          {
            name: "due_date",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "paid_at",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true
    );

    // Índices
    await queryRunner.createIndex(
      "payment_history",
      new TableIndex({
        name: "IDX_payment_history_subscription_id",
        columnNames: ["company_subscription_id"],
      })
    );

    await queryRunner.createIndex(
      "payment_history",
      new TableIndex({
        name: "IDX_payment_history_asaas_payment_id",
        columnNames: ["asaas_payment_id"],
      })
    );

    await queryRunner.createIndex(
      "payment_history",
      new TableIndex({
        name: "IDX_payment_history_status",
        columnNames: ["status"],
      })
    );

    // Foreign Key
    await queryRunner.createForeignKey(
      "payment_history",
      new TableForeignKey({
        columnNames: ["company_subscription_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "company_subscriptions",
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("payment_history");
    
    // Remove foreign keys
    const foreignKeys = table?.foreignKeys || [];
    for (const foreignKey of foreignKeys) {
      await queryRunner.dropForeignKey("payment_history", foreignKey);
    }

    // Remove indexes
    await queryRunner.dropIndex("payment_history", "IDX_payment_history_subscription_id");
    await queryRunner.dropIndex("payment_history", "IDX_payment_history_asaas_payment_id");
    await queryRunner.dropIndex("payment_history", "IDX_payment_history_status");

    await queryRunner.dropTable("payment_history");
  }
}

