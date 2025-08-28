
const CACHE = 'academia-nh-v9';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./manifest.json','./assets/icon-192.png','./assets/icon-512.png','./assets/beep.wav'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{if(e.request.method==='GET'&&n&&n.status===200){caches.open(CACHE).then(c=>c.put(e.request,n.clone()))} return n}).catch(()=>caches.match('./index.html'))))});
