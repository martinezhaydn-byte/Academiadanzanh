
/* Simple local storage helpers */
const DB_KEY = 'academia_db_v1';
const CFG_KEY = 'academia_cfg_v1';
const TODAY = () => new Date().toISOString().slice(0,10);
const YM = (d) => d.slice(0,7); // YYYY-MM

const DEFAULT_CFG = {
  adminPin: '1234',
  voicePref: 'Mónica', // prefer substring
  langPref: 'es',
  lastMaintenance: null
};

function loadDB(){ try{ return JSON.parse(localStorage.getItem(DB_KEY) || '[]'); }catch(e){ return []; } }
function saveDB(data){ localStorage.setItem(DB_KEY, JSON.stringify(data)); }
function loadCfg(){ try{ return Object.assign({}, DEFAULT_CFG, JSON.parse(localStorage.getItem(CFG_KEY)||'{}')); }catch(e){ return {...DEFAULT_CFG}; } }
function saveCfg(cfg){ localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }

/* Voice / TTS (Web Speech API) */
let VOICE = null;
function pickVoice(){
  const cfg = loadCfg();
  const voices = speechSynthesis.getVoices();
  // Prefer es-MX / es-ES and names including Monica/Mónica
  let preferred = voices.find(v => /es/i.test(v.lang) && /monic|m\u00F3nic/i.test(v.name));
  if(!preferred) preferred = voices.find(v => /es-MX/i.test(v.lang));
  if(!preferred) preferred = voices.find(v => /es/i.test(v.lang));
  VOICE = preferred || null;
}
speechSynthesis.onvoiceschanged = pickVoice;
pickVoice();

function speak(text){
  try{
    const u = new SpeechSynthesisUtterance(text);
    if(VOICE) u.voice = VOICE;
    u.lang = (VOICE && VOICE.lang) || 'es-MX';
    u.rate = 1;
    u.pitch = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }catch(e){ console.warn('TTS not available', e); }
}

/* UI Elements */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hide');
  setTimeout(()=> el.classList.add('hide'), 2600);
}

/* Tabs */
const tabAlumno = $('#tab-alumno');
const tabAdmin = $('#tab-admin');
const alumnoPanel = $('#alumno-panel');
const adminLogin = $('#admin-login');
const adminApp = $('#admin-app');

tabAlumno.addEventListener('click', ()=>{
  tabAlumno.classList.add('active');
  tabAdmin.classList.remove('active');
  alumnoPanel.classList.remove('hide');
  adminLogin.classList.add('hide');
  adminApp.classList.add('hide');
});

tabAdmin.addEventListener('click', ()=>{
  tabAdmin.classList.add('active');
  tabAlumno.classList.remove('active');
  alumnoPanel.classList.add('hide');
  if(window._adminUnlocked){
    adminApp.classList.remove('hide');
    adminLogin.classList.add('hide');
  }else{
    adminLogin.classList.remove('hide');
    adminApp.classList.add('hide');
  }
});

/* PWA */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js');
}

/* Notifications helper */
async function maybeNotify(title, body){
  try{
    if(Notification.permission === 'default'){
      await Notification.requestPermission();
    }
    if(Notification.permission === 'granted' && navigator.serviceWorker?.controller){
      navigator.serviceWorker.controller.postMessage({
        type:'notify',
        title,
        options:{ body, icon: './assets/logo.png' }
      });
    } else {
      // Fallback toast
      toast(body);
    }
  }catch(e){ console.warn('notify error', e); }
}

/* Data model helpers */
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2)); }

function ensureMaintenance(){
  const cfg = loadCfg();
  const last = cfg.lastMaintenance;
  const today = TODAY();
  if(last === today) return;

  const db = loadDB();
  // For every student, mark past scheduled days as missed
  db.forEach(st => {
    const ym = new Date().toISOString().slice(0,7); // current month
    const sched = st.schedules?.[ym];
    if(!sched) return;
    Object.keys(sched.dates||{}).forEach(d => {
      if(d < today && sched.dates[d] === 'scheduled'){
        sched.dates[d] = 'missed';
      }
    });

    // Reminder one day before the last scheduled class of this month
    const days = Object.keys(sched.dates||{}).sort();
    if(days.length){
      const lastDay = days[days.length-1];
      const dayBefore = new Date(lastDay);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const ymd = dayBefore.toISOString().slice(0,10);
      if(ymd === today && !sched.reminderShown){
        maybeNotify('Recordatorio de mensualidad', `Mañana termina la mensualidad de ${st.name}.`);
        sched.reminderShown = true;
      }
    }
  });
  saveDB(db);
  cfg.lastMaintenance = today;
  saveCfg(cfg);
}

/* Calendar UI */
const calGrid = $('#cal-grid');
const calCounter = $('#cal-counter');
const regMes = $('#reg-mes');
const regPaquete = $('#reg-paquete');

function buildCalendar(year, month, selectedSet=new Set(), usedMap={}, missedMap={}){
  calGrid.innerHTML='';
  const first = new Date(year, month, 1);
  const startDay = new Date(first);
  startDay.setDate(1 - ((first.getDay()+6)%7)); // Monday-based grid
  for(let i=0;i<42;i++){
    const d = new Date(startDay);
    d.setDate(startDay.getDate()+i);
    const inMonth = d.getMonth()===month;
    const ymd = d.toISOString().slice(0,10);
    const cell = document.createElement('div');
    cell.className = 'day';
    if(inMonth) cell.classList.add('in-month');
    if(selectedSet.has(ymd)) cell.classList.add('selected');
    if(usedMap[ymd]==='used') cell.classList.add('used');
    if(missedMap[ymd]==='missed') cell.classList.add('missed');
    cell.textContent = d.getDate();
    cell.dataset.date = ymd;
    if(inMonth){
      cell.addEventListener('click', ()=>{
        if(usedMap[ymd]==='used' || missedMap[ymd]==='missed') return;
        if(selectedSet.has(ymd)){
          selectedSet.delete(ymd);
        }else{
          selectedSet.add(ymd);
        }
        updateCalCounter(selectedSet.size);
        buildCalendar(year, month, selectedSet, usedMap, missedMap);
      });
    }
    calGrid.appendChild(cell);
  }
  updateCalCounter(selectedSet.size);
}

function updateCalCounter(n){
  const target = parseInt(regPaquete.value,10);
  calCounter.textContent = `${n} seleccionados / ${target} requeridos`;
  if(n===target){ calCounter.style.color='#2ecc71'; } else { calCounter.style.color='var(--muted)'; }
}

/* Admin form */
const regNombre = $('#reg-nombre');
const regCodigo = $('#reg-codigo');
const regTelefono = $('#reg-telefono');
const regEdad = $('#reg-edad');
const regDob = $('#reg-dob');
const regFoto = $('#reg-foto');
const btnGuardar = $('#btn-guardar');
const btnLimpiar = $('#btn-limpiar');
let currentEditingId = null;
let calendarSelected = new Set();

function resetForm(){
  currentEditingId = null;
  regNombre.value=''; regCodigo.value=''; regTelefono.value=''; regEdad.value=''; regDob.value=''; regFoto.value='';
  regPaquete.value='1';
  const now = new Date(); regMes.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  calendarSelected = new Set();
  buildCalendar(now.getFullYear(), now.getMonth(), calendarSelected);
}
resetForm();

regMes.addEventListener('change', ()=>{
  const [y,m] = regMes.value.split('-').map(Number);
  buildCalendar(y, m-1, calendarSelected);
});

regPaquete.addEventListener('change', ()=> updateCalCounter(calendarSelected.size));

btnLimpiar.addEventListener('click', resetForm);

btnGuardar.addEventListener('click', async ()=>{
  const target = parseInt(regPaquete.value,10);
  if(calendarSelected.size !== target){
    toast('Selecciona exactamente los días del paquete.');
    return;
  }
  const db = loadDB();
  const exists = db.find(s => s.code === regCodigo.value && s.id !== currentEditingId);
  if(exists){ toast('Ese código ya está registrado en otro alumno.'); return; }
  let photoData = null;
  if(regFoto.files && regFoto.files[0]){
    photoData = await fileToDataURL(regFoto.files[0]);
  }else if(currentEditingId){
    const orig = db.find(s=>s.id===currentEditingId);
    photoData = orig?.photo || null;
  }
  const schedDates = {};
  Array.from(calendarSelected).forEach(d => schedDates[d]='scheduled');
  const ym = regMes.value;
  const now = new Date().toISOString();

  if(currentEditingId){
    const st = db.find(s=>s.id===currentEditingId);
    Object.assign(st, {
      name: regNombre.value.trim(),
      code: regCodigo.value.trim(),
      phone: regTelefono.value.trim(),
      age: regEdad.value.trim(),
      dob: regDob.value || null,
      photo: photoData,
      schedules: {...(st.schedules||{}), [ym]: { packageSize: target, dates: schedDates, reminderShown:false}},
      updatedAt: now
    });
    toast('Alumno actualizado.');
  }else{
    db.push({
      id: uid(),
      name: regNombre.value.trim(),
      code: regCodigo.value.trim(),
      phone: regTelefono.value.trim(),
      age: regEdad.value.trim(),
      dob: regDob.value || null,
      photo: photoData,
      schedules: { [ym]: { packageSize: target, dates: schedDates, reminderShown:false}},
      createdAt: now,
      updatedAt: now
    });
    toast('Alumno registrado.');
  }
  saveDB(db);
  rebuildList();
  resetForm();
});

function fileToDataURL(file){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload = ()=> res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

/* Lista + Perfil */
const lista = $('#lista-alumnos');
const perfilDetalle = $('#perfil-detalle');
const btnReagendar = $('#btn-reagendar');

function rebuildList(){
  ensureMaintenance();
  const db = loadDB();
  lista.innerHTML='';
  db.sort((a,b)=> a.name.localeCompare(b.name,'es'));
  db.forEach(st => {
    const row = document.createElement('div');
    row.className='student-item';
    const img = document.createElement('img');
    img.src = st.photo || 'assets/logo.png';
    const meta = document.createElement('div');
    meta.className='meta';
    meta.innerHTML = `<b>${st.name||'(Sin nombre)'}</b><small>Código: ${st.code||'—'} · Tel: ${st.phone||'—'}</small>`;
    const actions = document.createElement('div');
    actions.className='actions';
    const bEdit = document.createElement('button'); bEdit.className='secondary'; bEdit.textContent='Editar';
    const bDel = document.createElement('button'); bDel.className='warning'; bDel.textContent='Borrar';
    const bProf = document.createElement('button'); bProf.textContent='Perfil';
    actions.append(bEdit,bDel,bProf);
    row.append(img, meta, actions);
    lista.appendChild(row);

    bEdit.addEventListener('click', ()=>{
      currentEditingId = st.id;
      regNombre.value = st.name||'';
      regCodigo.value = st.code||'';
      regTelefono.value = st.phone||'';
      regEdad.value = st.age||'';
      regDob.value = st.dob||'';
      const nowYM = regMes.value || new Date().toISOString().slice(0,7);
      const sched = (st.schedules||{})[nowYM];
      const target = sched?.packageSize || 1;
      regPaquete.value = String(target);
      calendarSelected = new Set(Object.keys(sched?.dates||{}));
      const [y,m] = nowYM.split('-').map(Number);
      const usedMap = {}; const missedMap={};
      Object.entries(sched?.dates||{}).forEach(([d,stt])=>{
        if(stt==='used') usedMap[d]='used';
        if(stt==='missed') missedMap[d]='missed';
      });
      buildCalendar(y, m-1, calendarSelected, usedMap, missedMap);
      toast('Editando alumno.');
    });

    bDel.addEventListener('click', ()=>{
      if(confirm('¿Borrar este alumno?')){
        const rest = loadDB().filter(x => x.id !== st.id);
        saveDB(rest);
        rebuildList();
        toast('Alumno borrado.');
      }
    });

    bProf.addEventListener('click', ()=> showProfile(st.id));
  });
}
rebuildList();

function showProfile(id){
  ensureMaintenance();
  const db = loadDB();
  const st = db.find(s=>s.id===id);
  const nowYM = new Date().toISOString().slice(0,7);
  const sched = (st.schedules||{})[nowYM];
  let remaining = 0, used=0, missed=0;
  if(sched){
    Object.values(sched.dates).forEach(v=>{
      if(v==='scheduled') remaining++;
      if(v==='used') used++;
      if(v==='missed') missed++;
    });
  }
  const lastDay = sched ? Object.keys(sched.dates).sort().slice(-1)[0] : '—';

  perfilDetalle.innerHTML = `
    <div class="row" style="align-items:center">
      <img src="${st.photo||'assets/logo.png'}" style="width:84px;height:84px;border-radius:10px;object-fit:cover;background:#0003">
      <div>
        <div style="font-weight:700">${st.name}</div>
        <div class="small">Código: ${st.code} · Tel: ${st.phone||'—'}</div>
        <div class="small">Mes: ${nowYM} · Último día programado: ${lastDay}</div>
      </div>
    </div>
    <hr/>
    <div class="row">
      <div class="input"><small>Pendientes</small><div class="notice">${remaining} clases</div></div>
      <div class="input"><small>Usadas</small><div class="notice">${used} clases</div></div>
      <div class="input"><small>Perdidas</small><div class="notice">${missed} clases</div></div>
    </div>
  `;

  // Reagendar si queda 1 pendiente
  if(remaining <= 1){
    btnReagendar.classList.remove('hide');
    btnReagendar.onclick = ()=> openReagendar(st.id);
  } else {
    btnReagendar.classList.add('hide');
  }
}

/* Reagendar siguiente mes */
function openReagendar(id){
  const db = loadDB();
  const st = db.find(s=>s.id===id);
  const today = new Date();
  const next = new Date(today.getFullYear(), today.getMonth()+1, 1);
  tabAdmin.click(); // ensure in admin
  currentEditingId = st.id;
  regNombre.value = st.name||'';
  regCodigo.value = st.code||'';
  regTelefono.value = st.phone||'';
  regEdad.value = st.age||'';
  regDob.value = st.dob||'';
  regMes.value = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`;
  regPaquete.value = (st.schedules?.[YM(TODAY())]?.packageSize ? String(st.schedules[YM(TODAY())].packageSize) : '1');
  calendarSelected = new Set(); // fresh selection
  buildCalendar(next.getFullYear(), next.getMonth(), calendarSelected);
  toast('Selecciona los días del siguiente mes y guarda.');
}

/* Student access */
let codeEntered = '';
const codeDots = $$('#code-display .dot');
$('#kbd-alumno').addEventListener('click', (e)=>{
  const t = e.target;
  if(t.tagName!=='BUTTON') return;
  const action = t.dataset.action;
  if(action==='enter'){
    if(codeEntered.length===4){
      doStudentEnter(codeEntered);
    } else { toast('Ingresa 4 dígitos.'); }
    return;
  }
  if(action==='back'){
    codeEntered = codeEntered.slice(0,-1);
  } else if(/[0-9]/.test(t.textContent) && codeEntered.length<4){
    codeEntered += t.textContent;
  }
  drawDots(codeDots, codeEntered.length);
});
$('#clear-code').addEventListener('click', ()=>{ codeEntered=''; drawDots(codeDots,0); });

function drawDots(dots, n){
  dots.forEach((d,i)=> d.classList.toggle('filled', i<n));
}

function doStudentEnter(code){
  ensureMaintenance();
  const db = loadDB();
  const st = db.find(s=> s.code === code);
  const result = $('#result-alumno');
  const perfil = $('#alumno-perfil');
  const foto = $('#alumno-foto');
  const nombre = $('#alumno-nombre');
  const clases = $('#alumno-clases');
  perfil.classList.add('hide');
  if(!st){
    result.innerHTML = `<b style="color:var(--bad)">Acceso denegado</b><br><span class="small">Código no encontrado.</span>`;
    speak('Acceso denegado');
    return autoClear();
  }
  const today = TODAY();
  const ym = YM(today);
  const sched = (st.schedules||{})[ym];
  if(!sched || !sched.dates[today]){
    result.innerHTML = `<b style="color:var(--bad)">Acceso denegado</b><br><span class="small">No tiene clase programada hoy.</span>`;
    speak('Acceso denegado');
    return autoClear(st);
  }
  const status = sched.dates[today];
  if(status === 'used' || status === 'missed'){
    result.innerHTML = `<b style="color:var(--bad)">Acceso denegado</b><br><span class="small">La clase de hoy ya fue contabilizada.</span>`;
    speak('Acceso denegado');
    return autoClear(st);
  }
  // OK -> mark used
  sched.dates[today] = 'used';
  saveDB(db);
  const remaining = Object.values(sched.dates).filter(v=>v==='scheduled').length;
  result.innerHTML = `<b style="color:var(--ok)">Acceso otorgado</b>`;
  speak('Acceso otorgado');
  foto.src = st.photo || 'assets/logo.png';
  nombre.textContent = st.name;
  clases.textContent = `Clases restantes del mes: ${remaining}`;
  perfil.classList.remove('hide');
  autoClear(st);
}

function autoClear(st){
  setTimeout(()=>{
    $('#result-alumno').textContent = 'Ingrese su código para continuar.';
    $('#alumno-perfil').classList.add('hide');
    codeEntered=''; drawDots(codeDots,0);
  }, 8000);
}

/* Admin keypad (no zoom) */
let adminCodeInput = '';
const adminDots = $$('#admincode-display .dot');
$('#kbd-admin').addEventListener('click', (e)=>{
  const t = e.target; if(t.tagName!=='BUTTON') return;
  const action = t.dataset.action;
  if(action==='enter'){
    const cfg = loadCfg();
    if(adminCodeInput === cfg.adminPin){
      window._adminUnlocked = true;
      adminLogin.classList.add('hide');
      adminApp.classList.remove('hide');
      toast('Administrador desbloqueado.');
    }else{
      toast('PIN incorrecto.');
    }
    return;
  }
  if(action==='back'){
    adminCodeInput = adminCodeInput.slice(0,-1);
  } else if(/[0-9]/.test(t.textContent) && adminCodeInput.length<4){
    adminCodeInput += t.textContent;
  }
  drawDots(adminDots, adminCodeInput.length);
});
$('#admin-clear-code').addEventListener('click', ()=>{ adminCodeInput=''; drawDots(adminDots,0); });

/* Export / Import */
$('#btn-export').addEventListener('click', ()=>{
  const data = { db: loadDB(), cfg: loadCfg() };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'academia_respaldo.json';
  a.click();
});

$('#btn-import').addEventListener('click', ()=>{
  const inp = document.createElement('input');
  inp.type='file'; inp.accept='application/json';
  inp.onchange = ()=>{
    const f = inp.files[0]; if(!f) return;
    const fr = new FileReader();
    fr.onload = ()=>{
      try{
        const obj = JSON.parse(fr.result);
        if(Array.isArray(obj.db)) saveDB(obj.db);
        if(obj.cfg) saveCfg(obj.cfg);
        rebuildList();
        toast('Respaldo importado.');
      }catch(e){ toast('Formato inválido.'); }
    };
    fr.readAsText(f);
  };
  inp.click();
});

/* Configuración */
$('#btn-config').addEventListener('click', ()=>{
  const cfg = loadCfg();
  const pin = prompt('Nuevo PIN de administrador (4 dígitos):', cfg.adminPin);
  if(pin && /^\d{4}$/.test(pin)){
    cfg.adminPin = pin;
    saveCfg(cfg);
    toast('PIN actualizado.');
  }else if(pin!==null){
    toast('PIN no válido.');
  }
});

/* Build initial calendar */
(function initCalendar(){
  const now = new Date();
  regMes.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  buildCalendar(now.getFullYear(), now.getMonth(), new Set());
})();

/* Maintenance at load */
ensureMaintenance();
