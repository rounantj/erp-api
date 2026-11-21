import OpenAI, { toFile } from "openai";
import { whatsappConfig } from "./whatsapp.config";

let client: OpenAI | null = null;

export function openai(): OpenAI {
  if (!whatsappConfig.openaiApiKey) throw new Error("OPENAI_API_KEY não configurada");
  client ??= new OpenAI({ apiKey: whatsappConfig.openaiApiKey, timeout: 60_000, maxRetries: 2 });
  return client;
}

export async function transcribeAudio(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const file = await toFile(buffer, fileName, { type: mimeType });
  const result = await openai().audio.transcriptions.create({
    file,
    model: whatsappConfig.openaiTranscribeModel,
    language: "pt",
  });
  return (result.text || "").trim();
}
