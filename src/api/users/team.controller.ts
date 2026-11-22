import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { TeamService, teamActor } from "./team.service";

@Controller("team")
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(@Request() req: any) {
    return this.team.list(teamActor(req, { admin: true }));
  }

  @Post()
  create(@Request() req: any, @Body() body: { name?: string; email?: string; role?: string }) {
    return this.team.create(teamActor(req, { admin: true }), body || {});
  }

  @Patch(":id")
  update(@Request() req: any, @Param("id", ParseIntPipe) id: number, @Body() body: { name?: string; role?: string; active?: boolean }) {
    return this.team.update(teamActor(req, { admin: true }), id, body || {});
  }

  @Post(":id/reset-password")
  resetPassword(@Request() req: any, @Param("id", ParseIntPipe) id: number) {
    return this.team.resetPassword(teamActor(req, { admin: true }), id);
  }

  @Delete(":id")
  remove(@Request() req: any, @Param("id", ParseIntPipe) id: number) {
    return this.team.remove(teamActor(req, { admin: true }), id);
  }
}
