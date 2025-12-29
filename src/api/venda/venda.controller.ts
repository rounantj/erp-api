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
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { Venda } from "@/domain/entities/vendas.entity";
import { VendasService } from "./venda.service";

// Interfaces para os DTOs
interface ExclusionRequestDto {
  motivo: string;
}

interface ExclusionReviewDto {
  observacoes?: string;
}

@Controller("vendas")
export class VendasController {
  constructor(private vendasservice: VendasService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() venda: Venda) {
    const user = req.user.sub;
    const companyId = user?.companyId || req.user?.companyId;
    venda.user_id = user.id;
    return this.vendasservice.create(venda, companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("dashboard")
  dashboard(@Request() req: any, res: any): Promise<any> {
    const companyId = req.user?.sub?.companyId || req.user?.companyId;
    return this.vendasservice.dashboard(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll(@Request() req: any, @Query() rangeDates: any) {
    const companyId = req.user?.sub?.companyId || req.user?.companyId;
    return this.vendasservice.getAll(rangeDates, companyId);
  }

  /**
   * Obtém vendas e despesas dos últimos 12 meses agrupadas por mês
   * GET /vendas/monthly-stats
   */
  @UseGuards(JwtAuthGuard)
  @Get("monthly-stats")
  async getMonthlyStats(@Request() req: any) {
    try {
      const companyId = req.user?.sub?.companyId || req.user?.companyId;
      return await this.vendasservice.getMonthlySalesAndExpenses(companyId);
    } catch (error: any) {
      throw new HttpException(
        error.message || "Falha ao obter estatísticas mensais",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Obtém quantidade de currículos criados por mês dos últimos 12 meses
   * GET /vendas/monthly-curriculums
   */
  @UseGuards(JwtAuthGuard)
  @Get("monthly-curriculums")
  async getMonthlyCurriculums(@Request() req: any) {
    try {
      const companyId = req.user?.sub?.companyId || req.user?.companyId;
      return await this.vendasservice.getMonthlyCurriculums(companyId);
    } catch (error: any) {
      throw new HttpException(
        error.message || "Falha ao obter dados de currículos",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Lista todas as solicitações de exclusão pendentes
   * GET /vendas/pending-exclusions
   */
  @UseGuards(JwtAuthGuard)
  @Get("pending-exclusions")
  async getPendingExclusions(@Request() req: any) {
    try {
      const companyId = req.user?.sub?.companyId || req.user?.companyId;
      return await this.vendasservice.getPendingExclusionRequests(companyId);
    } catch (error: any) {
      throw new HttpException(
        error.message || "Falha ao obter solicitações pendentes",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  getOne(@Request() req: any, @Param("id") vendaId: string) {
    const id = parseInt(vendaId, 10);
    if (isNaN(id)) {
      throw new HttpException("ID de venda inválido", HttpStatus.BAD_REQUEST);
    }
    return this.vendasservice.getOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  delete(@Request() req: any, @Param("id") vendaId: number) {
    return this.vendasservice.delete(vendaId);
  }

  /**
   * Solicita a exclusão de uma venda
   * POST /vendas/:id/request-exclusion
   */
  @UseGuards(JwtAuthGuard)
  @Post(":id/request-exclusion")
  async requestExclusion(
    @Request() req: any,
    @Param("id") vendaId: number,
    @Body() exclusionRequest: ExclusionRequestDto
  ) {
    try {
      const userId = req.user.sub.id;
      return await this.vendasservice.requestExclusion(
        vendaId,
        userId,
        exclusionRequest.motivo
      );
    } catch (error: any) {
      throw new HttpException(
        error.message || "Falha ao solicitar exclusão",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Aprova uma solicitação de exclusão
   * POST /vendas/:id/approve-exclusion
   */
  @UseGuards(JwtAuthGuard)
  @Post(":id/approve-exclusion")
  async approveExclusion(
    @Request() req: any,
    @Param("id") vendaId: number,
    @Body() reviewData: ExclusionReviewDto
  ) {
    try {
      const adminId = req.user.sub.id;
      return await this.vendasservice.approveExclusion(
        vendaId,
        adminId,
        reviewData.observacoes
      );
    } catch (error: any) {
      throw new HttpException(
        error.message || "Falha ao aprovar exclusão",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Rejeita uma solicitação de exclusão
   * POST /vendas/:id/reject-exclusion
   */
  @UseGuards(JwtAuthGuard)
  @Post(":id/reject-exclusion")
  async rejectExclusion(
    @Request() req: any,
    @Param("id") vendaId: number,
    @Body() reviewData: ExclusionReviewDto
  ) {
    if (!reviewData.observacoes) {
      throw new HttpException(
        "É necessário fornecer um motivo para rejeitar a solicitação",
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      const adminId = req.user.sub.id;
      return await this.vendasservice.rejectExclusion(
        vendaId,
        adminId,
        reviewData.observacoes
      );
    } catch (error: any) {
      throw new HttpException(
        error.message || "Falha ao rejeitar exclusão",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Obtém os produtos/serviços mais vendidos
   * POST /vendas/top-selling-products
   */
  @UseGuards(JwtAuthGuard)
  @Post("top-selling-products")
  async getTopSeling(
    @Request() req: any,
    @Body() data: { startDate: Date; endDate: Date }
  ) {
    try {
      const companyId = req.user?.sub?.companyId || req.user?.companyId;
      return await this.vendasservice.getTopSellingItems(
        data.startDate,
        data.endDate,
        companyId
      );
    } catch (error: any) {
      throw new HttpException(
        error.message || "Falha ao obter mais vendidos",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
