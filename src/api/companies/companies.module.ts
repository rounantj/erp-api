import { Module } from "@nestjs/common";
import { CompaniesService } from "./companies.service";
import { CompaniesController } from "./companies.controller";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { StorageService } from "@/infra/storage.service";
import { ClerkModule } from "@/api/auth/clerk/clerk.module";

@Module({
  imports: [ClerkModule],
  providers: [CompaniesService, UnitOfWorkService, StorageService],
  controllers: [CompaniesController],
})
export class CompaniesModule {}
