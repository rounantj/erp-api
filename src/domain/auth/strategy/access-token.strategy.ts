import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { jwtConstants } from "../auth.config";
import { User } from "@/domain/entities/user.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy) {
  constructor(private uow: UnitOfWorkService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  private async opened(id: number): Promise<Pick<User, "id" | "username">> {
    const user = await this.uow.userRepository.findOneBy({ id });
    return {
      id: +user.id,
      username: user.username,
    };
  }

  async validate(payload: any) {
    const user = await this.opened(+payload.id);
    return {
      sub: {
        id: user.id,
        name: user.username,
        companyId: payload?.companyId,
      },
      id: user.id,
      name: user.username,
      userId: payload.id,
      companyId: payload?.companyId,
      roles: payload?.roles,
    };
  }
}
