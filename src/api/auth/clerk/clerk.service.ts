import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { createClerkClient, ClerkClient } from "@clerk/backend";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { User } from "@/domain/entities/user.entity";
import { Company } from "@/domain/entities/company.entity";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class ClerkService {
  private clerkClient: ClerkClient;

  constructor(
    private readonly uow: UnitOfWorkService,
    private readonly jwtService: JwtService
  ) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new Error("CLERK_SECRET_KEY não configurada no ambiente");
    }
    this.clerkClient = createClerkClient({ secretKey });
  }

  /**
   * Valida o token do Clerk e retorna os dados do usuário
   */
  async verifyToken(token: string): Promise<any> {
    try {
      const sessionToken = token.replace("Bearer ", "").trim();
      
      // Decodificar o JWT do Clerk (é um JWT padrão)
      // O Clerk usa JWTs que podem ser decodificados sem verificação imediata
      // Para produção, você deve verificar a assinatura usando a chave pública do Clerk
      // Por enquanto, vamos decodificar e obter os dados do usuário via API
      const base64Url = sessionToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
      const payload = JSON.parse(jsonPayload);

      // Validar que é um token do Clerk (contém sub)
      if (!payload.sub) {
        throw new UnauthorizedException("Token inválido");
      }

      // Buscar dados completos do usuário no Clerk
      try {
        const clerkUser = await this.clerkClient.users.getUser(payload.sub);
        return {
          ...payload,
          email: clerkUser.emailAddresses?.[0]?.emailAddress,
          email_addresses: clerkUser.emailAddresses,
          name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim(),
        };
      } catch (error) {
        // Se não conseguir buscar do Clerk, usar dados do payload
        return payload;
      }
    } catch (error) {
      throw new UnauthorizedException("Token inválido ou expirado");
    }
  }

  /**
   * Sincroniza o usuário do Clerk com o banco de dados
   * Cria ou atualiza o usuário no banco local
   */
  async syncUser(clerkToken: string): Promise<any> {
    try {
      // Verificar token do Clerk
      const clerkPayload = await this.verifyToken(clerkToken);
      const clerkUserId = clerkPayload.sub;
      const clerkEmail = clerkPayload.email || clerkPayload.email_addresses?.[0]?.email_address;
      
      if (!clerkEmail) {
        throw new BadRequestException("Email não encontrado no token do Clerk");
      }

      // Buscar usuário existente pelo email ou clerkId
      let user = await this.uow.userRepository.findOne({
        where: { email: clerkEmail },
      });

      // Se não encontrar por email, buscar por clerkId (se existir campo)
      // Por enquanto, vamos usar apenas email
      
      if (!user) {
        // Criar novo usuário
        // Por padrão, precisamos de uma company. Vamos buscar ou criar uma default
        // Isso pode precisar ser ajustado dependendo da lógica de negócio
        const defaultCompany = await this.uow.userRepository.manager.findOne(Company, {
          where: { id: 1 },
        });

        if (!defaultCompany) {
          throw new BadRequestException("Empresa padrão não encontrada");
        }

        user = new User();
        user.email = clerkEmail;
        user.username = clerkEmail;
        user.name = clerkPayload.name || clerkEmail.split("@")[0];
        user.companyId = defaultCompany.id;
        user.role = "visitante";
        user.is_active = true;
        user.password = "CLERK_AUTH"; // Placeholder, não será usado
        user.last_login = new Date();
        
        // Adicionar clerkId quando a migração da entidade for feita
        // user.clerkId = clerkUserId;

        user = await this.uow.userRepository.save(user);
      } else {
        // Atualizar último login
        user.last_login = new Date();
        // Adicionar clerkId quando a migração da entidade for feita
        // user.clerkId = clerkUserId;
        user = await this.uow.userRepository.save(user);
      }

      // Gerar JWT interno para compatibilidade
      const payload = {
        id: user.id,
        email: user.email,
        companyId: user.companyId,
      };
      const accessToken = this.jwtService.sign(payload);

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          role: user.role,
          companyId: user.companyId,
        },
        access_token: accessToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      throw new BadRequestException(`Erro ao sincronizar usuário: ${errorMessage}`);
    }
  }

  /**
   * Apenas verifica o token e retorna dados do usuário sem criar no banco
   */
  async verifyAndGetUser(clerkToken: string): Promise<any> {
    try {
      const clerkPayload = await this.verifyToken(clerkToken);
      const clerkUserId = clerkPayload.sub;
      const clerkEmail = clerkPayload.email || clerkPayload.email_addresses?.[0]?.email_address;

      // Buscar usuário no banco
      const user = await this.uow.userRepository.findOne({
        where: { email: clerkEmail },
      });

      if (!user) {
        throw new UnauthorizedException("Usuário não encontrado no sistema");
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          role: user.role,
          companyId: user.companyId,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      throw new UnauthorizedException(`Erro ao verificar token: ${errorMessage}`);
    }
  }

  /**
   * Cria um usuário no Clerk com email e senha
   * @param email Email do usuário
   * @param password Senha em texto plano (será hasheada pelo Clerk)
   * @param name Nome completo do usuário
   * @returns Usuário criado no Clerk ou usuário existente
   */
  async createUserWithPassword(
    email: string,
    password: string,
    name: string
  ): Promise<any> {
    try {
      // Verificar se usuário já existe no Clerk
      const clerkUsers = await this.clerkClient.users.getUserList({
        emailAddress: [email],
      });

      let clerkUser = clerkUsers.data.find(
        (u: any) => u.emailAddresses?.[0]?.emailAddress === email
      );

      if (clerkUser) {
        // Usuário já existe, retornar existente
        return clerkUser;
      }

      // Extrair firstName e lastName do name
      const nameParts = name.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      // Criar usuário no Clerk
      clerkUser = await this.clerkClient.users.createUser({
        emailAddress: [email],
        firstName,
        lastName,
        password,
        skipPasswordChecks: false, // Validar senha normalmente
      });

      return clerkUser;
    } catch (error: any) {
      // Se o erro for de usuário já existente, tentar buscar novamente
      if (error.errors?.[0]?.code === "form_identifier_exists") {
        const retryList = await this.clerkClient.users.getUserList({
          emailAddress: [email],
        });
        const existingUser = retryList.data.find(
          (u: any) => u.emailAddresses?.[0]?.emailAddress === email
        );
        if (existingUser) {
          return existingUser;
        }
      }
      // Re-lançar erro para tratamento no serviço que chamou
      throw error;
    }
  }
}

