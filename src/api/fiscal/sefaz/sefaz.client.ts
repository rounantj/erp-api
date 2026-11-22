import axios from "axios";
import { LoadedCertificate, mtlsAgent } from "../certificate";
import { parseXml } from "../xml";
import { Ambiente, ModeloNfe, SOAP_ACTIONS, SefazService, serviceUrl } from "./webservices";

export class SefazUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SefazUnavailableError";
  }
}

export interface SefazResponse {
  raw: string;
  parsed: any;
}

export async function callSefaz(params: {
  uf: string;
  modelo: ModeloNfe;
  ambiente: Ambiente;
  service: SefazService;
  body: string;
  cert: LoadedCertificate;
  timeoutMs?: number;
}): Promise<SefazResponse> {
  const action = SOAP_ACTIONS[params.service];
  const url = serviceUrl(params.uf, params.modelo, params.ambiente, params.service);
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeDadosMsg xmlns="${action.ns}">${params.body}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;

  try {
    const response = await axios.post(url, envelope, {
      httpsAgent: mtlsAgent(params.cert),
      timeout: params.timeoutMs ?? 30000,
      responseType: "text",
      transformResponse: (data) => data,
      validateStatus: () => true,
      headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${action.ns}/${action.method}"` },
    });
    const raw = String(response.data || "");
    if (response.status >= 500 && !raw.includes("cStat")) {
      throw new SefazUnavailableError(`SEFAZ respondeu HTTP ${response.status}`);
    }
    if (response.status === 403) {
      throw new Error("A SEFAZ recusou o certificado digital (HTTP 403). Confira se o certificado é A1 e está válido.");
    }
    if (!raw.includes("cStat")) throw new SefazUnavailableError(`Resposta inesperada da SEFAZ (HTTP ${response.status})`);
    return { raw, parsed: parseXml(raw) };
  } catch (err: any) {
    if (axios.isAxiosError(err) && !err.response) {
      throw new SefazUnavailableError(`Falha de comunicação com a SEFAZ (${err.code || err.message})`);
    }
    throw err;
  }
}
