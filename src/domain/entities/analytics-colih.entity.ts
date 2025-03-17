import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Autenticado } from "./autenticados-colih.entity";

@Entity("bot_colih_analytics")
export class Analytics {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "chat_id" })
  chatId: number;

  @Column({ name: "search_query", type: "text", nullable: true })
  searchQuery: string;

  @Column({ name: "results_count", nullable: true })
  resultsCount: number;

  @Column({ length: 10, nullable: true })
  feedback: string;

  @ManyToOne(() => Autenticado, (autenticado) => autenticado.analytics)
  @JoinColumn({ name: "chat_id", referencedColumnName: "chatId" })
  autenticado: Autenticado;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
