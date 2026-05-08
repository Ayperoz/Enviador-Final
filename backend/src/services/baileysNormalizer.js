// backend/src/services/baileysNormalizer.js

/**
 * Normaliza Baileys messages.upsert a:
 *  { de, para, canal, mensaje, message_id }
 * Filtros: fromMe, status/broadcast, grupos *@g.us, CALENTADOR.
 * Limpia JIDs -> solo número.
 */
export function normalizeUpsertToEntrantes({ sock, channelName, upsert }) {
  const out = [];
  const calentadorJid = process.env.CALENTADOR
    ? `${process.env.CALENTADOR}@s.whatsapp.net`
    : null;

  if (!upsert?.messages?.length) return out;

  for (const m of upsert.messages) {
    // 1) Filtros básicos
    if (m?.key?.fromMe) continue;

    const remoteJid = m?.key?.remoteJid || "";
    if (!remoteJid) continue;
    if (remoteJid === "status@broadcast") continue;
    if (remoteJid.endsWith("@status")) continue;
    if (remoteJid.includes("broadcast")) continue;
    if (remoteJid.endsWith("@g.us")) continue;               // ⛔ grupos
    if (calentadorJid && remoteJid === calentadorJid) continue; // ⛔ calentador

    // 2) ID único del mensaje
    const message_id = m?.key?.id || null;
    if (!message_id) continue;

    // 3) JIDs limpios (solo números)
    const de = jidToNumber(remoteJid);
    const para = jidToNumber(sock?.user?.id) || "";

    const canal = channelName || (sock?.user?.id ?? "desconocido");

    // 4) Texto (idéntico al enfoque de tu otro proyecto)
    const mensaje = getTextFromMessageLikeYourProject(m);

    out.push({ de, para, canal, mensaje, message_id });
  }

  return out;
}

/** Igual que en tu proyecto: lee desde msg.message y variantes simples. */
/** Igual que en tu proyecto, pero con tus reglas:
 *  - multimedia => "Mensaje: <tipo>"
 *  - contactos => vCard completa
 *  - texto => cuerpo tal cual
 */
function getTextFromMessageLikeYourProject(msg) {
  // desenvolver efímeros / view-once / documentWithCaption si existiera
  const root = msg?.message || {};
  const unwrapped =
    root?.ephemeralMessage?.message ??
    root?.viewOnceMessageV2?.message ??
    root?.viewOnceMessage?.message ??
    root?.documentWithCaptionMessage?.message ??
    root;

  if (!unwrapped) return "[mensaje entrante]";

  // 1) Contactos (EXCEPCIÓN: guardar vCard completa / múltiples vCards)
  if (unwrapped.contactMessage?.vcard) {
    return unwrapped.contactMessage.vcard;
  }
  if (unwrapped.contactsArrayMessage?.contacts?.length) {
    const vcards = unwrapped.contactsArrayMessage.contacts
      .map(c => c?.vcard)
      .filter(Boolean);
    if (vcards.length) return vcards.join('\n\n');
    const names = unwrapped.contactsArrayMessage.contacts
      .map(c => c?.displayName)
      .filter(Boolean);
    if (names.length) return names.join(', ');
    return "Mensaje: contacto";
  }

  // 2) Texto “puro” (guardar tal cual)
  if (unwrapped.conversation) return unwrapped.conversation;
  if (unwrapped.extendedTextMessage?.text) return unwrapped.extendedTextMessage.text;

  // 3) Interactivos / plantillas / listas / botones (si traen texto)
  const im = unwrapped.interactiveMessage;
  if (im?.body?.text) return im.body.text;
  if (im?.footer?.text) return im.footer.text;

  if (unwrapped.buttonsMessage?.contentText) return unwrapped.buttonsMessage.contentText;

  const hydrated = unwrapped.templateMessage?.hydratedTemplate;
  if (hydrated?.hydratedContentText) return hydrated.hydratedContentText;

  const listMsg = unwrapped.listMessage;
  if (listMsg?.description) return listMsg.description;
  if (listMsg?.title) return listMsg.title;

  // 4) MULTIMEDIA → SIEMPRE etiqueta "Mensaje: <tipo>" (ignora captions)
  if (unwrapped.imageMessage) return "Mensaje entrante tipo: imagen";
  if (unwrapped.videoMessage) return "Mensaje entrante tipo: video";
  if (unwrapped.audioMessage) return "Mensaje entrante tipo: audio";
  if (unwrapped.documentMessage) return "Mensaje entrante tipo: documento";
  if (unwrapped.stickerMessage) return "Mensaje entrante tipo: sticker";

  // Otros tipos útiles
  // === Ubicación estática o en vivo ===
  if (unwrapped.locationMessage) {
    const loc = unwrapped.locationMessage;
    const lat = loc.degreesLatitude?.toFixed(6);
    const lng = loc.degreesLongitude?.toFixed(6);
    const name = loc.name ? ` - ${loc.name}` : "";
    const address = loc.address ? `, ${loc.address}` : "";
    return `Mensaje: ubicación (lat: ${lat}, lng: ${lng}${name}${address})`;
  }

  if (unwrapped.liveLocationMessage) {
    const loc = unwrapped.liveLocationMessage;
    const lat = loc.degreesLatitude?.toFixed(6);
    const lng = loc.degreesLongitude?.toFixed(6);
    const name = loc.caption ? ` - ${loc.caption}` : "";
    return `Mensaje: ubicación en vivo (lat: ${lat}, lng: ${lng}${name})`;
  }

  if (unwrapped.reactionMessage?.text) return `Mensaje entrante tipo: reacción (${unwrapped.reactionMessage.text})`;

  // 5) Fallback agresivo por si algún cliente raro mete el texto en otra key
  const fallback = findFirstMeaningfulString(unwrapped);
  if (fallback) return fallback;

  return "[mensaje entrante]";
}


// ===== helpers =====

/** "5491149745683:49@s.whatsapp.net" -> "5491149745683" */
function jidToNumber(jid = "") {
  const beforeAt = String(jid).split("@")[0] || "";
  const beforeColon = beforeAt.split(":")[0] || beforeAt;
  return beforeColon.replace(/[^0-9]/g, "");
}

/** Busca recursivamente una string legible en el objeto (evita thumbnails/binarios). */
function findFirstMeaningfulString(obj, depth = 0) {
  if (!obj || depth > 5) return null;

  if (typeof obj === "string") {
    const s = obj.trim();
    if (s && /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/.test(s) && s.length <= 1000) return s;
    return null;
  }

  if (Array.isArray(obj)) {
    for (const it of obj) {
      const v = findFirstMeaningfulString(it, depth + 1);
      if (v) return v;
    }
    return null;
  }

  if (typeof obj === "object") {
    const skip = /thumbnail|jpeg|png|gif|webp|media|fileSha256|fileEncSha256/i;
    const PREFERRED = ["text", "contentText", "caption", "title", "body", "description", "message", "name"];

    // primero claves preferidas
    for (const k of PREFERRED) {
      if (obj[k] !== undefined) {
        const v = findFirstMeaningfulString(obj[k], depth + 1);
        if (v) return v;
      }
    }
    // luego el resto (saltando binarios)
    for (const k of Object.keys(obj)) {
      if (PREFERRED.includes(k) || skip.test(k)) continue;
      const v = findFirstMeaningfulString(obj[k], depth + 1);
      if (v) return v;
    }
  }

  return null;
}
