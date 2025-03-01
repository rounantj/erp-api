import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { FofaAiService } from "./fofa-ai.service";

@Controller("fofa-ai")
export class FofaAiController {
  constructor(private fofaAiService: FofaAiService) {}

  // Rota para consultas gerais à IA
  @UseGuards(JwtAuthGuard)
  @Post("query")
  async queryAI(@Body() data: { prompt: string; list: any[] }) {
    return this.fofaAiService.queryAI(data.prompt, data.list);
  }

  // Rota para consultas gerais à IA
  @UseGuards(JwtAuthGuard)
  @Post("query-produtos")
  async queryPrd(@Body() data: { size: number }) {
    return this.fofaAiService.processarProdutos(data.size);
  }
  // Rota para consultas gerais à IA
  @UseGuards(JwtAuthGuard)
  @Post("query-curriculo")
  async queryCurriculo(@Body() data: { personalData: string }) {
    return this.fofaAiService.curriculumGenerator(data.personalData);
  }
}
