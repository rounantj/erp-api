import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    Request,
    Res,
    UseGuards,
} from '@nestjs/common'
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '@/domain/auth/jwt-auth.guard';
import { Company } from '@/domain/entities/company.entity';

@Controller('companies')
export class CompaniesController {
    constructor(
        private companieService: CompaniesService
    ) { }


    @UseGuards(JwtAuthGuard)
    @Post()
    create(
        @Request() req: any,
        @Body() company: Company,
    ) {
        return this.companieService.create(company)
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    getAll(
        @Request() req: any,
    ) {
        return this.companieService.getAll()
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    getOne(
        @Request() req: any,
        @Query() companyId: number,
    ) {
        return this.companieService.getOne(companyId)
    }

    @UseGuards(JwtAuthGuard)
    @Delete()
    delete(
        @Request() req: any,
        @Query() companyId: number,
    ) {
        return this.companieService.delete(companyId)
    }
}
