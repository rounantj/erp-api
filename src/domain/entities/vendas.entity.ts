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

@Entity("venda")
export class Venda {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nome_cliente: string;

  @Column()
  desconto: number;

  @Column()
  total: number;

  @Column("simple-json")
  produtoIds: number[];

  @Column()
  user_id: number;

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
