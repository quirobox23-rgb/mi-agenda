// Recibe los avisos aunque la agenda esté cerrada y los enseña como notificación.
const uid = new URL(self.location.href).searchParams.get("uid");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  evento.waitUntil((async () => {
    let mensajes = [];
    try {
      const r = await fetch(`/api/bandeja?uid=${uid}`, { cache: "no-store" });
      mensajes = await r.json();
    } catch {}
    if (!mensajes.length) mensajes = [{ id: "x", titulo: "Mi agenda", texto: "Tienes un aviso · Tens un avís" }];
    for (const m of mensajes) {
      await self.registration.showNotification(m.titulo, {
        body: m.texto,
        tag: `aviso-${m.id}`,
        icon: "icono-192.png",
        badge: "icono-192.png",
        vibrate: [300, 120, 300, 120, 300],
        requireInteraction: true,
      });
    }
  })());
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (ventanas.length) return ventanas[0].focus();
    return self.clients.openWindow("./");
  })());
});
