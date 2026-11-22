import { SignedXml } from "xml-crypto";
import { XMLParser } from "fast-xml-parser";
import { LoadedCertificate } from "./certificate";

type Content = string | number | null | undefined | false;

export function esc(value: string | number): string {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Campos vazios são omitidos: nos leiautes fiscais, tag vazia costuma ser erro de schema.
export function tag(name: string, content: Content, attrs: Record<string, string> = {}): string {
  if (content === null || content === undefined || content === false || content === "") return "";
  const attrText = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");
  return `<${name}${attrText}>${typeof content === "number" ? String(content) : content}</${name}>`;
}

export function text(name: string, value: Content): string {
  if (value === null || value === undefined || value === false || value === "") return "";
  return tag(name, esc(value));
}

export function group(name: string, ...children: string[]): string {
  const body = children.join("");
  return body ? `<${name}>${body}</${name}>` : "";
}

export function sanitizeText(value: string, max: number): string {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

const ALGORITHMS = {
  sha1: {
    signature: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    digest: "http://www.w3.org/2000/09/xmldsig#sha1",
  },
  sha256: {
    signature: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    digest: "http://www.w3.org/2001/04/xmlenc#sha256",
  },
};

/**
 * Assina o elemento `refElement` (pelo atributo Id) e insere a <Signature> logo depois de `afterElement`.
 * NF-e/NFC-e usam RSA-SHA1; a NFS-e Nacional usa RSA-SHA256.
 */
export function signXml(
  xml: string,
  cert: LoadedCertificate,
  opts: { refElement: string; afterElement?: string; algorithm: "sha1" | "sha256" }
): string {
  const alg = ALGORITHMS[opts.algorithm];
  const sig = new SignedXml({
    privateKey: cert.keyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: alg.signature,
    canonicalizationAlgorithm: C14N,
  });
  sig.addReference({
    xpath: `//*[local-name(.)='${opts.refElement}']`,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: alg.digest,
  });
  sig.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='${opts.afterElement || opts.refElement}']`, action: "after" },
  });
  return sig.getSignedXml();
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

export function parseXml(xml: string): any {
  return parser.parse(xml);
}

// Busca em profundidade a primeira ocorrência de uma tag no objeto do parser.
export function findNode(node: any, name: string): any {
  if (!node || typeof node !== "object") return undefined;
  if (name in node) return node[name];
  for (const value of Object.values(node)) {
    const found = findNode(value, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function extractElement(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${name}[\\s>][\\s\\S]*?</(?:\\w+:)?${name}>`));
  return match ? match[0] : null;
}
