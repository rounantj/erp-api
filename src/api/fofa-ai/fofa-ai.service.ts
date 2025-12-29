import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import * as fs from "fs";
import * as FormData from "form-data";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { ILike, In, IsNull, LessThan } from "typeorm";
import { Curriculum } from "@/domain/entities/curriculum.entity";

@Injectable()
export class FofaAiService {
  private GCP_AI_CONFIG: any;

  constructor(
    private uow: UnitOfWorkService,
    private configService: ConfigService
  ) {
    this.GCP_AI_CONFIG = {
      apiKey: process.env.ACCESS_TOKEN_GCP,
      baseUrl: "https://generativelanguage.googleapis.com/v1",
      model: this.configService.get("GCP_AI_MODEL") || "gemini-1.5-pro",
      visionModel:
        this.configService.get("GCP_VISION_MODEL") || "gemini-1.5-pro-vision",
    };
  }

  async curriculumGenerator(personalData: string): Promise<any> {
    const prompt = `
  Você é um assistente especializado em criar currículos profissionais completos.
Com base nas informações fornecidas, crie um currículo profissional detalhado.

INSTRUÇÕES:
0. NUNCA invente informações. Se uma informação não estiver disponível no contexto fornecido, deixe o campo VAZIO (array vazio para listas ou null para valores únicos).
1. Use APENAS as informações pessoais fornecidas para criar um currículo profissional.
2. O currículo deve ser conciso, objetivo e bem estruturado.
3. A saída deve ser EXCLUSIVAMENTE um JSON válido com os campos preenchidos conforme o exemplo, ou vazios quando não houver informação.
4. NÃO inclua comentários, marcadores de código ou qualquer texto fora do JSON.
5. ATENÇÃO: Você DEVE retornar APENAS o objeto JSON puro, sem qualquer texto explicativo, prefixos ou suffixos.

REGRAS OBRIGATÓRIAS:
- Preencha APENAS os campos do JSON para os quais existam dados explícitos no contexto fornecido.
- Campos sem informação devem ser retornados vazios: [] para arrays ou null para strings/valores simples.
- O campo "objetivo" deve ser extraído do contexto se disponível, caso contrário, retorne null.
- FORMAÇÃO ACADÊMICA: 
  * Identifique e padronize qualquer menção a formação educacional (ex: "Ensino médio completo", "segundo grau completo")
  * Mapeie corretamente para os níveis: "Fundamental", "Médio", "Técnico", "Superior", "Pós-graduação", "Mestrado" ou "Doutorado"
  * Incremente o nome da escolaridade ao encontra-la, por ex: Medio => Ensino Medio Completo e etc. Não esqueça de incluir a escola (ou instituiçao de ensino) em escolaridade se a detectar.
  * Se o status não for mencionado, considere "Completo" como padrão
  * Se a escolaridade não for informada, retorne "escolaridade": null
  * Se não houver informações sobre formação, retorne um array vazio em "formacao": []
- Para habilidades, inclua apenas as mencionadas explicitamente no texto.
- Experiências devem ter descrições exatas conforme mencionadas, sem invenções ou elaborações.

ESTRUTURA DO JSON:
{
  "escolaridade": String ou null,
  "habilidades": [Array de strings ou array vazio],
  "informacoesAdicionais": String ou null,
  "modelo": "simples",
  "experiencias": [
    {
      "empresa": String ou null,
      "cargo": String ou null,
      "periodo": String ou null,
      "descricao": String ou null
    }
  ] ou [],
  "cursos": [
    {
      "nome": String ou null,
      "instituicao": String ou null,
      "ano": String ou null
    }
  ] ou [],
  "foto": null,
  "nome": String ou null,
  "telefone": String ou null,
  "endereco": String ou null,
  "objetivo": String ou null
}

DICIONÁRIO DE FORMAÇÃO ACADÊMICA:
- Termos para Ensino Fundamental: "ensino fundamental", "primeiro grau", "1º grau", "fundamental"
- Termos para Ensino Médio: "ensino médio", "segundo grau", "2º grau", "colegial"
- Termos para Ensino Superior: "graduação", "faculdade", "ensino superior", "bacharelado", "licenciatura"
- Observe status como: "completo", "incompleto", "cursando", "em andamento"

EXEMPLOS DE INTERPRETAÇÃO:
1. Se informado "Ensino médio completo" → Nível: "Médio", Status: "Completo"
2. Se informado "Segundo grau" → Nível: "Médio", Status: "Completo"
3. Se informado "Curso técnico em elétrica no SENAI" → Nível: "Técnico", Curso: "Elétrica", Instituição: "SENAI"
4. Se informado "Faculdade de Administração incompleta" → Nível: "Superior", Curso: "Administração", Status: "Incompleto"

IMPORTANTE: Sua resposta deve conter APENAS o objeto JSON sem nenhum texto adicional. NUNCA invente informações que não estejam presentes no contexto fornecido.

As informações que temos são:
${personalData}`;

    try {
      const resultado = await this.queryAI(prompt);

      // Limpe qualquer texto que não seja JSON
      let cleanedResponse = resultado.text.trim();

      // Remove marcadores de código, se houver
      cleanedResponse = cleanedResponse
        .replace(/```json|```/g, "")
        .replace(/\n/g, "")
        .trim();

      // Encontra o primeiro '{' e o último '}'
      const firstBrace = cleanedResponse.indexOf("{");
      const lastBrace = cleanedResponse.lastIndexOf("}");

      if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
        throw new Error("A resposta não contém um JSON válido");
      }

      // Extrai apenas o conteúdo JSON
      const jsonContent = cleanedResponse.substring(firstBrace, lastBrace + 1);

      try {
        const curriculum = JSON.parse(jsonContent);

        // Verificação de campos obrigatórios
        const camposObrigatorios = [
          "nome",
          "objetivo",
          "habilidades",
          "experiencias",
          "escolaridade",
        ];

        const camposFaltantes = camposObrigatorios.filter(
          (campo) =>
            !curriculum[campo] ||
            (Array.isArray(curriculum[campo]) && curriculum[campo].length === 0)
        );

        if (camposFaltantes.length > 0) {
          throw new Error(
            `Informações importantes faltando: ${camposFaltantes
              .join(", ")
              .toUpperCase()}`
          );
        }

        // Verificação específica para formação acadêmica
        if (!curriculum.escolaridade || curriculum.escolaridade.length === 0) {
          throw new Error("A ESCOLARIDADE é obrigatória e não foi preenchida");
        }

        // Garantir que o objetivo tenha o tamanho adequado
        if (curriculum.objetivo && curriculum.objetivo.length < 200) {
          console.warn(
            "O objetivo profissional está muito curto, deveria ter entre 200-300 caracteres"
          );
        }

        return curriculum;
      } catch (parseError: any) {
        console.error("Erro ao processar resposta:", parseError);
        throw new Error(`${parseError?.message}`);
      }
    } catch (error: any) {
      console.error("Erro ao processar currículo:", error);
      throw error;
    }
  }

  async processarProdutos(size: number) {
    // Busca produtos sem nomeAmigavel
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Define para o início do dia atual

    const produtos = await this.uow.produtoRepository.find({
      where: {
        deletedAt: IsNull(),
        updatedAt: LessThan(hoje),
        descricao: ILike("%INF%"),
      },
      order: {
        updatedAt: "DESC",
      },
      take: size || 10,
    });

    // Se não encontrar produtos, retorna array vazio
    if (!produtos || produtos.length === 0) {
      return [];
    }

    // Formata os produtos para o prompt
    const stringPrd = produtos
      .map((prd) => {
        return `{"id": "${prd.id}", "descricao": "${prd.descricao}"}`;
      })
      .join(",\n    ");

    // Cria o prompt para a IA
    const prompt = `
  Você é um assistente especializado em processar descrições de produtos e criar nomes amigáveis para eles.
  
  INSTRUÇÕES:
  1. Vou te fornecer uma lista de produtos em formato JSON, cada um com 'id' e 'descricao'.
  2. Sua tarefa é criar um nome amigável para cada produto baseado na descrição.
  3. O nome amigável deve:
     - Ter apenas a primeira letra de cada palavra em maiúsculo
     - Remover informações técnicas desnecessárias
     - Ser conciso (máximo 50 caracteres)
     - Manter apenas informações essenciais que identifiquem o produto
     - Corrigir erros ortográficos e de formatação
  4. Retorne APENAS um array JSON com os objetos contendo 'id' e 'nomeAmigavel' para cada produto.
  5. NÃO inclua texto adicional, explicações ou formatação além do array JSON válido.
  
  EXEMPLO:
  Para o input:
  [
    {"id": "001", "descricao": "TELEVISAO SAMSUNG 55POL. SMART TV LED 4K UHD WIFI"},
    {"id": "002", "descricao": "GELADEIRA BRASTEMP FROST FREE 2 PRTS 375L BCO"}
  ]
  
  Sua resposta deve ser EXATAMENTE (apenas o JSON, sem texto adicional):
  [
    {"id": "001", "nomeAmigavel": "Televisão Samsung Smart TV 55 Polegadas 4K"},
    {"id": "002", "nomeAmigavel": "Geladeira Brastemp Frost Free 375L Branca"}
  ]
  
  Agora, processe os seguintes produtos:
  [
      ${stringPrd}
  ]`;

    try {
      // Chama a API de IA
      const resultado = await this.queryAI(prompt);

      // Extrai o array JSON da resposta
      const textoResposta = resultado.text.replace(/\n/g, "").trim();

      let produtosProcessados;
      try {
        produtosProcessados = JSON.parse(textoResposta);

        // Validação básica da estrutura
        if (!Array.isArray(produtosProcessados)) {
          throw new Error("A resposta não é um array válido");
        }

        // Verifica se cada item tem id e nomeAmigavel
        const todosValidos = produtosProcessados.every(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            "id" in item &&
            "nomeAmigavel" in item
        );

        if (!todosValidos) {
          throw new Error("Alguns itens não possuem a estrutura correta");
        }

        // Inicia uma transação para atualizar os produtos
        await this.uow.startTransaction();

        try {
          // Busca os produtos originais do banco para atualização em massa
          const produtosIds = produtosProcessados.map((p) => p.id);
          const produtosParaAtualizar = await this.uow.produtoRepository.findBy(
            {
              id: In(produtosIds),
            }
          );

          // Atualiza os objetos com os nomes amigáveis
          for (const produto of produtosParaAtualizar) {
            const produtoProcessado = produtosProcessados.find(
              (p) => +p.id === produto.id
            );
            if (produtoProcessado) {
              produto.descricao = produtoProcessado.nomeAmigavel;
              produto.updatedAt = new Date();
            }
          }

          // Salva todos de uma vez (bulk save)
          await this.uow.produtoRepository.save(produtosParaAtualizar, {
            chunk: 50,
          });

          // Commit da transação
          await this.uow.commitTransaction();

          // Retorna os produtos processados
          return produtosProcessados;
        } catch (updateError) {
          // Em caso de erro, faz rollback da transação
          await this.uow.rollbackTransaction();
          console.error("Erro ao atualizar produtos:", updateError);
          throw new Error("Falha ao atualizar produtos no banco de dados");
        }
      } catch (parseError) {
        console.error("Erro ao processar resposta:", parseError);
        throw new Error("Não foi possível processar a resposta da IA");
      }
    } catch (error) {
      console.error("Erro ao processar produtos:", error);
      throw error;
    }
  }

  // Método para consulta ao Gemini API (texto)
  async queryAI(prompt: string, list?: any[]): Promise<any> {
    try {
      if (!prompt) {
        throw new HttpException("Prompt é obrigatório", HttpStatus.BAD_REQUEST);
      }

      prompt += list ? "\n\n" + JSON.stringify(list).trim() : "";

      const url = `${this.GCP_AI_CONFIG.baseUrl}/models/${this.GCP_AI_CONFIG.model}:generateContent?key=${this.GCP_AI_CONFIG.apiKey}`;

      const requestData = {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
          topP: 0.8,
          topK: 40,
        },
      };

      const response = await axios({
        method: "post",
        url,
        data: requestData,
        headers: {
          "Content-Type": "application/json",
        },
      });

      return {
        response: response.data,
        text: this.extractTextFromGeminiResponse(response.data),
      };
    } catch (error: any) {
      console.error(
        "Erro na chamada do Gemini:",
        error.response?.data || error.message
      );
      throw new HttpException(
        error.response?.data?.error?.message ||
          "Erro ao comunicar com o Gemini AI",
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // Método para analisar imagens com o Gemini Vision
  async analyzeImage(
    imageBuffer: Buffer,
    prompt: string = "Descreva o que você vê nesta imagem"
  ): Promise<any> {
    try {
      if (!imageBuffer) {
        throw new HttpException("Imagem é obrigatória", HttpStatus.BAD_REQUEST);
      }

      // Convertendo a imagem para base64
      const base64Image = imageBuffer.toString("base64");
      const mimeType = this.detectMimeType(imageBuffer);

      const url = `${this.GCP_AI_CONFIG.baseUrl}/models/${this.GCP_AI_CONFIG.visionModel}:generateContent?key=${this.GCP_AI_CONFIG.apiKey}`;

      const requestData = {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      };

      const response = await axios({
        method: "post",
        url,
        data: requestData,
        headers: {
          "Content-Type": "application/json",
        },
      });

      return {
        response: response.data,
        text: this.extractTextFromGeminiResponse(response.data),
      };
    } catch (error: any) {
      console.error(
        "Erro na análise de imagem:",
        error.response?.data || error.message
      );
      throw new HttpException(
        error.response?.data?.error?.message || "Erro ao analisar imagem",
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // Função auxiliar para extrair texto da resposta do Gemini
  private extractTextFromGeminiResponse(response: any): string {
    try {
      if (
        response.candidates &&
        response.candidates[0] &&
        response.candidates[0].content &&
        response.candidates[0].content.parts
      ) {
        return response.candidates[0].content.parts
          .filter((part: any) => part.text)
          .map((part: any) => part.text)
          .join("\n");
      }
      return "Não foi possível extrair texto da resposta";
    } catch (error) {
      console.error("Erro ao extrair texto da resposta:", error);
      return "Erro ao processar resposta do modelo";
    }
  }

  // Método para criar um documento PDF a partir de texto gerado pela IA
  async generatePDF(
    content: string,
    title: string = "Documento Gerado"
  ): Promise<Buffer> {
    try {
      const pdfDoc = await PDFDocument.create();
      const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const page = pdfDoc.addPage([595.28, 841.89]); // A4

      // Título
      page.drawText(title, {
        x: 50,
        y: 800,
        size: 24,
        font: timesRomanFont,
        color: rgb(0, 0, 0),
      });

      // Conteúdo
      const contentLines = this.wrapText(content, 70); // 70 caracteres por linha
      let y = 760;
      for (const line of contentLines) {
        page.drawText(line, {
          x: 50,
          y: y,
          size: 12,
          font: timesRomanFont,
          color: rgb(0, 0, 0),
        });
        y -= 15; // Espaçamento entre linhas

        // Se chegou ao final da página, adicione nova página
        if (y < 50) {
          const newPage = pdfDoc.addPage([595.28, 841.89]);
          y = 800;
        }
      }

      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      throw new HttpException(
        "Erro ao gerar documento PDF",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // Método para gerar um documento Word (DOCX) usando texto da IA
  async generateDOCX(
    content: string,
    title: string = "Documento Gerado"
  ): Promise<Buffer> {
    try {
      // Implementação usando bibliotecas como docx ou exceljs
      // Esta é uma implementação simplificada usando um template HTML
      const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: 'Times New Roman', Times, serif; margin: 2cm; }
            h1 { text-align: center; }
            p { text-align: justify; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          ${content
            .split("\n")
            .map((line) => `<p>${line}</p>`)
            .join("")}
        </body>
      </html>
      `;

      // Na implementação real, você usaria uma biblioteca para converter HTML para DOCX
      // Aqui apenas retornamos o HTML como buffer para exemplo
      return Buffer.from(htmlContent);
    } catch (error) {
      console.error("Erro ao gerar DOCX:", error);
      throw new HttpException(
        "Erro ao gerar documento DOCX",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // Método auxiliar para quebrar texto em linhas
  private wrapText(text: string, maxCharsPerLine: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      if ((currentLine + word).length > maxCharsPerLine) {
        lines.push(currentLine.trim());
        currentLine = word + " ";
      } else {
        currentLine += word + " ";
      }
    }

    if (currentLine.trim().length > 0) {
      lines.push(currentLine.trim());
    }

    return lines;
  }

  // Detectar tipo MIME de um buffer de imagem
  private detectMimeType(buffer: Buffer): string {
    const signatures: { [key: string]: string } = {
      ffd8ff: "image/jpeg",
      "89504e47": "image/png",
      "47494638": "image/gif",
      "52494646": "image/webp",
    };

    const hex = buffer.toString("hex", 0, 4).toLowerCase();

    for (const [signature, mimeType] of Object.entries(signatures)) {
      if (hex.startsWith(signature)) {
        return mimeType;
      }
    }

    return "application/octet-stream";
  }

  public async getUserById(userId: number): Promise<any> {
    return await this.uow.userRepository.findOne({
      where: { id: userId },
    });
  }

  public async curriculumCreated(
    usingAi: boolean,
    userId: number,
    companyId: number,
    content: any,
    prompt?: string
  ): Promise<any> {
    let newCurriculum: Curriculum = {} as Curriculum;
    newCurriculum.createdAt = new Date();
    newCurriculum.updatedAt = new Date();
    newCurriculum.createdByUser = userId.toString();
    newCurriculum.updatedByUser = userId.toString();
    newCurriculum.companyId = companyId;
    newCurriculum.content = content;
    newCurriculum.usingAi = usingAi;
    newCurriculum.content = content;
    newCurriculum.prompt = prompt;
    const newItem = await this.uow.curriculumRepository.save(newCurriculum);
    return newItem;
  }
}
