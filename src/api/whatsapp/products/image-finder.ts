import axios from 'axios';
import { promises as dns } from 'dns';
import { isIP } from 'net';
import { openai } from '../openai.client';
import { whatsappConfig } from '../whatsapp.config';

export interface ProductForImage {
  id: number;
  descricao: string;
  ean: string | null;
  ncm: string | null;
}

export interface FoundImage {
  buffer: Buffer;
  mimeType: string;
  imageUrl: string;
  pageUrl: string | null;
  confidence: number;
  reason: string;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_PAGES = 6;
const MAX_CANDIDATES = 8;
const MIN_IMAGE_BYTES = 4 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_CONFIDENCE = 0.6;
const IGNORED_IMAGE = /logo|icon|sprite|flag|banner|placeholder|loading|selo|badge|avatar|payment|pagamento|bandeira|whatsapp|facebook|instagram|\.svg|\.gif/i;

function isValidGtin(ean: string | null): ean is string {
  return !!ean && /^\d{8,14}$/.test(ean);
}

function isPrivateAddress(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// Os URLs vêm da internet: bloqueia destinos internos (rede do Docker, metadata da nuvem etc.).
async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocolo não permitido');
  const host = url.hostname;
  const addresses = isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('destino interno bloqueado');
  return url;
}

async function searchProductPages(product: ProductForImage): Promise<string[]> {
  const identifiers = [
    `"${product.descricao.trim()}"`,
    isValidGtin(product.ean) ? `EAN/GTIN ${product.ean}` : null,
    product.ncm && product.ncm !== '-' ? `NCM ${product.ncm}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const response = await openai().responses.create({
    model: whatsappConfig.openaiModel,
    tools: [{ type: 'web_search' } as any],
    input: `Encontre páginas de lojas online ou do fabricante que mostrem a foto deste produto vendido em papelarias no Brasil: ${identifiers}.
Priorize páginas que citem o mesmo EAN. Se não houver o produto exato, aceite o mais parecido (mesma marca, tipo e tamanho).
Responda SOMENTE JSON: {"paginas":[{"page_url":"...","titulo":"..."}]} com até ${MAX_PAGES} páginas de produto (não páginas de busca ou categoria).`,
  });
  const text = response.output_text || '';
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    const parsed = JSON.parse(json);
    return (parsed.paginas || [])
      .map((p: any) => String(p.page_url || ''))
      .filter((u: string) => /^https?:\/\//.test(u))
      .slice(0, MAX_PAGES);
  } catch {
    return [];
  }
}

function absolutize(src: string, base: URL): string | null {
  try {
    return new URL(src.replace(/&amp;/g, '&'), base).toString();
  } catch {
    return null;
  }
}

function extractImageCandidates(html: string, pageUrl: URL): string[] {
  const found: string[] = [];
  const push = (src?: string | null) => {
    if (!src) return;
    const abs = absolutize(src.trim(), pageUrl);
    if (abs && !IGNORED_IMAGE.test(abs) && !found.includes(abs)) found.push(abs);
  };

  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi)) {
    push(m[0].match(/content=["']([^"']+)["']/i)?.[1]);
  }
  for (const m of html.matchAll(/"image"\s*:\s*(\[[^\]]*\]|"[^"]+"|\{[^}]*\})/gi)) {
    for (const u of m[1].matchAll(/"(https?:[^"]+)"/g)) push(u[1].replace(/\\\//g, '/'));
  }
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0];
    const width = Number(tag.match(/width=["']?(\d+)/i)?.[1] || 0);
    if (width && width < 150) continue;
    push(tag.match(/(?:data-zoom-image|data-large|data-src|src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i)?.[1]);
  }
  return found.slice(0, 4);
}

async function fetchPageCandidates(pageUrl: string): Promise<{ imageUrl: string; pageUrl: string }[]> {
  try {
    const url = await assertPublicUrl(pageUrl);
    const { data } = await axios.get(url.toString(), {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
      timeout: 10_000,
      maxContentLength: 4 * 1024 * 1024,
      maxRedirects: 3,
      responseType: 'text',
    });
    return extractImageCandidates(String(data), url).map((imageUrl) => ({ imageUrl, pageUrl }));
  } catch {
    return [];
  }
}

export async function downloadImage(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const url = await assertPublicUrl(imageUrl);
    const res = await axios.get(url.toString(), {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' },
      timeout: 10_000,
      maxContentLength: MAX_IMAGE_BYTES,
      maxRedirects: 3,
      responseType: 'arraybuffer',
    });
    const mimeType = String(res.headers['content-type'] || '').split(';')[0].trim();
    const buffer = Buffer.from(res.data);
    if (!/^image\/(jpeg|png|webp)$/.test(mimeType) || buffer.length < MIN_IMAGE_BYTES) return null;
    return { buffer, mimeType };
  } catch {
    return null;
  }
}

async function pickBestImage(
  product: ProductForImage,
  images: { buffer: Buffer; mimeType: string; imageUrl: string; pageUrl: string }[],
): Promise<{ index: number; confidence: number; reason: string }> {
  const completion = await openai().chat.completions.create({
    model: whatsappConfig.openaiModel,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Produto do catálogo de uma papelaria: "${product.descricao}"${isValidGtin(product.ean) ? ` (EAN ${product.ean})` : ''}.
Abaixo há ${images.length} imagens candidatas, numeradas de 0 a ${images.length - 1} na ordem enviada.
Escolha a que melhor mostra ESTE produto (mesmo tipo, marca/modelo, cor e tamanho quando informados) como foto de produto para catálogo.
Rejeite logos, banners, imagens com várias coisas diferentes, imagens genéricas ou de outro produto.
Responda JSON: {"melhor": índice ou -1 se nenhuma serve, "confianca": número de 0 a 1, "motivo": "curto"}.`,
          },
          ...images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${img.mimeType};base64,${img.buffer.toString('base64')}`, detail: 'low' as const },
          })),
        ],
      },
    ],
  } as any);
  const parsed = JSON.parse(completion.choices[0].message.content || '{}');
  return { index: Number(parsed.melhor ?? -1), confidence: Number(parsed.confianca ?? 0), reason: String(parsed.motivo || '') };
}

export async function findProductImage(product: ProductForImage): Promise<FoundImage | { notFound: true; reason: string }> {
  const pages = await searchProductPages(product);
  if (!pages.length) return { notFound: true, reason: 'Busca na internet não encontrou páginas do produto.' };

  const candidates = (await Promise.all(pages.map(fetchPageCandidates))).flat();
  const unique = candidates.filter((c, i) => candidates.findIndex((o) => o.imageUrl === c.imageUrl) === i);
  const downloaded = (
    await Promise.all(
      unique.slice(0, MAX_CANDIDATES * 2).map(async (c) => {
        const img = await downloadImage(c.imageUrl);
        return img ? { ...img, ...c } : null;
      }),
    )
  )
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, MAX_CANDIDATES);
  if (!downloaded.length) return { notFound: true, reason: `Nenhuma imagem baixável nas ${pages.length} páginas encontradas.` };

  const choice = await pickBestImage(product, downloaded);
  const best = downloaded[choice.index];
  if (!best || choice.confidence < MIN_CONFIDENCE) {
    return { notFound: true, reason: `Nenhuma imagem confiável (${choice.confidence.toFixed(2)}): ${choice.reason}` };
  }
  return {
    buffer: best.buffer,
    mimeType: best.mimeType,
    imageUrl: best.imageUrl,
    pageUrl: best.pageUrl,
    confidence: choice.confidence,
    reason: choice.reason,
  };
}
