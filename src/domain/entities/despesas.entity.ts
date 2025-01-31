import {
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  DeleteDateColumn,
  JoinColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Company } from "./company.entity";
import { User } from "./user.entity";
import { Venda } from "./vendas.entity";

@Entity("despesa")
export class Despesa {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  descricao: string;

  @Column()
  status: string;

  @Column()
  fixa: boolean;

  @Column({ name: "vencimento" })
  vencimento: Date;

  @Column({ type: "float" }) // Specify float type for valor
  valor: number;

  // Conversion methods (optional, but improves readability)
  setValue(valorString: string) {
    this.valor = parseFloat(valorString);
    if (isNaN(this.valor)) {
      throw new Error("Valor inválido"); // Handle invalid conversion
    }
  }

  @Column()
  companyId: number;

  @Column()
  categoria?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @Column({ name: "updated_at" })
  updatedAt: Date;

  @Column({ name: "updated_by_user", nullable: true })
  updatedByUser: string;

  @Column({ name: "created_by_user", nullable: true })
  createdByUser: string;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deletedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "updated_by_user", referencedColumnName: "id" })
  updatedBy: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "created_by_user", referencedColumnName: "id" })
  createdBy: User;
}
