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
  open(@Request() req: any, @Body() { companyId, userId, valorAbertura }: any) {
    return this.caixaService.open(companyId, userId, valorAbertura);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll(@Request() req: any) {
    return this.caixaService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getOne(@Request() req: any, @Query() caixaId: number) {
    return this.caixaService.getOne(caixaId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("resumo")
  resumo(@Request() req: any, @Query() params: any) {
    const caixaId = +params?.caixaId;
    return this.caixaService.resumoVendasDoDia(caixaId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("no-closeds")
  getNoCloseds(@Request() req: any, @Query() companyId: number) {
    return this.caixaService.getNoCloseds(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  delete(@Request() req: any, @Query() caixaId: number) {
    return this.caixaService.delete(caixaId);
  }
}
