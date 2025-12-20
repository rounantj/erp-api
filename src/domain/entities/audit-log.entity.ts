import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("audit_log")
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "entity_name" })
  entityName: string;

  @Column({ name: "entity_id" })
  entityId: number;

  @Column({ name: "action" })
  action: string;

  @Column({ name: "changed_fields", type: "json", nullable: true })
  changedFields: Record<string, any>;

  @Column({ name: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  timestamp: Date;

  @Column({ default: 1 })
  companyId: number;
}
