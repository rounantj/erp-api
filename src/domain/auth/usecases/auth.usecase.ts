import { User } from "@/domain/entities/user.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

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
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new Error("Password invalid");
    }
    const payload: PayloadAccessToken = {
      password: user.password,
      email: user.email,
      companyId: 1,
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
        password: apiUser.password,
        email: apiUser.email,
        companyId: 1,
      };
      return {
        access_token: this.jwtService.sign(payload),
      };
    }

    user = new User();

    user.password = apiUser.password;
    user.name = apiUser?.name ?? "";
    user.username = apiUser?.username ?? "";
    user.role = apiUser?.role ?? "admin";
    user.email = apiUser.email;
    user.companyId = apiUser?.companyId;
    user.is_active = true;
    user.last_login = new Date();
    user.updatedAt = new Date();
    user.createdAt = new Date();
    const payload = apiUser;
    await this.uow.userRepository.save(user);

    return {
      user,
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
}
