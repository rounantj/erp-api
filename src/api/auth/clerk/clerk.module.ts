import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ClerkService } from "./clerk.service";
import { ClerkController } from "./clerk.controller";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { jwtConstants } from "@/domain/auth/auth.config";

@Module({
  imports: [JwtModule.register({ secret: jwtConstants.secret })],
  providers: [ClerkService, UnitOfWorkService],
  controllers: [ClerkController],
  exports: [ClerkService],
})
export class ClerkModule {}


