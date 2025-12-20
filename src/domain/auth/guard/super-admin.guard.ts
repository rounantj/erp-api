import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";

// Email do Super Admin - único usuário com acesso total ao sistema
const SUPER_ADMIN_EMAIL = "rounantj@hotmail.com";

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Extrair o email do usuário do token JWT
    const userEmail =
      user?.sub?.email || user?.email || user?.user?.email || null;

    if (!userEmail) {
      throw new ForbiddenException(
        "Acesso negado: Não foi possível identificar o usuário"
      );
    }

    // Verificar se é o super admin
    if (userEmail.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      throw new ForbiddenException(
        "Acesso negado: Você não tem permissão para acessar este recurso"
      );
    }

    return true;
  }
}

/**
 * Helper function para verificar se um email é o super admin
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

/**
 * Constante exportada do email do super admin (para uso em outros módulos se necessário)
 */
export const SUPER_ADMIN_EMAIL_CONSTANT = SUPER_ADMIN_EMAIL;


