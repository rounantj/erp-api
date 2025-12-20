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
  UseGuards,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { CompaniesService, CreateCompanyDto } from "./companies.service";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { CompanySetup } from "@/domain/entities/company-setup.entity";

@Controller("companies")
export class CompaniesController {
  constructor(private companieService: CompaniesService) {}

  /**
   * Criar nova empresa
   * POST /companies
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Request() req: any, @Body() companyData: CreateCompanyDto) {
    try {
      const userId = req.user?.sub?.id || req.user?.id;
      return await this.companieService.create(companyData, userId);
    } catch (error: any) {
      throw new HttpException(
        error.message || "Erro ao criar empresa",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Atualizar empresa existente
   * PUT /companies/:id
   */
  @UseGuards(JwtAuthGuard)
  @Put(":id")
  async update(
    @Request() req: any,
    @Param("id") companyId: number,
    @Body() companyData: Partial<CreateCompanyDto>
  ) {
    try {
      const userId = req.user?.sub?.id || req.user?.id;
      return await this.companieService.update(+companyId, companyData, userId);
    } catch (error: any) {
      throw new HttpException(
        error.message || "Erro ao atualizar empresa",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Listar todas as empresas
   * GET /companies
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  async getAll(@Request() req: any) {
    return await this.companieService.getAll();
  }

  /**
   * Listar empresas do usuário atual
   * GET /companies/my-companies
   */
  @UseGuards(JwtAuthGuard)
  @Get("my-companies")
  async getMyCompanies(@Request() req: any) {
    const userId = req.user?.sub?.id || req.user?.id;
    return await this.companieService.getCompaniesByUser(userId);
  }

  /**
   * Buscar empresa pelo ID
   * GET /companies/:id
   */
  @UseGuards(JwtAuthGuard)
  @Get(":id")
  async getOne(@Request() req: any, @Param("id") companyId: number) {
    const company = await this.companieService.getOne(+companyId);
    if (!company) {
      throw new HttpException("Empresa não encontrada", HttpStatus.NOT_FOUND);
    }
    return company;
  }

  /**
   * Buscar configurações da empresa
   * GET /companies/setup?companyId=X
   */
  @UseGuards(JwtAuthGuard)
  @Get("setup/get")
  async getSetup(@Request() req: any, @Query("companyId") companyId?: number) {
    const cId = companyId || req.user?.sub?.companyId || req.user?.companyId;
    return await this.companieService.getSetup(cId);
  }

  /**
   * Atualizar configurações da empresa
   * POST /companies/setup
   */
  @UseGuards(JwtAuthGuard)
  @Post("setup")
  async updateSetup(@Request() req: any, @Body() params: CompanySetup) {
    const userId = req.user?.sub?.id || req.user?.id;
    params.updatedByUser = userId?.toString();
    return await this.companieService.updateSetup(params);
  }

  /**
   * Listar usuários de uma empresa
   * GET /companies/:id/users
   */
  @UseGuards(JwtAuthGuard)
  @Get(":id/users")
  async getCompanyUsers(@Request() req: any, @Param("id") companyId: number) {
    return await this.companieService.getUsersByCompany(+companyId);
  }

  /**
   * Associar usuário a uma empresa
   * POST /companies/:id/users/:userId
   */
  @UseGuards(JwtAuthGuard)
  @Post(":id/users/:userId")
  async addUserToCompany(
    @Param("id") companyId: number,
    @Param("userId") userId: number
  ) {
    try {
      return await this.companieService.addUserToCompany(+userId, +companyId);
    } catch (error: any) {
      throw new HttpException(
        error.message || "Erro ao associar usuário à empresa",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Excluir empresa (soft delete)
   * DELETE /companies/:id
   */
  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  async delete(@Request() req: any, @Param("id") companyId: number) {
    try {
      await this.companieService.delete(+companyId);
      return { message: "Empresa excluída com sucesso" };
    } catch (error: any) {
      throw new HttpException(
        error.message || "Erro ao excluir empresa",
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
