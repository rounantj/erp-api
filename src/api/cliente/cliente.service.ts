import { Cliente } from "@/domain/entities/cliente.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";
import { Like } from "typeorm";

@Injectable()
export class ClienteService {
  constructor(private uow: UnitOfWorkService) {}

  async create(cliente: Cliente) {
    return await this.uow.clienteRepository.save(cliente);
  }

  async findAll(companyId: number, search?: string) {
    const where: any = { companyId };

    if (search) {
      where.nome = Like(`%${search}%`);
    }

    return await this.uow.clienteRepository.find({
      where,
      order: { nome: "ASC" },
    });
  }

  async findOne(id: number) {
    return await this.uow.clienteRepository.findOne({
      where: { id },
    });
  }

  async update(id: number, cliente: Partial<Cliente>) {
    await this.uow.clienteRepository.update(id, cliente);
    return await this.findOne(id);
  }

  async remove(id: number) {
    return await this.uow.clienteRepository.softDelete(id);
  }

  async findByCpfCnpj(cpfCnpj: string, companyId: number) {
    return await this.uow.clienteRepository.findOne({
      where: { cpf_cnpj: cpfCnpj, companyId },
    });
  }
}
