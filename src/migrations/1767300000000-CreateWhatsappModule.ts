import { MigrationInterface, QueryRunner } from "typeorm";

const ALL_FEATURES = {
  create_products: true,
  checkout: true,
  sales: true,
  product_images: true,
  customization: true,
  curriculos: true,
  employees: true,
  priority_support: true,
  custom_features: true,
  whatsapp_atendimento: true,
};

export class CreateWhatsappModule1767300000000 implements MigrationInterface {
  name = "CreateWhatsappModule1767300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Configuração do atendimento por empresa (uma instância de WhatsApp por empresa).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_settings (
        company_id INT PRIMARY KEY REFERENCES companies(id),
        instance_name TEXT NOT NULL UNIQUE,
        webhook_token TEXT NOT NULL,
        bot_enabled BOOLEAN NOT NULL DEFAULT false,
        bot_name TEXT NOT NULL DEFAULT 'Assistente',
        instructions TEXT NOT NULL DEFAULT '',
        human_takeover_minutes INT NOT NULL DEFAULT 60,
        product_cards_enabled BOOLEAN NOT NULL DEFAULT true,
        auto_product_images BOOLEAN NOT NULL DEFAULT true,
        timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
        connected_phone TEXT,
        connection_state TEXT,
        next_order_number INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_business_hours (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id),
        weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        opens_at TIME NOT NULL,
        closes_at TIME NOT NULL,
        CHECK (opens_at < closes_at)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_business_hours_company ON whatsapp_business_hours (company_id, weekday)`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_business_hour_exceptions (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id),
        local_date DATE NOT NULL,
        description TEXT,
        closed BOOLEAN NOT NULL DEFAULT TRUE,
        opens_at TIME,
        closes_at TIME,
        CHECK (
          (closed = TRUE AND opens_at IS NULL AND closes_at IS NULL)
          OR (closed = FALSE AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
        ),
        UNIQUE (company_id, local_date)
      )
    `);

    // Contatos de WhatsApp; cliente_id liga ao cadastro de clientes do ERP quando o telefone bate.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id INT NOT NULL REFERENCES companies(id),
        phone TEXT NOT NULL,
        name TEXT,
        cliente_id INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, phone)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id INT NOT NULL REFERENCES companies(id),
        customer_id UUID NOT NULL REFERENCES whatsapp_customers(id),
        remote_jid TEXT NOT NULL,
        human_takeover_until TIMESTAMPTZ,
        last_human_message_at TIMESTAMPTZ,
        pending_summaries JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, customer_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id INT NOT NULL REFERENCES companies(id),
        conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id),
        provider_message_id TEXT NOT NULL,
        direction VARCHAR(8) NOT NULL CHECK (direction IN ('in', 'out')),
        sender VARCHAR(16) NOT NULL CHECK (sender IN ('customer', 'automation', 'human', 'pending')),
        type VARCHAR(16) NOT NULL,
        text TEXT,
        media_status VARCHAR(32),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, provider_message_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages (conversation_id, created_at)`
    );

    // IDs devolvidos pela Evolution nos envios automáticos; base para distinguir mensagem de atendente humano.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_automation_sent_ids (
        provider_message_id TEXT PRIMARY KEY,
        company_id INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id INT NOT NULL REFERENCES companies(id),
        number INT NOT NULL,
        customer_id UUID NOT NULL REFERENCES whatsapp_customers(id),
        conversation_id UUID REFERENCES whatsapp_conversations(id),
        description TEXT NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'in_progress', 'ready', 'delivered', 'cancelled')),
        confirmed_message_id TEXT,
        assigned_user_id INT REFERENCES users(id),
        summary_id UUID NOT NULL,
        expected_processing_from TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        ready_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, number),
        UNIQUE (company_id, summary_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_orders_queue ON whatsapp_orders (company_id, status, created_at)`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_orders_customer ON whatsapp_orders (company_id, customer_id, created_at DESC)`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id INT NOT NULL REFERENCES companies(id),
        order_id UUID NOT NULL REFERENCES whatsapp_orders(id),
        produto_id INT NOT NULL,
        description TEXT NOT NULL,
        quantity NUMERIC(12, 3) NOT NULL,
        unit_price NUMERIC(12, 2)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_order_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id INT NOT NULL REFERENCES companies(id),
        order_id UUID REFERENCES whatsapp_orders(id),
        conversation_id UUID REFERENCES whatsapp_conversations(id),
        original_name TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        mime_type TEXT,
        size_bytes BIGINT,
        source_message_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, source_message_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_order_files_order ON whatsapp_order_files (company_id, order_id)`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_order_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id INT NOT NULL REFERENCES companies(id),
        order_id UUID NOT NULL REFERENCES whatsapp_orders(id),
        type VARCHAR(40) NOT NULL DEFAULT 'ready',
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
        attempts INT NOT NULL DEFAULT 0,
        message_text TEXT,
        provider_message_id TEXT,
        last_error TEXT,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (order_id, type)
      )
    `);

    // Fila de jobs em Postgres (o erp-api não tem Redis). group_key impede dois jobs simultâneos da mesma conversa;
    // dedup_key junta jobs repetidos enquanto ainda estão pendentes (ex.: debounce da resposta da IA).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_jobs (
        id BIGSERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}',
        dedup_key TEXT,
        group_key TEXT,
        status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 3,
        locked_at TIMESTAMPTZ,
        last_error TEXT,
        result JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_jobs_dedup_pending ON whatsapp_jobs (dedup_key) WHERE status = 'pending' AND dedup_key IS NOT NULL`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_jobs_due ON whatsapp_jobs (run_at) WHERE status = 'pending'`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_jobs_running_group ON whatsapp_jobs (group_key) WHERE status = 'running'`
    );

    // Atendimento WhatsApp nos planos Profissional e Empresarial.
    await queryRunner.query(`
      UPDATE plans SET features = features || '{"whatsapp_atendimento": true}'::jsonb
      WHERE name IN ('profissional', 'empresarial') AND jsonb_typeof(features) = 'object'
    `);
    // O Vitalício tinha uma lista de textos em features, que nenhuma verificação de recurso reconhecia.
    await queryRunner.query(`UPDATE plans SET features = $1::jsonb WHERE name = 'vitalicio'`, [
      JSON.stringify(ALL_FEATURES),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE plans SET features = features - 'whatsapp_atendimento' WHERE jsonb_typeof(features) = 'object'`);
    for (const table of [
      "whatsapp_jobs",
      "whatsapp_order_notifications",
      "whatsapp_order_files",
      "whatsapp_order_items",
      "whatsapp_orders",
      "whatsapp_automation_sent_ids",
      "whatsapp_messages",
      "whatsapp_conversations",
      "whatsapp_customers",
      "whatsapp_business_hour_exceptions",
      "whatsapp_business_hours",
      "whatsapp_settings",
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}
