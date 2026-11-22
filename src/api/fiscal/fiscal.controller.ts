import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { EmitOptions, FiscalEmissionService } from "./fiscal-emission.service";
import { FiscalSettingsService } from "./fiscal-settings.service";

const SUPER_ADMIN_EMAIL = "rounantj@hotmail.com";

function fiscalUser(req: any, opts: { admin?: boolean } = {}) {
  const user = req.user?.sub;
  const companyId = Number(user?.companyId || req.user?.companyId);
  if (!user?.id || !companyId) throw new ForbiddenException("Usuário sem empresa");
  const superAdmin = String(user.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;
  if (user.role === "visitante" && !superAdmin) throw new ForbiddenException("Acesso não permitido");
  if (opts.admin && user.role !== "admin" && !superAdmin) {
    throw new ForbiddenException("Apenas administradores podem alterar a configuração fiscal");
  }
  return { id: Number(user.id), companyId };
}

@Controller("fiscal")
@UseGuards(JwtAuthGuard)
export class FiscalController {
  constructor(private readonly settings: FiscalSettingsService, private readonly emission: FiscalEmissionService) {}

  // ---------- Configuração ----------

  @Get("config")
  config(@Req() req: any) {
    return this.settings.view(fiscalUser(req).companyId);
  }

  @Put("config")
  updateConfig(@Req() req: any, @Body() body: Record<string, any>) {
    return this.settings.update(fiscalUser(req, { admin: true }).companyId, body || {});
  }

  @Post("config/certificado")
  @UseInterceptors(FileInterceptor("arquivo", { limits: { fileSize: 64 * 1024 } }))
  uploadCertificate(@Req() req: any, @UploadedFile() file: any, @Body("senha") senha: string) {
    return this.settings.saveCertificate(fiscalUser(req, { admin: true }).companyId, file?.buffer, senha);
  }

  @Delete("config/certificado")
  removeCertificate(@Req() req: any) {
    return this.settings.removeCertificate(fiscalUser(req, { admin: true }).companyId);
  }

  @Get("consulta-cnpj/:cnpj")
  lookupCnpj(@Req() req: any, @Param("cnpj") cnpj: string) {
    fiscalUser(req);
    return this.settings.lookupCnpj(cnpj);
  }

  @Post("testar-conexao")
  testConnection(@Req() req: any) {
    return this.emission.testConnection(fiscalUser(req, { admin: true }).companyId);
  }

  // ---------- Emissão ----------

  @Post("vendas/:vendaId/emitir")
  emit(@Req() req: any, @Param("vendaId", ParseIntPipe) vendaId: number, @Body() body: EmitOptions) {
    const user = fiscalUser(req);
    return this.emission.emitForSale(user.companyId, user.id, vendaId, body || {});
  }

  @Get("vendas/:vendaId")
  saleDocuments(@Req() req: any, @Param("vendaId", ParseIntPipe) vendaId: number) {
    return this.emission.documentsForSale(fiscalUser(req).companyId, vendaId);
  }

  @Post("vendas/status")
  salesStatus(@Req() req: any, @Body() body: { vendaIds?: number[] }) {
    const ids = (body?.vendaIds || []).map(Number).filter(Number.isInteger).slice(0, 500);
    return this.emission.statusBySales(fiscalUser(req).companyId, ids);
  }

  @Get("documentos")
  list(@Req() req: any, @Query() query: Record<string, string>) {
    const { modelo, status, ambiente, from, to, q, page, pageSize } = query;
    return this.emission.list(fiscalUser(req).companyId, {
      modelo,
      status,
      ambiente,
      from,
      to,
      q,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
  }

  @Get("documentos/:id")
  get(@Req() req: any, @Param("id") id: string) {
    return this.emission.getDocument(fiscalUser(req).companyId, id);
  }

  @Get("documentos/:id/xml")
  async xml(@Req() req: any, @Param("id") id: string, @Query("tipo") tipo: "nota" | "cancelamento", @Res() res: Response) {
    const { xml, filename } = await this.emission.documentXml(fiscalUser(req).companyId, id, tipo === "cancelamento" ? "cancelamento" : "nota");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(xml);
  }

  @Post("documentos/:id/reenviar")
  retry(@Req() req: any, @Param("id") id: string) {
    return this.emission.retry(fiscalUser(req).companyId, id);
  }

  @Post("documentos/:id/cancelar")
  cancel(@Req() req: any, @Param("id") id: string, @Body("motivo") motivo: string) {
    return this.emission.cancelDocument(fiscalUser(req, { admin: true }).companyId, id, motivo);
  }

  @Post("documentos/:id/descartar")
  discard(@Req() req: any, @Param("id") id: string) {
    return this.emission.discard(fiscalUser(req).companyId, id);
  }
}
