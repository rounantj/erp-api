import {
  Controller,
  Post,
  Request,
  Body,
  Headers,
  UnauthorizedException,
} from "@nestjs/common";
import { ClerkService } from "./clerk.service";

@Controller("auth/clerk")
export class ClerkController {
  constructor(private readonly clerkService: ClerkService) {}

  @Post("sync")
  async sync(@Request() req: any, @Headers("authorization") authHeader: string) {
    try {
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new UnauthorizedException("Token não fornecido");
      }

      const token = authHeader.replace("Bearer ", "").trim();
      const result = await this.clerkService.syncUser(token);
      
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      throw new UnauthorizedException(`Erro ao sincronizar usuário: ${errorMessage}`);
    }
  }

  @Post("verify")
  async verify(@Request() req: any, @Headers("authorization") authHeader: string) {
    try {
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new UnauthorizedException("Token não fornecido");
      }

      const token = authHeader.replace("Bearer ", "").trim();
      const result = await this.clerkService.verifyAndGetUser(token);
      
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      throw new UnauthorizedException(`Erro ao verificar token: ${errorMessage}`);
    }
  }
}

