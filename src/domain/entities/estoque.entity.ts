import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Produto } from "./produtos.entity";

@Entity("estoque")
export class Estoque {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  companyId: number;

  @Column()
  productId: number;

  @Column({ type: "float", default: 0 })
  quantity: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @Column({
    name: "updated_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  updatedAt: Date;

  @ManyToOne(() => Produto, { nullable: false })
  @JoinColumn({ name: "productId", referencedColumnName: "id" })
  product: Produto;
}
