import { randomInt } from "crypto";
import { DateTime } from "luxon";
import { LoadedCertificate, signRsaSha1Base64 } from "../certificate";
import { ufConfig } from "../sefaz/webservices";
import { NfeInput } from "../types";
import { group, sanitizeText, signXml, tag, text } from "../xml";

export const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
const HOMOLOG_NAME = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
const HOMOLOG_ITEM = "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

export const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
export const money = (value: number) => (Math.round(value * 100) / 100).toFixed(2);
const qty = (value: number) => value.toFixed(4);
const unitPrice = (value: number) => value.toFixed(4);

export function nowBrasilia(): string {
  return DateTime.now().setZone("America/Sao_Paulo").minus({ seconds: 5 }).toFormat("yyyy-LL-dd'T'HH:mm:ssZZ");
}

export function mod11(base: string): string {
  let weight = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? "0" : String(11 - rest);
}

export function isValidGtin(value: string | null | undefined): boolean {
  const code = digits(value);
  if (![8, 12, 13, 14].includes(code.length) || /^0+$/.test(code)) return false;
  const body = code.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

function unidade(value: string): string {
  const u = sanitizeText(value || "UN", 6).toUpperCase();
  if (["UND", "UNID", "UNIDADE", "U"].includes(u)) return "UN";
  return u || "UN";
}

export function buildChave(input: NfeInput, cNF: string): string {
  const { cUF } = ufConfig(input.emitente.uf);
  const aamm = input.dhEmi.slice(2, 4) + input.dhEmi.slice(5, 7);
  const mod = input.modelo === "nfce" ? "65" : "55";
  const base =
    cUF +
    aamm +
    digits(input.emitente.cnpj).padStart(14, "0") +
    mod +
    String(input.serie).padStart(3, "0") +
    String(input.numero).padStart(9, "0") +
    String(input.tpEmis) +
    cNF;
  return base + mod11(base);
}

export function randomCNF(numero: number): string {
  let cNF = "";
  do {
    cNF = String(randomInt(10000000, 99999999));
  } while (cNF === String(numero).padStart(8, "0"));
  return cNF;
}

export interface BuiltNfe {
  xml: string;
  chave: string;
  cNF: string;
  qrCodeUrl: string | null;
  urlChave: string | null;
  totals: { vProd: number; vDesc: number; vNF: number };
}

export function buildNfe(input: NfeInput, cert: LoadedCertificate): BuiltNfe {
  const isNfce = input.modelo === "nfce";
  const homolog = input.ambiente === "homologacao";
  const tpAmb = homolog ? "2" : "1";
  const uf = ufConfig(input.emitente.uf);
  const emit = input.emitente;
  const dest = input.destinatario;
  const destDoc = digits(dest?.documento);
  const destUf = dest?.endereco?.uf?.toUpperCase();
  const interestadual = !!destUf && destUf !== emit.uf.toUpperCase();
  const consumidorFinal = !dest?.inscricaoEstadual;

  const cNF = input.cNF || randomCNF(input.numero);
  const chave = buildChave(input, cNF);
  const cDV = chave.slice(-1);

  const ide = group(
    "ide",
    text("cUF", uf.cUF),
    text("cNF", cNF),
    text("natOp", "VENDA"),
    text("mod", isNfce ? "65" : "55"),
    text("serie", input.serie),
    text("nNF", input.numero),
    text("dhEmi", input.dhEmi),
    isNfce ? "" : text("dhSaiEnt", input.dhEmi),
    text("tpNF", "1"),
    text("idDest", interestadual ? "2" : "1"),
    text("cMunFG", digits(emit.codigoMunicipio)),
    text("tpImp", isNfce ? "4" : "1"),
    text("tpEmis", input.tpEmis),
    text("cDV", cDV),
    text("tpAmb", tpAmb),
    text("finNFe", "1"),
    text("indFinal", consumidorFinal ? "1" : "0"),
    text("indPres", "1"),
    text("indIntermed", "0"),
    text("procEmi", "0"),
    text("verProc", "ERP-NextStep-1.0"),
    input.contingencia ? text("dhCont", input.contingencia.dhCont) : "",
    input.contingencia ? text("xJust", sanitizeText(input.contingencia.justificativa, 256)) : ""
  );

  const enderEmit = group(
    "enderEmit",
    text("xLgr", sanitizeText(emit.logradouro, 60)),
    text("nro", sanitizeText(emit.numero || "S/N", 60)),
    text("xCpl", sanitizeText(emit.complemento || "", 60)),
    text("xBairro", sanitizeText(emit.bairro, 60)),
    text("cMun", digits(emit.codigoMunicipio)),
    text("xMun", sanitizeText(emit.municipio, 60)),
    text("UF", emit.uf.toUpperCase()),
    text("CEP", digits(emit.cep)),
    text("cPais", "1058"),
    text("xPais", "BRASIL"),
    text("fone", digits(emit.telefone).slice(0, 14) || "")
  );
  const emitXml = group(
    "emit",
    text("CNPJ", digits(emit.cnpj)),
    text("xNome", sanitizeText(emit.razaoSocial, 60)),
    text("xFant", sanitizeText(emit.nomeFantasia || "", 60)),
    enderEmit,
    text("IE", digits(emit.inscricaoEstadual)),
    text("CRT", "4")
  );

  let destXml = "";
  if (destDoc) {
    const nome = homolog ? HOMOLOG_NAME : sanitizeText(dest?.nome || "", 60);
    const end = dest?.endereco;
    const enderDest = end
      ? group(
          "enderDest",
          text("xLgr", sanitizeText(end.logradouro, 60)),
          text("nro", sanitizeText(end.numero || "S/N", 60)),
          text("xCpl", sanitizeText(end.complemento || "", 60)),
          text("xBairro", sanitizeText(end.bairro, 60)),
          text("cMun", digits(end.codigoMunicipio)),
          text("xMun", sanitizeText(end.municipio, 60)),
          text("UF", end.uf.toUpperCase()),
          text("CEP", digits(end.cep)),
          text("cPais", "1058"),
          text("xPais", "BRASIL"),
          text("fone", digits(dest?.telefone).slice(0, 14) || "")
        )
      : "";
    const ie = digits(dest?.inscricaoEstadual);
    destXml = group(
      "dest",
      destDoc.length === 14 ? text("CNPJ", destDoc) : text("CPF", destDoc),
      text("xNome", nome),
      enderDest,
      text("indIEDest", ie ? "1" : "9"),
      text("IE", ie),
      text("email", sanitizeText(dest?.email || "", 60))
    );
  }

  const cfop = interestadual ? "6102" : "5102";
  let vProd = 0;
  let vDesc = 0;
  const det = input.itens
    .map((item, index) => {
      const gtin = isValidGtin(item.gtin) ? digits(item.gtin) : "SEM GTIN";
      const descricao = homolog && index === 0 && isNfce ? HOMOLOG_ITEM : sanitizeText(item.descricao, 120);
      const u = unidade(item.unidade);
      vProd += item.valorBruto;
      vDesc += item.desconto;
      const prod = group(
        "prod",
        text("cProd", sanitizeText(item.codigo, 60)),
        text("cEAN", gtin),
        text("xProd", descricao),
        text("NCM", digits(item.ncm)),
        text("CFOP", cfop),
        text("uCom", u),
        text("qCom", qty(item.quantidade)),
        text("vUnCom", unitPrice(item.valorUnitario)),
        text("vProd", money(item.valorBruto)),
        text("cEANTrib", gtin),
        text("uTrib", u),
        text("qTrib", qty(item.quantidade)),
        text("vUnTrib", unitPrice(item.valorUnitario)),
        item.desconto > 0 ? text("vDesc", money(item.desconto)) : "",
        text("indTot", "1")
      );
      const imposto = group(
        "imposto",
        group("ICMS", group("ICMSSN102", text("orig", "0"), text("CSOSN", "102"))),
        group(
          "PIS",
          group("PISOutr", text("CST", "99"), text("vBC", "0.00"), text("pPIS", "0.0000"), text("vPIS", "0.00"))
        ),
        group(
          "COFINS",
          group("COFINSOutr", text("CST", "99"), text("vBC", "0.00"), text("pCOFINS", "0.0000"), text("vCOFINS", "0.00"))
        )
      );
      return tag("det", prod + imposto, { nItem: String(index + 1) });
    })
    .join("");

  const vNF = Math.round((vProd - vDesc) * 100) / 100;
  const total = group(
    "total",
    group(
      "ICMSTot",
      ...[
        ["vBC", 0],
        ["vICMS", 0],
        ["vICMSDeson", 0],
        ["vFCP", 0],
        ["vBCST", 0],
        ["vST", 0],
        ["vFCPST", 0],
        ["vFCPSTRet", 0],
        ["vProd", vProd],
        ["vFrete", 0],
        ["vSeg", 0],
        ["vDesc", vDesc],
        ["vII", 0],
        ["vIPI", 0],
        ["vIPIDevol", 0],
        ["vPIS", 0],
        ["vCOFINS", 0],
        ["vOutro", 0],
        ["vNF", vNF],
      ].map(([name, value]) => text(name as string, money(value as number)))
    )
  );

  const transp = group("transp", text("modFrete", "9"));

  const pagamentos = input.pagamentos.length ? input.pagamentos : [{ tipo: "01" as const, valor: vNF }];
  const pag = group(
    "pag",
    ...pagamentos.map((p) =>
      group(
        "detPag",
        text("tPag", p.tipo),
        p.tipo === "99" ? text("xPag", "Outros") : "",
        text("vPag", money(p.valor)),
        ["03", "04"].includes(p.tipo) ? group("card", text("tpIntegra", "2")) : ""
      )
    ),
    input.troco > 0 ? text("vTroco", money(input.troco)) : ""
  );

  const infAdic = group(
    "infAdic",
    text(
      "infCpl",
      sanitizeText(
        ["DOCUMENTO EMITIDO POR MICROEMPREENDEDOR INDIVIDUAL - MEI.", input.informacoesComplementares || ""].join(" "),
        2000
      )
    )
  );

  const respTec = respTecXml();
  const infNFe = tag("infNFe", ide + emitXml + destXml + det + total + transp + pag + infAdic + respTec, {
    Id: `NFe${chave}`,
    versao: "4.00",
  });

  let qrCodeUrl: string | null = null;
  let urlChave: string | null = null;
  let supl = "";
  if (isNfce) {
    qrCodeUrl = buildQrCodeV3(input, chave, vNF, cert);
    urlChave = uf.nfceUrlChave;
    supl = group("infNFeSupl", text("qrCode", qrCodeUrl), text("urlChave", urlChave));
  }

  const unsigned = `<NFe xmlns="${NFE_NS}">${infNFe}${supl}</NFe>`;
  const xml = signXml(unsigned, cert, {
    refElement: "infNFe",
    afterElement: isNfce ? "infNFeSupl" : "infNFe",
    algorithm: "sha1",
  });

  return { xml, chave, cNF, qrCodeUrl, urlChave, totals: { vProd, vDesc, vNF } };
}

// QR Code versão 3 (NT 2025.001): online leva só chave, versão e ambiente; em contingência é assinado com o certificado.
function buildQrCodeV3(input: NfeInput, chave: string, vNF: number, cert: LoadedCertificate): string {
  const uf = ufConfig(input.emitente.uf);
  const tpAmb = input.ambiente === "homologacao" ? "2" : "1";
  const qrUrl = uf.nfceQrCodeUrl[input.ambiente];
  if (input.tpEmis !== 9) return `${qrUrl}?p=${chave}|3|${tpAmb}`;

  const destDoc = digits(input.destinatario?.documento);
  const tpIdDest = destDoc.length === 14 ? "1" : destDoc.length === 11 ? "2" : "";
  const dia = input.dhEmi.slice(8, 10);
  const params = [chave, "3", tpAmb, dia, money(vNF), tpIdDest, destDoc].join("|");
  return `${qrUrl}?p=${params}|${signRsaSha1Base64(cert.keyPem, params)}`;
}

// Algumas UFs exigem o grupo do responsável técnico; os dados vêm das variáveis de ambiente da software house.
function respTecXml(): string {
  const cnpj = digits(process.env.FISCAL_RESP_TEC_CNPJ);
  if (!cnpj) return "";
  return group(
    "infRespTec",
    text("CNPJ", cnpj),
    text("xContato", sanitizeText(process.env.FISCAL_RESP_TEC_CONTATO || "Suporte", 60)),
    text("email", sanitizeText(process.env.FISCAL_RESP_TEC_EMAIL || "", 60)),
    text("fone", digits(process.env.FISCAL_RESP_TEC_FONE))
  );
}

export function wrapNfeProc(signedNfe: string, protNFe: string): string {
  const nfe = signedNfe.replace(/^<\?xml[^>]*>/, "");
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NFE_NS}" versao="4.00">${nfe}${protNFe}</nfeProc>`;
}
