import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { IsNull } from "typeorm";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { User } from "@/domain/entities/user.entity";
import { generateFriendlyPassword } from "@/helpers/password-generator";

export const SUPER_ADMIN_EMAIL = "rounantj@hotmail.com";
const ROLES = ["admin", "atendente", "visitante"];

export type TeamActor = { id: number; companyId: number; superAdmin: boolean };

export function teamActor(req: any, opts: { admin?: boolean } = {}): TeamActor {
  const user = req.user?.sub;
  const companyId = Number(user?.companyId);
  if (!user?.id || !companyId) throw new ForbiddenException("Usuário sem empresa");
  const superAdmin = String(user.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;
  if (opts.admin && user.role !== "admin" && !superAdmin) {
    throw new ForbiddenException("Só o administrador da loja pode mudar a equipe");
  }
  return { id: Number(user.id), companyId, superAdmin };
}

@Injectable()
export class TeamService {
  constructor(private readonly uow: UnitOfWorkService) {}

  private view(user: User, actor: TeamActor) {
    return {
      id: user.id,
      name: user.name || "",
      email: user.email || user.username,
      role: ROLES.includes(user.role) ? user.role : "visitante",
      active: user.is_active !== false,
      lastLogin: user.last_login,
      createdAt: user.createdAt,
      isMe: user.id === actor.id,
      protected: (user.email || "").toLowerCase() === SUPER_ADMIN_EMAIL && !actor.superAdmin,
    };
  }

  async list(actor: TeamActor) {
    const users = await this.uow.userRepository.find({
      where: { companyId: actor.companyId, deletedAt: IsNull() },
      order: { createdAt: "ASC" },
    });
    return users.map((u) => this.view(u, actor));
  }

  async create(actor: TeamActor, body: { name?: string; email?: string; role?: string }) {
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = ROLES.includes(body.role) ? body.role : "atendente";
    if (!name) throw new BadRequestException("Digite o nome da pessoa");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException("Digite um e-mail válido");

    const password = generateFriendlyPassword();
    const hash = await bcrypt.hash(password, 10);
    const existing = await this.uow.userRepository.findOne({ where: [{ email }, { username: email }], withDeleted: true });

    if (existing && !(existing.deletedAt && existing.companyId === actor.companyId)) {
      throw new BadRequestException(
        existing.companyId === actor.companyId ? "Essa pessoa já está na sua equipe" : "Este e-mail já é usado em outra loja. Use outro e-mail."
      );
    }

    const user = existing || new User();
    Object.assign(user, {
      name,
      email,
      username: email,
      role,
      password: hash,
      companyId: actor.companyId,
      is_active: true,
      deletedAt: null,
      updatedAt: new Date(),
      createdByUser: String(actor.id),
    });
    const saved = await this.uow.userRepository.save(user);
    return { user: this.view(saved, actor), password };
  }

  private async member(actor: TeamActor, id: number) {
    const user = await this.uow.userRepository.findOne({ where: { id, companyId: actor.companyId } });
    if (!user) throw new NotFoundException("Pessoa não encontrada na sua equipe");
    if ((user.email || "").toLowerCase() === SUPER_ADMIN_EMAIL && !actor.superAdmin) {
      throw new ForbiddenException("Este usuário é do suporte e não pode ser alterado");
    }
    return user;
  }

  private async ensureAnotherAdmin(actor: TeamActor, userId: number) {
    const admins = await this.uow.userRepository.find({ where: { companyId: actor.companyId, role: "admin", is_active: true, deletedAt: IsNull() } });
    if (!admins.some((a) => a.id !== userId)) {
      throw new BadRequestException("A loja precisa ter pelo menos um administrador ativo");
    }
  }

  async update(actor: TeamActor, id: number, body: { name?: string; role?: string; active?: boolean }) {
    const user = await this.member(actor, id);
    const isMe = user.id === actor.id;

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new BadRequestException("Digite o nome da pessoa");
      user.name = name;
    }
    if (body.role !== undefined && body.role !== user.role) {
      if (!ROLES.includes(body.role)) throw new BadRequestException("Tipo de acesso inválido");
      if (isMe) throw new BadRequestException("Você não pode mudar o seu próprio acesso");
      if (user.role === "admin") await this.ensureAnotherAdmin(actor, user.id);
      user.role = body.role;
    }
    if (body.active !== undefined && body.active !== user.is_active) {
      if (isMe) throw new BadRequestException("Você não pode bloquear a si mesmo");
      if (!body.active && user.role === "admin") await this.ensureAnotherAdmin(actor, user.id);
      user.is_active = !!body.active;
    }
    user.updatedAt = new Date();
    user.updatedByUser = String(actor.id);
    return this.view(await this.uow.userRepository.save(user), actor);
  }

  async resetPassword(actor: TeamActor, id: number) {
    const user = await this.member(actor, id);
    const password = generateFriendlyPassword();
    user.password = await bcrypt.hash(password, 10);
    user.updatedAt = new Date();
    user.updatedByUser = String(actor.id);
    await this.uow.userRepository.save(user);
    return { user: this.view(user, actor), password };
  }

  async remove(actor: TeamActor, id: number) {
    const user = await this.member(actor, id);
    if (user.id === actor.id) throw new BadRequestException("Você não pode remover a si mesmo");
    if (user.role === "admin") await this.ensureAnotherAdmin(actor, user.id);
    await this.uow.userRepository.softDelete(user.id);
    return { ok: true };
  }
}
