import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { UnitOfWorkService } from '@/infra/unit-of-work';

@Module({
  providers: [CompaniesService, UnitOfWorkService],
  controllers: [CompaniesController]
})
export class CompaniesModule { }
