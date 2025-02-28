import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  JoinColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity";
import { Company } from "./company.entity";
import { Venda } from "./vendas.entity";
import { Despesa } from "./despesas.entity";
import { MovimentacaoCaixa } from "./movimentacao_caixa.entity";

@Entity("caixa")
export class Caixa {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Company, { nullable: false }) // Relacionamento correto
  @JoinColumn({ name: "company_id", referencedColumnName: "id" }) // Define a coluna no banco
  company: Company;

  @Column({ type: "float", default: 0 })
  saldoInicial: number;

  @Column({ type: "float", default: 0 })
  saldoFinal: number;

  @Column({ type: "boolean", default: false })
  fechado: boolean;

  @OneToMany(() => Venda, (venda) => venda.id)
  vendas: Venda[];

  @OneToMany(() => Despesa, (despesa) => despesa.id)
  despesas: Despesa[];

  @CreateDateColumn({ name: "abertura_data" })
  aberturaData: Date;

  @Column({ name: "fechamento_data", nullable: true })
  fechamentoData: Date;

  @Column({ name: "aberto_por", nullable: true })
  abertoPor: number;

  @Column({ name: "fechado_por", nullable: true })
  fechadoPor: number;

  @OneToMany(() => MovimentacaoCaixa, (movimentacao) => movimentacao.caixa)
  movimentacoes: MovimentacaoCaixa[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "aberto_por", referencedColumnName: "id" })
  abertoPorUser: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "fechado_por", referencedColumnName: "id" })
  fechadoPorUser: User;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deletedAt: Date;
}
