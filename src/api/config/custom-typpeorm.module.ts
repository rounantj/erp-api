// typeorm.module.ts

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { typeormConfig } from './typeorm.config'
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: async () => typeormConfig(),
    }),
  ],
  exports: [TypeOrmModule],
})
export class CustomTypeOrmModule { }
