import { Cliente } from "@/domain/entities/cliente.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable, NotFoundException } from "@nestjs/common";
import { ILike } from "typeorm";

const EDITABLE: (keyof Cliente)[] = [
  "nome",
  "cpf_cnpj",
  "email",
  "telefone",
  "endereco",
  "cidade",
  "estado",
  "cep",
  "observacoes",
  "ativo",
];

const pick = (data: Partial<Cliente>) => {
  const out: Partial<Cliente> = {};
  EDITABLE.forEach((key) => {
    if (data[key] !== undefined) (out as any)[key] = data[key];
  });
  return out;
};

@Injectable()
export class ClienteService {
  constructor(private uow: UnitOfWorkService) {}

  async create(companyId: number, cliente: Partial<Cliente>) {
    return await this.uow.clienteRepository.save({ ...pick(cliente), companyId });
  }

  async findAll(companyId: number, search?: string) {
    const where: any = { companyId };
    if (search) where.nome = ILike(`%${search}%`);

    const clientes = await this.uow.clienteRepository.find({ where, order: { nome: "ASC" } });
    if (!clientes.length) return clientes;

    const resumo: { clienteId: number; compras: string; total: string; ultima: Date }[] =
      await this.uow.vendaRepository.query(
        `SELECT "clienteId", COUNT(*) AS compras, SUM(total - COALESCE(desconto, 0)) AS total, MAX(created_at) AS ultima
           FROM venda
          WHERE "companyId" = $1 AND "clienteId" = ANY($2) AND deleted_at IS NULL
            AND (exclusion_status IS NULL OR exclusion_status <> 'approved')
          GROUP BY "clienteId"`,
        [companyId, clientes.map((c) => c.id)]
      );
    const porCliente = new Map(resumo.map((r) => [Number(r.clienteId), r]));

    return clientes.map((c) => {
      const r = porCliente.get(c.id);
      return {
        ...c,
        compras: Number(r?.compras || 0),
        totalGasto: Number(r?.total || 0),
        ultimaCompra: r?.ultima || null,
      };
    });
  }

  async findOne(companyId: number, id: number) {
    const cliente = await this.uow.clienteRepository.findOne({ where: { id, companyId } });
    if (!cliente) throw new NotFoundException("Cliente não encontrado");
    return cliente;
  }

  async update(companyId: number, id: number, cliente: Partial<Cliente>) {
    await this.findOne(companyId, id);
    await this.uow.clienteRepository.update({ id, companyId }, pick(cliente));
    return await this.findOne(companyId, id);
  }

  async remove(companyId: number, id: number) {
    await this.findOne(companyId, id);
    return await this.uow.clienteRepository.softDelete({ id, companyId });
  }

  async findByCpfCnpj(cpfCnpj: string, companyId: number) {
    return await this.uow.clienteRepository.findOne({
      where: { cpf_cnpj: cpfCnpj, companyId },
    });
  }
}
