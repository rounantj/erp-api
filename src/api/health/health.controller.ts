import { Controller, Get } from '@nestjs/common'
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus'

@Controller()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private typeOrm: TypeOrmHealthIndicator,
  ) {}

  @Get('health')
  @HealthCheck()
  async check() {
    return this.health.check([
      async () => this.typeOrm.pingCheck('database', { timeout: 5000 }),
    ])
  }

  @Get('ready')
  @HealthCheck()
  async ready() {
    return this.health.check([])
  }
}
