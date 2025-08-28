
// Academia NH — Accesos v9
const $=(s,p=document)=>p.querySelector(s), $$=(s,p=document)=>Array.from(p.querySelectorAll(s));
const state={activeMode:'alumno',studentPin:'',adminPinEntry:'',selectedMonth:null,selectedDays:new Set(),currentProfilePin:null,voicesReady:false,voiceList:[]};

// Utils
function todayISO(){const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10);}
function ymISO(date){const d=(date instanceof Date)?date:new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function monthRange(ym){const [y,m]=ym.split('-').map(Number); return {start:new Date(y,m-1,1), end:new Date(y,m,0)};}
function dateToISO(d){const dd=new Date(d); dd.setHours(0,0,0,0); return dd.toISOString().slice(0,10);}
function banner(msg, ms=4000){ const el=$('#banner'); el.textContent=msg; el.classList.remove('hidden'); setTimeout(()=>el.classList.add('hidden'), ms); }

// Speech
const VOICE_PREF_KEY='voiceNamePref';
function loadVoices(){try{state.voiceList=speechSynthesis.getVoices()||[];state.voicesReady=state.voiceList.length>0;}catch{state.voicesReady=false}}
function pickPreferredVoice(){const pref=localStorage.getItem(VOICE_PREF_KEY)||'';const L=state.voiceList.length?state.voiceList:(speechSynthesis.getVoices()||[]);
 if(pref){const v=L.find(x=>x.name===pref); if(v) return v;}
 let v=L.find(v=>/^es[-_]/i.test(v.lang)&&/m[oó]nica/i.test(v.name)); if(v) return v;
 v=L.find(v=>/^es[-_]/i.test(v.lang)); return v||L[0]||null;}
function speak(t){try{if('speechSynthesis'in window){if(!state.voicesReady)loadVoices();const u=new SpeechSynthesisUtterance(t);const v=pickPreferredVoice();if(v){u.voice=v;u.lang=v.lang}else u.lang='es-MX'; try{speechSynthesis.resume();}catch{} try{speechSynthesis.cancel();}catch{} speechSynthesis.speak(u); return;}}catch{} const b=$('#beep'); if(b){b.currentTime=0;b.play();}}
if('speechSynthesis'in window){speechSynthesis.onvoiceschanged=()=>{state.voicesReady=false;loadVoices();};}

// Storage
const DB={getStudents(){try{return JSON.parse(localStorage.getItem('students')||'{}')}catch{return{}}},setStudents(o){localStorage.setItem('students',JSON.stringify(o))},
deleteStudent(pin){const s=DB.getStudents();delete s[pin];DB.setStudents(s)},getSettings(){try{return JSON.parse(localStorage.getItem('settings')||'{}')}catch{return{}}},
setSettings(s){localStorage.setItem('settings',JSON.stringify(s))},getAdminPin(){return localStorage.getItem('adminPin')||'1234'},setAdminPin(p){localStorage.setItem('adminPin',p)}};
function ensureDefaults(){const s=DB.getSettings(); if(!s.prices){s.prices={}; for(let i=1;i<=12;i++) s.prices[i]=0;} if(s.voiceName===undefined) s.voiceName=''; DB.setSettings(s); if(!localStorage.getItem('adminPin')) DB.setAdminPin('1234'); }

// Expiraciones & helpers
function sweepExpired(){const students=DB.getStudents(); const today=todayISO(); let changed=false;
  for(const pin of Object.keys(students)){const stu=students[pin]; stu.history=stu.history||[]; stu.schedules=stu.schedules||{};
    for(const ym of Object.keys(stu.schedules)){for(const it of (stu.schedules[ym].dates||[])){if(it.date<today&&!it.used&&!it.expired){it.expired=true; stu.history.unshift({id:crypto.randomUUID(), ts:Date.now(), type:'expiró', date:it.date, note:'No asistió'}); changed=true;}}}
    students[pin]=stu;
  }
  if(changed) DB.setStudents(students);
}
function remainingClasses(stu){const t=todayISO(); let n=0; if(!stu.schedules)return 0; for(const ym of Object.keys(stu.schedules)){for(const it of (stu.schedules[ym].dates||[])){if(it.date>=t&&!it.used) n++;}} return n;}
function monthEndForStudent(stu){const t=todayISO(); if(!stu.schedules)return null; const months=Object.keys(stu.schedules).sort().reverse(); for(const ym of months){const {end}=monthRange(ym); const endIso=dateToISO(end); const startIso=dateToISO(monthRange(ym).start); if(endIso>=t||(startIso<=t&&endIso>=t)) return endIso;} return null;}

// Modes & keypads
function setMode(m){state.activeMode=m; $('#alumno').classList.toggle('hidden',m!=='alumno'); $('#admin').classList.toggle('hidden',m!=='admin'); $$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));}
$$('.mode-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
function attachKeypad(el){el.addEventListener('click',ev=>{const btn=ev.target.closest('button'); if(!btn) return; const tgt=el.dataset.target; let entry=tgt==='student'?state.studentPin:state.adminPinEntry; if(btn.textContent==='←') entry=entry.slice(0,-1); else if(btn.textContent==='⟲') entry=''; else if(entry.length<4) entry+=btn.textContent; if(tgt==='student'){state.studentPin=entry; updateDots('#studentPinDisplay',entry.length)} else {state.adminPinEntry=entry; updateDots('#adminPinDisplay',entry.length)}});}
function updateDots(sel,len){$$(sel+' span').forEach((s,i)=>s.textContent=(i<len)?'●':'•');}
attachKeypad($('.keypad[data-target="student"]')); attachKeypad($('.keypad[data-target="admin"]'));

// Student enter
$('#studentEnter').addEventListener('click',()=>{
  const pin=state.studentPin; if(pin.length!==4){ speak('Ingrese 4 dígitos'); return; }
  const students=DB.getStudents(); const stu=students[pin];
  const resDiv=$('#alumnoResult'), nombreEl=$('#alumnoNombre'), clasesEl=$('#alumnoClases'), fotoEl=$('#alumnoFoto'), msgEl=$('#alumnoMensaje');
  resDiv.classList.remove('hidden'); fotoEl.src=''; nombreEl.textContent='Alumno'; clasesEl.textContent='Clases disponibles: —'; msgEl.textContent='';
  if(!stu){ speak('Acceso denegado'); msgEl.textContent='Acceso denegado: PIN no encontrado.'; return setTimeout(()=>{state.studentPin=''; updateDots('#studentPinDisplay',0); resDiv.classList.add('hidden');},8000); }
  sweepExpired();
  const today=todayISO(); let scheduled=null, ymHit=null;
  if(stu.schedules){ for(const ym of Object.keys(stu.schedules)){ for(const it of (stu.schedules[ym].dates||[])){ if(it.date===today && !it.used){ scheduled=it; ymHit=ym; break; } } if(scheduled) break; } }
  if(scheduled){
    scheduled.used=true; stu.history=stu.history||[]; stu.history.unshift({id:crypto.randomUUID(), ts:Date.now(), type:'entrada', date:today, note:'Acceso otorgado'});
    students[pin]=stu; DB.setStudents(students);
    speak('Acceso otorgado'); nombreEl.textContent=stu.name||'Alumno';
    const rem=remainingClasses(stu); clasesEl.textContent=`Clases disponibles: ${rem}`; if(stu.photoDataUrl) fotoEl.src=stu.photoDataUrl; msgEl.textContent='Bienvenido(a). ¡Disfruta tu clase!';
    if(rem===1){ speak('Te queda una clase'); banner(`⚠️ ${stu.name||'Alumno'}: queda 1 clase.`); }
  } else {
    speak('Acceso denegado'); nombreEl.textContent=stu.name||'Alumno'; clasesEl.textContent=`Clases disponibles: ${remainingClasses(stu)}`; if(stu.photoDataUrl) fotoEl.src=stu.photoDataUrl; msgEl.textContent='No tienes clase programada para hoy o ya se registró.';
  }
  setTimeout(()=>{ state.studentPin=''; updateDots('#studentPinDisplay',0); resDiv.classList.add('hidden'); },8000);
});

// Admin enter
$('#adminEnter').addEventListener('click', ()=>{
  if (state.adminPinEntry === DB.getAdminPin()){
    $('#adminPanel').classList.remove('hidden');
    populateAlumnoSelect(); refreshTabla(); populatePricesUI(); populatePagosUI(); populateVoicesUI();
    state.adminPinEntry=''; updateDots('#adminPinDisplay',0);
  } else { speak('Código incorrecto'); }
});

// Tabs
$$('.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.tabs button').forEach(b=>b.classList.toggle('active', b===btn));
    $$('.tab').forEach(t=>t.classList.remove('active'));
    $('#'+btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab==='tab-listado'){ refreshTabla(); hideDock(); }
    if (btn.dataset.tab==='tab-agendar'){ renderCalendar(); }
    if (btn.dataset.tab==='tab-ajustes'){ $('#ajPinAdmin').value=DB.getAdminPin(); populatePricesUI(); populateVoicesUI(); }
    if (btn.dataset.tab==='tab-pagos'){ populatePagosUI(); }
  });
});

// Registrar/Editar
function resetAlumnoForm(){
  $('#alNombre').value=''; $('#alPin').value=''; $('#alTelefono').value=''; $('#alNacimiento').value=''; $('#alFoto').value='';
  $('#alNombre').dataset.editing='';
}
$('#btnNuevoAlumno').addEventListener('click', resetAlumnoForm);

$('#formAlumno').addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const name=$('#alNombre').value.trim();
  let pin=$('#alPin').value.trim();
  const tel=$('#alTelefono').value.trim();
  const nac=$('#alNacimiento').value||'';
  if (!/^\d{4}$/.test(pin)){ alert('El PIN debe tener 4 dígitos.'); return; }
  const students=DB.getStudents(); const editing=$('#alNombre').dataset.editing || '';
  if (students[pin] && editing !== pin){ alert('Ese PIN ya está en uso. Usa otro.'); return; }
  const stu=students[editing||pin] || {schedules:{}, history:[], payments:{}};
  stu.name=name; stu.pin=pin; stu.phone=tel; stu.birth=nac;
  const file=$('#alFoto').files[0];
  if (file){
    const dataUrl=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
    stu.photoDataUrl=dataUrl;
  }
  if (editing && editing!==pin) delete students[editing];
  students[pin]=stu; DB.setStudents(students);
  alert('Alumno guardado.');
  resetAlumnoForm();
  populateAlumnoSelect(); refreshTabla(); populatePagosUI();
});

$('#btnEditarAlumno').addEventListener('click', ()=>{
  const students=DB.getStudents();
  const pin=prompt('PIN a editar:');
  if (!pin) return;
  const stu=students[pin];
  if (!stu){ alert('No encontrado'); return; }
  $('#alNombre').value=stu.name||'';
  $('#alNombre').dataset.editing=stu.pin;
  $('#alPin').value=stu.pin;
  $('#alTelefono').value=stu.phone||'';
  $('#alNacimiento').value=stu.birth||'';
});

$('#btnEliminarAlumno').addEventListener('click', ()=>{
  const key=$('#alNombre').dataset.editing || $('#alPin').value.trim();
  if (!key){ alert('Selecciona o crea un alumno'); return; }
  const students=DB.getStudents();
  if (!students[key]){ alert('No encontrado'); return; }
  if (confirm('¿Eliminar este alumno y todo su historial/pagos/agendas?')){
    DB.deleteStudent(key);
    resetAlumnoForm();
    if (state.currentProfilePin===key) hideDock();
    populateAlumnoSelect(); refreshTabla(); populatePagosUI();
  }
});

// Agendar
function populateAlumnoSelect(){
  const sel=$('#agAlumno'); const selPg=$('#pgAlumno'); sel.innerHTML=''; selPg.innerHTML='';
  const students=DB.getStudents();
  const pins=Object.keys(students).sort((a,b)=> (students[a].name||'').localeCompare(students[b].name||''));
  for (const pin of pins){
    const o=document.createElement('option'); o.value=pin; o.textContent=`${students[pin].name||''} — ${pin}`;
    sel.appendChild(o); selPg.appendChild(o.cloneNode(true));
  }
  const nowYM=ymISO(new Date()); $('#agMes').value=nowYM; $('#pgMes').value=nowYM;
  renderCalendar();
}
$('#agMes').addEventListener('change', renderCalendar);
function renderCalendar(){
  const calendar=$('#calendar'); if(!calendar) return; calendar.innerHTML='';
  const ym=$('#agMes').value || ymISO(new Date()); const {start,end}=monthRange(ym);
  const dows=['L','M','M','J','V','S','D']; for (const d of dows){ const c=document.createElement('div'); c.className='dow'; c.textContent=d; calendar.appendChild(c); }
  const firstDow=(start.getDay()+6)%7; for(let i=0;i<firstDow;i++){ const b=document.createElement('div'); b.className='day'; calendar.appendChild(b); }
  const pin=$('#agAlumno').value; const students=DB.getStudents(); const stu=students[pin];
  const qtyMax=parseInt($('#agCantidad').value,10)||12;
  const selected=new Set(); if (stu && stu.schedules && stu.schedules[ym]) (stu.schedules[ym].dates||[]).forEach(it=>selected.add(it.date));
  const today=todayISO(); const loop=new Date(start);
  while(loop<=end){
    const iso=dateToISO(loop); const c=document.createElement('div'); c.className='day';
    const isPast=iso<today; c.textContent=loop.getDate();
    if (!isPast) c.classList.add('selectable'); if (iso===today) c.classList.add('today');
    if (selected.has(iso)) c.classList.add('selected'); if (isPast) c.classList.add('past');
    c.addEventListener('click',()=>{ if (iso<today) return; if (selected.has(iso)){ selected.delete(iso); c.classList.remove('selected'); } else { if (selected.size>=qtyMax){ speak('Límite alcanzado'); return; } selected.add(iso); c.classList.add('selected'); } });
    calendar.appendChild(c); loop.setDate(loop.getDate()+1);
  }
  renderCalendar.selected=selected; renderCalendar.ym=ym;
}
$('#btnMesAnterior').onclick=()=>{ const [y,m]=$('#agMes').value.split('-').map(Number); $('#agMes').value=ymISO(new Date(y,m-2,1)); renderCalendar(); };
$('#btnMesSiguiente').onclick=()=>{ const [y,m]=$('#agMes').value.split('-').map(Number); $('#agMes').value=ymISO(new Date(y,m,1)); renderCalendar(); };
$('#btnGuardarCalendario').addEventListener('click', ()=>{
  const pin=$('#agAlumno').value; if (!pin){ alert('Selecciona un alumno'); return; }
  const students=DB.getStudents(); const stu=students[pin]||{schedules:{}, history:[], payments:{}};
  const ym=renderCalendar.ym||ymISO(new Date());
  const dates=Array.from(renderCalendar.selected||[]).sort(); if (!dates.length){ alert('Selecciona al menos un día'); return; }
  const qty=parseInt($('#agCantidad').value,10)||dates.length; const price=parseFloat($('#agPrecio').value||'0');
  stu.schedules=stu.schedules||{}; stu.schedules[ym]={dates:dates.map(d=>({date:d,used:false})), createdAt:Date.now(), qty, price};
  stu.history=stu.history||[]; stu.history.unshift({id:crypto.randomUUID(), ts:Date.now(), type:'agendado', date:ym, note:`${qty} clases, $${price}`});
  students[pin]=stu; DB.setStudents(students);
  alert('Calendario guardado.'); refreshTabla(); populatePagosUI();
});

// Dock & Listado
function refreshTabla(){
  sweepExpired();
  const tbody=$('#tablaAlumnos tbody'); if(!tbody) return; tbody.innerHTML='';
  const students=DB.getStudents();
  const pins=Object.keys(students).sort((a,b)=> (students[a].name||'').localeCompare(students[b].name||''));
  for (const pin of pins){
    const stu=students[pin]; const rem=remainingClasses(stu); const venc=monthEndForStudent(stu)||'—';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${stu.name||''}</td>
                  <td>${pin}</td>
                  <td>${rem}</td>
                  <td>${venc}</td>
                  <td>
                    <div class="btns">
                      <button class="btn-mini act-perfil" data-pin="${pin}">Perfil</button>
                      <button class="btn-mini act-editar" data-pin="${pin}">Editar</button>
                      <button class="btn-mini danger act-eliminar" data-pin="${pin}">Eliminar</button>
                    </div>
                  </td>`;
    tbody.appendChild(tr);
  }
  // Eventos
  $$('.act-perfil', tbody).forEach(b=>b.addEventListener('click', ()=>showDock(b.dataset.pin)));
  $$('.act-editar', tbody).forEach(b=>b.addEventListener('click', ()=>editarDesdeLista(b.dataset.pin)));
  $$('.act-eliminar', tbody).forEach(b=>b.addEventListener('click', ()=>eliminarDesdeLista(b.dataset.pin)));
}
function editarDesdeLista(pin){
  const students=DB.getStudents(); const stu=students[pin]; if(!stu){ alert('No encontrado'); return; }
  // Cambiar a pestaña Registrar/Editar
  $$('.tabs button').forEach(b=>b.classList.remove('active')); $('[data-tab="tab-registro"]').classList.add('active');
  $$('.tab').forEach(t=>t.classList.remove('active')); $('#tab-registro').classList.add('active');
  // Precargar form
  $('#alNombre').value=stu.name||'';
  $('#alNombre').dataset.editing=stu.pin;
  $('#alPin').value=stu.pin;
  $('#alTelefono').value=stu.phone||'';
  $('#alNacimiento').value=stu.birth||'';
}
function eliminarDesdeLista(pin){
  const students=DB.getStudents(); const stu=students[pin]; if(!stu){ alert('No encontrado'); return; }
  if (confirm(`¿Eliminar a ${stu.name||'este alumno'} (${pin}) y todo su historial/pagos/agendas?`)){
    DB.deleteStudent(pin);
    if (state.currentProfilePin===pin) hideDock();
    refreshTabla(); populateAlumnoSelect(); populatePagosUI();
  }
}

function hideDock(){ const dock=$('#perfilDock'); dock.classList.add('hidden'); $('#dockBody').innerHTML=''; state.currentProfilePin=null; }
$('#dockClose').addEventListener('click', hideDock);

function prefillReagendar(pin){
  $$('.tabs button').forEach(b=>b.classList.remove('active')); $('[data-tab="tab-agendar"]').classList.add('active');
  $$('.tab').forEach(t=>t.classList.remove('active')); $('#tab-agendar').classList.add('active');
  $('#agAlumno').value = pin;
  const d=new Date(); $('#agMes').value = ymISO(new Date(d.getFullYear(), d.getMonth()+1, 1));
  renderCalendar();
}
function showDock(pin){
  const dock=$('#perfilDock'), body=$('#dockBody'), title=$('#dockTitle');
  const students=DB.getStudents(); const stu=students[pin]; if (!stu){ return; }
  state.currentProfilePin=pin;
  dock.classList.remove('hidden');
  title.textContent = `Perfil — ${stu.name||''} (${pin})`;
  const rem=remainingClasses(stu); const venc=monthEndForStudent(stu)||'—';
  let html = `<div class="perfil"><img src="${stu.photoDataUrl||'assets/icon-192.png'}" alt="Foto" style="width:56px;height:56px;border-radius:10px;margin-right:8px;object-fit:cover;border:1px solid #34346d;"><div><h4 style="margin:0">${stu.name||''}</h4><div>Tel: ${stu.phone||'—'} • Nac: ${stu.birth||'—'}</div><div>Clases restantes: ${rem} • Vence: ${venc}</div></div></div>`;
  if (rem===1){ html += `<div class="actions"><button id="btnReagendarDock" class="primary">Re‑agendar mes siguiente</button></div>`; }
  html += `<h4>Historial</h4>`;
  (stu.history||[]).forEach(h=>{
    const when=new Date(h.ts||Date.now()).toLocaleString('es-MX');
    html += `<div class="hist-item"><span class="tag">${h.type}</span><span>${when}</span><span>${h.date||''}</span><span>${h.note||''}</span></div>`;
  });
  body.innerHTML = html;
  const btnR=$('#btnReagendarDock'); if (btnR) btnR.addEventListener('click', ()=>prefillReagendar(pin));
}

// Precios/voz/pagos (mínimos para conservar funcionalidades previas)
function populatePricesUI(){ const grid=$('#ajPrecios'); if(!grid) return; const s=DB.getSettings(); grid.innerHTML=''; for(let i=1;i<=12;i++){ const w=document.createElement('div'); w.innerHTML=`<label>${i===1?'Clase suelta (1)':i+' clases'}<input type="number" step="1" min="0" data-qty="${i}" value="${s.prices?.[i]??0}"></label>`; grid.appendChild(w); } }
$('#btnGuardarPrecios')?.addEventListener('click', ()=>{ const s=DB.getSettings(); s.prices=s.prices||{}; $$('#ajPrecios input[type="number"]').forEach(inp=>{ const q=parseInt(inp.dataset.qty,10); s.prices[q]=parseFloat(inp.value||'0'); }); DB.setSettings(s); alert('Precios guardados.'); });
function populateVoicesUI(){ const sel=$('#ajVoz'); if(!sel) return; sel.innerHTML=''; const list=speechSynthesis.getVoices()||[]; const o=document.createElement('option'); o.value=''; o.textContent='Automática (Mónica/ES)'; sel.appendChild(o); list.forEach(v=>{ const op=document.createElement('option'); op.value=v.name; op.textContent=`${v.name} (${v.lang})`; sel.appendChild(op); }); const pref=localStorage.getItem(VOICE_PREF_KEY)||''; sel.value=pref; }
$('#ajVoz')?.addEventListener('change', e=>{ const name=e.target.value||''; localStorage.setItem(VOICE_PREF_KEY,name); const s=DB.getSettings(); s.voiceName=name; DB.setSettings(s); speak('Voz guardada'); });

function populatePagosUI(){
  const students=DB.getStudents(); const sel=$('#pgAlumno'); if(!sel) return; sel.innerHTML='';
  const pins=Object.keys(students).sort((a,b)=> (students[a].name||'').localeCompare(students[b].name||''));
  for (const pin of pins){ const o=document.createElement('option'); o.value=pin; o.textContent=`${students[pin].name||''} — ${pin}`; sel.appendChild(o); }
  $('#pgMes').value=ymISO(new Date()); renderPagos(sel.value, $('#pgMes').value);
}
$('#pgAlumno')?.addEventListener('change', ()=> renderPagos($('#pgAlumno').value, $('#pgMes').value));
$('#pgMes')?.addEventListener('change', ()=> renderPagos($('#pgAlumno').value, $('#pgMes').value));
function renderPagos(pin, ym){
  const box=$('#pgResumen'); if(!box) return; box.innerHTML='';
  const students=DB.getStudents(); const stu=students[pin]; if (!stu){ box.textContent='Selecciona un alumno'; return; }
  stu.payments=stu.payments||{}; const sched=stu.schedules?.[ym];
  const qty=sched?.qty||0; const price=sched?.price||0; const pagos=stu.payments[ym]||[];
  const total=pagos.reduce((a,b)=>a+(b.amount||0),0); const bal=(price||0)-total;
  const lines=[`<div class="line"><strong>${stu.name||''}</strong><span>Mes ${ym}</span></div>`,`<div class="line"><span>Clases: ${qty}</span><span>Precio: $${price}</span></div>`,`<div class="line"><span>Pagado:</span><span>$${total}</span></div>`,`<div class="line"><span>Saldo:</span><span class="${bal>0?'balance-neg':'balance-pos'}">$${bal}</span></div>`,`<div class="line"><strong>Pagos</strong><span># ${pagos.length}</span></div>`];
  box.innerHTML=lines.join('');
  pagos.forEach(p=>{ const row=document.createElement('div'); row.className='line'; const when=new Date(p.ts||Date.now()).toLocaleString('es-MX'); row.innerHTML=`<span>${when}</span><span>$${p.amount||0} ${p.note?('— '+p.note):''}</span>`; box.appendChild(row); });
  $('#pgRegistrar').onclick=()=>{ const amt=parseFloat($('#pgMonto').value||'0'); if (!amt){ alert('Monto inválido'); return; } const note=prompt('Nota (opcional):',''); const st=DB.getStudents(); const su=st[pin]; su.payments=su.payments||{}; su.payments[ym]=su.payments[ym]||[]; su.payments[ym].push({ts:Date.now(), amount:amt, note:note||''}); st[pin]=su; DB.setStudents(st); $('#pgMonto').value=''; renderPagos(pin,ym); };
  $('#pgEliminarMes').onclick=()=>{ if (confirm('¿Eliminar TODOS los pagos de este mes?')){ const st=DB.getStudents(); const su=st[pin]; if (su.payments && su.payments[ym]) delete su.payments[ym]; st[pin]=su; DB.setStudents(st); renderPagos(pin,ym); } };
}

// Init
document.addEventListener('DOMContentLoaded',()=>{
  ensureDefaults(); setMode('alumno'); if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  if('speechSynthesis' in window){ loadVoices(); setTimeout(loadVoices,400); }
});

function setMode(mode){
  state.activeMode=mode;
  $('#alumno').classList.toggle('hidden', mode!=='alumno');
  $('#admin').classList.toggle('hidden', mode!=='admin');
  $$('.mode-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
}

// Keypad attachers (redeclared for init scope)
function attachKeypad(el){
  el.addEventListener('click', (ev)=>{
    const btn=ev.target.closest('button'); if (!btn) return;
    const target=el.dataset.target;
    let entry=target==='student'?state.studentPin:state.adminPinEntry;
    if (btn.textContent==='←') entry = entry.slice(0,-1);
    else if (btn.textContent==='⟲') entry = '';
    else if (entry.length<4) entry += btn.textContent;
    if (target==='student'){ state.studentPin=entry; updateDots('#studentPinDisplay', entry.length); }
    else { state.adminPinEntry=entry; updateDots('#adminPinDisplay', entry.length); }
  });
}
attachKeypad(document.querySelector('.keypad[data-target="student"]'));
attachKeypad(document.querySelector('.keypad[data-target="admin"]'));

function updateDots(sel, len){ $$(sel+' span').forEach((s,i)=> s.textContent=(i<len)?'●':'•'); }
