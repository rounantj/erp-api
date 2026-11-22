import { Despesa } from "@/domain/entities/despesas.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { IsNull } from "typeorm";

@Injectable()
export class DespesaService {
  constructor(private uow: UnitOfWorkService) {}

  private async findOwn(companyId: number, id: number) {
    const despesa = await this.uow.despesaRepository.findOne({ where: { id, companyId, deletedAt: IsNull() } });
    if (!despesa) throw new NotFoundException("Despesa não encontrada");
    return despesa;
  }

  async upsert(companyId: number, body: Partial<Despesa>, userId?: string) {
    if (!companyId) throw new BadRequestException("Empresa não identificada");
    const valor = Number(body.valor);
    if (!String(body.descricao || "").trim()) throw new BadRequestException("Informe o que é a despesa");
    if (!Number.isFinite(valor) || valor < 0) throw new BadRequestException("Valor inválido");
    if (!body.vencimento) throw new BadRequestException("Informe o vencimento");

    const fields = {
      descricao: String(body.descricao).trim(),
      valor,
      status: body.status === "Pago" ? "Pago" : "Em Aberto",
      fixa: !!body.fixa,
      vencimento: body.vencimento,
      categoria: body.categoria || (body.fixa ? "Recorrente" : "Passageira"),
      updatedAt: new Date(),
      updatedByUser: userId,
    };

    if (body.id) {
      const existing = await this.findOwn(companyId, Number(body.id));
      return await this.uow.despesaRepository.save({ ...existing, ...fields });
    }
    return await this.uow.despesaRepository.save(
      this.uow.despesaRepository.create({ ...fields, companyId, createdByUser: userId })
    );
  }

  async getAll(companyId: number) {
    if (!companyId) return [];
    return await this.uow.despesaRepository.find({
      where: { companyId, deletedAt: IsNull() },
      order: { vencimento: "ASC" },
    });
  }

  async delete(companyId: number, id: number) {
    await this.findOwn(companyId, id);
    await this.uow.despesaRepository.softDelete({ id, companyId });
    return { success: true };
  }
}
