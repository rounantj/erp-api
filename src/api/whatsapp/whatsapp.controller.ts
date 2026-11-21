import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { ConnectionService } from "./connection.service";
import { BusinessHoursService, ExceptionInput } from "./hours/business-hours.service";
import { OrderStatus, WhatsappOrdersService } from "./orders/orders.service";
import { SettingsService, SettingsUpdate } from "./settings.service";
import { WhatsappAccessGuard, WhatsappAdminOnly, whatsappUser } from "./whatsapp-access.guard";
import { WhatsappRequestLogInterceptor } from "./whatsapp-request-log.interceptor";

@Controller("whatsapp")
@UseGuards(JwtAuthGuard, WhatsappAccessGuard)
@UseInterceptors(WhatsappRequestLogInterceptor)
export class WhatsappController {
  constructor(
    private readonly connection: ConnectionService,
    private readonly settings: SettingsService,
    private readonly hours: BusinessHoursService,
    private readonly orders: WhatsappOrdersService
  ) {}

  // ---------- Pedidos (admin e atendente) ----------

  @Get("pedidos")
  listOrders(@Req() req: any, @Query("status") status?: string) {
    return this.orders.list(whatsappUser(req).companyId, status);
  }

  @Get("pedidos/resumo")
  ordersSummary(@Req() req: any) {
    return this.orders.summary(whatsappUser(req).companyId);
  }

  @Get("pedidos/:id/caixa")
  checkoutPayload(@Req() req: any, @Param("id") id: string) {
    return this.orders.checkoutPayload(whatsappUser(req).companyId, id);
  }

  @Post("pedidos/:id/vendido")
  markSold(@Req() req: any, @Param("id") id: string, @Body() body: { vendaId?: number }) {
    const user = whatsappUser(req);
    return this.orders.markSold(user.companyId, id, Number(body?.vendaId), user.id);
  }

  @Get("pedidos/:id")
  getOrder(@Req() req: any, @Param("id") id: string) {
    return this.orders.get(whatsappUser(req).companyId, id);
  }

  @Patch("pedidos/:id/status")
  updateOrderStatus(@Req() req: any, @Param("id") id: string, @Body() body: { status: OrderStatus }) {
    const user = whatsappUser(req);
    return this.orders.updateStatus(user.companyId, id, body?.status, user.id);
  }

  @Post("pedidos/:id/reenviar-aviso")
  retryNotification(@Req() req: any, @Param("id") id: string) {
    return this.orders.retryNotification(whatsappUser(req).companyId, id);
  }

  @Get("arquivos/:id/preview")
  filePreview(@Req() req: any, @Param("id") id: string) {
    return this.orders.filePreview(whatsappUser(req).companyId, id);
  }

  @Get("arquivos/:id/download")
  fileDownload(@Req() req: any, @Param("id") id: string) {
    return this.orders.fileDownloadUrl(whatsappUser(req).companyId, id);
  }

  @Get("status")
  status(@Req() req: any) {
    return this.connection.status(whatsappUser(req).companyId);
  }

  @Get("conversas-pausadas")
  pausedConversations(@Req() req: any) {
    return this.connection.pausedConversations(whatsappUser(req).companyId);
  }

  @Get("conversas")
  conversations(@Req() req: any) {
    return this.connection.listConversations(whatsappUser(req).companyId);
  }

  @Post("conversas/:id/pausar-ia")
  pauseAi(@Req() req: any, @Param("id") id: string) {
    return this.connection.pauseAi(whatsappUser(req).companyId, id);
  }

  @Post("conversas/:id/retomar-ia")
  resumeAi(@Req() req: any, @Param("id") id: string) {
    return this.connection.resumeAi(whatsappUser(req).companyId, id);
  }

  // ---------- Conexão e configuração (somente admin) ----------

  @Post("conectar")
  @WhatsappAdminOnly()
  connect(@Req() req: any) {
    return this.connection.connect(whatsappUser(req).companyId);
  }

  @Post("desconectar")
  @WhatsappAdminOnly()
  disconnect(@Req() req: any) {
    return this.connection.disconnect(whatsappUser(req).companyId);
  }

  @Post("bot")
  @WhatsappAdminOnly()
  async setBot(@Req() req: any, @Body() body: { enabled: boolean }) {
    const companyId = whatsappUser(req).companyId;
    await this.settings.getOrCreate(companyId);
    await this.settings.setBotEnabled(companyId, body?.enabled === true);
    return this.connection.status(companyId);
  }

  @Get("configuracao")
  async getSettings(@Req() req: any) {
    const companyId = whatsappUser(req).companyId;
    const s = await this.settings.getOrCreate(companyId);
    const hours = await this.hours.load(companyId);
    return {
      botName: s.bot_name,
      instructions: s.instructions,
      humanTakeoverMinutes: s.human_takeover_minutes,
      productCardsEnabled: s.product_cards_enabled,
      autoProductImages: s.auto_product_images,
      timezone: s.timezone,
      weekly: hours.weekly,
      exceptions: hours.exceptions,
    };
  }

  @Put("configuracao")
  @WhatsappAdminOnly()
  async updateSettings(@Req() req: any, @Body() body: SettingsUpdate) {
    await this.settings.update(whatsappUser(req).companyId, body || {});
    return this.getSettings(req);
  }

  @Put("horarios")
  @WhatsappAdminOnly()
  async replaceHours(@Req() req: any, @Body() body: { weekly: { weekday: number; opensAt: string; closesAt: string }[] }) {
    const companyId = whatsappUser(req).companyId;
    await this.settings.getOrCreate(companyId);
    await this.hours.replaceWeekly(companyId, Array.isArray(body?.weekly) ? body.weekly : []);
    return this.hours.load(companyId);
  }

  @Post("horarios/excecoes")
  @WhatsappAdminOnly()
  async addException(@Req() req: any, @Body() body: ExceptionInput) {
    const companyId = whatsappUser(req).companyId;
    await this.settings.getOrCreate(companyId);
    await this.hours.upsertException(companyId, body);
    return this.hours.load(companyId);
  }

  @Delete("horarios/excecoes/:id")
  @WhatsappAdminOnly()
  async removeException(@Req() req: any, @Param("id", ParseIntPipe) id: number) {
    const companyId = whatsappUser(req).companyId;
    await this.hours.removeException(companyId, id);
    return this.hours.load(companyId);
  }

  @Get("horarios/status")
  hoursStatus(@Req() req: any) {
    return this.hours.status(whatsappUser(req).companyId);
  }
}
