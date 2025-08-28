
// Academia NH Access App — v3
// + Aviso cuando queda 1 clase
// + Exportar historial mensual (ventana imprimible -> Guardar como PDF)
// + Visor de pagos por mes (registrar pagos, totales y saldos)

const $ = (sel, parent=document)=>parent.querySelector(sel);
const $$ = (sel, parent=document)=>Array.from(parent.querySelectorAll(sel));

const state = {
  activeMode: 'alumno',
  studentPin: '',
  adminPinEntry: '',
  autoClearTimer: null,
  selectedMonth: null,
  selectedDays: new Set(),
  voices: []
};

// ---------- PWA Install ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $('#installBtn');
  btn.hidden = false;
  btn.onclick = async () => {
    btn.hidden = true;
    if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
  };
});

// ---------- Utils ----------
function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
function ymISO(date){ const d=(date instanceof Date)?date:new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function monthRange(ym){ const [y,m]=ym.split('-').map(Number); return {start:new Date(y,m-1,1), end:new Date(y,m,0)}; }
function dateToISO(d){ const dd=new Date(d); dd.setHours(0,0,0,0); return dd.toISOString().slice(0,10); }
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function speak(text){
  try{
    if ('speechSynthesis' in window){
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      const esmx = voices.find(v=>/es-MX/i.test(v.lang));
      u.voice = esmx || voices.find(v=>/^es[-_]/i.test(v.lang)) || voices[0];
      u.lang = (u.voice && u.voice.lang) || 'es-MX';
      u.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      return;
    }
  }catch(e){}
  const beep = $('#beep'); if (beep){ beep.currentTime=0; beep.play(); }
}
function banner(msg, ms=4000){
  const el = $('#banner');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(()=> el.classList.add('hidden'), ms);
}

// ---------- Storage ----------
const DB = {
  getStudents(){ try{return JSON.parse(localStorage.getItem('students')||'{}')}catch{ return {}; } },
  setStudents(o){ localStorage.setItem('students', JSON.stringify(o)); },
  deleteStudent(pin){ const s=DB.getStudents(); delete s[pin]; DB.setStudents(s); },
  getSettings(){ try{return JSON.parse(localStorage.getItem('settings')||'{}')}catch{ return {}; } },
  setSettings(s){ localStorage.setItem('settings', JSON.stringify(s)); },
  getAdminPin(){ return localStorage.getItem('adminPin') || '1234'; },
  setAdminPin(pin){ localStorage.setItem('adminPin', pin); }
};
function ensureDefaults(){
  const s = DB.getSettings();
  if (!s.prices){ s.prices={}; for(let i=1;i<=12;i++) s.prices[i]=0; }
  DB.setSettings(s);
  if (!localStorage.getItem('adminPin')) DB.setAdminPin('1234');
}

// ---------- Scheduling helpers ----------
function sweepExpired(){
  const students = DB.getStudents();
  const today = todayISO();
  let changed=false;
  for (const pin of Object.keys(students)){
    const stu = students[pin];
    stu.history = stu.history || [];
    stu.schedules = stu.schedules || {};
    for (const ym of Object.keys(stu.schedules)){
      for (const it of (stu.schedules[ym].dates||[])){
        if (it.date < today && !it.used && !it.expired){
          it.expired = true;
          stu.history.unshift({id: crypto.randomUUID(), ts: Date.now(), type:'expiró', date: it.date, note:'No asistió'});
          changed=true;
        }
      }
    }
    students[pin]=stu;
  }
  if (changed) DB.setStudents(students);
}
function remainingClasses(stu){
  const t=todayISO(); let n=0;
  if (!stu.schedules) return 0;
  for (const ym of Object.keys(stu.schedules)){
    for (const it of (stu.schedules[ym].dates||[])){
      if (it.date >= t && !it.used) n++;
    }
  }
  return n;
}
function monthEndForStudent(stu){
  const t=todayISO();
  if (!stu.schedules) return null;
  const months = Object.keys(stu.schedules).sort().reverse();
  for (const ym of months){
    const {end} = monthRange(ym);
    const endIso = dateToISO(end);
    const startIso = dateToISO(monthRange(ym).start);
    if (endIso >= t || (startIso<=t && endIso>=t)) return endIso;
  }
  return null;
}

// ---------- Student Enter ----------
$('#studentEnter').addEventListener('click', ()=>{
  const pin = state.studentPin;
  if (pin.length!==4){ speak('Ingrese 4 dígitos'); return; }
  const students = DB.getStudents();
  const stu = students[pin];
  const resDiv = $('#alumnoResult');
  const nombreEl = $('#alumnoNombre');
  const clasesEl = $('#alumnoClases');
  const fotoEl = $('#alumnoFoto');
  const mensajeEl = $('#alumnoMensaje');

  resDiv.classList.remove('hidden');
  fotoEl.src=''; nombreEl.textContent='Alumno'; clasesEl.textContent='Clases disponibles: —'; mensajeEl.textContent='';

  if (!stu){
    speak('Acceso denegado');
    mensajeEl.textContent='Acceso denegado: PIN no encontrado.';
    return autoClearAlumno();
  }

  sweepExpired();

  const today = todayISO();
  let scheduled=null, ymHit=null;
  if (stu.schedules){
    for (const ym of Object.keys(stu.schedules)){
      for (const it of (stu.schedules[ym].dates||[])){
        if (it.date===today && !it.used){ scheduled=it; ymHit=ym; break; }
      }
      if (scheduled) break;
    }
  }

  if (scheduled){
    scheduled.used = true;
    stu.history = stu.history || [];
    stu.history.unshift({id: crypto.randomUUID(), ts: Date.now(), type:'entrada', date: today, note:'Acceso otorgado'});
    students[pin]=stu; DB.setStudents(students);
    speak('Acceso otorgado');
    nombreEl.textContent=stu.name||'Alumno';
    const rem = remainingClasses(stu);
    clasesEl.textContent = `Clases disponibles: ${rem}`;
    if (stu.photoDataUrl) fotoEl.src = stu.photoDataUrl;
    mensajeEl.textContent='Bienvenido(a). ¡Disfruta tu clase!';
    // Aviso de 1 clase restante
    if (rem===1){
      speak('Te queda una clase');
      banner(`⚠️ ${stu.name||'Alumno'}: queda 1 clase.`);
      stu.history.unshift({id: crypto.randomUUID(), ts: Date.now(), type:'aviso', date: ymHit, note:'Queda 1 clase'});
      students[pin]=stu; DB.setStudents(students);
    }
  }else{
    speak('Acceso denegado');
    nombreEl.textContent=stu.name||'Alumno';
    clasesEl.textContent = `Clases disponibles: ${remainingClasses(stu)}`;
    if (stu.photoDataUrl) fotoEl.src = stu.photoDataUrl;
    mensajeEl.textContent='No tienes clase programada para hoy o ya se registró.';
  }

  autoClearAlumno();
});
function autoClearAlumno(){
  clearTimeout(state.autoClearTimer);
  state.autoClearTimer = setTimeout(()=>{
    state.studentPin = '';
    const spans = $$('#studentPinDisplay span'); spans.forEach(s=>s.textContent='•');
    $('#alumnoResult').classList.add('hidden');
  }, 8000);
}

// ---------- Keypads and Modes ----------
function setMode(mode){
  state.activeMode=mode;
  $('#alumno').classList.toggle('hidden', mode!=='alumno');
  $('#admin').classList.toggle('hidden', mode!=='admin');
  $$('.mode-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
}
$$('.mode-btn').forEach(btn=> btn.addEventListener('click', ()=> setMode(btn.dataset.mode)));

function attachKeypad(el){
  el.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button'); if (!btn) return;
    const target = el.dataset.target;
    let entry = target==='student'?state.studentPin:state.adminPinEntry;
    if (btn.textContent==='←') entry = entry.slice(0,-1);
    else if (btn.textContent==='⟲') entry = '';
    else if (entry.length<4) entry += btn.textContent;
    if (target==='student'){ state.studentPin=entry; updateDots('#studentPinDisplay', entry.length); }
    else { state.adminPinEntry=entry; updateDots('#adminPinDisplay', entry.length); }
  });
}
function updateDots(sel, len){
  const spans = $$(sel+' span');
  spans.forEach((s,i)=> s.textContent=(i<len)?'●':'•');
}
attachKeypad($('.keypad[data-target="student"]'));
attachKeypad($('.keypad[data-target="admin"]'));

// ---------- Admin Enter ----------
$('#adminEnter').addEventListener('click', ()=>{
  if (state.adminPinEntry === DB.getAdminPin()){
    $('#adminPanel').classList.remove('hidden');
    populateAlumnoSelect(); refreshTabla(); populatePricesUI(); populatePagosUI();
    state.adminPinEntry=''; updateDots('#adminPinDisplay',0);
  } else { speak('Código incorrecto'); }
});

// ---------- Tabs ----------
$$('.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.tabs button').forEach(b=>b.classList.toggle('active', b===btn));
    $$('.tab').forEach(t=>t.classList.remove('active'));
    $('#'+btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab==='tab-listado'){ refreshTabla(); }
    if (btn.dataset.tab==='tab-agendar'){ renderCalendar(); }
    if (btn.dataset.tab==='tab-ajustes'){ $('#ajPinAdmin').value=DB.getAdminPin(); populatePricesUI(); }
    if (btn.dataset.tab==='tab-pagos'){ populatePagosUI(); }
  });
});

// ---------- Registrar/Editar ----------
$('#formAlumno').addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const name = $('#alNombre').value.trim();
  let pin = $('#alPin').value.trim();
  const tel = $('#alTelefono').value.trim();
  const nac = $('#alNacimiento').value || '';

  if (!/^\d{4}$/.test(pin)){ alert('El PIN debe tener 4 dígitos.'); return; }
  const students = DB.getStudents();
  const editing = $('#alNombre').dataset.editing;
  if ((!editing || editing !== pin) && students[pin]){ alert('Ese PIN ya está en uso.'); return; }

  const stu = students[editing||pin] || {schedules:{}, history:[], payments:{}};
  stu.name=name; stu.pin=pin; stu.phone=tel; stu.birth=nac;

  const file = $('#alFoto').files[0];
  if (file){
    const dataUrl = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
    stu.photoDataUrl = dataUrl;
  }
  if (editing && editing!==pin) delete students[editing];
  students[pin]=stu; DB.setStudents(students);
  $('#alNombre').dataset.editing=pin;
  alert('Alumno guardado.');
  populateAlumnoSelect(); refreshTabla(); populatePagosUI();
});
$('#btnEditarAlumno').addEventListener('click', ()=>{
  const students = DB.getStudents();
  const pin = prompt('PIN a editar:');
  if (!pin) return;
  const stu = students[pin];
  if (!stu){ alert('No encontrado'); return; }
  $('#alNombre').value=stu.name||'';
  $('#alNombre').dataset.editing=stu.pin;
  $('#alPin').value=stu.pin;
  $('#alTelefono').value=stu.phone||'';
  $('#alNacimiento').value=stu.birth||'';
});
$('#btnEliminarAlumno').addEventListener('click', ()=>{
  const key = $('#alNombre').dataset.editing || $('#alPin').value.trim();
  if (!key){ alert('Selecciona o crea un alumno'); return; }
  if (confirm('¿Eliminar este alumno?')){
    DB.deleteStudent(key);
    $('#alNombre').value=''; $('#alPin').value=''; $('#alTelefono').value=''; $('#alNacimiento').value=''; $('#alFoto').value='';
    $('#alNombre').dataset.editing='';
    populateAlumnoSelect(); refreshTabla(); populatePagosUI();
  }
});

// ---------- Agendar ----------
function populateAlumnoSelect(){
  const sel = $('#agAlumno');
  sel.innerHTML='';
  const students=DB.getStudents();
  const pins = Object.keys(students).sort((a,b)=> (students[a].name||'').localeCompare(students[b].name||''));
  for (const pin of pins){
    const o=document.createElement('option'); o.value=pin; o.textContent=`${students[pin].name||''} — ${pin}`; sel.appendChild(o);
  }
  const nowYM = ymISO(new Date()); $('#agMes').value=nowYM;
  const s = DB.getSettings();
  const qty = parseInt($('#agCantidad').value,10);
  $('#agPrecio').value = s.prices?.[qty] ?? 0;
  renderCalendar();

  // Also fill payments tab selects
  const selPg = $('#pgAlumno');
  selPg.innerHTML='';
  for (const pin of pins){
    const o=document.createElement('option'); o.value=pin; o.textContent=`${students[pin].name||''} — ${pin}`; selPg.appendChild(o);
  }
  $('#pgMes').value = nowYM;
}
$('#agMes').addEventListener('change', renderCalendar);
$('#agCantidad').addEventListener('change', ()=>{
  const s=DB.getSettings(); const qty=parseInt($('#agCantidad').value,10);
  $('#agPrecio').value=s.prices?.[qty]??0; renderCalendar();
});

function renderCalendar(){
  const calendar=$('#calendar'); calendar.innerHTML='';
  const ym = $('#agMes').value || ymISO(new Date());
  state.selectedMonth=ym;
  const {start,end}=monthRange(ym);
  const dows=['L','M','M','J','V','S','D'];
  for (const d of dows){ const c=document.createElement('div'); c.className='dow'; c.textContent=d; calendar.appendChild(c); }
  const firstDow=(start.getDay()+6)%7;
  for(let i=0;i<firstDow;i++){ const b=document.createElement('div'); b.className='day'; calendar.appendChild(b); }
  const pin=$('#agAlumno').value; const students=DB.getStudents(); const stu=students[pin];
  const qtyMax = clamp(parseInt($('#agCantidad').value,10)||12,1,12);
  state.selectedDays = new Set();
  if (stu && stu.schedules && stu.schedules[ym]){
    (stu.schedules[ym].dates||[]).forEach(it=>state.selectedDays.add(it.date));
  }
  const today=todayISO();
  const loop=new Date(start);
  while(loop<=end){
    const iso=dateToISO(loop);
    const c=document.createElement('div'); c.className='day';
    const isPast = iso<today;
    c.textContent=loop.getDate();
    if (!isPast) c.classList.add('selectable');
    if (iso===today) c.classList.add('today');
    if (state.selectedDays.has(iso)) c.classList.add('selected');
    if (isPast) c.classList.add('past');
    c.addEventListener('click',()=>{
      if (iso<today) return;
      if (state.selectedDays.has(iso)){ state.selectedDays.delete(iso); c.classList.remove('selected'); }
      else { if (state.selectedDays.size>=qtyMax){ speak('Límite alcanzado'); return; } state.selectedDays.add(iso); c.classList.add('selected'); }
    });
    calendar.appendChild(c);
    loop.setDate(loop.getDate()+1);
  }
}
$('#btnMesAnterior').onclick = ()=>{ const [y,m]=$('#agMes').value.split('-').map(Number); $('#agMes').value=ymISO(new Date(y,m-2,1)); renderCalendar(); };
$('#btnMesSiguiente').onclick = ()=>{ const [y,m]=$('#agMes').value.split('-').map(Number); $('#agMes').value=ymISO(new Date(y,m,1)); renderCalendar(); };

$('#btnGuardarCalendario').addEventListener('click', ()=>{
  const pin=$('#agAlumno').value; if (!pin){ alert('Selecciona un alumno'); return; }
  const students=DB.getStudents(); const stu=students[pin]||{schedules:{},history:[],payments:{}};
  const ym=state.selectedMonth||ymISO(new Date());
  const dates=Array.from(state.selectedDays).sort(); if (!dates.length){ alert('Selecciona al menos un día'); return; }
  const qty=parseInt($('#agCantidad').value,10); const price=parseFloat($('#agPrecio').value||'0');
  stu.schedules=stu.schedules||{};
  stu.schedules[ym]={dates:dates.map(d=>({date:d,used:false})), createdAt:Date.now(), qty, price};
  stu.history = stu.history||[];
  stu.history.unshift({id: crypto.randomUUID(), ts: Date.now(), type:'agendado', date: ym, note:`${qty} clases, $${price}`});
  students[pin]=stu; DB.setStudents(students);
  alert('Calendario guardado.'); refreshTabla(); populatePagosUI();
});

// ---------- Listado & Historial + Export ----------
function refreshTabla(){
  sweepExpired();
  const tbody=$('#tablaAlumnos tbody'); tbody.innerHTML='';
  const students=DB.getStudents();
  const pins=Object.keys(students).sort((a,b)=> (students[a].name||'').localeCompare(students[b].name||''));
  for (const pin of pins){
    const stu=students[pin];
    const rem=remainingClasses(stu);
    const venc=monthEndForStudent(stu)||'—';
    const tr=document.createElement('tr');
    const warn = rem===1 ? ' style="color:#ffd166;font-weight:700;"' : '';
    tr.innerHTML=`<td${warn}>${stu.name||''}</td><td>${pin}</td><td${warn}>${rem}</td><td>${venc}</td><td><button class="mini" data-pin="${pin}">Perfil</button></td>`;
    tbody.appendChild(tr);
  }
  $$('#tablaAlumnos .mini').forEach(b=>b.addEventListener('click', ()=>showPerfil(b.dataset.pin)));
}
function showPerfil(pin){
  const container=$('#historial'); container.innerHTML='';
  const students=DB.getStudents(); const stu=students[pin]; if (!stu){ container.textContent='Alumno no encontrado'; return; }
  const rem=remainingClasses(stu); const venc=monthEndForStudent(stu)||'—';
  const hdr=document.createElement('div');
  hdr.innerHTML=`<h4>${stu.name} — ${pin}</h4>
    <p>Tel: ${stu.phone||'—'} • Nac: ${stu.birth||'—'}</p>
    <p>Clases restantes: ${rem} • Vence: ${venc}</p>
    <div class="actions">
      <button id="btnReagendar">Re-agendar siguiente mes</button>
      <button id="btnCargarEnFormulario">Editar en pestaña Registro</button>
      <button id="btnBorrarHistorialTodo" class="danger">Borrar historial</button>
    </div>`;
  container.appendChild(hdr);

  const hist=document.createElement('div'); hist.innerHTML='<h4>Historial</h4>';
  const list=document.createElement('div'); list.id='histList';
  (stu.history||[]).forEach(h=>{
    const row=document.createElement('div'); row.className='hist-item'; row.dataset.id=h.id||'';
    const when=new Date(h.ts||Date.now()).toLocaleString('es-MX');
    row.innerHTML=`<span class="tag">${h.type}</span><span>${when}</span><span>${h.date||''}</span><span>${h.note||''}</span>
      <div class="actions"><button class="mini" data-act="edit">Editar</button><button class="mini danger" data-act="del">Eliminar</button></div>`;
    list.appendChild(row);
  });
  hist.appendChild(list); container.appendChild(hist);

  list.addEventListener('click',(e)=>{
    const btn=e.target.closest('button'); if(!btn) return;
    const item=btn.closest('.hist-item'); const id=item.dataset.id;
    const st=DB.getStudents(); const su=st[pin]; const idx=(su.history||[]).findIndex(x=>x.id===id);
    if (idx<0){ alert('No encontrado'); return; }
    if (btn.dataset.act==='del'){
      if (confirm('¿Eliminar este registro?')){ su.history.splice(idx,1); st[pin]=su; DB.setStudents(st); showPerfil(pin); }
    }else{
      const cur=su.history[idx];
      const t=prompt('Tipo:',cur.type||''); if(t===null) return;
      const d=prompt('Fecha asociada (YYYY-MM o YYYY-MM-DD):',cur.date||''); if(d===null) return;
      const n=prompt('Nota:',cur.note||''); if(n===null) return;
      cur.type=t.trim()||cur.type; cur.date=d.trim()||cur.date; cur.note=n.trim();
      st[pin]=su; DB.setStudents(st); showPerfil(pin);
    }
  });

  $('#btnBorrarHistorialTodo').onclick=()=>{ if (confirm('¿Borrar TODO el historial?')){ stu.history=[]; students[pin]=stu; DB.setStudents(students); showPerfil(pin);} };
  $('#btnReagendar').onclick=()=>{ $$('.tabs button').forEach(b=>b.classList.remove('active')); $('[data-tab="tab-agendar"]').classList.add('active'); $$('.tab').forEach(t=>t.classList.remove('active')); $('#tab-agendar').classList.add('active'); $('#agAlumno').value=pin; const now=ymISO(new Date()); const [y,m]=now.split('-').map(Number); $('#agMes').value=ymISO(new Date(y,m,1)); renderCalendar(); };
  $('#btnCargarEnFormulario').onclick=()=>{ $$('.tabs button').forEach(b=>b.classList.remove('active')); $('[data-tab="tab-registro"]').classList.add('active'); $$('.tab').forEach(t=>t.classList.remove('active')); $('#tab-registro').classList.add('active'); $('#alNombre').value=stu.name||''; $('#alNombre').dataset.editing=stu.pin; $('#alPin').value=stu.pin; $('#alTelefono').value=stu.phone||''; $('#alNacimiento').value=stu.birth||''; };
}

// Exportar historial mensual (HTML imprimible -> PDF)
$('#btnExportarMes').addEventListener('click', ()=>{
  const ym = $('#expMes').value || ymISO(new Date());
  const students = DB.getStudents();
  let html = `<!doctype html><meta charset="utf-8"><title>Historial ${ym}</title>
  <style>
    body{font-family:Arial, sans-serif; padding:20px}
    h1{margin:0 0 10px}
    .al{margin:12px 0; border:1px solid #ddd; border-radius:8px; padding:10px}
    .meta{color:#444; font-size:13px}
    table{width:100%; border-collapse:collapse; margin-top:8px}
    th,td{border:1px solid #ccc; padding:6px; font-size:13px; text-align:left}
  </style>
  <h1>Historial mensual — ${ym}</h1>`;
  const pins = Object.keys(students).sort((a,b)=> (students[a].name||'').localeCompare(students[b].name||''));
  for (const pin of pins){
    const stu = students[pin];
    // filtrar historial y schedule del mes
    const sched = stu.schedules?.[ym];
    const qty = sched?.qty ?? '-';
    const price = sched?.price ?? 0;
    const dates = (sched?.dates||[]).map(d=>`${d.date} ${d.used?'✓':'—'}`);
    const hist = (stu.history||[]).filter(h=> (h.date||'').startsWith(ym) || (h.type==='entrada' && (h.date||'').startsWith(ym)));
    html += `<div class="al"><strong>${stu.name||''} — ${pin}</strong>
      <div class="meta">Cantidad: ${qty} • Precio: $${price}</div>
      <div>Fechas: ${dates.join(', ')||'—'}</div>
      <table><thead><tr><th>Tipo</th><th>Fecha</th><th>Nota</th></tr></thead><tbody>`;
    if (hist.length){
      for (const h of hist){
        html += `<tr><td>${h.type||''}</td><td>${h.date||''}</td><td>${h.note||''}</td></tr>`;
      }
    }else{
      html += `<tr><td colspan="3">Sin movimientos del mes</td></tr>`;
    }
    const paid = (stu.payments?.[ym]||[]).reduce((a,b)=>a+(b.amount||0),0);
    const bal = (price||0) - paid;
    html += `</tbody></table><div class="meta">Pagado: $${paid} • Saldo: $${bal}</div></div>`;
  }
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(()=> w.print(), 300);
});

// ---------- Pagos ----------
function populatePagosUI(){
  const students=DB.getStudents();
  const pin=$('#pgAlumno').value || Object.keys(students)[0] || '';
  const ym = $('#pgMes').value || ymISO(new Date());
  renderPagos(pin, ym);
}
$('#pgAlumno').addEventListener('change', ()=> renderPagos($('#pgAlumno').value, $('#pgMes').value));
$('#pgMes').addEventListener('change', ()=> renderPagos($('#pgAlumno').value, $('#pgMes').value));

function renderPagos(pin, ym){
  const box = $('#pgResumen'); box.innerHTML='';
  const students=DB.getStudents(); const stu=students[pin];
  if (!stu){ box.textContent='Selecciona un alumno'; return; }
  stu.payments = stu.payments || {};
  const sched = stu.schedules?.[ym];
  const qty = sched?.qty || 0;
  const price = sched?.price || 0;
  const pagos = stu.payments[ym] || [];
  const total = pagos.reduce((a,b)=>a+(b.amount||0),0);
  const bal = (price||0) - total;
  const lines = [`<div class="line"><strong>${stu.name||''}</strong><span>Mes ${ym}</span></div>`,`<div class="line"><span>Clases: ${qty}</span><span>Precio: $${price}</span></div>`,`<div class="line"><span>Pagado:</span><span>$${total}</span></div>`,`<div class="line"><span>Saldo:</span><span class="${bal>0?'balance-neg':'balance-pos'}">$${bal}</span></div>`,`<div class="line"><strong>Pagos</strong><span># ${pagos.length}</span></div>`];
  box.innerHTML = lines.join('');
  pagos.forEach(p=>{
    const row=document.createElement('div'); row.className='line';
    const when=new Date(p.ts||Date.now()).toLocaleString('es-MX');
    row.innerHTML=`<span>${when}</span><span>$${p.amount||0} ${p.note?('— '+p.note):''}</span>`;
    box.appendChild(row);
  });

  $('#pgRegistrar').onclick = ()=>{
    const amt = parseFloat($('#pgMonto').value||'0'); if (!amt){ alert('Monto inválido'); return; }
    const note = prompt('Nota (opcional):','');
    const st=DB.getStudents();
    const su=st[pin]; su.payments=su.payments||{}; su.payments[ym]=su.payments[ym]||[];
    su.payments[ym].push({ts: Date.now(), amount: amt, note: note||''});
    st[pin]=su; DB.setStudents(st);
    $('#pgMonto').value='';
    renderPagos(pin, ym);
  };
  $('#pgEliminarMes').onclick = ()=>{
    if (confirm('¿Eliminar TODOS los pagos de este mes?')){
      const st=DB.getStudents(); const su=st[pin]; if (su.payments && su.payments[ym]) delete su.payments[ym]; st[pin]=su; DB.setStudents(st); renderPagos(pin,ym);
    }
  };
}

// ---------- Ajustes ----------
$('#ajPinAdmin').addEventListener('change', (e)=>{
  const v=e.target.value.trim(); if (/^\d{4}$/.test(v)){ DB.setAdminPin(v); speak('PIN actualizado'); } else alert('PIN inválido');
});
function populatePricesUI(){
  const grid=$('#ajPrecios'); const s=DB.getSettings(); grid.innerHTML='';
  for(let i=1;i<=12;i++){ const w=document.createElement('div'); w.innerHTML=`<label>${i===1?'Clase suelta (1)':i+' clases'}<input type="number" step="1" min="0" data-qty="${i}" value="${s.prices?.[i]??0}"></label>`; grid.appendChild(w); }
}
$('#btnGuardarPrecios').addEventListener('click', ()=>{
  const s=DB.getSettings(); s.prices=s.prices||{};
  $$('#ajPrecios input[type="number"]').forEach(inp=>{ const q=parseInt(inp.dataset.qty,10); s.prices[q]=parseFloat(inp.value||'0'); });
  DB.setSettings(s); alert('Precios guardados.');
});
$('#btnProbarVoz').addEventListener('click', ()=> speak('Esta es una prueba de voz en español.'));
$('#btnPermitirNotifs').addEventListener('click', async ()=>{
  try{ if ('Notification' in window){ const perm=await Notification.requestPermission(); alert('Permiso: '+perm); } else alert('No compatible.'); }catch(e){ alert('No fue posible.'); }
});
$('#btnBackup').addEventListener('click', ()=>{
  const data={students:DB.getStudents(), settings:DB.getSettings(), adminPin:DB.getAdminPin()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='backup_academia_v3.json'; document.body.appendChild(a); a.click(); setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },0);
});
$('#inputRestore').addEventListener('change', async (e)=>{
  const file=e.target.files[0]; if(!file) return;
  try{ const text=await file.text(); const data=JSON.parse(text); if(data.students) localStorage.setItem('students',JSON.stringify(data.students)); if(data.settings) localStorage.setItem('settings',JSON.stringify(data.settings)); if(data.adminPin) localStorage.setItem('adminPin',data.adminPin); alert('Datos restaurados.'); populateAlumnoSelect(); refreshTabla(); populatePricesUI(); populatePagosUI(); }catch(err){ alert('Archivo inválido.'); }
});

// ---------- Init ----------
function init(){
  ensureDefaults();
  sweepExpired();
  setMode('alumno');
  if ('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js'); }
  $('#expMes').value = ymISO(new Date());
}
window.addEventListener('load', init);
