// Utilidades de fecha y hora en la zona horaria de la agenda (por defecto Madrid).
export const ZONA = "Europe/Madrid";

// Partes de fecha/hora locales de un instante.
export function partesLocales(fecha, zona = ZONA) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(fecha).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, diaSemana: p.weekday };
}

// Convierte "YYYY-MM-DD" + "HH:MM" hora local a un Date (UTC), respetando el cambio de hora.
export function localADate(fecha, hora = "00:00", zona = ZONA) {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const supuesto = Date.UTC(y, m - 1, d, hh, mm);
  // Diferencia entre lo que marca el reloj local en ese instante y lo que queríamos.
  const desfase = (instante) => {
    const p = partesLocales(new Date(instante), zona);
    const [py, pm, pd] = p.fecha.split("-").map(Number);
    const [ph, pmin] = p.hora.split(":").map(Number);
    return Date.UTC(py, pm - 1, pd, ph, pmin) - instante;
  };
  let t = supuesto - desfase(supuesto);
  t = supuesto - desfase(t);
  return new Date(t);
}

const NOMBRES = {
  es: {
    dias: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    meses: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  },
  ca: {
    dias: ["diumenge", "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte"],
    meses: ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"],
  },
};

// "jueves 23 de octubre" / "dijous 23 d'octubre"
export function fechaBonita(fecha, idioma = "es") {
  const [y, m, d] = fecha.split("-").map(Number);
  const { dias, meses } = NOMBRES[idioma] || NOMBRES.es;
  const mes = meses[m - 1];
  const de = idioma === "ca" && /^[aeiou]/.test(mes) ? "d'" : "de ";
  return `${dias[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${de}${mes}`;
}

export function sumarDias(fecha, n) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
