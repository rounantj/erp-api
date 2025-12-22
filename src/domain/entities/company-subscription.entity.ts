import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Company } from "./company.entity";
import { Plan } from "./plan.entity";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled" | "readonly" | "expired";

@Entity("company_subscriptions")
export class CompanySubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "company_id" })
  companyId: number;

  @Column({ name: "plan_id" })
  planId: number;

  @Column({ name: "asaas_customer_id", nullable: true })
  asaasCustomerId: string; // ID do cliente no Asaas

  @Column({ name: "asaas_subscription_id", nullable: true })
  asaasSubscriptionId: string; // ID da subscription no Asaas

  @Column({ default: "trial" })
  status: SubscriptionStatus; // "trial", "active", "past_due", "cancelled", "readonly"

  @Column({ name: "trial_ends_at", type: "timestamp", nullable: true })
  trialEndsAt: Date;

  @Column({ name: "current_period_start", type: "timestamp", nullable: true })
  currentPeriodStart: Date;

  @Column({ name: "current_period_end", type: "timestamp", nullable: true })
  currentPeriodEnd: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @Column({ name: "updated_at", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  updatedAt: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deletedAt: Date;

  // Relações
  @ManyToOne(() => Company, { nullable: false })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @ManyToOne(() => Plan, { nullable: false })
  @JoinColumn({ name: "plan_id" })
  plan: Plan;
}

