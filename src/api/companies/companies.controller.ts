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
import { CompaniesService, CreateCompanyDto, CreateUserForCompanyDto } from "./companies.service";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { SuperAdminGuard } from "@/domain/auth/guard/super-admin.guard";
import { CompanySetup } from "@/domain/entities/company-setup.entity";

@Controller("companies")
export class CompaniesController {
  constructor(private companieService: CompaniesService) {}

  /**
   * Criar nova empresa
   * POST /companies
   * PROTEGIDO: Apenas Super Admin (rounantj@hotmail.com)
   */
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
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
   * PROTEGIDO: Apenas Super Admin (rounantj@hotmail.com)
   */
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
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
   * PROTEGIDO: Apenas Super Admin (rounantj@hotmail.com)
   */
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get()
  async getAll(@Request() req: any) {
    return await this.companieService.getAll();
  }

  /**
   * Listar empresas do usuário atual
   * GET /companies/my-companies
   * Este endpoint é liberado para qualquer usuário autenticado (para ver sua própria empresa)
   */
  @UseGuards(JwtAuthGuard)
  @Get("my-companies")
  async getMyCompanies(@Request() req: any) {
    const userId = req.user?.sub?.id || req.user?.id;
    return await this.companieService.getCompaniesByUser(userId);
  }

  /**
   * Buscar configurações da empresa
   * GET /companies/setup?companyId=X
   * Este endpoint é liberado para qualquer usuário autenticado (para configurar sua própria empresa)
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
   * Este endpoint é liberado para qualquer usuário admin (para configurar sua própria empresa)
   */
  @UseGuards(JwtAuthGuard)
  @Post("setup")
  async updateSetup(@Request() req: any, @Body() params: CompanySetup) {
    const userId = req.user?.sub?.id || req.user?.id;
    params.updatedByUser = userId?.toString();
    return await this.companieService.updateSetup(params);
  }

  /**
   * Buscar empresa pelo ID
   * GET /companies/:id
   * PROTEGIDO: Apenas Super Admin (rounantj@hotmail.com)
   */
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get(":id")
  async getOne(@Request() req: any, @Param("id") companyId: number) {
    const company = await this.companieService.getOne(+companyId);
    if (!company) {
      throw new HttpException("Empresa não encontrada", HttpStatus.NOT_FOUND);
    }
    return company;
  }

  /**
   * Listar usuários de uma empresa
   * GET /companies/:id/users
   * PROTEGIDO: Apenas Super Admin (rounantj@hotmail.com)
   */
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get(":id/users")
  async getCompanyUsers(@Request() req: any, @Param("id") companyId: number) {
    return await this.companieService.getUsersByCompany(+companyId);
  }

  /**
   * Associar usuário a uma empresa
   * POST /companies/:id/users/:userId
   * PROTEGIDO: Apenas Super Admin (rounantj@hotmail.com)
   */
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
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
   * PROTEGIDO: Apenas Super Admin (rounantj@hotmail.com)
   */
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
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

  /**
   * Criar usuário para uma empresa
   * POST /companies/:id/create-user
   * PROTEGIDO: Apenas Super Admin (rounantj@hotmail.com)
   */
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Post(":id/create-user")
  async createUserForCompany(
    @Request() req: any,
    @Param("id") companyId: number,
    @Body() userData: CreateUserForCompanyDto
  ) {
    try {
      const createdByUserId = req.user?.sub?.id || req.user?.id;
      const user = await this.companieService.createUserForCompany(
        +companyId,
        userData,
        createdByUserId
      );
      return { 
        success: true, 
        message: "Usuário criado com sucesso",
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
        }
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || "Erro ao criar usuário",
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
