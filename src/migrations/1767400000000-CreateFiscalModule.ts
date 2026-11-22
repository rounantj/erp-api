import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFiscalModule1767400000000 implements MigrationInterface {
  name = "CreateFiscalModule1767400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fiscal_settings (
        company_id INT PRIMARY KEY,
        regime TEXT NOT NULL DEFAULT 'mei',
        cnpj TEXT,
        razao_social TEXT,
        nome_fantasia TEXT,
        inscricao_estadual TEXT,
        inscricao_municipal TEXT,
        logradouro TEXT,
        numero TEXT,
        complemento TEXT,
        bairro TEXT,
        cep TEXT,
        codigo_municipio TEXT,
        municipio TEXT,
        uf TEXT,
        telefone TEXT,
        email TEXT,
        ambiente TEXT NOT NULL DEFAULT 'homologacao',
        nfce_enabled BOOLEAN NOT NULL DEFAULT false,
        nfe_enabled BOOLEAN NOT NULL DEFAULT false,
        nfse_enabled BOOLEAN NOT NULL DEFAULT false,
        nfce_serie INT NOT NULL DEFAULT 1,
        nfe_serie INT NOT NULL DEFAULT 1,
        nfse_serie INT NOT NULL DEFAULT 1,
        nfse_codigo_tributacao TEXT,
        nfse_codigo_nbs TEXT,
        nfse_descricao_padrao TEXT,
        ncm_padrao TEXT,
        emitir_automaticamente BOOLEAN NOT NULL DEFAULT false,
        certificate_pfx TEXT,
        certificate_password TEXT,
        certificate_subject TEXT,
        certificate_cnpj TEXT,
        certificate_valid_from TIMESTAMPTZ,
        certificate_valid_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fiscal_sequences (
        company_id INT NOT NULL,
        ambiente TEXT NOT NULL,
        modelo TEXT NOT NULL,
        serie INT NOT NULL,
        next_number BIGINT NOT NULL DEFAULT 1,
        PRIMARY KEY (company_id, ambiente, modelo, serie)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fiscal_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id INT NOT NULL,
        venda_id INT,
        modelo TEXT NOT NULL,
        ambiente TEXT NOT NULL,
        serie INT NOT NULL,
        numero BIGINT NOT NULL,
        chave TEXT,
        tp_emis INT NOT NULL DEFAULT 1,
        status TEXT NOT NULL,
        protocolo TEXT,
        codigo_status TEXT,
        motivo TEXT,
        valor NUMERIC(14,2) NOT NULL DEFAULT 0,
        destinatario_documento TEXT,
        destinatario_nome TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        xml TEXT,
        xml_cancelamento TEXT,
        qrcode_url TEXT,
        attempts INT NOT NULL DEFAULT 0,
        next_retry_at TIMESTAMPTZ,
        emitted_at TIMESTAMPTZ,
        authorized_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        created_by INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, modelo, ambiente, serie, numero)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS fiscal_documents_venda_idx ON fiscal_documents (company_id, venda_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS fiscal_documents_created_idx ON fiscal_documents (company_id, created_at DESC)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS fiscal_documents_retry_idx ON fiscal_documents (next_retry_at) WHERE status = 'contingencia'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fiscal_documents`);
    await queryRunner.query(`DROP TABLE IF EXISTS fiscal_sequences`);
    await queryRunner.query(`DROP TABLE IF EXISTS fiscal_settings`);
  }
}
