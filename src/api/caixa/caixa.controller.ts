import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { CaixaService } from "./caixa.service";
import { Caixa } from "@/domain/entities/caixa.entity";

@Controller("caixa")
export class CaixaController {
  constructor(private caixaService: CaixaService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() caixa: Caixa) {
    return this.caixaService.upsert(caixa);
  }

  @UseGuards(JwtAuthGuard)
  @Post("open")
  open(@Request() req: any, @Body() body: any) {
    const { valorAbertura } = body;
    const companyId = req.user?.sub?.companyId || req.user?.companyId;

    // Sempre usar o ID do usuário logado do JWT (não do body)
    const userId = req.user?.sub?.id || req.user?.id;

    if (!companyId) {
      throw new Error("CompanyId não encontrado no token JWT");
    }

    return this.caixaService.open(companyId, userId, valorAbertura || 0);
  }

  @UseGuards(JwtAuthGuard)
  @Post("close")
  close(@Request() req: any, @Body() { caixaId, saldoFinal, diferenca }: any) {
    // Sempre usar o ID do usuário logado do JWT
    const userId = req.user?.sub?.id || req.user?.id;

    if (!caixaId) {
      throw new Error("caixaId é obrigatório");
    }
    return this.caixaService.close(caixaId, userId, saldoFinal, diferenca);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll(@Request() req: any) {
    const companyId = req.user?.sub?.companyId || req.user?.companyId;
    return this.caixaService.getAll(companyId);
  }

  // Rotas específicas ANTES da rota com parâmetro dinâmico
  @UseGuards(JwtAuthGuard)
  @Get("resumo")
  resumo(@Request() req: any, @Query() params: any) {
    const caixaId = Number(params?.caixaId);
    if (isNaN(caixaId) || caixaId <= 0) {
      throw new Error("ID do caixa inválido para resumo");
    }
    return this.caixaService.resumoVendasDoDia(caixaId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("no-closeds")
  getNoCloseds(@Request() req: any) {
    const companyId = req.user?.sub?.companyId || req.user?.companyId;
    if (!companyId) {
      throw new Error("Empresa não identificada");
    }
    return this.caixaService.getNoCloseds(companyId);
  }

  // Rota com parâmetro dinâmico por ÚLTIMO
  @UseGuards(JwtAuthGuard)
  @Get(":caixaId")
  getOne(@Request() req: any, @Param("caixaId") caixaId: string) {
    const id = Number(caixaId);
    if (isNaN(id) || id <= 0) {
      throw new Error("ID do caixa inválido");
    }
    return this.caixaService.getOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":caixaId")
  delete(@Request() req: any, @Param("caixaId") caixaId: string) {
    const id = Number(caixaId);
    if (isNaN(id) || id <= 0) {
      throw new Error("ID do caixa inválido para exclusão");
    }
    return this.caixaService.delete(id);
  }
}
