/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { safeNotificationPath } from "./features/notifications/serviceWorkerPolicy";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

interface PushPayload { alertId: string; title: string; explanation: string; url: string; }

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("push", (event) => {
  const payload = event.data?.json() as PushPayload | undefined;
  if (!payload?.alertId || !payload.title) return;
  const url = safeNotificationPath(payload.url);
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.explanation, data: { url }, tag: `alert:${payload.alertId}` }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safeNotificationPath((event.notification.data as { url?: unknown } | undefined)?.url);
  event.waitUntil((async () => {
    const target = new URL(path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin) as WindowClient | undefined;
    if (existing) { await existing.navigate(target); await existing.focus(); return; }
    await self.clients.openWindow(path);
  })());
});

export {};
