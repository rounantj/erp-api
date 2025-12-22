import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
} from "typeorm";

@Entity("plans")
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string; // "free_trial", "inicial", "profissional", "empresarial"

  @Column({ name: "display_name" })
  displayName: string; // "Grátis", "Inicial", etc.

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  price: number; // 0, 30, 80, 0 (empresarial)

  @Column({ name: "billing_cycle", default: "monthly" })
  billingCycle: string; // "monthly", "yearly", "custom"

  @Column({ name: "max_users", default: 1 })
  maxUsers: number; // 1, 5, 50, -1 (ilimitado)

  @Column({ type: "jsonb", nullable: true })
  features: Record<string, boolean>; // Lista de features habilitadas

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @Column({ name: "is_internal", default: false })
  isInternal: boolean; // Planos internos não aparecem para clientes (ex: vitalício)

  @Column({ name: "never_expires", default: false })
  neverExpires: boolean; // Para plano vitalício

  @Column({ name: "trial_days", default: 15 })
  trialDays: number; // Configurável pelo admin (default 15)

  @Column({ nullable: true })
  description: string;

  @Column({ name: "contact_phone", nullable: true })
  contactPhone: string; // Para plano empresarial

  @Column({ name: "sort_order", default: 0 })
  sortOrder: number; // Ordem de exibição

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @Column({ name: "updated_at", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  updatedAt: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deletedAt: Date;
}

