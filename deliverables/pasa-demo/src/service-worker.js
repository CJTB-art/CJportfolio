import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `pasa-resources-${version}`;
const URLS = [...new Set([...immutable, ...assets].map((item) => item.path))].filter((path) => !path.endsWith('.apk')); // the APK download is not an offline resource
let downloadState = { completed: 0, total: URLS.length, failed: 0, done: false };
let downloading = null;

async function tell(client, type) {
  const message = { type, ...downloadState };
  if (client) return client.postMessage(message);
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((c) => c.postMessage(message));
}

async function cacheResources(client) {
  if (downloading) return downloading;
  downloading = (async () => {
    const cache = await caches.open(CACHE);
    const missing = [];
    downloadState = { completed: 0, total: URLS.length, failed: 0, done: false };
    for (const url of URLS) {
      if (await cache.match(url)) downloadState.completed++;
      else missing.push(url);
    }
    await tell(client, 'PASA_RESOURCES_START');

    let cursor = 0;
    const worker = async () => {
      while (cursor < missing.length) {
        const url = missing[cursor++];
        try {
          const response = await fetch(url, { cache: 'reload' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await cache.put(url, response);
        } catch {
          downloadState.failed++;
        }
        downloadState.completed++;
        await tell(client, 'PASA_RESOURCES_PROGRESS');
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, missing.length) }, worker));
    downloadState.done = true;
    await tell(client, 'PASA_RESOURCES_DONE');
    return downloadState;
  })().finally(() => { downloading = null; });
  return downloading;
}

self.addEventListener('install', (event) => {
  // Only pre-download for people who already turned offline resources on; everyone else just gets the worker.
  event.waitUntil((async () => {
    const optedIn = (await caches.keys()).some((k) => k.startsWith('pasa-resources-'));
    if (optedIn) await cacheResources();
    await self.skipWaiting();
  })());
});

const KNOWN = new Set(URLS);
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !KNOWN.has(url.pathname)) return;
  event.respondWith(caches.match(request, { cacheName: CACHE }).then((hit) => hit || fetch(request)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('pasa-resources-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PASA_DOWNLOAD_RESOURCES') event.waitUntil(cacheResources(event.source));
  if (event.data?.type === 'PASA_RESOURCE_STATUS') event.waitUntil(tell(event.source, 'PASA_RESOURCES_STATUS'));
});
