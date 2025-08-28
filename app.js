// Academia NH Access App
// Local-first PWA with Student/Admin modes, class scheduling, and TTS.
// Storage: localStorage (simple, enough for MVP).

const $ = (sel, parent=document)=>parent.querySelector(sel);
const $$ = (sel, parent=document)=>Array.from(parent.querySelectorAll(sel));

const state = {
  activeMode: 'alumno',
  studentPin: '',
  adminPinEntry: '',
  autoClearTimer: null,
  selectedMonth: null,
  selectedDays: new Set(),
  voices: [],
  ttsVoiceName: null
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
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt = null;
    }
  };
});

// ---------- Utilities ----------
function todayISO(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}
function ymISO(date){
  // returns YYYY-MM for given Date or string
  const d = (date instanceof Date) ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
}
function monthRange(ym){
  const [y,m] = ym.split('-').map(Number);
  const start = new Date(y, m-1, 1);
  const end = new Date(y, m, 0); // last day
  return {start, end};
}
function dateToISO(d){
  const dd = new Date(d);
  dd.setHours(0,0,0,0);
  return dd.toISOString().slice(0,10);
}
function fmtDate(d){
  const date = new Date(d);
  return date.toLocaleDateString('es-MX', {weekday:'short', day:'2-digit', month:'short'});
}
function clamp(n, min, max){return Math.max(min, Math.min(max, n));}
function sleep(ms){return new Promise(res=>setTimeout(res,ms));}

// ---------- Storage (localStorage) ----------
const DB = {
  getStudents(){
    try { return JSON.parse(localStorage.getItem('students')||'{}'); } catch{ return {}; }
  },
  setStudents(obj){
    localStorage.setItem('students', JSON.stringify(obj));
  },
  upsertStudent(stu){
    const students = DB.getStudents();
    students[stu.pin] = stu;
    DB.setStudents(students);
  },
  deleteStudent(pin){
    const students = DB.getStudents();
    delete students[pin];
    DB.setStudents(students);
  },
  getSettings(){
    try { return JSON.parse(localStorage.getItem('settings')||'{}'); } catch{ return {}; }
  },
  setSettings(s){ localStorage.setItem('settings', JSON.stringify(s)); },
  getAdminPin(){ return localStorage.getItem('adminPin') || '1234'; },
  setAdminPin(pin){ localStorage.setItem('adminPin', pin); }
};

function ensureDefaults(){
  const s = DB.getSettings();
  if (!s.lang) s.lang = 'es-MX';
  DB.setSettings(s);
  if (!localStorage.getItem('adminPin')) DB.setAdminPin('1234');
}

// ---------- Sweep: expire past scheduled days that weren't used ----------
function sweepExpired(){
  const students = DB.getStudents();
  const today = todayISO();
  let changed = false;
  for (const pin of Object.keys(students)){
    const stu = students[pin];
    stu.history = stu.history || [];
    stu.schedules = stu.schedules || {}; // { 'YYYY-MM': { dates:[{date, used:boolean}], createdAt } }
    // remove/mark past unused days
    for (const ym of Object.keys(stu.schedules)){
      const items = stu.schedules[ym].dates || [];
      for (const it of items){
        if (it.date < today && !it.used && !it.expired){
          it.expired = true;
          stu.history.unshift({ts: Date.now(), type:'expiró', date: it.date, note:'No asistió en su día'});
          changed = true;
        }
      }
    }
    students[pin] = stu;
  }
  if (changed) DB.setStudents(students);
}

// ---------- Remaining classes (today or future, not used) ----------
function remainingClasses(stu){
  const t = todayISO();
  let n = 0;
  if (!stu.schedules) return 0;
  for (const ym of Object.keys(stu.schedules)){
    for (const it of (stu.schedules[ym].dates||[])){
      if (it.date >= t && !it.used) n++;
    }
  }
  return n;
}

// ---------- Monthly end (for notification calc): end of selected month(s) ----------
function monthEndForStudent(stu){
  // Return the last day (YYYY-MM-DD) of the most recent active schedule month (>= today)
  const t = todayISO();
  if (!stu.schedules) return null;
  const months = Object.keys(stu.schedules).sort().reverse();
  for (const ym of months){
    const {end} = monthRange(ym);
    const endIso = dateToISO(end);
    // If month is current or in future
    const mmStart = dateToISO(monthRange(ym).start);
    if (endIso >= t || (mmStart <= t && endIso >= t)) return endIso;
  }
  return null;
}

// ---------- Voice (Web Speech API) ----------
function loadVoices(){
  let list = speechSynthesis.getVoices();
  if (!list.length){
    // Chrome asynchronously loads voices
    window.speechSynthesis.onvoiceschanged = () => {
      state.voices = speechSynthesis.getVoices();
      populateVoiceSelect();
    };
  }
  state.voices = list;
  populateVoiceSelect();
}
function chooseSpanishVoice(){
  if (!state.voices || !state.voices.length) return null;
  // Prefer es-MX, then any es-* female-ish
  const esmx = state.voices.find(v=>/es-MX/i.test(v.lang));
  if (esmx) return esmx;
  const es = state.voices.find(v=>/^es[-_]/i.test(v.lang));
  if (es) return es;
  return state.voices[0];
}
function speak(text){
  try{
    if ('speechSynthesis' in window){
      const u = new SpeechSynthesisUtterance(text);
      let voice = null;
      const s = DB.getSettings();
      if (s.voiceName){
        voice = state.voices.find(v=>v.name === s.voiceName) || chooseSpanishVoice();
      }else{
        voice = chooseSpanishVoice();
      }
      if (voice) u.voice = voice;
      u.lang = (voice && voice.lang) || 'es-MX';
      u.rate = 0.95;
      u.pitch = 1;
      window.speechSynthesis.cancel(); // cancel any pending
      window.speechSynthesis.speak(u);
      return true;
    }
  }catch(e){}
  // Fallback beep
  $('#beep').currentTime = 0;
  $('#beep').play();
  return false;
}
function populateVoiceSelect(){
  const sel = $('#ajVoz');
  if (!sel) return;
  sel.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = ''; opt0.textContent = 'Automática (Español)';
  sel.appendChild(opt0);
  for (const v of state.voices){
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  }
  const s = DB.getSettings();
  sel.value = s.voiceName || '';
}

// ---------- Mode Switching ----------
function setMode(mode){
  state.activeMode = mode;
  $('#alumno').classList.toggle('hidden', mode!=='alumno');
  $('#admin').classList.toggle('hidden', mode!=='admin');
  $$('.mode-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
}
$$('.mode-btn').forEach(btn => {
  btn.addEventListener('click', ()=> setMode(btn.dataset.mode));
});

// ---------- PIN Keypads ----------
function attachKeypad(el){
  el.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button'); if (!btn) return;
    const target = el.dataset.target; // 'student' | 'admin'
    let entry = target==='student' ? state.studentPin : state.adminPinEntry;
    if (btn.textContent === '←'){
      entry = entry.slice(0,-1);
    } else if (btn.textContent === '⟲'){
      entry = '';
    } else {
      if (entry.length < 4) entry += btn.textContent;
    }
    if (target==='student'){ state.studentPin = entry; updateDots($('#studentPinDisplay'), entry.length); }
    else { state.adminPinEntry = entry; updateDots($('#adminPinDisplay'), entry.length); }
  });
}
function updateDots(container, len){
  const spans = $$('.pin-display span', container.parentElement);
  spans.forEach((s,i)=>{ s.textContent = (i < len) ? '●' : '•'; });
}
attachKeypad($('.keypad[data-target="student"]'));
attachKeypad($('.keypad[data-target="admin"]'));

// ---------- Student Enter ----------
$('#studentEnter').addEventListener('click', async ()=>{
  const pin = state.studentPin;
  if (pin.length !== 4){ speak('Ingrese 4 dígitos'); return; }
  const students = DB.getStudents();
  const stu = students[pin];
  const resDiv = $('#alumnoResult');
  const nombreEl = $('#alumnoNombre');
  const clasesEl = $('#alumnoClases');
  const fotoEl = $('#alumnoFoto');
  const mensajeEl = $('#alumnoMensaje');

  // default reset
  resDiv.classList.remove('hidden');
  fotoEl.src = '';
  nombreEl.textContent = 'Alumno';
  clasesEl.textContent = 'Clases disponibles: —';
  mensajeEl.textContent = '';

  if (!stu){
    speak('Acceso denegado');
    mensajeEl.textContent = 'Acceso denegado: PIN no encontrado.';
    autoClearAlumno();
    return;
  }

  sweepExpired();

  // Check if today is scheduled and not used
  const today = todayISO();
  let scheduled = null;
  if (stu.schedules){
    for (const ym of Object.keys(stu.schedules)){
      for (const it of (stu.schedules[ym].dates||[])){
        if (it.date === today && !it.used){
          scheduled = it; break;
        }
      }
      if (scheduled) break;
    }
  }

  if (scheduled){
    // Grant access
    scheduled.used = true;
    stu.history = stu.history || [];
    stu.history.unshift({ts: Date.now(), type:'entrada', date: today, note:'Acceso otorgado'});
    students[pin] = stu;
    DB.setStudents(students);
    speak('Acceso otorgado');
    nombreEl.textContent = stu.name || 'Alumno';
    clasesEl.textContent = `Clases disponibles: ${remainingClasses(stu)}`;
    if (stu.photoDataUrl) fotoEl.src = stu.photoDataUrl;
    mensajeEl.textContent = 'Bienvenido(a). ¡Disfruta tu clase!';
  }else{
    // Deny
    speak('Acceso denegado');
    nombreEl.textContent = stu.name || 'Alumno';
    clasesEl.textContent = `Clases disponibles: ${remainingClasses(stu)}`;
    if (stu.photoDataUrl) fotoEl.src = stu.photoDataUrl;
    mensajeEl.textContent = 'No tienes clase programada para hoy o ya se registró.';
  }

  autoClearAlumno();
});
function autoClearAlumno(){
  clearTimeout(state.autoClearTimer);
  state.autoClearTimer = setTimeout(()=>{
    state.studentPin = '';
    updateDots($('#studentPinDisplay'), 0);
    $('#alumnoResult').classList.add('hidden');
  }, 8000);
}

// ---------- Admin Enter ----------
$('#adminEnter').addEventListener('click', ()=>{
  const pin = state.adminPinEntry;
  const real = DB.getAdminPin();
  if (pin === real){
    $('#adminPanel').classList.remove('hidden');
    // populate selects
    populateAlumnoSelect();
    refreshTabla();
    state.adminPinEntry = '';
    updateDots($('#adminPinDisplay'), 0);
  }else{
    speak('Código incorrecto');
  }
});

// ---------- Admin Tabs ----------
$$('.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.tabs button').forEach(b=>b.classList.toggle('active', b===btn));
    $$('.tab').forEach(t=>t.classList.remove('active'));
    $('#'+btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab==='tab-listado'){ refreshTabla(); }
    if (btn.dataset.tab==='tab-agendar'){ renderCalendar(); }
    if (btn.dataset.tab==='tab-ajustes'){ $('#ajPinAdmin').value = DB.getAdminPin(); populateVoiceSelect(); }
  });
});

// ---------- Registrar/Editar ----------
$('#formAlumno').addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const name = $('#alNombre').value.trim();
  let pin = $('#alPin').value.trim();
  if (!/^\d{4}$/.test(pin)){ alert('El PIN debe tener 4 dígitos.'); return; }
  const students = DB.getStudents();
  const existOther = students[pin] && (!$('#alNombre').dataset.editing || $('#alNombre').dataset.editing !== pin);
  if (existOther){ alert('Ese PIN ya está en uso.'); return; }

  const stu = students[$('#alNombre').dataset.editing || pin] || {schedules:{}, history:[]};
  stu.name = name;
  stu.pin = pin;

  const file = $('#alFoto').files[0];
  if (file){
    const dataUrl = await fileToDataUrl(file);
    stu.photoDataUrl = dataUrl;
  }
  // If PIN changed (editing existing), move record
  if ($('#alNombre').dataset.editing && $('#alNombre').dataset.editing !== pin){
    delete students[$('#alNombre').dataset.editing];
  }
  students[pin] = stu;
  DB.setStudents(students);

  $('#alNombre').dataset.editing = pin;
  alert('Alumno guardado.');
  populateAlumnoSelect();
  refreshTabla();
});
$('#btnEliminarAlumno').addEventListener('click', ()=>{
  const editing = $('#alNombre').dataset.editing;
  if (!editing){ alert('Primero selecciona o crea un alumno.'); return; }
  if (confirm('¿Eliminar este alumno?')){
    DB.deleteStudent(editing);
    $('#alNombre').value=''; $('#alPin').value=''; $('#alFoto').value='';
    $('#alNombre').dataset.editing='';
    populateAlumnoSelect();
    refreshTabla();
  }
});
async function fileToDataUrl(file){
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=> res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ---------- Agendar Clases ----------
function populateAlumnoSelect(){
  const sel = $('#agAlumno');
  sel.innerHTML = '';
  const students = DB.getStudents();
  const pins = Object.keys(students).sort((a,b)=>students[a].name.localeCompare(students[b].name));
  for (const pin of pins){
    const o = document.createElement('option');
    o.value = pin;
    o.textContent = students[pin].name + ' — ' + pin;
    sel.appendChild(o);
  }
  // Also plug into registro form for quick edit
  if (pins.length){
    // Load first student into form for quick editing
    const stu = students[pins[0]];
    $('#alNombre').value = stu.name || '';
    $('#alNombre').dataset.editing = stu.pin;
    $('#alPin').value = stu.pin;
  }
  // Default month = current month
  const nowYM = ymISO(new Date());
  $('#agMes').value = nowYM;
  renderCalendar();
}

$('#agMes').addEventListener('change', renderCalendar);
$('#agPaquete').addEventListener('change', ()=> renderCalendar());

function renderCalendar(){
  const calendar = $('#calendar');
  calendar.innerHTML = '';
  const ym = $('#agMes').value || ymISO(new Date());
  state.selectedMonth = ym;
  const {start, end} = monthRange(ym);

  // DOW headers
  const dows = ['L','M','M','J','V','S','D'];
  for (const d of dows){
    const cell = document.createElement('div');
    cell.className = 'dow';
    cell.textContent = d;
    calendar.appendChild(cell);
  }
  // leading blanks
  const firstDow = (start.getDay() + 6)%7; // convert to Monday=0
  for (let i=0; i<firstDow; i++){
    const blank = document.createElement('div');
    blank.className = 'day';
    calendar.appendChild(blank);
  }

  // Load existing selections for selected student+month
  const pin = $('#agAlumno').value;
  const students = DB.getStudents();
  const stu = students[pin];
  const pkgMax = clamp(parseInt($('#agPaquete').value,10)||12, 1, 12);
  state.selectedDays = new Set();
  if (stu && stu.schedules && stu.schedules[ym] && Array.isArray(stu.schedules[ym].dates)){
    stu.schedules[ym].dates.forEach(it=>state.selectedDays.add(it.date));
  }

  const today = todayISO();
  const loopDate = new Date(start);
  while(loopDate <= end){
    const iso = dateToISO(loopDate);
    const cell = document.createElement('div');
    cell.className = 'day';

    const isPast = iso < today;
    cell.textContent = loopDate.getDate();
    if (!isPast) cell.classList.add('selectable');
    if (iso === today) cell.classList.add('today');
    if (state.selectedDays.has(iso)) cell.classList.add('selected');
    if (isPast) cell.classList.add('past');

    cell.addEventListener('click', ()=>{
      if (iso < today) return;
      if (state.selectedDays.has(iso)){
        state.selectedDays.delete(iso);
        cell.classList.remove('selected');
      } else {
        if (state.selectedDays.size >= pkgMax){ speak('Límite alcanzado'); return; }
        state.selectedDays.add(iso);
        cell.classList.add('selected');
      }
    });

    calendar.appendChild(cell);
    loopDate.setDate(loopDate.getDate()+1);
  }

  $('#btnMesAnterior').onclick = ()=>{
    const [y,m] = ym.split('-').map(Number);
    const prev = new Date(y, m-2, 1);
    $('#agMes').value = ymISO(prev);
    renderCalendar();
  };
  $('#btnMesSiguiente').onclick = ()=>{
    const [y,m] = ym.split('-').map(Number);
    const next = new Date(y, m, 1);
    $('#agMes').value = ymISO(next);
    renderCalendar();
  };
}

$('#btnGuardarCalendario').addEventListener('click', ()=>{
  const pin = $('#agAlumno').value;
  if (!pin){ alert('Selecciona un alumno.'); return; }
  const students = DB.getStudents();
  const stu = students[pin] || {schedules:{}, history:[]};
  const ym = state.selectedMonth || ymISO(new Date());
  const dates = Array.from(state.selectedDays).sort();
  if (!dates.length){ alert('Selecciona al menos un día.'); return; }
  stu.schedules = stu.schedules || {};
  stu.schedules[ym] = {dates: dates.map(d=>({date:d, used:false})), createdAt: Date.now()};
  students[pin] = stu;
  DB.setStudents(students);
  alert('Calendario guardado.');
  refreshTabla();
});

// ---------- Listado & Historial ----------
function refreshTabla(){
  sweepExpired();
  const tbody = $('#tablaAlumnos tbody');
  tbody.innerHTML = '';
  const students = DB.getStudents();
  const pins = Object.keys(students).sort((a,b)=>students[a].name.localeCompare(students[b].name));
  for (const pin of pins){
    const stu = students[pin];
    const tr = document.createElement('tr');
    const rem = remainingClasses(stu);
    const venc = monthEndForStudent(stu) || '—';
    tr.innerHTML = `<td>${stu.name||''}</td><td>${pin}</td><td>${rem}</td><td>${venc}</td><td><button data-pin="${pin}" class="mini">Perfil</button></td>`;
    tbody.appendChild(tr);
  }
  // Attach profile buttons
  $$('#tablaAlumnos .mini').forEach(b=>b.addEventListener('click', ()=>showPerfil(b.dataset.pin)));
  // Global expiring soon banner
  showExpiringBanner();
}

function showPerfil(pin){
  const container = $('#historial');
  container.innerHTML = '';
  const students = DB.getStudents();
  const stu = students[pin];
  if (!stu){ container.textContent = 'Alumno no encontrado.'; return; }
  const rem = remainingClasses(stu);
  const venc = monthEndForStudent(stu) || '—';
  const hdr = document.createElement('div');
  hdr.innerHTML = `<h4>${stu.name} — ${pin}</h4>
    <p>Clases restantes: ${rem} • Vence: ${venc}</p>
    <div class="actions">
      <button id="btnReagendar">Re-agendar siguiente mes</button>
      <button id="btnCargarEnFormulario">Editar en pestaña Registro</button>
    </div>`;
  container.appendChild(hdr);

  const hist = document.createElement('div');
  const items = (stu.history||[]).slice(0,200);
  hist.innerHTML = '<h4>Historial</h4>' + items.map(h=>{
    const when = new Date(h.ts||Date.now()).toLocaleString('es-MX');
    return `<div>• ${when} — ${h.type} — ${h.date || ''} ${h.note?('— '+h.note):''}</div>`;
  }).join('');
  container.appendChild(hist);

  $('#btnReagendar').onclick = ()=>{
    // Jump to Agendar with next month preselected and same paquete size if exists
    $$('.tabs button').forEach(b=>b.classList.remove('active'));
    $('[data-tab="tab-agendar"]').classList.add('active');
    $$('.tab').forEach(t=>t.classList.remove('active'));
    $('#tab-agendar').classList.add('active');
    $('#agAlumno').value = pin;
    // next month
    const nowYM = ymISO(new Date());
    const [y,m]= nowYM.split('-').map(Number);
    const next = ymISO(new Date(y, m, 1));
    $('#agMes').value = next;
    renderCalendar();
  };
  $('#btnCargarEnFormulario').onclick = ()=>{
    $$('.tabs button').forEach(b=>b.classList.remove('active'));
    $('[data-tab="tab-registro"]').classList.add('active');
    $$('.tab').forEach(t=>t.classList.remove('active'));
    $('#tab-registro').classList.add('active');
    $('#alNombre').value = stu.name || '';
    $('#alNombre').dataset.editing = stu.pin;
    $('#alPin').value = stu.pin;
  };
}

// ---------- Expiring soon banner (admin) ----------
function showExpiringBanner(){
  const students = DB.getStudents();
  const t = todayISO();
  const tomorrow = dateToISO(new Date(Date.now()+24*3600*1000));
  const expiring = [];
  for (const pin of Object.keys(students)){
    const stu = students[pin];
    const end = monthEndForStudent(stu);
    if (end && end === tomorrow){
      expiring.push(stu.name || pin);
    }
  }
  if (expiring.length){
    speak('Tienes mensualidades que terminan mañana');
    alert('Aviso: Terminación mañana → ' + expiring.join(', '));
    // Try Notification API
    try {
      if (Notification.permission==='granted'){
        new Notification('Aviso mensualidad', {body: 'Terminan mañana: ' + expiring.join(', ')});
      }
    } catch(e){}
  }
}

// ---------- Ajustes ----------
$('#ajPinAdmin').addEventListener('change', (e)=>{
  const v = e.target.value.trim();
  if (/^\d{4}$/.test(v)) { DB.setAdminPin(v); speak('PIN actualizado'); }
  else alert('PIN inválido');
});
$('#btnProbarVoz').addEventListener('click', ()=>{
  const sel = $('#ajVoz');
  const s = DB.getSettings();
  s.voiceName = sel.value || '';
  DB.setSettings(s);
  speak('Esta es una prueba de voz en español.');
});
$('#btnPermitirNotifs').addEventListener('click', async ()=>{
  try{
    if ('Notification' in window){
      const perm = await Notification.requestPermission();
      alert('Permiso de notificaciones: ' + perm);
    }else{
      alert('Las notificaciones no son compatibles en este dispositivo.');
    }
  }catch(e){ alert('No fue posible solicitar permiso.'); }
});
$('#btnBackup').addEventListener('click', ()=>{
  const data = {
    students: DB.getStudents(),
    settings: DB.getSettings(),
    adminPin: DB.getAdminPin()
  };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'backup_academia.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
});
$('#inputRestore').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try{
    const data = JSON.parse(text);
    if (data.students) localStorage.setItem('students', JSON.stringify(data.students));
    if (data.settings) localStorage.setItem('settings', JSON.stringify(data.settings));
    if (data.adminPin) localStorage.setItem('adminPin', data.adminPin);
    alert('Datos restaurados.');
    populateAlumnoSelect();
    refreshTabla();
  }catch(err){
    alert('Archivo inválido.');
  }
});

// ---------- TTS & init ----------
function init(){
  ensureDefaults();
  loadVoices();
  sweepExpired();
  setMode('alumno');
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js');
  }
}
window.addEventListener('load', init);

// ---------- Install events for iOS PWA (limited) ----------
// Nothing special; manifest + icons + "Add to Home Screen" via Safari.