self.addEventListener("push", (event) => {
    let title = "";
    let body = "";
    let url = "/";
  
    try {
      if (event.data) {
        const data = event.data.json();
        title = data.title || title;
        body  = data.body  || body;
        url   = data.url   || url;
      }
    } catch (e) {
      // If JSON parse fails, try reading as plain text
      try { body = event.data ? event.data.text() : ""; } catch (_) {}
    }
  
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon:  "/icon-192.jpg",
        badge: "/icon-192.jpg",
        data:  { url },
      })
    );
  });
  
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification.data?.url || "/";
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        const existing = list.find((c) => c.url === url && "focus" in c);
        if (existing) return existing.focus();
        return clients.openWindow(url);
      })
    );
  });