
import { Company } from './company.entity';
import { Entity, Column, ManyToOne, CreateDateColumn, DeleteDateColumn, JoinColumn, PrimaryGeneratedColumn, BeforeInsert, BeforeUpdate } from 'typeorm';
import bcrypt from 'bcryptjs';
@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    username: string;

    @Column({ nullable: true })
    email: string;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    role: string;

    @Column()
    is_active: boolean;

    @Column({ nullable: true })
    last_login: Date;

    @Column({ nullable: true })
    last_logout: Date;

    @Column()
    companyId: number;

    @ManyToOne(() => Company, (company: any) => company.id)
    company: Company;

    @Column()
    password: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @Column({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ name: 'updated_by_user', nullable: true })
    updatedByUser: string;

    @Column({ name: 'created_by_user', nullable: true })
    createdByUser: string;

    @DeleteDateColumn({ name: 'deleted_at', nullable: true })
    deletedAt: Date;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'updated_by_user', referencedColumnName: 'id' })
    updatedBy: User;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'created_by_user', referencedColumnName: 'id' })
    createdBy: User;

    @BeforeInsert()
    setDateValues() {
        const currentDate = new Date();
        if (!this.createdAt) {
            this.createdAt = currentDate;
        }
        if (!this.updatedAt) {
            this.updatedAt = currentDate;
        }
        if (!this.last_login) {
            this.last_login = currentDate;
        }
    }
}
