import { Injectable } from "@nestjs/common";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { IsNull } from "typeorm";

export type FeatureName =
  | "create_products"
  | "checkout"
  | "sales"
  | "product_images"
  | "customization"
  | "curriculos"
  | "employees"
  | "priority_support"
  | "custom_features";

export interface FeatureCheckResult {
  allowed: boolean;
  reason?: string;
  planRequired?: string;
}

export interface SubscriptionInfo {
  planName: string;
  planDisplayName: string;
  status: string;
  maxUsers: number;
  currentUsers: number;
  features: Record<string, boolean>;
  trialEndsAt?: Date;
  canAccess: boolean;
  isReadonly: boolean;
}

@Injectable()
export class FeatureService {
  constructor(private readonly uow: UnitOfWorkService) {}

  /**
   * Verifica se uma empresa tem acesso a uma feature específica
   */
  async checkFeature(companyId: number, feature: FeatureName): Promise<FeatureCheckResult> {
    const subscription = await this.uow.companySubscriptionRepository.findOne({
      where: { companyId, deletedAt: IsNull() },
      relations: ["plan"],
    });

    if (!subscription) {
      return {
        allowed: false,
        reason: "Empresa não possui subscription",
      };
    }

    // Verificar status da subscription
    if (subscription.status === "cancelled") {
      return {
        allowed: false,
        reason: "Subscription cancelada",
      };
    }

    // Verificar se trial expirou
    if (subscription.status === "trial" && subscription.trialEndsAt) {
      const now = new Date();
      if (now > subscription.trialEndsAt) {
        return {
          allowed: false,
          reason: "Período de teste expirado. Assine um plano para continuar.",
          planRequired: "inicial",
        };
      }
    }

    // Verificar se está em modo readonly (somente leitura)
    if (subscription.status === "readonly" || subscription.status === "past_due") {
      // Em readonly, só permite leitura - features que criam/editam dados são bloqueadas
      const readonlyAllowedFeatures: FeatureName[] = ["checkout", "sales"];
      
      if (!readonlyAllowedFeatures.includes(feature)) {
        return {
          allowed: false,
          reason: subscription.status === "past_due" 
            ? "Pagamento em atraso. Regularize para continuar usando todas as funcionalidades."
            : "Acesso em modo somente leitura. Assine um plano para usar todas as funcionalidades.",
          planRequired: "inicial",
        };
      }
    }

    // Verificar se a feature está no plano
    const plan = subscription.plan;
    const features = plan.features as Record<string, boolean>;

    if (!features || !features[feature]) {
      // Determinar qual plano é necessário para a feature
      let planRequired = "profissional";
      if (["create_products", "checkout", "sales"].includes(feature)) {
        planRequired = "inicial";
      }

      return {
        allowed: false,
        reason: `Esta funcionalidade não está disponível no plano ${plan.displayName}`,
        planRequired,
      };
    }

    return { allowed: true };
  }

  /**
   * Verifica se a empresa pode adicionar mais usuários
   */
  async canAddUser(companyId: number): Promise<FeatureCheckResult> {
    const subscription = await this.uow.companySubscriptionRepository.findOne({
      where: { companyId, deletedAt: IsNull() },
      relations: ["plan"],
    });

    if (!subscription) {
      return {
        allowed: false,
        reason: "Empresa não possui subscription",
      };
    }

    const plan = subscription.plan;

    // -1 significa ilimitado
    if (plan.maxUsers === -1) {
      return { allowed: true };
    }

    // Contar usuários atuais da empresa
    const currentUsers = await this.uow.userRepository.count({
      where: { companyId, deletedAt: IsNull() },
    });

    if (currentUsers >= plan.maxUsers) {
      return {
        allowed: false,
        reason: `Limite de ${plan.maxUsers} usuários atingido no plano ${plan.displayName}`,
        planRequired: plan.name === "inicial" ? "profissional" : "empresarial",
      };
    }

    return { allowed: true };
  }

  /**
   * Retorna informações completas da subscription da empresa
   */
  async getSubscriptionInfo(companyId: number): Promise<SubscriptionInfo | null> {
    const subscription = await this.uow.companySubscriptionRepository.findOne({
      where: { companyId, deletedAt: IsNull() },
      relations: ["plan"],
    });

    if (!subscription) {
      return null;
    }

    const plan = subscription.plan;

    // Contar usuários atuais
    const currentUsers = await this.uow.userRepository.count({
      where: { companyId, deletedAt: IsNull() },
    });

    // Determinar status efetivo
    let effectiveStatus = subscription.status;
    let isReadonly = false;

    if (subscription.status === "trial" && subscription.trialEndsAt) {
      const now = new Date();
      if (now > subscription.trialEndsAt) {
        effectiveStatus = "readonly";
        isReadonly = true;
      }
    }

    if (subscription.status === "readonly" || subscription.status === "past_due") {
      isReadonly = true;
    }

    return {
      planName: plan.name,
      planDisplayName: plan.displayName,
      status: effectiveStatus,
      maxUsers: plan.maxUsers,
      currentUsers,
      features: (plan.features as Record<string, boolean>) || {},
      trialEndsAt: subscription.trialEndsAt,
      canAccess: effectiveStatus === "trial" || effectiveStatus === "active",
      isReadonly,
    };
  }

  /**
   * Retorna todas as features disponíveis para uma empresa
   */
  async getAvailableFeatures(companyId: number): Promise<Record<string, boolean>> {
    const subscription = await this.uow.companySubscriptionRepository.findOne({
      where: { companyId, deletedAt: IsNull() },
      relations: ["plan"],
    });

    if (!subscription) {
      return {};
    }

    // Verificar se está em modo readonly
    if (subscription.status === "readonly" || subscription.status === "past_due") {
      // Em readonly, retornar features limitadas
      return {
        create_products: false,
        checkout: true, // Permite ver o caixa
        sales: true, // Permite ver vendas
        product_images: false,
        customization: false,
        curriculos: false,
        employees: false,
      };
    }

    // Verificar se trial expirou
    if (subscription.status === "trial" && subscription.trialEndsAt) {
      const now = new Date();
      if (now > subscription.trialEndsAt) {
        return {
          create_products: false,
          checkout: true,
          sales: true,
          product_images: false,
          customization: false,
          curriculos: false,
          employees: false,
        };
      }
    }

    return (subscription.plan.features as Record<string, boolean>) || {};
  }
}



