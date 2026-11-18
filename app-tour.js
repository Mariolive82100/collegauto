(window.__V=window.__V||{})['app-tour']='7.5.11';
// ===================== Tutorial al primo utilizzo =====================
// Compare una sola volta per telefono (scelta ricordata in localStorage) e si rivede dal menu: "Come si usa".
const TOUR_KEY='ca-tour-done';
const TOUR_STEPS=[
  {t:'Come funzionano i punti',img:'1-punti',alt:'Schermata Punti: la graduatoria con evidenziato chi guida per primo',
   p:['Ogni viaggio in auto fa <b>somma zero</b>: chi guida prende <b>+1 per ogni passeggero</b>, ogni passeggero prende <b>−1</b>.',
      'Esempio: guidi tu con 3 colleghi → tu +3, loro −1 a testa. Più punti hai, più hai già guidato.',
      'Nella scheda <b>Punti</b> vedi la graduatoria: chi ha meno punti è il prossimo a guidare.']},
  {t:'La tua squadra',skipIfTeam:true,img:'2-squadra',alt:'Schermata Squadra: campo per inserire il codice e pulsante Entra nella squadra',
   p:['Se un collega ti ha mandato un <b>invito o il codice</b>, aprilo e tocca <b>Entra</b>: troverai subito viaggi e punti di tutti.',
      'Se sei il primo, crei tu la squadra da <b>Squadra → Nuova squadra</b> (se non sei già in una squadra) e poi mandi il codice ai colleghi.'],
   btn:['Apri Squadra',()=>{location.hash='squadra'}]},
  {t:'Presente o assente',img:'3-viaggio',alt:'Schermata Viaggio: pulsanti Presente e Assente',
   p:['Nella scheda <b>Viaggio</b> tocca <b>Presente</b> se vieni al prossimo viaggio, <b>Assente</b> se non vieni.',
      'Se sei presente l\'app ti chiede se sarai guidatore. Con le risposte di tutti, le auto si compongono da sole.']},
  {t:'Conferma e Registro',img:'4-conferma',alt:'Schermata Conferma: viaggio del giorno con pulsanti Modifica e Conferma',
   p:['Dalle 7:00 il viaggio del giorno arriva nella scheda <b>Conferma</b>. Se è andato così, tocca <b>Conferma</b>; altrimenti <b>Modifica</b>. Solo il creatore della squadra può confermare.',
      'Nel <b>Registro</b> trovi tutti i viaggi passati e chi ha cambiato cosa.']},
  {t:'Aggiungi alla Home e invita',img:'5-menu',alt:'Menu dell\'app con la voce Condividi l\'app evidenziata',
   p:['<b>iPhone</b>: da Safari tocca Condividi → <b>Aggiungi alla schermata Home</b>. <b>Android</b>: tocca <b>Installa</b>.',
      'Così si apre come una vera app, anche senza rete. Per invitare i colleghi usa <b>Condividi l\'app</b> nel menu.'],
   btn:['Condividi l\'app',()=>{if(typeof openShare==='function')openShare()}],btnIf:()=>typeof canShare==='function'&&canShare()}
];
const tourTheme=()=>document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
let tourI=0,tourSteps=[],tourBack=null;
function tourDone(){try{localStorage.setItem(TOUR_KEY,'1')}catch(e){}}
function tourEl(){
  let el=document.getElementById('tour');
  if(!el){el=document.createElement('div');el.id='tour';el.className='tour';el.hidden=true;el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','tour-t');
    el.innerHTML='<div class="tour-card"><div class="tour-top"><span id="tour-n" class="tour-n"></span><button id="tour-skip" class="tour-skip" type="button">Salta</button></div>'+
      '<div class="tour-scroll"><img id="tour-img" class="tour-img" width="390" height="460" alt="" hidden><h2 id="tour-t" class="tour-h"></h2><div id="tour-b" class="tour-body"></div><div id="tour-act" class="tour-act"></div></div>'+
      '<div id="tour-dots" class="tour-dots" aria-hidden="true"></div>'+
      '<div class="tour-nav"><button id="tour-prev" type="button">Indietro</button><button id="tour-next" type="button" class="primary">Avanti</button></div></div>';
    document.body.appendChild(el);
    $('tour-skip').onclick=closeTour;
    $('tour-prev').onclick=()=>{if(tourI>0){tourI--;drawTour()}};
    $('tour-next').onclick=()=>{if(tourI<tourSteps.length-1){tourI++;drawTour()}else closeTour()};
    el.addEventListener('keydown',e=>{if(e.key==='Escape')closeTour()})}
  return el}
function drawTour(){
  const s=tourSteps[tourI],last=tourI===tourSteps.length-1;
  $('tour-n').textContent=`Passo ${tourI+1} di ${tourSteps.length}`;
  $('tour-t').textContent=s.t;
  const im=$('tour-img');im.hidden=true;im.alt=s.alt||'';im.onload=()=>{im.hidden=false};im.onerror=()=>{im.hidden=true};   // offline e non ancora scaricata: si legge solo il testo
  if(s.img)im.src=`tutorial/${s.img}-${tourTheme()}.webp?v=7.5`;
  $('tour-b').parentElement.scrollTop=0;
  $('tour-b').innerHTML=s.p.map(x=>`<p>${x}</p>`).join('');
  const act=$('tour-act');act.innerHTML='';
  if(s.btn&&(!s.btnIf||s.btnIf())){const b=document.createElement('button');b.type='button';b.textContent=s.btn[0];b.onclick=()=>{closeTour();s.btn[1]()};act.appendChild(b)}
  $('tour-dots').innerHTML=tourSteps.map((_,i)=>`<i class="${i===tourI?'on':''}"></i>`).join('');
  $('tour-prev').hidden=tourI===0;
  $('tour-next').textContent=last?'Ho capito':'Avanti';
  $('tour-next').focus()}
function openTour(){
  tourSteps=TOUR_STEPS.filter(s=>!(s.skipIfTeam&&sync&&sync.code));tourI=0;
  tourBack=document.activeElement;
  tourEl().hidden=false;drawTour()}
function closeTour(){const el=document.getElementById('tour');if(el)el.hidden=true;tourDone();
  try{if(tourBack&&tourBack.focus)tourBack.focus()}catch(e){}}
$('menu-tour').onclick=e=>{e.preventDefault();openTour()};
// prima apertura: parte da solo, una volta, ma solo dopo la registrazione (squadra scelta + nome scelto) e dopo la schermata di benvenuto
(function(){let done='';try{done=localStorage.getItem(TOUR_KEY)}catch(e){done='1'}
  if(done)return;
  const t=setInterval(()=>{
    const tr=document.getElementById('tour'),wh=document.getElementById('whoami');
    if(document.getElementById('splash')||(tr&&!tr.hidden)||(wh&&!wh.hidden))return;
    if(!(sync&&sync.code&&sync.me))return;
    clearInterval(t);openTour()},1500)})();

// controllo finale: ogni file deve avere la stessa versione richiesta dall'index. Se no (copia vecchia in cache), si svuota la cache e si ricarica una volta.
(function(){try{const bad=[];document.querySelectorAll('script[src]').forEach(s=>{const m=(s.getAttribute('src')||'').match(/^(app-[a-z]+)\.js\?v=(.+)$/);if(m&&(!window.__V||window.__V[m[1]]!==m[2]))bad.push(m[1])});
  window.__bad=bad;if(!bad.length)return;
  if(sessionStorage.getItem('ca-heal'))return;sessionStorage.setItem('ca-heal','1');
  (async()=>{try{const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));const rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()))}catch(e){}location.reload()})()}catch(e){}})();
