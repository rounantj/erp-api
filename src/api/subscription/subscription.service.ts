import { Injectable, HttpException, HttpStatus, NotFoundException, BadRequestException } from "@nestjs/common";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { AsaasService } from "./asaas.service";
import { CompanySubscription, SubscriptionStatus } from "@/domain/entities/company-subscription.entity";
import { Plan } from "@/domain/entities/plan.entity";
import { PaymentHistory } from "@/domain/entities/payment-history.entity";
import { IsNull } from "typeorm";

export interface CreateSubscriptionDto {
  companyId: number;
  planId: number;
  customerEmail: string;
  customerName: string;
  customerCpfCnpj: string;
  customerPhone?: string;
}

export interface ChangeSubscriptionPlanDto {
  newPlanId: number;
}

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly uow: UnitOfWorkService,
    private readonly asaasService: AsaasService
  ) {}

  // ========== PLANS ==========

  async getAllPlans(): Promise<Plan[]> {
    return this.uow.planRepository.find({
      where: { isActive: true, deletedAt: IsNull() },
      order: { sortOrder: "ASC" },
    });
  }

  async getPlanById(id: number): Promise<Plan> {
    const plan = await this.uow.planRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!plan) {
      throw new NotFoundException("Plano não encontrado");
    }

    return plan;
  }

  async getPlanByName(name: string): Promise<Plan> {
    const plan = await this.uow.planRepository.findOne({
      where: { name, deletedAt: IsNull() },
    });

    if (!plan) {
      throw new NotFoundException("Plano não encontrado");
    }

    return plan;
  }

  async updatePlanTrialDays(planId: number, trialDays: number): Promise<Plan> {
    const plan = await this.getPlanById(planId);
    plan.trialDays = trialDays;
    plan.updatedAt = new Date();
    return this.uow.planRepository.save(plan);
  }

  // ========== SUBSCRIPTIONS ==========

  async getSubscriptionByCompanyId(companyId: number): Promise<CompanySubscription | null> {
    return this.uow.companySubscriptionRepository.findOne({
      where: { companyId, deletedAt: IsNull() },
      relations: ["plan", "company"],
    });
  }

  async getSubscriptionById(id: number): Promise<CompanySubscription | null> {
    return this.uow.companySubscriptionRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ["plan", "company"],
    });
  }

  /**
   * Verifica se um customer ID existe no Asaas atual
   * Útil para detectar mudança de ambiente (sandbox -> produção)
   */
  async verifyAsaasCustomer(customerId: string): Promise<boolean> {
    if (!customerId) return false;
    try {
      await this.asaasService.getCustomer(customerId);
      console.log(`[SubscriptionService] Customer ${customerId} verificado com sucesso`);
      return true;
    } catch (e) {
      console.log(`[SubscriptionService] Customer ${customerId} não existe no Asaas atual`);
      return false;
    }
  }

  /**
   * Busca ou cria cliente no Asaas usando dados do CompanySetup
   * Centraliza a lógica para garantir consistência em todos os pagamentos
   * IMPORTANTE: Sempre verifica se o customer salvo ainda existe (pode ter mudado de ambiente)
   */
  async getOrCreateAsaasCustomer(companyId: number, existingCustomerId?: string): Promise<string> {
    // Se já tem um customer ID, verificar se ainda existe no Asaas atual
    if (existingCustomerId) {
      const exists = await this.verifyAsaasCustomer(existingCustomerId);
      if (exists) {
        return existingCustomerId;
      }
      console.log(`[SubscriptionService] Customer ${existingCustomerId} não existe, criando novo...`);
    }

    // Buscar CompanySetup
    const companySetup = await this.uow.companySetupRepository.findOne({
      where: { companyId },
    });

    if (!companySetup?.companyCNPJ) {
      throw new BadRequestException(
        "Empresa não possui CPF/CNPJ cadastrado. Por favor, atualize o cadastro nas Configurações."
      );
    }

    const cleanCpfCnpj = this.asaasService.cleanCpfCnpj(companySetup.companyCNPJ);

    // Verificar se já existe cliente no Asaas por CPF/CNPJ
    let existingCustomer = null;
    try {
      existingCustomer = await this.asaasService.findCustomerByCpfCnpj(cleanCpfCnpj);
    } catch (e) {
      // Ignora erro de busca
    }

    if (existingCustomer) {
      console.log(`[SubscriptionService] Cliente encontrado no Asaas por CPF/CNPJ: ${existingCustomer.id}`);
      return existingCustomer.id;
    }

    // Criar cliente no Asaas com dados do CompanySetup
    const customerData = {
      name: companySetup.companyName || `Empresa ${companyId}`,
      email: companySetup.companyEmail || `empresa${companyId}@sistema.local`,
      cpfCnpj: cleanCpfCnpj,
      phone: companySetup.companyPhone || undefined,
      externalReference: `company_${companyId}`,
    };

    console.log("[SubscriptionService] Criando cliente no Asaas com dados do CompanySetup:", {
      name: customerData.name,
      email: customerData.email,
      cpfCnpj: customerData.cpfCnpj,
    });

    const customer = await this.asaasService.createCustomer(customerData);
    console.log(`[SubscriptionService] Cliente criado no Asaas: ${customer.id}`);
    
    return customer.id;
  }

  async createTrialSubscription(companyId: number): Promise<CompanySubscription> {
    // Verificar se já existe subscription
    const existingSubscription = await this.getSubscriptionByCompanyId(companyId);
    if (existingSubscription) {
      throw new BadRequestException("Empresa já possui uma subscription");
    }

    // Buscar plano grátis
    const freePlan = await this.getPlanByName("free_trial");

    // Calcular data de término do trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + freePlan.trialDays);

    // Criar subscription local
    const subscription = new CompanySubscription();
    subscription.companyId = companyId;
    subscription.planId = freePlan.id;
    subscription.status = "trial";
    subscription.trialEndsAt = trialEndsAt;
    subscription.createdAt = new Date();
    subscription.updatedAt = new Date();

    return this.uow.companySubscriptionRepository.save(subscription);
  }

  async createPaidSubscription(data: CreateSubscriptionDto): Promise<CompanySubscription> {
    const plan = await this.getPlanById(data.planId);

    if (plan.name === "free_trial") {
      throw new BadRequestException("Use createTrialSubscription para plano gratuito");
    }

    if (plan.name === "empresarial") {
      throw new BadRequestException("Plano empresarial requer negociação. Entre em contato: " + plan.contactPhone);
    }

    // Buscar ou criar subscription existente
    let subscription = await this.getSubscriptionByCompanyId(data.companyId);

    // Buscar ou criar cliente no Asaas usando dados do CompanySetup
    let asaasCustomerId = subscription?.asaasCustomerId;
    if (!asaasCustomerId) {
      asaasCustomerId = await this.getOrCreateAsaasCustomer(data.companyId);
    }

    // Criar subscription no Asaas
    const asaasSubscription = await this.asaasService.createSubscription({
      customer: asaasCustomerId,
      billingType: "UNDEFINED", // Cliente escolhe
      value: Number(plan.price),
      nextDueDate: this.asaasService.getNextDueDate(),
      cycle: "MONTHLY",
      description: `Plano ${plan.displayName} - ERP Reboot`,
      externalReference: `company_${data.companyId}`,
    });

    // Atualizar ou criar subscription local
    if (!subscription) {
      subscription = new CompanySubscription();
      subscription.companyId = data.companyId;
      subscription.createdAt = new Date();
    }

    subscription.planId = plan.id;
    subscription.asaasCustomerId = asaasCustomerId;
    subscription.asaasSubscriptionId = asaasSubscription.id;
    subscription.status = "active";
    subscription.currentPeriodStart = new Date();
    
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    subscription.currentPeriodEnd = periodEnd;
    subscription.updatedAt = new Date();

    return this.uow.companySubscriptionRepository.save(subscription);
  }

  /**
   * Cria subscription paga com detalhes do primeiro pagamento
   */
  async createPaidSubscriptionWithPayment(
    data: CreateSubscriptionDto & { paymentMethod?: string }
  ): Promise<{
    subscription: CompanySubscription;
    paymentUrl?: string;
    pixCode?: string;
    pixQrCodeImage?: string;
    boletoUrl?: string;
  }> {
    const plan = await this.getPlanById(data.planId);

    if (plan.name === "free_trial") {
      throw new BadRequestException("Use createTrialSubscription para plano gratuito");
    }

    if (plan.name === "empresarial") {
      throw new BadRequestException("Plano empresarial requer negociação. Entre em contato: " + plan.contactPhone);
    }

    // Buscar ou criar subscription existente
    let subscription = await this.getSubscriptionByCompanyId(data.companyId);

    // Buscar ou criar cliente no Asaas usando dados do CompanySetup
    let asaasCustomerId = subscription?.asaasCustomerId;
    if (!asaasCustomerId) {
      asaasCustomerId = await this.getOrCreateAsaasCustomer(data.companyId);
    }

    // Mapear método de pagamento
    const billingType = this.mapPaymentMethod(data.paymentMethod);

    // Criar subscription no Asaas
    const asaasSubscription = await this.asaasService.createSubscription({
      customer: asaasCustomerId,
      billingType,
      value: Number(plan.price),
      nextDueDate: this.asaasService.getNextDueDate(),
      cycle: "MONTHLY",
      description: `Plano ${plan.displayName} - ERP Reboot`,
      externalReference: `company_${data.companyId}`,
    });

    // Atualizar ou criar subscription local
    if (!subscription) {
      subscription = new CompanySubscription();
      subscription.companyId = data.companyId;
      subscription.createdAt = new Date();
    }

    subscription.planId = plan.id;
    subscription.asaasCustomerId = asaasCustomerId;
    subscription.asaasSubscriptionId = asaasSubscription.id;
    subscription.status = "active";
    subscription.currentPeriodStart = new Date();
    
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    subscription.currentPeriodEnd = periodEnd;
    subscription.updatedAt = new Date();

    const savedSubscription = await this.uow.companySubscriptionRepository.save(subscription);

    // Buscar pagamentos da subscription para obter URL do checkout
    const result: any = { subscription: savedSubscription };

    try {
      // Aguardar um pouco para o Asaas processar
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const payments = await this.asaasService.getSubscriptionPayments(asaasSubscription.id);
      const firstPayment = payments[0];

      console.log("[SubscriptionService] Primeiro pagamento da subscription:", {
        id: firstPayment?.id,
        invoiceUrl: firstPayment?.invoiceUrl,
        status: firstPayment?.status,
      });

      if (firstPayment?.invoiceUrl) {
        result.paymentUrl = firstPayment.invoiceUrl;
        result.invoiceUrl = firstPayment.invoiceUrl;
      }
    } catch (error) {
      console.error("[SubscriptionService] Erro ao buscar pagamentos da subscription:", error);
    }

    return result;
  }

  /**
   * Altera plano diretamente (apenas para ADMIN na tela de Empresas)
   */
  async changePlanAdmin(subscriptionId: number, newPlanId: number): Promise<CompanySubscription> {
    const subscription = await this.uow.companySubscriptionRepository.findOne({
      where: { id: subscriptionId, deletedAt: IsNull() },
    });

    if (!subscription) {
      throw new NotFoundException("Subscription não encontrada");
    }

    const newPlan = await this.getPlanById(newPlanId);

    if (newPlan.name === "empresarial") {
      throw new BadRequestException("Plano empresarial requer negociação. Entre em contato: " + newPlan.contactPhone);
    }

    // Se tem subscription no Asaas, atualizar lá
    if (subscription.asaasSubscriptionId && newPlan.price > 0) {
      try {
        await this.asaasService.updateSubscription(subscription.asaasSubscriptionId, {
          value: Number(newPlan.price),
          description: `Plano ${newPlan.displayName} - ERP Reboot`,
        });
      } catch (error) {
        console.error("[SubscriptionService] Erro ao atualizar subscription no Asaas:", error);
      }
    }

    subscription.planId = newPlan.id;
    subscription.updatedAt = new Date();

    // Se o plano nunca expira (vitalício), sempre ativo
    if (newPlan.neverExpires) {
      subscription.status = "active";
    }
    // Se estava em trial e trocou para plano pago, atualizar status
    else if (subscription.status === "trial" && newPlan.price > 0) {
      subscription.status = "active";
    }

    return this.uow.companySubscriptionRepository.save(subscription);
  }

  /**
   * Gera link de pagamento para upgrade de plano (usuário comum)
   * NÃO altera o plano - isso será feito via webhook quando o pagamento for confirmado
   */
  async requestPlanUpgrade(
    companyId: number,
    newPlanId: number,
    billingPeriod: string = "monthly",
    totalAmount?: number
  ): Promise<{
    paymentUrl: string;
    invoiceUrl: string;
    pendingPlanId: number;
  }> {
    let subscription = await this.getSubscriptionByCompanyId(companyId);

    if (!subscription) {
      throw new NotFoundException("Subscription não encontrada para esta empresa");
    }

    const newPlan = await this.getPlanById(newPlanId);

    if (newPlan.name === "empresarial") {
      throw new BadRequestException("Plano empresarial requer negociação. Entre em contato: " + newPlan.contactPhone);
    }

    if (newPlan.price === 0) {
      throw new BadRequestException("Use a rota de trial para plano gratuito");
    }

    // Buscar ou criar cliente no Asaas (verifica se existe no ambiente atual)
    const asaasCustomerId = await this.getOrCreateAsaasCustomer(companyId, subscription.asaasCustomerId);
    if (asaasCustomerId !== subscription.asaasCustomerId) {
      subscription.asaasCustomerId = asaasCustomerId;
      subscription = await this.uow.companySubscriptionRepository.save(subscription);
    }

    // Calcular valor baseado no período
    const months = billingPeriod === "yearly" ? 12 : billingPeriod === "quarterly" ? 3 : 1;
    const amount = totalAmount || (Number(newPlan.price) * months);
    
    // Descrição com período
    const periodLabel = billingPeriod === "yearly" ? "Anual" : billingPeriod === "quarterly" ? "Trimestral" : "Mensal";
    const description = `Upgrade para Plano ${newPlan.displayName} (${periodLabel})`;

    // Criar cobrança no Asaas - NÃO alterar o plano ainda
    // A mudança será feita via webhook quando o pagamento for confirmado
    const asaasPayment = await this.asaasService.createPayment({
      customer: subscription.asaasCustomerId,
      billingType: "UNDEFINED",
      value: amount,
      dueDate: this.asaasService.getNextDueDate(),
      description,
      // externalReference contém o planId pendente para processar no webhook
      externalReference: `upgrade_company_${companyId}_plan_${newPlanId}_period_${billingPeriod}`,
    });

    console.log("[SubscriptionService] Cobrança de upgrade criada:", {
      paymentId: asaasPayment.id,
      invoiceUrl: asaasPayment.invoiceUrl,
      pendingPlanId: newPlanId,
    });

    // Registrar no histórico como pendente
    const history = new PaymentHistory();
    history.companySubscriptionId = subscription.id;
    history.asaasPaymentId = asaasPayment.id;
    history.amount = amount;
    history.status = "pending";
    history.billingType = "UNDEFINED";
    history.invoiceUrl = asaasPayment.invoiceUrl;
    history.dueDate = new Date(asaasPayment.dueDate);
    history.description = description;
    history.createdAt = new Date();
    await this.uow.paymentHistoryRepository.save(history);

    return {
      paymentUrl: asaasPayment.invoiceUrl,
      invoiceUrl: asaasPayment.invoiceUrl,
      pendingPlanId: newPlanId,
    };
  }

  async cancelSubscription(subscriptionId: number): Promise<CompanySubscription> {
    const subscription = await this.uow.companySubscriptionRepository.findOne({
      where: { id: subscriptionId, deletedAt: IsNull() },
    });

    if (!subscription) {
      throw new NotFoundException("Subscription não encontrada");
    }

    // Cancelar no Asaas se existir
    if (subscription.asaasSubscriptionId) {
      try {
        await this.asaasService.cancelSubscription(subscription.asaasSubscriptionId);
      } catch (error) {
        console.error("[SubscriptionService] Erro ao cancelar no Asaas:", error);
      }
    }

    subscription.status = "cancelled";
    subscription.updatedAt = new Date();

    return this.uow.companySubscriptionRepository.save(subscription);
  }

  async updateSubscriptionStatus(subscriptionId: number, status: SubscriptionStatus): Promise<CompanySubscription> {
    const subscription = await this.uow.companySubscriptionRepository.findOne({
      where: { id: subscriptionId, deletedAt: IsNull() },
    });

    if (!subscription) {
      throw new NotFoundException("Subscription não encontrada");
    }

    subscription.status = status;
    subscription.updatedAt = new Date();

    return this.uow.companySubscriptionRepository.save(subscription);
  }

  // ========== PAYMENTS ==========

  async createSinglePayment(
    companyId: number,
    amount: number,
    description: string
  ): Promise<PaymentHistory> {
    let subscription = await this.getSubscriptionByCompanyId(companyId);

    if (!subscription) {
      throw new NotFoundException("Subscription não encontrada para esta empresa");
    }

    // Buscar ou criar cliente no Asaas (verifica se existe no ambiente atual)
    const asaasCustomerId = await this.getOrCreateAsaasCustomer(companyId, subscription.asaasCustomerId);
    if (asaasCustomerId !== subscription.asaasCustomerId) {
      subscription.asaasCustomerId = asaasCustomerId;
      subscription = await this.uow.companySubscriptionRepository.save(subscription);
    }

    // Criar cobrança avulsa no Asaas
    const payment = await this.asaasService.createPayment({
      customer: asaasCustomerId,
      billingType: "UNDEFINED",
      value: amount,
      dueDate: this.asaasService.getNextDueDate(),
      description,
      externalReference: `company_${companyId}`,
    });

    // Registrar no histórico
    const history = new PaymentHistory();
    history.companySubscriptionId = subscription.id;
    history.asaasPaymentId = payment.id;
    history.amount = amount;
    history.status = "pending";
    history.billingType = payment.billingType;
    history.invoiceUrl = payment.invoiceUrl || payment.bankSlipUrl;
    history.dueDate = new Date(payment.dueDate);
    history.description = description;
    history.createdAt = new Date();

    return this.uow.paymentHistoryRepository.save(history);
  }

  /**
   * Cria cobrança e retorna URL do checkout Asaas
   */
  async createSinglePaymentWithDetails(
    companyId: number,
    amount: number,
    description: string,
    paymentMethod?: string
  ): Promise<{
    payment: PaymentHistory;
    paymentUrl?: string;
    invoiceUrl?: string;
  }> {
    let subscription = await this.getSubscriptionByCompanyId(companyId);

    if (!subscription) {
      throw new NotFoundException("Subscription não encontrada para esta empresa");
    }

    // Buscar ou criar cliente no Asaas (verifica se existe no ambiente atual)
    const asaasCustomerId = await this.getOrCreateAsaasCustomer(companyId, subscription.asaasCustomerId);
    if (asaasCustomerId !== subscription.asaasCustomerId) {
      subscription.asaasCustomerId = asaasCustomerId;
      subscription = await this.uow.companySubscriptionRepository.save(subscription);
    }

    // Criar cobrança no Asaas com checkout completo
    const asaasPayment = await this.asaasService.createPayment({
      customer: asaasCustomerId,
      billingType: "UNDEFINED",
      value: amount,
      dueDate: this.asaasService.getNextDueDate(),
      description,
      externalReference: `company_${companyId}`,
    });

    console.log("[SubscriptionService] Cobrança criada no Asaas:", {
      id: asaasPayment.id,
      invoiceUrl: asaasPayment.invoiceUrl,
      status: asaasPayment.status,
    });

    // Registrar no histórico
    const history = new PaymentHistory();
    history.companySubscriptionId = subscription.id;
    history.asaasPaymentId = asaasPayment.id;
    history.amount = amount;
    history.status = "pending";
    history.billingType = asaasPayment.billingType || "UNDEFINED";
    history.invoiceUrl = asaasPayment.invoiceUrl;
    history.dueDate = new Date(asaasPayment.dueDate);
    history.description = description;
    history.createdAt = new Date();

    const savedPayment = await this.uow.paymentHistoryRepository.save(history);

    // Retornar URL do checkout Asaas
    return {
      payment: savedPayment,
      paymentUrl: asaasPayment.invoiceUrl,
      invoiceUrl: asaasPayment.invoiceUrl,
    };
  }

  private mapPaymentMethod(method?: string): "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED" {
    switch (method?.toLowerCase()) {
      case "pix":
        return "PIX";
      case "boleto":
        return "BOLETO";
      case "credit_card":
      case "cartao":
        return "CREDIT_CARD";
      default:
        return "UNDEFINED";
    }
  }

  async getPaymentHistory(companyId: number): Promise<PaymentHistory[]> {
    const subscription = await this.getSubscriptionByCompanyId(companyId);

    if (!subscription) {
      return [];
    }

    return this.uow.paymentHistoryRepository.find({
      where: { companySubscriptionId: subscription.id },
      order: { createdAt: "DESC" },
    });
  }

  async savePaymentFromWebhook(
    asaasPaymentId: string,
    subscriptionId: number,
    data: Partial<PaymentHistory>
  ): Promise<PaymentHistory> {
    // Verificar se já existe
    let payment = await this.uow.paymentHistoryRepository.findOne({
      where: { asaasPaymentId },
    });

    if (!payment) {
      payment = new PaymentHistory();
      payment.asaasPaymentId = asaasPaymentId;
      payment.companySubscriptionId = subscriptionId;
      payment.createdAt = new Date();
    }

    Object.assign(payment, data);

    return this.uow.paymentHistoryRepository.save(payment);
  }

  // ========== TRIAL CHECK ==========

  async checkAndUpdateTrialStatus(): Promise<void> {
    const now = new Date();

    // Buscar todas as subscriptions em trial que expiraram
    const expiredTrials = await this.uow.companySubscriptionRepository
      .createQueryBuilder("subscription")
      .where("subscription.status = :status", { status: "trial" })
      .andWhere("subscription.trial_ends_at < :now", { now })
      .andWhere("subscription.deleted_at IS NULL")
      .getMany();

    for (const subscription of expiredTrials) {
      subscription.status = "readonly";
      subscription.updatedAt = new Date();
      await this.uow.companySubscriptionRepository.save(subscription);
      console.log(`[SubscriptionService] Trial expirado para company_id=${subscription.companyId}`);
    }
  }

  // ========== SUBSCRIPTION BY ASAAS ID ==========

  async getSubscriptionByAsaasId(asaasSubscriptionId: string): Promise<CompanySubscription | null> {
    return this.uow.companySubscriptionRepository.findOne({
      where: { asaasSubscriptionId, deletedAt: IsNull() },
      relations: ["plan", "company"],
    });
  }

  async getSubscriptionByAsaasCustomerId(asaasCustomerId: string): Promise<CompanySubscription | null> {
    return this.uow.companySubscriptionRepository.findOne({
      where: { asaasCustomerId, deletedAt: IsNull() },
      relations: ["plan", "company"],
    });
  }

  // ========== UPDATE HELPERS ==========

  async updateAsaasCustomerId(subscriptionId: number, asaasCustomerId: string): Promise<void> {
    await this.uow.companySubscriptionRepository.update(
      { id: subscriptionId },
      { asaasCustomerId, updatedAt: new Date() }
    );
  }

  async updateSubscriptionPeriod(subscriptionId: number, periodStart: Date, periodEnd: Date): Promise<void> {
    await this.uow.companySubscriptionRepository.update(
      { id: subscriptionId },
      { 
        currentPeriodStart: periodStart, 
        currentPeriodEnd: periodEnd,
        updatedAt: new Date() 
      }
    );
  }
}

