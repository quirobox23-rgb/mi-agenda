// Convierte una frase en español ("cita médico mañana a las 10") en una cita o tarea.
// Funciona sin internet y sin servicios de pago: son reglas sencillas.

const NUMEROS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20,
  veinticinco: 25, treinta: 30, cuarenta: 40, cuarentaicinco: 45, media: 0.5,
};
const NUM = `(\\d{1,2}|${Object.keys(NUMEROS).join("|")})`;
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];
const PALABRAS_CITA = /\b(cita|reunion|medico|medica|dentista|doctor|doctora|taller|clase|consulta|cumple\w*|cena|comida|almuerzo|quedada|quedar|entrevista|vuelo|tren|autobus|revision|analisis|peluqueria|fisio\w*|misa|partido|ensayo|curso|evento|boda|visita)\b/;

const num = (s) => (/^\d+$/.test(s) ? Number(s) : NUMEROS[s]);
const dosCifras = (n) => String(n).padStart(2, "0");
const isoFecha = (d) => `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;
const isoHora = (h, m) => `${dosCifras(h)}:${dosCifras(m)}`;
const masDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Quita tildes sin cambiar la longitud, para que las posiciones sigan valiendo en el texto original.
const normalizar = (s) => [...s].map((c) => c.normalize("NFD")[0].toLowerCase()).join("");

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

  // "en 1 hora", "dentro de 20 minutos", "en media hora", "en 2 horas y media", "en 3 días"
  let m = buscar(new RegExp(`\\b(?:en|dentro de)\\s+(?:unos?\\s+|unas?\\s+)?${NUM}\\s*(minutos?|mins?|horas?|h|dias?|semanas?)(\\s+y\\s+media)?\\b`));
  if (!m) m = buscar(/\b(?:en|dentro de)\s+(media hora)\b/);
  if (m) {
    if (m[1] === "media hora") {
      const d = new Date(ahora.getTime() + 30 * 60000);
      fecha = d; hora = [d.getHours(), d.getMinutes()];
    } else {
      const n = num(m[1]) + (m[3] ? 0.5 : 0);
      const unidad = m[2];
      if (/^d/.test(unidad)) fecha = masDias(ahora, n);
      else if (/^s/.test(unidad)) fecha = masDias(ahora, n * 7);
      else {
        const minutos = /^h/.test(unidad) ? n * 60 : n;
        const d = new Date(ahora.getTime() + minutos * 60000);
        fecha = d; hora = [d.getHours(), d.getMinutes()];
      }
    }
  }

  // Franja del día: "por la tarde", "esta noche", "a mediodía", "de la mañana"
  m = buscar(/\b(?:por la|de la|esta|a la|en la)\s+(manana|tarde|noche)\b|\b(?:a |al )?(mediodia)\b/);
  if (m) {
    franja = m[1] || m[2];
    if (/^esta /.test(m[0]) && !fecha) fecha = ahora;
  }

  // Día: "hoy", "mañana", "pasado mañana"
  if (!fecha) {
    m = buscar(/\bpasado manana\b/);
    if (m) fecha = masDias(ahora, 2);
  }
  if (!fecha) {
    m = buscar(/\b(?:para |de )?hoy\b/);
    if (m) fecha = ahora;
  }
  if (!fecha) {
    m = buscar(/\b(?:para )?manana\b/);
    if (m) fecha = masDias(ahora, 1);
  }

  // "el 5 de noviembre", "el día 12", "12/11"
  if (!fecha) {
    m = buscar(new RegExp(`\\b(?:el\\s+)?(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MESES.join("|")})\\b`));
    if (m) {
      const d = new Date(ahora.getFullYear(), MESES.indexOf(m[2]), Number(m[1]));
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
    m = buscar(/\bel\s+(?:dia\s+)?(\d{1,2})\b(?!\s*(?::|h\b|horas?|minutos?))/);
    if (m) {
      const dia = Number(m[1]);
      let d = new Date(ahora.getFullYear(), ahora.getMonth(), dia);
      if (dia < ahora.getDate()) d = new Date(ahora.getFullYear(), ahora.getMonth() + 1, dia);
      fecha = d;
    }
  }

  // Hora: "a las 10", "a las 17:30", "a las cinco y media", "a la una", "sobre las 8 de la tarde"
  m = buscar(new RegExp(`\\b(?:a|sobre|para|hacia|desde)\\s+las?\\s+${NUM}(?:\\s*(?::|\\.|h)\\s*(\\d{2}))?(\\s+y\\s+(?:media|cuarto)|\\s+menos\\s+cuarto|\\s+en punto)?(?:\\s*(?:h|horas)\\b)?`));
  if (!m) m = buscar(/\b(\d{1,2})[:.](\d{2})\b/); // "17:30" suelto
  let hEscrita = null;
  if (m) {
    let h = num(m[1]);
    let min = m[2] ? Number(m[2]) : 0;
    const extra = (m[3] || "").trim();
    if (extra === "y media") min = 30;
    else if (extra === "y cuarto") min = 15;
    else if (extra === "menos cuarto") { h -= 1; min = 45; }
    hEscrita = h;
    hora = [h, min];
  }
  // Día de la semana: "el jueves", "este viernes", "el lunes que viene"
  m = buscar(new RegExp(`\\b(?:el\\s+|este\\s+|el\\s+proximo\\s+|proximo\\s+)?(${DIAS.join("|")})(?:\\s+que viene|\\s+proximo)?\\b`));
  if (m && !fecha) {
    const objetivo = DIAS.indexOf(m[1]);
    let n = (objetivo - ahora.getDay() + 7) % 7;
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
  const relleno = /^(?:(?:oye|vale|bueno|por favor|recuerdame|recuerdeme|recordarme|recordar|acuerdate de|apunta(?:me)?|anota(?:me)?|apuntar|anotar|pon(?:me)?|agenda|que|tengo|tienes|hay|de|el|la|los|las|un|una|a|para)\b\s*)+/i;
  const tipoTarea = /^(?:recuerdame\s+)?(?:que\s+)?(?:tengo que|hay que|tienes que)\b/.test(normalizar(titulo));
  const inicio = relleno.exec(normalizar(titulo));
  if (inicio) titulo = titulo.slice(inicio[0].length);
  let fin;
  while ((fin = /[\s,;:]+(?:a|de|del|el|la|para|con|y|en|que|las?|los|sobre|hacia)?$/i.exec(normalizar(titulo))) && fin[0].length) {
    titulo = titulo.slice(0, fin.index);
  }
  titulo = titulo.trim();
  if (!titulo) titulo = "Recordatorio";
  titulo = titulo[0].toUpperCase() + titulo.slice(1);

  const esCita = !tipoTarea && (hora !== null || (fecha !== null && PALABRAS_CITA.test(t)));
  return {
    tipo: esCita ? "cita" : "tarea",
    titulo,
    fecha: fecha ? isoFecha(fecha) : null,
    hora: hora ? isoHora(hora[0], hora[1]) : null,
  };
}
