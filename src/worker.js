// La agenda en Cloudflare Workers (plan gratuito): guarda las cosas de cada persona
// y cada minuto mira si hay que avisar a alguien.
import { clavesVapid, enviarPush } from "./webpush.js";
import { partesLocales, localADate, fechaBonita, sumarDias } from "./tiempo.js";

const MIN = 60 * 1000;
const HORA_MANANA = "09:00";
const HORA_NOCHE = "20:00";

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS usuarios (uid TEXT PRIMARY KEY, zona TEXT NOT NULL DEFAULT 'Europe/Madrid',
     suscripcion TEXT, wa_tel TEXT, wa_clave TEXT, creado TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL,
     tipo TEXT NOT NULL, titulo TEXT NOT NULL, fecha TEXT, hora TEXT, hecho INTEGER NOT NULL DEFAULT 0,
     creado TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS avisos (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL,
     uid TEXT NOT NULL, cuando TEXT NOT NULL, enviado INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS avisos_pendientes ON avisos (enviado, cuando)`,
  `CREATE TABLE IF NOT EXISTS bandeja (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL,
     titulo TEXT NOT NULL, texto TEXT NOT NULL, creado TEXT NOT NULL DEFAULT (datetime('now')),
     entregado INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS diario (uid TEXT NOT NULL, fecha TEXT NOT NULL, tipo TEXT NOT NULL,
     PRIMARY KEY (uid, fecha, tipo))`,
];

let esquemaListo = false;
async function prepararBD(db) {
  if (esquemaListo) return;
  await db.batch(ESQUEMA.map((s) => db.prepare(s)));
  esquemaListo = true;
}

// ---------- Cuándo avisar ----------

export function planificarAvisos(item, zona, ahora = new Date()) {
  if (!item.fecha) return []; // sin fecha: sale en el resumen de la mañana y de la noche
  const avisos = [];
  if (!item.hora) {
    avisos.push(localADate(item.fecha, HORA_MANANA, zona));
  } else {
    const momento = localADate(item.fecha, item.hora, zona);
    const falta = momento - ahora;
    if (falta > 3 * 60 * MIN) avisos.push(new Date(momento - 60 * MIN));
    else if (falta > 20 * MIN) avisos.push(new Date(momento - 15 * MIN));
    else avisos.push(momento);
    if (item.tipo === "cita" && item.fecha > partesLocales(ahora, zona).fecha) {
      avisos.push(localADate(sumarDias(item.fecha, -1), HORA_NOCHE, zona)); // la tarde anterior
    }
  }
  return avisos.filter((a) => a > ahora);
}

function textoAviso(item, zona, ahora) {
  if (!item.hora) return { titulo: item.titulo, texto: "Es hoy." };
  const minutos = Math.round((localADate(item.fecha, item.hora, zona) - ahora) / MIN);
  if (minutos <= 1) return { titulo: item.titulo, texto: `Ahora (${item.hora})` };
  if (minutos < 120) return { titulo: item.titulo, texto: `En ${minutos} minutos, a las ${item.hora}` };
  const hoy = partesLocales(ahora, zona).fecha;
  const dia = item.fecha === hoy ? "Hoy" : item.fecha === sumarDias(hoy, 1) ? "Mañana" : fechaBonita(item.fecha);
  return { titulo: item.titulo, texto: `${dia} a las ${item.hora}` };
}

// ---------- Enviar un aviso a una persona ----------

async function notificar(env, usuario, titulo, texto) {
  await env.DB.prepare("INSERT INTO bandeja (uid, titulo, texto) VALUES (?, ?, ?)").bind(usuario.uid, titulo, texto).run();
  if (usuario.suscripcion) {
    const origen = (await env.DB.prepare("SELECT valor FROM config WHERE clave = 'origen'").first())?.valor;
    const estado = await enviarPush(JSON.parse(usuario.suscripcion), await clavesVapid(env.DB), origen || "mailto:agenda@example.org");
    if (estado === "caducada") await env.DB.prepare("UPDATE usuarios SET suscripcion = NULL WHERE uid = ?").bind(usuario.uid).run();
  }
  if (usuario.wa_tel && usuario.wa_clave) {
    // CallMeBot: servicio gratuito que manda un WhatsApp a tu propio número.
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(usuario.wa_tel)}` +
      `&text=${encodeURIComponent(`⏰ ${titulo}\n${texto}`)}&apikey=${encodeURIComponent(usuario.wa_clave)}`;
    await fetch(url).catch((e) => console.error("WhatsApp falló", e.message));
  }
}

// ---------- El reloj: se ejecuta cada minuto ----------

async function cadaMinuto(env) {
  await prepararBD(env.DB);
  const ahora = new Date();
  const db = env.DB;

  const { results: vencidos } = await db.prepare(
    `SELECT avisos.id AS aviso_id, items.*, usuarios.zona, usuarios.suscripcion, usuarios.wa_tel, usuarios.wa_clave
     FROM avisos JOIN items ON items.id = avisos.item_id JOIN usuarios ON usuarios.uid = avisos.uid
     WHERE avisos.enviado = 0 AND avisos.cuando <= ? AND items.hecho = 0`
  ).bind(ahora.toISOString()).all();
  for (const a of vencidos) {
    await db.prepare("UPDATE avisos SET enviado = 1 WHERE id = ?").bind(a.aviso_id).run();
    const { titulo, texto } = textoAviso(a, a.zona, ahora);
    await notificar(env, a, `⏰ ${titulo}`, texto).catch((e) => console.error("Aviso falló", e));
  }

  // Resumen de la mañana y repaso de la noche, una vez al día por persona.
  const { results: usuarios } = await db.prepare(
    "SELECT * FROM usuarios WHERE suscripcion IS NOT NULL OR wa_clave IS NOT NULL").all();
  for (const u of usuarios) {
    const { fecha: hoy, hora } = partesLocales(ahora, u.zona);
    const tipo = hora >= HORA_MANANA && hora < "10:00" ? "manana" : hora >= HORA_NOCHE && hora < "21:00" ? "noche" : null;
    if (!tipo) continue;
    const reservado = await db.prepare("INSERT OR IGNORE INTO diario (uid, fecha, tipo) VALUES (?, ?, ?)").bind(u.uid, hoy, tipo).run();
    if (!reservado.meta.changes) continue;

    const { results: items } = await db.prepare(
      "SELECT * FROM items WHERE uid = ? AND hecho = 0 AND (fecha IS NULL OR fecha <= ?) ORDER BY hora IS NULL, hora").bind(u.uid, hoy).all();
    const deHoy = items.filter((i) => i.fecha === hoy);
    const tareas = items.filter((i) => i.tipo === "tarea" && i.fecha !== hoy);
    const nombres = (lista) => lista.slice(0, 4).map((i) => (i.hora ? `${i.hora} ${i.titulo}` : i.titulo)).join(" · ") +
      (lista.length > 4 ? ` y ${lista.length - 4} más` : "");

    if (tipo === "manana") {
      if (deHoy.length) await notificar(env, u, "☀️ Hoy tienes", nombres(deHoy) + (tareas.length ? `\nPendiente: ${nombres(tareas)}` : ""));
      else if (tareas.length) await notificar(env, u, "☀️ Nada apuntado para hoy", `Te queda pendiente: ${nombres(tareas)}`);
      else await notificar(env, u, "☀️ No tienes nada para hoy", "¿Quieres apuntar algo? Abre la agenda y díselo.");
    } else {
      const sinHacer = items.filter((i) => i.tipo === "tarea");
      if (sinHacer.length) await notificar(env, u, "🌙 ¿Lo has hecho?", `${nombres(sinHacer)}\nMárcalo en la agenda cuando esté.`);
    }
  }

  // Limpieza de madrugada (hora UTC): avisos entregados y cosas hechas hace tiempo.
  if (ahora.getUTCHours() === 3 && ahora.getUTCMinutes() === 0) {
    await db.batch([
      db.prepare("DELETE FROM bandeja WHERE entregado = 1 OR creado < datetime('now', '-7 days')"),
      db.prepare("DELETE FROM avisos WHERE enviado = 1"),
      db.prepare("DELETE FROM items WHERE hecho = 1 AND creado < datetime('now', '-30 days')"),
      db.prepare("DELETE FROM diario WHERE fecha < date('now', '-3 days')"),
    ]);
  }
}

// ---------- API para la app ----------

const json = (datos, estado = 200) => new Response(JSON.stringify(datos), {
  status: estado, headers: { "Content-Type": "application/json; charset=utf-8" },
});
const UID_VALIDO = /^[a-z0-9]{24,64}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

async function api(request, env, url) {
  const db = env.DB;
  const ruta = url.pathname.replace(/^\/api/, "");
  const metodo = request.method;
  const cuerpo = metodo === "GET" || metodo === "DELETE" ? {} : await request.json().catch(() => ({}));
  const uid = cuerpo.uid || url.searchParams.get("uid");

  if (ruta === "/vapid") return json({ clave: (await clavesVapid(db)).publica });
  if (!UID_VALIDO.test(uid || "")) return json({ error: "uid no válido" }, 400);

  const usuario = await db.prepare("SELECT * FROM usuarios WHERE uid = ?").bind(uid).first();
  const zona = usuario?.zona || "Europe/Madrid";

  if (ruta === "/usuario" && metodo === "POST") {
    const zonaNueva = typeof cuerpo.zona === "string" && cuerpo.zona.length < 64 ? cuerpo.zona : zona;
    await db.prepare("INSERT OR IGNORE INTO usuarios (uid, zona) VALUES (?, ?)").bind(uid, zonaNueva).run();
    await db.prepare("UPDATE usuarios SET zona = ? WHERE uid = ?").bind(zonaNueva, uid).run();
    if ("suscripcion" in cuerpo) {
      await db.prepare("UPDATE usuarios SET suscripcion = ? WHERE uid = ?")
        .bind(cuerpo.suscripcion ? JSON.stringify(cuerpo.suscripcion) : null, uid).run();
    }
    if ("whatsapp" in cuerpo) {
      const tel = String(cuerpo.whatsapp?.telefono || "").replace(/[^\d+]/g, "") || null;
      const clave = String(cuerpo.whatsapp?.clave || "").trim() || null;
      await db.prepare("UPDATE usuarios SET wa_tel = ?, wa_clave = ? WHERE uid = ?").bind(tel, clave, uid).run();
    }
    await db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES ('origen', ?)").bind(url.origin).run();
    const u = await db.prepare("SELECT suscripcion IS NOT NULL AS push, wa_tel FROM usuarios WHERE uid = ?").bind(uid).first();
    return json({ push: !!u.push, whatsapp: u.wa_tel });
  }

  if (!usuario) return json({ error: "Usuario desconocido" }, 404);

  if (ruta === "/items" && metodo === "GET") {
    const { results } = await db.prepare(
      `SELECT id, tipo, titulo, fecha, hora, hecho FROM items WHERE uid = ?
       AND (hecho = 0 OR creado > datetime('now', '-2 days')) ORDER BY fecha IS NULL, fecha, hora IS NULL, hora`
    ).bind(uid).all();
    return json(results);
  }

  if (ruta === "/items" && metodo === "POST") {
    const item = {
      tipo: cuerpo.tipo === "tarea" ? "tarea" : "cita",
      titulo: String(cuerpo.titulo || "").trim().slice(0, 200) || "Recordatorio",
      fecha: FECHA.test(cuerpo.fecha || "") ? cuerpo.fecha : null,
      hora: HORA.test(cuerpo.hora || "") && FECHA.test(cuerpo.fecha || "") ? cuerpo.hora : null,
    };
    const r = await db.prepare("INSERT INTO items (uid, tipo, titulo, fecha, hora) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .bind(uid, item.tipo, item.titulo, item.fecha, item.hora).first();
    const avisos = planificarAvisos(item, zona);
    if (avisos.length) {
      await db.batch(avisos.map((a) => db.prepare("INSERT INTO avisos (item_id, uid, cuando) VALUES (?, ?, ?)")
        .bind(r.id, uid, a.toISOString())));
    }
    return json({ id: r.id, ...item, hecho: 0, avisos: avisos.map((a) => a.toISOString()) });
  }

  const m = ruta.match(/^\/items\/(\d+)$/);
  if (m && metodo === "PATCH") {
    await db.prepare("UPDATE items SET hecho = ? WHERE id = ? AND uid = ?").bind(cuerpo.hecho ? 1 : 0, m[1], uid).run();
    return json({ ok: true });
  }
  if (m && metodo === "DELETE") {
    await db.batch([
      db.prepare("DELETE FROM avisos WHERE item_id = ? AND uid = ?").bind(m[1], uid),
      db.prepare("DELETE FROM items WHERE id = ? AND uid = ?").bind(m[1], uid),
    ]);
    return json({ ok: true });
  }

  // El móvil recoge aquí el texto de los avisos que le acaban de llegar.
  if (ruta === "/bandeja") {
    const { results } = await db.prepare(
      "UPDATE bandeja SET entregado = 1 WHERE uid = ? AND entregado = 0 RETURNING id, titulo, texto").bind(uid).all();
    return json(results);
  }

  if (ruta === "/probar" && metodo === "POST") {
    await notificar(env, usuario, "🔔 Aviso de prueba", "¡Funciona! Así te llegarán los recordatorios.");
    return json({ ok: true });
  }

  return json({ error: "No encontrado" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      await prepararBD(env.DB);
      try {
        return await api(request, env, url);
      } catch (e) {
        console.error(e);
        return json({ error: "Error interno" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_evento, env, ctx) {
    ctx.waitUntil(cadaMinuto(env));
  },
};
