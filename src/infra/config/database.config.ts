import { replaceAll } from '@/helpers/string.service'
import { PoolConfig } from 'pg'

export const pgConfig = async (): Promise<PoolConfig> => {
  const config = {
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '25060', 10),
    database: process.env.DB_DATABASE,
    ssl: {
      ca: Buffer.from(
        replaceAll(process.env.SSL_CA, '\\n', '\n'),
        'utf8',
      ),
    }
  }
  return config
}
