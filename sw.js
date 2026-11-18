// CollegAuto: funziona anche senza rete.
// Pagina, CSS e JS: prima la rete (sempre l'ultima versione). Offline si usa la copia della STESSA versione (?v=) richiesta dalla pagina, mai di un'altra.
const CACHE='collegauto-v7.5.11';
const STATIC=['./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
// all'installazione si salvano la pagina e i file con le versioni esatte che la pagina richiede
async function precache(){
  const c=await caches.open(CACHE);
  const r=await fetch('./index.html',{cache:'reload'});
  const html=await r.clone().text();
  await c.put('./index.html',r);
  const urls=[...html.matchAll(/(?:src|href)="((?:style\.css|firebase-sdk\.js|qr\.js|app-[a-z]+\.js)(?:\?v=[^"]*)?)"/g)].map(m=>m[1]);
  await Promise.all([...urls,...STATIC].map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})));
}
self.addEventListener('install',e=>{e.waitUntil(precache().catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;   // Firebase e Google: mai in cache
  const nav=e.request.mode==='navigate';
  const key=nav?'./index.html':e.request;
  e.respondWith((nav?fetch(e.request):fetch(e.request,{cache:'no-cache'})).then(r=>{
    if(r.ok){const c=r.clone();caches.open(CACHE).then(async x=>{await x.put(key,c);
      if(!nav)(await x.keys()).forEach(k=>{const ku=new URL(k.url);if(ku.pathname===u.pathname&&ku.search!==u.search)x.delete(k)})})}   // restano solo le copie dell'ultima versione
    return r
  }).catch(()=>caches.match(key)));
});
