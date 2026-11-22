import { Body, Controller, Delete, Get, Post, Query, Request, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { DespesaService } from "./despesa.service";
import { Despesa } from "@/domain/entities/despesas.entity";

const companyOf = (req: any): number => Number(req.user?.sub?.companyId || req.user?.companyId);
const userOf = (req: any): string | undefined => (req.user?.sub?.id ? String(req.user.sub.id) : undefined);

@Controller("despesas")
@UseGuards(JwtAuthGuard)
export class DespesaController {
  constructor(private DespesaService: DespesaService) {}

  @Post()
  create(@Request() req: any, @Body() despesa: Despesa) {
    return this.DespesaService.upsert(companyOf(req), despesa, userOf(req));
  }

  @Get()
  getAll(@Request() req: any) {
    return this.DespesaService.getAll(companyOf(req));
  }

  @Delete()
  delete(@Request() req: any, @Query("id") id: string) {
    return this.DespesaService.delete(companyOf(req), Number(id));
  }
}
