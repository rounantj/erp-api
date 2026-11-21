import { Injectable } from "@nestjs/common";
import { WhatsappDb } from "../whatsapp-db";

const ACCENTS_FROM = "áàâãäéèêëíìîïóòôõöúùûüç";
const ACCENTS_TO = "aaaaaeeeeiiiiooooouuuuc";
const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "para", "pra", "com", "sem", "um", "uma", "e", "o", "a", "os", "as", "em", "no", "na", "tem", "voces", "vcs"]);

export interface CatalogProduct {
  id: number;
  descricao: string;
  valor: number;
  unidade: string | null;
  categoria: string | null;
  estoque: number;
  ean: string | null;
  ncm: string | null;
  imageUrl: string | null;
}

const PRODUCT_COLUMNS = `p.id, p.descricao, p.valor, p.unidade, p.categoria, p.ean, p.ncm,
  NULLIF(p.image_url, '') AS "imageUrl", COALESCE(e.quantity, 0) AS estoque`;

const NORMALIZED_DESCRICAO = `translate(lower(p.descricao), '${ACCENTS_FROM}', '${ACCENTS_TO}')`;

// Há serviços cadastrados com categoria "produto" (ex.: "IMPRESSÃO EM PAPEL 180 gr"); o nome também conta.
const SERVICE_NAME = /^\s*(impress|xerox|plastifica|encaderna|digitaliza|foto 3x4)/i;
const SERVICE_NAME_SQL = `'^\\s*(impress|xerox|plastifica|encaderna|digitaliza|foto 3x4)'`;

export const isService = (categoria: string | null, descricao?: string | null) =>
  (categoria || "").toLowerCase().startsWith("servi") ||
  SERVICE_NAME.test((descricao || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

function toProduct(r: any): CatalogProduct {
  return {
    id: r.id,
    descricao: r.descricao,
    valor: Number(r.valor),
    unidade: r.unidade,
    categoria: r.categoria,
    estoque: Number(r.estoque),
    ean: r.ean,
    ncm: r.ncm,
    imageUrl: r.imageUrl && !String(r.imageUrl).startsWith("data:") ? r.imageUrl : null,
  };
}

function tokens(query: string): string[] {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map(stem)
    .slice(0, 6);
}

// Corta plural e gênero para "colorida" achar "COLORIDO" e "impressoes" achar "IMPRESSAO".
function stem(token: string): string {
  if (token.length <= 4) return token;
  let t = token;
  if (t.endsWith("oes") || t.endsWith("aes")) t = t.slice(0, -3);
  else if (t.endsWith("s")) t = t.slice(0, -1);
  else if (t.length > 5 && /(ar|er|ir)$/.test(t)) return t.slice(0, -2);
  if (t.length > 4 && /[aoe]$/.test(t)) t = t.slice(0, -1);
  return t;
}

@Injectable()
export class CatalogService {
  constructor(private readonly db: WhatsappDb) {}

  async search(companyId: number, query: string, limit = 8): Promise<CatalogProduct[]> {
    const terms = tokens(query);
    if (!terms.length) return [];

    const params: unknown[] = [companyId];
    const score = terms
      .map((term) => {
        params.push(`%${term}%`);
        return `(CASE WHEN ${NORMALIZED_DESCRICAO} LIKE $${params.length} THEN 1 ELSE 0 END)`;
      })
      .join(" + ");
    // Exige ao menos metade dos termos para não trazer ruído em buscas longas.
    const minScore = Math.max(1, Math.ceil(terms.length / 2));
    params.push(limit);

    const { rows } = await this.db.query(
      `SELECT ${PRODUCT_COLUMNS}, (${score}) AS score
       FROM produto p
       LEFT JOIN estoque e ON e."productId" = p.id AND e."companyId" = p."companyId"
       WHERE p."companyId" = $1 AND p.deleted_at IS NULL AND (${score}) >= ${minScore}
       ORDER BY score DESC, length(p.descricao) ASC
       LIMIT $${params.length}`,
      params
    );
    const bestScore = rows.length ? Number(rows[0].score) : 0;
    return rows.filter((r) => Number(r.score) === bestScore).map(toProduct);
  }

  async listServices(companyId: number, limit = 150): Promise<CatalogProduct[]> {
    const { rows } = await this.db.query(
      `SELECT ${PRODUCT_COLUMNS}
       FROM produto p
       LEFT JOIN estoque e ON e."productId" = p.id AND e."companyId" = p."companyId"
       WHERE p."companyId" = $1 AND p.deleted_at IS NULL AND p.valor > 0
         AND (lower(p.categoria) LIKE 'servi%' OR ${NORMALIZED_DESCRICAO} ~ ${SERVICE_NAME_SQL})
       ORDER BY p.descricao
       LIMIT $2`,
      [companyId, limit]
    );
    return rows.map(toProduct);
  }

  async getByIds(companyId: number, ids: number[]): Promise<CatalogProduct[]> {
    if (!ids.length) return [];
    const { rows } = await this.db.query(
      `SELECT ${PRODUCT_COLUMNS}
       FROM produto p
       LEFT JOIN estoque e ON e."productId" = p.id AND e."companyId" = p."companyId"
       WHERE p."companyId" = $1 AND p.deleted_at IS NULL AND p.id = ANY($2::int[])`,
      [companyId, ids]
    );
    return rows.map(toProduct);
  }

  // Não sobrescreve foto existente (alguém pode ter cadastrado uma enquanto a busca rodava).
  async setImageUrlIfEmpty(companyId: number, productId: number, imageUrl: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE produto SET image_url = $3, updated_at = NOW()
       WHERE "companyId" = $1 AND id = $2 AND deleted_at IS NULL AND (image_url IS NULL OR image_url = '')`,
      [companyId, productId, imageUrl]
    );
    return rowCount === 1;
  }

  async findClienteByPhone(companyId: number, phone: string): Promise<{ id: number; nome: string } | null> {
    const local = phone.startsWith("55") ? phone.slice(2) : phone;
    // JIDs antigos do WhatsApp omitem o nono dígito do celular (DDD + 8 dígitos).
    const candidates = [phone, local];
    if (local.length === 10) candidates.push(`${local.slice(0, 2)}9${local.slice(2)}`);
    const { rows } = await this.db.query(
      `SELECT id, nome FROM cliente
       WHERE "companyId" = $1 AND deleted_at IS NULL AND telefone IS NOT NULL
         AND regexp_replace(telefone, '\\D', '', 'g') = ANY($2::text[])
       LIMIT 1`,
      [companyId, candidates]
    );
    return rows[0] ?? null;
  }
}
