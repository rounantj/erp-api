import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import { Analytics } from "./analytics-colih.entity";
import { Usuario } from "./usuarios-colih.entity";

@Entity("bot_colih_autenticados")
export class Autenticado {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "chat_id", unique: true })
  chatId: number;

  @Column({ name: "usuario_id", nullable: true })
  usuarioId: number;

  @ManyToOne(() => Usuario, (usuario) => usuario.autenticacoes, {
    nullable: true,
  })
  @JoinColumn({ name: "usuario_id", referencedColumnName: "id" })
  usuario: Usuario;

  @OneToMany(() => Analytics, (analytics) => analytics.autenticado)
  analytics: Analytics[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deletedAt: Date;
}
