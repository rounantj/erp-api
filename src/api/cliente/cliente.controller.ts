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
    return this.clienteService.create(req.user.sub.companyId, cliente);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Request() req: any, @Query("search") search?: string) {
    const user = req.user.sub;
    return this.clienteService.findAll(user.companyId, search);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  findOne(@Request() req: any, @Param("id") id: number) {
    return this.clienteService.findOne(req.user.sub.companyId, Number(id));
  }

  @UseGuards(JwtAuthGuard)
  @Put(":id")
  update(@Request() req: any, @Param("id") id: number, @Body() cliente: Partial<Cliente>) {
    return this.clienteService.update(req.user.sub.companyId, Number(id), cliente);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Request() req: any, @Param("id") id: number) {
    return this.clienteService.remove(req.user.sub.companyId, Number(id));
  }

  @UseGuards(JwtAuthGuard)
  @Get("buscar/cpf-cnpj/:cpfCnpj")
  findByCpfCnpj(@Request() req: any, @Param("cpfCnpj") cpfCnpj: string) {
    const user = req.user.sub;
    return this.clienteService.findByCpfCnpj(cpfCnpj, user.companyId);
  }
}
