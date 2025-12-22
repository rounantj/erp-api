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
  NotFoundException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { ProdutoService } from "./produto.service";
import { Produto } from "@/domain/entities/produtos.entity";
import { FileInterceptor } from "@nestjs/platform-express";
import { StorageService } from "@/infra/storage.service";
import * as xlsx from "xlsx";

@Controller("produtos")
export class ProdutoController {
  constructor(
    private produtoService: ProdutoService,
    private storageService: StorageService
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() poduto: Produto) {
    const user = req.user?.sub || req.user;
    if (user?.companyId && !poduto.companyId) {
      poduto.companyId = user.companyId;
    }
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
        item["id"] = +item["Código"].replace("-", "");
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

  // Endpoint otimizado de busca com paginação
  @UseGuards(JwtAuthGuard)
  @Get("search")
  search(
    @Request() req: any,
    @Query("search") search?: string,
    @Query("category") category?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const companyId = req.user?.sub?.companyId || req.user?.companyId;
    return this.produtoService.search({
      search,
      category,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 30,
      companyId,
    });
  }

  // Buscar produto por código de barras ou ID (para scanner)
  @UseGuards(JwtAuthGuard)
  @Get("by-code/:code")
  findByCode(@Request() req: any, @Param("code") code: string) {
    const companyId = req.user?.sub?.companyId || req.user?.companyId;
    return this.produtoService.findByCode(code, companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll(@Request() req: any) {
    const companyId = req.user?.sub?.companyId || req.user?.companyId;
    return this.produtoService.getAll(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  getOne(@Request() req: any, @Param("id") produtoId: number) {
    return this.produtoService.getOne(produtoId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  delete(@Request() req: any, @Query() podutoId: number) {
    return this.produtoService.delete(podutoId);
  }

  /**
   * Upload de imagem do produto
   * POST /produtos/:id/upload-image
   * Aceita multipart/form-data com campo "file" ou JSON com campo "base64"
   */
  @UseGuards(JwtAuthGuard)
  @Post(":id/upload-image")
  @UseInterceptors(FileInterceptor("file"))
  async uploadImage(
    @Request() req: any,
    @Param("id") productId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { base64?: string }
  ) {
    try {
      const companyId = req.user?.sub?.companyId || req.user?.companyId;
      
      if (!companyId) {
        throw new HttpException("Company ID é obrigatório", HttpStatus.BAD_REQUEST);
      }

      // Verificar se o produto existe
      const produto = await this.produtoService.getOne(productId);
      if (!produto) {
        throw new HttpException("Produto não encontrado", HttpStatus.NOT_FOUND);
      }

      let imageUrl: string;

      if (file) {
        // Upload via multipart/form-data
        const { folder, filename } = this.storageService.getProductImagePath(companyId, productId);
        imageUrl = await this.storageService.uploadFile(
          file.buffer,
          filename,
          folder,
          file.mimetype
        );
      } else if (body.base64) {
        // Upload via base64
        const { folder, filename } = this.storageService.getProductImagePath(companyId, productId);
        imageUrl = await this.storageService.uploadBase64(body.base64, filename, folder);
      } else {
        throw new HttpException(
          "Nenhum arquivo ou base64 fornecido",
          HttpStatus.BAD_REQUEST
        );
      }

      // Atualizar o produto com a nova URL da imagem
      await this.produtoService.updateImageUrl(productId, imageUrl);

      return {
        success: true,
        message: "Imagem do produto atualizada com sucesso",
        data: { imageUrl },
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || "Erro ao fazer upload da imagem",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get("make-prd")
  makePrd(@Request() req: any) {
    return this.produtoService.createOrUpdateFromPayload();
  }
}
