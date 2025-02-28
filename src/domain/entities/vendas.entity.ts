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
import { Produto } from "./produtos.entity";
import { Caixa } from "./caixa.entity";

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

  @ManyToOne(() => Caixa, { nullable: true })
  @JoinColumn({ name: "caixa", referencedColumnName: "id" })
  caixa: Caixa;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "updated_by_user", referencedColumnName: "id" })
  updatedBy: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "created_by_user", referencedColumnName: "id" })
  createdBy: User;
}
