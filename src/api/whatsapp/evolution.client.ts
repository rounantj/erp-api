import { Injectable } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";
import { whatsappConfig } from "./whatsapp.config";

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "SEND_MESSAGE", "CONNECTION_UPDATE"];

// A Evolution é a mesma do dexd: todo método recusa instâncias fora do prefixo do ERP,
// para que nenhum bug aqui consiga desconectar ou alterar a instância do dexd.
@Injectable()
export class EvolutionClient {
  private readonly http: AxiosInstance = axios.create({
    baseURL: whatsappConfig.evolutionUrl,
    headers: { apikey: whatsappConfig.evolutionApiKey },
    timeout: 30_000,
  });

  instanceNameFor(companyId: number): string {
    return `${whatsappConfig.instancePrefix}${companyId}`;
  }

  private own(name: string): string {
    if (!name.startsWith(whatsappConfig.instancePrefix)) {
      throw new Error(`Instância fora do escopo do ERP: ${name}`);
    }
    return name;
  }

  private webhookConfig(companyId: number, token: string) {
    return {
      enabled: true,
      url: `${whatsappConfig.webhookBaseUrl}/whatsapp/webhook/${companyId}?token=${token}`,
      byEvents: false,
      base64: false,
      events: WEBHOOK_EVENTS,
    };
  }

  async instanceExists(name: string): Promise<boolean> {
    const { data } = await this.http
      .get("/instance/fetchInstances", { params: { instanceName: this.own(name) } })
      .catch((err) => {
        if (err.response?.status === 404) return { data: [] };
        throw err;
      });
    return Array.isArray(data) && data.some((i: any) => i?.name === name);
  }

  async countOwnInstances(): Promise<number> {
    const { data } = await this.http.get("/instance/fetchInstances");
    return (Array.isArray(data) ? data : []).filter((i: any) =>
      String(i?.name || "").startsWith(whatsappConfig.instancePrefix)
    ).length;
  }

  async ensureInstance(name: string, companyId: number, webhookToken: string): Promise<void> {
    this.own(name);
    if (!(await this.instanceExists(name))) {
      await this.http.post("/instance/create", {
        instanceName: name,
        integration: "WHATSAPP-BAILEYS",
        qrcode: false,
        groupsIgnore: true,
        rejectCall: false,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
        webhook: this.webhookConfig(companyId, webhookToken),
      });
    }
    if (whatsappConfig.jobsEnabled) await this.setWebhook(name, companyId, webhookToken);
  }

  async setWebhook(name: string, companyId: number, webhookToken: string): Promise<void> {
    await this.http.post(`/webhook/set/${this.own(name)}`, { webhook: this.webhookConfig(companyId, webhookToken) });
  }

  async connectionState(name: string): Promise<string> {
    const { data } = await this.http.get(`/instance/connectionState/${this.own(name)}`);
    return data?.instance?.state ?? "unknown";
  }

  async connect(name: string): Promise<{ base64?: string; pairingCode?: string }> {
    const { data } = await this.http.get(`/instance/connect/${this.own(name)}`);
    return data;
  }

  async instanceInfo(name: string): Promise<any> {
    const { data } = await this.http.get("/instance/fetchInstances", { params: { instanceName: this.own(name) } });
    return Array.isArray(data) ? data.find((i: any) => i?.name === name) : data;
  }

  async logout(name: string): Promise<void> {
    await this.http.delete(`/instance/logout/${this.own(name)}`);
  }

  async sendText(name: string, number: string, text: string): Promise<string> {
    const { data } = await this.http.post(`/message/sendText/${this.own(name)}`, { number, text }, { timeout: 25_000 });
    const id = data?.key?.id;
    if (!id) throw new Error(`Evolution não retornou key.id: ${JSON.stringify(data).slice(0, 300)}`);
    return id;
  }

  async sendImage(
    name: string,
    number: string,
    image: { base64: string; mimeType: string; caption: string; fileName: string }
  ): Promise<string> {
    const { data } = await this.http.post(
      `/message/sendMedia/${this.own(name)}`,
      { number, mediatype: "image", mimetype: image.mimeType, media: image.base64, caption: image.caption, fileName: image.fileName },
      { timeout: 60_000, maxBodyLength: 20 * 1024 * 1024 }
    );
    const id = data?.key?.id;
    if (!id) throw new Error(`Evolution não retornou key.id: ${JSON.stringify(data).slice(0, 300)}`);
    return id;
  }

  async getMediaBase64(name: string, messageId: string): Promise<{ base64: string; mimetype?: string; fileName?: string }> {
    const { data } = await this.http.post(
      `/chat/getBase64FromMediaMessage/${this.own(name)}`,
      { message: { key: { id: messageId } }, convertToMp4: false },
      { timeout: 60_000, maxContentLength: 200 * 1024 * 1024 }
    );
    if (!data?.base64) throw new Error("Evolution não retornou base64 da mídia");
    return data;
  }
}
