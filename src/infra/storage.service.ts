import { Injectable } from "@nestjs/common";
import * as AWS from "aws-sdk";

@Injectable()
export class StorageService {
  private s3: AWS.S3;
  private bucketName: string;
  private spaceUrl: string;
  private region: string;
  private folderPrefix: string;

  constructor() {
    // SPACE_URL = https://reboot.nyc3.digitaloceanspaces.com (bucket = reboot)
    // SPACE_NAME = genai (pasta dentro do bucket)
    this.spaceUrl =
      process.env.SPACE_URL || "https://reboot.nyc3.digitaloceanspaces.com";
    this.folderPrefix = process.env.SPACE_NAME || "genai";

    // Extrair bucket name e region da URL
    // https://reboot.nyc3.digitaloceanspaces.com -> bucket=reboot, region=nyc3
    const urlMatch = this.spaceUrl.match(
      /https:\/\/([^.]+)\.([^.]+)\.digitaloceanspaces\.com/
    );
    if (urlMatch) {
      this.bucketName = urlMatch[1]; // reboot
      this.region = urlMatch[2]; // nyc3
    } else {
      this.bucketName = "reboot";
      this.region = "nyc3";
    }

    // Endpoint do Spaces (sem o bucket name)
    const endpoint = `https://${this.region}.digitaloceanspaces.com`;

    this.s3 = new AWS.S3({
      endpoint: new AWS.Endpoint(endpoint),
      accessKeyId: process.env.SPACE_ACCESS_KEY_ID,
      secretAccessKey: process.env.SPACE_SECRET_ACCESS_KEY,
      s3ForcePathStyle: true, // Usar path-style para evitar problemas de certificado SSL
      signatureVersion: "v4",
    });

    const accessKeyId = process.env.SPACE_ACCESS_KEY_ID || "";
    const secretKey = process.env.SPACE_SECRET_ACCESS_KEY || "";

    console.log(`Storage configurado:`);
    console.log(`  - bucket: ${this.bucketName}`);
    console.log(`  - region: ${this.region}`);
    console.log(`  - prefix: ${this.folderPrefix}`);
    console.log(
      `  - accessKeyId: ${accessKeyId.substring(0, 6)}...${accessKeyId.slice(
        -4
      )} (len: ${accessKeyId.length})`
    );
    console.log(
      `  - secretKey: ${
        secretKey
          ? secretKey.substring(0, 4) + "..." + secretKey.slice(-4)
          : "NÃO DEFINIDA"
      } (len: ${secretKey.length})`
    );
  }

  /**
   * Upload de arquivo para o bucket
   * @param buffer - Buffer do arquivo
   * @param filename - Nome do arquivo (ex: "logo.png")
   * @param folder - Pasta no bucket (ex: "companies/1")
   * @param contentType - Tipo do conteúdo (ex: "image/png")
   * @returns URL pública do arquivo
   */
  async uploadFile(
    buffer: Buffer,
    filename: string,
    folder: string,
    contentType: string = "image/png"
  ): Promise<string> {
    const key = `${folder}/${filename}`;

    const params: AWS.S3.PutObjectRequest = {
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ACL: "public-read",
      ContentType: contentType,
    };

    try {
      await this.s3.putObject(params).promise();
      // Retorna URL pública
      return `${this.spaceUrl}/${key}`;
    } catch (error: any) {
      console.error("Erro ao fazer upload para Spaces:", error);
      throw new Error(`Falha ao fazer upload: ${error?.message || error}`);
    }
  }

  /**
   * Upload de arquivo a partir de base64
   * @param base64Data - String base64 (pode incluir prefixo data:image/...)
   * @param filename - Nome do arquivo
   * @param folder - Pasta no bucket
   * @returns URL pública do arquivo
   */
  async uploadBase64(
    base64Data: string,
    filename: string,
    folder: string
  ): Promise<string> {
    // Extrair tipo e dados do base64
    let contentType = "image/png";
    let base64String = base64Data;

    if (base64Data.includes(",")) {
      const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        contentType = matches[1];
        base64String = matches[2];
      }
    }

    const buffer = Buffer.from(base64String, "base64");
    return this.uploadFile(buffer, filename, folder, contentType);
  }

  /**
   * Deletar arquivo do bucket
   * @param fileUrl - URL completa do arquivo ou apenas a key
   */
  async deleteFile(fileUrl: string): Promise<void> {
    // Extrair key da URL se necessário
    let key = fileUrl;
    if (fileUrl.startsWith("http")) {
      key = fileUrl.replace(`${this.spaceUrl}/`, "");
    }

    const params: AWS.S3.DeleteObjectRequest = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      await this.s3.deleteObject(params).promise();
    } catch (error: any) {
      console.error("Erro ao deletar arquivo do Spaces:", error);
      throw new Error(`Falha ao deletar arquivo: ${error?.message || error}`);
    }
  }

  /**
   * Verificar se arquivo existe no bucket
   * @param fileUrl - URL completa do arquivo ou apenas a key
   */
  async fileExists(fileUrl: string): Promise<boolean> {
    let key = fileUrl;
    if (fileUrl.startsWith("http")) {
      key = fileUrl.replace(`${this.spaceUrl}/`, "");
    }

    const params: AWS.S3.HeadObjectRequest = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      await this.s3.headObject(params).promise();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gerar URL para upload de logo de empresa
   */
  getCompanyLogoPath(companyId: number): { folder: string; filename: string } {
    return {
      folder: `${this.folderPrefix}/companies/${companyId}`,
      filename: `logo_${Date.now()}.png`,
    };
  }

  /**
   * Gerar URL para upload de imagem de produto
   */
  getProductImagePath(
    companyId: number,
    productId: number
  ): { folder: string; filename: string } {
    return {
      folder: `${this.folderPrefix}/companies/${companyId}/products`,
      filename: `${productId}_${Date.now()}.jpg`,
    };
  }
}


