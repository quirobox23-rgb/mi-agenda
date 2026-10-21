// Notificaciones push al móvil (estándar Web Push con claves VAPID), sin servicios de pago.
// El aviso se manda "vacío": el móvil se despierta y pide el texto a la agenda.

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const textoB64url = (s) => b64url(new TextEncoder().encode(s));

// Las claves se crean solas la primera vez y se guardan en la base de datos.
export async function clavesVapid(db) {
  const fila = await db.prepare("SELECT valor FROM config WHERE clave = 'vapid'").first();
  if (fila) return JSON.parse(fila.valor);
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const privada = await crypto.subtle.exportKey("jwk", par.privateKey);
  const publica = b64url(await crypto.subtle.exportKey("raw", par.publicKey));
  const claves = { privada, publica };
  await db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES ('vapid', ?)").bind(JSON.stringify(claves)).run();
  // Si dos peticiones las crearon a la vez, nos quedamos con la que se guardó.
  return JSON.parse((await db.prepare("SELECT valor FROM config WHERE clave = 'vapid'").first()).valor);
}

async function firmaVapid(endpoint, claves, contacto) {
  const aud = new URL(endpoint).origin;
  const cabecera = textoB64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const datos = textoB64url(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contacto }));
  const llave = await crypto.subtle.importKey("jwk", claves.privada, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, llave, new TextEncoder().encode(`${cabecera}.${datos}`));
  return `vapid t=${cabecera}.${datos}.${b64url(firma)}, k=${claves.publica}`;
}

// Devuelve "ok", "caducada" (el móvil ya no acepta avisos) o "error <código> <detalle>".
export async function enviarPush(suscripcion, claves, contacto) {
  const r = await fetch(suscripcion.endpoint, {
    method: "POST",
    headers: {
      Authorization: await firmaVapid(suscripcion.endpoint, claves, contacto),
      TTL: "86400",
      Urgency: "high",
    },
    body: new Uint8Array(0),
  });
  if (r.status === 404 || r.status === 410) return "caducada";
  if (!r.ok) {
    const detalle = (await r.text()).slice(0, 150);
    console.error("Push rechazado", r.status, detalle);
    return `error ${r.status} ${detalle}`;
  }
  return "ok";
}
