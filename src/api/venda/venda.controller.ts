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
    venda.user_id = user.id;
    return this.vendasservice.create(venda);
  }

  @UseGuards(JwtAuthGuard)
  @Post("dashboard")
  dashboard(@Request() req: any, res: any): Promise<any> {
    return this.vendasservice.dashboard();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll(@Request() req: any, @Query() rangeDates: string) {
    return this.vendasservice.getAll(rangeDates);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getOne(@Request() req: any, @Query() affiliateId: number) {
    return this.vendasservice.getOne(affiliateId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  delete(@Request() req: any, @Query() affiliateId: number) {
    return this.vendasservice.delete(affiliateId);
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
   * Lista todas as solicitações de exclusão pendentes
   * GET /vendas/pending-exclusions
   */
  @UseGuards(JwtAuthGuard)
  @Get("pending-exclusions")
  async getPendingExclusions(@Request() req: any) {
    try {
      return await this.vendasservice.getPendingExclusionRequests();
    } catch (error: any) {
      throw new HttpException(
        error.message || "Falha ao obter solicitações pendentes",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Lista todas as solicitações de exclusão pendentes
   * GET /vendas/pending-exclusions
   */
  @UseGuards(JwtAuthGuard)
  @Post("top-selling-products")
  async getTopSeling(
    @Request() req: any,
    @Body() data: { startDate: Date; endDate: Date }
  ) {
    try {
      return await this.vendasservice.getTopSellingItems(
        data.startDate,
        data.endDate
      );
    } catch (error: any) {
      throw new HttpException(
        error.message || "Falha ao obter mais vendidos",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
