import axios from "axios";
import { promisify } from "util";
import { gunzip, gzip } from "zlib";
import { LoadedCertificate, mtlsAgent } from "../certificate";
import { digits, nowBrasilia } from "../nfe/nfe-builder";
import { Ambiente, NFSE_URLS } from "../sefaz/webservices";
import { Destinatario, Emitente } from "../types";
import { group, sanitizeText, signXml, tag, text } from "../xml";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const NFSE_NS = "http://www.sped.fazenda.gov.br/nfse";

export class NfseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NfseUnavailableError";
  }
}

export interface DpsInput {
  ambiente: Ambiente;
  serie: number;
  numero: number;
  dhEmi: string;
  emitente: Emitente;
  tomador?: Destinatario | null;
  codigoTributacao: string;
  codigoNbs?: string | null;
  descricao: string;
  valor: number;
}

export function dpsId(input: Pick<DpsInput, "emitente" | "serie" | "numero">): string {
  return (
    "DPS" +
    digits(input.emitente.codigoMunicipio).padStart(7, "0") +
    "2" +
    digits(input.emitente.cnpj).padStart(14, "0") +
    String(input.serie).padStart(5, "0") +
    String(input.numero).padStart(15, "0")
  );
}

export function buildDps(input: DpsInput, cert: LoadedCertificate): { xml: string; id: string } {
  const id = dpsId(input);
  const emit = input.emitente;
  const tomadorDoc = digits(input.tomador?.documento);

  const prest = group(
    "prest",
    text("CNPJ", digits(emit.cnpj)),
    text("fone", digits(emit.telefone).slice(0, 20) || ""),
    text("email", sanitizeText(emit.email || "", 80)),
    group("regTrib", text("opSimpNac", "2"), text("regEspTrib", "0"))
  );

  const toma = tomadorDoc
    ? group(
        "toma",
        tomadorDoc.length === 14 ? text("CNPJ", tomadorDoc) : text("CPF", tomadorDoc),
        text("xNome", sanitizeText(input.tomador?.nome || "Consumidor", 150)),
        text("email", sanitizeText(input.tomador?.email || "", 80))
      )
    : "";

  const serv = group(
    "serv",
    group("locPrest", text("cLocPrestacao", digits(emit.codigoMunicipio))),
    group(
      "cServ",
      text("cTribNac", digits(input.codigoTributacao).padStart(6, "0")),
      text("xDescServ", sanitizeText(input.descricao, 2000)),
      text("cNBS", digits(input.codigoNbs))
    )
  );

  const valores = group(
    "valores",
    group("vServPrest", text("vServ", (Math.round(input.valor * 100) / 100).toFixed(2))),
    group(
      "trib",
      group("tribMun", text("tribISSQN", "1"), text("tpRetISSQN", "1")),
      group("totTrib", text("indTotTrib", "0"))
    )
  );

  const infDps = tag(
    "infDPS",
    text("tpAmb", input.ambiente === "homologacao" ? "2" : "1") +
      text("dhEmi", input.dhEmi) +
      text("verAplic", "ERP-NextStep-1.0") +
      text("serie", String(input.serie).padStart(5, "0")) +
      text("nDPS", String(input.numero)) +
      text("dCompet", input.dhEmi.slice(0, 10)) +
      text("tpEmit", "1") +
      text("cLocEmi", digits(emit.codigoMunicipio)) +
      prest +
      toma +
      serv +
      valores,
    { Id: id }
  );

  const xml = signXml(`<DPS xmlns="${NFSE_NS}" versao="1.01">${infDps}</DPS>`, cert, {
    refElement: "infDPS",
    algorithm: "sha256",
  });
  return { xml: `<?xml version="1.0" encoding="UTF-8"?>${xml}`, id };
}

export interface NfseResult {
  ok: boolean;
  chave?: string;
  xml?: string;
  erros: { codigo: string; descricao: string }[];
  status: number;
}

function normalizeErrors(data: any): { codigo: string; descricao: string }[] {
  const list = data?.erros || data?.Erros || data?.erro || [];
  return (Array.isArray(list) ? list : [list]).map((e: any) => ({
    codigo: String(e?.Codigo ?? e?.codigo ?? ""),
    descricao: [e?.Descricao ?? e?.descricao, e?.Complemento ?? e?.complemento].filter(Boolean).join(" - "),
  }));
}

async function request(
  method: "get" | "post",
  ambiente: Ambiente,
  path: string,
  cert: LoadedCertificate,
  body?: unknown
): Promise<{ status: number; data: any }> {
  try {
    const response = await axios.request({
      method,
      url: NFSE_URLS[ambiente] + path,
      data: body,
      httpsAgent: mtlsAgent(cert),
      timeout: 40000,
      validateStatus: () => true,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
    if ([502, 503, 504, 429].includes(response.status)) {
      throw new NfseUnavailableError(`Emissor Nacional indisponível (HTTP ${response.status})`);
    }
    if (response.status === 403 || response.status === 495 || response.status === 496) {
      throw new Error("O Emissor Nacional recusou o certificado digital. Confira se é o A1 da empresa e se está válido.");
    }
    return { status: response.status, data: response.data };
  } catch (err: any) {
    if (axios.isAxiosError(err) && !err.response) {
      throw new NfseUnavailableError(`Falha de comunicação com o Emissor Nacional (${err.code || err.message})`);
    }
    throw err;
  }
}

async function decodeXml(b64?: string): Promise<string | undefined> {
  if (!b64) return undefined;
  return (await gunzipAsync(Buffer.from(b64, "base64"))).toString("utf8");
}

export async function emitNfse(ambiente: Ambiente, signedDps: string, cert: LoadedCertificate): Promise<NfseResult> {
  const dpsXmlGZipB64 = (await gzipAsync(Buffer.from(signedDps, "utf8"))).toString("base64");
  const { status, data } = await request("post", ambiente, "/nfse", cert, { dpsXmlGZipB64 });
  if (status === 200 || status === 201) {
    return { ok: true, chave: data?.chaveAcesso, xml: await decodeXml(data?.nfseXmlGZipB64), erros: [], status };
  }
  return { ok: false, erros: normalizeErrors(data), status };
}

// Recupera a NFS-e de uma DPS já enviada (ex.: timeout na emissão), evitando nota em dobro.
export async function findByDps(ambiente: Ambiente, id: string, cert: LoadedCertificate): Promise<string | null> {
  const { status, data } = await request("get", ambiente, `/dps/${id}`, cert);
  if (status !== 200) return null;
  return data?.chaveAcesso || null;
}

export async function getNfse(ambiente: Ambiente, chave: string, cert: LoadedCertificate): Promise<string | undefined> {
  const { status, data } = await request("get", ambiente, `/nfse/${chave}`, cert);
  if (status !== 200) return undefined;
  return decodeXml(data?.nfseXmlGZipB64);
}

export async function cancelNfse(params: {
  ambiente: Ambiente;
  chave: string;
  cnpj: string;
  motivo: string;
  cert: LoadedCertificate;
}): Promise<NfseResult> {
  const id = `PRE${params.chave}101001`;
  const inf = tag(
    "infPedReg",
    text("tpAmb", params.ambiente === "homologacao" ? "2" : "1") +
      text("verAplic", "ERP-NextStep-1.0") +
      text("dhEvento", nowBrasilia()) +
      text("CNPJAutor", digits(params.cnpj)) +
      text("chNFSe", params.chave) +
      group(
        "e101101",
        text("xDesc", "Cancelamento de NFS-e"),
        text("cMotivo", "1"),
        text("xMotivo", sanitizeText(params.motivo, 255))
      ),
    { Id: id }
  );
  const signed = signXml(`<pedRegEvento xmlns="${NFSE_NS}" versao="1.01">${inf}</pedRegEvento>`, params.cert, {
    refElement: "infPedReg",
    algorithm: "sha256",
  });
  const b64 = (await gzipAsync(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${signed}`, "utf8"))).toString("base64");
  const { status, data } = await request("post", params.ambiente, `/nfse/${params.chave}/eventos`, params.cert, {
    pedidoRegistroEventoXmlGZipB64: b64,
  });
  if (status === 200 || status === 201) {
    return { ok: true, xml: await decodeXml(data?.eventoXmlGZipB64), erros: [], status };
  }
  return { ok: false, erros: normalizeErrors(data), status };
}

// Sonda o Emissor Nacional com o certificado: qualquer resposta diferente de recusa de TLS confirma o acesso.
export async function probeNfse(ambiente: Ambiente, cert: LoadedCertificate): Promise<{ ok: boolean; message: string }> {
  const { status } = await request("get", ambiente, `/dps/DPS${"0".repeat(42)}`, cert);
  return { ok: status < 500, message: `Emissor Nacional respondeu (HTTP ${status})` };
}
