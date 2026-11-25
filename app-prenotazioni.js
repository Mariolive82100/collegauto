(window.__V=window.__V||{})['app-prenotazioni']='7.5.15';
// ===================== Prenotazioni: presenze e auto composte in automatico =====================
// Una sola prenotazione per il prossimo viaggio: prima delle 7:00 è quello di oggi, dopo le 7:00 quello di domani.
// state.bookings = [{id:'AAAA-MM-GG_idPersona', date, pid, present:true, drive:'si'|'no'|'forse', seats?, by, t}  oppure  {.., absent:true}]
// su Firebase: gruppi/{codice}/prenotazioni/{id}
const BK_CUTOFF=7,SEATS_DEF=POSTI,SEATS_MAX=8;   // alle 7:00 il viaggio del giorno passa tra quelli da confermare
// prossimo viaggio: oggi fino alle 7:00, poi domani; sabato e domenica si saltano (si passa al lunedì)
const skipWeekend=d=>{let x=d;for(let i=0;i<2;i++){const w=new Date(x+'T12:00').getDay();if(w===6||w===0)x=isoShift(x,1)}return x};
const tripDay=()=>skipWeekend(new Date().getHours()<BK_CUTOFF?todayISO():isoShift(todayISO(),1));
const bkAll=date=>(state.bookings||[]).filter(b=>b.date===date&&state.people.some(p=>p.id===b.pid&&!p.deleted));
const bkList=date=>bkAll(date).filter(b=>!b.absent);   // presenti
const bkAbsent=date=>bkAll(date).filter(b=>b.absent);  // assenti
const myPid=()=>{const p=active().find(x=>x.name===sync.me);return p?p.id:''};
const bkLong=d=>new Date(d+'T12:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
// risposta a "Sarai guidatore?" (anche dalle prenotazioni delle versioni precedenti)
const bkDrive=b=>b.drive||(b.seat==='d'||b.role==='guido'?'si':b.role==='passeggero'||(b.car&&b.seat!=='d')?'no':'forse');
const DRIVE_TXT={si:'guida: sì',no:'non guida',forse:'guida: non so'};
function bkWrite(b,del){
  state.bookings=(state.bookings||[]).filter(x=>x.id!==b.id);if(!del)state.bookings.push(b);
  persistLocal();
  if(fsdb&&sync.code){const ref=gref().collection('prenotazioni').doc(b.id);(del?ref.set({deleted:true,date:b.date,pid:b.pid,t:new Date().toISOString()}):ref.set(b)).catch(e=>{if(e&&e.code==='permission-denied')snack('Modifica non consentita: non è stata salvata.')})}
}
// --- composizione automatica delle auto
// 1) guidano prima quelli che hanno risposto "sì", da chi ha meno punti; poi, se servono altri posti, quelli che hanno risposto "non so"
//    (prima chi copre un gruppo rimasto senza guidatore, poi chi ha meno punti). Chi ha risposto "no" non guida mai.
// 2) si aggiungono auto solo finché i posti non bastano per tutti (posti di ogni auto: scelti dal guidatore, di base 4)
// 3) ogni passeggero va nell'auto con più persone del suo gruppo; un'auto rimasta senza passeggeri viene sciolta se possibile
// turni: chi fa lo stesso orario viaggia insieme; "vado da solo" non entra nelle auto
const SHIFTS={flex:{t:'Orario flessibile',from:'07:30',to:'16:00'},alt:{t:'Orario',custom:true},reg:{t:'Orario normale',from:'08:00',to:'16:30'},cfi:{t:'CFI',custom:true},str:{t:'Straordinario',custom:true},solo:{t:'Vado da solo'},nd:{t:'Orario non indicato'}};
// colori diversi per ogni orario (il flessibile è sempre verde acqua, il normale ambra)
const SH_COL=['var(--g3)','var(--g4)','var(--g5)','var(--g6)','var(--g1)'];
function shiftColor(label,all){if(/^Orario flessibile/.test(label))return 'var(--teal)';if(/^Orario normale/.test(label))return 'var(--amber)';
  const others=[...new Set(all.filter(l=>!/^Orario (flessibile|normale)/.test(l)))];return SH_COL[Math.max(0,others.indexOf(label))%SH_COL.length]}
const shOpen=new Set();
const SHIFT_ORDER=['flex','reg','alt','cfi','str','nd'];
const bkShift=b=>SHIFTS[b.shift]?b.shift:'nd';
const hhmm=t=>String(t||'').replace(/^0(\d)/,'$1');
const shiftLabel=b=>{const k=bkShift(b),S=SHIFTS[k];if(S.custom)return `${S.t} ${hhmm(b.from)}–${hhmm(b.to)}`;if(S.from)return `${S.t} ${hhmm(S.from)}–${hhmm(S.to)}`;return S.t};
function bkLayout(date){const all=bkList(date),groups=[],buckets=new Map();
  all.filter(b=>bkShift(b)!=='solo').forEach(b=>{const k=bkShift(b),key=SHIFTS[k].custom?`${k}|${b.from}|${b.to}`:k;
    if(!buckets.has(key))buckets.set(key,{key,k,label:shiftLabel(b),from:SHIFTS[k].custom?b.from:SHIFTS[k].from||'',list:[]});buckets.get(key).list.push(b)});
  [...buckets.values()].sort((a,b)=>SHIFT_ORDER.indexOf(a.k)-SHIFT_ORDER.indexOf(b.k)||String(a.from).localeCompare(String(b.from))).forEach(g=>{
    const L=bkLayoutList(g.list);L.cars.forEach(c=>c.grp=g.label);groups.push({...g,cars:L.cars,wait:L.wait,extraYes:L.extraYes})});
  return {groups,cars:groups.flatMap(g=>g.cars),wait:groups.flatMap(g=>g.wait),list:all,solo:all.filter(b=>bkShift(b)==='solo').map(b=>b.pid),extraYes:groups.flatMap(g=>g.extraYes)}}
function bkLayoutList(list){
  const bal=balances();
  const byPts=(x,y)=>(bal[x.pid]||0)-(bal[y.pid]||0)||tie(x.pid)-tie(y.pid)||name(x.pid).localeCompare(name(y.pid));
  const cap=b=>Math.max(1,Math.min(SEATS_MAX,+b.seats||SEATS_DEF));
  const yes=list.filter(b=>bkDrive(b)==='si').sort(byPts),maybe=list.filter(b=>bkDrive(b)==='forse').sort(byPts);
  const drivers=[],room=()=>drivers.reduce((s,b)=>s+1+cap(b),0);
  for(const b of yes){if(drivers.length&&room()>=list.length)break;drivers.push(b)}
  const pool=[...maybe];
  while(pool.length&&(room()<list.length||!drivers.length)){
    const cov=new Set(drivers.flatMap(b=>groupsOf(b.pid))),need=new Set(list.filter(b=>!drivers.includes(b)).flatMap(b=>groupsOf(b.pid)).filter(g=>!cov.has(g)));
    const pick=pool.find(b=>groupsOf(b.pid).some(g=>need.has(g)))||pool[0];drivers.push(pick);pool.splice(pool.indexOf(pick),1)}
  const cars=drivers.map(b=>({id:'c_'+b.pid,driver:b.pid,seats:cap(b),pax:[],maybe:bkDrive(b)==='forse'}));
  const rest=list.filter(b=>!drivers.includes(b)).sort((x,y)=>groupsOf(y.pid).length-groupsOf(x.pid).length||byPts(y,x));
  const wait=[];
  rest.forEach(b=>{const g=groupsOf(b.pid);
    const score=c=>(groupsOf(c.driver).some(x=>g.includes(x))?10:0)+c.pax.filter(q=>groupsOf(q).some(x=>g.includes(x))).length*2-c.pax.length*3;
    const free=cars.filter(c=>c.pax.length<c.seats).sort((a,c)=>score(c)-score(a));
    if(free.length)free[0].pax.push(b.pid);else wait.push(b.pid)});
  for(const c of [...cars].reverse()){if(c.pax.length||cars.length<2)continue;
    const host=cars.find(o=>o!==c&&o.pax.length<o.seats);if(host){host.pax.push(c.driver);cars.splice(cars.indexOf(c),1)}}
  return {cars,wait,list,extraYes:yes.filter(b=>!cars.some(c=>c.driver===b.pid)).map(b=>b.pid)};
}
const seatLbl=(i,n)=>i===0?'Davanti':n>4&&i>3?'Terza fila':'Dietro';
function bkSeat(c,s){const who=s==='d'?c.driver:c.pax[s-1]||'',me=who&&who===myPid();
  const lbl=s==='d'?'Guidatore':seatLbl(s-1,c.seats);
  return `<div class="seat${s==='d'?' drv':''}${who?' taken':''}${me?' me':''}"><small>${lbl}</small>${who?`<b>${esc(name(who))}</b>${s==='d'?`<span class="seat-x">+${c.pax.length} punti</span>`:''}`:'<b class="free">Libero</b>'}</div>`}
let bkArm=false,bkArmT;
function renderBookings(){
  const d=tripDay(),L=bkLayout(d),me=myPid(),edit=id=>isAdmin()||id===me,cn=id=>L.cars.findIndex(c=>c.driver===id)+1;
  // composizione suggerita (non modificabile): per ogni auto prima il guidatore, poi i passeggeri
  const bal=balances(),sc=id=>{const v=bal[id]||0;return `${v>0?'+':v<0?'−':''}${Math.abs(v)}`};
  const zoneOf=id=>groupsOf(id).map(g=>state.groups[gIndex(g)].name).join(', ');
  const crow=(id,role)=>`<div class="ul-row cmp-${role}${(bal[id]||0)<0?' ul-neg':''}${id===me?' me':''}">
      <span class="ul-n"><b>${esc(name(id))}</b>${role==='drv'&&zoneOf(id)?`<small class="drv-zone">Zona ${esc(zoneOf(id))}</small>`:''}</span><span class="ul-v">${sc(id)}</span><span class="ul-s">${role==='drv'?'Guida':role==='wait'?'Senza posto':'Passeggero'}</span></div>`;
  // la tabella resta sempre la stessa: i posti liberi hanno "—" e si riempiono man mano che arrivano i presenti
  const slot=role=>`<div class="ul-row cmp-${role} cmp-free"><span class="ul-n"><b>—</b></span><span class="ul-v"></span><span class="ul-s">${role==='drv'?'Guida':'Passeggero'}</span></div>`;
  const carH=(c,lbl)=>`<div class="cmp-car">${lbl?`<div class="cmp-h">${lbl}</div>`:''}<div class="cmp-list">${c.driver?crow(c.driver,'drv'):slot('drv')}${c.pax.map(x=>crow(x,'pax')).join('')}${Array.from({length:Math.max(0,c.seats-c.pax.length)},()=>slot('pax')).join('')}</div></div>`;
  const waitH=w=>w.length?`<div class="cmp-car"><div class="cmp-h">Senza posto</div><div class="cmp-list">${w.map(x=>crow(x,'wait')).join('')}</div></div>`:'';
  let n=0;const many=L.groups.length>1;
  // con più orari ogni elenco è compresso: si apre toccando la sua intestazione
  $('bk-days-view').innerHTML=L.groups.length
    ?L.groups.map((g,gi)=>{let cars=g.cars.map(c=>({driver:c.driver,seats:c.seats,pax:[...c.pax]})),w=[...g.wait];
        if(!cars.length)cars=[{driver:'',seats:SEATS_DEF,pax:w.splice(0,SEATS_DEF)}];
        const col=shiftColor(g.label,L.groups.map(x=>x.label)),open=!many||shOpen.has(g.key),mine=g.list.some(b=>b.pid===me);
        const nc=cars.length,ac=cars.map(c=>carH(c,L.cars.length+(g.cars.length?0:1)>1?`Auto ${++n}`:'')).join('');
        const head=`<span class="shift-l">${many?'Gruppo '+(gi+1):'Presenti'}</span><i>${g.list.length}</i>${mine?'<small class="shift-me">tu</small>':''}${many?`<small class="shift-sub">${nc} ${nc===1?'auto':'auto'}</small><span class="shift-chev" aria-hidden="true">›</span>`:''}`;
        return `<div class="shift${open?' open':''}" style="--sc:${col}">${many?`<button class="shift-h shift-tog" data-shk="${esc(g.key)}" aria-expanded="${open}">${head}</button>`:`<div class="shift-h">${head}</div>`}${open?ac+waitH(w):''}</div>`}).join('')
    :carH({driver:'',seats:SEATS_DEF,pax:[]},'');
  const abs=bkAbsent(d),done=new Set(bkAll(d).map(b=>b.pid)),missP=active().filter(p=>!done.has(p.id));
  const done1=state.trips.some(t=>!t.hist&&!t.pend&&t.date===d),can=L.cars.some(c=>c.pax.length);
  // due liste minimal: assenti e nessuna conferma (prima chi ha meno punti)
  const byPts=(x,y)=>(bal[x]||0)-(bal[y]||0)||tie(x)-tie(y)||name(x).localeCompare(name(y));
  const absIds=abs.map(b=>b.pid).sort(byPts),missIds=missP.map(p=>p.id).sort(byPts);
  const mini=(t,ids)=>`<div class="mini"><span class="mini-h">${t} <i>${ids.length}</i></span><span class="mini-l">${ids.length?ids.map(id=>`<span class="mn${id===me?' me':''}">${esc(name(id))}</span>`).join(''):'<span class="mn-none">—</span>'}</span></div>`;
  $('bk-abs').innerHTML=(L.solo.length?mini('Vado da solo',[...L.solo].sort(byPts)):'')+mini('Assenti',absIds)+mini('Nessuna conferma',missIds);
  $('hm-day').textContent=bkLong(d);
  // i due tasti della pagina principale
  const mineB=me&&L.list.find(b=>b.pid===me),meAbs=me&&abs.some(b=>b.pid===me);
  $('bk-open-t').textContent=mineB?'Presente ✓':'Presente';
  const sub={};L.cars.forEach((c,i)=>{const k=L.cars.length>1?` ${i+1}`:'';sub[c.driver]=k?`Guidi l'auto${k}`:'Guidi tu';c.pax.forEach(x=>{sub[x]=`Passeggero${k?' auto'+k:''}`})});L.wait.forEach(x=>{sub[x]='Senza posto'});L.solo.forEach(x=>{sub[x]='Vai da solo'});
  
  $('bk-open-s').textContent=mineB?(sub[me]?`${sub[me]} · tocca per annullare`:'tocca per annullare'):'al prossimo viaggio';
  $('bk-away-t').textContent=meAbs?'Assente ✓':'Assente';$('bk-away-s').textContent=meAbs?'tocca per annullare':'al prossimo viaggio';
  $('bk-open').classList.toggle('on',!!mineB);$('bk-away').classList.toggle('on',!!meAbs);
}
// --- risposte: presente (con "Sarai guidatore?"), assente, nessuna risposta
function bkSet(pid,what,drive,sh){const d=tripDay(),id=d+'_'+pid,cur=(state.bookings||[]).find(b=>b.id===id),t=new Date().toISOString();
  if(what==='none'){if(cur)bkWrite({id,date:d,pid},true)}
  else if(what==='abs')bkWrite({id,date:d,pid,absent:true,by:sync.me||'',t});
  else{const b={id,date:d,pid,present:true,drive,by:sync.me||'',t,...(sh||{})};if(cur&&cur.seats)b.seats=cur.seats;bkWrite(b)}
  render()}
let askPid='';
// toccando un nome si risponde per quel collega: presente, assente o nessuna risposta
function askDrive(pid){askPid=pid;$('ask-seat-t').textContent=name(pid);
  $('ask-seat-d').textContent=`Prossimo viaggio: ${bkLong(tripDay())}.`;$('ask-seat').hidden=false}
document.querySelectorAll('[data-drive]').forEach(b=>b.onclick=()=>{$('ask-seat').hidden=true;const v=b.dataset.drive;
  if(v==='abs'||v==='none'){bkSet(askPid,v);snack(v==='abs'?`${name(askPid)} assente`:`Risposta di ${name(askPid)} tolta`);return}
  bkSet(askPid,'pres',v);snack(`${name(askPid)} presente`)});
$('ask-no').onclick=()=>{$('ask-seat').hidden=true};
$('ask-seat').onclick=e=>{if(e.target.id==='ask-seat')$('ask-seat').hidden=true};
const needMe=()=>{if(sync.code){whoLater=false;maybeAskWho()}else snack('Per confermare la presenza entra nella tua squadra: menu › Squadra')};
$('bk-open').onclick=()=>{const me=myPid();if(!me){needMe();return}
  if(bkList(tripDay()).some(b=>b.pid===me)){bkSet(me,'none');snack('Presenza annullata');return}
  shiftOpen()};

// --- "Presente": scelta dell'orario (CFI e straordinario chiedono inizio e fine)
let shPick='';
let shFlex=false;
function shFlexSet(v){shFlex=!!v;$('sh-sw').setAttribute('aria-checked',String(shFlex));$('sh-reg-t').textContent=shFlex?'7:30 – 16:00':'8:00 – 16:30'}
function shiftOpen(){shPick='';
  const lastSh=(state.bookings||[]).filter(x=>x.pid===myPid()&&(x.shift==='flex'||x.shift==='reg')).sort((a,c)=>(c.t||'').localeCompare(a.t||''))[0];
  shFlexSet(!!(lastSh&&lastSh.shift==='flex'));$('shift-step1').hidden=false;$('shift-step2').hidden=true;$('shift-t').textContent='Che orario fai?';
  $('shift-d').textContent=`Prossimo viaggio: ${bkLong(tripDay())}.`;$('shift-sheet').hidden=false}
function shiftDone(sh){const me=myPid();$('shift-sheet').hidden=true;if(!me)return;bkSet(me,'pres','forse',sh);snack(`Presente · ${shiftLabel(sh)}`)}
$('shift-step1').onclick=e=>{if(e.target.closest('#sh-sw')){shFlexSet(!shFlex);return}
  const b=e.target.closest('[data-sh]');if(!b)return;let k=b.dataset.sh;
  if(k==='reg'&&shFlex)k='flex';
  if(!SHIFTS[k].custom){shiftDone({shift:k});return}
  shPick=k;const last=(state.bookings||[]).filter(x=>x.pid===myPid()&&x.shift===k&&x.from).sort((a,c)=>(c.t||'').localeCompare(a.t||''))[0];
  $('sh-from').value=last?last.from:'08:00';$('sh-to').value=last?last.to:'16:30';$('sh-msg').textContent='';
  $('shift-t').textContent='Da che ora a che ora?';$('shift-step1').hidden=true;$('shift-step2').hidden=false};
$('sh-ok').onclick=()=>{const f=$('sh-from').value,t=$('sh-to').value;
  if(!f||!t){$('sh-msg').textContent='Indica inizio e fine.';return}
  if(t<=f){$('sh-msg').textContent='La fine deve essere dopo l\'inizio.';return}
  shiftDone({shift:shPick,from:f,to:t})};
$('sh-back').onclick=()=>{$('shift-step1').hidden=false;$('shift-step2').hidden=true;$('shift-t').textContent='Che orario fai?'};
$('shift-cancel').onclick=()=>{$('shift-sheet').hidden=true};
$('shift-sheet').onclick=e=>{if(e.target.id==='shift-sheet')$('shift-sheet').hidden=true};
$('bk-days-view').addEventListener('click',e=>{const t=e.target.closest('[data-shk]');if(!t)return;const k=t.dataset.shk;shOpen.has(k)?shOpen.delete(k):shOpen.add(k);renderBookings()});
$('bk-away').onclick=()=>{const me=myPid();if(!me){needMe();return}
  if(bkAbsent(tripDay()).some(b=>b.pid===me)){bkSet(me,'none');snack('Assenza annullata');return}
  bkSet(me,'abs');snack(`Assente ${bkLong(tripDay())}`)};
// ognuno conferma solo la propria presenza: i nomi degli altri non si toccano
// dalle auto composte al viaggio da registrare (si può ancora modificare a mano)
function fillDraft(){const d=tripDay(),L=bkLayout(d);
  const cars=L.cars.map(c=>({driver:c.driver,passengers:[...c.pax]}));
  draft={who:new Set(L.list.map(b=>b.pid).filter(id=>active().some(p=>p.id===id))),cars:cars.length?cars:[{driver:'',passengers:[]}]};
  $('trip-date').value=d}
function planDay(){fillDraft();$('dist-note').textContent='Composizione suggerita: modifica auto, guidatori e passeggeri, poi tocca Registra viaggio.';
  const adv=$('plan');adv.open=true;render();
  setTimeout(()=>adv.scrollIntoView({block:'start',behavior:'smooth'}),60)}
const dayGroup=id=>groupOf(id);

// ===================== Viaggi da confermare =====================
// Alle 7:00 la tabella del prossimo viaggio "scade" e diventa un viaggio da confermare.
// La composizione viene fissata in un documento prenotazioni/plan_AAAA-MM-GG {plan:true, cars, done?, discarded?}
// così resta uguale su tutti i telefoni e si può modificare prima di registrarla.
const planId=d=>'plan_'+d;
const planOf=d=>(state.bookings||[]).find(b=>b.id===planId(d));
function pendingDates(){const td=tripDay(),reg=new Set(state.trips.filter(t=>!t.hist&&!t.pend).map(t=>t.date)),ds=new Set();
  (state.bookings||[]).forEach(b=>{if(b.date<td&&((b.pid&&!b.absent&&state.people.some(p=>p.id===b.pid))||b.plan))ds.add(b.date)});
  return [...ds].filter(d=>{const p=planOf(d);return !(p&&(p.done||p.discarded))&&!reg.has(d)&&(p||pendingCars(d).some(c=>c.driver&&c.passengers.length))}).sort()}   // viaggi fatti da una persona sola: non serve confermarli
function pendingCars(d){const p=planOf(d);if(p&&Array.isArray(p.cars))return p.cars.map(c=>({driver:c.driver,passengers:[...(c.passengers||[])],grp:c.grp||''}));
  return bkLayout(d).cars.map(c=>({driver:c.driver,passengers:[...c.pax],grp:c.grp||''}))}
function savePlan(d,cars,extra={}){bkWrite({id:planId(d),date:d,plan:true,cars:cars.map(c=>({driver:c.driver,passengers:[...c.passengers],grp:c.grp||''})),by:sync.me||'',t:new Date().toISOString(),...extra})}
// può confermare, modificare o eliminare un viaggio solo chi ne fa parte (in auto o presente quel giorno)
function pendCan(d){if(isAdmin())return true;const me=myPid();if(!me)return false;
  return pendingCars(d).some(c=>c.driver===me||c.passengers.includes(me))||bkList(d).some(b=>b.pid===me)}
let pendArm='',pendEdit='',drag=null;const trOpen=new Set();
const cap1=t=>t.charAt(0).toUpperCase()+t.slice(1);
const shortD=d=>cap1(new Date(d+'T12:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'short'}));
// riga compressa nella pagina Viaggi: toccandola si va alla pagina di conferma
function pendRow(d){const cars=pendingCars(d),n=cars.reduce((s,c)=>s+(c.driver?1:0)+c.passengers.length,0);
  return `<div class="tr tr-pend"><a class="tr-h" href="#conferma" data-go="${d}"><span class="tr-d"><b>${esc(shortD(d))}</b><small>${n} ${n===1?'persona':'persone'}</small></span><span class="tr-badge">${isAdmin()?'Modifica e conferma':'Da confermare'}</span><span class="tr-chev" aria-hidden="true">›</span></a></div>`}
// scheda nella pagina di conferma: vista con Modifica / Conferma, oppure modifica (trascina, ✕, aggiungi)
function pendCard(d){const cars=pendingCars(d),can=pendCan(d),ed=can&&pendEdit===d,bal=balances(),sc=id=>{const v=bal[id]||0;return `${v>0?'+':v<0?'−':''}${Math.abs(v)}`};
  const inTrip=new Set(cars.flatMap(c=>[c.driver,...c.passengers]).filter(Boolean));
  const free=active().filter(p=>!inTrip.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name));
  const addSel=(i,role)=>free.length?`<select class="pc-add" data-add="${i}|${role}" aria-label="Aggiungi persona"><option value="">+ Aggiungi persona</option>${free.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>`:'<span class="hint">—</span>';
  const row=(i,role,k,id)=>{const drv=role==='drv';
    if(!id)return ed?`<div class="ul-row pc-slot ${drv?'cmp-drv':'cmp-pax'} cmp-free" data-slot="${i}|${role}|${k}"><span class="ul-n">${addSel(i,role)}</span><span class="ul-v"></span><span class="ul-s">${drv?'Guida':'Passeggero'}</span><span></span></div>`:'';
    return `<div class="ul-row pc-slot ${drv?'cmp-drv':'cmp-pax'}${(bal[id]||0)<0?' ul-neg':''}" data-slot="${i}|${role}|${k}">
      ${ed?`<span class="pc-grip" data-grip="1" aria-label="Trascina ${esc(name(id))}">⋮⋮</span>`:''}<span class="ul-n"><b>${esc(name(id))}</b></span><span class="ul-v">${sc(id)}</span><span class="ul-s">${drv?'Guida':'Passeggero'}</span>
      ${ed?`<button class="pc-rm" data-rm="${i}|${id}" aria-label="Togli ${esc(name(id))}">✕</button>`:''}</div>`};
  const body=cars.map((c,i)=>{const pax=ed?[...c.passengers,...Array(Math.max(0,SEATS_DEF-c.passengers.length)).fill('')]:c.passengers;
    return `<div class="pc">${cars.length>1?`<div class="cmp-h">Auto ${i+1}</div>`:''}<div class="cmp-list${ed?' editing':''}">${row(i,'drv',0,c.driver)}${pax.map((x,k)=>row(i,'pax',k,x)).join('')}</div>
      ${!ed&&c.driver&&!c.passengers.length?'<p class="hint" style="margin:0">Senza passeggeri: questa auto non verrà registrata.</p>':''}</div>`}).join('')||'<p class="hint" style="margin:0">Nessuno in questo viaggio.</p>';
  const foot=!can?'<p class="pend-ro">Solo chi ha partecipato a questo viaggio può modificarlo. Lo conferma il creatore della squadra.</p>'
    :ed?`<p class="hint" style="margin:0">Trascina ⋮⋮ per spostare (anche al posto del guidatore), ✕ per togliere, "+ Aggiungi persona" nei posti liberi.</p>
      <div class="pend-act"><button class="ghost danger" data-del="1">${pendArm==='del'+d?'Tocca di nuovo':'Elimina viaggio'}</button><button class="bk-main" data-done="1">Fine modifiche</button></div>`
    :isAdmin()?`<div class="pend-act"><button class="ghost" data-edit="1">Modifica</button><button class="bk-main" data-ok="1">Conferma</button></div>`
    :`<div class="pend-act"><button class="ghost" data-edit="1">Modifica</button></div><p class="pend-ro">Lo conferma il creatore della squadra.</p>`;
  return `<div class="panel pend${ed?' is-edit':''}" data-d="${d}"><div class="row between"><h2 class="pend-day">${esc(shortD(d))}</h2>${ed?'<span class="hint">modifica</span>':''}</div>${body}${foot}</div>`}
// riga di un viaggio registrato: data e guidatori, si apre per vedere i partecipanti
function doneCard(t,open){const n=t.cars.reduce((s,c)=>s+1+c.passengers.length,0);
  const head=`<button class="tr-h" data-tog="t:${t.id}" aria-expanded="${open}"><span class="tr-d"><b>${esc(shortD(t.date))}</b><small>${t.cars.map(c=>'guida '+esc(name(c.driver))).join(' · ')} · ${n} persone</small></span><span class="tr-ok">Confermato</span><span class="tr-chev" aria-hidden="true">›</span></button>`;
  if(!open)return `<div class="tr tr-done">${head}</div>`;
  return `<div class="tr tr-done open">${head}<div class="tr-body">${t.cars.map((c,i)=>`<div class="pc">${t.cars.length>1?`<div class="cmp-h">Auto ${i+1}</div>`:''}<div class="cmp-list">
      <div class="ul-row cmp-drv"><span class="ul-n"><b>${esc(name(c.driver))}</b></span><span class="ul-v">+${c.passengers.length}</span><span class="ul-s">Guida</span></div>
      ${c.passengers.map(x=>`<div class="ul-row cmp-pax"><span class="ul-n"><b>${esc(name(x))}</b></span><span class="ul-v">−1</span><span class="ul-s">Passeggero</span></div>`).join('')}</div></div>`).join('')}</div></div>`}
// viaggi inseriti a mano da chi non è il creatore: restano da confermare finché il creatore non li conferma
function manualBody(t){return t.cars.map((c,i)=>`<div class="pc">${t.cars.length>1?`<div class="cmp-h">Auto ${i+1}</div>`:''}<div class="cmp-list">
      <div class="ul-row cmp-drv"><span class="ul-n"><b>${esc(name(c.driver))}</b></span><span class="ul-v">+${t.weight*c.passengers.length}</span><span class="ul-s">Guida</span></div>
      ${c.passengers.map(x=>`<div class="ul-row cmp-pax"><span class="ul-n"><b>${esc(name(x))}</b></span><span class="ul-v">−${t.weight}</span><span class="ul-s">Passeggero</span></div>`).join('')}</div></div>`).join('')}
function manualRow(t){const n=t.cars.reduce((s,c)=>s+1+c.passengers.length,0);
  return `<div class="tr tr-pend"><a class="tr-h" href="#conferma"><span class="tr-d"><b>${esc(shortD(t.date))}</b><small>inserito${t.by?' da '+esc(t.by):''} · ${n} persone</small></span><span class="tr-badge">Da confermare</span><span class="tr-chev" aria-hidden="true">›</span></a></div>`}
function manualCard(t){const adm=isAdmin();
  return `<div class="panel pend" data-mt="${t.id}"><div class="row between"><h2 class="pend-day">${esc(shortD(t.date))}</h2><span class="hint">inserito${t.by?' da '+esc(t.by):''}${t.weight!==1?' · peso ×'+t.weight:''}</span></div>
    ${manualBody(t)}${t.note?`<p class="hint" style="margin:0">${esc(t.note)}</p>`:''}
    ${adm?`<div class="pend-act"><button class="ghost danger" data-mdel="${t.id}">Elimina viaggio</button><button class="bk-main" data-mok="${t.id}">Conferma</button></div>`:'<p class="pend-ro">Lo conferma il creatore della squadra.</p>'}</div>`}
$('pend-list').addEventListener('click',e=>{const ok=e.target.closest('[data-mok]'),del=e.target.closest('[data-mdel]');if(!ok&&!del)return;
  if(!isAdmin()){snack('Solo il creatore della squadra può confermare i viaggi');return}
  if(ok){const t=state.trips.find(x=>x.id===ok.dataset.mok);if(!t)return;delete t.pend;persist();render();snack(`Viaggio di ${bkLong(t.date)} registrato`);return}
  if(del.dataset.arm!=='1'){del.dataset.arm='1';del.textContent='Tocca di nuovo';setTimeout(()=>{if(del.isConnected){del.dataset.arm='';del.textContent='Elimina viaggio'}},4000);return}
  const t=state.trips.find(x=>x.id===del.dataset.mdel);state.trips=state.trips.filter(x=>x.id!==del.dataset.mdel);persist();render();snack(t?`Viaggio di ${bkLong(t.date)} eliminato`:'Viaggio eliminato')});
function renderPending(){const ds=pendingDates(),mp=state.trips.filter(t=>t.pend),np=ds.length+mp.length;
  ds.forEach(d=>{if(!planOf(d))savePlan(d,pendingCars(d))});   // la composizione si fissa al momento in cui scade
  if(pendEdit&&!ds.includes(pendEdit))pendEdit='';
  $('tab-badge').hidden=!np;$('tab-badge').textContent=np;
  $('dm-pend').textContent=np?`${np} ${np===1?'viaggio':'viaggi'} in attesa`:'Nessun viaggio in attesa';
  // se ci sono viaggi da confermare anche il prossimo viaggio è compresso (si apre toccandolo)
  const nextOpen=!np||trOpen.has('next');$('tr-next').classList.toggle('open',nextOpen);$('tr-next').classList.toggle('closed',!nextOpen);
  $('tr-next-h').setAttribute('aria-expanded',nextOpen);$('tr-next-chev').hidden=!np;$('tr-next-h').classList.toggle('tr-static',!np);
  const last=state.trips.filter(t=>!t.pend).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  $('trip-rows').innerHTML=[...ds].reverse().map(pendRow).join('')+mp.map(manualRow).join('')+last.map(t=>doneCard(t,trOpen.has('t:'+t.id))).join('');
  if(drag)return;
  if($('pend-list').closest('.view').hidden&&location.hash!=='#conferma')return;
  if(selBusy($('pend-list')))return;
  $('pend-list').innerHTML=np?ds.map(pendCard).join('')+mp.map(manualCard).join(''):'<div class="panel"><p class="hint" style="margin:0">Nessun viaggio da confermare.</p></div>';
}
// --- modifiche alla composizione (salvate subito, uguali su tutti i telefoni)
function pendSave(d,cars){savePlan(d,cars.filter(c=>c.driver||c.passengers.length));renderPending()}
function slotGet(cars,[i,role,k]){const c=cars[+i];if(!c)return '';return role==='drv'?c.driver:(c.passengers[+k]||'')}
function slotSet(cars,[i,role,k],v){const c=cars[+i];if(!c)return;if(role==='drv')c.driver=v;else{c.passengers[+k]=v}}
function moveSlot(d,from,to){const cars=pendingCars(d),a=from.split('|'),b=to.split('|');if(from===to)return;
  const x=slotGet(cars,a),y=slotGet(cars,b);if(!x)return;
  if(b[1]==='pax'&&!y&&a[0]!==b[0]&&cars[+b[0]].passengers.filter(Boolean).length>=SEATS_DEF){snack('Quell\'auto è piena');return}
  slotSet(cars,a,y);slotSet(cars,b,x);   // scambio: chi era al posto di arrivo prende il posto di partenza
  cars.forEach(c=>{c.passengers=c.passengers.filter(Boolean)});
  pendSave(d,cars);snack(b[1]==='drv'?`Guida ${name(x)}`:`${name(x)} spostato`)}
function tripClick(e){const go=e.target.closest('[data-go]');
  if(go){e.preventDefault();const d=go.dataset.go;location.hash='conferma';setTimeout(()=>{const c=document.querySelector(`#pend-list [data-d="${d}"]`);if(c)c.scrollIntoView({block:'start',behavior:'smooth'})},120);return}
  const tog=e.target.closest('[data-tog]');
  if(tog){const k=tog.dataset.tog;trOpen.has(k)?trOpen.delete(k):trOpen.add(k);renderPending();return}
  const card=e.target.closest('[data-d]');if(!card)return;const d=card.dataset.d;if(!pendCan(d))return;
  if(e.target.closest('[data-edit]')){pendEdit=d;pendArm='';renderPending();return}
  if(e.target.closest('[data-done]')){pendEdit='';pendArm='';renderPending();return}
  const rm=e.target.closest('[data-rm]');
  if(rm){const [i,id]=rm.dataset.rm.split('|'),cars=pendingCars(d),c=cars[+i];if(!c)return;
    if(c.driver===id)c.driver='';else c.passengers=c.passengers.filter(x=>x!==id);
    pendSave(d,cars);snack(`${name(id)} tolto dal viaggio`);return}
  if(e.target.closest('[data-del]')){if(pendArm!=='del'+d){pendArm='del'+d;renderPending();setTimeout(()=>{if(pendArm==='del'+d){pendArm='';renderPending()}},4000);return}
    pendArm='';pendEdit='';savePlan(d,pendingCars(d),{discarded:true});render();snack(`Viaggio di ${bkLong(d)} eliminato`);return}
  if(e.target.closest('[data-ok]')){if(!isAdmin()){snack('Solo il creatore della squadra può confermare i viaggi');return}
    const all=pendingCars(d),cars=all.filter(c=>c.driver&&c.passengers.length);
    if(all.some(c=>!c.driver&&c.passengers.length)){snack('Un\'auto non ha il guidatore: tocca Modifica');return}
    if(!cars.length){snack('Serve almeno un\'auto con guidatore e passeggeri');return}
    state.trips.push({id:uid(),date:d,weight:1,note:'',cars:cars.map(c=>({driver:c.driver,passengers:[...c.passengers]}))});
    state.trips.sort((a,b)=>a.date.localeCompare(b.date));savePlan(d,cars,{done:true});persist();render();snack(`Viaggio di ${bkLong(d)} registrato`)}}
$('trip-rows').onclick=tripClick;$('pend-list').onclick=tripClick;
$('tr-next-h').onclick=()=>{if(!pendingDates().length&&!state.trips.some(t=>t.pend))return;trOpen.has('next')?trOpen.delete('next'):trOpen.add('next');renderPending()};
$('pend-list').onchange=e=>{const s=e.target.closest('[data-add]');if(s)s.blur();if(!s||!s.value)return;const d=s.closest('[data-d]').dataset.d;if(!pendCan(d))return;
  const [i,role]=s.dataset.add.split('|'),cars=pendingCars(d),c=cars[+i],id=s.value;if(!c)return;
  if(role==='drv')c.driver=id;else{if(c.passengers.length>=SEATS_DEF){snack('Quell\'auto è piena');return}c.passengers.push(id)}
  pendSave(d,cars);snack(`${name(id)} aggiunto`)};
// trascinamento con il dito (o il mouse) dalla maniglia ⋮⋮
$('pend-list').addEventListener('pointerdown',e=>{const g=e.target.closest('[data-grip]');if(!g)return;const row=g.closest('[data-slot]'),card=g.closest('[data-d]');if(!row||!card)return;
  e.preventDefault();const r=row.getBoundingClientRect(),ghost=row.cloneNode(true);ghost.classList.add('drag-ghost');
  Object.assign(ghost.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px'});document.body.appendChild(ghost);row.classList.add('dragging');
  drag={d:card.dataset.d,from:row.dataset.slot,row,ghost,dy:e.clientY-r.top,over:null}});
addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();drag.ghost.style.top=(e.clientY-drag.dy)+'px';
  const el=document.elementFromPoint(e.clientX,e.clientY),t=el&&el.closest(`[data-d="${drag.d}"] [data-slot]`);
  if(drag.over&&drag.over!==t)drag.over.classList.remove('drop-over');if(t&&t!==drag.row)t.classList.add('drop-over');drag.over=t},{passive:false});
function dragEnd(){if(!drag)return;const {d,from,over,ghost,row}=drag;drag=null;ghost.remove();row.classList.remove('dragging');
  if(over){over.classList.remove('drop-over');moveSlot(d,from,over.dataset.slot)}else renderPending()}
addEventListener('pointerup',dragEnd);addEventListener('pointercancel',dragEnd);
const _render4=render;render=function(){_render4();renderBookings();renderPending()};
renderBookings();
setInterval(()=>{if(!document.hidden)renderBookings()},60000);   // alle 7:00 la tabella si azzera da sola

