// Push notification handlers, pulled into the Workbox-generated /sw.js via
// importScripts (see vite.config.ts). Keep this file dependency-free.
self.addEventListener("push", (event) => {
  let title = "Saturday School";
  let body = "";
  let url = "/";

  try {
    if (event.data) {
      const data = event.data.json();
      title = data.title || title;
      body = data.body || body;
      url = data.url || url;
    }
  } catch (e) {
    // If JSON parse fails, try reading as plain text
    try { body = event.data ? event.data.text() : ""; } catch (_) {}
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  // Resolve to absolute so it can match client URLs (which are always
  // absolute) — the old exact string compare never matched, so every tap
  // opened a duplicate window instead of focusing the running app.
  const target = new URL(url, self.location.origin);
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => {
        try { return new URL(c.url).pathname === target.pathname && "focus" in c; }
        catch (_) { return false; }
      });
      if (existing) {
        if ("navigate" in existing && existing.url !== target.href) existing.navigate(target.href);
        return existing.focus();
      }
      return clients.openWindow(target.href);
    })
  );
});
