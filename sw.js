// CollegAuto: funziona anche senza rete.
// Pagina, CSS e JS: prima la rete (sempre l'ultima versione), poi la copia salvata se sei offline.
const CACHE='collegauto-v7.4';
const FILES=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png',
  './style.css','./firebase-sdk.js','./qr.js','./app-core.js','./app-sync.js','./app-prenotazioni.js','./app-extra.js','./app-tour.js'];
// un file mancante non deve bloccare l'installazione
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(f=>c.add(new Request(f,{cache:'reload'})).catch(()=>{})))));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;   // Firebase e Google: mai in cache
  const nav=e.request.mode==='navigate';
  const key=new Request(nav?'./index.html':u.origin+u.pathname);    // senza ?v=: in cache resta solo l'ultima copia
  e.respondWith((nav?fetch(e.request):fetch(e.request,{cache:'no-cache'})).then(r=>{
    if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(key,c))}
    return r
  }).catch(()=>caches.match(nav?'./index.html':e.request,{ignoreSearch:true})));
});
