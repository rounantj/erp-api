import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { JwtStrategy } from '@/domain/auth/jwt.strategy'
import { jwtConstants } from '@/domain/auth/auth.config'
import { AuthController } from './auth.controller'
import { UserAuthUsecase } from '@/domain/auth/usecases/auth.usecase'
import { UnitOfWorkService } from '@/infra/unit-of-work'

@Module({
  imports: [PassportModule, JwtModule.register({ secret: jwtConstants.secret })],
  providers: [JwtStrategy, UnitOfWorkService, UserAuthUsecase],
  controllers: [AuthController],
  exports: [],
})
export class AuthModule { }
