(window.__V=window.__V||{})['app-extra']='7.5.4';
// ===================== Condividi l'app (link, QR, WhatsApp, Telegram) e inviti alla squadra =====================
const APP_URL='https://mariolive82100.github.io/collegauto/';
const appBase=()=>location.protocol==='https:'&&!inViewer?location.origin+location.pathname:APP_URL;
function shareData(){
  const withTeam=!!(sync.code&&$('sh-team').checked);
  const url=appBase()+(withTeam?'?squadra='+encodeURIComponent(sync.code):'');
  const text=withTeam
    ?`Ti invito nella squadra "${teamLabel(curTeam())}" su CollegAuto, l'app per organizzare i passaggi in auto tra colleghi: chi guida, chi viaggia, a chi tocca. Apri il link e aggiungila alla schermata Home:`
    :`Ti consiglio CollegAuto, l'app per organizzare i passaggi in auto tra colleghi: chi guida, chi viaggia, a chi tocca. Gratis, funziona su iPhone e Android. Aprila da qui e aggiungila alla schermata Home:`;
  return {url,text};
}
function renderShare(){
  if(!canShare()){location.replace('#viaggio');return}
  const {url,text}=shareData();
  $('sh-team-box').hidden=!sync.code;
  if(sync.code)$('sh-team-lbl').textContent=`Includi l'invito alla squadra "${teamLabel(curTeam())}"`;
  $('sh-link').textContent=url;
  try{const q=qrcode(0,'M');q.addData(url);q.make();$('sh-qr').innerHTML=q.createSvgTag({cellSize:5,margin:3,scalable:true})}catch(e){$('sh-qr').innerHTML=''}
  $('sh-wa').href='https://wa.me/?text='+encodeURIComponent(text+'\n'+url);
  $('sh-tg').href='https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(text);
  $('sh-native').hidden=!navigator.share;
}
function openShare(){if(canShare())location.hash='condividi'}
$('sh-team').onchange=renderShare;
$('sh-native').onclick=()=>{if(!canShare())return;const {url,text}=shareData();navigator.share({title:'CollegAuto',text,url}).catch(()=>{})};
$('sh-copy').onclick=()=>{if(!canShare())return;const {url}=shareData();const ok=()=>{$('sh-msg').textContent='Link copiato'},ko=()=>{const r=document.createRange();r.selectNodeContents($('sh-link'));const s=getSelection();s.removeAllRanges();s.addRange(r);$('sh-msg').textContent='Link selezionato: copialo'};
  try{navigator.clipboard?navigator.clipboard.writeText(url).then(ok,ko):ko()}catch(e){ko()}};
// chi arriva da un invito (?squadra=COL-...) trova il codice già pronto
(function(){let inv='';try{inv=normCode(new URLSearchParams(location.search).get('squadra')||'')}catch(e){}
  if(!/^(BLA|COL)(-[A-Z0-9]{4}){4}$/.test(inv))return;
  try{history.replaceState(null,'',location.pathname+location.hash)}catch(e){}
  if(sync.teams.some(t=>t.code===inv)){if(sync.code!==inv)openTeam(inv);return}
  location.hash='squadra';
  setTimeout(()=>{if(sync.code){$('team-join-box').hidden=false;$('team-join-code').value=inv}else $('sync-join-code').value=inv;
    smsg('Hai ricevuto un invito: scegli il tuo nome se te lo chiede e tocca "Entra".');window.scrollTo(0,0)},150)})();
// ===================== Menu a panino =====================
function openMenu(){$('drawer').hidden=false;$('drawer-bg').hidden=false;$('menu-open').setAttribute('aria-expanded','true')}
function closeMenu(){$('drawer').hidden=true;$('drawer-bg').hidden=true;$('menu-open').setAttribute('aria-expanded','false')}
$('menu-open').onclick=openMenu;$('menu-close').onclick=closeMenu;$('drawer-bg').onclick=closeMenu;
document.querySelectorAll('.dm').forEach(a=>a.addEventListener('click',closeMenu));
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('drawer').hidden)closeMenu()});

// ===================== Chi sei? (chi entra con codice o invito) =====================
let whoLater=false;
function maybeAskWho(){
  if(!sync.code||whoLater||remoteMeta===undefined||myPid()){$('whoami').hidden=true;return}
  $('who-team').textContent=`Squadra "${teamLabel(curTeam())}". Cerca il tuo nome in elenco: se non è presente, contatta l'amministratore della squadra.`;
  $('who-admin').hidden=!isAdmin();if($('whoami').hidden)$('who-find').value='';
  whoList();$('whoami').hidden=false;
}
function whoList(){const q=$('who-find').value.trim().toLowerCase();
  const ppl=active().filter(p=>!q||p.name.toLowerCase().includes(q)).sort((a,c)=>a.name.localeCompare(c.name));
  $('who-list').innerHTML=ppl.length?ppl.map(p=>{const tk=nameTaken(p.id);return `<button data-who="${esc(p.name)}"${tk?' disabled':''}><span>${dotsOf(p.id)} ${esc(p.name)}</span><span class="pm-val">${tk?'già associato':'sono io ›'}</span></button>`}).join('')
    :`<p class="hint" style="margin:10px">${active().length?'Nessun nome trovato. Se non sei in elenco, contatta l\'amministratore della squadra.':'La squadra è ancora vuota: contatta l\'amministratore.'}</p>`}
$('who-find').oninput=whoList;
function setMe(n){if(takenName(n)){snack(TAKEN_MSG);whoList();return}sync.me=n;const t=curTeam();if(t)t.me=n;saveSync();$('whoami').hidden=true;joinCheck();render();snack(`Ciao ${n}!`)}
$('who-list').onclick=e=>{const b=e.target.closest('[data-who]');if(b)setMe(b.dataset.who)};
$('who-add').onclick=()=>{if(!isAdmin())return;const n=$('who-new').value.trim().slice(0,40);if(!n)return;
  const ex=listed().find(p=>p.name.toLowerCase()===n.toLowerCase());
  if(ex){if(ex.archived){delete ex.archived;persist()}setMe(ex.name);return}
  state.people.push({id:uid(),name:n});persist();setMe(n)};
$('who-new').onkeydown=e=>{if(e.key==='Enter')$('who-add').click()};
$('who-later').onclick=()=>{whoLater=true;$('whoami').hidden=true};

// ===================== Suggerimenti =====================
let sugRemote=null;
function renderSug(){
  const on=!!sync.code;
  $('sug-send').disabled=!on;
  if(!on)$('sug-msg').textContent='Entra in una squadra per inviare suggerimenti.';
  const list=(sugRemote||[]).filter(x=>x.text).sort((a,c)=>String(c.t).localeCompare(String(a.t)));
  $('sug-count').textContent=list.length?String(list.length):'';
  $('sug-list').innerHTML=list.length?list.map(x=>`<div class="sug"><div class="sug-t">${esc(x.text)}</div><div class="ev-who">${x.by?esc(x.by):'nome non indicato'} · ${new Date(x.t).toLocaleDateString('it-IT',{day:'numeric',month:'short'})} ${new Date(x.t).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</div></div>`).join('')
    :'<p class="hint" style="margin:0">Ancora nessun suggerimento.</p>';
}
$('sug-send').onclick=()=>{const t=$('sug-text').value.trim();if(!t)return;
  if(!fsdb||!sync.code){$('sug-msg').textContent='Serve la connessione alla squadra: riprova tra poco.';return}
  const id=uid(),d={text:t.slice(0,600),by:sync.me||'',t:new Date().toISOString()};
  gref().collection('suggerimenti').doc(id).set(d).catch(()=>{});
  sugRemote=[...(sugRemote||[]),{...d,id}];$('sug-text').value='';$('sug-msg').textContent='Grazie! Il suggerimento è stato inviato.';renderSug()};

// ===================== Info sull'app =====================
const NOTES=[
 ['7.5.4','Più affidabile: se l\'app trova file di versioni diverse, si ripara da sola. In Info vedi le versioni dei file.'],
 ['7.5','Il tutorial ora mostra le schermate reali dell\'app, in tema chiaro e scuro.'],
 ['7.4','Nuovo tutorial al primo utilizzo; lo rivedi dal menu, voce "Come si usa".'],
 ['7.3','App divisa in più file per aggiornamenti più rapidi; la versione nell\'intestazione ora è sempre aggiornata.'],
 ['7.2','Sicurezza: ogni nome è associato a un solo telefono (il creatore può liberarlo dal menu del partecipante), i colleghi possono solo inserire viaggi da confermare con peso 1 e il registro delle modifiche non è falsificabile.'],
 ['7.1','Sicurezza: i permessi da creatore sono verificati dal server e la password amministratore non è più salvata nei dati condivisi. Le zone restano modificabili da tutti.'],
 ['7.0','Prenotazione: nel tasto "Orario normale" c\'è un interruttore FLEX che porta l\'orario a 7:30–16:00.'],
 ['6.9','Tolta la casella FLEX dal menu della prenotazione. Nella tabella dei presenti non compaiono più gli orari: gli elenchi si chiamano "Presenti" o "Gruppo 1, 2…".'],
 ['6.8','Prenotazione semplificata: "Orario normale" con la casella FLEX (7:30–16:00), "Altro orario" e "Vado da solo". I viaggi inseriti a mano da chi non è il creatore restano "da confermare" e non contano nei punti finché il creatore non li conferma.'],
 ['6.7','Solo il creatore della squadra può confermare i viaggi da confermare (gli altri possono modificare quelli a cui hanno partecipato). Condividere l\'app e il codice della squadra è riservato al creatore. Non si possono più creare nuove squadre: si entra solo con un codice.'],
 ['6.6','Viaggi registrati: possono essere eliminati solo da chi ha partecipato al viaggio e dal creatore della squadra; i viaggi dello storico importato solo dal creatore. Gli altri non vedono più il tasto "elimina".'],
 ['6.5','Meno letture su Firebase: cache sul telefono, prenotazioni filtrate dal server (ultime 2 settimane), registro e suggerimenti scaricati solo quando si aprono le loro pagine, ascolti chiusi quando l\'app resta in background.'],
 ['6.4','Se ci sono viaggi da confermare anche il prossimo viaggio è compresso (si apre toccandolo). I viaggi registrati riportano "Confermato".'],
 ['6.3','Il viaggio del giorno si può confermare dalle 7:00 (da quell\'ora la presenza vale per il viaggio successivo). Con più orari gli elenchi sono compressi e si aprono toccandoli; ogni orario ha un colore diverso.'],
 ['6.2','Corretto: i menu a tendina (zone e viaggi da confermare) si chiudevano da soli perché l\'app si aggiornava di continuo quando lo stesso nome era scelto su due telefoni.'],
 ['6.1','Pagina Zone: ogni zona è una tabella con i suoi membri; ✕ per togliere qualcuno, "+ Aggiungi persona" per aggiungerlo.'],
 ['6.0','Grafico dei punti più pulito: senza posizione né gruppo, con il nome in una colonna separata dalle barre. I gruppi si chiamano ora Zone; nella pagina Viaggio accanto al guidatore compare la sua zona.'],
 ['5.9','Aggiunto "Orario normale (8:00–16:30)" tra l\'orario flessibile e altro orario.'],
 ['5.8','Scelta dell\'orario semplificata: orario flessibile (7:30–16:00), altro orario (con inizio e fine) oppure vado da solo.'],
 ['5.7','"Presente" chiede l\'orario: flessibile (7:30–16:00), regolare (8:00–16:30), CFI o straordinario (con inizio e fine), oppure "vado da solo". Le auto si compongono separatamente per ogni orario.'],
 ['5.6','Nella pagina della squadra, accanto a ogni partecipante, compare "unito" quando si è collegato con il codice e ha scelto il suo nome, altrimenti "non ancora".'],
 ['5.5','I viaggi da confermare si aprono nella pagina Conferma, con i tasti Conferma e Modifica. In modifica si trascinano le persone (anche al posto del guidatore), si tolgono con ✕ e si aggiungono nei posti liberi.'],
 ['5.4','Se il prossimo viaggio cade di sabato o domenica, si passa direttamente al lunedì.'],
 ['5.3','Pagina Viaggio: il prossimo viaggio sempre aperto in cima, poi i viaggi da confermare (compressi, con l\'avviso "Modifica e conferma") e gli ultimi 3 viaggi registrati, che si aprono toccandoli. Nei viaggi da confermare basta toccare un nome per toglierlo o farlo guidare.'],
 ['5.2','"Conferma" è una scheda in basso, dopo Punti, con il numero dei viaggi in attesa. Solo chi ha partecipato a un viaggio può confermarlo, modificarlo o eliminarlo.'],
 ['5.1','Nuova pagina "Viaggi da confermare": alle 8:00 il prossimo viaggio passa lì e nella pagina principale compare l\'avviso. Si possono togliere persone, cambiare guidatore, registrare o eliminare il viaggio. Tolto il tasto "Conferma e registra" dalla pagina principale.'],
 ['4.9','Ognuno può confermare o annullare solo la propria presenza. Entrando in una squadra si cerca il proprio nome in elenco; se non c\'è, va contattato l\'amministratore.'],
 ['4.8','Tolta la domanda "Sarai guidatore?": "Presente" conferma subito. Il guidatore viene scelto tra i presenti partendo da chi ha meno punti.'],
 ['4.7','La tabella dell\'auto resta sempre visibile e si riempie man mano che arrivano i presenti. Assenti e Nessuna conferma: solo i nomi, tutti in grigio chiaro.'],
 ['4.6','Pagina principale più semplice: sotto i tasti Presente/Assente c\'è solo la tabella dell\'auto (vuota finché nessuno conferma), il tasto per registrare e due liste minimal, Assenti e Nessuna conferma. La composizione suggerita non si modifica.'],
 ['4.5','La composizione suggerita delle auto per il prossimo viaggio è nella pagina principale: per ogni auto prima il guidatore, poi i passeggeri. Si può confermare e registrare oppure modificare. Assenti e senza risposta in una tabella sotto. Eliminata la pagina Prenota.'],
 ['4.4','Nuova prenotazione: "Presente" chiede "Sarai guidatore?" (sì, no, non so); toccandolo di nuovo si annulla. Le auto nella pagina Prenota si compongono da sole: guida prima chi ha detto sì, poi chi ha detto non so, partendo da chi ha meno punti. Toccando un nome nell\'elenco si risponde per un collega.'],
 ['4.3','Pagina principale: un unico elenco con nome, punteggio e stato (presente, assente, nessuna risposta), ordinato per stato e poi dal punteggio più basso. "Presente" chiede se si vuole prenotare il posto. Tolti il riquadro "Prossimo a guidare" e il tasto "Non ci sono" nella pagina Prenota.'],
 ['4.2','Nella pagina principale c\'è anche l\'elenco dei presenti al prossimo viaggio, con auto, ruolo e punteggio.'],
 ['4.1','Negli elenchi "Non hanno risposto" e "Assenti" compare il punteggio accanto a ogni nome; chi è in negativo è evidenziato in rosso.'],
 ['4.0','Pagina principale: due tasti "Presente al prossimo viaggio" (porta alla scelta del posto) e "Assente al prossimo viaggio", e gli elenchi di chi non ha risposto e degli assenti. L\'assenza vale sempre solo per il prossimo viaggio.'],
 ['3.9','Nella pagina Prenota due colonne affiancate ben visibili: chi non ha ancora risposto e chi è assente, con il conteggio. Toccando un nome si prenota al suo posto.'],
 ['3.8','Assenze più lunghe: "Non ci sono" permette di indicare una data fino alla quale si è assenti oppure una o più date. Se non si sceglie nulla, l\'assenza vale solo per il prossimo viaggio. Le assenze future si possono annullare tutte insieme.'],
 ['3.7','Nelle prenotazioni si può dichiarare la propria assenza con "Non ci sono": l\'eventuale posto si libera e il nome compare tra gli assenti. Sotto la tabella si vede anche chi non ha ancora risposto.'],
 ['3.6','Prenotazioni a tabella: ogni auto ha il posto del guidatore e i posti passeggero, si sceglie il posto toccandolo. La tabella vale fino alle 8:00 del giorno del viaggio, poi si azzera. Il guidatore può cambiare i posti disponibili; quando le auto sono piene se ne apre una nuova. Posto consigliato in base a punti e gruppi.'],
 ['3.5','Prenotazioni con ruolo (Guido, Passeggero, Entrambi) e zone facoltative. Suggerimenti: a chi tocca guidare, posti mancanti, zone senza guidatore. Auto proposte automaticamente, da registrare con un tocco.'],
 ['3.4','Classifica a barre: linea centrale, punti negativi a sinistra e positivi a destra, con posizione, nome e gruppo. Anche nell\'immagine da condividere.'],
 ['3.2','Password amministratore: chi ha creato la squadra può riavere i permessi da qualsiasi dispositivo.'],
 ['3.1','Pagina Squadre riorganizzata: elenco delle squadre con il numero di iscritti, partecipanti e codice di condivisione. Gruppi in una pagina dedicata, modificabili da tutti, con la possibilità di stare in più gruppi.'],
 ['3.0','Nuova organizzazione: scheda Squadra con componenti e gruppi, pagina Prenotazioni, menu con Condividi, Dati e backup, Suggerimenti e Info. Solo chi crea la squadra aggiunge o espelle componenti. Chi entra sceglie il suo nome o si aggiunge. Prenotazioni per oggi fino alle 8:00.'],
 ['2.7','Condividi l\'app con link, QR code, WhatsApp e Telegram, anche con invito diretto alla squadra.'],
 ['2.5','Prenotazioni per oggi e domani con gruppo di preferenza e note.'],
 ['2.4','Punti di partenza liberi, anche se la somma non è zero.'],
 ['2.3','Più squadre: elenco, cambio rapido e nuova squadra vuota.'],
 ['2.2','Versione web installabile su iPhone e Android, funziona anche senza rete.'],
 ['2.1','Nuovo nome: CollegAuto.'],
 ['2.0','Registro delle modifiche e punti di partenza protetti.'],
 ['1.8','Eliminare una persona non cambia più i punti degli altri.'],
 ['1.6','Condivisione in tempo reale tra colleghi.'],
 ['1.4','Inserimento guidato di un viaggio.'],
 ['1.0','Prima versione: punti a somma zero per ogni auto.']];
$('app-ver').textContent='v'+APP_VERSION;   // intestazione sempre allineata alla versione
function renderInfo(){
  $('info-ver').textContent=` versione ${APP_VERSION}`;$('app-ver').textContent='v'+APP_VERSION;
  try{$('info-notes').innerHTML=NOTES.map(([v,t])=>`<div class="note"><b>v${v}</b><span>${esc(t)}</span></div>`).join('')}catch(e){}
  let rows;
  try{
    const det=typeof syncDetail==='string'&&syncDetail?' · '+syncDetail:'';
    rows=[['Squadra',sync.code?teamLabel(curTeam()):'nessuna (dati solo su questo dispositivo)'],['Il tuo nome',sync.me||'—'],
      ['Sincronizzazione',({off:'non attiva',wait:'connessione…',ok:'attiva',pending:'in attesa di rete',bad:'errore'}[syncState]||syncState)+det],
      ['Componenti',String(active().length)],['Viaggi registrati',String(state.trips.filter(t=>!t.hist&&!t.pend).length)],
      ['Installata come app',(matchMedia('(display-mode: standalone)').matches||navigator.standalone)?'sì':'no']];
  }catch(e){rows=[['Errore nella pagina',String(e&&e.message||e)]]}
  rows.push(['File caricati',Object.keys(window.__V||{}).map(k=>k.replace('app-','')+' '+__V[k]).join(' · ')+((window.__bad&&__bad.length)?' · DIVERSI: '+__bad.join(', '):'')+(sessionStorage.getItem('ca-heal')?' · ripristino fatto':'')]);
  rows.push(['Errori del codice',(window.__errs&&__errs.length)?__errs.slice(-3).join(' | '):'nessuno']);
  $('info-state').innerHTML=rows.map(([k,v])=>`<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
}

// ===================== Permessi da creatore: verificati dal server (regole Firestore) =====================
// La password non viene mai salvata nei dati condivisi: se ne ricava una chiave lenta (PBKDF2) che solo le regole Firestore sanno confrontare.
async function adminKey(pw){
  if(!(window.crypto&&crypto.subtle))throw 'Questo browser non supporta la protezione con password.';
  const enc=new TextEncoder(),km=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode('collegauto-admin|'+sync.code),iterations:200000},km,256);
  return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function becomeAdmin(how){adminOk=true;sync.creator=true;const t=curTeam();if(t)t.creator=true;saveSync();
  addEvents([['team',`${sync.me||'Un partecipante'} ${how}`]]);persist();render();renderSync();snack('Ora hai i permessi da creatore')}
const adminReady=m=>{if(!sync.code||!fsdb||!firebase.auth().currentUser){m('Squadra non collegata.');return false}
  if(!navigator.onLine||syncState!=='ok'){m('Serve la connessione: aspetta il pallino verde e riprova.');return false}
  if(remoteMeta===undefined||remoteZone===undefined){m('Aspetta che i dati siano sincronizzati e riprova.');return false}return true};
// migrazione una tantum: un'unica scrittura atomica crea admin, chiave, zone e stato protetto (toglie anche il vecchio adminHash pubblico)
async function protectTeam(k){
  const u=firebase.auth().currentUser,by=sync.me||'',at=firebase.firestore.FieldValue.serverTimestamp(),b=fsdb.batch();
  b.set(gref().collection('admins').doc(u.uid),{k,by,at});
  b.set(gref().collection('meta').doc('protetta'),{k,adminUid:u.uid,by,at});
  b.set(gref().collection('meta').doc('zone'),{...clean(zoneOf()),by,at});
  b.set(gref().collection('meta').doc('stato'),{...clean(metaOf()),prot:true,by,at});
  try{await b.commit()}catch(e){throw e&&e.code==='permission-denied'?'La squadra risulta già protetta da qualcun altro.':'Protezione non riuscita: controlla la connessione e riprova.'}
  sync.metaDirty=false;sync.zoneDirty=false;lastMeta=JSON.stringify(metaOf());lastZone=JSON.stringify(zoneOf());
  const t=curTeam();if(t)t.prot=true;delete state.adminHash;saveSync()}
$('admin-claim-toggle').onclick=()=>{$('admin-claim-form').hidden=!$('admin-claim-form').hidden;if(!$('admin-claim-form').hidden)$('admin-pw').focus()};
$('admin-claim-go').onclick=async()=>{if(adminBusy)return;const pw=$('admin-pw').value,m=t=>{$('admin-msg').textContent=t};
  if(!adminReady(m))return;
  const u=firebase.auth().currentUser;adminBusy=true;m('Verifico…');
  try{
    if(teamProt()){
      if(!pw){m('Scrivi la password.');return}
      const k=await adminKey(pw);
      try{await gref().collection('admins').doc(u.uid).set({k,by:sync.me||'',at:firebase.firestore.FieldValue.serverTimestamp()})}
      catch(e){m(e&&e.code==='permission-denied'?'Password non corretta.':'Verifica non riuscita: controlla la connessione e riprova.');return}
      $('admin-pw').value='';m('');becomeAdmin('ha recuperato i permessi da creatore con la password');
    }else{
      if(!sync.creator)return;
      if(pw.length<PW_MIN){m(`Scegli una password di almeno ${PW_MIN} caratteri.`);return}
      await protectTeam(await adminKey(pw));
      $('admin-pw').value='';m('');becomeAdmin('ha protetto la squadra con la password amministratore');
    }
  }catch(e){m(typeof e==='string'?e:'Operazione non riuscita: riprova.')}
  finally{adminBusy=false}};
$('admin-pw').onkeydown=e=>{if(e.key==='Enter')$('admin-claim-go').click()};
$('admin-pw-save').onclick=async()=>{if(adminBusy)return;const pw=$('admin-pw-new').value,m=t=>{$('admin-set-msg').textContent=t};
  if(!sync.creator||!sync.code||!teamProt())return;if(pw.length<PW_MIN){m(`Almeno ${PW_MIN} caratteri.`);return}
  if(!adminReady(m))return;adminBusy=true;m('Salvo…');
  try{const k=await adminKey(pw);
    await gref().collection('meta').doc('protetta').update({k,by:sync.me||'',at:firebase.firestore.FieldValue.serverTimestamp()});
    $('admin-pw-new').value='';addEvents([['team','Password amministratore aggiornata']]);persist();render();m('Password salvata.')}
  catch(e){m(typeof e==='string'?e:e&&e.code==='permission-denied'?'Non hai i permessi per cambiare la password.':'Salvataggio non riuscito: riprova.')}
  finally{adminBusy=false}};
