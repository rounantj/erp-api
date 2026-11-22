import { randomInt } from "crypto";
import { LoadedCertificate } from "../certificate";
import { callSefaz } from "../sefaz/sefaz.client";
import { Ambiente, ModeloNfe, ufConfig } from "../sefaz/webservices";
import { extractElement, findNode, sanitizeText, signXml, tag, text } from "../xml";
import { NFE_NS, digits, nowBrasilia } from "./nfe-builder";

export interface SefazResult {
  cStat: string;
  xMotivo: string;
  protocolo?: string;
  protXml?: string;
  raw: string;
}

const AUTHORIZED = ["100", "150"];
export const isAuthorized = (cStat: string) => AUTHORIZED.includes(cStat);

const tpAmbOf = (ambiente: Ambiente) => (ambiente === "homologacao" ? "2" : "1");
const lote = () => String(Date.now()).slice(-13) + String(randomInt(10, 99));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function protocolResult(raw: string, parsed: any): SefazResult {
  const infProt = findNode(parsed, "infProt");
  const protXml = extractElement(raw, "protNFe") || undefined;
  if (infProt) {
    return {
      cStat: String(infProt.cStat),
      xMotivo: String(infProt.xMotivo || ""),
      protocolo: infProt.nProt ? String(infProt.nProt) : undefined,
      protXml: protXml?.replace(/<(\/?)\w+:/g, "<$1"),
      raw,
    };
  }
  return { cStat: String(findNode(parsed, "cStat") ?? ""), xMotivo: String(findNode(parsed, "xMotivo") ?? ""), raw };
}

export async function authorize(params: {
  uf: string;
  modelo: ModeloNfe;
  ambiente: Ambiente;
  signedXml: string;
  cert: LoadedCertificate;
}): Promise<SefazResult> {
  const nfe = params.signedXml.replace(/^<\?xml[^>]*>/, "");
  const body = `<enviNFe xmlns="${NFE_NS}" versao="4.00"><idLote>${lote()}</idLote><indSinc>1</indSinc>${nfe}</enviNFe>`;
  const { raw, parsed } = await callSefaz({ ...params, service: "autorizacao", body });
  const ret = findNode(parsed, "retEnviNFe") || parsed;
  const cStat = String(ret?.cStat ?? findNode(parsed, "cStat") ?? "");

  if (cStat === "104") return protocolResult(raw, parsed);
  if (cStat !== "103") return { cStat, xMotivo: String(ret?.xMotivo ?? findNode(parsed, "xMotivo") ?? ""), raw };

  // Lote recebido de forma assíncrona: consulta o recibo até o processamento terminar.
  const nRec = String(findNode(ret, "nRec") || "");
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(1500 + attempt * 1000);
    const consulta = `<consReciNFe xmlns="${NFE_NS}" versao="4.00">${text("tpAmb", tpAmbOf(params.ambiente))}${text("nRec", nRec)}</consReciNFe>`;
    const res = await callSefaz({ ...params, service: "retAutorizacao", body: consulta });
    const retCStat = String(findNode(res.parsed, "retConsReciNFe")?.cStat ?? "");
    if (retCStat === "105") continue;
    if (retCStat === "104") return protocolResult(res.raw, res.parsed);
    return { cStat: retCStat, xMotivo: String(findNode(res.parsed, "xMotivo") ?? ""), raw: res.raw };
  }
  return { cStat: "105", xMotivo: "Lote em processamento na SEFAZ", raw };
}

export async function consultByKey(params: {
  uf: string;
  modelo: ModeloNfe;
  ambiente: Ambiente;
  chave: string;
  cert: LoadedCertificate;
}): Promise<SefazResult> {
  const body = `<consSitNFe xmlns="${NFE_NS}" versao="4.00">${text("tpAmb", tpAmbOf(params.ambiente))}${text("xServ", "CONSULTAR")}${text("chNFe", params.chave)}</consSitNFe>`;
  const { raw, parsed } = await callSefaz({ ...params, service: "consulta", body });
  const ret = findNode(parsed, "retConsSitNFe") || {};
  const prot = protocolResult(raw, parsed);
  return prot.protocolo ? prot : { cStat: String(ret.cStat ?? ""), xMotivo: String(ret.xMotivo ?? ""), raw };
}

export async function serviceStatus(params: {
  uf: string;
  modelo: ModeloNfe;
  ambiente: Ambiente;
  cert: LoadedCertificate;
}): Promise<SefazResult> {
  const { cUF } = ufConfig(params.uf);
  const body = `<consStatServ xmlns="${NFE_NS}" versao="4.00">${text("tpAmb", tpAmbOf(params.ambiente))}${text("cUF", cUF)}${text("xServ", "STATUS")}</consStatServ>`;
  const { raw, parsed } = await callSefaz({ ...params, service: "status", body, timeoutMs: 15000 });
  const ret = findNode(parsed, "retConsStatServ") || {};
  return { cStat: String(ret.cStat ?? ""), xMotivo: String(ret.xMotivo ?? ""), raw };
}

export async function cancel(params: {
  uf: string;
  modelo: ModeloNfe;
  ambiente: Ambiente;
  cnpj: string;
  chave: string;
  protocolo: string;
  justificativa: string;
  cert: LoadedCertificate;
}): Promise<SefazResult & { eventXml?: string }> {
  const { cUF } = ufConfig(params.uf);
  const id = `ID110111${params.chave}01`;
  const infEvento = tag(
    "infEvento",
    text("cOrgao", cUF) +
      text("tpAmb", tpAmbOf(params.ambiente)) +
      text("CNPJ", digits(params.cnpj)) +
      text("chNFe", params.chave) +
      text("dhEvento", nowBrasilia()) +
      text("tpEvento", "110111") +
      text("nSeqEvento", "1") +
      text("verEvento", "1.00") +
      tag(
        "detEvento",
        text("descEvento", "Cancelamento") + text("nProt", params.protocolo) + text("xJust", sanitizeText(params.justificativa, 255)),
        { versao: "1.00" }
      ),
    { Id: id }
  );
  const evento = signXml(`<evento xmlns="${NFE_NS}" versao="1.00">${infEvento}</evento>`, params.cert, {
    refElement: "infEvento",
    algorithm: "sha1",
  });
  const body = `<envEvento xmlns="${NFE_NS}" versao="1.00"><idLote>${lote()}</idLote>${evento}</envEvento>`;
  const { raw, parsed } = await callSefaz({ ...params, service: "evento", body });
  const retEvento = findNode(findNode(parsed, "retEvento") || {}, "infEvento");
  const ret = retEvento || findNode(parsed, "retEnvEvento") || {};
  const retXml = extractElement(raw, "retEvento")?.replace(/<(\/?)\w+:/g, "<$1");
  return {
    cStat: String(ret.cStat ?? ""),
    xMotivo: String(ret.xMotivo ?? ""),
    protocolo: ret.nProt ? String(ret.nProt) : undefined,
    raw,
    eventXml: retXml
      ? `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="${NFE_NS}" versao="1.00">${evento}${retXml}</procEventoNFe>`
      : undefined,
  };
}

export const isEventRegistered = (cStat: string) => ["135", "136", "155"].includes(cStat);

export async function inutilize(params: {
  uf: string;
  modelo: ModeloNfe;
  ambiente: Ambiente;
  cnpj: string;
  serie: number;
  numero: number;
  justificativa: string;
  cert: LoadedCertificate;
}): Promise<SefazResult> {
  const { cUF } = ufConfig(params.uf);
  const ano = String(new Date().getFullYear()).slice(-2);
  const mod = params.modelo === "nfce" ? "65" : "55";
  const cnpj = digits(params.cnpj);
  const serie = String(params.serie);
  const numero = String(params.numero);
  const id = `ID${cUF}${ano}${cnpj}${mod}${serie.padStart(3, "0")}${numero.padStart(9, "0")}${numero.padStart(9, "0")}`;
  const infInut = tag(
    "infInut",
    text("tpAmb", tpAmbOf(params.ambiente)) +
      text("xServ", "INUTILIZAR") +
      text("cUF", cUF) +
      text("ano", ano) +
      text("CNPJ", cnpj) +
      text("mod", mod) +
      text("serie", serie) +
      text("nNFIni", numero) +
      text("nNFFin", numero) +
      text("xJust", sanitizeText(params.justificativa, 255)),
    { Id: id }
  );
  const body = signXml(`<inutNFe xmlns="${NFE_NS}" versao="4.00">${infInut}</inutNFe>`, params.cert, {
    refElement: "infInut",
    algorithm: "sha1",
  });
  const { raw, parsed } = await callSefaz({ ...params, service: "inutilizacao", body });
  const ret = findNode(findNode(parsed, "retInutNFe") || {}, "infInut") || {};
  return {
    cStat: String(ret.cStat ?? ""),
    xMotivo: String(ret.xMotivo ?? ""),
    protocolo: ret.nProt ? String(ret.nProt) : undefined,
    raw,
  };
}