import { Company } from '@/domain/entities/company.entity';
import { UnitOfWorkService } from '@/infra/unit-of-work';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CompaniesService {
    constructor(
        private uow: UnitOfWorkService
    ) { }

    async create(company: Company) {
        return await this.uow.companyRepository.create(company)
    }
    async getAll() {
        return await this.uow.companyRepository.find()
    }
    async getOne(companyId: number) {
        return await this.uow.companyRepository.findOne({
            where: {
                id: companyId
            }
        })
    }
    async delete(companyId: number) {
        return await this.uow.companyRepository.delete(companyId)
    }
}
