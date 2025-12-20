import { DataSource } from "typeorm";
import { typeormConfig } from "../../api/config/typeorm.config";
import { Cliente } from "../../domain/entities/cliente.entity";

const dataSource = new DataSource(typeormConfig() as any);

async function seedDefaultCliente() {
  try {
    await dataSource.initialize();
    console.log("Conectado ao banco de dados");

    const clienteRepository = dataSource.getRepository(Cliente);

    // Verificar se já existe um cliente padrão
    const existingCliente = await clienteRepository.findOne({
      where: { nome: "Cliente Padrão" },
    });

    if (existingCliente) {
      console.log("Cliente padrão já existe:", existingCliente.id);
      return;
    }

    // Criar cliente padrão
    const defaultCliente = clienteRepository.create({
      nome: "Cliente Padrão",
      cpf_cnpj: null,
      email: null,
      telefone: null,
      endereco: null,
      cidade: null,
      estado: null,
      cep: null,
      observacoes: "Cliente padrão para vendas sem identificação específica",
      ativo: true,
      companyId: 1,
    });

    const savedCliente = await clienteRepository.save(defaultCliente);
    console.log("Cliente padrão criado com sucesso:", savedCliente.id);
  } catch (error) {
    console.error("Erro ao criar cliente padrão:", error);
  } finally {
    await dataSource.destroy();
  }
}

seedDefaultCliente();
