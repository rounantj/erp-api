
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Roles } from '../enums/roles.enum'
import { User } from '@/domain/entities/user.entity'

export const ROLES_KEY = 'roles'
export const HasRoles = (...roles: Roles[]) => SetMetadata('roles', roles)

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Roles[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles) {
      return true
    }
    const { user } = context.switchToHttp().getRequest()

    // Obtem do JWT quando JwtStrategy
    let roles = user?.roles


    return requiredRoles.some((role) => roles?.includes(role))
  }
}
