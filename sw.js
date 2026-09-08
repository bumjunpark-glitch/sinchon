// 서비스 워커. 목적은 두 가지뿐이다:
//   1) 홈 화면에서 열었을 때 오프라인에서도 뜨게
//   2) 두 번째 방문부터 빠르게
//
// 조심한 것: HTML 을 캐시 우선으로 주면 배포해도 옛날 화면이 계속 나온다.
// 그래서 문서는 네트워크 우선, 실패할 때만 캐시. 나머지는 캐시 우선.
const VER   = 'v2';
const SHELL = 'shell-' + VER;   // 우리 파일
const LIB   = 'lib-'   + VER;   // maplibre (unpkg)
const MAP   = 'map-'   + VER;   // 지도 스타일·글리프·타일
const MAP_MAX = 400;            // 타일은 무한정 쌓이니 상한을 둔다

const PRECACHE = [
  './', './index.html', './index_en.html',
  './manifest.webmanifest', './manifest_en.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable.png', './apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // 하나라도 실패하면 설치 전체가 실패하니 개별로 담는다
    await Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, LIB, MAP]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(name, max) {
  const c = await caches.open(name);
  const ks = await c.keys();
  for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]);
}

async function cacheFirst(req, name, cap) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) {
    c.put(req, res.clone());
    if (cap) trim(name, cap);
  }
  return res;
}

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 문서: 네트워크 우선. 배포한 게 바로 보여야 한다.
  if (request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(request);
        const c = await caches.open(SHELL);
        c.put(request, res.clone());
        return res;
      } catch (_) {
        return (await caches.match(request))
            || (await caches.match('./index.html'))
            || Response.error();
      }
    })());
    return;
  }

  if (url.hostname === 'unpkg.com') {
    e.respondWith(cacheFirst(request, LIB));
    return;
  }
  if (url.hostname === 'tiles.openfreemap.org' || url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(cacheFirst(request, MAP, MAP_MAX).catch(() => Response.error()));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(request, SHELL));
  }
});
