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
import { ProdutoService } from "./produto.service";
import { Produto } from "@/domain/entities/produtos.entity";
import { FileInterceptor } from "@nestjs/platform-express";
import * as xlsx from "xlsx";

@Controller("produtos")
export class ProdutoController {
  constructor(private produtoService: ProdutoService) { }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() poduto: Produto) {
    return this.produtoService.upsert(poduto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("/upload")
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @Res() res: any,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File
  ) {
    try {
      if (!file) {
        return res.status(400).send({ message: "No file uploaded" });
      }

      const workbook = xlsx.read(file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      let data = xlsx.utils.sheet_to_json(worksheet);
      data.forEach((item: any) => {
        item["id"] = +(item["Código"].replace("-", ""));
        item["descricao"] = item["Descrição"];
        item["categoria"] = item["NCM"] ? "produto" : "servico";
        item["valor"] = item["Valor"];
        item["ncm"] = item["NCM"] ?? "-";
        item["createdByUser"] = 1;
        item["updatedByUser"] = 1;
        item["createdAt"] = new Date();
        item["updatedAt"] = new Date();
        item["companyId"] = req.user.companyId ?? 1;
      });

      const results = await this.produtoService.processExcelData(data);
      return res.status(200).send(results);
    } catch (error) {
      return res.status(500).send({ message: "Failed to process file", error });
    }
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
