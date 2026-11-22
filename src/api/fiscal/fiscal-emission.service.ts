import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { LoadedCertificate } from "./certificate";
import { FiscalDb } from "./fiscal-db";
import { FiscalSettingsRow, FiscalSettingsService } from "./fiscal-settings.service";
import { buildNfe, digits, nowBrasilia, wrapNfeProc } from "./nfe/nfe-builder";
import { authorize, cancel, consultByKey, inutilize, isAuthorized, isEventRegistered, serviceStatus } from "./nfe/nfe-sefaz";
import { NfseUnavailableError, buildDps, cancelNfse, dpsId, emitNfse, findByDps, getNfse, probeNfse } from "./nfse/nfse";
import { SefazUnavailableError } from "./sefaz/sefaz.client";
import { Destinatario, Emitente, ItemFiscal, Pagamento, TipoPagamento } from "./types";

export type Modelo = "nfce" | "nfe" | "nfse";
export type DocStatus =
  | "processando"
  | "autorizada"
  | "rejeitada"
  | "contingencia"
  | "erro"
  | "cancelada"
  | "inutilizada"
  | "descartada";

export interface EmitOptions {
  destinatario?: Destinatario | null;
  troco?: number;
  incluir?: ("produtos" | "servicos")[];
}

interface SaleLine {
  item: ItemFiscal;
  servico: boolean;
}

const PAYMENT_CODES: Record<string, TipoPagamento> = {
  dinheiro: "01",
  credito: "03",
  debito: "04",
  pix: "20",
};

const ACTIVE: DocStatus[] = ["processando", "autorizada", "contingencia"];
const round2 = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class FiscalEmissionService {
  private readonly logger = new Logger("FiscalEmission");

  constructor(private readonly db: FiscalDb, private readonly settings: FiscalSettingsService) {}

  // ---------- Venda → documentos ----------

  async emitForSale(companyId: number, userId: number | null, vendaId: number, options: EmitOptions = {}) {
    const row = await this.settings.requireRow(companyId);
    const ready = this.settings.readiness(row);
    const venda = await this.loadSale(companyId, vendaId);
    const lines = await this.saleLines(companyId, venda, row);
    const existing = await this.documentsForSale(companyId, vendaId);
    const active = (modelos: Modelo[]) => existing.filter((d) => modelos.includes(d.modelo) && ACTIVE.includes(d.status));

    const incluir = options.incluir?.length ? options.incluir : ["produtos", "servicos"];
    const produtos = lines.filter((l) => !l.servico).map((l) => l.item);
    const servicos = lines.filter((l) => l.servico).map((l) => l.item);
    const avisos: string[] = [];
    const destDoc = digits(options.destinatario?.documento);
    if (destDoc && ![11, 14].includes(destDoc.length)) throw new BadRequestException("CPF/CNPJ do cliente inválido");

    if (incluir.includes("produtos") && produtos.length) {
      const modelo: Modelo = destDoc.length === 14 ? "nfe" : "nfce";
      if (active(["nfce", "nfe"]).length) {
        avisos.push("Os produtos desta venda já têm nota emitida.");
      } else if (!ready[modelo]) {
        avisos.push(
          modelo === "nfe"
            ? "Venda para CNPJ exige NF-e, que não está habilitada ou configurada."
            : "NFC-e não está habilitada ou a configuração fiscal está incompleta."
        );
      } else {
        const missingNcm = produtos.filter((p) => digits(p.ncm).length !== 8);
        if (missingNcm.length) {
          throw new BadRequestException(
            `Produtos sem NCM válido: ${missingNcm.map((p) => p.descricao).slice(0, 5).join(", ")}. Corrija o cadastro ou defina um NCM padrão na configuração fiscal.`
          );
        }
        const destinatario = modelo === "nfe" ? await this.completeCompanyRecipient(options.destinatario!) : options.destinatario;
        await this.emitNfeFamily(companyId, userId, row, {
          vendaId,
          modelo,
          itens: produtos,
          destinatario: destDoc ? destinatario : null,
          metodoPagamento: venda.metodoPagamento,
          troco: !servicos.length || !incluir.includes("servicos") ? Number(options.troco || 0) : 0,
        });
      }
    }

    if (incluir.includes("servicos") && servicos.length) {
      if (active(["nfse"]).length) {
        avisos.push("Os serviços desta venda já têm NFS-e emitida.");
      } else if (!ready.nfse) {
        avisos.push("NFS-e não está habilitada ou falta o código de tributação do serviço.");
      } else {
        await this.emitNfseForSale(companyId, userId, row, { vendaId, itens: servicos, tomador: destDoc ? options.destinatario : null });
      }
    }

    return { documentos: await this.documentsForSale(companyId, vendaId), avisos };
  }

  private async loadSale(companyId: number, vendaId: number) {
    const { rows } = await this.db.query(
      `SELECT id, total, desconto, "metodoPagamento", produtos, "clienteId" FROM venda WHERE id = $1 AND "companyId" = $2 AND deleted_at IS NULL`,
      [vendaId, companyId]
    );
    if (!rows[0]) throw new NotFoundException("Venda não encontrada");
    return rows[0];
  }

  // Valores por item como foram vendidos; a diferença para o total da venda vira desconto rateado.
  private async saleLines(companyId: number, venda: any, row: FiscalSettingsRow): Promise<SaleLine[]> {
    const raw: any[] = typeof venda.produtos === "string" ? JSON.parse(venda.produtos || "[]") : venda.produtos || [];
    const ids = raw.map((p) => Number(p.id)).filter(Boolean);
    const { rows: produtos } = ids.length
      ? await this.db.query(`SELECT id, descricao, categoria, ncm, ean, unidade FROM produto WHERE "companyId" = $1 AND id = ANY($2::int[])`, [
          companyId,
          ids,
        ])
      : { rows: [] as any[] };
    const byId = new Map(produtos.map((p: any) => [Number(p.id), p]));

    const lines: SaleLine[] = raw
      .map((p) => {
        const cadastro: any = byId.get(Number(p.id)) || {};
        const quantidade = Number(p.quantidade ?? p.qtd ?? 1) || 1;
        const valorUnitario = Number(p.valorEditado ?? p.valor ?? 0);
        const categoria = String(cadastro.categoria ?? p.categoria ?? "");
        return {
          servico: /servi/i.test(categoria),
          item: {
            codigo: String(p.id ?? cadastro.id ?? ""),
            descricao: String(cadastro.descricao ?? p.descricao ?? "Item"),
            ncm: digits(cadastro.ncm ?? p.ncm) || digits(row.ncm_padrao),
            gtin: cadastro.ean ?? p.ean ?? null,
            unidade: String(cadastro.unidade ?? p.unidade ?? "UN"),
            quantidade,
            valorUnitario,
            valorBruto: round2(quantidade * valorUnitario),
            desconto: 0,
          },
        };
      })
      .filter((l) => l.item.valorBruto > 0);

    if (!lines.length) throw new BadRequestException("A venda não tem itens com valor para emitir nota");
    const bruto = round2(lines.reduce((sum, l) => sum + l.item.valorBruto, 0));
    const desconto = round2(bruto - Number(venda.total || 0));
    if (desconto > 0.009) {
      let restante = desconto;
      lines.forEach((l, index) => {
        const parte = index === lines.length - 1 ? restante : round2((desconto * l.item.valorBruto) / bruto);
        l.item.desconto = Math.min(round2(parte), round2(l.item.valorBruto - 0.01));
        restante = round2(restante - l.item.desconto);
      });
    }
    return lines;
  }

  private async completeCompanyRecipient(dest: Destinatario): Promise<Destinatario> {
    if (dest.endereco?.codigoMunicipio && dest.endereco.logradouro) return dest;
    const info = await this.settings.lookupCnpj(dest.documento);
    return {
      ...dest,
      nome: dest.nome || info.razao_social,
      email: dest.email || info.email || null,
      endereco: {
        logradouro: info.logradouro,
        numero: info.numero || "S/N",
        complemento: info.complemento,
        bairro: info.bairro || "Centro",
        codigoMunicipio: info.codigo_municipio,
        municipio: info.municipio,
        uf: info.uf,
        cep: info.cep,
      },
    };
  }

  // ---------- Numeração ----------

  private async nextNumber(client: PoolClient, companyId: number, ambiente: string, modelo: Modelo, serie: number): Promise<number> {
    const { rows } = await client.query(
      `INSERT INTO fiscal_sequences (company_id, ambiente, modelo, serie, next_number) VALUES ($1, $2, $3, $4, 2)
       ON CONFLICT (company_id, ambiente, modelo, serie) DO UPDATE SET next_number = fiscal_sequences.next_number + 1
       RETURNING next_number - 1 AS numero`,
      [companyId, ambiente, modelo, serie]
    );
    return Number(rows[0].numero);
  }

  private async createDocument(params: {
    companyId: number;
    userId: number | null;
    vendaId: number | null;
    modelo: Modelo;
    ambiente: string;
    serie: number;
    valor: number;
    destinatario?: Destinatario | null;
    payload: any;
  }) {
    return this.db.transaction(async (client) => {
      const numero = await this.nextNumber(client, params.companyId, params.ambiente, params.modelo, params.serie);
      const { rows } = await client.query(
        `INSERT INTO fiscal_documents (company_id, venda_id, modelo, ambiente, serie, numero, status, valor, destinatario_documento,
           destinatario_nome, payload, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'processando', $7, $8, $9, $10, $11) RETURNING *`,
        [
          params.companyId,
          params.vendaId,
          params.modelo,
          params.ambiente,
          params.serie,
          numero,
          params.valor,
          digits(params.destinatario?.documento) || null,
          params.destinatario?.nome || null,
          params.payload,
          params.userId,
        ]
      );
      return rows[0];
    });
  }

  private async updateDocument(id: string, fields: Record<string, unknown>) {
    const keys = Object.keys(fields);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    await this.db.query(`UPDATE fiscal_documents SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, [
      id,
      ...keys.map((k) => fields[k]),
    ]);
  }

  // ---------- NFC-e / NF-e ----------

  private payments(metodo: string, vNF: number, troco: number): Pagamento[] {
    const tipo = PAYMENT_CODES[String(metodo || "").toLowerCase()] || "99";
    const extra = tipo === "01" ? round2(Math.max(0, troco)) : 0;
    return [{ tipo, valor: round2(vNF + extra) }];
  }

  private async emitNfeFamily(
    companyId: number,
    userId: number | null,
    row: FiscalSettingsRow,
    params: { vendaId: number | null; modelo: "nfce" | "nfe"; itens: ItemFiscal[]; destinatario?: Destinatario | null; metodoPagamento: string; troco: number }
  ) {
    const cert = this.settings.certificateOf(row);
    const emitente = this.settings.emitenteOf(row);
    const vNF = round2(params.itens.reduce((s, i) => s + i.valorBruto - i.desconto, 0));
    const troco = PAYMENT_CODES[String(params.metodoPagamento).toLowerCase()] === "01" ? round2(params.troco) : 0;
    const doc = await this.createDocument({
      companyId,
      userId,
      vendaId: params.vendaId,
      modelo: params.modelo,
      ambiente: row.ambiente,
      serie: params.modelo === "nfce" ? row.nfce_serie : row.nfe_serie,
      valor: vNF,
      destinatario: params.destinatario,
      payload: {
        emitente,
        destinatario: params.destinatario || null,
        itens: params.itens,
        pagamentos: this.payments(params.metodoPagamento, vNF, troco),
        troco,
      },
    });
    return this.transmitNfe(doc, row, cert);
  }

  // Monta, assina e envia. Sem resposta da SEFAZ, a NFC-e sai em contingência offline com o mesmo número.
  private async transmitNfe(doc: any, row: FiscalSettingsRow, cert: LoadedCertificate) {
    const p = doc.payload;
    const modelo = doc.modelo as "nfce" | "nfe";
    const emitente: Emitente = this.settings.emitenteOf(row);
    const dhEmi = nowBrasilia();
    const base = {
      modelo,
      ambiente: doc.ambiente,
      serie: doc.serie,
      numero: Number(doc.numero),
      dhEmi,
      emitente,
      destinatario: p.destinatario,
      itens: p.itens,
      pagamentos: p.pagamentos,
      troco: p.troco || 0,
    };

    const online = buildNfe({ ...base, tpEmis: 1 }, cert);
    await this.updateDocument(doc.id, {
      chave: online.chave,
      tp_emis: 1,
      xml: online.xml,
      qrcode_url: online.qrCodeUrl,
      emitted_at: new Date(),
      attempts: Number(doc.attempts || 0) + 1,
      payload: { ...p, emitente, dhEmi, totals: online.totals, urlChave: online.urlChave, cNF: online.cNF },
    });
    try {
      const result = await authorize({ uf: emitente.uf, modelo, ambiente: doc.ambiente, signedXml: online.xml, cert });
      return this.applyAuthorization(doc.id, online.xml, result);
    } catch (err: any) {
      if (!(err instanceof SefazUnavailableError)) {
        this.logger.error(`[${doc.id}] ${err?.message || err}`);
        await this.updateDocument(doc.id, { status: "erro", motivo: String(err?.message || err).slice(0, 500) });
        return this.getDocument(doc.company_id, doc.id);
      }
      this.logger.warn(`[${doc.id}] SEFAZ indisponível: ${err.message}`);
      if (modelo !== "nfce") {
        await this.updateDocument(doc.id, { status: "erro", motivo: `${err.message}. Tente reenviar em instantes.` });
        return this.getDocument(doc.company_id, doc.id);
      }
    }

    const offline = buildNfe(
      {
        ...base,
        tpEmis: 9,
        cNF: online.cNF,
        contingencia: { dhCont: dhEmi, justificativa: "SEFAZ indisponivel - falha de comunicacao com o web service de autorizacao" },
      },
      cert
    );
    await this.updateDocument(doc.id, {
      status: "contingencia",
      chave: offline.chave,
      tp_emis: 9,
      xml: offline.xml,
      qrcode_url: offline.qrCodeUrl,
      motivo: "Emitida em contingência offline. Será transmitida automaticamente à SEFAZ.",
      next_retry_at: new Date(Date.now() + 2 * 60000),
      payload: {
        ...p,
        emitente,
        dhEmi,
        totals: offline.totals,
        urlChave: offline.urlChave,
        cNF: online.cNF,
        chaveOnline: online.chave,
        xmlOnline: online.xml,
      },
    });
    return this.getDocument(doc.company_id, doc.id);
  }

  private async applyAuthorization(docId: string, signedXml: string, result: { cStat: string; xMotivo: string; protocolo?: string; protXml?: string }) {
    if (isAuthorized(result.cStat)) {
      await this.updateDocument(docId, {
        status: "autorizada",
        protocolo: result.protocolo || null,
        codigo_status: result.cStat,
        motivo: result.xMotivo,
        xml: result.protXml ? wrapNfeProc(signedXml, result.protXml) : signedXml,
        authorized_at: new Date(),
        next_retry_at: null,
      });
    } else {
      await this.updateDocument(docId, { status: "rejeitada", codigo_status: result.cStat, motivo: `${result.cStat} - ${result.xMotivo}` });
    }
    const { rows } = await this.db.query(`SELECT company_id FROM fiscal_documents WHERE id = $1`, [docId]);
    return this.getDocument(rows[0].company_id, docId);
  }

  /** Envia à SEFAZ as NFC-e emitidas em contingência offline. */
  async transmitPendingContingency(limit = 10) {
    const docs = await this.db.transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM fiscal_documents WHERE status = 'contingencia' AND (next_retry_at IS NULL OR next_retry_at <= now())
         ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [limit]
      );
      for (const doc of rows) {
        await client.query(`UPDATE fiscal_documents SET next_retry_at = now() + interval '10 minutes' WHERE id = $1`, [doc.id]);
      }
      return rows;
    });

    for (const doc of docs) {
      try {
        const row = await this.settings.requireRow(doc.company_id);
        const cert = this.settings.certificateOf(row);
        const uf = this.settings.emitenteOf(row).uf;
        const result = await authorize({ uf, modelo: doc.modelo, ambiente: doc.ambiente, signedXml: doc.xml, cert });
        if (result.cStat === "539" && doc.payload?.chaveOnline) {
          // A emissão online chegou a ser autorizada: vale a nota original.
          const original = await consultByKey({ uf, modelo: doc.modelo, ambiente: doc.ambiente, chave: doc.payload.chaveOnline, cert });
          if (isAuthorized(original.cStat)) {
            await this.updateDocument(doc.id, { chave: doc.payload.chaveOnline, tp_emis: 1, qrcode_url: null });
            await this.applyAuthorization(doc.id, doc.payload.xmlOnline || doc.xml, original);
            continue;
          }
        }
        await this.applyAuthorization(doc.id, doc.xml, result);
        await this.updateDocument(doc.id, { attempts: Number(doc.attempts || 0) + 1 });
      } catch (err: any) {
        const backoff = Math.min(60, 2 ** Math.min(Number(doc.attempts || 0), 6));
        await this.updateDocument(doc.id, {
          status: "contingencia",
          attempts: Number(doc.attempts || 0) + 1,
          next_retry_at: new Date(Date.now() + backoff * 60000),
          motivo: `Aguardando transmissão: ${String(err?.message || err).slice(0, 300)}`,
        });
      }
    }
    return docs.length;
  }

  // ---------- NFS-e ----------

  private async emitNfseForSale(
    companyId: number,
    userId: number | null,
    row: FiscalSettingsRow,
    params: { vendaId: number | null; itens: ItemFiscal[]; tomador?: Destinatario | null }
  ) {
    const valor = round2(params.itens.reduce((s, i) => s + i.valorBruto - i.desconto, 0));
    const lista = params.itens
      .map((i) => `${Number.isInteger(i.quantidade) ? i.quantidade : i.quantidade.toFixed(2)}x ${i.descricao}`)
      .join("; ");
    const descricao = [row.nfse_descricao_padrao, lista].filter(Boolean).join(" - ");
    const doc = await this.createDocument({
      companyId,
      userId,
      vendaId: params.vendaId,
      modelo: "nfse",
      ambiente: row.ambiente,
      serie: row.nfse_serie,
      valor,
      destinatario: params.tomador,
      payload: { itens: params.itens, tomador: params.tomador || null, descricao },
    });
    return this.transmitNfse(doc, row);
  }

  private async transmitNfse(doc: any, row: FiscalSettingsRow) {
    const cert = this.settings.certificateOf(row);
    const emitente = this.settings.emitenteOf(row);
    const id = dpsId({ emitente, serie: doc.serie, numero: Number(doc.numero) });

    // Reenvio: se a DPS já virou nota (timeout na tentativa anterior), só recupera.
    if (Number(doc.attempts || 0) > 0) {
      const chave = await findByDps(doc.ambiente, id, cert).catch((): null => null);
      if (chave) {
        const xml = await getNfse(doc.ambiente, chave, cert).catch((): undefined => undefined);
        await this.updateDocument(doc.id, { status: "autorizada", chave, xml: xml || doc.xml, authorized_at: new Date(), motivo: "Autorizada" });
        return this.getDocument(doc.company_id, doc.id);
      }
    }

    const dhEmi = nowBrasilia();
    const dps = buildDps(
      {
        ambiente: doc.ambiente,
        serie: doc.serie,
        numero: Number(doc.numero),
        dhEmi,
        emitente,
        tomador: doc.payload?.tomador,
        codigoTributacao: row.nfse_codigo_tributacao || "",
        codigoNbs: row.nfse_codigo_nbs,
        descricao: doc.payload?.descricao || "Prestação de serviços",
        valor: Number(doc.valor),
      },
      cert
    );
    await this.updateDocument(doc.id, {
      xml: dps.xml,
      emitted_at: new Date(),
      attempts: Number(doc.attempts || 0) + 1,
      payload: { ...doc.payload, emitente, dhEmi, dpsId: id },
    });

    try {
      const result = await emitNfse(doc.ambiente, dps.xml, cert);
      if (result.ok && result.chave) {
        await this.updateDocument(doc.id, {
          status: "autorizada",
          chave: result.chave,
          xml: result.xml || dps.xml,
          codigo_status: String(result.status),
          motivo: "Autorizada",
          authorized_at: new Date(),
        });
      } else {
        const motivo = result.erros.map((e) => `${e.codigo} ${e.descricao}`.trim()).join(" | ") || `HTTP ${result.status}`;
        await this.updateDocument(doc.id, { status: "rejeitada", codigo_status: result.erros[0]?.codigo || String(result.status), motivo });
      }
    } catch (err: any) {
      const motivo = err instanceof NfseUnavailableError ? `${err.message}. Tente reenviar em instantes.` : String(err?.message || err);
      if (!(err instanceof NfseUnavailableError)) this.logger.error(`[${doc.id}] ${motivo}`);
      await this.updateDocument(doc.id, { status: "erro", motivo: motivo.slice(0, 500) });
    }
    return this.getDocument(doc.company_id, doc.id);
  }

  // ---------- Ações sobre documentos ----------

  async retry(companyId: number, id: string) {
    const doc = await this.rawDocument(companyId, id);
    const row = await this.settings.requireRow(companyId);
    if (doc.status === "contingencia") {
      await this.updateDocument(id, { next_retry_at: new Date() });
      await this.transmitPendingContingency(5);
      return this.getDocument(companyId, id);
    }
    if (!["rejeitada", "erro"].includes(doc.status)) throw new BadRequestException("Só é possível reenviar notas rejeitadas ou com erro");
    await this.updateDocument(id, { status: "processando" });
    if (doc.modelo === "nfse") return this.transmitNfse({ ...doc, status: "processando" }, row);
    return this.transmitNfe({ ...doc, status: "processando" }, row, this.settings.certificateOf(row));
  }

  async cancelDocument(companyId: number, id: string, motivo: string) {
    const justificativa = String(motivo || "").trim();
    if (justificativa.length < 15) throw new BadRequestException("Descreva o motivo do cancelamento com pelo menos 15 caracteres");
    const doc = await this.rawDocument(companyId, id);
    if (doc.status === "contingencia") {
      throw new BadRequestException("A nota ainda não foi transmitida à SEFAZ. Aguarde a transmissão para cancelar.");
    }
    if (doc.status !== "autorizada") throw new BadRequestException("Só é possível cancelar notas autorizadas");
    const row = await this.settings.requireRow(companyId);
    const cert = this.settings.certificateOf(row);
    const emitente = this.settings.emitenteOf(row);

    if (doc.modelo === "nfse") {
      const result = await cancelNfse({ ambiente: doc.ambiente, chave: doc.chave, cnpj: emitente.cnpj, motivo: justificativa, cert });
      if (!result.ok) {
        throw new BadRequestException(
          `Cancelamento recusado: ${result.erros.map((e) => `${e.codigo} ${e.descricao}`).join(" | ") || `HTTP ${result.status}`}`
        );
      }
      await this.updateDocument(id, { status: "cancelada", xml_cancelamento: result.xml || null, cancelled_at: new Date(), motivo: justificativa });
      return this.getDocument(companyId, id);
    }

    const result = await cancel({
      uf: emitente.uf,
      modelo: doc.modelo,
      ambiente: doc.ambiente,
      cnpj: emitente.cnpj,
      chave: doc.chave,
      protocolo: doc.protocolo,
      justificativa,
      cert,
    });
    if (!isEventRegistered(result.cStat)) throw new BadRequestException(`Cancelamento recusado pela SEFAZ: ${result.cStat} - ${result.xMotivo}`);
    await this.updateDocument(id, { status: "cancelada", xml_cancelamento: result.eventXml || null, cancelled_at: new Date(), motivo: justificativa });
    return this.getDocument(companyId, id);
  }

  // Desiste de uma nota rejeitada. Na NFC-e/NF-e o número precisa ser inutilizado na SEFAZ.
  async discard(companyId: number, id: string) {
    const doc = await this.rawDocument(companyId, id);
    if (!["rejeitada", "erro"].includes(doc.status)) throw new BadRequestException("Só é possível descartar notas rejeitadas ou com erro");
    if (doc.modelo === "nfse") {
      await this.updateDocument(id, { status: "descartada" });
      return this.getDocument(companyId, id);
    }
    const row = await this.settings.requireRow(companyId);
    const cert = this.settings.certificateOf(row);
    const emitente = this.settings.emitenteOf(row);
    const result = await inutilize({
      uf: emitente.uf,
      modelo: doc.modelo,
      ambiente: doc.ambiente,
      cnpj: emitente.cnpj,
      serie: doc.serie,
      numero: Number(doc.numero),
      justificativa: "Numeracao nao utilizada por rejeicao na emissao da nota",
      cert,
    });
    if (result.cStat !== "102") throw new BadRequestException(`Inutilização recusada pela SEFAZ: ${result.cStat} - ${result.xMotivo}`);
    await this.updateDocument(id, { status: "inutilizada", protocolo: result.protocolo || null, motivo: "Numeração inutilizada" });
    return this.getDocument(companyId, id);
  }

  async testConnection(companyId: number) {
    const row = await this.settings.requireRow(companyId);
    const cert = this.settings.certificateOf(row);
    const emitente = this.settings.emitenteOf(row);
    const results: { servico: string; ok: boolean; mensagem: string }[] = [];

    for (const modelo of ["nfce", "nfe"] as const) {
      try {
        const status = await serviceStatus({ uf: emitente.uf, modelo, ambiente: row.ambiente, cert });
        results.push({ servico: modelo === "nfce" ? "NFC-e (SEFAZ)" : "NF-e (SEFAZ)", ok: status.cStat === "107", mensagem: `${status.cStat} - ${status.xMotivo}` });
      } catch (err: any) {
        results.push({ servico: modelo === "nfce" ? "NFC-e (SEFAZ)" : "NF-e (SEFAZ)", ok: false, mensagem: String(err?.message || err) });
      }
    }
    try {
      const probe = await probeNfse(row.ambiente, cert);
      results.push({ servico: "NFS-e (Emissor Nacional)", ok: probe.ok, mensagem: probe.message });
    } catch (err: any) {
      results.push({ servico: "NFS-e (Emissor Nacional)", ok: false, mensagem: String(err?.message || err) });
    }
    return { ambiente: row.ambiente, resultados: results };
  }

  // ---------- Consulta ----------

  private async rawDocument(companyId: number, id: string) {
    const { rows } = await this.db.query(`SELECT * FROM fiscal_documents WHERE id = $1 AND company_id = $2`, [id, companyId]);
    if (!rows[0]) throw new NotFoundException("Nota não encontrada");
    return rows[0];
  }

  private view(doc: any) {
    const { xml, xml_cancelamento, ...rest } = doc;
    return { ...rest, valor: Number(doc.valor), numero: Number(doc.numero), tem_xml: !!xml };
  }

  async getDocument(companyId: number, id: string) {
    return this.view(await this.rawDocument(companyId, id));
  }

  async documentXml(companyId: number, id: string, tipo: "nota" | "cancelamento" = "nota") {
    const doc = await this.rawDocument(companyId, id);
    const xml = tipo === "cancelamento" ? doc.xml_cancelamento : doc.xml;
    if (!xml) throw new NotFoundException("XML não disponível");
    const prefix = { nfce: "NFCe", nfe: "NFe", nfse: "NFSe" }[doc.modelo as Modelo];
    return { xml, filename: `${prefix}-${doc.chave || doc.numero}${tipo === "cancelamento" ? "-cancelamento" : ""}.xml` };
  }

  async documentsForSale(companyId: number, vendaId: number) {
    const { rows } = await this.db.query(
      `SELECT * FROM fiscal_documents WHERE company_id = $1 AND venda_id = $2 ORDER BY created_at`,
      [companyId, vendaId]
    );
    return rows.map((d) => this.view(d));
  }

  async statusBySales(companyId: number, vendaIds: number[]) {
    if (!vendaIds.length) return {};
    const { rows } = await this.db.query(
      `SELECT venda_id, modelo, status, numero FROM fiscal_documents
       WHERE company_id = $1 AND venda_id = ANY($2::int[]) AND status NOT IN ('descartada', 'inutilizada') ORDER BY created_at`,
      [companyId, vendaIds]
    );
    const result: Record<number, any[]> = {};
    for (const r of rows) (result[r.venda_id] ||= []).push({ modelo: r.modelo, status: r.status, numero: Number(r.numero) });
    return result;
  }

  async list(
    companyId: number,
    filters: { modelo?: string; status?: string; ambiente?: string; from?: string; to?: string; q?: string; page?: number; pageSize?: number }
  ) {
    const where = ["company_id = $1"];
    const values: unknown[] = [companyId];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };
    if (filters.modelo) add("modelo = ?", filters.modelo);
    if (filters.status === "pendente") where.push(`status IN ('rejeitada', 'erro', 'contingencia')`);
    else if (filters.status) add("status = ?", filters.status);
    if (filters.ambiente) add("ambiente = ?", filters.ambiente);
    if (filters.from) add("created_at >= ?::date", filters.from);
    if (filters.to) add("created_at < (?::date + 1)", filters.to);
    const q = String(filters.q || "").trim();
    if (q) {
      const qDigits = q.replace(/\D/g, "");
      values.push(`%${q}%`);
      const like = `$${values.length}`;
      const parts = [`destinatario_nome ILIKE ${like}`, `motivo ILIKE ${like}`];
      if (qDigits) {
        values.push(qDigits);
        const d = `$${values.length}`;
        parts.push(`numero::text = ${d}`, `venda_id::text = ${d}`, `destinatario_documento LIKE '%' || ${d} || '%'`, `chave LIKE '%' || ${d} || '%'`);
      }
      where.push(`(${parts.join(" OR ")})`);
    }
    const whereSql = where.join(" AND ");
    const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 5), 100);
    const page = Math.max(Number(filters.page) || 1, 1);

    const [{ rows }, { rows: summary }] = await Promise.all([
      this.db.query(`SELECT * FROM fiscal_documents WHERE ${whereSql} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, values),
      this.db.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'autorizada')::int AS autorizadas,
                COALESCE(sum(valor) FILTER (WHERE status = 'autorizada'), 0)::float AS valor_autorizado,
                count(*) FILTER (WHERE status IN ('rejeitada', 'erro', 'contingencia'))::int AS pendencias
           FROM fiscal_documents WHERE ${whereSql}`,
        values
      ),
    ]);
    return { items: rows.map((d) => this.view(d)), page, pageSize, ...summary[0] };
  }
}
