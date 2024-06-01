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
import { Venda } from "@/domain/entities/vendas.entity";
import { VendasService } from "./venda.service";

@Controller("vendas")
export class VendasController {
  constructor(private vendasservice: VendasService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() affiliate: Venda) {
    return this.vendasservice.create(affiliate);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll(@Request() req: any) {
    return this.vendasservice.getAll();
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
}
