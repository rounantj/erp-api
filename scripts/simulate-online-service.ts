import "dotenv/config";
import OpenAI from "openai";
import { Client } from "pg";
import { collapseRepeatedReply } from "../src/api/whatsapp/ai/reply-text";
import { buildSystemPrompt } from "../src/api/whatsapp/ai/prompt";
import { toolDefinitions, ToolExecutor } from "../src/api/whatsapp/ai/tools";
import { CatalogService } from "../src/api/whatsapp/products/catalog.service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const PERSONA = process.env.SIM_PERSONA || `Você é Erika Rodrigues, cliente de uma papelaria, conversando pelo WhatsApp. Escreva mensagens curtas e informais, como uma pessoa comum.
Seu objetivo: conseguir a segunda via da conta de água deste mês. Comece dizendo só "Preciso da segunda via da conta de água".
Dados que você sabe e só informa se perguntarem: a conta é do SAAE de Linhares; matrícula 458213; titular Erika Rodrigues; CPF 123.456.789-09; quer o PDF mandado pelo WhatsApp.
Quando o atendente mostrar o resumo e perguntar se está correto, responda "sim". Depois que ele disser o número do pedido, responda exatamente FIM.`;

async function main() {
  const db = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  const catalog = new CatalogService({ query: (sql: string, params?: unknown[]) => db.query(sql, params) } as any);
  const services = (await catalog.listServices(1)).map((s) => ({ id: s.id, descricao: s.descricao, valor: s.valor }));
  const { rows: settings } = await db.query("SELECT instructions FROM whatsapp_settings WHERE company_id = 1");

  let pending: any[] = [];
  let stored: any[] = [];
  const memoryDb = {
    query: async (sql: string, params: any[]) => {
      if (sql.includes("SELECT pending_summaries")) return { rows: [{ pending_summaries: stored }] };
      if (sql.includes("SET pending_summaries")) {
        stored = JSON.parse(params[1]);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const executor = new ToolExecutor(
    { companyId: 1, conversationId: "sim", customerId: "sim", autoProductImages: false, latestCustomerMessage: null },
    { db: memoryDb, catalog } as any
  );
  const system = () =>
    buildSystemPrompt({
      storeName: "Fofa Papelaria",
      botName: "Fofa AI",
      storeInstructions: settings[0]?.instructions || "",
      productCardsEnabled: false,
      today: "sábado, 21 de novembro de 2026",
      customerName: process.env.SIM_NAME || "Erika Rodrigues",
      customerPhone: "5527996136755",
      pendingSummaries: pending,
      unattachedFiles: [],
      openOrders: [],
      services: services.map((s) => ({ produto_id: s.id, descricao: s.descricao, valor_unitario: Number(s.valor) })),
    });

  const transcript: { role: "user" | "assistant"; content: string }[] = [];
  const customerTurn = async () => {
    const r = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: PERSONA },
        ...transcript.map((m) => ({ role: m.role === "user" ? ("assistant" as const) : ("user" as const), content: m.content })),
      ],
    } as any);
    return (r.choices[0].message.content || "").trim();
  };

  for (let turn = 0; turn < 14; turn++) {
    const said = turn === 0 ? process.env.SIM_FIRST || "Preciso da segunda via da conta de água" : await customerTurn();
    if (said.includes("FIM")) break;
    console.log(`\nERIKA: ${said}`);
    transcript.push({ role: "user", content: said });

    const messages: any[] = [{ role: "system", content: system() }, ...transcript];
    let reply = "";
    for (let round = 0; round < 6; round++) {
      const c = await openai.chat.completions.create({
        model,
        messages,
        tools: toolDefinitions(false),
        tool_choice: "auto",
        reasoning_effort: process.env.OPENAI_REASONING_EFFORT || "none",
      } as any);
      const msg = c.choices[0].message;
      messages.push(msg);
      if (!msg.tool_calls?.length) {
        reply = collapseRepeatedReply((msg.content || "").trim());
        break;
      }
      for (const call of msg.tool_calls as any[]) {
        const args = JSON.parse(call.function.arguments || "{}");
        console.log(`  [ferramenta ${call.function.name}] ${JSON.stringify(args)}`);
        let result: any = { ok: true };
        if (["registrar_resumo_pedido", "descartar_resumo", "buscar_produtos"].includes(call.function.name)) {
          result = await executor.run(call.function.name, args);
          pending = stored.map((s) => ({ resumo_id: s.id, instrucao: s.instrucao, itens: s.itens }));
          if (result.erro) console.log(`  [recusado] ${result.erro}`);
        } else if (call.function.name === "consultar_horario_funcionamento") {
          result = {
            aberta_agora: false,
            fecha_hoje_as: null,
            proxima_abertura: "segunda-feira às 08:00",
            horario_semanal: "Segunda a sexta 08:00–18:00; sábado 08:00–12:00",
            excecoes_proximas: [],
          };
        } else if (call.function.name === "confirmar_pedidos") {
          result = { ok: true, pedidos_criados: [99] };
          reply = "(sistema) Pedido registrado. Número do pedido: *99*";
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      if (reply) break;
    }
    console.log(`FOFA AI: ${reply}`);
    transcript.push({ role: "assistant", content: reply });
    if (reply.startsWith("(sistema)")) break;
  }
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
