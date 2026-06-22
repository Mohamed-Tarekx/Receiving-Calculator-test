const CACHE_NAME = 'fathalla-receiving-v13';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './logo.png',
  './default_db.xlsx',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// التثبيت المبدئي للملفات في كاش الذاكرة التابع للموبايل
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// تفعيل المحرك وتصفية الكاش القديم وتحديثه تلقائياً
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// استراتيجية (Network-First): جلب البيانات من الإنترنت أولاً للتحديث اللحظي ثم الرجوع لذاكرة التخزين عند فصل الشبكة
self.addEventListener('fetch', (e) => {
  // حماية وتصفية الطلبات المباشرة لضمان عدم توقف النظام أوفلاين بسبب ملحقات المتصفحات الخارجية
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // إذا نجح جلب البيانات عبر الإنترنت، نحدث الكاش فوراً بالنسخة الجديدة ونعرضها للمستخدم
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // في حالة عدم توفر اتصال بالشبكة، يتم استدعاء النسخة المحفوظة مسبقاً داخل كاش الموبايل مباشرة
        return caches.match(e.request);
      })
  );
});
