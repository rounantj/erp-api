export const whatsappConfig = {
  evolutionUrl: (process.env.EVOLUTION_API_URL || "").replace(/\/$/, ""),
  evolutionApiKey: process.env.EVOLUTION_API_KEY || "",
  // A Evolution é compartilhada com o dexd: o ERP só cria e mexe em instâncias com este prefixo.
  instancePrefix: "erp-c",
  maxInstances: Number(process.env.WHATSAPP_MAX_INSTANCES || 3),
  webhookBaseUrl: (process.env.WHATSAPP_WEBHOOK_BASE_URL || "").replace(/\/$/, ""),
  jobsEnabled: process.env.WHATSAPP_JOBS_ENABLED === "true",
  jobConcurrency: Number(process.env.WHATSAPP_JOB_CONCURRENCY || 3),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.4-mini",
  // gpt-5.4-mini no /v1/chat/completions só aceita ferramentas com reasoning_effort "none".
  openaiReasoningEffort: process.env.OPENAI_REASONING_EFFORT || "none",
  openaiTranscribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
  maxFileBytes: Number(process.env.WHATSAPP_MAX_FILE_MB || 25) * 1024 * 1024,
};

export const WHATSAPP_FEATURE = "whatsapp_atendimento";
