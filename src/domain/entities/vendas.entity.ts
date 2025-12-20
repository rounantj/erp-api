import {
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  DeleteDateColumn,
  JoinColumn,
  PrimaryGeneratedColumn,
  BeforeUpdate,
} from "typeorm";
import { Company } from "./company.entity";
import { User } from "./user.entity";
import { Produto } from "./produtos.entity";
import { Caixa } from "./caixa.entity";
import { Cliente } from "./cliente.entity";

type ProdutoDeVenda = Produto & {
  quantidade: number;
  desconto: number;
};

@Entity("venda")
export class Venda {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nome_cliente: string;

  @Column({ nullable: true })
  desconto: number;

  @Column({ type: "float" }) // Specify float type for valor
  total: number;

  // Conversion methods (optional, but improves readability)
  setValue(valorString: string) {
    this.total = parseFloat(valorString);
    if (isNaN(this.total)) {
      throw new Error("total inválido"); // Handle invalid conversion
    }
  }

  @Column()
  metodoPagamento: string;

  @Column("simple-json")
  produtos: ProdutoDeVenda[];

  @Column()
  user_id: number;

  @Column({ nullable: true })
  caixaId: number;

  @Column({ nullable: true })
  clienteId: number;

  @Column({ default: 1 })
  companyId: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @Column({ name: "updated_at", default: () => "CURRENT_TIMESTAMP" })
  updatedAt: Date;

  @Column({ name: "updated_by_user", nullable: true })
  updatedByUser: string;

  @Column({ name: "created_by_user", nullable: true })
  createdByUser: string;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deletedAt: Date;

  // Novas colunas para controle de solicitação de exclusão
  @Column({ name: "exclusion_requested", default: false })
  exclusionRequested: boolean;

  @Column({ name: "exclusion_requested_at", nullable: true })
  exclusionRequestedAt: Date;

  @Column({ name: "exclusion_requested_by", nullable: true })
  exclusionRequestedBy: number;

  @Column({ name: "exclusion_reason", nullable: true, type: "text" })
  exclusionReason: string;

  @Column({
    name: "exclusion_status",
    nullable: true,
    enum: ["pending", "approved", "rejected"],
  })
  exclusionStatus: string;

  @Column({ name: "exclusion_reviewed_at", nullable: true })
  exclusionReviewedAt: Date;

  @Column({ name: "exclusion_reviewed_by", nullable: true })
  exclusionReviewedBy: number;

  @Column({ name: "exclusion_review_notes", nullable: true, type: "text" })
  exclusionReviewNotes: string;

  @ManyToOne(() => Caixa, { nullable: true })
  @JoinColumn({ name: "caixa", referencedColumnName: "id" })
  caixa: Caixa;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "updated_by_user", referencedColumnName: "id" })
  updatedBy: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "created_by_user", referencedColumnName: "id" })
  createdBy: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "exclusion_requested_by", referencedColumnName: "id" })
  exclusionRequestedByUser: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "exclusion_reviewed_by", referencedColumnName: "id" })
  exclusionReviewedByUser: User;

  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: "clienteId", referencedColumnName: "id" })
  cliente: Cliente;

  @BeforeUpdate()
  updateTimestamp() {
    this.updatedAt = new Date();
  }
}
