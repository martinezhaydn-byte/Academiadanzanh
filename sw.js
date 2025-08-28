const CACHE = 'academia-nh-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/beep.wav'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e)=>{
  e.respondWith(
    caches.match(e.request).then(res=> res || fetch(e.request).then(netRes=>{
      // Cache new GET requests
      if (e.request.method==='GET' && netRes && netRes.status===200){
        const copy = netRes.clone();
        caches.open(CACHE).then(c=>c.put(e.request, copy));
      }
      return netRes;
    }).catch(()=> caches.match('./index.html')))
  );
});