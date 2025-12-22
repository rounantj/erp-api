import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import { SubscriptionService } from "./subscription.service";
import { SubscriptionStatus } from "@/domain/entities/company-subscription.entity";

interface AsaasPayment {
  object?: string;
  id: string;
  dateCreated?: string;
  customer: string;
  checkoutSession?: string | null;
  paymentLink?: string | null;
  subscription?: string;
  value: number;
  netValue?: number;
  originalValue?: number | null;
  interestValue?: number | null;
  description?: string;
  billingType: string;
  confirmedDate?: string | null;
  creditCard?: {
    creditCardNumber?: string;
    creditCardBrand?: string;
    creditCardToken?: string;
  } | null;
  pixTransaction?: {
    qrCode?: string;
    payload?: string;
  } | null;
  status: string;
  dueDate: string;
  originalDueDate?: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  installmentNumber?: number | null;
  invoiceUrl?: string;
  invoiceNumber?: string;
  externalReference?: string; // company_1, company_2, etc.
  deleted?: boolean;
  anticipated?: boolean;
  anticipable?: boolean;
  creditDate?: string;
  estimatedCreditDate?: string;
  transactionReceiptUrl?: string;
  nossoNumero?: string;
  bankSlipUrl?: string | null;
  lastInvoiceViewedDate?: string | null;
  lastBankSlipViewedDate?: string | null;
  discount?: {
    value: number;
    limitDate?: string | null;
    dueDateLimitDays?: number;
    type?: string;
  };
  fine?: {
    value: number;
    type?: string;
  };
  interest?: {
    value: number;
    type?: string;
  };
  postalService?: boolean;
  escrow?: any;
  refunds?: any;
}

interface AsaasWebhookPayload {
  id?: string;
  event: string;
  dateCreated?: string;
  payment?: AsaasPayment;
  subscription?: {
    id: string;
    customer: string;
    status: string;
    value: number;
    nextDueDate: string;
    externalReference?: string;
  };
}

@Controller("asaas-webhooks")
export class WebhookController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // GET para health check (útil para verificar se a rota está acessível)
  @Get()
  healthCheck() {
    return { status: "ok", message: "Webhook endpoint is active" };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: AsaasWebhookPayload,
    @Headers("asaas-access-token") accessToken: string
  ) {
    console.log("===========================================");
    console.log("[Webhook] 🔔 WEBHOOK RECEBIDO!");
    console.log("[Webhook] Evento:", payload.event);
    console.log("[Webhook] Payload:", JSON.stringify(payload, null, 2));
    console.log("===========================================");

    // Validar token do webhook (opcional, mas recomendado)
    const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (webhookToken && accessToken !== webhookToken) {
      console.warn("[Webhook] Token inválido recebido");
      throw new UnauthorizedException("Token inválido");
    }

    try {
      switch (payload.event) {
        // ========== PAYMENT EVENTS ==========
        case "PAYMENT_CONFIRMED":
        case "PAYMENT_RECEIVED":
          await this.handlePaymentConfirmed(payload);
          break;

        case "PAYMENT_OVERDUE":
          await this.handlePaymentOverdue(payload);
          break;

        case "PAYMENT_DELETED":
        case "PAYMENT_REFUNDED":
          await this.handlePaymentCancelled(payload);
          break;

        case "PAYMENT_CREATED":
        case "PAYMENT_UPDATED":
        case "PAYMENT_CHECKOUT_VIEWED":
          await this.handlePaymentUpdated(payload);
          break;

        // ========== SUBSCRIPTION EVENTS ==========
        case "SUBSCRIPTION_CREATED":
        case "SUBSCRIPTION_UPDATED":
          await this.handleSubscriptionUpdated(payload);
          break;

        case "SUBSCRIPTION_DELETED":
        case "SUBSCRIPTION_INACTIVATED":
          await this.handleSubscriptionCancelled(payload);
          break;

        default:
          console.log(`[Webhook] Evento não tratado: ${payload.event}`);
      }

      return { received: true, event: payload.event };
    } catch (error) {
      console.error(`[Webhook] Erro ao processar evento ${payload.event}:`, error);
      // Retornar 200 mesmo em erro para evitar reenvios do Asaas
      return { received: true, event: payload.event, error: true };
    }
  }

  // ========== HELPER: Encontrar subscription ==========

  private async findSubscription(payment: AsaasPayment) {
    let subscription = null;

    // 1. Tentar pelo subscription ID (se for pagamento de assinatura)
    if (payment.subscription) {
      subscription = await this.subscriptionService.getSubscriptionByAsaasId(payment.subscription);
      if (subscription) {
        console.log(`[Webhook] Subscription encontrada por asaasSubscriptionId: ${payment.subscription}`);
        return subscription;
      }
    }

    // 2. Tentar pelo customer ID
    if (payment.customer) {
      subscription = await this.subscriptionService.getSubscriptionByAsaasCustomerId(payment.customer);
      if (subscription) {
        console.log(`[Webhook] Subscription encontrada por asaasCustomerId: ${payment.customer}`);
        return subscription;
      }
    }

    // 3. Tentar pelo externalReference (company_X)
    if (payment.externalReference) {
      const match = payment.externalReference.match(/company_(\d+)/);
      if (match) {
        const companyId = parseInt(match[1], 10);
        subscription = await this.subscriptionService.getSubscriptionByCompanyId(companyId);
        if (subscription) {
          console.log(`[Webhook] Subscription encontrada por externalReference: ${payment.externalReference} -> companyId: ${companyId}`);
          
          // Atualizar o asaasCustomerId se não estiver preenchido
          if (!subscription.asaasCustomerId && payment.customer) {
            await this.subscriptionService.updateAsaasCustomerId(subscription.id, payment.customer);
            console.log(`[Webhook] AsaasCustomerId atualizado: ${payment.customer}`);
          }
          
          return subscription;
        }
      }
    }

    console.warn(`[Webhook] Subscription não encontrada para payment ${payment.id}`);
    console.warn(`[Webhook] customer: ${payment.customer}, subscription: ${payment.subscription}, externalReference: ${payment.externalReference}`);
    return null;
  }

  // ========== PAYMENT HANDLERS ==========

  private async handlePaymentConfirmed(payload: AsaasWebhookPayload) {
    if (!payload.payment) {
      console.warn("[Webhook] Payment não encontrado no payload");
      return;
    }

    const { payment } = payload;
    const subscription = await this.findSubscription(payment);

    if (!subscription) {
      return;
    }

    // Atualizar status da subscription para ativo
    await this.subscriptionService.updateSubscriptionStatus(subscription.id, "active");

    // Atualizar período da subscription
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await this.subscriptionService.updateSubscriptionPeriod(subscription.id, new Date(), periodEnd);

    // Salvar pagamento no histórico
    await this.subscriptionService.savePaymentFromWebhook(
      payment.id,
      subscription.id,
      {
        amount: payment.value,
        status: "confirmed",
        paymentMethod: this.mapBillingType(payment.billingType),
        billingType: payment.billingType,
        invoiceUrl: payment.invoiceUrl || payment.bankSlipUrl || undefined,
        paidAt: payment.clientPaymentDate 
          ? new Date(payment.clientPaymentDate) 
          : payment.confirmedDate 
            ? new Date(payment.confirmedDate) 
            : new Date(),
        dueDate: payment.dueDate ? new Date(payment.dueDate) : undefined,
        description: payment.description,
      }
    );

    console.log(`[Webhook] ✅ Pagamento confirmado: ${payment.id} - Company: ${subscription.companyId} - Status atualizado para ACTIVE`);
  }

  private async handlePaymentOverdue(payload: AsaasWebhookPayload) {
    if (!payload.payment) return;

    const { payment } = payload;
    const subscription = await this.findSubscription(payment);

    if (!subscription) {
      return;
    }

    // Atualizar status para past_due (atrasado)
    await this.subscriptionService.updateSubscriptionStatus(subscription.id, "past_due");

    // Atualizar status do pagamento
    await this.subscriptionService.savePaymentFromWebhook(
      payment.id,
      subscription.id,
      {
        amount: payment.value,
        status: "overdue",
        billingType: payment.billingType,
        dueDate: payment.dueDate ? new Date(payment.dueDate) : undefined,
        description: payment.description,
      }
    );

    console.log(`[Webhook] ⚠️ Pagamento em atraso: ${payment.id} - Company: ${subscription.companyId}`);
  }

  private async handlePaymentCancelled(payload: AsaasWebhookPayload) {
    if (!payload.payment) return;

    const { payment } = payload;
    const subscription = await this.findSubscription(payment);

    if (!subscription) return;

    await this.subscriptionService.savePaymentFromWebhook(
      payment.id,
      subscription.id,
      {
        status: payload.event === "PAYMENT_REFUNDED" ? "refunded" : "cancelled",
        description: payment.description,
      }
    );

    console.log(`[Webhook] ❌ Pagamento cancelado/estornado: ${payment.id}`);
  }

  private async handlePaymentUpdated(payload: AsaasWebhookPayload) {
    if (!payload.payment) return;

    const { payment } = payload;
    const subscription = await this.findSubscription(payment);

    if (!subscription) return;

    // Salvar/atualizar informações do pagamento
    await this.subscriptionService.savePaymentFromWebhook(
      payment.id,
      subscription.id,
      {
        amount: payment.value,
        status: this.mapPaymentStatus(payment.status),
        billingType: payment.billingType,
        paymentMethod: this.mapBillingType(payment.billingType),
        invoiceUrl: payment.invoiceUrl || payment.bankSlipUrl || undefined,
        pixQrCode: payment.pixTransaction?.qrCode,
        pixCopyPaste: payment.pixTransaction?.payload,
        dueDate: payment.dueDate ? new Date(payment.dueDate) : undefined,
        description: payment.description,
      }
    );

    console.log(`[Webhook] 📝 Pagamento atualizado: ${payment.id} - Status: ${payment.status}`);
  }

  // ========== SUBSCRIPTION HANDLERS ==========

  private async handleSubscriptionUpdated(payload: AsaasWebhookPayload) {
    if (!payload.subscription) return;

    const { subscription: asaasSubscription } = payload;

    let subscription = await this.subscriptionService.getSubscriptionByAsaasId(asaasSubscription.id);

    // Tentar pelo externalReference se não encontrar
    if (!subscription && asaasSubscription.externalReference) {
      const match = asaasSubscription.externalReference.match(/company_(\d+)/);
      if (match) {
        const companyId = parseInt(match[1], 10);
        subscription = await this.subscriptionService.getSubscriptionByCompanyId(companyId);
      }
    }

    if (!subscription) {
      console.warn(`[Webhook] Subscription não encontrada: ${asaasSubscription.id}`);
      return;
    }

    // Mapear status do Asaas para o nosso sistema
    let status: SubscriptionStatus = "active";
    if (asaasSubscription.status === "INACTIVE" || asaasSubscription.status === "EXPIRED") {
      status = "cancelled";
    }

    await this.subscriptionService.updateSubscriptionStatus(subscription.id, status);

    console.log(`[Webhook] 📋 Subscription atualizada: ${asaasSubscription.id} - Status: ${status}`);
  }

  private async handleSubscriptionCancelled(payload: AsaasWebhookPayload) {
    if (!payload.subscription) return;

    const { subscription: asaasSubscription } = payload;

    let subscription = await this.subscriptionService.getSubscriptionByAsaasId(asaasSubscription.id);

    // Tentar pelo externalReference se não encontrar
    if (!subscription && asaasSubscription.externalReference) {
      const match = asaasSubscription.externalReference.match(/company_(\d+)/);
      if (match) {
        const companyId = parseInt(match[1], 10);
        subscription = await this.subscriptionService.getSubscriptionByCompanyId(companyId);
      }
    }

    if (!subscription) return;

    await this.subscriptionService.updateSubscriptionStatus(subscription.id, "cancelled");

    console.log(`[Webhook] 🚫 Subscription cancelada: ${asaasSubscription.id}`);
  }

  // ========== HELPERS ==========

  private mapBillingType(billingType: string): "pix" | "boleto" | "credit_card" | "undefined" {
    switch (billingType) {
      case "PIX":
        return "pix";
      case "BOLETO":
        return "boleto";
      case "CREDIT_CARD":
        return "credit_card";
      default:
        return "undefined";
    }
  }

  private mapPaymentStatus(status: string): "pending" | "confirmed" | "received" | "overdue" | "refunded" | "cancelled" {
    switch (status) {
      case "PENDING":
        return "pending";
      case "CONFIRMED":
        return "confirmed";
      case "RECEIVED":
      case "RECEIVED_IN_CASH":
        return "received";
      case "OVERDUE":
        return "overdue";
      case "REFUNDED":
      case "REFUND_REQUESTED":
        return "refunded";
      default:
        return "pending";
    }
  }
}
