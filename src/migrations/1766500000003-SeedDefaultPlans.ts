import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedDefaultPlans1766500000003 implements MigrationInterface {
  name = "SeedDefaultPlans1766500000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Plano Grátis (Trial)
    await queryRunner.query(`
      INSERT INTO plans (name, display_name, price, billing_cycle, max_users, features, is_active, trial_days, description, sort_order)
      VALUES (
        'free_trial',
        'Grátis',
        0,
        'monthly',
        1,
        '{"create_products": true, "checkout": true, "sales": true, "product_images": false, "customization": false, "curriculos": false, "employees": false}'::jsonb,
        true,
        15,
        'Teste grátis por 15 dias com funcionalidades básicas',
        0
      )
    `);

    // Plano Inicial
    await queryRunner.query(`
      INSERT INTO plans (name, display_name, price, billing_cycle, max_users, features, is_active, trial_days, description, sort_order)
      VALUES (
        'inicial',
        'Inicial',
        30.00,
        'monthly',
        5,
        '{"create_products": true, "checkout": true, "sales": true, "product_images": false, "customization": false, "curriculos": false, "employees": false}'::jsonb,
        true,
        0,
        'Plano básico para pequenos negócios. Crie produtos e venda usando a tela de caixa.',
        1
      )
    `);

    // Plano Profissional
    await queryRunner.query(`
      INSERT INTO plans (name, display_name, price, billing_cycle, max_users, features, is_active, trial_days, description, sort_order)
      VALUES (
        'profissional',
        'Profissional',
        80.00,
        'monthly',
        50,
        '{"create_products": true, "checkout": true, "sales": true, "product_images": true, "customization": true, "curriculos": true, "employees": true}'::jsonb,
        true,
        0,
        'Todos os recursos liberados: imagens em produtos, personalização, currículos e funcionários.',
        2
      )
    `);

    // Plano Empresarial
    await queryRunner.query(`
      INSERT INTO plans (name, display_name, price, billing_cycle, max_users, features, is_active, trial_days, description, contact_phone, sort_order)
      VALUES (
        'empresarial',
        'Empresarial',
        0,
        'custom',
        -1,
        '{"create_products": true, "checkout": true, "sales": true, "product_images": true, "customization": true, "curriculos": true, "employees": true, "priority_support": true, "custom_features": true}'::jsonb,
        true,
        0,
        'Plano personalizado para grandes empresas. Entre em contato para negociar.',
        '27996011204',
        3
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM plans WHERE name IN ('free_trial', 'inicial', 'profissional', 'empresarial')`);
  }
}

