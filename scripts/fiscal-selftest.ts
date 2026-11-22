/**
 * Gera NFC-e, NF-e, DPS (NFS-e) e eventos com um certificado de teste e grava os XMLs em /tmp/fiscal-selftest
 * para validação contra os XSD oficiais. Não chama nenhuma SEFAZ.
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/fiscal-selftest.ts
 */
import * as fs from "fs";
import * as forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { loadCertificate } from "../src/api/fiscal/certificate";
import { buildNfe, nowBrasilia } from "../src/api/fiscal/nfe/nfe-builder";
import { buildDps } from "../src/api/fiscal/nfse/nfse";
import { Emitente } from "../src/api/fiscal/types";
import { signXml, tag, text } from "../src/api/fiscal/xml";

const OUT = "/tmp/fiscal-selftest";
fs.mkdirSync(OUT, { recursive: true });

function testPfx(password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const attrs = [{ name: "commonName", value: "FOFA PAPELARIA TESTE:59592662000140" }, { name: "countryName", value: "BR" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}

const cert = loadCertificate(testPfx("1234"), "1234");
console.log("certificado:", cert.subject, cert.cnpj, cert.validUntil.toISOString());

const emitente: Emitente = {
  regime: "mei",
  cnpj: "59592662000140",
  razaoSocial: "59.592.662 MARINETE PIMENTEL LUBIANA",
  nomeFantasia: "Fofa Papelaria",
  inscricaoEstadual: "084231440",
  logradouro: "Avenida Doutor Orlindo Borges",
  numero: "525",
  bairro: "Barra do Sahy",
  cep: "29198013",
  codigoMunicipio: "3200607",
  municipio: "Aracruz",
  uf: "ES",
  telefone: "27999999999",
  email: "loja@fofa.com",
};

const itens = [
  { codigo: "5114", descricao: "SACOLA BRANCA media 25x31 & cia", ncm: "48194000", gtin: "7898608962270", unidade: "und", quantidade: 2, valorUnitario: 5.9, valorBruto: 11.8, desconto: 0.5 },
  { codigo: "3597", descricao: "Caderno 10 matérias", ncm: "48202000", gtin: "123", unidade: "UN", quantidade: 1, valorUnitario: 2.5, valorBruto: 2.5, desconto: 0 },
];

const verify = (xml: string, ref: string) => {
  const sig = new SignedXml({ publicCert: cert.certPem });
  const signature = xml.match(/<Signature[\s\S]*?<\/Signature>/)![0];
  sig.loadSignature(signature);
  const ok = sig.checkSignature(xml);
  console.log(`assinatura ${ref}:`, ok ? "OK" : "FALHOU");
};

for (const tpEmis of [1, 9] as const) {
  const nfce = buildNfe(
    {
      modelo: "nfce",
      ambiente: "homologacao",
      serie: 1,
      numero: 42,
      tpEmis,
      dhEmi: nowBrasilia(),
      emitente,
      destinatario: { documento: "12345678909", nome: "Cliente" },
      itens,
      pagamentos: [{ tipo: "01", valor: 20 }],
      troco: 6.2,
      contingencia: tpEmis === 9 ? { dhCont: nowBrasilia(), justificativa: "SEFAZ indisponivel - teste de contingencia" } : null,
    },
    cert
  );
  fs.writeFileSync(`${OUT}/nfce-tpemis${tpEmis}.xml`, nfce.xml);
  console.log(`NFC-e tpEmis ${tpEmis}:`, nfce.chave, nfce.qrCodeUrl);
  verify(nfce.xml, `nfce${tpEmis}`);
}

const nfe = buildNfe(
  {
    modelo: "nfe",
    ambiente: "homologacao",
    serie: 1,
    numero: 7,
    tpEmis: 1,
    dhEmi: nowBrasilia(),
    emitente,
    destinatario: {
      documento: "11222333000181",
      nome: "Empresa Cliente LTDA",
      endereco: { logradouro: "Rua A", numero: "10", bairro: "Centro", codigoMunicipio: "3205309", municipio: "Vitoria", uf: "ES", cep: "29010000" },
    },
    itens,
    pagamentos: [{ tipo: "20", valor: 13.8 }],
    troco: 0,
  },
  cert
);
fs.writeFileSync(`${OUT}/nfe.xml`, nfe.xml);
verify(nfe.xml, "nfe");

const dps = buildDps(
  {
    ambiente: "homologacao",
    serie: 1,
    numero: 15,
    dhEmi: nowBrasilia(),
    emitente,
    tomador: { documento: "12345678909", nome: "Cliente Teste" },
    codigoTributacao: "170101",
    descricao: "2x Impressão colorida; 1x Encadernação",
    valor: 12.5,
  },
  cert
);
fs.writeFileSync(`${OUT}/dps.xml`, dps.xml);
console.log("DPS:", dps.id, dps.id.length);
verify(dps.xml, "dps");

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
const evento = signXml(
  `<evento xmlns="${NFE_NS}" versao="1.00">${tag(
    "infEvento",
    text("cOrgao", "32") +
      text("tpAmb", "2") +
      text("CNPJ", emitente.cnpj) +
      text("chNFe", nfe.chave) +
      text("dhEvento", nowBrasilia()) +
      text("tpEvento", "110111") +
      text("nSeqEvento", "1") +
      text("verEvento", "1.00") +
      tag("detEvento", text("descEvento", "Cancelamento") + text("nProt", "332260000000001") + text("xJust", "Teste de cancelamento de nota"), { versao: "1.00" }),
    { Id: `ID110111${nfe.chave}01` }
  )}</evento>`,
  cert,
  { refElement: "infEvento", algorithm: "sha1" }
);
fs.writeFileSync(`${OUT}/envEvento.xml`, `<envEvento xmlns="${NFE_NS}" versao="1.00"><idLote>1</idLote>${evento}</envEvento>`);
console.log("arquivos em", OUT);
