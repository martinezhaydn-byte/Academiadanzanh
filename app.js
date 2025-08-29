
// v9.1 — Fix: evitar doble escritura en keypad de admin (guard de listener)
const $=(s,p=document)=>p.querySelector(s), $$=(s,p=document)=>Array.from(p.querySelectorAll(s));
const state={activeMode:'alumno',studentPin:'',adminPinEntry:'',selectedMonth:null,selectedDays:new Set(),currentProfilePin:null,voicesReady:false,voiceList:[]};

function todayISO(){const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10);}
function ymISO(date){const d=(date instanceof Date)?date:new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function monthRange(ym){const [y,m]=ym.split('-').map(Number); return {start:new Date(y,m-1,1), end:new Date(y,m,0)};}
function dateToISO(d){const dd=new Date(d); dd.setHours(0,0,0,0); return dd.toISOString().slice(0,10);}
function banner(msg, ms=4000){ const el=$('#banner'); el.textContent=msg; el.classList.remove('hidden'); setTimeout(()=>el.classList.add('hidden'), ms); }

// Speech (resumido)
const VOICE_PREF_KEY='voiceNamePref';
function loadVoices(){try{state.voiceList=speechSynthesis.getVoices()||[];state.voicesReady=state.voiceList.length>0;}catch{state.voicesReady=false}}
function pickPreferredVoice(){const L=state.voiceList.length?state.voiceList:(speechSynthesis.getVoices()||[]);return L.find(v=>/^es[-_]/i.test(v.lang)&&/m[oó]nica/i.test(v.name))||L.find(v=>/^es[-_]/i.test(v.lang))||L[0]||null;}
function speak(t){try{if('speechSynthesis'in window){if(!state.voicesReady)loadVoices();const u=new SpeechSynthesisUtterance(t);const v=pickPreferredVoice();if(v){u.voice=v;u.lang=v.lang}else u.lang='es-MX'; try{speechSynthesis.resume();}catch{} try{speechSynthesis.cancel();}catch{} speechSynthesis.speak(u); return;}}catch{} const b=$('#beep'); if(b){b.currentTime=0;b.play();}}
if('speechSynthesis'in window){speechSynthesis.onvoiceschanged=()=>{state.voicesReady=false;loadVoices();};}

// Storage
const DB={getStudents(){try{return JSON.parse(localStorage.getItem('students')||'{}')}catch{return{}}},setStudents(o){localStorage.setItem('students',JSON.stringify(o))},
deleteStudent(pin){const s=DB.getStudents();delete s[pin];DB.setStudents(s)},getSettings(){try{return JSON.parse(localStorage.getItem('settings')||'{}')}catch{return{}}},
setSettings(s){localStorage.setItem('settings',JSON.stringify(s))},getAdminPin(){return localStorage.getItem('adminPin')||'1234'},setAdminPin(p){localStorage.setItem('adminPin',p)}};
function ensureDefaults(){const s=DB.getSettings(); if(!s.prices){s.prices={}; for(let i=1;i<=12;i++) s.prices[i]=0;} if(s.voiceName===undefined) s.voiceName=''; DB.setSettings(s); if(!localStorage.getItem('adminPin')) DB.setAdminPin('1234'); }

// Expiraciones
function sweepExpired(){const students=DB.getStudents(); const today=todayISO(); let changed=false;
  for(const pin of Object.keys(students)){const stu=students[pin]; stu.history=stu.history||[]; stu.schedules=stu.schedules||{};
    for(const ym of Object.keys(stu.schedules)){for(const it of (stu.schedules[ym].dates||[])){if(it.date<today&&!it.used&&!it.expired){it.expired=true; stu.history.unshift({id:crypto.randomUUID(), ts:Date.now(), type:'expiró', date:it.date, note:'No asistió'}); changed=true;}}}
    students[pin]=stu;
  }
  if(changed) DB.setStudents(students);
}
function remainingClasses(stu){const t=todayISO(); let n=0; if(!stu.schedules)return 0; for(const ym of Object.keys(stu.schedules)){for(const it of (stu.schedules[ym].dates||[])){if(it.date>=t&&!it.used) n++;}} return n;}
function monthEndForStudent(stu){const t=todayISO(); if(!stu.schedules)return null; const months=Object.keys(stu.schedules).sort().reverse(); for(const ym of months){const {end}=monthRange(ym); const endIso=dateToISO(end); const startIso=dateToISO(monthRange(ym).start); if(endIso>=t||(startIso<=t&&endIso>=t)) return endIso;} return null;}

// Modes
function setMode(m){state.activeMode=m; $('#alumno').classList.toggle('hidden',m!=='alumno'); $('#admin').classList.toggle('hidden',m!=='admin'); $$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));}
$$('.mode-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));

// Keypad — attach ONCE with guard to prevent double typing
function attachKeypadOnce(el){
  if(!el || el.dataset.bound === '1') return;
  el.dataset.bound = '1';
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
function updateDots(sel, len){ $$(sel+' span').forEach((s,i)=> s.textContent=(i<len)?'●':'•'); }

// Student enter (igual lógica)
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

// Admin enter + tabs (resumido)
$('#adminEnter').addEventListener('click', ()=>{
  if (state.adminPinEntry === DB.getAdminPin()){
    $('#adminPanel').classList.remove('hidden');
    populateAlumnoSelect(); refreshTabla(); populatePricesUI(); populatePagosUI(); populateVoicesUI();
    state.adminPinEntry=''; updateDots('#adminPinDisplay',0);
  } else { speak('Código incorrecto'); }
});
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

// Registrar/Editar (resumido)
function resetAlumnoForm(){ $('#alNombre').value=''; $('#alPin').value=''; $('#alTelefono').value=''; $('#alNacimiento').value=''; $('#alFoto').value=''; $('#alNombre').dataset.editing=''; }
$('#btnNuevoAlumno').addEventListener('click', resetAlumnoForm);
$('#formAlumno').addEventListener('submit', async (ev)=>{ ev.preventDefault();
  const name=$('#alNombre').value.trim(); let pin=$('#alPin').value.trim(); const tel=$('#alTelefono').value.trim(); const nac=$('#alNacimiento').value||'';
  if (!/^\d{4}$/.test(pin)){ alert('El PIN debe tener 4 dígitos.'); return; }
  const students=DB.getStudents(); const editing=$('#alNombre').dataset.editing || '';
  if (students[pin] && editing !== pin){ alert('Ese PIN ya está en uso. Usa otro.'); return; }
  const stu=students[editing||pin] || {schedules:{}, history:[], payments:{}};
  stu.name=name; stu.pin=pin; stu.phone=tel; stu.birth=nac;
  const file=$('#alFoto').files[0]; if (file){ const dataUrl=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); stu.photoDataUrl=dataUrl; }
  if (editing && editing!==pin) delete students[editing]; students[pin]=stu; DB.setStudents(students);
  alert('Alumno guardado.'); resetAlumnoForm(); populateAlumnoSelect(); refreshTabla(); populatePagosUI();
});

$('#btnEditarAlumno').addEventListener('click', ()=>{
  const students=DB.getStudents(); const pin=prompt('PIN a editar:'); if (!pin) return; const stu=students[pin]; if (!stu){ alert('No encontrado'); return; }
  $('#alNombre').value=stu.name||''; $('#alNombre').dataset.editing=stu.pin; $('#alPin').value=stu.pin; $('#alTelefono').value=stu.phone||''; $('#alNacimiento').value=stu.birth||'';
});
$('#btnEliminarAlumno').addEventListener('click', ()=>{
  const key=$('#alNombre').dataset.editing || $('#alPin').value.trim(); if (!key){ alert('Selecciona o crea un alumno'); return; }
  const students=DB.getStudents(); if (!students[key]){ alert('No encontrado'); return; }
  if (confirm('¿Eliminar este alumno y todo su historial/pagos/agendas?')){ DB.deleteStudent(key); resetAlumnoForm(); if (state.currentProfilePin===key) hideDock(); populateAlumnoSelect(); refreshTabla(); populatePagosUI(); }
});

// Agendar (muy resumido)
function populateAlumnoSelect(){
  const sel=$('#agAlumno'); const selPg=$('#pgAlumno'); sel.innerHTML=''; selPg.innerHTML=''; const students=DB.getStudents();
  const pins=Object.keys(students).sort((a,b)=> (students[a].name||'').localeCompare(students[b].name||''));
  for (const pin of pins){ const o=document.createElement('option'); o.value=pin; o.textContent=`${students[pin].name||''} — ${pin}`; sel.appendChild(o); selPg.appendChild(o.cloneNode(true)); }
  const now=ymISO(new Date()); $('#agMes').value=now; $('#pgMes').value=now; renderCalendar();
}
function renderCalendar(){
  const cal=$('#calendar'); if(!cal) return; cal.innerHTML=''; const ym=$('#agMes').value||ymISO(new Date()); const {start,end}=monthRange(ym);
  const dows=['L','M','M','J','V','S','D']; dows.forEach(d=>{const c=document.createElement('div'); c.className='dow'; c.textContent=d; cal.appendChild(c);});
  const first=(start.getDay()+6)%7; for(let i=0;i<first;i++){const b=document.createElement('div'); b.className='day'; cal.appendChild(b);}
  const students=DB.getStudents(); const stu=students[$('#agAlumno').value]; const selected=new Set(); if(stu&&stu.schedules&&stu.schedules[ym]) (stu.schedules[ym].dates||[]).forEach(it=>selected.add(it.date));
  const today=todayISO(); const loop=new Date(start); while(loop<=end){ const iso=dateToISO(loop); const c=document.createElement('div'); c.className='day'; const isPast=iso<today; c.textContent=loop.getDate(); if(!isPast) c.classList.add('selectable'); if(iso===today) c.classList.add('today'); if(selected.has(iso)) c.classList.add('selected'); if(isPast) c.classList.add('past'); c.addEventListener('click',()=>{ if(iso<today) return; if(selected.has(iso)){selected.delete(iso); c.classList.remove('selected');} else {selected.add(iso); c.classList.add('selected');} }); cal.appendChild(c); loop.setDate(loop.getDate()+1); }
  renderCalendar.selected=selected; renderCalendar.ym=ym;
}
$('#btnMesAnterior')?.addEventListener('click',()=>{ const [y,m]=$('#agMes').value.split('-').map(Number); $('#agMes').value=ymISO(new Date(y,m-2,1)); renderCalendar(); });
$('#btnMesSiguiente')?.addEventListener('click',()=>{ const [y,m]=$('#agMes').value.split('-').map(Number); $('#agMes').value=ymISO(new Date(y,m,1)); renderCalendar(); });
$('#btnGuardarCalendario')?.addEventListener('click',()=>{
  const pin=$('#agAlumno').value; if(!pin){ alert('Selecciona un alumno'); return; }
  const s=DB.getStudents(); const stu=s[pin]||{schedules:{},history:[],payments:{}}; const ym=renderCalendar.ym||ymISO(new Date());
  const dates=Array.from(renderCalendar.selected||[]).sort(); if(!dates.length){ alert('Selecciona al menos un día'); return; }
  const qty=dates.length; const price=parseFloat($('#agPrecio').value||'0');
  stu.schedules=stu.schedules||{}; stu.schedules[ym]={dates:dates.map(d=>({date:d,used:false})), createdAt:Date.now(), qty, price};
  stu.history=stu.history||[]; stu.history.unshift({id:crypto.randomUUID(), ts:Date.now(), type:'agendado', date:ym, note:`${qty} clases, $${price}`});
  s[pin]=stu; DB.setStudents(s); alert('Calendario guardado.'); refreshTabla();
});

// Listado + Dock (resumido con botones Perfil/Editar/Eliminar)
function refreshTabla(){
  sweepExpired(); const tbody=$('#tablaAlumnos tbody'); if(!tbody) return; tbody.innerHTML=''; const s=DB.getStudents();
  const pins=Object.keys(s).sort((a,b)=>(s[a].name||'').localeCompare(s[b].name||''));
  for(const pin of pins){
    const stu=s[pin]; const rem=remainingClasses(stu); const venc=monthEndForStudent(stu)||'—';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${stu.name||''}</td><td>${pin}</td><td>${rem}</td><td>${venc}</td>
      <td><div class="btns"><button class="btn-mini act-perfil" data-pin="${pin}">Perfil</button>
      <button class="btn-mini act-editar" data-pin="${pin}">Editar</button>
      <button class="btn-mini danger act-eliminar" data-pin="${pin}">Eliminar</button></div></td>`;
    tbody.appendChild(tr);
  }
  $$('.act-perfil',tbody).forEach(b=>b.addEventListener('click',()=>showDock(b.dataset.pin)));
  $$('.act-editar',tbody).forEach(b=>b.addEventListener('click',()=>editarDesdeLista(b.dataset.pin)));
  $$('.act-eliminar',tbody).forEach(b=>b.addEventListener('click',()=>eliminarDesdeLista(b.dataset.pin)));
}
function editarDesdeLista(pin){
  const s=DB.getStudents(); const stu=s[pin]; if(!stu){ alert('No encontrado'); return; }
  $$('.tabs button').forEach(b=>b.classList.remove('active')); $('[data-tab="tab-registro"]').classList.add('active');
  $$('.tab').forEach(t=>t.classList.remove('active')); $('#tab-registro').classList.add('active');
  $('#alNombre').value=stu.name||''; $('#alNombre').dataset.editing=stu.pin; $('#alPin').value=stu.pin; $('#alTelefono').value=stu.phone||''; $('#alNacimiento').value=stu.birth||'';
}
function eliminarDesdeLista(pin){
  const s=DB.getStudents(); const stu=s[pin]; if(!stu){ alert('No encontrado'); return; }
  if(confirm(`¿Eliminar a ${stu.name||'este alumno'} (${pin})?`)){ DB.deleteStudent(pin); if(state.currentProfilePin===pin) hideDock(); refreshTabla(); populateAlumnoSelect(); }
}
function hideDock(){ const dock=$('#perfilDock'); dock.classList.add('hidden'); $('#dockBody').innerHTML=''; state.currentProfilePin=null; }
$('#dockClose')?.addEventListener('click', hideDock);
function showDock(pin){
  const s=DB.getStudents(); const stu=s[pin]; if(!stu) return;
  state.currentProfilePin=pin; const dock=$('#perfilDock'), body=$('#dockBody'), title=$('#dockTitle'); dock.classList.remove('hidden');
  const rem=remainingClasses(stu), venc=monthEndForStudent(stu)||'—';
  title.textContent=`Perfil — ${stu.name||''} (${pin})`;
  body.innerHTML=`<div class="perfil"><img src="${stu.photoDataUrl||'assets/icon-192.png'}" style="width:56px;height:56px;border-radius:10px;margin-right:8px;object-fit:cover;border:1px solid #34346d;"><div><h4 style="margin:0">${stu.name||''}</h4><div>Tel: ${stu.phone||'—'} • Nac: ${stu.birth||'—'}</div><div>Clases restantes: ${rem} • Vence: ${venc}</div></div></div><h4>Historial</h4>`
    + ( (stu.history||[]).map(h=>{const when=new Date(h.ts||Date.now()).toLocaleString('es-MX'); return `<div class="hist-item"><span class="tag">${h.type}</span><span>${when}</span><span>${h.date||''}</span><span>${h.note||''}</span></div>`;}).join('') || '<div class="hist-item">Sin movimientos</div>' );
}

// Init — attach keypads ONCE
document.addEventListener('DOMContentLoaded',()=>{
  ensureDefaults(); setMode('alumno');
  attachKeypadOnce(document.querySelector('.keypad[data-target="student"]'));
  attachKeypadOnce(document.querySelector('.keypad[data-target="admin"]'));
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  if('speechSynthesis' in window){ loadVoices(); setTimeout(loadVoices,400); }
});
