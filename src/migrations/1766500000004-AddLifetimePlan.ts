import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLifetimePlan1766500000004 implements MigrationInterface {
  name = "AddLifetimePlan1766500000004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adicionar novas colunas na tabela plans
    await queryRunner.query(`
      ALTER TABLE plans 
      ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS never_expires BOOLEAN DEFAULT false
    `);

    // Criar plano Vitalício
    await queryRunner.query(`
      INSERT INTO plans (
        name, 
        display_name, 
        price, 
        billing_cycle, 
        max_users, 
        features, 
        is_active, 
        is_internal,
        never_expires,
        trial_days, 
        description, 
        sort_order
      ) VALUES (
        'vitalicio',
        'Vitalício',
        0,
        'lifetime',
        -1,
        '["Acesso vitalício", "Todos os recursos", "Usuários ilimitados", "Suporte prioritário", "Atualizações inclusas"]',
        true,
        true,
        true,
        0,
        'Plano especial vitalício - apenas para negociação direta',
        99
      )
      ON CONFLICT (name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        is_internal = EXCLUDED.is_internal,
        never_expires = EXCLUDED.never_expires,
        features = EXCLUDED.features,
        description = EXCLUDED.description
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover plano Vitalício
    await queryRunner.query(`
      DELETE FROM plans WHERE name = 'vitalicio'
    `);

    // Remover colunas
    await queryRunner.query(`
      ALTER TABLE plans 
      DROP COLUMN IF EXISTS is_internal,
      DROP COLUMN IF EXISTS never_expires
    `);
  }
}



