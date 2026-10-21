// Comprueba que las frases típicas se entienden bien. Ejecutar con: npm run prueba
import assert from "node:assert/strict";
import { interpretar } from "../public/interpretar.js";

const ahora = new Date(2026, 9, 21, 10, 40); // miércoles 21 de octubre de 2026, 10:40
const casos = [
  ["Cita médico mañana a las 10", { tipo: "cita", titulo: "Cita médico", fecha: "2026-10-22", hora: "10:00" }],
  ["reunión en 1 hora", { tipo: "cita", titulo: "Reunión", fecha: "2026-10-21", hora: "11:40" }],
  ["taller el jueves", { tipo: "cita", titulo: "Taller", fecha: "2026-10-22", hora: null }],
  ["tengo que comprar pan", { tipo: "tarea", titulo: "Comprar pan", fecha: null, hora: null }],
  ["Recuérdame que tengo dentista el viernes a las cinco y media", { tipo: "cita", titulo: "Dentista", fecha: "2026-10-23", hora: "17:30" }],
  ["cena con Ana el sábado a las 9 de la noche", { tipo: "cita", titulo: "Cena con Ana", fecha: "2026-10-24", hora: "21:00" }],
  ["mañana por la mañana análisis de sangre", { tipo: "cita", titulo: "Análisis de sangre", fecha: "2026-10-22", hora: "09:00" }],
  ["el 5 de noviembre cumpleaños de Juan", { tipo: "cita", titulo: "Cumpleaños de Juan", fecha: "2026-11-05", hora: null }],
  ["el lunes a las 10 menos cuarto entrevista", { tipo: "cita", titulo: "Entrevista", fecha: "2026-10-26", hora: "09:45" }],
];
for (const [frase, esperado] of casos) assert.deepEqual(interpretar(frase, ahora), esperado, frase);
console.log(`✓ ${casos.length} frases entendidas bien`);
