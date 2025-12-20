import {
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  JoinColumn,
} from "typeorm";
import { Caixa } from "./caixa.entity";
import { User } from "./user.entity";

@Entity("movimentacao_caixa")
export class MovimentacaoCaixa {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "float" })
  valor: number;

  @Column()
  tipo: string; // Exemplo: "retirada", "suprimento", "transferencia"

  @Column({ nullable: true })
  destino?: string; // Exemplo: "Banco", "Cofre", "Outro Caixa"

  @Column({ nullable: true })
  descricao?: string; // Detalhes adicionais sobre a movimentação

  @ManyToOne(() => Caixa, (caixa) => caixa.movimentacoes)
  @JoinColumn({ name: "caixa_id" })
  caixa: Caixa;

  @Column()
  caixa_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "usuario_id" })
  usuario: User;

  @Column()
  usuario_id: number;

  @Column({ default: 1 })
  companyId: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deletedAt: Date;
}
