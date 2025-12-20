import { CompanySetup } from "@/domain/entities/company-setup.entity";
import { Company } from "@/domain/entities/company.entity";
import { User } from "@/domain/entities/user.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";
import { IsNull } from "typeorm";
import * as bcrypt from "bcryptjs";

export interface CreateCompanyDto {
  name: string;
  address?: string;
  phone?: string;
  cnpj?: string;
}

export interface CreateUserForCompanyDto {
  email: string;
  password: string;
  name: string;
  role?: string; // admin, atendente, visitante
}

@Injectable()
export class CompaniesService {
  constructor(private uow: UnitOfWorkService) {}

  /**
   * Cria uma nova empresa
   */
  async create(
    companyData: CreateCompanyDto,
    userId?: number
  ): Promise<Company> {
    const company = new Company();
    company.name = companyData.name;
    company.address = companyData.address || "";
    company.phone = companyData.phone || "";
    company.is_active = true;
    company.updatedAt = new Date();

    if (userId) {
      company.createdByUser = userId.toString();
      company.updatedByUser = userId.toString();
    }

    const savedCompany = await this.uow.companyRepository.save(company);

    // Criar setup padrão para a empresa
    const setup = new CompanySetup();
    setup.companyId = savedCompany.id;
    setup.companyName = savedCompany.name;
    setup.companyAddress = savedCompany.address;
    setup.companyCNPJ = companyData.cnpj || "";
    setup.updatedAt = new Date();

    await this.uow.companySetupRepository.save(setup);

    return savedCompany;
  }

  /**
   * Atualiza uma empresa existente
   */
  async update(
    companyId: number,
    companyData: Partial<CreateCompanyDto>,
    userId?: number
  ): Promise<Company> {
    const company = await this.getOne(companyId);
    if (!company) {
      throw new Error("Empresa não encontrada");
    }

    if (companyData.name) company.name = companyData.name;
    if (companyData.address) company.address = companyData.address;
    if (companyData.phone) company.phone = companyData.phone;
    company.updatedAt = new Date();

    if (userId) {
      company.updatedByUser = userId.toString();
    }

    return await this.uow.companyRepository.save(company);
  }

  /**
   * Lista todas as empresas ativas
   */
  async getAll(): Promise<Company[]> {
    return await this.uow.companyRepository.find({
      where: {
        deletedAt: IsNull(),
        is_active: true,
      },
      order: {
        name: "ASC",
      },
    });
  }

  /**
   * Busca uma empresa pelo ID
   */
  async getOne(companyId: number): Promise<Company | null> {
    return await this.uow.companyRepository.findOne({
      where: {
        id: companyId,
        deletedAt: IsNull(),
      },
    });
  }

  /**
   * Lista empresas que o usuário tem acesso
   */
  async getCompaniesByUser(userId: number): Promise<Company[]> {
    const user = await this.uow.userRepository.findOne({
      where: { id: userId },
      relations: ["company"],
    });

    if (!user) {
      return [];
    }

    // Por enquanto, retorna apenas a empresa do usuário
    // No futuro, pode ser expandido para suportar múltiplas empresas por usuário
    if (user.company) {
      return [user.company];
    }

    return [];
  }

  /**
   * Soft delete de uma empresa
   */
  async delete(companyId: number): Promise<void> {
    const company = await this.getOne(companyId);
    if (!company) {
      throw new Error("Empresa não encontrada");
    }

    company.deletedAt = new Date();
    company.is_active = false;
    await this.uow.companyRepository.save(company);
  }

  /**
   * Atualiza configurações da empresa
   */
  async updateSetup(companySetup: CompanySetup): Promise<CompanySetup> {
    companySetup.updatedAt = new Date();
    return await this.uow.companySetupRepository.save(companySetup);
  }

  /**
   * Busca configurações da empresa
   */
  async getSetup(companyId: number): Promise<CompanySetup[]> {
    return await this.uow.companySetupRepository.find({
      where: {
        companyId,
        deletedAt: IsNull(),
      },
    });
  }

  /**
   * Associa um usuário a uma empresa
   */
  async addUserToCompany(userId: number, companyId: number): Promise<User> {
    const user = await this.uow.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    const company = await this.getOne(companyId);
    if (!company) {
      throw new Error("Empresa não encontrada");
    }

    user.companyId = companyId;
    user.updatedAt = new Date();

    return await this.uow.userRepository.save(user);
  }

  /**
   * Lista usuários de uma empresa
   */
  async getUsersByCompany(companyId: number): Promise<User[]> {
    return await this.uow.userRepository.find({
      where: {
        companyId,
        deletedAt: IsNull(),
      },
      order: {
        name: "ASC",
      },
    });
  }

  /**
   * Cria um novo usuário para uma empresa (Super Admin only)
   */
  async createUserForCompany(
    companyId: number,
    userData: CreateUserForCompanyDto,
    createdByUserId?: number
  ): Promise<User> {
    // Verificar se a empresa existe
    const company = await this.getOne(companyId);
    if (!company) {
      throw new Error("Empresa não encontrada");
    }

    // Verificar se já existe um usuário com este email
    const existingUser = await this.uow.userRepository.findOne({
      where: { email: userData.email },
    });

    if (existingUser) {
      throw new Error("Já existe um usuário com este email");
    }

    // Validar role
    const allowedRoles = ["admin", "atendente", "visitante"];
    const role =
      userData.role && allowedRoles.includes(userData.role)
        ? userData.role
        : "atendente";

    // Hash da senha
    console.log(
      `[CREATE USER DEBUG] Password received length: ${userData.password?.length}`
    );
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    console.log(
      `[CREATE USER DEBUG] Hashed password length: ${hashedPassword?.length}`
    );
    console.log(
      `[CREATE USER DEBUG] Hash starts with: ${hashedPassword?.substring(
        0,
        10
      )}`
    );

    // Verificar se o hash foi criado corretamente
    const testCompare = await bcrypt.compare(userData.password, hashedPassword);
    console.log(`[CREATE USER DEBUG] Test compare result: ${testCompare}`);

    // Criar novo usuário
    const user = new User();
    user.email = userData.email;
    user.username = userData.email;
    user.name = userData.name;
    user.password = hashedPassword;
    user.role = role;
    user.companyId = companyId;
    user.is_active = true;
    user.createdAt = new Date();
    user.updatedAt = new Date();
    user.last_login = new Date();

    if (createdByUserId) {
      user.createdByUser = createdByUserId.toString();
      user.updatedByUser = createdByUserId.toString();
    }

    return await this.uow.userRepository.save(user);
  }
}
