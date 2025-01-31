import { JwtService } from '@nestjs/jwt'

function execute(secret: string, sub: string) {
  const jwtService = new JwtService({ secret })
  const result = jwtService.sign({ sub })
  console.log('TOKEN\n', result)
}

execute(process.argv[2], process.argv[3])
