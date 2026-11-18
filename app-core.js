(window.__V=window.__V||{})['app-core']='7.5.12';
const APP_VERSION='7.5.12';
// ultimi errori del codice, mostrati in Info sull'app (aiuta a capire cosa non va)
window.__errs=[];addEventListener('error',e=>{__errs.push(String(e.message||'errore').slice(0,70)+' @'+String(e.filename||'').split('/').pop().split('?')[0]+':'+e.lineno)});
addEventListener('unhandledrejection',e=>{const r=e.reason;__errs.push('promessa: '+String(r&&(r.code||r.message)||r).slice(0,70))});
// i messaggi di Firebase (rete, quota, permessi) finiscono nell'elenco errori mostrato in Info
['warn','error'].forEach(k=>{const o=console[k];console[k]=function(){try{const m=Array.prototype.slice.call(arguments).map(a=>String(a&&a.message||a)).join(' ');if(/firestore|firebase/i.test(m))__errs.push(m.replace(/^.*?(Firestore|Firebase)[^:]*:\s*/i,'').slice(0,110))}catch(e){}return o.apply(console,arguments)}});
const KEY='turni-auto-v2';
const IMPORTED={"people":[],"groups":[],"start":null,"trips":[]};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const fmt=n=>(n>0?'+':n<0?'−':'')+Math.abs(n).toLocaleString('it-IT',{maximumFractionDigits:0});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// chi si è unito alla squadra da un telefono e ha scelto il suo nome: gruppi/{codice}/iscritti/{id persona}
var joined={};
const $=id=>document.getElementById(id);

let state;
try{state=JSON.parse(localStorage.getItem(KEY))}catch(e){}
if(!state||!Array.isArray(state.people))state=JSON.parse(JSON.stringify(IMPORTED));
// migrazione: niente riporti, pesi interi
delete state.opening;delete state.openingNote;
migrateGroups(state);
state.groups=Array.isArray(state.groups)?state.groups:[];
if(!state.start&&state.people.some(p=>p.id==='p1')){state.start=JSON.parse(JSON.stringify(IMPORTED.start));
  state.trips.forEach(t=>{if(t.date<=IMPORTED.start.date&&/^t\d+$/.test(t.id))t.hist=true});
  state.people.forEach(p=>{const q=IMPORTED.people.find(x=>x.id===p.id);if(q&&q.archived)p.archived=true})}
state.trips.forEach(t=>t.weight=Math.max(1,Math.round(+t.weight||1)));
const active=()=>state.people.filter(p=>!p.archived&&!p.deleted);
// chi gestisce i componenti: chi ha creato la squadra (o chiunque, se l'app non è collegata a una squadra)
const isAdmin=()=>!window.__startLocked;
// true: si può creare una squadra solo se non si appartiene già a una (vedi canNewTeam in app-sync.js). false: nessuno può crearne, si può solo entrare con un codice.
const ALLOW_NEW_TEAMS=true;
// condividere l'app e il codice della squadra: solo il creatore della squadra
const canShare=()=>isAdmin();
// chi può eliminare un viaggio: il creatore (o chiunque se l'app non è in una squadra); gli altri solo i propri viaggi ancora da confermare
const canDelTrip=t=>{if(!t)return false;if(isAdmin())return true;if(t.hist||!t.pend)return false;
  return t.uid?t.uid===myUid():(!!t.by&&t.by===sync.me)};
// persone visibili (attive + archiviate); chi è eliminato resta solo nei viaggi già registrati
const listed=()=>state.people.filter(p=>!p.deleted);
persist();
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}}

// --- logica punteggio: per ogni auto, guidatore +peso×passeggeri, passeggero −peso → Σ = 0
function carPoints(car,w){const pts={};pts[car.driver]=w*car.passengers.length;car.passengers.forEach(p=>pts[p]=-w);return pts}
function balances(){
  const st=state.start||{points:{}};const b={};state.people.forEach(p=>b[p.id]=st.points[p.id]||0);
  state.trips.forEach(t=>!t.hist&&!t.pend&&t.cars.forEach(c=>{const pts=carPoints(c,t.weight);for(const k in pts)if(k in b)b[k]+=pts[k]}));
    return b;
}
// parità: a pari punti guida prima chi era più indietro nella graduatoria originale
const tie=id=>((state.start&&state.start.rank)||{})[id]??0;
// gruppi: ogni persona appartiene al massimo a un gruppo
// gruppi: ogni gruppo ha i suoi membri; si può stare in nessuno, in uno o in più gruppi
function migrateGroups(st){if(!st)return;st.groups=st.groups||[];st.groups.forEach(g=>{g.members=Array.isArray(g.members)?g.members:[]});
  (st.people||[]).forEach(p=>{if(p.group){const g=st.groups.find(x=>x.id===p.group);if(g&&!g.members.includes(p.id))g.members.push(p.id);delete p.group}})}
const groupsOf=id=>state.groups.filter(g=>(g.members||[]).includes(id)).map(g=>g.id);
const groupOf=id=>groupsOf(id)[0]||null;
const sameGroup=(a,b)=>{const ga=groupsOf(a);return ga.length&&groupsOf(b).some(x=>ga.includes(x))};
const dotsOf=id=>groupsOf(id).map(gDot).join('');
const gIndex=gid=>state.groups.findIndex(g=>g.id===gid);
const gColor=gid=>`var(--g${gIndex(gid)%6+1})`;
const gDot=gid=>gid?`<span class="gdot" style="background:${gColor(gid)}" title="${esc(state.groups[gIndex(gid)].name)}"></span>`:'';
const name=id=>(state.people.find(p=>p.id===id)||{name:'?'}).name;

// --- composer
let draft={who:new Set(),cars:[{driver:'',passengers:[]}]};
$('trip-date').value=new Date().toISOString().slice(0,10);

function renderWho(){
  const b=balances();
  $('who').innerHTML=active().map(p=>`<button class="chip" data-id="${p.id}" aria-pressed="${draft.who.has(p.id)}">${dotsOf(p.id)}${esc(p.name)}<span class="bal">${fmt(b[p.id])}</span></button>`).join('')||'<span class="hint">Aggiungi prima delle persone.</span>';
}
$('who').onclick=e=>{const c=e.target.closest('.chip');if(!c)return;const id=c.dataset.id;
  if(draft.who.has(id)){draft.who.delete(id);draft.cars.forEach(car=>{if(car.driver===id)car.driver='';car.passengers=car.passengers.filter(x=>x!==id)})}
  else draft.who.add(id);
  renderComposer()};
$('all-on').onclick=()=>{active().forEach(p=>draft.who.add(p.id));renderComposer()};
$('all-off').onclick=()=>{draft.who.clear();draft.cars=draft.cars.map(()=>({driver:'',passengers:[]}));renderComposer()};


// Distribuisci: i saldi più bassi guidano, passeggeri a rotazione partendo dai punti più alti
// --- gruppi
const selBusy=box=>{const a=document.activeElement;return !!(a&&a.tagName==='SELECT'&&box&&box.contains(a))};
function renderGroups(){if(selBusy($('groups')))return;
  const ppl=active().sort((a,c)=>a.name.localeCompare(c.name));
  $('groups').innerHTML=state.groups.length?state.groups.map(g=>{
    const mem=ppl.filter(p=>(g.members||[]).includes(p.id));
    const out=ppl.filter(p=>!(g.members||[]).includes(p.id));
    return `<div class="panel gcard"><table class="ztab">
      <thead><tr><th colspan="2"><div class="gc-h">${gDot(g.id)}<input id="gn-${g.id}" data-gname="${g.id}" value="${esc(g.name)}" aria-label="Nome della zona"><span class="ztab-n">${mem.length}</span></div></th></tr></thead>
      <tbody>${mem.length?mem.map(p=>`<tr><td>${esc(p.name)}</td><td class="ztab-x"><button class="pc-rm gm" data-gm="${g.id}" data-id="${p.id}" aria-label="Togli ${esc(p.name)} dalla zona">✕</button></td></tr>`).join('')
        :'<tr><td colspan="2" class="ztab-empty">Nessuno in questa zona</td></tr>'}</tbody>
      <tfoot><tr><td colspan="2">${out.length?`<select data-gadd="${g.id}" aria-label="Aggiungi persona alla zona"><option value="">+ Aggiungi persona</option>${out.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>`:'<span class="hint">Ci sono già tutti</span>'}</td></tr></tfoot>
    </table><div class="row between"><span class="hint">${mem.length} ${mem.length===1?'persona':'persone'}</span><button class="x" data-gdel="${g.id}">elimina zona</button></div></div>`}).join('')
    :'<div class="panel"><p class="hint" style="margin:0">Questa squadra non ha ancora zone. Tocca "+ Nuova zona" per crearne una.</p></div>';
}
$('add-group').onclick=()=>{let k=state.groups.length+1;while(state.groups.some(g=>g.name==='Zona '+k))k++;
  const g={id:uid(),name:'Zona '+k,members:[]};state.groups.push(g);persist();render();const i=$('gn-'+g.id);if(i){i.focus();i.select()}};
$('groups').onchange=e=>{const a=e.target.closest('[data-gadd]');if(a){a.blur();if(!a.value)return;const g=state.groups.find(x=>x.id===a.dataset.gadd);g.members=[...(g.members||[]),a.value];persist();render();return}
  const i=e.target.closest('[data-gname]');if(!i)return;const g=state.groups.find(x=>x.id===i.dataset.gname);const n=i.value.trim();
  if(!n){i.value=g.name;return}g.name=n;persist();render()};
$('groups').onkeydown=e=>{if(e.key==='Enter'&&e.target.dataset.gname)e.target.blur()};
$('groups').onclick=e=>{
  const m=e.target.closest('[data-gm]');if(m){const g=state.groups.find(x=>x.id===m.dataset.gm),id=m.dataset.id;g.members=g.members||[];
    g.members=g.members.includes(id)?g.members.filter(x=>x!==id):[...g.members,id];persist();render();return}
  const b=e.target.closest('[data-gdel]');if(!b)return;const id=b.dataset.gdel;
  if(!b.dataset.confirm){b.dataset.confirm=1;b.textContent='conferma?';b.style.color='var(--neg)';return}
  state.groups=state.groups.filter(g=>g.id!==id);persist();render()};

// --- distribuzione automatica
// guidano gli n saldi più bassi; poi i gruppi presenti si siedono insieme (prima nell'auto di un loro guidatore),
// i singoli riempiono le auto meno piene. POSTI = passeggeri massimi per auto.
const POSTI=4;
$('auto').onclick=()=>{
  const b=balances();const who=[...draft.who].sort((a,c)=>b[a]-b[c]||tie(a)-tie(c)||name(a).localeCompare(name(c)));
  const n=draft.cars.length;
  if(who.length<n*2){setMsg(`Servono almeno ${n*2} persone per ${n} auto con passeggeri.`);return}
  if(who.length-n>POSTI*n){setMsg(`${who.length-n} passeggeri non entrano in ${n} auto da ${POSTI} posti: aggiungi un'auto.`);return}
  // guidatori: saldi più bassi, ma al massimo uno per gruppo (gli altri del gruppo salgono con lui)
  const drivers=[],used=new Set(),skipped=[];
  for(const p of who){if(drivers.length===n)break;const g=dayGroup(p);
    if(g&&used.has(g)){skipped.push(p);continue}drivers.push(p);if(g)used.add(g)}
  for(const p of who){if(drivers.length===n)break;if(!drivers.includes(p))drivers.push(p)}
  const rest=who.filter(p=>!drivers.includes(p));
  const cars=drivers.map(d=>({driver:d,passengers:[]}));
  const room=c=>POSTI-c.passengers.length;
  const byG={},singles=[];
  rest.forEach(p=>{const g=dayGroup(p);if(g)(byG[g]=byG[g]||[]).push(p);else singles.push(p)});
  const split=new Set(),together=new Set();
  Object.entries(byG).sort((a,c)=>c[1].length-a[1].length).forEach(([g,m])=>{
    const isPref=c=>dayGroup(c.driver)===g;
    const order=[...cars].sort((x,y)=>(isPref(x)?0:1)-(isPref(y)?0:1)||room(y)-room(x)||x.passengers.length-y.passengers.length);
    const fit=order.find(c=>room(c)>=m.length);
    if(fit){fit.passengers.push(...m);together.add(g);return}
    split.add(g);
    m.forEach(p=>{const c=[...cars].sort((x,y)=>(isPref(x)?0:1)-(isPref(y)?0:1)||room(y)-room(x))[0];c.passengers.push(p)});
  });
  singles.sort((a,c)=>b[c]-b[a]).forEach(p=>{const c=[...cars].sort((x,y)=>x.passengers.length-y.passengers.length)[0];c.passengers.push(p)});
  // nessuna auto senza passeggeri: sposta qualcuno dall'auto più piena, preferendo chi non viaggia col suo gruppo
  cars.filter(c=>!c.passengers.length).forEach(empty=>{
    const src=[...cars].sort((x,y)=>y.passengers.length-x.passengers.length)[0];
    if(src.passengers.length<2)return;
    const alone=p=>{const g=dayGroup(p);return !g||(dayGroup(src.driver)!==g&&src.passengers.filter(x=>dayGroup(x)===g).length<2)};
    const pick=src.passengers.slice().reverse().find(alone)||src.passengers[src.passengers.length-1];
    const g=dayGroup(pick);if(g&&!alone(pick)){split.add(g);together.delete(g)}
    src.passengers=src.passengers.filter(x=>x!==pick);empty.passengers.push(pick);
  });
  draft.cars=cars;
  // gruppi davvero insieme: tutti i presenti del gruppo nella stessa auto
  const gname=g=>state.groups[gIndex(g)].name;
  const present=[...new Set(who.map(groupOf).filter(Boolean))].filter(g=>who.filter(p=>dayGroup(p)===g).length>1);
  const carOf=p=>cars.findIndex(c=>c.driver===p||c.passengers.includes(p));
  const ok=present.filter(g=>new Set(who.filter(p=>dayGroup(p)===g).map(carOf)).size===1);
  const ko=present.filter(g=>!ok.includes(g));
  $('dist-note').textContent=(ok.length?`Insieme: ${ok.map(gname).join(', ')}. `:'')+(ko.length?`Divisi: ${ko.map(gname).join(', ')} (posti o auto insufficienti).`:'');
  setMsg('');renderComposer()};

function assignedElsewhere(id,ci){return draft.cars.some((c,i)=>i!==ci&&(c.driver===id||c.passengers.includes(id)))}

function renderCars(){
  const w=+$('trip-weight').value||1;
  $('cars').innerHTML=draft.cars.map((c,ci)=>{
    const opts=['<option value="">— guidatore —</option>',...[...draft.who].filter(id=>!assignedElsewhere(id,ci)).map(id=>`<option value="${id}" ${c.driver===id?'selected':''}>${esc(name(id))}</option>`)].join('');
    const pax=[...draft.who].filter(id=>id!==c.driver&&!assignedElsewhere(id,ci))
      .map(id=>`<button class="chip" data-car="${ci}" data-id="${id}" aria-pressed="${c.passengers.includes(id)}">${esc(name(id))}</button>`).join('')||'<span class="hint">Nessuno disponibile</span>';
    let led='';
    if(c.driver&&c.passengers.length){const pts=carPoints(c,w);
      led=`<div class="ledger">${Object.entries(pts).map(([k,v])=>`<div><span>${esc(name(k))}</span><span class="${v>0?'pos':'neg'}">${fmt(v)}</span></div>`).join('')}<div class="sum"><span>Σ auto</span><span>0</span></div></div>`}
    return `<div class="car"><div class="car-h"><span>AUTO ${ci+1}</span>${draft.cars.length>1?`<button class="x" data-rm="${ci}" aria-label="Rimuovi auto">×</button>`:''}</div>
      <select id="drv-${ci}" data-drv="${ci}" aria-label="Guidatore auto ${ci+1}">${opts}</select>
      <div class="chips">${pax}</div>${led}</div>`}).join('')+(draft.cars.length<10?'<button class="addcar" id="add-car"><span aria-hidden="true">+</span> Aggiungi auto</button>':'');
}
$('cars').onchange=e=>{const ci=e.target.dataset.drv;if(ci==null)return;const car=draft.cars[ci];car.driver=e.target.value;car.passengers=car.passengers.filter(x=>x!==car.driver);renderComposer()};
$('cars').onclick=e=>{
  if(e.target.closest('#add-car')){draft.cars.push({driver:'',passengers:[]});renderComposer();return}
  const rm=e.target.closest('[data-rm]');if(rm){draft.cars.splice(+rm.dataset.rm,1);renderComposer();return}
  const c=e.target.closest('.chip[data-car]');if(!c)return;const car=draft.cars[c.dataset.car];const id=c.dataset.id;
  car.passengers=car.passengers.includes(id)?car.passengers.filter(x=>x!==id):[...car.passengers,id];renderComposer()};
$('trip-weight').oninput=renderCars;

function validate(){
  const w=+$('trip-weight').value;
  if(!Number.isInteger(w)||w<1)return 'Il peso deve essere un numero intero da 1 in su.';
  for(const [i,c] of draft.cars.entries()){
    if(!c.driver)return `Auto ${i+1}: scegli chi guida.`;
    if(!c.passengers.length)return `Auto ${i+1}: aggiungi almeno un passeggero.`;
  }
  const left=[...draft.who].filter(id=>!draft.cars.some(c=>c.driver===id||c.passengers.includes(id)));
  if(left.length)return `Non assegnati: ${left.map(name).join(', ')}.`;
  return '';
}
function setMsg(t){$('msg').textContent=t}
function renderComposer(){
  renderWho();renderCars();
  const v=draft.who.size?validate():'Seleziona chi viaggia.';
  $('save').disabled=!!v;$('step-hint').textContent=draft.who.size?`${draft.who.size} persone`:'';
  if(!$('msg').dataset.sticky)setMsg(draft.who.size?v:'');
}
$('save').onclick=()=>{const v=validate();if(v){setMsg(v);return}
  if(state.sample){state={people:state.people,trips:[]}}
  state.trips.push({id:uid(),...(sync.me?{by:sync.me}:{}),...(isAdmin()?{}:{pend:true}),date:$('trip-date').value,weight:isAdmin()?(+$('trip-weight').value||1):1,note:$('trip-note').value.trim(),
    cars:draft.cars.map(c=>({driver:c.driver,passengers:[...c.passengers]}))});
  state.trips.sort((a,b)=>a.date.localeCompare(b.date));
  persist();draft={who:new Set(),cars:[{driver:'',passengers:[]}]};$('trip-note').value='';$('trip-weight').value=1;render();if(!isAdmin())snack('Viaggio inserito: lo conferma il creatore della squadra')};
$('clear').onclick=()=>{$('dist-note').textContent='';draft={who:new Set(),cars:[{driver:'',passengers:[]}]};render()};

// --- persone
$('add-person').onclick=()=>{if(!isAdmin())return;const n=$('new-person').value.trim();if(!n)return;
  if(listed().some(p=>p.name.toLowerCase()===n.toLowerCase())){$('new-person').select();return}
  state.people.push({id:uid(),name:n});$('new-person').value='';persist();render()};
$('new-person').onkeydown=e=>{if(e.key==='Enter')$('add-person').click()};
const inLog=id=>state.trips.some(t=>t.cars.some(c=>c.driver===id||c.passengers.includes(id)));
$('people').onchange=e=>{
  const gs=e.target.closest('[data-pgroup]');if(gs){const p=state.people.find(x=>x.id===gs.dataset.pgroup);if(gs.value)p.group=gs.value;else delete p.group;persist();render();return}
  const i=e.target.closest('[data-name]');if(!i)return;const p=state.people.find(x=>x.id===i.dataset.name);const n=i.value.trim();
  if(!n){i.value=p.name;return}
  if(listed().some(x=>x.id!==p.id&&x.name.toLowerCase()===n.toLowerCase())){$('pmsg').textContent=`Esiste già un viaggiatore di nome ${n}.`;i.value=p.name;return}
  $('pmsg').textContent='';p.name=n;persist();render()};
// --- azioni sulla persona: archivia / ripristina / elimina definitivamente (con anteprima degli effetti)
let pMenu=null,pMode='';   // pMode: '' menu · 'group' · 'rename' · 'del'
function personPanel(p,c){
  const inT=t=>t.cars.some(x=>x.driver===p.id||x.passengers.includes(p.id));
  const nN=state.trips.filter(t=>!t.hist&&inT(t)).length,nH=state.trips.filter(t=>t.hist&&inT(t)).length;
  const g=groupOf(p.id);
  let h=`<div class="pact"><p class="hint" style="margin:0">${nN?`${nN} ${nN===1?'viaggio':'viaggi'}`:'Nessun viaggio registrato'}${nH?` (più ${nH} dello storico)`:''} · punti ${fmt(p.v)||'0'}</p>`;
  if(!pMode){
    h+=`<div class="pmenu">
      ${!isAdmin()?'':(p.archived?`<button data-act="rest" data-id="${p.id}"><span>Ripristina</span><span class="pm-val">torna tra gli attivi</span></button>`
                 :`<button data-act="arch" data-id="${p.id}"><span>Archivia</span><span class="pm-val">nasconde, i punti restano</span></button>`)+`
      <button data-act="m-rename" data-id="${p.id}"><span>Rinomina</span><span class="pm-val">›</span></button>
      ${window.__inTeam&&joined[p.id]?`<button data-act="unlink" data-id="${p.id}"><span>Libera il nome</span><span class="pm-val">scollega il telefono</span></button>`:''}
      <button class="danger" data-act="m-del" data-id="${p.id}"><span>${window.__inTeam?'Espelli dalla squadra':'Elimina'}</span><span class="pm-val">›</span></button>`}
    </div>`;
  }else if(pMode==='group'){
    h+=`<b>Zona di ${esc(p.name)}</b><div class="pmenu">
      ${state.groups.map(x=>`<button data-act="setg" data-g="${x.id}" data-id="${p.id}" aria-pressed="${g===x.id}"><span>${gDot(x.id)} ${esc(x.name)}</span><span class="pm-val">${g===x.id?'✓':''}</span></button>`).join('')}
      <button data-act="setg" data-g="" data-id="${p.id}" aria-pressed="${!g}"><span>Nessuna zona</span><span class="pm-val">${!g?'✓':''}</span></button>
      <button data-act="newg" data-id="${p.id}"><span>+ Nuova zona con ${esc(p.name)}</span><span class="pm-val"></span></button>
    </div><button class="ghost" data-act="back" data-id="${p.id}">Indietro</button>`;
  }else if(pMode==='rename'){
    h+=`<label class="f">Nuovo nome<input type="text" id="pren-${p.id}" data-ren="${p.id}" value="${esc(p.name)}" autocomplete="off"></label>
      <span class="msg" id="pren-msg"></span>
      <div class="m-grid2"><button data-act="back" data-id="${p.id}">Annulla</button><button class="primary" data-act="ren" data-id="${p.id}">Salva</button></div>`;
  }else{
    h+=`<div class="pdel"><b>${window.__inTeam?'Espellere':'Eliminare'} ${esc(p.name)}${window.__inTeam?' dalla squadra':''}?</b>
      <span>Sparisce da elenchi, classifica e scelte del guidatore.</span>
      <span>I viaggi già registrati restano com'erano, quindi <b>i punti degli altri non cambiano</b>.</span>
      ${p.v?`<span>I suoi ${fmt(p.v)} punti restano nel totale della squadra, così la somma resta zero.</span>`:''}
      ${typeof sync!=='undefined'&&sync.code?'<span>La modifica vale per tutta la squadra.</span>':''}</div>
      <div class="m-grid2"><button data-act="back" data-id="${p.id}">Annulla</button><button class="danger solid" data-act="del" data-id="${p.id}">${window.__inTeam?'Espelli':'Elimina'}</button></div>`;
  }
  return h+'</div>';
}
function renamePerson(id){
  const p=state.people.find(x=>x.id===id),i=$('pren-'+id);if(!i)return;const n=i.value.trim();
  if(!n){$('pren-msg').textContent='Scrivi un nome.';return}
  if(listed().some(x=>x.id!==id&&x.name.toLowerCase()===n.toLowerCase())){$('pren-msg').textContent=`Esiste già un viaggiatore di nome ${n}.`;return}
  const old=p.name;p.name=n;pMenu=null;pMode='';persist();render();if(old!==n)snack(`${old} ora si chiama ${n}`)}
$('people').onkeydown=e=>{if(e.key==='Enter'&&e.target.dataset.ren){e.preventDefault();renamePerson(e.target.dataset.ren)}};
$('people').onclick=e=>{const b=e.target.closest('[data-act]');if(!b)return;const id=b.dataset.id,p=state.people.find(x=>x.id===id);const a=b.dataset.act;
  const unDraft=()=>{draft.who.delete(id);draft.cars.forEach(c=>{if(c.driver===id)c.driver='';c.passengers=c.passengers.filter(x=>x!==id)})};
  const done=msg=>{pMenu=null;pMode='';persist();render();if(msg)snack(msg)};
  const reveal=()=>{const el=document.querySelector('.pact');if(el)el.scrollIntoView({block:'nearest',behavior:'smooth'})};
  if(a==='menu'){if(!isAdmin())return;pMenu=pMenu===id?null:id;pMode='';render();reveal();return}
  if(['arch','rest','m-rename','m-del','del','ren','unlink'].includes(a)&&!isAdmin())return;
  if(a==='unlink'){if(!fsdb||!sync.code||!p)return;const old=joined[id]||{};   // il vecchio proprietario non può riprendersi il nome da solo
    gref().collection('iscritti').doc(id).set({pid:id,left:true,prevUid:old.uid||'',prevDev:old.dev||'',at:new Date().toISOString()}).then(()=>{delete joined[id];pMenu=null;render();snack(`${p.name}: nome liberato, ora può scegliere un altro telefono`)}).catch(()=>snack('Non riesco a liberare il nome: riprova.'));return}
  if(a==='m-group'){pMode='group';render();reveal();return}
  if(a==='m-rename'){pMode='rename';render();const i=$('pren-'+id);if(i){i.focus();i.select()}return}
  if(a==='m-del'){pMode='del';render();reveal();return}
  if(a==='back'){pMode='';render();return}
  if(a==='ren'){renamePerson(id);return}
  if(a==='setg'){if(b.dataset.g)p.group=b.dataset.g;else delete p.group;done(b.dataset.g?`${p.name} → ${state.groups[gIndex(b.dataset.g)].name}`:`${p.name} senza zona`);return}
  if(a==='newg'){let k=state.groups.length+1;while(state.groups.some(x=>x.name==='Zona '+k))k++;const g={id:uid(),name:'Zona '+k};state.groups.push(g);p.group=g.id;done(`Creato ${g.name} con ${p.name}`);return}
  if(a==='arch'){p.archived=true;unDraft();done(p.name+' archiviato');return}
  if(a==='rest'){delete p.archived;done(p.name+' ripristinato');return}
  if(a==='del'){p.deleted=true;delete p.archived;state.groups.forEach(g=>{g.members=(g.members||[]).filter(x=>x!==id)});unDraft();done(p.name+(window.__inTeam?' espulso dalla squadra':' eliminato'));return}
};

// --- saldi
function renderBalances(){
  const b=balances();const cnt={};state.people.forEach(p=>cnt[p.id]={g:0,p:0});state.trips.forEach(t=>t.pend||t.cars.forEach(c=>{if(cnt[c.driver])cnt[c.driver].g++;c.passengers.forEach(x=>{if(cnt[x])cnt[x].p++})}));
  const all=state.people.map(p=>({...p,v:b[p.id]}));
  const arr=all.filter(x=>!x.archived&&!x.deleted).sort((a,c)=>a.v-c.v||tie(a.id)-tie(c.id)||a.name.localeCompare(c.name));
  const max=Math.max(1,...arr.map(x=>Math.abs(x.v)));
  // classifica a barre: a sinistra il nome (in una colonna sua, così non tocca le barre),
  // poi la linea centrale: verso sinistra i punti negativi, verso destra i positivi, lunghe in proporzione; in fondo il punteggio
  const rk=[...arr].reverse();const nextId=arr.length?arr[0].id:null;
  $('bars').innerHTML=rk.map(x=>{const w=Math.abs(x.v)/max*100;
    return `<div class="dv-row${x.id===nextId?' is-next':''}">
      <span class="dv-lab"><b>${esc(x.name)}</b></span>
      <div class="dv-l">${x.v<0?`<i class="dv-bar neg" style="width:${w}%"></i>`:''}</div>
      <div class="dv-r">${x.v>0?`<i class="dv-bar pos" style="width:${w}%"></i>`:''}</div>
      <span class="dv-v ${x.v>0?'pos':x.v<0?'neg':''}">${fmt(x.v)||'0'}</span></div>`}).join('');
  const startSum=Object.values((state.start&&state.start.points)||{}).reduce((a,v)=>a+(+v||0),0);
  const total=all.reduce((s,x)=>s+x.v,0)-startSum;
  $('zero').className='zero'+(total?' bad':'');$('zero').innerHTML=`Σ punti <b>${fmt(total)||'0'}</b>`;
  const pool=draft.who.size?arr.filter(x=>draft.who.has(x.id)):arr;
  $('next').innerHTML=pool.length?`<span class="hint">Prossimo a guidare${draft.who.size?' tra chi viaggia':''}</span> <b>${esc(pool[0].name)}</b> <span class="hint">${fmt(pool[0].v)||'0'}${pool[1]?` · poi ${esc(pool[1].name)} (${fmt(pool[1].v)||'0'})`:''}</span>`:'<span class="hint">Nessuna persona</span>';
  $('trips-count').textContent=`${state.trips.filter(t=>!t.pend).length} viaggi nel registro`;
  const btn=p=>inLog(p.id)?`<button class="x" data-act="arch" data-id="${p.id}" aria-label="Archivia ${esc(p.name)}">archivia</button>`:`<button class="x" data-act="del" data-id="${p.id}" aria-label="Elimina ${esc(p.name)}">×</button>`;
  // tabella viaggiatori: 4 nomi per colonna, attivi in ordine alfabetico e poi archiviati
  const act=all.filter(x=>!x.archived&&!x.deleted).sort((a,c)=>a.name.localeCompare(c.name));
  const arch=all.filter(x=>x.archived&&!x.deleted).sort((a,c)=>a.name.localeCompare(c.name));
  const focused=document.activeElement&&document.activeElement.dataset.name;
  $('people').innerHTML=[...act,...arch].map(p=>`<div class="pcell ${p.archived?'off':'on'}"><button class="pname" data-act="menu" data-id="${p.id}" aria-expanded="${pMenu===p.id}">${esc(p.name)}</button>${!p.archived?dotsOf(p.id):''}${p.archived?'<span class="tag">archiviato</span>':''}${window.__inTeam&&!p.archived?(joined[p.id]?`<span class="tag joined" title="Unito il ${new Date(joined[p.id].at).toLocaleDateString('it-IT')}">unito</span>`:'<span class="tag notjoined">non ancora</span>'):''}${isAdmin()?'':'<!--'}<button class="x pmore" data-act="menu" data-id="${p.id}" aria-expanded="${pMenu===p.id}" aria-label="Azioni per ${esc(p.name)}">⋯</button>${isAdmin()?'':'-->'}</div>${pMenu===p.id?personPanel(p,cnt[p.id]):''}`).join('');
  if(focused&&$('pn-'+focused))$('pn-'+focused).focus();
  $('new-person').closest('.m-add').hidden=!isAdmin();
  $('people-hint').textContent=isAdmin()?'Tocca un nome per archiviarlo, rinominarlo o espellerlo dalla squadra.':'Solo chi ha creato la squadra può aggiungere, archiviare o espellere i partecipanti.';
  const nj=act.filter(p=>joined[p.id]).length;
  $('people-count').textContent=`${act.length} attivi${window.__inTeam?` · ${nj} uniti`:''}${arch.length?` · ${arch.length} archiviati`:''}`;
}

// --- registro (filtri per anno e persona, a pagine da 30)
let shown=30;
function fillFilters(){
  const ys=[...new Set(state.trips.map(t=>t.date.slice(0,4)))].sort().reverse();
  const y=$('year').value,pf=$('pfilter').value;
  $('year').innerHTML='<option value="">Tutti</option>'+ys.map(v=>`<option ${v===y?'selected':''}>${v}</option>`).join('');
  $('pfilter').innerHTML='<option value="">Tutte</option>'+listed().map(p=>`<option value="${p.id}" ${p.id===pf?'selected':''}>${esc(p.name)}</option>`).join('');
}
try{$('showhist').checked=localStorage.getItem('turni-auto-showhist')==='1'}catch(e){}
$('showhist').onchange=()=>{try{localStorage.setItem('turni-auto-showhist',$('showhist').checked?'1':'0')}catch(e){}shown=30;renderLog()};
$('year').onchange=$('pfilter').onchange=()=>{shown=30;renderLog()};
$('more').onclick=()=>{shown+=30;renderLog()};
function renderLog(){
  fillFilters();
  const nNew=state.trips.filter(t=>!t.hist).length,nH=state.trips.length-nNew;
  $('log-sum').textContent=`${nNew} ${nNew===1?'viaggio':'viaggi'}`;
  $('sample-flag').innerHTML=state.sample?'<span class="sample">Dati di esempio</span>':'';
  const y=$('year').value,pf=$('pfilter').value,sh=$('showhist').checked;
  const list=state.trips.filter(t=>(sh||!t.hist)&&(!y||t.date.startsWith(y))&&(!pf||t.cars.some(c=>c.driver===pf||c.passengers.includes(pf)))).reverse();
  if(!list.length){
    $('log').innerHTML=`<p class="hint lt-empty">${(y||pf||sh)?'Nessun viaggio con questi filtri.':'Nessun viaggio ancora. Tocca <b>Inserisci viaggio</b> nella scheda Viaggio per registrare il primo.'}</p>`;
    $('more').hidden=true;$('log-count').textContent=(!sh&&nH)?`${nH} viaggi storici nascosti`:'';return}
  const gone=id=>{const q=state.people.find(x=>x.id===id);return q&&q.deleted};
  const nm=id=>id===pf?`<b class="me">${esc(name(id))}</b>`:gone(id)?`<span class="gone" title="eliminato">${esc(name(id))}</span>`:esc(name(id));
  let lastM='';
  $('log').innerHTML=list.slice(0,shown).map(t=>{
    const d=new Date(t.date+'T12:00');
    const m=d.toLocaleDateString('it-IT',{month:'long',year:'numeric'});
    const head=m!==lastM?`<h3 class="lm">${m}</h3>`:'';lastM=m;
    let mine='';
    if(pf){const v=t.cars.reduce((a,c)=>a+(c.driver===pf?t.weight*c.passengers.length:c.passengers.includes(pf)?-t.weight:0),0);
      mine=`<span class="lpill ${v>0?'pos':'neg'}">${esc(name(pf))} ${fmt(v)}</span>`}
    const meta=[t.note?`<span>${esc(t.note)}</span>`:'',t.weight!==1?`<span class="tag">peso ×${t.weight}</span>`:'',t.hist?'<span class="tag">storico</span>':'',t.pend?'<span class="tag" style="color:var(--amber)">da confermare</span>':'',t.by&&!t.hist?`<span>inserito da ${esc(t.by)}</span>`:'',mine].filter(Boolean).join('');
    const bConf=t.pend&&isAdmin()?`<button class="x" data-conf="${t.id}">conferma</button>`:'',bDel=canDelTrip(t)?`<button class="x" data-trip="${t.id}" aria-label="Elimina il viaggio del ${d.toLocaleDateString('it-IT')}">elimina</button>`:'';
    return head+`<article class="lt${t.hist?' hist':''}">
      <div class="lt-date"><b>${d.getDate()}</b><span>${d.toLocaleDateString('it-IT',{weekday:'short'})}</span></div>
      <div class="lt-main">
        ${meta?`<div class="lt-meta">${meta}</div>`:''}
        ${t.cars.map(c=>`<div class="lt-car">
          <div class="lt-drv"><span class="lt-ico" aria-hidden="true">🚗</span>${nm(c.driver)}<span class="lpill pos">${fmt(t.weight*c.passengers.length)}</span></div>
          <div class="lt-pax">${c.passengers.map(nm).join(', ')} <span class="neg">${fmt(-t.weight)} ${c.passengers.length>1?'a testa':''}</span></div>
        </div>`).join('')}
        ${bConf||bDel?`<div class="lt-foot" style="gap:16px">${bConf}${bDel}</div>`:''}
      </div>
    </article>`}).join('');
  const end=shown>=list.length;
  $('more').hidden=end;
  $('log-count').textContent=`${Math.min(shown,list.length)} di ${list.length}`+((!sh&&nH)?` · ${nH} storici nascosti`:'');
}
$('log').onclick=e=>{const cf=e.target.closest('[data-conf]');
  if(cf){if(!isAdmin()){snack('Solo il creatore della squadra può confermare i viaggi');return}
    const t=state.trips.find(x=>x.id===cf.dataset.conf);if(t){delete t.pend;persist();render();snack('Viaggio confermato')}return}
  const b=e.target.closest('[data-trip]');if(!b)return;
  if(!canDelTrip(state.trips.find(t=>t.id===b.dataset.trip))){snack('Solo il creatore della squadra può eliminare i viaggi registrati: tu puoi eliminare solo i tuoi viaggi ancora da confermare');render();return}
  if(b.dataset.confirm){state.trips=state.trips.filter(t=>t.id!==b.dataset.trip);persist();render()}
  else{b.dataset.confirm='1';b.textContent='conferma?';b.style.color='var(--neg)'}};

// --- dati: import / export JSON
const fresh=()=>{draft={who:new Set(),cars:[{driver:'',passengers:[]}]}};
const dmsg=(t,bad)=>{$('dmsg').textContent=t;$('dmsg').style.color=bad?'var(--neg)':'var(--teal)'};
const exportData=()=>({app:'turni-auto',version:1,appVersion:APP_VERSION,exported:new Date().toISOString(),people:state.people,groups:state.groups,start:state.start||null,trips:state.trips});

// valida e normalizza un JSON importato; lancia un messaggio leggibile se non va
function parseImport(text){
  let s;try{s=JSON.parse(text)}catch(e){throw 'Il file non è un JSON valido.'}
  if(!s||!Array.isArray(s.people)||!Array.isArray(s.trips))throw 'Mancano le liste "people" e "trips": non sembra un file esportato da questa app.';
  const ids=new Set();
  s.people.forEach(p=>{if(!p||!p.id||!p.name)throw 'Una persona non ha id o nome.';ids.add(String(p.id))});
  s.trips.forEach((t,i)=>{
    if(!t||!/^\d{4}-\d{2}-\d{2}$/.test(t.date||''))throw `Viaggio ${i+1}: data mancante o non valida (formato AAAA-MM-GG).`;
    if(!Array.isArray(t.cars)||!t.cars.length)throw `Viaggio del ${t.date}: nessuna auto.`;
    t.weight=Math.max(1,Math.round(+t.weight||1));t.id=t.id||uid();
    t.cars.forEach(c=>{if(!ids.has(c.driver)||!Array.isArray(c.passengers)||c.passengers.some(x=>!ids.has(x)))throw `Viaggio del ${t.date}: compare una persona che non è nell'elenco.`});
  });
  if(s.start){const pts=s.start.points||{};for(const k in pts)pts[k]=Math.round(+pts[k]||0);
  }
  const groups=Array.isArray(s.groups)?s.groups.filter(g=>g&&g.id&&g.name):[];
  migrateGroups({people:s.people,groups});
  return {people:s.people,groups,start:s.start||null,trips:s.trips.sort((a,b)=>a.date.localeCompare(b.date))};
}
let pending=null;
function stageImport(text,label){
  try{pending=parseImport(text)}catch(e){pending=null;$('import-confirm').hidden=true;dmsg(typeof e==='string'?e:'Importazione non riuscita.',true);return}
  const nArch=pending.people.filter(p=>p.archived).length;
  $('import-summary').textContent=`${label}: ${pending.people.length} persone${nArch?` (${nArch} archiviate)`:''}, ${pending.trips.length} viaggi${pending.start?', punti di partenza incluso':''}.`;
  $('import-confirm').hidden=false;dmsg('');
  if(typeof sync!=='undefined'&&sync.code)$('import-summary').textContent+=' Attenzione: sei in una squadra condivisa, i dati verranno sostituiti anche per i colleghi.';
}
$('import-ok').onclick=()=>{if(!pending)return;state=pending;pending=null;persist();fresh();$('import-confirm').hidden=true;render();dmsg('Dati importati')};
$('import-cancel').onclick=()=>{pending=null;$('import-confirm').hidden=true;dmsg('')};
const readFile=f=>{if(!f)return;const r=new FileReader();r.onload=()=>stageImport(r.result,f.name);r.onerror=()=>dmsg('Impossibile leggere il file.',true);r.readAsText(f)};
$('import-file').onchange=e=>{readFile(e.target.files[0]);e.target.value=''};
const dp=document.body;
dp.ondragover=e=>{if(![...(e.dataTransfer?.types||[])].includes('Files'))return;e.preventDefault();dp.classList.add('drop')};
dp.ondragleave=e=>{if(!e.relatedTarget)dp.classList.remove('drop')};
dp.ondrop=e=>{if(!e.dataTransfer?.files?.length)return;e.preventDefault();dp.classList.remove('drop');readFile(e.dataTransfer.files[0])};
$('restore').onclick=()=>stageImport($('json').value,'Testo incollato');

// esportazione: file .json tramite il salvataggio del visualizzatore, altrimenti copia negli appunti
let downloads=null;
if(window.claude&&claude.use)claude.use('downloads').then(d=>{downloads=d}).catch(()=>{});
function copyJSON(){const s=JSON.stringify(exportData(),null,1);$('json').value=s;$('json').closest('details').open=true;
  const w=navigator.clipboard?Promise.resolve().then(()=>navigator.clipboard.writeText(s)):Promise.reject();
  return w.then(()=>dmsg('JSON copiato negli appunti'),()=>{$('json').select();dmsg('JSON selezionato: copialo con Ctrl+C')})}
// fuori dal visualizzatore di Claude (file aperto in locale) si salva direttamente dal browser
const inViewer=!!(window.claude&&claude.use);
const blobToB64=blob=>new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=ko;r.readAsDataURL(blob)});
async function saveLocal(name,text,mime='application/json',ext='.json',desc='JSON'){
  const blob=text instanceof Blob?text:new Blob([text],{type:mime});
  if(window.showSaveFilePicker){
    try{const h=await showSaveFilePicker({suggestedName:name,types:[{description:desc,accept:{[mime]:[ext]}}]});
      const w=await h.createWritable();await w.write(blob);await w.close();return 'saved'}
    catch(e){if(e&&e.name==='AbortError')return 'aborted'}
  }
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return 'saved';
}
$('export').onclick=async()=>{
  const name=`turni-auto-${new Date().toISOString().slice(0,10)}.json`;
  const text=JSON.stringify(exportData(),null,1);
  if(!inViewer){
    try{const r=await saveLocal(name,text);dmsg(r==='aborted'?'Esportazione annullata':'Esportato '+name)}catch(e){copyJSON()}
    return}
  if(!downloads){copyJSON();return}
  try{await downloads.save({filename:name,data:text});dmsg('Esportato '+name)}
  catch(e){if(e&&e.code==='declined')dmsg('Esportazione annullata');else{downloads=null;copyJSON()}}
};
$('copy').onclick=copyJSON;
$('reset').onclick=e=>{if(!e.target.dataset.c){e.target.dataset.c=1;e.target.textContent='Conferma azzeramento';return}
  state={people:[],trips:[],start:null,groups:[]};persist();fresh();e.target.textContent='Azzera tutto';delete e.target.dataset.c;render()};
$('reimport').onclick=e=>{if(!e.target.dataset.c){e.target.dataset.c=1;e.target.textContent='Conferma: sostituisce i dati attuali';return}
  state=JSON.parse(JSON.stringify(IMPORTED));state.groups=[];persist();fresh();e.target.textContent='Ricarica storico importato';delete e.target.dataset.c;render()};
// --- riquadri comprimibili (scelta ricordata in questo browser)
let folds={};try{folds=JSON.parse(localStorage.getItem('turni-auto-fold'))||{}}catch(e){}
function applyFold(k){const sec=document.querySelector(`[data-panel="${k}"]`),btn=sec.querySelector('[data-fold]');
  sec.classList.toggle('collapsed',!!folds[k]);btn.setAttribute('aria-expanded',String(!folds[k]));btn.title=folds[k]?'Mostra':'Nascondi'}
document.querySelectorAll('[data-fold]').forEach(b=>{const k=b.dataset.fold;applyFold(k);
  b.onclick=()=>{folds[k]=!folds[k];try{localStorage.setItem('turni-auto-fold',JSON.stringify(folds))}catch(e){}applyFold(k)}});
// --- immagine JPEG: grafico dei saldi + ultimi 5 viaggi
async function buildImage(){
  try{await document.fonts.ready}catch(e){}
  const cs=getComputedStyle(document.documentElement),tk=k=>cs.getPropertyValue(k).trim();
  const C={bg:tk('--panel'),fg:tk('--fg'),mu:tk('--muted'),ln:tk('--line'),am:tk('--amber'),te:tk('--teal'),ne:tk('--neg')};
  const F=tk('--sans');
  const b=balances();
  const arr=active().map(p=>({...p,v:b[p.id]})).sort((a,c)=>a.v-c.v||tie(a.id)-tie(c.id)||a.name.localeCompare(c.name));
  const trips=state.trips.filter(t=>!t.pend).sort((a,c)=>a.date.localeCompare(c.date)).slice(-5).reverse();
  const W=1080,P=56,rowH=46,S=2;
  const tripH=t=>40+t.cars.length*34+18;
  const H=P+70+40+arr.length*rowH+60+44+trips.reduce((s,t)=>s+tripH(t),0)+(trips.length?0:40)+P;
  const cv=document.createElement('canvas');cv.width=W*S;cv.height=H*S;const x=cv.getContext('2d');x.scale(S,S);
  x.fillStyle=C.bg;x.fillRect(0,0,W,H);
  const txt=(t,X,Y,font,col,al='left')=>{x.font=font;x.fillStyle=col;x.textAlign=al;x.textBaseline='middle';x.fillText(t,X,Y)};
  const fit=(t,font,w)=>{x.font=font;if(x.measureText(t).width<=w)return t;while(t.length>1&&x.measureText(t+'…').width>w)t=t.slice(0,-1);return t+'…'};
  let y=P+18;
  txt('Colleg',P,y,`700 34px ${F}`,C.fg);x.font=`700 34px ${F}`;const w1=x.measureText('Colleg').width;
  txt('Auto',P+w1,y,`700 34px ${F}`,C.am);const w2=x.measureText('Auto ').width;txt('by M.T. · v'+APP_VERSION,P+w1+w2+4,y+4,`500 16px ${F}`,C.mu);
  txt('Punti al '+new Date().toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'}),W-P,y,`400 20px ${F}`,C.mu,'right');
  y+=44;x.fillStyle=C.ln;x.fillRect(P,y,W-2*P,1);
  // grafico
  y+=36;txt('PUNTI',P,y,`600 16px ${F}`,C.mu);
  const max=Math.max(1,...arr.map(a=>Math.abs(a.v)));
  const gcol=gid=>cs.getPropertyValue('--g'+(gIndex(gid)%6+1)).trim()||C.mu;
  const rr=(X,Y,w,h,r)=>{x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath()};
  y+=24;const top=y;const rk=[...arr].reverse();
  const nameW=300,vw=60,cx0=P+nameW,cx1=W-P-vw,mid=(cx0+cx1)/2,half=(cx1-cx0)/2-6;
  rk.forEach((a,i)=>{const cy=top+i*rowH+rowH/2;
    const w=Math.abs(a.v)/max*half;
    if(a.v){x.save();x.globalAlpha=0.32;x.fillStyle=a.v>0?C.te:C.ne;rr(a.v>0?mid:mid-w,cy-17,w,34,7);x.fill();x.restore()}
    txt(fit(a.name,`600 21px ${F}`,nameW-16),P,cy,`600 21px ${F}`,i===rk.length-1?C.am:C.fg);
    txt(fmt(a.v)||'0',W-P,cy,`700 22px ${F}`,a.v>0?C.te:a.v<0?C.ne:C.fg,'right')});
  x.fillStyle=C.fg;x.globalAlpha=0.5;x.fillRect(mid-1,top-4,2,rk.length*rowH+8);x.globalAlpha=1;
  y=top+arr.length*rowH+24;
  if(arr.length){txt('Prossimo a guidare: ',P,y,`400 20px ${F}`,C.mu);x.font=`400 20px ${F}`;txt(arr[0].name,P+x.measureText('Prossimo a guidare: ').width,y,`700 20px ${F}`,C.am)}
  y+=36;x.fillStyle=C.ln;x.fillRect(P,y,W-2*P,1);
  // ultimi viaggi
  y+=32;txt('ULTIMI 5 VIAGGI',P,y,`600 16px ${F}`,C.mu);y+=12;
  if(!trips.length){y+=28;txt('Nessun viaggio registrato',P,y,`400 20px ${F}`,C.mu)}
  trips.forEach(t=>{y+=28;
    const d=new Date(t.date+'T12:00').toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
    txt(d,P,y,`600 20px ${F}`,C.am);x.font=`600 20px ${F}`;const dw=x.measureText(d).width;
    const extra=[t.note,t.weight!==1?'peso ×'+t.weight:'',t.hist?'storico':''].filter(Boolean).join(' · ');
    if(extra)txt(fit(' · '+extra,`400 18px ${F}`,W-2*P-dw),P+dw,y,`400 18px ${F}`,C.mu);
    y+=12;
    t.cars.forEach(c=>{y+=34-12;const cy=y+6;
      txt(fit(name(c.driver),`700 20px ${F}`,190),P+18,cy,`700 20px ${F}`,C.fg);
      txt(fmt(t.weight*c.passengers.length),P+230,cy,`600 20px ${F}`,C.te,'right');
      txt(fit(c.passengers.map(name).join(', '),`400 20px ${F}`,W-2*P-360),P+256,cy,`400 20px ${F}`,C.fg);
      txt(fmt(-t.weight)+' cad.',W-P,cy,`600 18px ${F}`,C.ne,'right');y+=12;});
    y+=18;x.fillStyle=C.ln;x.fillRect(P,y-6,W-2*P,1);});
  return await new Promise(r=>cv.toBlob(r,'image/jpeg',0.92));
}
// condivisione: usa il menu Condividi del telefono (WhatsApp, Telegram, …) se il browser lo consente,
// altrimenti salva il JPEG (nell'app Claude per iPhone il salvataggio apre comunque il menu Condividi)
$('share-img').onclick=async()=>{
  const im=t=>{$('imsg').textContent=t};
  const name=`collegauto-punti-${new Date().toISOString().slice(0,10)}.jpg`;
  let blob;try{blob=await buildImage()}catch(e){}
  if(!blob){im('Impossibile creare l\'immagine.');return}
  const file=new File([blob],name,{type:'image/jpeg'});
  if(!inViewer&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title:'CollegAuto · Punti',text:'Punti CollegAuto al '+new Date().toLocaleDateString('it-IT')});im('')}
    catch(e){if(!e||e.name!=='AbortError')im('Condivisione non riuscita: usa Salva immagine e poi invia il file.')}
    return}
  $('export-img').click();
  im(inViewer?'':'Il browser non permette la condivisione diretta: immagine salvata, inviala dalla galleria o dai file.');
};
$('export-img').onclick=async()=>{
  const im=t=>{$('imsg').textContent=t};
  const name=`collegauto-punti-${new Date().toISOString().slice(0,10)}.jpg`;
  let blob;try{blob=await buildImage()}catch(e){im('Impossibile creare l\'immagine.');return}
  if(!blob){im('Impossibile creare l\'immagine.');return}
  if(!inViewer){try{const r=await saveLocal(name,blob,'image/jpeg','.jpg','Immagine JPEG');im(r==='aborted'?'':'Salvata '+name)}catch(e){im('Salvataggio non riuscito.')}return}
  if(!downloads){im('Il salvataggio di file non è disponibile qui: apri il file HTML in locale.');return}
  try{await downloads.save({filename:name,data:blob});im('Salvata '+name)}
  catch(e){im(e&&e.code==='declined'?'':'Salvataggio non riuscito.')}
};
// --- punti di partenza: sezione dedicata, modificabile (numeri interi; la somma può non essere zero: chi non c'è più ha portato via i suoi punti)
let spEdit=false;
function renderStart(){
  const st=state.start;
  const locked=!!window.__startLocked;if(locked)spEdit=false;
  $('start-edit').hidden=spEdit||locked;$('start-actions').hidden=!spEdit;$('start-box').classList.toggle('editing',spEdit);
  $('start-note').textContent=st?`Punti con cui ognuno è partito il ${new Date(st.date+'T12:00').toLocaleDateString('it-IT')}, prima dei viaggi registrati qui. I viaggi si sommano a questi valori.${locked?' Solo chi ha creato la squadra può modificarli.':''} Ogni modifica compare nel Registro → Modifiche.`:'Nessun punto di partenza: tutti partono da 0.';
  const ppl=listed().map(p=>({...p,v:(st&&st.points[p.id])||0})).sort((a,c)=>a.v-c.v||tie(a.id)-tie(c.id)||a.name.localeCompare(c.name));
  if(!spEdit){
    $('start-box').innerHTML=(st?ppl:[]).map(p=>`<div class="sp${p.archived?' off':''}"><span>${esc(p.name)}</span><b class="${p.v>0?'pos':p.v<0?'neg':''}">${fmt(p.v)||'0'}</b></div>`).join('');
    return}
  $('start-box').innerHTML=ppl.map(p=>`<label class="sp edit${p.archived?' off':''}"><span>${esc(p.name)}</span><input type="number" step="1" inputmode="numeric" id="sp-${p.id}" data-sp="${p.id}" value="${p.v}"></label>`).join('');
  spCheck();
}
function spCheck(){const vals=[...document.querySelectorAll('[data-sp]')].map(i=>i.value===''?0:+i.value);
  const bad=vals.some(v=>!Number.isInteger(v)),sum=vals.reduce((a,v)=>a+v,0);
  $('start-msg').textContent=bad?'Solo numeri interi.':`Totale ${fmt(sum)||'0'}`;
  $('start-msg').style.color=bad?'var(--neg)':'var(--muted)';
  $('start-save').disabled=bad;return !bad}
$('start-edit').onclick=()=>{spEdit=true;renderStart();const f=document.querySelector('[data-sp]');if(f)f.focus()};
$('start-cancel').onclick=()=>{spEdit=false;renderStart()};
$('start-box').oninput=spCheck;
$('start-save').onclick=()=>{if(!spCheck())return;
  const pts={};document.querySelectorAll('[data-sp]').forEach(i=>{const v=+i.value||0;if(v)pts[i.dataset.sp]=v});
  if(!state.start)state.start={date:todayISO(),points:{},rank:{}};
  state.start.points=pts;spEdit=false;persist();render();snack('Punti di partenza salvati')};

function render(){renderComposer();renderBalances();renderGroups();renderLog();renderStart()}
render();
// --- schede (mobile): una sezione per volta, guidata da #hash
// --- inserimento guidato di un viaggio: data → numero auto → per ogni auto guidatore e passeggeri → riepilogo
let wz=null;
const wzSteps=()=>['data','auto',...wz.cars.flatMap((c,i)=>['drv'+i,'pax'+i]),'fine'];
const todayISO=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const isoShift=(iso,n)=>{const d=new Date(iso+'T12:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const dLong=iso=>new Date(iso+'T12:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
function wzOpen(){wz={k:0,date:todayISO(),n:1,cars:[{driver:'',passengers:[]}],weight:1,note:''};
  if(location.hash!=='#nuovo')location.hash='nuovo';else wzShow()}
function wzClose(){if(location.hash==='#nuovo')history.back();else{$('wz').hidden=true;document.body.classList.remove('wz-on')}}
function wzShow(){if(!wz){wz={k:0,date:todayISO(),n:1,cars:[{driver:'',passengers:[]}],weight:1,note:''}}
  $('wz').hidden=false;document.body.classList.add('wz-on');wzRender()}
function wzSetCars(n){wz.n=n;while(wz.cars.length<n)wz.cars.push({driver:'',passengers:[]});wz.cars.length=n}
const takenElsewhere=(id,ci)=>wz.cars.some((c,i)=>i!==ci&&(c.driver===id||c.passengers.includes(id)));
function wzPeople(){const b=balances();return active().map(p=>({...p,v:b[p.id]})).sort((a,c)=>a.v-c.v||tie(a.id)-tie(c.id)||a.name.localeCompare(c.name))}
const pBtn=(p,sel,extra='')=>`<button class="wz-p${sel?' sel':''}" data-p="${p.id}" aria-pressed="${sel}">${dotsOf(p.id)}<span class="nm">${esc(p.name)}</span>${extra}<span class="pt ${p.v>0?'pos':p.v<0?'neg':''}">${fmt(p.v)||'0'}</span></button>`;
function wzRender(){
  const steps=wzSteps(),st=steps[wz.k];
  $('wz-step').textContent=`Passo ${wz.k+1} di ${steps.length}`;
  $('wz-fill').style.width=((wz.k+1)/steps.length*100)+'%';
  $('wz-back').style.visibility=wz.k?'visible':'hidden';
  let title='',body='',next='Avanti',ok=true;
  if(st==='data'){
    title='Quando avete viaggiato?';
    const t=todayISO(),y=isoShift(t,-1);
    body=`<div class="wz-quick"><button class="wz-q${wz.date===t?' sel':''}" data-date="${t}">Oggi</button><button class="wz-q${wz.date===y?' sel':''}" data-date="${y}">Ieri</button></div>
      <label class="f">Oppure scegli la data<input type="date" id="wz-date" value="${wz.date}"></label>
      <p class="wz-big cap">${esc(dLong(wz.date))}</p>`;
    ok=!!wz.date;
  }else if(st==='auto'){
    title='Quante auto?';
    body=`<div class="wz-nums">${[1,2,3,4].map(n=>`<button class="wz-n${wz.n===n?' sel':''}" data-n="${n}">${n}</button>`).join('')}</div>
      <div class="wz-step"><button class="wz-n sm" data-n="${Math.max(1,wz.n-1)}" aria-label="Meno">−</button><span class="wz-big">${wz.n} auto</span><button class="wz-n sm" data-n="${Math.min(10,wz.n+1)}" aria-label="Più">+</button></div>`;
  }else if(st.startsWith('drv')){
    const ci=+st.slice(3),car=wz.cars[ci];
    title=wz.n>1?`Auto ${ci+1}: chi guida?`:'Chi guida?';
    const list=wzPeople().filter(p=>!takenElsewhere(p.id,ci));
    const sug=list[0];
    body=list.length?`<p class="hint">In ordine di punti: chi è più in basso dovrebbe guidare.</p><div class="wz-list" data-role="drv" data-car="${ci}">${list.map(p=>pBtn(p,car.driver===p.id,p===sug?'<span class="tag-sug">consigliato</span>':'')).join('')}</div>`
      :'<p class="hint">Non c\'è nessun altro disponibile: torna indietro e riduci il numero di auto.</p>';
    ok=!!car.driver;
  }else if(st.startsWith('pax')){
    const ci=+st.slice(3),car=wz.cars[ci];
    title=`Chi viaggia con ${esc(name(car.driver))}?`;
    const list=wzPeople().filter(p=>p.id!==car.driver&&!takenElsewhere(p.id,ci))
      .sort((a,c)=>(sameGroup(car.driver,c.id)?1:0)-(sameGroup(car.driver,a.id)?1:0));
    body=list.length?`<p class="hint">Tocca tutti i passeggeri di quest'auto.</p><div class="wz-list" data-role="pax" data-car="${ci}">${list.map(p=>pBtn(p,car.passengers.includes(p.id))).join('')}</div>`
      :'<p class="hint">Non c\'è nessun passeggero disponibile: torna indietro e riduci il numero di auto.</p>';
    ok=car.passengers.length>0;
    next=ok?`Avanti · ${car.passengers.length} passegger${car.passengers.length===1?'o':'i'}`:'Scegli almeno un passeggero';
  }else{
    title='Tutto giusto?';
    const w=wz.weight;
    body=`<p class="wz-big cap">${esc(dLong(wz.date))}</p>
      ${wz.cars.map((c,i)=>`<div class="wz-sum"><div class="hint">${wz.n>1?'Auto '+(i+1):'Auto'}</div>
        <div class="row between"><b>${esc(name(c.driver))}</b><span class="pos">${fmt(w*c.passengers.length)}</span></div>
        ${c.passengers.map(p=>`<div class="row between"><span>${esc(name(p))}</span><span class="neg">${fmt(-w)}</span></div>`).join('')}</div>`).join('')}
      <div class="m-fields"><label class="f full">Nota (facoltativa)<input type="text" id="wz-note" value="${esc(wz.note)}" placeholder="es. Calcetto"></label></div>`;
    next='Registra viaggio';
  }
  $('wz-title').textContent=title;$('wz-body').innerHTML=body;
  $('wz-next').textContent=next;$('wz-next').disabled=!ok;
  $('wz-body').scrollTop=0;
}
$('wz-body').onclick=e=>{
  const d=e.target.closest('[data-date]');if(d){wz.date=d.dataset.date;wzRender();return}
  const n=e.target.closest('[data-n]');if(n){wzSetCars(+n.dataset.n);wzRender();return}
  const w=e.target.closest('[data-w]');if(w){wz.weight=+w.dataset.w;wzRender();return}
  const p=e.target.closest('[data-p]');if(!p)return;const box=p.closest('.wz-list'),car=wz.cars[+box.dataset.car],id=p.dataset.p;
  if(box.dataset.role==='drv'){car.driver=id;car.passengers=car.passengers.filter(x=>x!==id);wzRender();setTimeout(()=>{if(wz&&wzSteps()[wz.k]==='drv'+box.dataset.car){wz.k++;wzRender()}},220)}
  else{car.passengers=car.passengers.includes(id)?car.passengers.filter(x=>x!==id):[...car.passengers,id];wzRender()}
};
$('wz-body').onchange=e=>{if(e.target.id==='wz-date'&&e.target.value){wz.date=e.target.value;wzRender()}};
$('wz-body').oninput=e=>{if(e.target.id==='wz-note')wz.note=e.target.value};
$('wz-back').onclick=()=>{if(wz.k>0){wz.k--;wzRender()}};
$('wz-close').onclick=wzClose;
$('wz-open').onclick=wzOpen;
$('wz-next').onclick=()=>{const steps=wzSteps();
  if(steps[wz.k]!=='fine'){wz.k++;wzRender();return}
  if(state.sample){state={people:state.people,trips:[]}}
  state.trips.push({id:uid(),...(sync.me?{by:sync.me}:{}),...(isAdmin()?{}:{pend:true}),date:wz.date,weight:isAdmin()?wz.weight:1,note:wz.note.trim(),cars:wz.cars.map(c=>({driver:c.driver,passengers:[...c.passengers]}))});
  state.trips.sort((a,b)=>a.date.localeCompare(b.date));persist();
  const msg=`Viaggio del ${new Date(wz.date+'T12:00').toLocaleDateString('it-IT')} ${isAdmin()?'registrato':'inserito: lo conferma il creatore della squadra'}`;
  wz=null;wzClose();render();snack(msg);
};
let snackT;function snack(t){$('snack').textContent=t;$('snack').hidden=false;clearTimeout(snackT);snackT=setTimeout(()=>$('snack').hidden=true,3200)}
// ultimi viaggi nella schermata iniziale
function renderRecent(){
  const list=state.trips.filter(t=>!t.pend).sort((a,c)=>a.date.localeCompare(c.date)).slice(-5).reverse();
  $('recent').innerHTML=list.length?list.map(t=>`<div class="rc"><span class="d">${new Date(t.date+'T12:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'})}</span><span class="who">${t.cars.map(c=>`<b>${esc(name(c.driver))}</b> con ${c.passengers.length}`).join(' · ')}</span>${t.hist?'<span class="tag">storico</span>':''}</div>`).join(''):'<p class="hint">Ancora nessun viaggio.</p>';
}
const _render=render;render=function(){_render();renderRecent()};
renderRecent();

const VIEWS=['viaggio','conferma','punti','registro','gruppi','squadra','membri','condividi','backup','suggerimenti','info'];
const ALIAS={persone:'membri',dati:'squadra',prenotazioni:'viaggio'};
const TAB_OF={membri:'squadra'};
function showView(){const h=location.hash.slice(1);
  if(h==='nuovo'){wzShow();return}
  if(h==='prenota'){location.replace('#viaggio');return}
  if(!$('wz').hidden){$('wz').hidden=true;document.body.classList.remove('wz-on')}
  if(ALIAS[h]){location.replace('#'+ALIAS[h]);return}
  const v=VIEWS.includes(h)?h:'viaggio';
  document.querySelectorAll('.view').forEach(s=>s.hidden=s.dataset.view!==v);
  const tv=TAB_OF[v]||v;document.querySelectorAll('[data-tab]').forEach(a=>{if(a.dataset.tab===tv)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  if(!$('drawer').hidden)closeMenu();
  window.scrollTo(0,0);
  setTimeout(()=>{if(v==='conferma')renderPending();if(v==='condividi')renderShare();if(v==='info')renderInfo();if(v==='suggerimenti')renderSug();if(typeof lazySync==='function')lazySync()},0)}
window.addEventListener('hashchange',showView);
document.querySelectorAll('[data-tab]').forEach(a=>a.addEventListener('click',e=>{if(location.hash==='#'+a.dataset.tab){e.preventDefault();window.scrollTo(0,0)}}));
if(['#nuovo','#prenota'].includes(location.hash))history.replaceState(null,'','#viaggio');
showView();
// prossimo guidatore anche in cima alla scheda Viaggio
new MutationObserver(()=>{$('next-mini').innerHTML=$('next').innerHTML}).observe($('next'),{childList:true,subtree:true,characterData:true});
$('next-mini').innerHTML=$('next').innerHTML;

