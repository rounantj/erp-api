import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Trocar FISCAL_ENCRYPTION_KEY (ou o JWT_SECRET, quando ela não existe) torna ilegíveis os certificados já salvos.
let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.FISCAL_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("Defina FISCAL_ENCRYPTION_KEY para guardar certificados digitais");
  cachedKey = scryptSync(secret, "erp-fiscal-v1", 32);
  return cachedKey;
}

export function encryptSecret(plain: Buffer | string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(typeof plain === "string" ? Buffer.from(plain, "utf8") : plain), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptSecret(box: string): Buffer {
  const [version, iv, tag, data] = String(box).split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Segredo fiscal em formato inválido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
}
