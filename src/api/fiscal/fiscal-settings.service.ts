import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import axios from "axios";
import { LoadedCertificate, loadCertificate } from "./certificate";
import { FiscalDb } from "./fiscal-db";
import { digits } from "./nfe/nfe-builder";
import { SUPPORTED_NFE_UFS } from "./sefaz/webservices";
import { decryptSecret, encryptSecret } from "./secret-box";
import { Emitente } from "./types";

export interface FiscalSettingsRow {
  company_id: number;
  regime: string;
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  codigo_municipio: string | null;
  municipio: string | null;
  uf: string | null;
  telefone: string | null;
  email: string | null;
  ambiente: "homologacao" | "producao";
  nfce_enabled: boolean;
  nfe_enabled: boolean;
  nfse_enabled: boolean;
  nfce_serie: number;
  nfe_serie: number;
  nfse_serie: number;
  nfse_codigo_tributacao: string | null;
  nfse_codigo_nbs: string | null;
  nfse_descricao_padrao: string | null;
  ncm_padrao: string | null;
  emitir_automaticamente: boolean;
  certificate_pfx: string | null;
  certificate_password: string | null;
  certificate_subject: string | null;
  certificate_cnpj: string | null;
  certificate_valid_from: Date | null;
  certificate_valid_until: Date | null;
}

const EDITABLE_TEXT = [
  "regime",
  "cnpj",
  "razao_social",
  "nome_fantasia",
  "inscricao_estadual",
  "inscricao_municipal",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cep",
  "codigo_municipio",
  "municipio",
  "uf",
  "telefone",
  "email",
  "ambiente",
  "nfse_codigo_tributacao",
  "nfse_codigo_nbs",
  "nfse_descricao_padrao",
  "ncm_padrao",
] as const;
const EDITABLE_BOOL = ["nfce_enabled", "nfe_enabled", "nfse_enabled", "emitir_automaticamente"] as const;
const EDITABLE_INT = ["nfce_serie", "nfe_serie", "nfse_serie"] as const;
const DIGITS_ONLY = new Set(["cnpj", "cep", "codigo_municipio", "telefone", "nfse_codigo_tributacao", "nfse_codigo_nbs", "ncm_padrao"]);

export const REGIMES = [
  { value: "mei", label: "MEI — Microempreendedor Individual", available: true },
  { value: "simples", label: "Simples Nacional (ME/EPP)", available: false },
  { value: "normal", label: "Lucro Presumido / Real", available: false },
];

export function isValidCnpj(value: string): boolean {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(cnpj.slice(0, 12)) === Number(cnpj[12]) && calc(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

@Injectable()
export class FiscalSettingsService {
  constructor(private readonly db: FiscalDb) {}

  async row(companyId: number): Promise<FiscalSettingsRow | null> {
    const { rows } = await this.db.query<FiscalSettingsRow>(`SELECT * FROM fiscal_settings WHERE company_id = $1`, [companyId]);
    return rows[0] || null;
  }

  private async ensureRow(companyId: number): Promise<FiscalSettingsRow> {
    const existing = await this.row(companyId);
    if (existing) return existing;
    // Primeiro acesso: aproveita o que a empresa já cadastrou na configuração geral.
    const { rows: setup } = await this.db.query(
      `SELECT "companyName", "companyCNPJ", company_phone, company_email FROM "companie-setup" WHERE "companyId" = $1 AND deleted_at IS NULL LIMIT 1`,
      [companyId]
    );
    const s = setup[0] || {};
    await this.db.query(
      `INSERT INTO fiscal_settings (company_id, razao_social, cnpj, telefone, email) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [companyId, s.companyName || null, digits(s.companyCNPJ) || null, digits(s.company_phone) || null, s.company_email || null]
    );
    return (await this.row(companyId))!;
  }

  async view(companyId: number) {
    const row = await this.ensureRow(companyId);
    const { certificate_pfx, certificate_password, ...fields } = row;
    const daysLeft = row.certificate_valid_until
      ? Math.floor((new Date(row.certificate_valid_until).getTime() - Date.now()) / 86400000)
      : null;
    const checklist = this.checklist(row);
    return {
      settings: fields,
      certificate: certificate_pfx
        ? {
            subject: row.certificate_subject,
            cnpj: row.certificate_cnpj,
            validFrom: row.certificate_valid_from,
            validUntil: row.certificate_valid_until,
            daysLeft,
          }
        : null,
      checklist,
      ready: this.readiness(row, checklist),
      regimes: REGIMES,
      supportedUfs: SUPPORTED_NFE_UFS,
    };
  }

  async update(companyId: number, body: Record<string, any>) {
    await this.ensureRow(companyId);
    const sets: string[] = [];
    const values: unknown[] = [companyId];
    for (const field of EDITABLE_TEXT) {
      if (!(field in body)) continue;
      let value = body[field] === null || body[field] === undefined ? null : String(body[field]).trim();
      if (value && DIGITS_ONLY.has(field)) value = digits(value);
      if (field === "uf" && value) value = value.toUpperCase().slice(0, 2);
      if (field === "regime" && value && !REGIMES.find((r) => r.value === value && r.available)) {
        throw new BadRequestException("Por enquanto a emissão está disponível apenas para MEI.");
      }
      if (field === "ambiente" && value && !["homologacao", "producao"].includes(value)) {
        throw new BadRequestException("Ambiente inválido");
      }
      if (field === "cnpj" && value && !isValidCnpj(value)) throw new BadRequestException("CNPJ inválido");
      values.push(value || null);
      sets.push(`${field} = $${values.length}`);
    }
    for (const field of EDITABLE_BOOL) {
      if (!(field in body)) continue;
      values.push(!!body[field]);
      sets.push(`${field} = $${values.length}`);
    }
    for (const field of EDITABLE_INT) {
      if (!(field in body)) continue;
      const serie = Number(body[field]);
      if (!Number.isInteger(serie) || serie < 1 || serie > 889) throw new BadRequestException("Série deve ser um número entre 1 e 889");
      values.push(serie);
      sets.push(`${field} = $${values.length}`);
    }
    if (sets.length) {
      await this.db.query(`UPDATE fiscal_settings SET ${sets.join(", ")}, updated_at = now() WHERE company_id = $1`, values);
    }
    return this.view(companyId);
  }

  async saveCertificate(companyId: number, file: Buffer | undefined, password: string) {
    if (!file?.length) throw new BadRequestException("Envie o arquivo do certificado (.pfx ou .p12)");
    if (!password) throw new BadRequestException("Informe a senha do certificado");
    const row = await this.ensureRow(companyId);
    const cert = loadCertificate(file, password);
    if (cert.validUntil.getTime() < Date.now()) {
      throw new BadRequestException(`Este certificado venceu em ${cert.validUntil.toLocaleDateString("pt-BR")}`);
    }
    const companyCnpj = digits(row.cnpj);
    if (companyCnpj && cert.cnpj && cert.cnpj.slice(0, 8) !== companyCnpj.slice(0, 8)) {
      throw new BadRequestException(`O certificado é do CNPJ ${cert.cnpj}, diferente do CNPJ da empresa (${companyCnpj}).`);
    }
    await this.db.query(
      `UPDATE fiscal_settings SET certificate_pfx = $2, certificate_password = $3, certificate_subject = $4, certificate_cnpj = $5,
         certificate_valid_from = $6, certificate_valid_until = $7, cnpj = COALESCE(cnpj, $5), updated_at = now()
       WHERE company_id = $1`,
      [companyId, encryptSecret(file), encryptSecret(password), cert.subject, cert.cnpj, cert.validFrom, cert.validUntil]
    );
    return this.view(companyId);
  }

  async removeCertificate(companyId: number) {
    await this.db.query(
      `UPDATE fiscal_settings SET certificate_pfx = NULL, certificate_password = NULL, certificate_subject = NULL, certificate_cnpj = NULL,
         certificate_valid_from = NULL, certificate_valid_until = NULL, updated_at = now() WHERE company_id = $1`,
      [companyId]
    );
    return this.view(companyId);
  }

  certificateOf(row: FiscalSettingsRow): LoadedCertificate {
    if (!row.certificate_pfx || !row.certificate_password) {
      throw new BadRequestException("Envie o certificado digital A1 na configuração fiscal");
    }
    const cert = loadCertificate(decryptSecret(row.certificate_pfx), decryptSecret(row.certificate_password).toString("utf8"));
    if (cert.validUntil.getTime() < Date.now()) {
      throw new BadRequestException("O certificado digital venceu. Envie o certificado renovado na configuração fiscal.");
    }
    return cert;
  }

  emitenteOf(row: FiscalSettingsRow): Emitente {
    return {
      regime: "mei",
      cnpj: digits(row.cnpj),
      razaoSocial: row.razao_social || "",
      nomeFantasia: row.nome_fantasia,
      inscricaoEstadual: row.inscricao_estadual,
      inscricaoMunicipal: row.inscricao_municipal,
      logradouro: row.logradouro || "",
      numero: row.numero || "S/N",
      complemento: row.complemento,
      bairro: row.bairro || "",
      cep: digits(row.cep),
      codigoMunicipio: digits(row.codigo_municipio),
      municipio: row.municipio || "",
      uf: (row.uf || "").toUpperCase(),
      telefone: row.telefone,
      email: row.email,
    };
  }

  async requireRow(companyId: number): Promise<FiscalSettingsRow> {
    const row = await this.row(companyId);
    if (!row) throw new NotFoundException("Configure a emissão fiscal em Configurações > Dados da Empresa > Nota fiscal");
    return row;
  }

  checklist(row: FiscalSettingsRow) {
    const certValid = !!row.certificate_pfx && !!row.certificate_valid_until && new Date(row.certificate_valid_until).getTime() > Date.now();
    const certMatches = !row.certificate_cnpj || !row.cnpj || row.certificate_cnpj.slice(0, 8) === digits(row.cnpj).slice(0, 8);
    const address =
      !!row.logradouro && !!row.bairro && digits(row.cep).length === 8 && digits(row.codigo_municipio).length === 7 && !!row.municipio && !!row.uf;
    return [
      { key: "regime", label: "Regime tributário", ok: row.regime === "mei", hint: "Por enquanto a emissão atende MEI" },
      { key: "dados", label: "CNPJ e razão social", ok: isValidCnpj(row.cnpj || "") && !!row.razao_social, hint: "Preencha pelo CNPJ" },
      { key: "endereco", label: "Endereço completo com código do município (IBGE)", ok: address, hint: "Use a busca pelo CNPJ" },
      {
        key: "certificado",
        label: "Certificado digital A1 válido",
        ok: certValid && certMatches,
        hint: !row.certificate_pfx ? "Envie o arquivo .pfx e a senha" : !certMatches ? "Certificado de outro CNPJ" : "Certificado vencido",
      },
      {
        key: "ie",
        label: "Inscrição Estadual (para NFC-e e NF-e)",
        ok: digits(row.inscricao_estadual).length >= 2,
        hint: "Obrigatória para vender produtos com nota",
      },
      {
        key: "uf",
        label: "Estado atendido para NFC-e e NF-e",
        ok: SUPPORTED_NFE_UFS.includes((row.uf || "").toUpperCase()),
        hint: `Disponível em: ${SUPPORTED_NFE_UFS.join(", ")}`,
      },
      {
        key: "nfse",
        label: "Código de tributação nacional do serviço (para NFS-e)",
        ok: digits(row.nfse_codigo_tributacao).length === 6,
        hint: "6 dígitos, ex.: 130401 (cópias e impressões). Confira com seu contador",
      },
    ];
  }

  readiness(row: FiscalSettingsRow, checklist = this.checklist(row)) {
    const ok = (key: string) => checklist.find((c) => c.key === key)?.ok;
    const base = ok("regime") && ok("dados") && ok("endereco") && ok("certificado");
    const produtos = !!(base && ok("ie") && ok("uf"));
    return {
      nfce: produtos && row.nfce_enabled,
      nfe: produtos && row.nfe_enabled,
      nfse: !!(base && ok("nfse")) && row.nfse_enabled,
    };
  }

  async lookupCnpj(cnpj: string) {
    const doc = digits(cnpj);
    if (!isValidCnpj(doc)) throw new BadRequestException("CNPJ inválido");
    try {
      const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, { timeout: 15000 });
      const logradouro = [data.descricao_tipo_de_logradouro, data.logradouro].filter(Boolean).join(" ").trim();
      return {
        cnpj: doc,
        razao_social: data.razao_social || "",
        nome_fantasia: data.nome_fantasia || "",
        logradouro: logradouro || data.logradouro || "",
        numero: data.numero || "",
        complemento: data.complemento || "",
        bairro: data.bairro || "",
        cep: digits(data.cep),
        codigo_municipio: String(data.codigo_municipio_ibge || ""),
        municipio: data.municipio || "",
        uf: data.uf || "",
        telefone: digits(data.ddd_telefone_1),
        email: data.email || "",
        mei: !!data.opcao_pelo_mei,
        situacao: data.descricao_situacao_cadastral || "",
      };
    } catch (err: any) {
      if (err?.response?.status === 404) throw new BadRequestException("CNPJ não encontrado na Receita Federal");
      throw new BadRequestException("Não foi possível consultar o CNPJ agora. Tente de novo em instantes.");
    }
  }
}
