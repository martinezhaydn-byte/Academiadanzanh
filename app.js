// === Estado y utilidades ===
const LS_KEY = 'academia_app_state_v1';

const state = {
  alumnos: [], // {id, nombre, codigo, edad, fechaNac, telefono, fotoDataUrl, cicloMes, planMensual, calendario:[{date:'YYYY-MM-DD', used:false}]}
  adminPin: '1234'
};

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj.adminPin) state.adminPin = obj.adminPin;
      if (Array.isArray(obj.alumnos)) state.alumnos = obj.alumnos;
    }
  } catch(e){ console.warn('No se pudo cargar estado:', e); }
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function ymd(date) {
  const d = new Date(date);
  return d.toISOString().slice(0,10);
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtMonth(date) {
  return date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}
function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// === Voz (Mónica español si disponible) ===
let voces = [];
let vozSeleccionada = null;
function cargarVoces() {
  voces = speechSynthesis.getVoices();
  // Prioridad: nombre contiene 'Mónica'/'Monica' y 'es'
  vozSeleccionada = voces.find(v => /monic[aá]/i.test(v.name) && /^es/.test(v.lang))
                  || voces.find(v => /^es/.test(v.lang))
                  || voces[0] || null;
}
window.speechSynthesis?.addEventListener('voiceschanged', cargarVoces);
cargarVoces();

function hablar(texto) {
  try {
    const utter = new SpeechSynthesisUtterance(texto);
    if (vozSeleccionada) {
      utter.voice = vozSeleccionada;
      utter.lang = vozSeleccionada.lang || 'es-ES';
    } else {
      utter.lang = 'es-ES';
    }
    utter.rate = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
  } catch(e) {
    console.warn('Voz no disponible o bloqueada por el navegador.', e);
  }
}

// === UI helpers ===
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
function show(id){ qs(id).classList.remove('hidden'); }
function hide(id){ qs(id).classList.add('hidden'); }
function setTab(tabId){
  qsa('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tabId));
  qsa('.tabpane').forEach(p=>p.classList.toggle('hidden', p.id!==tabId));
}
function msg(el, text, ok=true){
  el.textContent = text;
  el.className = 'feedback ' + (ok ? 'ok' : 'err');
}

// === Pads numéricos ===
function crearNumpad(container, onEnter, onBack) {
  const nums = [
    '1','2','3',
    '4','5','6',
    '7','8','9',
    '←','0','Entrar'
  ];
  nums.forEach(n=>{
    const btn = document.createElement('button');
    btn.className = 'nbtn' + (n==='Entrar' ? ' alt' : (n==='←' ? ' warn' : ''));
    btn.textContent = n;
    btn.addEventListener('click', ()=>{
      if (n==='Entrar') onEnter();
      else if (n==='←') onBack();
      else container.dataset.value = (container.dataset.value||'') + n;
      actualizarPinDisplay(container);
    });
    container.appendChild(btn);
  });
  container.dataset.value='';
}
function actualizarPinDisplay(numpad){
  const target = numpad.dataset.target;
  const val = (numpad.dataset.value||'').slice(-4);
  numpad.dataset.value = val;
  const disp = qs(target==='admin' ? '#adminPin' : '#alumnoPin');
  disp.textContent = val.padEnd(4,'•').replace(/./g, (c,i)=> i<val.length ? '•' : '•');
}

// === Alumnos helpers ===
function alumnoPorCodigo(codigo) {
  return state.alumnos.find(a=>a.codigo===codigo);
}
function clasesRestantes(alumno) {
  const hoy = todayStr();
  // Purgar vencidas (no acumulables)
  alumno.calendario = alumno.calendario.filter(c=>!(!c.used && c.date < hoy));
  saveState();
  return alumno.calendario.filter(c=>!c.used).length;
}
function fechasMes(alumno){
  const mes = alumno.cicloMes;
  const fechas = alumno.calendario.map(c=>c.date);
  const ultima = fechas.sort().slice(-1)[0];
  return {mes, ultima};
}
function alumnosQueExpiranManana(){
  const manana = ymd(addDays(new Date(), 1));
  return state.alumnos.filter(a=>{
    if (!a.calendario.length) return false;
    const max = a.calendario.map(c=>c.date).sort().slice(-1)[0];
    return max === manana;
  });
}

// === Render lista ===
function renderLista(filtro=''){
  const wrap = qs('#listaAlumnos');
  wrap.innerHTML = '';
  const term = filtro.trim().toLowerCase();
  const data = state.alumnos
    .filter(a => !term || a.nombre.toLowerCase().includes(term) || a.codigo.includes(term))
    .sort((a,b)=> a.nombre.localeCompare(b.nombre,'es'));
  data.forEach(a=>{
    const div = document.createElement('div');
    div.className = 'item';
    const img = document.createElement('img');
    img.src = a.fotoDataUrl || 'assets/default-avatar.png';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<div class="name">${a.nombre}</div>
                      <div class="sub">Código ${a.codigo} • Tel ${a.telefono||'-'}</div>`;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const bEdit = document.createElement('button'); bEdit.className='mini edit'; bEdit.textContent='Editar';
    const bDel  = document.createElement('button'); bDel.className='mini del'; bDel.textContent='Borrar';
    const bPerf = document.createElement('button'); bPerf.className='mini perfil'; bPerf.textContent='Perfil';

    bEdit.onclick = ()=> cargarEnFormulario(a);
    bDel.onclick  = ()=> {
      if (confirm('¿Borrar alumno?')) {
        state.alumnos = state.alumnos.filter(x=>x.id!==a.id);
        saveState(); renderLista(qs('#filtro').value); mostrarPerfil(null);
      }
    };
    bPerf.onclick = ()=> mostrarPerfil(a);

    actions.append(bEdit,bDel,bPerf);
    div.append(img, meta, actions);
    wrap.appendChild(div);
  });
}

// === Perfil fijo ===
function mostrarPerfil(a){
  if (!a){
    show('#panelPerfilVacio');
    hide('#panelPerfil');
    return;
  }
  hide('#panelPerfilVacio');
  show('#panelPerfil');
  qs('#pFoto').src = a.fotoDataUrl || 'assets/default-avatar.png';
  qs('#pNombre').textContent = a.nombre;
  qs('#pCodigo').textContent = a.codigo;
  qs('#pTelefono').textContent = a.telefono || '-';
  qs('#pMesActual').textContent = a.cicloMes || '(sin asignar)';
  const r = clasesRestantes(a);
  qs('#pRestantes').textContent = r;

  const cont = qs('#pFechas');
  cont.innerHTML='';
  a.calendario.sort((x,y)=> x.date.localeCompare(y.date)).forEach(c=>{
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${c.date}${c.used?' ✓':''}`;
    cont.appendChild(chip);
  });

  const btnRe = qs('#btnReagendar');
  btnRe.disabled = !(r===1);
  btnRe.onclick = ()=> prepararReagendar(a);
}

// === Registrar / Editar ===
function cargarEnFormulario(a){
  qs('#regNombre').value = a.nombre;
  qs('#regCodigo').value = a.codigo;
  qs('#regEdad').value = a.edad || '';
  qs('#regFechaNac').value = a.fechaNac || '';
  qs('#regTelefono').value = a.telefono || '';
  qs('#btnGuardarCambios').disabled = false;
  qs('#btnGuardarCambios').dataset.id = a.id;
  msg(qs('#registroMsg'), 'Editando alumno; realiza cambios y presiona Guardar.', true);
  // Foto no se precarga por seguridad; el usuario puede subir nueva.
}
function limpiarFormulario(){
  qs('#formRegistro').reset();
  qs('#btnGuardarCambios').disabled = true;
  qs('#btnGuardarCambios').dataset.id = '';
  msg(qs('#registroMsg'), '', true);
}

async function fileToDataUrl(file){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

async function crearAlumno(){
  const nombre = qs('#regNombre').value.trim();
  const codigo = qs('#regCodigo').value.trim();
  const edad = parseInt(qs('#regEdad').value || '0',10);
  const fechaNac = qs('#regFechaNac').value;
  const telefono = qs('#regTelefono').value.trim();
  if (!/^\d{4}$/.test(codigo)) return msg(qs('#registroMsg'), 'El código debe tener 4 dígitos.', false);
  if (!nombre) return msg(qs('#registroMsg'), 'Nombre requerido.', false);
  if (alumnoPorCodigo(codigo)) return msg(qs('#registroMsg'), 'Ese código ya existe. Elige otro.', false);

  let fotoDataUrl = '';
  const file = qs('#regFoto').files?.[0];
  if (file) fotoDataUrl = await fileToDataUrl(file);

  const a = {
    id: uid(), nombre, codigo, edad, fechaNac, telefono, fotoDataUrl,
    cicloMes: '', planMensual: 0, calendario: []
  };
  state.alumnos.push(a);
  saveState();
  renderLista(qs('#filtro').value);
  actualizarSelectCal();
  limpiarFormulario();
  msg(qs('#registroMsg'), 'Alumno creado con éxito.', true);
}

async function guardarCambios(){
  const id = qs('#btnGuardarCambios').dataset.id;
  const a = state.alumnos.find(x=>x.id===id);
  if (!a) return msg(qs('#registroMsg'), 'No se encontró el alumno a editar.', false);

  const nombre = qs('#regNombre').value.trim();
  const codigo = qs('#regCodigo').value.trim();
  const edad = parseInt(qs('#regEdad').value || '0',10);
  const fechaNac = qs('#regFechaNac').value;
  const telefono = qs('#regTelefono').value.trim();
  if (!/^\d{4}$/.test(codigo)) return msg(qs('#registroMsg'), 'El código debe tener 4 dígitos.', false);
  // validar duplicado de código (permitir el mismo del propio alumno)
  if (codigo !== a.codigo && alumnoPorCodigo(codigo)) return msg(qs('#registroMsg'), 'Ese código ya existe en otro alumno.', false);

  let fotoDataUrl = a.fotoDataUrl;
  const file = qs('#regFoto').files?.[0];
  if (file) fotoDataUrl = await fileToDataUrl(file);

  Object.assign(a, {nombre, codigo, edad, fechaNac, telefono, fotoDataUrl});
  saveState();
  renderLista(qs('#filtro').value);
  mostrarPerfil(a);
  limpiarFormulario();
  msg(qs('#registroMsg'), 'Cambios guardados.', true);
}

// === Calendario (asignar y reagendar) ===
let calCurrent = new Date();
let calSeleccion = new Set();

function actualizarSelectCal(){
  const sel = qs('#calAlumno');
  const idSel = sel.value;
  sel.innerHTML = '';
  state.alumnos
    .sort((a,b)=> a.nombre.localeCompare(b.nombre,'es'))
    .forEach(a=>{
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${a.nombre} — ${a.codigo}`;
      sel.appendChild(opt);
    });
  if (idSel) sel.value = idSel;
}

function renderCalendario(){
  qs('#calMes').textContent = fmtMonth(calCurrent);
  const grid = qs('#calendarGrid');
  grid.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'cal-head';
  ['L','M','X','J','V','S','D'].forEach(d=>{
    const c = document.createElement('div'); c.textContent=d; head.appendChild(c);
  });
  grid.appendChild(head);

  const first = new Date(calCurrent.getFullYear(), calCurrent.getMonth(), 1);
  const last  = new Date(calCurrent.getFullYear(), calCurrent.getMonth()+1, 0);
  const startDay = (first.getDay() + 6) % 7; // L=0, ... D=6
  let day = new Date(first);
  day.setDate(day.getDate() - startDay);

  while (day <= addDays(last, (6 - ((last.getDay()+6)%7)))) {
    const row = document.createElement('div');
    row.className = 'cal-row';
    for (let i=0;i<7;i++){
      const c = document.createElement('div');
      c.className = 'cal-cell';
      const dStr = ymd(day);
      c.textContent = day.getDate();
      if (day.getMonth()!==calCurrent.getMonth()) c.classList.add('muted');
      if (dStr===todayStr()) c.classList.add('today');
      if (calSeleccion.has(dStr)) c.classList.add('sel');
      c.addEventListener('click', ()=>{
        const max = parseInt(qs('#calPaquete').value,10);
        if (calSeleccion.has(dStr)) {
          calSeleccion.delete(dStr);
          c.classList.remove('sel');
        } else {
          if (calSeleccion.size >= max) return; // limitar a paquete
          calSeleccion.add(dStr);
          c.classList.add('sel');
        }
      });
      row.appendChild(c);
      day = addDays(day, 1);
    }
    grid.appendChild(row);
  }
}

function asignarFechas(){
  const id = qs('#calAlumno').value;
  const a = state.alumnos.find(x=>x.id===id);
  if (!a) return msg(qs('#calMsg'), 'Selecciona un alumno.', false);
  const paquete = parseInt(qs('#calPaquete').value, 10);
  if (calSeleccion.size !== paquete) {
    return msg(qs('#calMsg'), `Debes seleccionar exactamente ${paquete} días.`, false);
  }
  const fechas = Array.from(calSeleccion).sort();
  a.calendario = fechas.map(d => ({date:d, used:false}));
  a.planMensual = paquete;
  a.cicloMes = monthKey(fechas[0]);
  saveState();
  msg(qs('#calMsg'), 'Fechas asignadas correctamente.', true);
  renderLista(qs('#filtro').value);
  calSeleccion.clear();
  renderCalendario();
}

function limpiarSeleccion(){
  calSeleccion.clear();
  renderCalendario();
}

function prepararReagendar(a){
  // coloca el calendario en el siguiente mes
  const cur = new Date(a.cicloMes+'-01T00:00:00');
  calCurrent = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
  setTab('tabCalendario');
  actualizarSelectCal();
  qs('#calAlumno').value = a.id;
  qs('#calPaquete').value = String(a.planMensual || 1);
  calSeleccion.clear();
  renderCalendario();
  msg(qs('#calMsg'), `Reagendando a ${a.nombre} para ${fmtMonth(calCurrent)}. Selecciona ${a.planMensual||1} días.`, true);
}

// === Notificaciones (un día antes de finalizar mensualidad) ===
function renderNotifs(){
  const cont = qs('#notificaciones');
  const lista = alumnosQueExpiranManana();
  if (!lista.length){ cont.classList.add('hidden'); cont.innerHTML=''; return; }
  cont.classList.remove('hidden');
  cont.innerHTML = '<div class="notif-item"><span class="badge">Avisos</span><div>Alumnos que concluyen su mensualidad mañana:</div></div>';
  lista.forEach(a=>{
    const {ultima} = fechasMes(a);
    const div = document.createElement('div');
    div.className = 'notif-item';
    div.innerHTML = `• <strong>${a.nombre}</strong> (código ${a.codigo}) — última clase: ${ultima}`;
    cont.appendChild(div);
  });
}

// === Modo Alumno (asistencia) ===
function procesarAccesoAlumno(codigo){
  const feedback = qs('#alumnoFeedback');
  const perfil = qs('#alumnoPerfil');
  const foto = qs('#alumnoFoto');
  const nombre = qs('#alumnoNombre');
  const rest = qs('#alumnoClasesRestantes');

  const a = alumnoPorCodigo(codigo);
  if (!a) {
    msg(feedback, 'Código no encontrado.', false);
    hablar('Acceso denegado');
    return;
  }
  // Purgar vencidas y calcular si hoy está asignado y no usado
  const hoy = todayStr();
  a.calendario = a.calendario.filter(c=>!(!c.used && c.date < hoy));
  const clsHoy = a.calendario.find(c=>c.date===hoy && !c.used);
  if (clsHoy){
    clsHoy.used = true;
    saveState();
    msg(feedback, 'ACCESO OTORGADO ✅', true);
    hablar('Acceso otorgado');
  } else {
    msg(feedback, 'ACCESO DENEGADO ❌ (no hay clase programada para hoy o ya está usada)', false);
    hablar('Acceso denegado');
  }

  foto.src = a.fotoDataUrl || 'assets/default-avatar.png';
  nombre.textContent = a.nombre;
  rest.textContent = clasesRestantes(a);
  perfil.classList.remove('hidden');

  // limpiar tras 8 segundos
  setTimeout(()=>{
    qs('[data-target="alumno"]').dataset.value='';
    actualizarPinDisplay(qs('[data-target="alumno"]'));
    perfil.classList.add('hidden');
    feedback.textContent='';
  }, 8000);
}

// === Modo Admin (login y dashboard) ===
function procesarAccesoAdmin(codigo){
  const msgEl = qs('#adminLoginMsg');
  if (codigo === state.adminPin){
    msg(msgEl, 'Acceso correcto.', true);
    hide('#paneAdminLogin');
    show('#paneAdmin');
    setTab('tabRegistrar');
    renderNotifs();
    renderLista();
    actualizarSelectCal();
    renderCalendario();
  } else {
    msg(msgEl, 'PIN incorrecto.', false);
  }
}

// === Eventos iniciales ===
function bootstrap(){
  loadState();

  // modo por defecto: alumno
  show('#paneAlumno');

  // botón de cambio de modo
  qs('#btnModoAlumno').onclick = ()=>{
    hide('#paneAdmin'); hide('#paneAdminLogin'); show('#paneAlumno');
  };
  qs('#btnModoAdmin').onclick = ()=>{
    hide('#paneAlumno'); hide('#paneAdmin'); show('#paneAdminLogin');
  };

  // crear numpads
  const padAlumno = document.createElement('div');
  padAlumno.className = 'pad';
  const numpadAlumno = qs('.numpad[data-target="alumno"]');
  crearNumpad(numpadAlumno, ()=>{
    const val = (numpadAlumno.dataset.value||'').padStart(4,'0').slice(0,4);
    if (!/^\d{4}$/.test(val)) return;
    procesarAccesoAlumno(val);
  }, ()=>{
    const v = (numpadAlumno.dataset.value||'');
    numpadAlumno.dataset.value = v.slice(0,-1);
    actualizarPinDisplay(numpadAlumno);
  });
  actualizarPinDisplay(numpadAlumno);

  const numpadAdmin = qs('.numpad[data-target="admin"]');
  crearNumpad(numpadAdmin, ()=>{
    const val = (numpadAdmin.dataset.value||'').padStart(4,'0').slice(0,4);
    if (!/^\d{4}$/.test(val)) return;
    procesarAccesoAdmin(val);
  }, ()=>{
    const v = (numpadAdmin.dataset.value||'');
    numpadAdmin.dataset.value = v.slice(0,-1);
    actualizarPinDisplay(numpadAdmin);
  });
  actualizarPinDisplay(numpadAdmin);

  // registrar & editar
  qs('#btnCrearAlumno').onclick = crearAlumno;
  qs('#btnGuardarCambios').onclick = guardarCambios;

  // calendario
  qs('#calPrev').onclick = ()=>{ calCurrent = new Date(calCurrent.getFullYear(), calCurrent.getMonth()-1, 1); renderCalendario(); };
  qs('#calNext').onclick = ()=>{ calCurrent = new Date(calCurrent.getFullYear(), calCurrent.getMonth()+1, 1); renderCalendario(); };
  qs('#btnAsignarFechas').onclick = asignarFechas;
  qs('#btnLimpiarSeleccion').onclick = limpiarSeleccion;

  // lista & perfil
  qs('#filtro').addEventListener('input', e=> renderLista(e.target.value));

  // ajustes
  qs('#btnGuardarPin').onclick = ()=>{
    const v = qs('#ajPin').value.trim();
    if (!/^\d{4}$/.test(v)) return alert('El PIN debe tener 4 dígitos.');
    state.adminPin = v;
    saveState();
    alert('PIN actualizado.');
    qs('#ajPin').value='';
  };
  qs('#btnSalirAdmin').onclick = ()=>{
    hide('#paneAdmin'); show('#paneAdminLogin');
    qs('[data-target="admin"]').dataset.value='';
    actualizarPinDisplay(qs('[data-target="admin"]'));
  };

  // notificaciones (al cargar admin)
  // (se renderizan en procesarAccesoAdmin)
}

document.addEventListener('DOMContentLoaded', bootstrap);
