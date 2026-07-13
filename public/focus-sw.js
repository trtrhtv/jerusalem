// Service Worker של "מוקד" — נרשם ב-scope /focus בלבד.
// תפקידים: מעטפת אופליין בסיסית, והתראות שמחזירות אותך לאפליקציה בלחיצה.

const CACHE = "moked-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;

  // ניווט לאפליקציה: רשת קודם, נפילה למטמון כשאין קליטה
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(event.request);
          const cache = await caches.open(CACHE);
          cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          const hit = await caches.match(event.request);
          if (hit) return hit;
          throw new Error("offline and not cached");
        }
      })(),
    );
    return;
  }

  // נכסים סטטיים (עם hash בשם) ואייקונים: מטמון קודם
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(event.request);
        if (hit) return hit;
        const fresh = await fetch(event.request);
        const cache = await caches.open(CACHE);
        cache.put(event.request, fresh.clone());
        return fresh;
      })(),
    );
  }
});

// לחיצה על התראה — חוזרים לאפליקציה (או פותחים אותה מחדש)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of list) {
        if (client.url.includes("/focus") && "focus" in client) return client.focus();
      }
      return self.clients.openWindow("/focus");
    })(),
  );
});
