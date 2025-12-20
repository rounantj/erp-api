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
  open(@Request() req: any, @Body() { userId, valorAbertura }: any) {
    const companyId = req.user?.sub?.companyId || req.user?.companyId;
    return this.caixaService.open(companyId, userId, valorAbertura);
  }

  @UseGuards(JwtAuthGuard)
  @Post("close")
  close(
    @Request() req: any,
    @Body() { caixaId, userId, saldoFinal, diferenca }: any
  ) {
    if (!caixaId || !userId) {
      throw new Error("Parâmetros inválidos");
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
    const caixaId = +params?.caixaId;
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
  getOne(@Request() req: any, @Param("caixaId") caixaId: number) {
    return this.caixaService.getOne(+caixaId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":caixaId")
  delete(@Request() req: any, @Param("caixaId") caixaId: number) {
    return this.caixaService.delete(+caixaId);
  }
}
