import { Injectable, HttpException, HttpStatus } from "@nestjs/common";

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  postalCode?: string;
  externalReference?: string;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  value: number;
  nextDueDate: string;
  cycle: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
  description?: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED";
  externalReference?: string;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  subscription?: string;
  billingType: string;
  value: number;
  netValue: number;
  status: "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | "RECEIVED_IN_CASH" | "REFUND_REQUESTED" | "CHARGEBACK_REQUESTED" | "CHARGEBACK_DISPUTE" | "AWAITING_CHARGEBACK_REVERSAL" | "DUNNING_REQUESTED" | "DUNNING_RECEIVED" | "AWAITING_RISK_ANALYSIS";
  dueDate: string;
  paymentDate?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixTransaction?: {
    qrCode: string;
    payload: string;
  };
}

export interface CreateCustomerDto {
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
  mobilePhone?: string;
  externalReference?: string;
}

export interface CreateSubscriptionDto {
  customer: string;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  value: number;
  nextDueDate: string;
  cycle: "MONTHLY" | "YEARLY";
  description?: string;
  externalReference?: string;
}

export interface CreatePaymentDto {
  customer: string;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
}

@Injectable()
export class AsaasService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    // Limpar a chave de API (remover aspas e espaços extras)
    let rawKey = process.env.ASAAS_API_KEY || "";
    this.apiKey = rawKey.trim().replace(/^["']|["']$/g, '');
    
    this.baseUrl = (process.env.ASAAS_BASE_URL || "https://sandbox.asaas.com/api/v3").trim();
    
    console.log("[AsaasService] Configuração:");
    console.log("  - Base URL:", this.baseUrl);
    console.log("  - API Key:", this.apiKey ? `${ this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}` : "NÃO CONFIGURADA");
    
    if (!this.apiKey) {
      console.warn("[AsaasService] ASAAS_API_KEY não configurada!");
    }
  }

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "access_token": this.apiKey,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    console.log(`[AsaasService] ${method} ${url}`);
    console.log(`[AsaasService] Headers:`, {
      "Content-Type": "application/json",
      "access_token": this.apiKey ? `${this.apiKey.substring(0, 15)}...` : "MISSING",
    });
    if (body) {
      console.log(`[AsaasService] Body:`, JSON.stringify(body, null, 2));
    }

    try {
      const response = await fetch(url, options);
      
      // Log detalhado da resposta
      console.log(`[AsaasService] Response status: ${response.status}`);
      console.log(`[AsaasService] Response headers:`, Object.fromEntries(response.headers.entries()));
      
      // Ler o texto bruto primeiro para debug
      const rawText = await response.text();
      console.log(`[AsaasService] Response body (raw):`, rawText.substring(0, 500));
      
      // Tentar parsear como JSON
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseError) {
        console.error(`[AsaasService] Erro ao parsear JSON. Response não é JSON válido.`);
        console.error(`[AsaasService] Primeiros 1000 chars:`, rawText.substring(0, 1000));
        throw new HttpException(
          "Resposta inválida do Asaas. Verifique se a API Key e URL são do mesmo ambiente (produção/sandbox).",
          HttpStatus.BAD_GATEWAY
        );
      }

      if (!response.ok) {
        console.error(`[AsaasService] Erro na requisição:`, data);
        throw new HttpException(
          data.errors?.[0]?.description || "Erro na integração com Asaas",
          response.status
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error(`[AsaasService] Erro de conexão:`, error);
      throw new HttpException(
        "Erro de conexão com o Asaas",
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  // ========== CUSTOMERS ==========

  async createCustomer(data: CreateCustomerDto): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>("/customers", "POST", data);
  }

  async getCustomer(customerId: string): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>(`/customers/${customerId}`);
  }

  async updateCustomer(customerId: string, data: Partial<CreateCustomerDto>): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>(`/customers/${customerId}`, "PUT", data);
  }

  async findCustomerByEmail(email: string): Promise<AsaasCustomer | null> {
    const result = await this.request<{ data: AsaasCustomer[] }>(`/customers?email=${encodeURIComponent(email)}`);
    return result.data?.[0] || null;
  }

  async findCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomer | null> {
    const result = await this.request<{ data: AsaasCustomer[] }>(`/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`);
    return result.data?.[0] || null;
  }

  // ========== SUBSCRIPTIONS ==========

  async createSubscription(data: CreateSubscriptionDto): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>("/subscriptions", "POST", data);
  }

  async getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>(`/subscriptions/${subscriptionId}`);
  }

  async updateSubscription(subscriptionId: string, data: Partial<CreateSubscriptionDto>): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>(`/subscriptions/${subscriptionId}`, "PUT", data);
  }

  async cancelSubscription(subscriptionId: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/subscriptions/${subscriptionId}`, "DELETE");
  }

  async listSubscriptionsByCustomer(customerId: string): Promise<AsaasSubscription[]> {
    const result = await this.request<{ data: AsaasSubscription[] }>(`/subscriptions?customer=${customerId}`);
    return result.data || [];
  }

  async getSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
    const result = await this.request<{ data: AsaasPayment[] }>(`/subscriptions/${subscriptionId}/payments`);
    return result.data || [];
  }

  // ========== PAYMENTS (Cobranças avulsas) ==========

  async createPayment(data: CreatePaymentDto): Promise<AsaasPayment> {
    return this.request<AsaasPayment>("/payments", "POST", data);
  }

  async getPayment(paymentId: string): Promise<AsaasPayment> {
    return this.request<AsaasPayment>(`/payments/${paymentId}`);
  }

  async cancelPayment(paymentId: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/payments/${paymentId}`, "DELETE");
  }

  async listPaymentsByCustomer(customerId: string): Promise<AsaasPayment[]> {
    const result = await this.request<{ data: AsaasPayment[] }>(`/payments?customer=${customerId}`);
    return result.data || [];
  }

  async getPixQrCode(paymentId: string): Promise<{ encodedImage: string; payload: string; expirationDate: string }> {
    return this.request(`/payments/${paymentId}/pixQrCode`);
  }

  // ========== HELPERS ==========

  /**
   * Calcula a próxima data de vencimento (dia 10 do próximo mês ou mês seguinte se já passou)
   */
  getNextDueDate(): string {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();

    // Se já passou do dia 5, usa o próximo mês
    if (now.getDate() > 5) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }

    const dueDate = new Date(year, month, 10);
    return dueDate.toISOString().split("T")[0];
  }

  /**
   * Remove caracteres especiais do CNPJ/CPF
   */
  cleanCpfCnpj(cpfCnpj: string): string {
    return cpfCnpj.replace(/[^\d]/g, "");
  }
}

