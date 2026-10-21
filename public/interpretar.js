// Convierte una frase en español o en catalán ("cita médico mañana a las 10",
// "cita metge demà a les 10") en una cita o tarea.
// Funciona sin internet y sin servicios de pago: son reglas sencillas.

const NUMEROS = {
  // español
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20,
  veinticinco: 25, treinta: 30, cuarenta: 40, media: 0.5,
  // catalán
  dues: 2, quatre: 4, cinc: 5, sis: 6, set: 7, vuit: 8, nou: 9, deu: 10, onze: 11, dotze: 12,
  tretze: 13, catorze: 14, quinze: 15, vint: 20, "vint-i-cinc": 25, trenta: 30, quaranta: 40, mitja: 0.5,
};
const NUM = `(\\d{1,2}|${Object.keys(NUMEROS).sort((a, b) => b.length - a.length).join("|")})`;
const DIAS = [
  ["domingo", "diumenge"], ["lunes", "dilluns"], ["martes", "dimarts"], ["miercoles", "dimecres"],
  ["jueves", "dijous"], ["viernes", "divendres"], ["sabado", "dissabte"],
];
const MESES = [
  ["enero", "gener"], ["febrero", "febrer"], ["marzo", "marc"], ["abril"], ["mayo", "maig"], ["junio", "juny"],
  ["julio", "juliol"], ["agosto", "agost"], ["septiembre", "setiembre", "setembre"], ["octubre"],
  ["noviembre", "novembre"], ["diciembre", "desembre"],
];
const indice = (lista, palabra) => lista.findIndex((nombres) => nombres.includes(palabra));
const PALABRAS_CITA = /\b(cita|reunio|reunion|medico|medica|metge|metgessa|dentista|doctor|doctora|taller|clase|classe|consulta|cumple\w*|aniversari|cena|sopar|comida|dinar|almuerzo|quedada|quedar|entrevista|vuelo|vol|tren|autobus|revision|revisio|analisis|analitica|peluqueria|perruqueria|fisio\w*|misa|missa|partido|partit|ensayo|assaig|curso|curs|evento|boda|casament|visita)\b/;

const num = (s) => (/^\d+$/.test(s) ? Number(s) : NUMEROS[s]);
const dosCifras = (n) => String(n).padStart(2, "0");
const isoFecha = (d) => `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;
const isoHora = (h, m) => `${dosCifras(h)}:${dosCifras(m)}`;
const masDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Quita tildes sin cambiar la longitud, para que las posiciones sigan valiendo en el texto original.
const normalizar = (s) => [...s].map((c) => (c === "’" ? "'" : c.normalize("NFD")[0].toLowerCase())).join("");

export function interpretar(frase, ahora = new Date()) {
  const original = frase.trim().replace(/\s+/g, " ").replace(/[.!¡¿?]+$/g, "");
  let t = normalizar(original);
  const quitar = []; // trozos de la frase que son fecha u hora, para dejar solo el título
  const buscar = (re) => {
    const m = re.exec(t);
    if (m) {
      quitar.push([m.index, m.index + m[0].length]);
      t = t.slice(0, m.index) + " ".repeat(m[0].length) + t.slice(m.index + m[0].length);
    }
    return m;
  };

  let fecha = null; // Date (solo día)
  let hora = null; // [h, m]
  let franja = null; // manana | mediodia | tarde | noche

  // "en 1 hora", "dentro de 20 minutos", "en media hora", "d'aquí a una hora", "en 3 días", "d'aquí a 2 dies"
  const DENTRO = `(?:en|dentro de|d'aqui a|d'aqui|dins de|dins d')`;
  let m = buscar(new RegExp(`\\b${DENTRO}\\s*(?:unos?\\s+|unas?\\s+|uns\\s+|unes\\s+)?(?:(media|mitja) hora|${NUM}\\s*(minutos?|minuts?|mins?|horas?|hores|h|dias?|dies|semanas?|setmanes|setmana)(\\s+(?:y|i)\\s+(?:media|mitja))?)\\b`));
  if (m) {
    if (m[1]) {
      const d = new Date(ahora.getTime() + 30 * 60000);
      fecha = d; hora = [d.getHours(), d.getMinutes()];
    } else {
      const n = num(m[2]) + (m[4] ? 0.5 : 0);
      const unidad = m[3];
      if (/^di/.test(unidad)) fecha = masDias(ahora, n);
      else if (/^s/.test(unidad)) fecha = masDias(ahora, n * 7);
      else {
        const minutos = /^h/.test(unidad) ? n * 60 : n;
        const d = new Date(ahora.getTime() + minutos * 60000);
        fecha = d; hora = [d.getHours(), d.getMinutes()];
      }
    }
  }

  // Franja del día: "por la tarde", "esta noche", "a mediodía", "al matí", "aquesta tarda", "al vespre"
  m = buscar(/\b(?:por la|de la|esta|a la|en la|per la|aquesta)\s+(manana|tarde|noche|tarda|nit)\b|\b(?:al|del|pel|aquest)\s+(mati|vespre)\b|\b(?:a |al )?(mediodia|migdia)\b/);
  if (m) {
    const palabra = m[1] || m[2] || m[3];
    franja = { manana: "manana", mati: "manana", tarde: "tarde", tarda: "tarde", vespre: "noche",
      noche: "noche", nit: "noche", mediodia: "mediodia", migdia: "mediodia" }[palabra];
    if (/^(esta|aquesta|aquest) /.test(m[0]) && !fecha) fecha = ahora;
  }

  // Día: "hoy", "mañana", "pasado mañana", "avui", "demà", "demà passat"
  if (!fecha) {
    m = buscar(/\b(?:pasado manana|dema passat|passat dema)\b/);
    if (m) fecha = masDias(ahora, 2);
  }
  if (!fecha) {
    m = buscar(/\b(?:para |de |per )?(?:hoy|avui)\b/);
    if (m) fecha = ahora;
  }
  if (!fecha) {
    m = buscar(/\b(?:para |per )?(?:manana|dema)\b/);
    if (m) fecha = masDias(ahora, 1);
  }

  // "el 5 de noviembre", "el 3 d'abril", "el día 12", "12/11"
  if (!fecha) {
    const nombres = MESES.flat().join("|");
    m = buscar(new RegExp(`\\b(?:el\\s+)?(?:dia\\s+)?(\\d{1,2})\\s+(?:de\\s+|d')(${nombres})\\b`));
    if (m) {
      const d = new Date(ahora.getFullYear(), indice(MESES, m[2]), Number(m[1]));
      fecha = d < masDias(ahora, 0) ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d;
    }
  }
  if (!fecha) {
    m = buscar(/\b(?:el\s+)?(?:dia\s+)?(\d{1,2})\/(\d{1,2})\b/);
    if (m) {
      const d = new Date(ahora.getFullYear(), Number(m[2]) - 1, Number(m[1]));
      fecha = d < masDias(ahora, 0) ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d;
    }
  }
  if (!fecha) {
    m = buscar(/\bel\s+(?:dia\s+)?(\d{1,2})\b(?!\s*(?::|h\b|horas?|hores|minutos?|minuts?))/);
    if (m) {
      const dia = Number(m[1]);
      let d = new Date(ahora.getFullYear(), ahora.getMonth(), dia);
      if (dia < ahora.getDate()) d = new Date(ahora.getFullYear(), ahora.getMonth() + 1, dia);
      fecha = d;
    }
  }

  // Hora en catalán con cuartos: "a dos quarts de sis" (5:30), "a un quart de deu" (9:15)
  let hEscrita = null;
  m = buscar(new RegExp(`\\b(?:a\\s+|cap a\\s+)?(un|dos|tres)\\s+quarts?\\s+(?:de\\s+|d')${NUM}\\b`));
  if (m) {
    const h = num(m[2]) - 1;
    hEscrita = h === 0 ? 12 : h;
    hora = [hEscrita, { un: 15, dos: 30, tres: 45 }[m[1]]];
  }
  // Hora: "a las 10", "a las 17:30", "a las cinco y media", "a la una", "a les 10 i quart", "sobre las 8"
  if (!hora) {
    m = buscar(new RegExp(`\\b(?:a|sobre|para|hacia|desde|cap a|per a|per)\\s+(?:las?|les|l')\\s*${NUM}(?:\\s*(?::|\\.|h)\\s*(\\d{2}))?(\\s+(?:y|i)\\s+(?:media|mitja|cuarto|quart)|\\s+(?:menos|menys)\\s+(?:cuarto|quart)|\\s+en punto|\\s+en punt)?(?:\\s*(?:h|horas|hores)\\b)?`));
    if (!m) m = buscar(/\b(\d{1,2})[:.](\d{2})\b/); // "17:30" suelto
    if (m) {
      let h = num(m[1]);
      let min = m[2] ? Number(m[2]) : 0;
      const extra = (m[3] || "").trim().replace(/\s+/g, " ");
      if (/(media|mitja)$/.test(extra)) min = 30;
      else if (/^(y|i) (cuarto|quart)$/.test(extra)) min = 15;
      else if (/^(menos|menys)/.test(extra)) { h -= 1; min = 45; }
      hEscrita = h;
      hora = [h, min];
    }
  }

  // Día de la semana: "el jueves", "este viernes", "el lunes que viene", "dijous", "el proper dilluns"
  const dias = DIAS.flat().join("|");
  m = buscar(new RegExp(`\\b(?:el\\s+|este\\s+|aquest\\s+|el\\s+proximo\\s+|proximo\\s+|el\\s+proper\\s+|proper\\s+)?(${dias})(?:\\s+que viene|\\s+que ve|\\s+proximo|\\s+vinent)?\\b`));
  if (m && !fecha) {
    let n = (indice(DIAS, m[1]) - ahora.getDay() + 7) % 7;
    if (n === 0) n = 7;
    fecha = masDias(ahora, n);
  }

  // Ajustar la hora con la franja ("a las 10 de la noche" = 22:00) o con sentido común ("a las 5" = 17:00)
  if (hora && hEscrita !== null) {
    let [h, min] = hora;
    if ((franja === "tarde" || franja === "noche") && h < 12) h += 12;
    else if (franja === "mediodia" && h < 6) h += 12;
    else if (!franja && h >= 1 && h <= 7) h += 12;
    if (franja === "noche" && h === 24) h = 0;
    hora = [h % 24, min];
  } else if (!hora && franja) {
    hora = { manana: [9, 0], mediodia: [13, 0], tarde: [17, 0], noche: [21, 0] }[franja];
  }

  // Solo hora sin día: hoy si aún no ha pasado, si no mañana
  if (hora && !fecha) {
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), hora[0], hora[1]);
    fecha = hoy > ahora ? ahora : masDias(ahora, 1);
  }

  // Título: lo que queda al quitar fecha, hora y palabras de relleno
  const marcas = [...original];
  for (const [a, b] of quitar) for (let i = a; i < b; i++) marcas[i] = " ";
  let titulo = marcas.join("").replace(/\s+/g, " ").trim();
  const relleno = /^(?:(?:oye|vale|bueno|escolta|doncs|por favor|si us plau|recuerdame|recuerdeme|recordarme|recordar|acuerdate de|recorda'm|recorda-me|recordar-me|recorda|apunta(?:me|'m)?|anota(?:me|'m)?|apuntar|anotar|pon(?:me)?|posa'm|agenda|que|tengo|tienes|hay|tinc|he|haig|cal|de|d'|el|la|l'|los|las|els|les|un|una|a|para|per a|per)(?:\b|(?<='))\s*)+/i;
  const tipoTarea = /^(?:(?:recuerdame|recorda'm|recorda-me)\s+)?(?:que\s+)?(?:tengo que|hay que|tienes que|tinc que|he de|haig de|has de|cal)\b/.test(normalizar(titulo));
  const inicio = relleno.exec(normalizar(titulo));
  if (inicio) titulo = titulo.slice(inicio[0].length);
  let fin;
  while ((fin = /[\s,;:]+(?:a|de|del|el|la|para|con|amb|y|i|en|que|las?|los|les|els|sobre|hacia|per|cap)?$/i.exec(normalizar(titulo))) && fin[0].length) {
    titulo = titulo.slice(0, fin.index);
  }
  titulo = titulo.replace(/\s+d'$/i, "").trim();
  if (titulo) titulo = titulo[0].toUpperCase() + titulo.slice(1); // vacío: la app pone "Recordatorio"

  const esCita = !tipoTarea && (hora !== null || (fecha !== null && PALABRAS_CITA.test(t)));
  return {
    tipo: esCita ? "cita" : "tarea",
    titulo,
    fecha: fecha ? isoFecha(fecha) : null,
    hora: hora ? isoHora(hora[0], hora[1]) : null,
  };
}
