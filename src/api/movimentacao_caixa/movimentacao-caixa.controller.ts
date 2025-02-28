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
import { MovimentacaoService } from "./movimentacao-caixa.service";
import { MovimentacaoCaixa } from "@/domain/entities/movimentacao_caixa.entity";

@Controller("movimentacao-caixa")
export class MovimentacaoCaixaController {
  constructor(private produtoService: MovimentacaoService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() movimentacao: MovimentacaoCaixa) {
    return this.produtoService.upsert(movimentacao);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll(@Request() req: any) {
    return this.produtoService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getOne(@Request() req: any, @Query() movimentacaoId: number) {
    return this.produtoService.getOne(movimentacaoId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  delete(@Request() req: any, @Query() movimentacaoId: number) {
    return this.produtoService.delete(movimentacaoId);
  }
}
