import {
    Controller,
    Get,
    Request,
    Post,
    UseGuards,
    Query,
    Body,
} from '@nestjs/common'
import { PayloadAccessToken, UserAuthUsecase } from '@/domain/auth/usecases/auth.usecase'
import { JwtAuthGuard } from '@/domain/auth/guard/jwt-auth.guard'
import { LocalAuthGuard } from '@/domain/auth/guard/local-auth.guard'
import { HasRoles, RolesGuard } from '@/domain/auth/guard/roles.guard'
import { Roles } from '@/domain/auth/enums/roles.enum'
import { Throttle } from '@nestjs/throttler'
import { User } from '@/domain/entities/user.entity'

const REQUESTS_LIMIT = 10;
const REQUESTS_INTERVAL = 60000;
const THROTTLE_OPTIONS = {
    default: { limit: REQUESTS_LIMIT, ttl: REQUESTS_INTERVAL }
};

@Controller()
export class AuthController {
    constructor(private authService: UserAuthUsecase) { }


    @Throttle(THROTTLE_OPTIONS)
    @Post('auth/login')
    async login(@Request() req: any,
        @Body() payload: { username: string, password: string }) {
        // run
        return this.authService.login(payload.username, payload.password)
    }

    @Post('auth/register')
    async register(@Request() req: any,
        @Body() payload: PayloadAccessToken) {
        return this.authService.register(payload)
    }

    @Post('auth/login-as-api')
    @HasRoles(Roles.SuperAdmin)
    async loginAsApi(@Request() req: any) {
        return this.authService.loginAsApi(req.user)
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    getProfile(@Request() req: any) {
        return this.authService.auth(req.user.userId)
    }
}
