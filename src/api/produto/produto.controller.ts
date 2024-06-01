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
} from "@nestjs/common";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { ProdutoService } from "./produto.service";
import { Produto } from "@/domain/entities/produtos.entity";

@Controller("produtos")
export class ProdutoController {
  constructor(private produtoService: ProdutoService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() poduto: Produto) {
    return this.produtoService.create(poduto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll(@Request() req: any) {
    return this.produtoService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getOne(@Request() req: any, @Query() podutoId: number) {
    return this.produtoService.getOne(podutoId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  delete(@Request() req: any, @Query() podutoId: number) {
    return this.produtoService.delete(podutoId);
  }
}
