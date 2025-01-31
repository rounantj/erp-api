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

@Entity("companie-setup")
export class CompanySetup {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    companyId: number;

    @Column()
    companyName: string;

    @Column({ nullable: true })
    companyAddress?: string;

    @Column({ nullable: true })
    companyCNPJ?: string;

    @Column({ nullable: true })
    companyNCM?: boolean;

    @Column({ name: "company_integration", type: 'jsonb', nullable: true })
    companyIntegration?: any;


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
