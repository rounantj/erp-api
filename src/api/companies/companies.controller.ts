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
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  CompaniesService,
  CreateCompanyDto,
  CreateUserForCompanyDto,
} from "./companies.service";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { SuperAdminGuard } from "@/domain/auth/guard/super-admin.guard";
import { CompanySetup } from "@/domain/entities/company-setup.entity";
import { StorageService } from "@/infra/storage.service";

@Controller("companies")
export class CompaniesController {
  constructor(
    private companieService: CompaniesService,
    private storageService: StorageService
  ) {}

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

    // Garantir que companyId seja válido (usar do token se não vier no body)
    if (!params.companyId || params.companyId.toString() === "") {
      params.companyId = req.user?.sub?.companyId || req.user?.companyId;
    }

    // Garantir que id seja válido (remover se for string vazia)
    if (params.id && params.id.toString() === "") {
      delete (params as any).id;
    }

    return await this.companieService.updateSetup(params);
  }

  /**
   * Upload de logo da empresa
   * POST /companies/upload-logo
   * Aceita multipart/form-data com campo "file" ou JSON com campo "base64"
   */
  @UseGuards(JwtAuthGuard)
  @Post("upload-logo")
  @UseInterceptors(FileInterceptor("file"))
  async uploadLogo(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { base64?: string; companyId?: number }
  ) {
    try {
      const companyId =
        body.companyId || req.user?.sub?.companyId || req.user?.companyId;

      if (!companyId) {
        throw new HttpException(
          "Company ID é obrigatório",
          HttpStatus.BAD_REQUEST
        );
      }

      let logoUrl: string;

      if (file) {
        // Upload via multipart/form-data
        const { folder, filename } =
          this.storageService.getCompanyLogoPath(companyId);
        logoUrl = await this.storageService.uploadFile(
          file.buffer,
          filename,
          folder,
          file.mimetype
        );
      } else if (body.base64) {
        // Upload via base64
        const { folder, filename } =
          this.storageService.getCompanyLogoPath(companyId);
        logoUrl = await this.storageService.uploadBase64(
          body.base64,
          filename,
          folder
        );
      } else {
        throw new HttpException(
          "Nenhum arquivo ou base64 fornecido",
          HttpStatus.BAD_REQUEST
        );
      }

      // Atualizar o setup da empresa com a nova URL da logo
      await this.companieService.updateLogoUrl(companyId, logoUrl);

      return {
        success: true,
        message: "Logo atualizada com sucesso",
        data: { logoUrl },
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || "Erro ao fazer upload da logo",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Marcar onboarding como concluído
   * POST /companies/complete-onboarding
   */
  @UseGuards(JwtAuthGuard)
  @Post("complete-onboarding")
  async completeOnboarding(@Request() req: any) {
    try {
      const companyId = req.user?.sub?.companyId || req.user?.companyId;

      if (!companyId) {
        throw new HttpException(
          "Company ID é obrigatório",
          HttpStatus.BAD_REQUEST
        );
      }

      await this.companieService.completeOnboarding(companyId);

      return {
        success: true,
        message: "Onboarding concluído com sucesso",
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || "Erro ao completar onboarding",
        HttpStatus.BAD_REQUEST
      );
    }
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
        },
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || "Erro ao criar usuário",
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
