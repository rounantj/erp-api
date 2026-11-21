export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'other' | 'ignored';

export interface ParsedMessage {
  providerMessageId: string;
  fromMe: boolean;
  chatJid: string;
  phone: string;
  pushName: string | null;
  type: MessageType;
  text: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  timestamp: Date;
}

const IGNORED_JID = /@g\.us$|@broadcast$|@newsletter$|^status@/;

function unwrap(message: any): any {
  if (!message) return {};
  if (message.ephemeralMessage?.message) return unwrap(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return unwrap(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return unwrap(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage?.message) return unwrap(message.documentWithCaptionMessage.message);
  return message;
}

export function parseEvolutionMessage(data: any): ParsedMessage | null {
  const key = data?.key;
  if (!key?.id || !key?.remoteJid) return null;
  const remoteJid: string = key.remoteJid;
  if (IGNORED_JID.test(remoteJid)) return null;

  // Com o endereçamento LID, o telefone real vem em remoteJidAlt/senderPn.
  let chatJid = remoteJid;
  if (remoteJid.endsWith('@lid')) {
    const alt = key.remoteJidAlt || key.senderPn || data.senderPn;
    if (alt && String(alt).includes('@s.whatsapp.net')) chatJid = alt;
  }
  const phone = chatJid.split('@')[0].split(':')[0].replace(/\D/g, '');

  const m = unwrap(data.message);
  let type: MessageType = 'other';
  let text: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;
  let fileSize: number | null = null;

  if (m.conversation || m.extendedTextMessage) {
    type = 'text';
    text = m.conversation || m.extendedTextMessage?.text || '';
  } else if (m.imageMessage) {
    type = 'image';
    text = m.imageMessage.caption || null;
    mimeType = m.imageMessage.mimetype || 'image/jpeg';
    fileSize = Number(m.imageMessage.fileLength) || null;
  } else if (m.documentMessage) {
    type = 'document';
    text = m.documentMessage.caption || null;
    fileName = m.documentMessage.fileName || m.documentMessage.title || null;
    mimeType = m.documentMessage.mimetype || null;
    fileSize = Number(m.documentMessage.fileLength) || null;
  } else if (m.audioMessage) {
    type = 'audio';
    mimeType = m.audioMessage.mimetype || 'audio/ogg';
    fileSize = Number(m.audioMessage.fileLength) || null;
  } else if (m.videoMessage) {
    type = 'video';
    text = m.videoMessage.caption || null;
    mimeType = m.videoMessage.mimetype || 'video/mp4';
    fileSize = Number(m.videoMessage.fileLength) || null;
  } else if (m.stickerMessage) {
    type = 'sticker';
  } else if (m.reactionMessage || m.protocolMessage || m.senderKeyDistributionMessage || m.messageContextInfo && Object.keys(m).length === 1) {
    type = 'ignored';
  }

  const ts = Number(data.messageTimestamp);
  return {
    providerMessageId: key.id,
    fromMe: Boolean(key.fromMe),
    chatJid,
    phone,
    pushName: data.pushName || null,
    type,
    text,
    fileName,
    mimeType,
    fileSize,
    timestamp: ts ? new Date(ts * 1000) : new Date(),
  };
}

export const MEDIA_TYPES: MessageType[] = ['image', 'document', 'audio', 'video'];
