import { Ambiente } from "./sefaz/webservices";

export type Regime = "mei";

export interface Emitente {
  regime: Regime;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  inscricaoEstadual?: string | null;
  inscricaoMunicipal?: string | null;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cep: string;
  codigoMunicipio: string;
  municipio: string;
  uf: string;
  telefone?: string | null;
  email?: string | null;
}

export interface EnderecoDestinatario {
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  codigoMunicipio: string;
  municipio: string;
  uf: string;
  cep: string;
}

export interface Destinatario {
  documento: string;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  inscricaoEstadual?: string | null;
  endereco?: EnderecoDestinatario | null;
}

export interface ItemFiscal {
  codigo: string;
  descricao: string;
  ncm: string;
  gtin?: string | null;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorBruto: number;
  desconto: number;
}

// Códigos tPag da NF-e.
export type TipoPagamento = "01" | "03" | "04" | "05" | "15" | "17" | "20" | "99";

export interface Pagamento {
  tipo: TipoPagamento;
  valor: number;
}

export interface NfeInput {
  modelo: "nfce" | "nfe";
  ambiente: Ambiente;
  serie: number;
  numero: number;
  tpEmis: 1 | 9;
  dhEmi: string;
  emitente: Emitente;
  destinatario?: Destinatario | null;
  itens: ItemFiscal[];
  pagamentos: Pagamento[];
  troco: number;
  contingencia?: { dhCont: string; justificativa: string } | null;
  informacoesComplementares?: string | null;
  cNF?: string;
}
