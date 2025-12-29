import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { CompanySubscription } from "./company-subscription.entity";

export type PaymentStatus = "pending" | "confirmed" | "received" | "overdue" | "refunded" | "cancelled";
export type PaymentMethod = "pix" | "boleto" | "credit_card" | "undefined";

@Entity("payment_history")
export class PaymentHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "company_subscription_id" })
  companySubscriptionId: number;

  @Column({ name: "asaas_payment_id", nullable: true })
  asaasPaymentId: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: number;

  @Column({ default: "pending" })
  status: PaymentStatus; // "pending", "confirmed", "received", "refunded"

  @Column({ name: "payment_method", nullable: true })
  paymentMethod: PaymentMethod; // "pix", "boleto", "credit_card"

  @Column({ name: "billing_type", nullable: true })
  billingType: string; // Tipo de cobrança do Asaas

  @Column({ name: "invoice_url", nullable: true })
  invoiceUrl: string; // URL do boleto ou PIX

  @Column({ name: "pix_qr_code", nullable: true, type: "text" })
  pixQrCode: string; // QR Code PIX

  @Column({ name: "pix_copy_paste", nullable: true, type: "text" })
  pixCopyPaste: string; // Código copia e cola do PIX

  @Column({ name: "due_date", type: "timestamp", nullable: true })
  dueDate: Date;

  @Column({ name: "paid_at", type: "timestamp", nullable: true })
  paidAt: Date;

  @Column({ nullable: true, type: "text" })
  description: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  // Relações
  @ManyToOne(() => CompanySubscription, { nullable: false })
  @JoinColumn({ name: "company_subscription_id" })
  companySubscription: CompanySubscription;
}



