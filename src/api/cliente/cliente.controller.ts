import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "@/domain/auth/jwt-auth.guard";
import { Cliente } from "@/domain/entities/cliente.entity";
import { ClienteService } from "./cliente.service";

@Controller("clientes")
export class ClienteController {
  constructor(private clienteService: ClienteService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() cliente: Cliente) {
    const user = req.user.sub;
    cliente.companyId = user.companyId;
    return this.clienteService.create(cliente);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Request() req: any, @Query("search") search?: string) {
    const user = req.user.sub;
    return this.clienteService.findAll(user.companyId, search);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  findOne(@Param("id") id: number) {
    return this.clienteService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(":id")
  update(@Param("id") id: number, @Body() cliente: Partial<Cliente>) {
    return this.clienteService.update(id, cliente);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Param("id") id: number) {
    return this.clienteService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("buscar/cpf-cnpj/:cpfCnpj")
  findByCpfCnpj(@Request() req: any, @Param("cpfCnpj") cpfCnpj: string) {
    const user = req.user.sub;
    return this.clienteService.findByCpfCnpj(cpfCnpj, user.companyId);
  }
}
