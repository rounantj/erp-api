import { BadRequestException } from "@nestjs/common";
import { createSign } from "crypto";
import * as https from "https";
import * as tls from "tls";
import * as forge from "node-forge";
import { ICP_BRASIL_ROOTS } from "./icp-brasil-roots";

export interface LoadedCertificate {
  keyPem: string;
  certPem: string;
  pfx: Buffer;
  password: string;
  subject: string;
  cnpj: string | null;
  validFrom: Date;
  validUntil: Date;
}

// OID do CNPJ no "otherName" dos certificados ICP-Brasil de pessoa jurídica.
const OID_CNPJ = "2.16.76.1.3.3";

function findCnpj(cert: forge.pki.Certificate): string | null {
  const cn = String(cert.subject.getField("CN")?.value || "");
  const fromCn = cn.match(/:(\d{14})\b/);
  if (fromCn) return fromCn[1];

  const san: any = cert.getExtension("subjectAltName");
  for (const alt of san?.altNames || []) {
    const raw = typeof alt.value === "string" ? alt.value : "";
    if (alt.type === 0 && raw.includes(forge.asn1.oidToDer(OID_CNPJ).getBytes())) {
      const digits = raw.replace(/\D/g, "");
      const match = digits.match(/\d{14}$/);
      if (match) return match[0];
    }
  }
  const anyDigits = cn.replace(/\D/g, "");
  return anyDigits.length === 14 ? anyDigits : null;
}

export function loadCertificate(pfx: Buffer, password: string): LoadedCertificate {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary")));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (/mac|password|invalid/i.test(msg)) throw new BadRequestException("Senha do certificado incorreta");
    throw new BadRequestException("Arquivo de certificado inválido. Envie o certificado A1 (.pfx ou .p12).");
  }

  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ||
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (!keyBag?.key || !certBags.length) throw new BadRequestException("O certificado não contém a chave privada");

  // O certificado da empresa é o que corresponde à chave privada; os demais são da cadeia.
  const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;
  const own =
    certBags.find((bag) => {
      const pub = bag.cert?.publicKey as forge.pki.rsa.PublicKey | undefined;
      return pub && pub.n.equals(privateKey.n);
    })?.cert || certBags[0].cert!;

  return {
    keyPem: forge.pki.privateKeyToPem(privateKey),
    certPem: forge.pki.certificateToPem(own),
    pfx,
    password,
    subject: String(own.subject.getField("CN")?.value || ""),
    cnpj: findCnpj(own),
    validFrom: own.validity.notBefore,
    validUntil: own.validity.notAfter,
  };
}

export function certificateBody(certPem: string): string {
  return certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
}

export function signRsaSha1Base64(keyPem: string, content: string): string {
  return createSign("RSA-SHA1").update(content, "utf8").sign(keyPem, "base64");
}

const agents = new Map<string, https.Agent>();

// mTLS com o certificado do contribuinte. As SEFAZ usam a cadeia ICP-Brasil, que não vem no Node.
export function mtlsAgent(cert: LoadedCertificate): https.Agent {
  const cacheKey = `${cert.cnpj}:${cert.validUntil.getTime()}:${certificateBody(cert.certPem).slice(-32)}`;
  let agent = agents.get(cacheKey);
  if (!agent) {
    agent = new https.Agent({
      key: cert.keyPem,
      cert: cert.certPem,
      ca: [...tls.rootCertificates, ICP_BRASIL_ROOTS],
      keepAlive: true,
      maxSockets: 4,
    });
    agents.set(cacheKey, agent);
  }
  return agent;
}
