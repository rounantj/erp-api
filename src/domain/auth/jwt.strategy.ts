import { ExtractJwt, Strategy } from 'passport-jwt'
import { PassportStrategy } from '@nestjs/passport'
import { Injectable } from '@nestjs/common'
import { jwtConstants } from './auth.config'
import { UnitOfWorkService } from '@/infra/unit-of-work'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly uow: UnitOfWorkService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: jwtConstants.secret,
    })
  }

  async validate(payload: any) {
    const { email, companyId } = payload
    if (email && companyId) {
      const user = await this.uow.userRepository.find({
        where: { email, companyId }
      })
      return { sub: user[0] }
    }
    return { sub: payload.sub }
  }
}
