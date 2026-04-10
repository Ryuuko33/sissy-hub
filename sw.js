const CACHE_NAME = 'sissy-hub-v28';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './sfx/countdown-tick.wav',
    './sfx/phase-end.wav'
];

// 安装时缓存所有资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// 激活时清理旧缓存（仅清理 Cache Storage，不影响 localStorage / IndexedDB）
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// 请求策略：HTML/JS/CSS 优先网络（确保更新后立即生效），其余优先缓存
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const isAppShell = ASSETS.some((a) => url.pathname.endsWith(a.replace('./', '/')) || url.pathname === a);

    if (event.request.method !== 'GET') return;

    // 对核心资源使用 network-first 策略，避免缓存旧版本导致数据不兼容
    if (isAppShell && !url.pathname.endsWith('.wav')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    } else {
        // 音频等静态资源使用 cache-first 策略
        event.respondWith(
            caches.match(event.request).then((cached) => cached || fetch(event.request))
        );
    }
});
