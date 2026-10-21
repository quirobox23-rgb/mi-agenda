# Mi agenda

Agenda sencilla para el móvil: dices "cita médico mañana a las 10" y te avisa con una notificación que vibra, aunque el móvil esté bloqueado. Gratis.

- Se apunta hablando o escribiendo, como se lo dirías a alguien.
- Avisa 1 hora antes (15 minutos si es para dentro de poco) y la tarde anterior.
- Cada mañana a las 9: lo que tienes hoy, o "No tienes nada para hoy, ¿quieres apuntar algo?".
- Cada noche a las 20: las tareas que aún no has marcado como hechas.
- Opcional: los mismos avisos por WhatsApp, a tu propio número, con CallMeBot (gratis).

## Ponerla en marcha (una sola vez, unos 5 minutos)

Funciona en el plan gratuito de Cloudflare: no hace falta tarjeta.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/quirobox23-rgb/mi-agenda)

1. Toca el botón de arriba.
2. Crea una cuenta gratuita de Cloudflare (o entra con la tuya).
3. Conecta tu GitHub cuando lo pida y pulsa **Create and deploy**. Cloudflare crea solo la base de datos.
4. Al terminar te da una dirección como `https://mi-agenda.tu-nombre.workers.dev`. Esa es la agenda.

Para cada persona: que abra esa dirección en el móvil, la añada a la pantalla de inicio y toque **Activar avisos**. Cada móvil tiene su propia agenda privada.

## Cómo funciona

| Pieza | Qué hace |
| --- | --- |
| `public/index.html` | La app que se ve en el móvil |
| `public/interpretar.js` | Entiende las frases ("el jueves", "en 1 hora", "a las cinco y media") sin internet |
| `public/sw.js` | Recibe los avisos con la app cerrada y los enseña con vibración |
| `src/worker.js` | Guarda las cosas y cada minuto mira si hay que avisar |
| `src/webpush.js` | Manda los avisos al móvil (Web Push estándar, sin servicios de pago) |

Límites del plan gratuito de Cloudflare: 100.000 visitas al día y 5 GB de base de datos, de sobra para un grupo de conocidos.

## Para programadores

```
npm install
npm run dev      # la agenda en http://localhost:8787
npm run prueba   # comprueba que las frases se entienden bien
npm run deploy
```
