import { Module } from '@nestjs/common';
import { UnitOfWorkService } from '@/infra/unit-of-work';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  providers: [UsersService, TeamService, UnitOfWorkService],
  controllers: [UsersController, TeamController]
})
export class UsersModule {}
