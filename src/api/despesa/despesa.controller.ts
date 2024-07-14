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
import { DespesaService } from "./despesa.service";
import { Despesa } from "@/domain/entities/despesas.entity";
import { FileInterceptor } from "@nestjs/platform-express";
import * as xlsx from "xlsx";

@Controller("despesas")
export class DespesaController {
  constructor(private DespesaService: DespesaService) { }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() despesa: Despesa) {
    return this.DespesaService.upsert(despesa);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll(@Request() req: any) {
    return this.DespesaService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getOne(@Request() req: any, @Query() podutoId: number) {
    return this.DespesaService.getOne(podutoId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  delete(@Request() req: any, @Query() id: number) {
    return this.DespesaService.delete(id);
  }
}
