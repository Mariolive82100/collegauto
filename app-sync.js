(window.__V=window.__V||{})['app-sync']='7.5.10';
// ===================== Condivisione con i colleghi (Firebase Firestore) =====================
// Percorsi: gruppi/{codice}/viaggi/{id} (un documento per viaggio, cancellazione = deleted:true)
//           gruppi/{codice}/meta/stato   (persone, gruppi, punti di partenza: vince l'ultima modifica)
const FB_CONFIG={apiKey:"AIzaSyATgur8Y7opmHZoo3kL28pPB3Y1878q0sg",authDomain:"blabla-app-a8f40.firebaseapp.com",projectId:"blabla-app-a8f40",
  storageBucket:"blabla-app-a8f40.firebasestorage.app",messagingSenderId:"1016025393075",appId:"1:1016025393075:web:1db0af4de6c2ee4ed84dc6"};
const SYNC_KEY='blabla-sync';
let sync={};try{sync=JSON.parse(localStorage.getItem(SYNC_KEY))||{}}catch(e){}
// chi appartiene già a una squadra (anche il creatore) non può crearne altre
const inAnyTeam=()=>!!(sync.teams&&sync.teams.length);
const canNewTeam=()=>ALLOW_NEW_TEAMS&&!inAnyTeam();
sync.pendingDel=sync.pendingDel||[];sync.dirty=sync.dirty||[];
const saveSync=()=>{try{localStorage.setItem(SYNC_KEY,JSON.stringify(sync))}catch(e){}};
const syncSupported=()=>!inViewer&&!!window.firebase;
let fsdb=null,remoteTrips=null,remoteMeta,applying=false,unsubs=[],lastMeta='',pushing=false,pushAgain=false,syncState='off';
let remoteZone,adminOk=null,lastZone='',protNagged=false,adminBusy=false,joinedReady=false;
const PW_MIN=10;
function myUid(){try{const u=firebase.auth().currentUser;return u?u.uid:''}catch(e){return ''}}
// meta/stato: solo il creatore (people, punti di partenza, nome). meta/zone: le zone, modificabili da tutti i membri.
const metaOf=()=>({people:state.people||[],start:state.start||null,teamName:state.teamName||''});
const zoneOf=()=>({groups:state.groups||[]});
function teamProt(){const t=(sync.teams||[]).find(x=>x.code===sync.code);return !!((remoteMeta&&remoteMeta.prot)||(t&&t.prot))}
function canPushStato(){return !!sync.creator||!teamProt()}
// i permessi da creatore li decide il server: esiste il documento admins/<tuo uid>? (1 lettura per apertura)
async function checkAdmin(){const u=firebase.auth().currentUser,code=sync.code;if(!u||!code)return;
  try{const d=await gref().collection('admins').doc(u.uid).get();if(code!==sync.code)return;adminOk=d.exists}catch(e){return}
  applyAdmin()}
function applyAdmin(){
  if(adminOk===null||remoteMeta===undefined||!teamProt())return;
  if(!!sync.creator!==adminOk){sync.creator=adminOk;const t=sync.teams.find(x=>x.code===sync.code);if(t)t.creator=adminOk;saveSync();renderSync();render()}}
const clean=o=>JSON.parse(JSON.stringify(o));
const core=t=>JSON.stringify({date:t.date,weight:t.weight||1,note:t.note||'',cars:t.cars||[],hist:!!t.hist,pend:!!t.pend});
const gref=()=>fsdb.collection('gruppi').doc(sync.code);
function newCode(){const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=new Uint32Array(16);crypto.getRandomValues(r);
  const c=[...r].map(x=>A[x%A.length]).join('');return 'COL-'+c.match(/.{4}/g).join('-')}
const normCode=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9-]/g,'').replace(/^(?!(BLA|COL)-)/,'COL-');

let syncDetail='',lastServer=0;
function setSync(st,detail){syncState=st;syncDetail=detail||'';
  const lab={off:'Non condiviso',wait:'Connessione…',ok:'Sincronizzato',pending:'In attesa di rete',bad:'Errore di sincronizzazione'}[st];
  $('sync-dot').className='sync-dot '+st;$('sync-dot').title=lab;
  if($('sync-status')){$('sync-status').className='sync-pill '+st;$('sync-status').textContent=lab+(detail?' · '+detail:'')}}

async function syncStart(){
  unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[];remoteTrips=null;remoteMeta=undefined;remoteZone=undefined;adminOk=null;joinedReady=false;
  if(!sync.code){setSync('off');return}
  if(!syncSupported()){setSync('bad','non disponibile qui');return}
  setSync('wait');
  try{
    if(!firebase.apps.length)firebase.initializeApp(FB_CONFIG);
    if(!firebase.auth().currentUser)await firebase.auth().signInAnonymously();
    if(!fsdb){fsdb=firebase.firestore();
      // reti che bloccano il collegamento continuo: si passa da sola a una modalità più tollerante (stesso numero di letture)
      try{fsdb.settings({experimentalAutoDetectLongPolling:true,merge:true})}catch(e){}
      // cache locale: alla riapertura i documenti già scaricati si leggono dal telefono e il server invia solo le novità
      try{await fsdb.enablePersistence({synchronizeTabs:true})}catch(e){/* più schede o browser senza IndexedDB: si continua senza */}}
  }catch(e){setSync('pending',String(e&&(e.code||e.message)||e).slice(0,80));setTimeout(syncStart,15000);return}
  unsubs.push(gref().collection('viaggi').onSnapshot({includeMetadataChanges:true},snap=>{remoteTrips=new Map();snap.forEach(d=>remoteTrips.set(d.id,d.data()));
      syncMerge(snap.metadata.fromCache||snap.metadata.hasPendingWrites)},e=>setSync('bad',e.code)));
  // solo le ultime due settimane, filtrate dal server (le prenotazioni vecchie non vengono più scaricate)
  unsubs.push(gref().collection('prenotazioni').where('date','>=',isoShift(todayISO(),-14)).onSnapshot(snap=>{const list=[];snap.forEach(d=>{const b=d.data();if(!b.deleted)list.push({...b,id:d.id})});
    state.bookings=list;persistLocal();if(typeof renderBookings==='function'){renderBookings();renderPending()}},()=>{}));
  unsubs.push(gref().collection('iscritti').onSnapshot(snap=>{const j={};snap.forEach(d=>{const x=d.data();if(x&&!x.left&&x.pid)j[x.pid]=x});joined=j;joinedReady=true;joinCheck();render();if(!$('whoami').hidden)whoList()},()=>{}));
  unsubs.push(gref().collection('meta').doc('stato').onSnapshot({includeMetadataChanges:true},d=>{remoteMeta=d.exists?d.data():null;syncMerge(d.metadata.fromCache)},e=>setSync('bad',e.code)));
  unsubs.push(gref().collection('meta').doc('zone').onSnapshot({includeMetadataChanges:true},d=>{remoteZone=d.exists?d.data():null;syncMerge(d.metadata.fromCache)},()=>{remoteZone=null;syncMerge(true)}));
  checkAdmin();
  syncPaused=false;lazySync();
}
// --- ascolti "su richiesta": registro delle modifiche e suggerimenti solo mentre la loro pagina è aperta
let lazyUn={ev:null,sug:null},lazyKey={ev:'',sug:''},evLimit=50,syncPaused=false,hideTimer=null;
function lazySync(){const on=!!(fsdb&&sync.code&&!syncPaused),h=location.hash.slice(1);
  const wantEv=on&&h==='registro'&&!$('pane-modifiche').hidden,wantSug=on&&h==='suggerimenti';
  const kEv=wantEv?sync.code+'|'+evLimit:'',kSug=wantSug?sync.code:'';
  if(kEv!==lazyKey.ev){if(lazyUn.ev){lazyUn.ev();lazyUn.ev=null}lazyKey.ev=kEv;
    if(wantEv)lazyUn.ev=gref().collection('eventi').orderBy('t','desc').limit(evLimit).onSnapshot(snap=>{remoteEvents=[];snap.forEach(d=>remoteEvents.push(d.data()));renderEvents()},()=>{})}
  if(kSug!==lazyKey.sug){if(lazyUn.sug){lazyUn.sug();lazyUn.sug=null}lazyKey.sug=kSug;
    if(wantSug)lazyUn.sug=gref().collection('suggerimenti').orderBy('t','desc').limit(30).onSnapshot(snap=>{sugRemote=[];snap.forEach(d=>sugRemote.push({...d.data(),id:d.id}));renderSug()},()=>{})}}
function lazyStop(){['ev','sug'].forEach(k=>{if(lazyUn[k]){try{lazyUn[k]()}catch(e){}lazyUn[k]=null}lazyKey[k]=''})}
// --- app in background: dopo 1 minuto si chiudono tutti gli ascolti; al ritorno si riaprono (prima dalla cache del telefono)
document.addEventListener('visibilitychange',()=>{clearTimeout(hideTimer);
  if(document.hidden){if(sync.code&&!syncPaused)hideTimer=setTimeout(()=>{if(!document.hidden)return;syncPaused=true;lazyStop();unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[]},60000)}
  else if(syncPaused&&sync.code){syncStart()}});
// unisce i dati remoti con quelli locali non ancora inviati
function syncMerge(fromCache){
  if(remoteTrips===null||remoteMeta===undefined||remoteZone===undefined)return;
  if(remoteMeta&&remoteMeta.prot){const pt=sync.teams.find(x=>x.code===sync.code);if(pt&&!pt.prot){pt.prot=true;saveSync()}}
  applyAdmin();
  applying=true;
  if(remoteMeta&&sync.metaDirty&&!canPushStato()){sync.metaDirty=false;saveSync()}
  if(remoteMeta&&!sync.metaDirty){state.people=remoteMeta.people||[];state.start=remoteMeta.start||null;state.teamName=remoteMeta.teamName||'';
    const tt=sync.teams&&sync.teams.find(x=>x.code===sync.code);if(tt&&tt.name!==state.teamName){tt.name=state.teamName;saveSync()}}
  {const zg=remoteZone?(remoteZone.groups||[]):(remoteMeta&&Array.isArray(remoteMeta.groups)?remoteMeta.groups:null);if(zg&&!sync.zoneDirty)state.groups=clean(zg)}
  migrateGroups(state);
  const del=new Set(sync.pendingDel),dirty=new Set(sync.dirty),localById=new Map(state.trips.map(t=>[t.id,t])),out=[];
  remoteTrips.forEach((d,id)=>{if(dirty.has(id)&&localById.has(id)){out.push(localById.get(id));return}
    if(!d.deleted&&!del.has(id)){const t={id,date:d.date,weight:d.weight||1,note:d.note||'',cars:d.cars||[]};if(d.hist)t.hist=true;if(d.pend)t.pend=true;if(d.by)t.by=d.by;if(d.uid)t.uid=d.uid;out.push(t)}});
  state.trips.forEach(t=>{if(!remoteTrips.has(t.id)&&!del.has(t.id))out.push(t)});
  out.sort((a,b)=>a.date.localeCompare(b.date));
  state.trips=out;delete state.sample;
  persistLocal();lastMeta=JSON.stringify(metaOf());lastZone=JSON.stringify(zoneOf());lastSnap=snapOf();
  render();applying=false;
  if(!fromCache)lastServer=Date.now();
  setSync(fromCache?'pending':'ok',fromCache?'server non raggiunto, dati del telefono':'');
  if(!fromCache)setTimeout(()=>{joinCheck();maybeAskWho()},0);
  if(!fromCache&&sync.creator&&!teamProt()&&!protNagged){protNagged=true;setTimeout(()=>snack('Squadra non ancora protetta: apri Squadra › la tua squadra › Proteggi la squadra.'),1500)}
  if(!fromCache&&/…$/.test($('sync-msg').textContent))smsg('Dati sincronizzati.');
  if(!fromCache&&remoteMeta===null&&!sync.creator&&!remoteTrips.size)smsg('Nessuna squadra trovata con questo codice: controllalo, oppure esci dalla squadra.');
  syncPush();
}
// una scrittura negata dalle regole non deve bloccare le altre: si ripete una per una e quelle non consentite si annullano
async function isolateDenied(ops){const bad=[];
  for(const [c,id,d,merge] of ops){try{const b=fsdb.batch();b.set(gref().collection(c).doc(id),d,merge?{merge:true}:{});await b.commit()}catch(e){if(e&&e.code==='permission-denied')bad.push([c,id]);else throw e}}
  return bad}
function dropDenied(bad){bad.forEach(([c,id])=>{if(c==='viaggi'&&!(remoteTrips&&remoteTrips.has(id)))state.trips=state.trips.filter(t=>t.id!==id)});
  persistLocal();snack('Alcune modifiche non sono consentite e sono state annullate.');setTimeout(()=>syncMerge(false),0)}
async function syncPush(){
  if(!fsdb||remoteTrips===null||remoteMeta===undefined||remoteZone===undefined)return;
  if(pushing){pushAgain=true;return}
  const ops=[],by=sync.me||'',at=firebase.firestore.FieldValue.serverTimestamp();
  const upd=[...sync.dirty];
  state.trips.forEach(t=>{if(!remoteTrips.has(t.id)||upd.includes(t.id)){const d=clean({date:t.date,weight:isAdmin()?t.weight:1,note:t.note||'',cars:t.cars,by:t.by||by,uid:t.uid||myUid()});if(t.hist)d.hist=true;if(t.pend)d.pend=true;d.at=at;ops.push(['viaggi',t.id,d,false])}});
  const dels=[...sync.pendingDel];dels.forEach(id=>ops.push(['viaggi',id,{deleted:true,delBy:by,at},true]));
  const own=canPushStato();
  const meta=own&&(sync.metaDirty||(remoteMeta===null&&sync.creator));if(meta)ops.push(['meta','stato',{...clean(metaOf()),...(teamProt()?{prot:true}:{}),by,at},false]);
  const zone=!!sync.zoneDirty||(meta&&remoteZone===null&&(state.groups||[]).length>0);if(zone)ops.push(['meta','zone',{...clean(zoneOf()),by,at},false]);
  const evs=sync.pendingEv.slice(0,400);
  if(!ops.length&&!evs.length)return;
  pushing=true;sync.metaDirty=false;sync.zoneDirty=false;saveSync();
  try{
    let bad=[];
    try{for(let i=0;i<ops.length;i+=400){const b=fsdb.batch();
      ops.slice(i,i+400).forEach(([c,id,d,merge])=>b.set(gref().collection(c).doc(id),d,merge?{merge:true}:{}));await b.commit()}}
    catch(e){if(!(e&&e.code==='permission-denied'))throw e;bad=await isolateDenied(ops)}
    sync.pendingDel=sync.pendingDel.filter(id=>!dels.includes(id));sync.dirty=sync.dirty.filter(id=>!upd.includes(id));
    if(bad.length)dropDenied(bad);
    saveSync();setSync('ok');
  }catch(e){if(meta)sync.metaDirty=true;if(zone)sync.zoneDirty=true;saveSync();setSync(e&&e.code==='permission-denied'?'bad':'pending',e&&e.code||'')}
  // le modifiche al registro eventi vanno in un invio separato: le regole permettono solo di aggiungerle
  if(evs.length){try{const b=fsdb.batch();evs.forEach(e=>b.set(gref().collection('eventi').doc(e.id),{...e,uid:myUid(),at},{}));await b.commit();
      const sent=new Set(evs.map(e=>e.id));sync.pendingEv=sync.pendingEv.filter(e=>!sent.has(e.id));saveSync()}
    catch(e){if(e&&e.code==='permission-denied'){const sent=new Set(evs.map(x=>x.id));sync.pendingEv=sync.pendingEv.filter(x=>!sent.has(x.id));saveSync()}}}
  pushing=false;if(pushAgain){pushAgain=false;syncPush()}
}
// --- registro delle modifiche: chi ha fatto cosa e quando (ricavato confrontando i dati prima e dopo ogni modifica)
const EV_KEY='blabla-eventi';
let localEvents=[];try{localEvents=JSON.parse(localStorage.getItem(EV_KEY))||[]}catch(e){}
let remoteEvents=null,evShown=60;
sync.pendingEv=sync.pendingEv||[];
const snapOf=()=>JSON.parse(JSON.stringify({people:state.people||[],groups:state.groups||[],start:state.start||null,trips:state.trips||[]}));
let lastSnap=snapOf();
const dIt=iso=>new Date(iso+'T12:00').toLocaleDateString('it-IT');
const tripText=(t,nm)=>`${dIt(t.date)}: `+t.cars.map(c=>`${nm(c.driver)} guida (${c.passengers.map(nm).join(', ')})`).join(' · ');
function diffEvents(a,b){
  const ev=[],who=(id,x,y)=>((x.people.find(p=>p.id===id)||y.people.find(p=>p.id===id)||{name:'?'}).name);
  const nmA=id=>who(id,a,b),nmB=id=>who(id,b,a),gN=(s,id)=>(s.groups.find(g=>g.id===id)||{name:'?'}).name;
  const A=new Map(a.trips.map(t=>[t.id,t])),B=new Map(b.trips.map(t=>[t.id,t]));
  const added=b.trips.filter(t=>!A.has(t.id)),removed=a.trips.filter(t=>!B.has(t.id)),changed=b.trips.filter(t=>A.has(t.id)&&core(t)!==core(A.get(t.id)));
  if(added.length>10)ev.push(['bulk',`Aggiunti ${added.length} viaggi in blocco (importazione o ripristino)`]);
  else added.forEach(t=>ev.push(['trip',`Viaggio aggiunto · ${tripText(t,nmB)}${t.weight>1?' · peso ×'+t.weight:''}${t.pend?' · da confermare':''}`]));
  if(removed.length>10)ev.push(['bulk',`Eliminati ${removed.length} viaggi in blocco`]);
  else removed.forEach(t=>ev.push(['del',`Viaggio eliminato · ${tripText(t,nmA)}`]));
  if(changed.length>10)ev.push(['bulk',`Modificati ${changed.length} viaggi in blocco`]);
  else changed.forEach(t=>{const o=A.get(t.id);
    if(o.pend&&!t.pend&&core({...o,pend:false})===core(t))ev.push(['trip',`Viaggio confermato · ${tripText(t,nmB)}`]);
    else ev.push(['trip',`Viaggio modificato · prima ${tripText(o,nmA)} → ora ${tripText(t,nmB)}`])});
  const PA=new Map(a.people.map(p=>[p.id,p]));
  b.people.forEach(p=>{const o=PA.get(p.id);
    if(!o){ev.push(['person',`Aggiunto viaggiatore ${p.name}`]);return}
    if(o.name!==p.name)ev.push(['person',`Rinominato ${o.name} → ${p.name}`]);
    if(!o.deleted&&p.deleted)ev.push(['del',`Eliminato viaggiatore ${p.name}`]);
    else if(!o.archived&&p.archived)ev.push(['person',`Archiviato ${p.name}`]);
    else if(o.archived&&!p.archived&&!p.deleted)ev.push(['person',`Ripristinato ${p.name}`]);
  });
  a.people.forEach(p=>{if(!b.people.some(x=>x.id===p.id))ev.push(['del',`Rimosso viaggiatore ${p.name}`])});
  const GA=new Map(a.groups.map(g=>[g.id,g]));
  b.groups.forEach(g=>{const o=GA.get(g.id);if(!o)ev.push(['group',`Creata zona ${g.name}`]);else if(o.name!==g.name)ev.push(['group',`Zona rinominata ${o.name} → ${g.name}`]);
    const was=new Set((o&&o.members)||[]),now=new Set(g.members||[]);
    now.forEach(id=>{if(!was.has(id))ev.push(['group',`${nmB(id)} aggiunto a ${g.name}`])});
    was.forEach(id=>{if(!now.has(id)&&b.people.some(p=>p.id===id&&!p.deleted))ev.push(['group',`${nmB(id)} tolto da ${g.name}`])})});
  a.groups.forEach(g=>{if(!b.groups.some(x=>x.id===g.id))ev.push(['group',`Eliminata zona ${g.name}`])});
  const sa=(a.start&&a.start.points)||{},sb=(b.start&&b.start.points)||{},ch=[];
  new Set([...Object.keys(sa),...Object.keys(sb)]).forEach(id=>{const x=sa[id]||0,y=sb[id]||0;if(x!==y)ch.push(`${nmB(id)} ${fmt(x)||'0'} → ${fmt(y)||'0'}`)});
  if(ch.length)ev.push(['start',`Punti di partenza modificati: ${ch.join(', ')}`]);
  return ev;
}
function addEvents(list){if(!list.length)return;
  let dev='';try{if(window.firebase&&firebase.apps.length&&firebase.auth().currentUser)dev=firebase.auth().currentUser.uid.slice(0,6)}catch(e){}
  const t=new Date().toISOString();
  list.forEach(([kind,text],i)=>{const e={id:uid()+i,t,by:sync.me||'',dev,kind,text};localEvents.unshift(e);if(sync.code)sync.pendingEv.push(e)});
  localEvents=localEvents.slice(0,300);try{localStorage.setItem(EV_KEY,JSON.stringify(localEvents))}catch(e){}
  saveSync();renderEvents();
}
function renderEvents(){
  const box=$('events');if(!box)return;
  let list=localEvents;
  if(sync.code&&remoteEvents){const ids=new Set(remoteEvents.map(e=>e.id));list=[...sync.pendingEv.filter(e=>!ids.has(e.id)),...remoteEvents]}
  list=[...list].sort((x,y)=>String(y.t).localeCompare(String(x.t)));
  if($('ev-only-start').checked)list=list.filter(e=>e.kind==='start');
  $('ev-sum').textContent=list.length?`${list.length}${remoteEvents&&remoteEvents.length>=evLimit?'+':''} modifiche`:'';
  if(!list.length){box.innerHTML='<p class="hint" style="margin:0">Nessuna modifica registrata finora.</p>';return}
  let lastD='';
  box.innerHTML=list.slice(0,evShown).map(e=>{const d=new Date(e.t),day=d.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
    const head=day!==lastD?`<h3 class="lm">${day}</h3>`:'';lastD=day;
    return head+`<div class="ev ${esc(e.kind||'')}"><span class="ev-t">${d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</span>
      <div class="ev-b"><div class="ev-x">${esc(e.text)}</div><div class="ev-who">${e.by?esc(e.by):'nome non indicato'}${e.dev?' · dispositivo '+esc(e.dev):''}</div></div></div>`}).join('')
    +(list.length>evShown||(remoteEvents&&remoteEvents.length>=evLimit)?'<button class="ghost wide" id="ev-more">Mostra altre</button>':'');
}
$('events').onclick=e=>{if(e.target.id==='ev-more'){evShown+=50;if(remoteEvents&&remoteEvents.length>=evLimit){evLimit+=50;lazySync()}renderEvents()}};
$('ev-only-start').onchange=renderEvents;
document.querySelectorAll('[data-seg]').forEach(b=>b.onclick=()=>{const m=b.dataset.seg==='modifiche';
  $('pane-viaggi').hidden=m;$('pane-modifiche').hidden=!m;
  document.querySelectorAll('[data-seg]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));if(m)renderEvents();lazySync()});
// ogni modifica locale passa da persist(): qui capiamo cosa inviare
const persistLocal=persist;
persist=function(){persistLocal();
  if(applying)return;
  const cur=snapOf();addEvents(diffEvents(lastSnap,cur));lastSnap=cur;
  if(!sync.code)return;
  if(JSON.stringify(metaOf())!==lastMeta){if(canPushStato())sync.metaDirty=true;lastMeta=JSON.stringify(metaOf())}
  if(JSON.stringify(zoneOf())!==lastZone){sync.zoneDirty=true;lastZone=JSON.stringify(zoneOf())}
  if(remoteTrips){const ids=new Set(state.trips.map(t=>t.id));
    remoteTrips.forEach((d,id)=>{if(!d.deleted&&!ids.has(id)&&!sync.pendingDel.includes(id))sync.pendingDel.push(id)});
    state.trips.forEach(t=>{const d=remoteTrips.get(t.id);if(d&&!d.deleted&&core(t)!==core(d)&&!sync.dirty.includes(t.id))sync.dirty.push(t.id)})}
  saveSync();syncPush()};

// --- squadre: l'app ricorda più squadre e si passa dall'una all'altra; ognuna ha codice, nome e il tuo nome
sync.teams=sync.teams||[];
if(sync.code&&!sync.teams.some(t=>t.code===sync.code))sync.teams.push({code:sync.code,name:'',me:sync.me||'',creator:!!sync.creator});
saveSync();
const CACHE_PREFIX='ca-cache:';
const curTeam=()=>sync.teams.find(t=>t.code===sync.code);
const teamLabel=t=>t&&t.name?t.name:'Squadra senza nome';
function rememberTeam(){const t=curTeam();if(!t)return;t.me=sync.me||'';t.creator=!!sync.creator;if(state.teamName)t.name=state.teamName;
  try{localStorage.setItem(CACHE_PREFIX+sync.code,JSON.stringify(state))}catch(e){}saveSync()}
const hasPending=()=>sync.pendingEv.length||sync.pendingDel.length||sync.dirty.length||sync.metaDirty||sync.zoneDirty;
function stopSync(){joined={};lazyStop();unsubs.forEach(u=>{try{u()}catch(x){}});unsubs=[];remoteTrips=null;remoteMeta=undefined;remoteZone=undefined;adminOk=null;joinedReady=false;remoteEvents=null}
// passa a un'altra squadra (già nota o nuova); i dati arrivano da Firebase, nel frattempo si mostra la copia salvata
function openTeam(code,{me='',creator=false,name='',fresh:newState=null}={}){
  if(sync.code){if(hasPending()){smsg('Ci sono modifiche non ancora inviate: aspetta che il pallino diventi verde e riprova.');return false}rememberTeam()}
  stopSync();
  let t=sync.teams.find(x=>x.code===code);
  if(!t){t={code,name,me,creator};sync.teams.push(t)}
  sync.code=code;sync.me=t.me||me;sync.creator=!!(t.creator||creator);sync.pendingDel=[];sync.dirty=[];sync.pendingEv=[];sync.metaDirty=!!newState;sync.zoneDirty=!!newState;
  let cached=null;try{cached=JSON.parse(localStorage.getItem(CACHE_PREFIX+code))}catch(e){}
  applying=true;state=newState||cached||{people:[],trips:[],groups:[],start:null};migrateGroups(state);persistLocal();applying=false;
  lastSnap=snapOf();lastMeta=newState?'':JSON.stringify(metaOf());lastZone=newState?'':JSON.stringify(zoneOf());
  saveSync();fresh();pMenu=null;render();syncStart();return true;
}
function renderSync(){
  window.__startLocked=!!(sync.code&&!sync.creator);window.__inTeam=!!sync.code;
  // permessi: condivisione solo al creatore, nuove squadre disattivate
  const shareOk=canShare();
  $('sync-share-box').hidden=!shareOk;
  document.querySelectorAll('.dm[href="#condividi"]').forEach(a=>{a.style.display=shareOk?'':'none'});
  $('team-new').style.display=canNewTeam()?'':'none';
  if(!canNewTeam())$('team-new-box').hidden=true;
  $('sync-create-box').hidden=!canNewTeam();
  if(location.hash==='#condividi'&&!shareOk)location.replace('#viaggio');
  const on=!!sync.code,sup=syncSupported(),t=curTeam();
  $('sync-off').hidden=on||!sup;$('sync-on').hidden=!on;$('sync-na').hidden=sup;
  const opts=active().map(p=>p.name).sort((a,b)=>a.localeCompare(b));
  ['sync-me','sync-me2'].forEach(id=>{$(id).innerHTML='<option value="">— scegli il tuo nome —</option>'+opts.map(n=>{const tk=n!==sync.me&&takenName(n);return `<option ${n===sync.me?'selected':''}${tk?' disabled':''}>${esc(n)}${tk?' (già associato)':''}</option>`}).join('')});
  $('team-name').textContent=on?' · '+teamLabel(t):'';
  // elenco delle squadre, con il numero di iscritti
  const cnt=code=>{if(code===sync.code)return active().length;
    try{const c=JSON.parse(localStorage.getItem(CACHE_PREFIX+code));return c?(c.people||[]).filter(p=>!p.archived&&!p.deleted).length:null}catch(e){return null}};
  let rows=sync.teams.map(x=>{const n=cnt(x.code);
    return `<button class="tm${x.code===sync.code?' cur':''}" data-team="${esc(x.code)}"><span><b>${esc(teamLabel(x))}</b><small>${x.creator?'creata da te':'creata da un collega'}${x.code===sync.code?' · aperta':''}</small></span><span class="tm-n">${n==null?'—':n}<small>${n===1?'iscritto':'iscritti'}</small></span><span class="tm-go">›</span></button>`}).join('');
  if(!on)rows=`<button class="tm cur" data-team=""><span><b>Su questo telefono</b><small>non condivisa</small></span><span class="tm-n">${active().length}<small>persone</small></span><span class="tm-go">›</span></button>`+rows;
  $('teams-list').innerHTML=rows;
  $('teams-hint').textContent=on?'Tocca una squadra per vedere i partecipanti e il codice di condivisione.':(canNewTeam()?'Non sei ancora in una squadra condivisa: entra con un codice ricevuto o creane una.':'Non sei ancora in una squadra condivisa: entra con un codice ricevuto.');
  // pagina della squadra aperta
  $('team-title').textContent=on?teamLabel(t):'Su questo telefono';
  $('team-sub').textContent=on?`${active().length} ${active().length===1?'iscritto':'iscritti'} · ${sync.creator?"l'hai creata tu":'creata da un collega'}`:(canNewTeam()?'Dati non condivisi: per condividerli crea una squadra da "Le mie squadre".':'Dati non condivisi: per condividerli entra in una squadra da "Le mie squadre".');
  $('team-rename-box').hidden=!on||!sync.creator;$('me-box').hidden=!on;
  const prot=teamProt();$('admin-claim').hidden=!on||(prot?!!sync.creator:!sync.creator);$('admin-set').hidden=!on||!sync.creator||!prot;
  if(on){$('admin-set-sum').textContent='Password amministratore · impostata';
    $('admin-claim-toggle').textContent=prot?'Hai creato tu questa squadra? Recupera i permessi':'Proteggi la squadra (consigliato)';
    $('admin-claim-hint').textContent=prot?'Inserisci la password amministratore che hai scelto quando hai protetto la squadra.'
      :`Scegli una password amministratore (almeno ${PW_MIN} caratteri) per proteggere la squadra: da quel momento solo chi la conosce può essere amministratore. Annotala: non si può recuperare. Fallo solo se sei tu il creatore.`;
    $('admin-claim-go').textContent=prot?'Recupera i permessi':'Proteggi la squadra';
    $('admin-pw').autocomplete=prot?'current-password':'new-password'}
  if(on){$('sync-code').textContent=sync.code;if(document.activeElement!==$('team-rename'))$('team-rename').value=t&&t.name||''}
  setSync(syncState);
}
const smsg=t=>{$('sync-msg').textContent=t};
$('sync-me').onchange=$('sync-me2').onchange=e=>{if(takenName(e.target.value)){snack(TAKEN_MSG);renderSync();return}sync.me=e.target.value;const t=curTeam();if(t)t.me=sync.me;saveSync();joinCheck();renderSync()};
const DEV=(()=>{let d='';try{d=localStorage.getItem('ca-dev')||'';if(!d){d=Math.random().toString(36).slice(2,10);localStorage.setItem('ca-dev',d)}}catch(e){d='x'}return d})();
// segna "unito" il nome scelto su questo telefono (e lo toglie dal nome scelto prima, se cambiato)
// un nome appartiene a un solo telefono: iscritti/<pid> porta l'uid dell'utente che lo ha scelto per primo
const TAKEN_MSG="Questo nome è già associato a un altro telefono: chiedi all'amministratore di liberarlo.";
const LOST_MSG="Questo nome non è più associato al tuo telefono: sceglilo di nuovo o chiedi all'amministratore.";
const nameTaken=pid=>{const j=joined[pid],u=myUid();if(!j)return false;if(j.uid)return !!u&&j.uid!==u;return !!(j.dev&&j.dev!==DEV&&teamProt())};
const takenName=n=>{const p=active().find(x=>x.name===n);return !!p&&nameTaken(p.id)};
function releaseMine(msg){sync.me='';const t=curTeam();if(t)t.me='';saveSync();if(msg)snack(msg);render();renderSync()}
function joinCheck(){if(!fsdb||!sync.code||!joinedReady||remoteMeta===undefined)return;const me=myPid(),col=gref().collection('iscritti'),u=myUid(),iso=new Date().toISOString();
  // libera i nomi che questo telefono aveva scelto prima
  Object.values(joined).forEach(x=>{if(x.pid!==me&&((u&&x.uid===u)||(!x.uid&&x.dev===DEV))){delete joined[x.pid];col.doc(x.pid).delete().catch(()=>{})}});
  if(!me||!u)return;
  const j=joined[me];
  if(!j){const x={pid:me,name:name(me),dev:DEV,at:iso,uid:u};joined[me]=x;col.doc(me).set(x).catch(e=>{delete joined[me];if(e&&e.code==='permission-denied')releaseMine(LOST_MSG)})}
  else if(!j.uid&&j.dev===DEV){const x={pid:me,name:j.name||name(me),dev:DEV,at:j.at||iso,uid:u};joined[me]=x;col.doc(me).set(x).catch(()=>{})}   // collegamento della versione precedente: lo si lega a questo utente
  else if(nameTaken(me))releaseMine(TAKEN_MSG)}
// nome della squadra: lo decide chi l'ha creata, viaggia con i dati condivisi
$('team-rename').onchange=()=>{const n=$('team-rename').value.trim().slice(0,40);if(!n||!sync.creator)return;state.teamName=n;const t=curTeam();if(t)t.name=n;persist();render();smsg('Nome della squadra aggiornato.')};
$('team-rename').onkeydown=e=>{if(e.key==='Enter')e.target.blur()};
// dal telefono non collegato: i dati attuali diventano una squadra
$('sync-create').onclick=()=>{
  if(!canNewTeam())return;
  if(!sync.me){smsg('Scegli prima il tuo nome.');return}
  const n=$('team-name-new').value.trim().slice(0,40)||'La mia squadra';
  state.teamName=n;persistLocal();
  sync.code=newCode();sync.creator=true;sync.metaDirty=true;sync.pendingDel=[];sync.teams.push({code:sync.code,name:n,me:sync.me,creator:true});
  saveSync();renderSync();smsg('Squadra creata: sto caricando i tuoi dati…');syncStart()};
$('sync-join').onclick=e=>joinTeam($('sync-join-code').value,e.target,true);
$('team-join').onclick=e=>joinTeam($('team-join-code').value,e.target,false);
function joinTeam(raw,btn,replacesLocal){
  const c=normCode(raw);
  if(!/^(BLA|COL)(-[A-Z0-9]{4}){4}$/.test(c)){smsg('Il codice deve avere la forma COL-XXXX-XXXX-XXXX-XXXX.');return}
  if(sync.teams.some(t=>t.code===c)){openTeam(c);smsg('Squadra aperta.');return}
  if(replacesLocal&&state.people.length&&!btn.dataset.c){btn.dataset.c=1;btn.textContent='Conferma: sostituisci i miei dati';smsg('I dati di questo telefono verranno sostituiti da quelli della squadra.');return}
  delete btn.dataset.c;btn.textContent=replacesLocal?'Entra nella squadra':'Entra';
  if(!sync.code){applying=true;state={people:[],trips:[],groups:[],start:null};persistLocal();applying=false}
  if(openTeam(c,{fresh:null}))smsg('Collegamento alla squadra…');
}
// nuova squadra vuota: parte da zero, con te come primo viaggiatore
$('team-new').onclick=()=>{if(!canNewTeam())return;$('team-new-box').hidden=!$('team-new-box').hidden;if(!$('team-new-box').hidden)$('team-new-name').focus()};
$('team-new-ok').onclick=()=>{
  if(!canNewTeam())return;
  const n=$('team-new-name').value.trim().slice(0,40),me=$('team-new-me').value.trim().slice(0,40);
  if(!n){smsg('Dai un nome alla nuova squadra.');return}
  if(!me){smsg('Scrivi il tuo nome: sarai il primo viaggiatore.');return}
  const st={people:[{id:uid(),name:me}],trips:[],groups:[],start:null,teamName:n};
  if(openTeam(newCode(),{me,creator:true,name:n,fresh:st})){
    $('team-new-box').hidden=true;$('team-new-name').value='';$('team-new-me').value='';
    addEvents([['team',`Creata la squadra ${n}`]]);syncPush();smsg(`Squadra "${n}" creata: manda il codice ai colleghi.`)}};
$('teams-list').onclick=e=>{const b=e.target.closest('[data-team]');if(!b)return;const c=b.dataset.team;
  if(c&&c!==sync.code&&!openTeam(c))return;location.hash='membri'};
$('sync-copy').onclick=()=>{if(!canShare())return;const t=sync.code;
  const ok=()=>smsg('Codice copiato'),ko=()=>{const r=document.createRange();r.selectNodeContents($('sync-code'));const s=getSelection();s.removeAllRanges();s.addRange(r);smsg('Codice selezionato: copialo')};
  try{navigator.clipboard?navigator.clipboard.writeText(t).then(ok,ko):ko()}catch(e){ko()}};
$('sync-share').onclick=()=>{if(!canShare())return;const txt=`Entra nella squadra "${teamLabel(curTeam())}" su CollegAuto con questo codice:\n${sync.code}\n\nApri ${location.protocol==='https:'?location.origin+location.pathname:'CollegAuto'} → Dati → Entra nella squadra`;
  if(navigator.share){navigator.share({text:txt}).catch(()=>{});return}
  $('sync-copy').click()};
// esci da questa squadra: se ne hai altre passi a quella, altrimenti resti con la copia sul telefono
$('sync-leave').onclick=e=>{if(!e.target.dataset.c){e.target.dataset.c=1;e.target.textContent='Conferma: esci da questa squadra';return}
  delete e.target.dataset.c;e.target.textContent='Esci da questa squadra';
  if(hasPending()){smsg('Ci sono modifiche non ancora inviate: aspetta che il pallino diventi verde e riprova.');return}
  const old=sync.code,name=teamLabel(curTeam());sync.teams=sync.teams.filter(t=>t.code!==old);try{localStorage.removeItem(CACHE_PREFIX+old)}catch(x){}
  const next=sync.teams[0];
  if(next){sync.code='';openTeam(next.code);smsg(`Sei uscito da "${name}". Ora sei in "${teamLabel(next)}".`);return}
  stopSync();sync={pendingDel:[],dirty:[],pendingEv:[],me:sync.me,teams:[]};saveSync();renderSync();setSync('off');smsg(`Sei uscito da "${name}": i dati restano su questo telefono.`)};
$('team-name').onclick=()=>{location.hash=sync.code?'membri':'squadra'};
$('team-join-toggle').onclick=()=>{$('team-join-box').hidden=!$('team-join-box').hidden;if(!$('team-join-box').hidden)$('team-join-code').focus()};
const _render2=render;render=function(){renderSync();_render2();renderEvents()};
renderSync();syncStart();

// --- installazione come app (iPhone: "Aggiungi alla schermata Home"; Android/PC: pulsante Installa) e benvenuto
const isWeb=location.protocol==='https:'&&!inViewer;
const isStandalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let installEvt=null,installOff=false;try{installOff=localStorage.getItem('ca-install-off')==='1'}catch(e){}
function renderInstall(){
  const show=isWeb&&!isStandalone&&!installOff&&(isIOS||installEvt);
  $('install').hidden=!show;if(!show)return;
  $('install-go').hidden=!installEvt;
  $('install-how').innerHTML=installEvt?'Aggiungila alla schermata Home e aprila come un\'app.'
    :'In Safari tocca <span class="ins-share" aria-label="Condividi"></span> <b>Condividi</b>, poi <b>Aggiungi alla schermata Home</b>.';
}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;renderInstall()});
addEventListener('appinstalled',()=>{installEvt=null;installOff=true;renderInstall()});
$('install-go').onclick=async()=>{if(!installEvt)return;installEvt.prompt();try{await installEvt.userChoice}catch(e){}installEvt=null;renderInstall()};
$('install-x').onclick=()=>{installOff=true;try{localStorage.setItem('ca-install-off','1')}catch(e){}renderInstall()};
function renderWelcome(){$('welcome').hidden=!(state.people.length===0&&!sync.code)}
$('welcome-join').onclick=()=>{location.hash='squadra';setTimeout(()=>{const i=$('sync-join-code');i.scrollIntoView({block:'center'});i.focus()},120)};
$('welcome-new').onclick=()=>{location.hash='membri';setTimeout(()=>$('new-person').focus(),120)};
const _render3=render;render=function(){_render3();renderWelcome()};
renderInstall();renderWelcome();
if(isWeb&&'serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
