import { User } from "@/domain/entities/user.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";

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
}
