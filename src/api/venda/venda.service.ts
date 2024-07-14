import { Venda } from "@/domain/entities/vendas.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";
import * as moment from "moment";
import { Between } from "typeorm";

@Injectable()
export class VendasService {
  constructor(private uow: UnitOfWorkService) { }

  async create(venda: Venda) {
    return await this.uow.vendaRepository.save(venda);
  }

  async dashboard(): Promise<any> {
    const firstDayOfMonth = moment().startOf("month").format("YYYY-MM-DD");
    const lastDayOfMonth = moment().endOf("month").format("YYYY-MM-DD");

    const queryYear = `SELECT *
                        FROM venda
                        WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)`;

    const queryDespesas = `SELECT sum(valor) as total from despesa`
    const despesa = await this.uow.vendaRepository.query(queryDespesas);

    const vendas = `SELECT * FROM venda WHERE created_at BETWEEN '${firstDayOfMonth}' AND '${lastDayOfMonth}'`;
    const year = await this.uow.vendaRepository.query(queryYear);

    const vendeu = await this.uow.vendaRepository.query(vendas);
    let produtosVendidos: any[] = [];
    vendeu.forEach((venda: any) => {
      const prds = JSON.parse(venda.produtos);
      prds.forEach((prd: any) => {
        const dvl = {
          ...prd,
          createdAt: venda.created_at,
          valorTotal: prd.valor * prd.quantidade - (prds.desconto || 0),
        };
        produtosVendidos.push(dvl);
      });
    });

    let noAno: any[] = [];
    year.forEach((venda: any) => {
      const prds = JSON.parse(venda.produtos);
      prds.forEach((prd: any) => {
        const dvl = {
          ...prd,
          createdAt: venda.created_at,
          valorTotal: prd.valor * prd.quantidade - (prds.desconto || 0),
        };
        noAno.push(dvl);
      });
    });

    produtosVendidos = produtosVendidos.flat();
    produtosVendidos = produtosVendidos.length ? produtosVendidos.flat() : [];
    const produtos = produtosVendidos.filter(
      (a) => a.categoria?.includes("Prod") || !a.categoria
    );
    const servicos = produtosVendidos.filter((a) =>
      a.categoria?.includes("Servi")
    );

    const dias = Array.from(
      new Set(produtosVendidos.map((a) => moment(a.createdAt).format("DD/MM")))
    );

    const meses1 = Array.from(
      new Set(noAno.map((a) => moment(a.createdAt).format("MM/YYYY")))
    );
    let meses4 = [
      "",
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    const meses: string[] = [];
    meses1.forEach((m) => {
      const index = +m.split("/")[0];
      const mes = meses4[index];
      meses.push(mes);
    });
    const totalProdutos = produtos.reduce(
      (total, item) => total + item.valorTotal,
      0
    );
    const totalServicos = servicos.reduce(
      (total, item) => total + item.valorTotal,
      0
    );

    const vendidosHoje = produtosVendidos.filter(
      (a) =>
        moment(a.createdAt).format("DD/MM/YYYY") ==
        moment().format("DD/MM/YYYY")
    );

    const totalHoje = vendidosHoje.reduce(
      (total, item) => total + item.valorTotal,
      0
    );
    const vendidosNoMes = produtosVendidos.filter(
      (a) => moment(a.createdAt).format("MM/YYYY") == moment().format("MM/YYYY")
    );

    const totalEsseMes = vendidosNoMes.reduce(
      (total, item) => total + item.valorTotal,
      0
    );
    const servicosValues: number[] = [];
    const produtosValues: number[] = [];
    const fullValues: number[] = [];
    dias.forEach((dia) => {
      const prods = produtosVendidos.filter(
        (a) => moment(a.createdAt).format("DD/MM") == dia
      );
      const valor = prods.reduce((total, item) => total + item.valorTotal, 0);
      fullValues.push(valor);

      const prodsServico = prods.filter((a) => a.categoria.includes("Servi"));
      const valorServico = prodsServico.reduce(
        (total, item) => total + item.valorTotal,
        0
      );
      servicosValues.push(valorServico);

      const prodsProduto = prods.filter(
        (a) => !a.categoria || a.categoria.includes("Produt")
      );
      const valorProduto = prodsProduto.reduce(
        (total, item) => total + item.valorTotal,
        0
      );
      produtosValues.push(valorProduto);
    });
    const mesesSerValues: number[] = [];
    const mesesPrdValues: number[] = [];
    meses.forEach((mes) => {
      const prods = noAno.filter(
        (a) =>
          meses4[+moment(a.createdAt).format("MM/YYYY").split("/")[0]] == mes
      );
      const sS = prods.filter(
        (a) => !a.categoria || a.categoria.includes("Produt")
      );
      const pP = prods.filter((a) => a.categoria.includes("Servi"));
      const valorP = pP.reduce((total, item) => total + item.valorTotal, 0);
      const valorS = sS.reduce((total, item) => total + item.valorTotal, 0);
      mesesPrdValues.push(valorP);
      mesesSerValues.push(valorS);
    });

    return {
      produtosVendidos,
      totalProdutos,
      totalServicos,
      totalHoje,
      totalEsseMes,
      dias,
      servicosValues,
      fullValues,
      produtosValues,
      meses,
      mesesSerValues,
      mesesPrdValues,
      despesa
    };
  }

  async getAll(rangeDate: any) {
    const today = moment().format("YYYY-MM-DD");
    const oneMonthAgo = moment().subtract(1, 'months').format("YYYY-MM-DD");

    // Use default dates if not provided
    const start = rangeDate.startDate ?? oneMonthAgo;
    const end = rangeDate.endDate ?? today;

    return await this.uow.vendaRepository.find({
      where: {
        createdAt: Between(new Date(start), new Date(end))
      }
    });
  }

  async getOne(vendaId: number) {
    return await this.uow.vendaRepository.findOne({
      where: {
        id: vendaId,
      },
    });
  }
  async delete(vendaId: number) {
    return await this.uow.vendaRepository.delete(vendaId);
  }
}
