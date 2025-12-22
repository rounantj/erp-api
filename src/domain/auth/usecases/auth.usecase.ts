import { User } from "@/domain/entities/user.entity";
import { Company } from "@/domain/entities/company.entity";
import { CompanySetup } from "@/domain/entities/company-setup.entity";
import { CompanySubscription } from "@/domain/entities/company-subscription.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { generateFriendlyPassword } from "@/helpers/password-generator";

type CompanyID = number;
type CompanyName = string;
type CompanyExternalId = string;
type PayloadAccounts = [CompanyID, CompanyName, CompanyExternalId];

export type PayloadAccessToken = {
  id?: number;
  username?: string;
  name?: string;
  email: string;
  password: string;
  companyId: number;
  secret?: string;
};

export type RegisterCompanyPayload = {
  companyName: string;
  adminName: string;
  email: string;
  phone?: string;
  cpfCnpj?: string;
  acceptTerms: boolean;
};

type AccessToken = {
  access_token: string;
};

@Injectable()
export class UserAuthUsecase {
  constructor(
    private readonly uow: UnitOfWorkService,
    private jwtService: JwtService
  ) {}

  private async updateLastAccess(id: number) {
    const updateUser = new User();
    updateUser.id = id;
    updateUser.last_login = new Date();
    return this.uow.userRepository.save(updateUser);
  }

  async validateUser(username: string, pass: string): Promise<any> {
    const options = {
      where: { username },
    };

    const user = await this.uow.userRepository.findOne(options);
    if (user) {
      const { ...result } = user;
      return result;
    }
    return null;
  }

  async login(email: string, password: string): Promise<any> {
    const user = await this.uow.userRepository.findOne({
      where: { email },
    });
    if (!user) {
      throw new Error("Password or email invalid");
    }

    // Debug log
    console.log(`[LOGIN DEBUG] Email: ${email}`);
    console.log(`[LOGIN DEBUG] Password length: ${password?.length}`);
    console.log(`[LOGIN DEBUG] Stored hash length: ${user.password?.length}`);
    console.log(
      `[LOGIN DEBUG] Hash starts with: ${user.password?.substring(0, 10)}`
    );

    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log(`[LOGIN DEBUG] Password valid: ${isPasswordValid}`);

    if (!isPasswordValid) {
      throw new Error("Password invalid");
    }
    const payload: PayloadAccessToken = {
      id: user.id,
      password: user.password,
      email: user.email,
      companyId: user.companyId,
    };
    return {
      user,
      access_token: this.jwtService.sign(payload),
    };
  }

  async loginAsApi(apiUser: User): Promise<AccessToken> {
    return {
      access_token: this.jwtService.sign(apiUser, { expiresIn: "3000y" }),
    };
  }

  async register(apiUser: any): Promise<any> {
    if (!apiUser?.email || !apiUser?.password.length) {
      throw new Error("Email or password invalid");
    }
    apiUser.password = await bcrypt.hash(apiUser.password, 10);
    let user = await this.uow.userRepository.findOne({
      where: { email: apiUser.email, password: apiUser.password },
    });
    if (user) {
      const payload: PayloadAccessToken = {
        id: user.id,
        password: user.password,
        email: user.email,
        companyId: user.companyId,
      };
      return {
        user,
        access_token: this.jwtService.sign(payload),
      };
    }

    user = new User();

    user.password = apiUser.password;
    user.name = apiUser?.name ?? "";
    user.username = apiUser?.username ?? "";
    user.role = apiUser?.role ?? "visitante";
    user.email = apiUser.email;
    user.companyId = apiUser?.companyId ?? 1;
    user.is_active = true;
    user.last_login = new Date();
    user.updatedAt = new Date();
    user.createdAt = new Date();

    const savedUser = await this.uow.userRepository.save(user);

    const payload: PayloadAccessToken = {
      id: savedUser.id,
      password: savedUser.password,
      email: savedUser.email,
      companyId: savedUser.companyId,
    };

    return {
      user: savedUser,
      access_token: this.jwtService.sign(payload, { expiresIn: "3000y" }),
    };
  }

  async auth(userId: number): Promise<any> {
    return await this.uow.userRepository.findOne({
      where: {
        id: userId,
      },
    });
  }

  async userList(companyId: number): Promise<any> {
    return await this.uow.userRepository.find({
      where: {
        companyId,
      },
    });
  }

  async updateUserRule({
    companyId,
    userName,
    userRule,
  }: {
    companyId: number;
    userName: string;
    userRule: string;
  }): Promise<any> {
    const user: User = await this.uow.userRepository.findOne({
      where: {
        companyId,
        username: userName,
      },
    });
    user.role = userRule;
    const result = await this.uow.userRepository.save(user);
    return result;
  }

  /**
   * Registra uma nova empresa com usuário admin e trial
   * Gera senha automática e retorna em plaintext (única vez)
   */
  async registerCompany(payload: RegisterCompanyPayload): Promise<any> {
    // Validações
    if (!payload.companyName?.trim()) {
      throw new BadRequestException("Nome da empresa é obrigatório");
    }
    if (!payload.adminName?.trim()) {
      throw new BadRequestException("Nome do administrador é obrigatório");
    }
    if (!payload.email?.trim()) {
      throw new BadRequestException("E-mail é obrigatório");
    }
    if (!payload.acceptTerms) {
      throw new BadRequestException("Você precisa aceitar os termos de uso");
    }

    // Verificar se email já existe
    const existingUser = await this.uow.userRepository.findOne({
      where: { email: payload.email.toLowerCase().trim() },
    });
    if (existingUser) {
      throw new BadRequestException("Este e-mail já está cadastrado. Faça login ou use outro e-mail.");
    }

    try {
      await this.uow.startTransaction();

      // 1. Criar a empresa
      const company = new Company();
      company.name = payload.companyName.trim();
      company.is_active = true;
      company.address = "";
      company.phone = payload.phone || "";
      company.updatedAt = new Date();
      const savedCompany = await this.uow.companyRepository.save(company);

      // 2. Gerar senha automática
      const plainPassword = generateFriendlyPassword();
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // 3. Criar usuário admin
      const user = new User();
      user.name = payload.adminName.trim();
      user.username = payload.email.toLowerCase().trim();
      user.email = payload.email.toLowerCase().trim();
      user.password = hashedPassword;
      user.role = "admin";
      user.companyId = savedCompany.id;
      user.is_active = true;
      user.last_login = new Date();
      user.createdAt = new Date();
      user.updatedAt = new Date();
      const savedUser = await this.uow.userRepository.save(user);

      // 4. Criar CompanySetup inicial
      const companySetup = new CompanySetup();
      companySetup.companyId = savedCompany.id;
      companySetup.companyName = payload.companyName.trim();
      companySetup.companyPhone = payload.phone || "";
      companySetup.companyEmail = payload.email.toLowerCase().trim();
      companySetup.companyCNPJ = payload.cpfCnpj || "";
      companySetup.onboardingCompleted = false;
      companySetup.updatedAt = new Date();
      await this.uow.companySetupRepository.save(companySetup);

      // 5. Buscar plano trial
      const trialPlan = await this.uow.planRepository.findOne({
        where: { name: "free_trial" },
      });

      if (trialPlan) {
        // 6. Criar subscription trial
        const subscription = new CompanySubscription();
        subscription.companyId = savedCompany.id;
        subscription.planId = trialPlan.id;
        subscription.status = "trial";
        
        // Calcular data de expiração do trial
        const trialDays = trialPlan.trialDays || 15;
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
        subscription.trialEndsAt = trialEndsAt;
        
        subscription.currentPeriodStart = new Date();
        subscription.currentPeriodEnd = trialEndsAt;
        subscription.createdAt = new Date();
        subscription.updatedAt = new Date();
        
        await this.uow.companySubscriptionRepository.save(subscription);
      }

      await this.uow.commitTransaction();

      // Retornar sucesso com senha em plaintext (única vez)
      return {
        success: true,
        message: "Empresa cadastrada com sucesso!",
        password: plainPassword,
        email: payload.email.toLowerCase().trim(),
        companyName: payload.companyName.trim(),
        trialDays: trialPlan?.trialDays || 15,
      };

    } catch (error) {
      await this.uow.rollbackTransaction();
      console.error("[RegisterCompany] Erro:", error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException("Erro ao criar empresa. Tente novamente.");
    }
  }
}
