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
import { CompanySetup } from '@/domain/entities/company-setup.entity';

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
    @Get("/setup")
    getSetup(
        @Request() req: any, @Query() params: any,
    ) {
        return this.companieService.getSetup(params.companyId)
    }

    @UseGuards(JwtAuthGuard)
    @Post("/setup")
    updateSetup(
        @Request() req: any, @Body() params: CompanySetup,
    ) {
        return this.companieService.updateSetup(params)
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
