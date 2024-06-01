import { User } from '@/domain/entities/user.entity'
import { UnitOfWorkService } from '@/infra/unit-of-work'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt';

type CompanyID = number
type CompanyName = string
type CompanyExternalId = string
type PayloadAccounts = [CompanyID, CompanyName, CompanyExternalId]

export type PayloadAccessToken = {
  id: number
  username: string
  name?: string
  email?: string
  password?: string,
  companyId?: number,
  secret?: string
}

type AccessToken = {
  access_token: string
}

@Injectable()
export class UserAuthUsecase {
  constructor(
    private readonly uow: UnitOfWorkService,
    private jwtService: JwtService,
  ) { }

  private async updateLastAccess(id: number) {
    const updateUser = new User()
    updateUser.id = id
    updateUser.last_login = new Date()
    return this.uow.userRepository.save(updateUser)
  }

  async validateUser(username: string, pass: string): Promise<any> {
    const options = {
      where: { username }
    }

    const user = await this.uow.userRepository.findOne(options)
    if (user) {
      const { ...result } = user
      return result
    }
    return null
  }

  async login(username: string, password: string): Promise<AccessToken> {
    const user = await this.uow.userRepository.findOne({ where: { username } })
    if (!user) {
      throw new Error('Secret invalid')
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      throw new Error('Secret invalid')
    }
    const payload: PayloadAccessToken = {
      id: user.id,
      username: user.username,
      email: 'none'
    }
    return {
      access_token: this.jwtService.sign(payload),
    }
  }

  async loginAsApi(apiUser: User): Promise<AccessToken> {
    return {
      access_token: this.jwtService.sign(apiUser, { expiresIn: '3000y' }),
    }
  }

  async register(apiUser: any): Promise<AccessToken> {
    if (apiUser?.secret != process.env["JWT_SECRET"]) {
      throw new Error('Secret invalid')
    }
    const user = new User()
    // Todo implement bcrypt
    apiUser.password = await bcrypt.hash(apiUser.password, 10)
    user.password = apiUser.password
    user.name = apiUser?.name
    user.username = apiUser?.username
    user.role = apiUser?.role
    user.email = apiUser?.email
    user.companyId = apiUser?.companyId
    user.is_active = true
    user.last_login = new Date()
    user.updatedAt = new Date()
    user.createdAt = new Date()
    const payload = apiUser
    await this.uow.userRepository.save(user)

    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '3000y' }),
    }
  }

  async auth(userId: number): Promise<any> {
    return await this.uow.userRepository.findOne({
      where: {
        id: userId
      }
    })
  }

}
