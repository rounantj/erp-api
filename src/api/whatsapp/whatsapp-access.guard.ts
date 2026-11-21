import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FeatureService } from "../subscription/feature.service";
import { WHATSAPP_FEATURE } from "./whatsapp.config";

const ADMIN_ONLY_KEY = "whatsapp_admin_only";
export const WhatsappAdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);

const SUPER_ADMIN_EMAIL = "rounantj@hotmail.com";

export interface WhatsappUser {
  id: number;
  companyId: number;
  role: string;
  email: string;
}

export function whatsappUser(req: any): WhatsappUser {
  return req.whatsappUser;
}

// Usar depois do JwtAuthGuard: libera só empresas cujo plano inclui o atendimento por WhatsApp.
@Injectable()
export class WhatsappAccessGuard implements CanActivate {
  private readonly logger = new Logger("WhatsappAccess");

  constructor(private readonly reflector: Reflector, private readonly features: FeatureService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await this.check(context);
    } catch (err: any) {
      const req = context.switchToHttp().getRequest();
      this.logger.warn(`${req.method} ${req.originalUrl} recusado: ${JSON.stringify(err?.response ?? err?.message)}`);
      throw err;
    }
  }

  private async check(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user?.sub;
    const companyId = Number(user?.companyId);
    if (!user?.id || !companyId) throw new ForbiddenException("Usuário sem empresa");

    const isSuperAdmin = String(user.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, [context.getHandler(), context.getClass()]);
    if (adminOnly && user.role !== "admin" && !isSuperAdmin) {
      throw new ForbiddenException("Apenas administradores podem alterar o atendimento por WhatsApp");
    }
    if (user.role === "visitante" && !isSuperAdmin) throw new ForbiddenException("Acesso não permitido");

    const check = await this.features.checkFeature(companyId, WHATSAPP_FEATURE as any);
    if (!check.allowed) {
      throw new ForbiddenException({
        message: check.reason || "O atendimento por WhatsApp está disponível nos planos Profissional, Empresarial e Vitalício.",
        feature: WHATSAPP_FEATURE,
        planRequired: check.planRequired || "profissional",
      });
    }

    req.whatsappUser = { id: user.id, companyId, role: user.role, email: user.email } as WhatsappUser;
    return true;
  }
}
