export type Ambiente = "homologacao" | "producao";
export type ModeloNfe = "nfce" | "nfe";
export type SefazService = "autorizacao" | "retAutorizacao" | "consulta" | "status" | "evento" | "inutilizacao";

interface Authorizer {
  hosts: Record<ModeloNfe, Record<Ambiente, string>>;
  paths: Record<SefazService, string>;
}

const SVRS: Authorizer = {
  hosts: {
    nfce: { homologacao: "https://nfce-homologacao.svrs.rs.gov.br", producao: "https://nfce.svrs.rs.gov.br" },
    nfe: { homologacao: "https://nfe-homologacao.svrs.rs.gov.br", producao: "https://nfe.svrs.rs.gov.br" },
  },
  paths: {
    autorizacao: "/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    retAutorizacao: "/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    consulta: "/ws/NfeConsulta/NfeConsulta4.asmx",
    status: "/ws/NfeStatusServico/NfeStatusServico4.asmx",
    evento: "/ws/recepcaoevento/recepcaoevento4.asmx",
    inutilizacao: "/ws/nfeinutilizacao/nfeinutilizacao4.asmx",
  },
};

interface UfConfig {
  cUF: string;
  authorizer: Authorizer;
  nfceQrCodeUrl: Record<Ambiente, string>;
  nfceUrlChave: string;
}

// Só entram UFs com autorizador e URLs de consulta da NFC-e conferidos.
// A SEFAZ compara o endereço do QR Code literalmente (rejeição 395), inclusive o protocolo.
const UFS: Record<string, UfConfig> = {
  ES: {
    cUF: "32",
    authorizer: SVRS,
    nfceQrCodeUrl: {
      homologacao: "http://homologacao.sefaz.es.gov.br/ConsultaNFCe/qrcode.aspx",
      producao: "http://app.sefaz.es.gov.br/ConsultaNFCe/qrcode.aspx",
    },
    nfceUrlChave: "www.sefaz.es.gov.br/nfce/consulta",
  },
};

export const SUPPORTED_NFE_UFS = Object.keys(UFS);

export function ufConfig(uf: string): UfConfig {
  const config = UFS[String(uf || "").toUpperCase()];
  if (!config) {
    throw new Error(
      `Emissão de NFC-e/NF-e ainda não disponível para ${uf || "a UF informada"}. Estados atendidos: ${SUPPORTED_NFE_UFS.join(", ")}.`
    );
  }
  return config;
}

export function serviceUrl(uf: string, modelo: ModeloNfe, ambiente: Ambiente, service: SefazService): string {
  const { authorizer } = ufConfig(uf);
  return authorizer.hosts[modelo][ambiente] + authorizer.paths[service];
}

export const SOAP_ACTIONS: Record<SefazService, { ns: string; method: string }> = {
  autorizacao: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4", method: "nfeAutorizacaoLote" },
  retAutorizacao: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4", method: "nfeRetAutorizacaoLote" },
  consulta: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4", method: "nfeConsultaNF" },
  status: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4", method: "nfeStatusServicoNF" },
  evento: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4", method: "nfeRecepcaoEvento" },
  inutilizacao: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4", method: "nfeInutilizacaoNF" },
};

export const NFSE_URLS: Record<Ambiente, string> = {
  homologacao: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
  producao: "https://sefin.nfse.gov.br/SefinNacional",
};
