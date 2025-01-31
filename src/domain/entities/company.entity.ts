import { User } from "./user.entity";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  DeleteDateColumn,
  JoinColumn,
  ManyToOne,
} from "typeorm";

@Entity("companies")
export class Company {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  is_active: boolean;

  @Column()
  address: string;

  @Column()
  phone: string;

  @OneToMany(() => User, (item: any) => item.company)
  users: User[];

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
