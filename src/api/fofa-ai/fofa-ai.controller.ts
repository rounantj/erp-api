import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
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

  @UseGuards(JwtAuthGuard)
  @Post("query-curriculo")
  async queryCurriculo(
    @Body() data: { personalData: string },
    @Res() response: any
  ) {
    try {
      const result = await this.fofaAiService.curriculumGenerator(
        data.personalData
      );
      return response.status(HttpStatus.OK).json(result);
    } catch (error: any) {
      return response.status(HttpStatus.OK).json({
        success: false,
        message: error.message || "Erro ao gerar currículo contate o Ronan",
        error: error,
      });
    }
  }
}
