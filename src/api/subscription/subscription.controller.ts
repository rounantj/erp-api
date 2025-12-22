import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { SubscriptionService, CreateSubscriptionDto } from "./subscription.service";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";

@Controller("subscriptions")
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // ========== PLANS ==========

  @Get("plans")
  async getAllPlans() {
    const plans = await this.subscriptionService.getAllPlans();
    return {
      success: true,
      data: plans,
    };
  }

  @Get("plans/:id")
  async getPlanById(@Param("id", ParseIntPipe) id: number) {
    const plan = await this.subscriptionService.getPlanById(id);
    return {
      success: true,
      data: plan,
    };
  }

  @Put("plans/:id/trial-days")
  async updatePlanTrialDays(
    @Param("id", ParseIntPipe) id: number,
    @Body("trialDays", ParseIntPipe) trialDays: number
  ) {
    const plan = await this.subscriptionService.updatePlanTrialDays(id, trialDays);
    return {
      success: true,
      data: plan,
      message: `Dias de trial atualizados para ${trialDays}`,
    };
  }

  // ========== SUBSCRIPTIONS ==========

  @Get("company/:companyId")
  async getSubscriptionByCompany(@Param("companyId", ParseIntPipe) companyId: number) {
    const subscription = await this.subscriptionService.getSubscriptionByCompanyId(companyId);
    return {
      success: true,
      data: subscription,
    };
  }

  @Post("trial")
  @HttpCode(HttpStatus.CREATED)
  async createTrialSubscription(@Body("companyId", ParseIntPipe) companyId: number) {
    const subscription = await this.subscriptionService.createTrialSubscription(companyId);
    return {
      success: true,
      data: subscription,
      message: "Trial iniciado com sucesso",
    };
  }

  @Post("create")
  @HttpCode(HttpStatus.CREATED)
  async createPaidSubscription(@Body() data: CreateSubscriptionDto & { paymentMethod?: string }) {
    const result = await this.subscriptionService.createPaidSubscriptionWithPayment(data);
    return {
      success: true,
      data: result,
      message: "Subscription criada com sucesso",
    };
  }

  /**
   * Altera plano diretamente - APENAS ADMIN (tela de Empresas)
   */
  @Put(":id/change-plan-admin")
  async changePlanAdmin(
    @Param("id", ParseIntPipe) id: number,
    @Body("newPlanId", ParseIntPipe) newPlanId: number
  ) {
    const subscription = await this.subscriptionService.changePlanAdmin(id, newPlanId);
    return {
      success: true,
      data: subscription,
      message: "Plano alterado com sucesso",
    };
  }

  /**
   * Solicita upgrade de plano - gera link de pagamento
   * O plano só será alterado via webhook quando o pagamento for confirmado
   * @param id - subscriptionId (ID da subscription)
   */
  @Put(":id/change-plan")
  async requestPlanUpgrade(
    @Param("id", ParseIntPipe) subscriptionId: number,
    @Body() body: { newPlanId: number; billingPeriod?: string; totalAmount?: number }
  ) {
    // Buscar subscription pelo ID
    const subscriptionRepo = await this.subscriptionService.getSubscriptionById(subscriptionId);
    
    if (!subscriptionRepo) {
      return {
        success: false,
        message: "Subscription não encontrada",
      };
    }

    const result = await this.subscriptionService.requestPlanUpgrade(
      subscriptionRepo.companyId,
      body.newPlanId,
      body.billingPeriod || "monthly",
      body.totalAmount
    );

    return {
      success: true,
      data: result,
      message: "Link de pagamento gerado. Após o pagamento, o plano será atualizado automaticamente.",
    };
  }

  @Delete(":id")
  async cancelSubscription(@Param("id", ParseIntPipe) id: number) {
    const subscription = await this.subscriptionService.cancelSubscription(id);
    return {
      success: true,
      data: subscription,
      message: "Subscription cancelada com sucesso",
    };
  }

  // ========== PAYMENTS ==========

  @Post("payments/single")
  @HttpCode(HttpStatus.CREATED)
  async createSinglePayment(
    @Body("companyId", ParseIntPipe) companyId: number,
    @Body("amount") amount: number,
    @Body("description") description: string,
    @Body("paymentMethod") paymentMethod?: string
  ) {
    const result = await this.subscriptionService.createSinglePaymentWithDetails(
      companyId,
      amount,
      description,
      paymentMethod
    );
    return {
      success: true,
      data: result,
      message: "Cobrança avulsa criada com sucesso",
    };
  }

  @Get("payments/:companyId")
  async getPaymentHistory(@Param("companyId", ParseIntPipe) companyId: number) {
    const payments = await this.subscriptionService.getPaymentHistory(companyId);
    return {
      success: true,
      data: payments,
    };
  }

  // ========== FEATURES ==========

  @Get("features/:companyId")
  async getCompanyFeatures(@Param("companyId", ParseIntPipe) companyId: number) {
    const subscription = await this.subscriptionService.getSubscriptionByCompanyId(companyId);

    if (!subscription) {
      return {
        success: true,
        data: {
          plan: null as null,
          features: {} as Record<string, boolean>,
          status: "no_subscription",
          canAccess: false,
        },
      };
    }

    const plan = await this.subscriptionService.getPlanById(subscription.planId);

    // Verificar status efetivo
    let effectiveStatus = subscription.status;
    
    // Se o plano nunca expira (vitalício), sempre está ativo
    if (plan.neverExpires) {
      effectiveStatus = "active";
    }
    // Se trial expirou, marcar como expired
    else if (subscription.status === "trial" && subscription.trialEndsAt) {
      const now = new Date();
      if (now > subscription.trialEndsAt) {
        effectiveStatus = "expired";
      }
    }

    // Determinar se pode acessar o sistema
    // Planos que nunca expiram sempre têm acesso
    const blockedStatuses = ["past_due", "cancelled", "readonly", "expired"];
    const canAccess = plan.neverExpires || !blockedStatuses.includes(effectiveStatus);

    return {
      success: true,
      data: {
        subscriptionId: subscription.id,
        plan: {
          id: plan.id,
          name: plan.name,
          displayName: plan.displayName,
          maxUsers: plan.maxUsers,
          price: plan.price,
          features: plan.features,
        },
        features: plan.features || {},
        status: effectiveStatus,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        canAccess: canAccess,
      },
    };
  }
}

