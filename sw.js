const CACHE_NAME = 'fathalla-receiving-v20-final';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// مهلة الانتظار القصوى لجلب البيانات من الإنترنت قبل الرجوع لآخر نسخة أوفلاين محفوظة (بالمللي ثانية)
// هذا يحل مشكلة الشبكة الضعيفة جداً بالمخزن (متصلة لكن بطيئة أوي)، فبدل ما التطبيق يفضل يحمل لفترة طويلة
// وتضطر تقفل الداتا/الواي فاي عشان يشتغل، هيرجع تلقائياً لآخر نسخة اوفلاين بعد ثانيتين بس من غير ما ينتظر أكتر.
const NETWORK_TIMEOUT_MS = 2000;

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

// دالة مساعدة: تجلب من الشبكة، وتحفظ نسخة محدثة في الكاش فور نجاحها (تعمل في الخلفية بدون ما توقف أي حاجة)
function fetchAndUpdateCache(request) {
  return fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.status === 200) {
      const responseClone = networkResponse.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, responseClone);
      });
    }
    return networkResponse;
  });
}

// استراتيجية (Network-First مع مهلة زمنية / Timeout Race):
// نحاول نجيب أحدث نسخة من الإنترنت، لكن لو السرعة بطيئة جداً أو الشبكة شكلياً متصلة وفعلياً معلقة (زي حال المخزن)،
// منستناش أكتر من NETWORK_TIMEOUT_MS، ونرجع فوراً لآخر نسخة أوفلاين محفوظة في الكاش عشان التطبيق يفتح بسرعة.
// في نفس الوقت، لو نجح جلب البيانات من الشبكة (ولو متأخر شوية) بيتم تحديث الكاش في الخلفية للمرة الجاية.
self.addEventListener('fetch', (e) => {
  // حماية وتصفية الطلبات المباشرة لضمان عدم توقف النظام أوفلاين بسبب ملحقات المتصفحات الخارجية
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) {
    return;
  }

  e.respondWith(
    new Promise((resolve) => {
      let settled = false;

      // مؤقّت الرجوع السريع لآخر نسخة أوفلاين لو الشبكة بطيئة جداً
      const timeoutId = setTimeout(() => {
        if (settled) return;
        caches.match(e.request).then((cachedResponse) => {
          if (settled) return;
          if (cachedResponse) {
            settled = true;
            resolve(cachedResponse);
          }
          // لو مفيش نسخة كاش أصلاً، نستنى نتيجة الشبكة الحقيقية (الـ fetchAndUpdateCache) تحسم الأمر تحت
        });
      }, NETWORK_TIMEOUT_MS);

      fetchAndUpdateCache(e.request)
        .then((networkResponse) => {
          clearTimeout(timeoutId);
          if (settled) return; // كنا خدنا نسخة الكاش بالفعل بسبب البطء، بس الكاش اتحدث في الخلفية
          settled = true;
          resolve(networkResponse);
        })
        .catch(() => {
          clearTimeout(timeoutId);
          if (settled) return;
          caches.match(e.request).then((cachedResponse) => {
            settled = true;
            resolve(cachedResponse);
          });
        });
    })
  );
});
