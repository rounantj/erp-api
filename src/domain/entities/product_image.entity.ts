import {
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  DeleteDateColumn,
  JoinColumn,
} from "typeorm";
import { User } from "./user.entity";
import { PrimaryGeneratedColumn } from "typeorm";

@Entity("product_images")
export class ProductImages {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  filename: string;

  @Column()
  ean: string;

  @Column()
  base_64: string;

  @Column({ default: 1 })
  companyId: number;

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
