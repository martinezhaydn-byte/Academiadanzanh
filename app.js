// Academia NH · Control de Acceso
// Datos en localStorage: nh_danza_v2
const STORE_KEY = 'nh_danza_v2';

// Estado en memoria
let state = {
  adminPin: '2025',
  paquetes: [
    {id:'suelta', nombre:'Clase suelta', clases:1, monto:90},
    {id:'p2', nombre:'2 clases', clases:2, monto:170},
    {id:'p4', nombre:'4 clases', clases:4, monto:320},
    {id:'p6', nombre:'6 clases', clases:6, monto:450},
    {id:'p8', nombre:'8 clases', clases:8, monto:560},
    {id:'p10', nombre:'10 clases', clases:10, monto:650},
    {id:'p12', nombre:'12 clases', clases:12, monto:720},
  ],
  alumnos: [], // {id, codigo, nombre, paqueteId, totalClases, clasesRestantes, montoPaquete, fotoData, pagos:[], asistencias:[]}
  últimoId: 1,
};

// Utilidades
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const nowISO = () => new Date().toISOString();

function save(){
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}
function load(){
  const raw = localStorage.getItem(STORE_KEY);
  if(raw){
    try{ state = JSON.parse(raw); }catch(e){ console.warn('No se pudo cargar estado, usando por defecto', e); }
  }else{
    // Semilla con un alumno demo
    state.alumnos.push({
      id: state.últimoId++,
      codigo: '1234',
      nombre: 'Alumno Demo',
      paqueteId: 'p4',
      totalClases: 4,
      clasesRestantes: 4,
      montoPaquete: 320,
      fotoData: '',
      pagos: [{fecha: nowISO(), monto: 320, paquete: '4 clases', notas:'Inicial'}],
      asistencias: []
    });
    save();
  }
}
load();

// ---- Voz (mujer, español) ----
let chosenVoice = null;
function pickSpanishFemaleVoice(){
  const voices = window.speechSynthesis.getVoices();
  // Prioriza voces femeninas en español
  const preferredNames = ['Google español', 'español (México)', 'es-MX', 'es-ES', 'Monica', 'Lucia', 'Valeria', 'Paulina'];
  let candidates = voices.filter(v => v.lang.toLowerCase().startsWith('es'));
  // intenta detectar género por nombre (heurística)
  candidates.sort((a,b)=>{
    const ascore = preferredNames.some(n=> (a.name||'').toLowerCase().includes(n.toLowerCase())) ? -1 : 0;
    const bscore = preferredNames.some(n=> (b.name||'').toLowerCase().includes(n.toLowerCase())) ? -1 : 0;
    return ascore - bscore;
  });
  chosenVoice = candidates[0] || null;
}
if ('speechSynthesis' in window){
  window.speechSynthesis.onvoiceschanged = pickSpanishFemaleVoice;
  // Llamada inicial
  setTimeout(pickSpanishFemaleVoice, 400);
}

function speak(text){
  try{
    if(!('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = (chosenVoice && chosenVoice.lang) || 'es-MX';
    if(chosenVoice) utter.voice = chosenVoice;
    utter.pitch = 1;
    utter.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }catch(e){ console.warn('Error de voz', e); }
}

// ---- UI: modos ----
const btnAlumno = $('#btnAlumno');
const btnAdmin = $('#btnAdmin');
const secAlumno = $('#secAlumno');
const secAdmin = $('#secAdmin');
const modeLabel = $('#modeLabel');
btnAlumno.addEventListener('click', ()=> setMode('alumno'));
btnAdmin.addEventListener('click', ()=> setMode('admin'));

function setMode(m){
  if(m==='alumno'){
    btnAlumno.classList.add('active'); btnAdmin.classList.remove('active');
    secAlumno.classList.remove('hidden'); secAdmin.classList.add('hidden');
    modeLabel.textContent = 'Alumno';
    clearAlumnoPad();
  }else{
    btnAdmin.classList.add('active'); btnAlumno.classList.remove('active');
    secAdmin.classList.remove('hidden'); secAlumno.classList.add('hidden');
    modeLabel.textContent = 'Administrador';
    showAdminGate();
  }
}

// ---- Alumno keypad (evita zoom usando botones) ----
let alumnoCode = '';
const alumnoHoles = [$('#dig1'),$('#dig2'),$('#dig3'),$('#dig4')];
function renderAlumnoCode(){
  const arr = alumnoCode.padEnd(4,' ').slice(0,4).split('');
  arr.forEach((c,i)=> alumnoHoles[i].textContent = c.trim()==='' ? '•' : '•');
}
function clearAlumnoPad(){
  alumnoCode=''; renderAlumnoCode(); $('#alumnoResultado').classList.add('hidden'); $('#alumnoResultado').innerHTML='';
}
function alumnoKey(k){
  if(k==='del'){ alumnoCode = alumnoCode.slice(0,-1); renderAlumnoCode(); return; }
  if(k==='go'){ validarAlumno(); return; }
  if(alumnoCode.length<4 && /\d/.test(k)){ alumnoCode += k; renderAlumnoCode(); if(alumnoCode.length===4){ validarAlumno(); } }
}
$$('[data-k]').forEach(b=> b.addEventListener('click', ()=> alumnoKey(b.dataset.k)));

// Busca alumno y descuenta sin botón de asistencia
function validarAlumno(){
  if(alumnoCode.length!==4){ speak('Código incompleto'); return; }
  const alum = state.alumnos.find(a=> a.codigo===alumnoCode);
  const res = $('#alumnoResultado');
  if(!alum){
    res.innerHTML = `<div class="row"><div class="pill">Resultado</div></div>
      <div class="student-card" style="margin-top:10px">
        <img alt="Sin foto">
        <div>
          <div class="danger"><strong>Acceso denegado</strong></div>
          <div class="muted">Código incorrecto.</div>
        </div>
      </div>`;
    res.classList.remove('hidden');
    speak('Acceso denegado');
    setTimeout(()=>{ res.classList.add('hidden'); clearAlumnoPad(); }, 2500);
    return;
  }
  // Evita doble descuento si ya pasó hace poco
  const lastAsist = alum.asistencias[alum.asistencias.length-1];
  const now = Date.now();
  if(lastAsist && (now - new Date(lastAsist.fecha).getTime()) < 90*1000){
    // Solo muestra tarjeta sin descontar de nuevo
    showAlumnoCard(alum, false, 'Acceso concedido');
    speak('Acceso concedido');
    setTimeout(()=>{ $('#alumnoResultado').classList.add('hidden'); clearAlumnoPad(); }, 4000);
    return;
  }

  // Descuenta automáticamente
  if(alum.clasesRestantes>0) alum.clasesRestantes -= 1;
  alum.asistencias.push({fecha: new Date().toISOString()});
  save();
  let msg = 'Acceso concedido';
  if(alum.clasesRestantes===1) msg += '. Te queda una clase, recuerda renovar.';
  if(alum.clasesRestantes===0) msg += '. Ya no te quedan clases.';
  showAlumnoCard(alum, true, msg);
  speak(msg);
  setTimeout(()=>{ $('#alumnoResultado').classList.add('hidden'); clearAlumnoPad(); }, 6000);
}

function showAlumnoCard(alum, descontado, msg){
  const res = $('#alumnoResultado');
  const foto = alum.fotoData ? `<img src="${alum.fotoData}" alt="Foto de ${alum.nombre}">` : `<img alt="Sin foto">`;
  const paquete = state.paquetes.find(p=> p.id===alum.paqueteId);
  const clasesTxt = `${alum.clasesRestantes}/${alum.totalClases} clases`;
  const aviso = (alum.clasesRestantes<=1) ? `<span class="tag warn">Falta 1 clase</span>` : '';
  res.innerHTML = `
    <div class="row"><div class="pill">Resultado</div><div class="grow"></div><span class="muted">${new Date().toLocaleString()}</span></div>
    <div class="student-card" style="margin-top:10px">
      ${foto}
      <div>
        <div style="font-weight:700">${alum.nombre} <span class="muted">(${alum.codigo})</span></div>
        <div class="${descontado?'success':'muted'}">${msg}</div>
        <div class="row" style="gap:8px;margin-top:6px">
          <span class="tag">${paquete?paquete.nombre:'Paquete'}</span>
          <span class="tag">${clasesTxt}</span>
          ${aviso}
        </div>
      </div>
    </div>
  `;
  res.classList.remove('hidden');
}

// ---- Admin gate via keypad ----
let adminCode = '';
const adminHoles = [$('#a1'),$('#a2'),$('#a3'),$('#a4')];
function renderAdminCode(){
  const arr = adminCode.padEnd(4,' ').slice(0,4).split('');
  arr.forEach((c,i)=> adminHoles[i].textContent = c.trim()==='' ? '•' : '•');
}
function clearAdminPad(){ adminCode=''; renderAdminCode(); }
function adminKey(k){
  if(k==='del'){ adminCode = adminCode.slice(0,-1); renderAdminCode(); return; }
  if(k==='go'){ validarAdmin(); return; }
  if(adminCode.length<4 && /\d/.test(k)){ adminCode += k; renderAdminCode(); if(adminCode.length===4){ validarAdmin(); } }
}
$$('[data-ak]').forEach(b=> b.addEventListener('click', ()=> adminKey(b.dataset.ak)));

function showAdminGate(){
  $('#adminGate').classList.remove('hidden');
  $('#adminPanel').classList.add('hidden');
  clearAdminPad();
  $('#defpin').textContent = state.adminPin;
}

function validarAdmin(){
  if(adminCode===state.adminPin){
    $('#adminGate').classList.add('hidden');
    $('#adminPanel').classList.remove('hidden');
    paintPaquetes();
    renderListaAlumnos();
    $('#detalleAlumno').innerHTML = 'Selecciona un alumno para ver y editar su perfil.';
  }else{
    speak('Acceso denegado');
    adminCode=''; renderAdminCode();
  }
}

// ---- Admin panel ----
const listaAlumnosDiv = $('#listaAlumnos');
const buscar = $('#buscar');
buscar.addEventListener('input', renderListaAlumnos);

function renderListaAlumnos(){
  const q = (buscar.value||'').toLowerCase();
  let alumnos = state.alumnos.slice();
  if(q){
    alumnos = alumnos.filter(a=> (a.nombre.toLowerCase().includes(q) || a.codigo.includes(q)));
  }
  if(alumnos.length===0){
    listaAlumnosDiv.innerHTML = '<div class="muted">Sin resultados.</div>';
    return;
  }
  const rows = alumnos.map(a=>{
    const paq = state.paquetes.find(p=> p.id===a.paqueteId);
    const warn = (a.clasesRestantes<=1) ? '<span class="tag warn">Falta 1</span>' : '';
    return `<div class="row" style="margin-bottom:8px">
      <div class="grow">
        <div style="font-weight:600">${a.nombre} <span class="muted">(${a.codigo})</span></div>
        <div class="muted">${paq?paq.nombre:''} · ${a.clasesRestantes}/${a.totalClases} · $${a.montoPaquete}</div>
      </div>
      ${warn}
      <button data-edit="${a.id}">Editar</button>
    </div>`;
  }).join('');
  listaAlumnosDiv.innerHTML = rows;
  $$('#listaAlumnos [data-edit]').forEach(btn=> btn.addEventListener('click', ()=> openAlumnoDetalle(parseInt(btn.dataset.edit)) ));
}

// Detalle alumno
function openAlumnoDetalle(id){
  const a = state.alumnos.find(x=> x.id===id);
  if(!a) return;
  const paqOpts = state.paquetes.map(p=> `<option value="${p.id}" ${p.id===a.paqueteId?'selected':''}>${p.nombre}</option>`).join('');
  const foto = a.fotoData ? `<img src="${a.fotoData}" style="width:72px;height:72px;border-radius:10px;object-fit:cover;border:1px solid #374151;background:#0b1220">` : '<div class="muted">Sin foto</div>';
  const pagosRows = a.pagos.map(p=> `<tr><td>${new Date(p.fecha).toLocaleString()}</td><td>$${p.monto}</td><td>${p.paquete||''}</td><td>${p.notas||''}</td></tr>`).join('') || '<tr><td colspan="4" class="faded">Sin pagos aún.</td></tr>';
  const asistRows = a.asistencias.map(s=> `<tr><td>${new Date(s.fecha).toLocaleString()}</td></tr>`).join('') || '<tr><td class="faded">Sin asistencias aún.</td></tr>';

  $('#detalleAlumno').innerHTML = `
    <div class="grid two">
      <div>
        <div class="row" style="align-items:center;gap:12px">
          ${foto}
          <div style="font-size:18px;font-weight:700">${a.nombre} <span class="muted">(${a.codigo})</span></div>
        </div>
        <div class="grid two" style="margin-top:10px">
          <div>
            <label>Nombre</label>
            <input id="detNombre" value="${a.nombre}">
          </div>
          <div>
            <label>Código</label>
            <input id="detCodigo" value="${a.codigo}" maxlength="4" pattern="\\d{4}" inputmode="numeric">
          </div>
        </div>
        <div class="grid two">
          <div>
            <label>Paquete</label>
            <select id="detPaquete">${paqOpts}</select>
          </div>
          <div>
            <label>Monto paquete</label>
            <input id="detMonto" type="number" min="0" step="1" value="${a.montoPaquete}">
          </div>
        </div>
        <div class="grid three">
          <div>
            <label>Clases totales</label>
            <input id="detTot" type="number" value="${a.totalClases}" min="1" step="1">
          </div>
          <div>
            <label>Clases restantes</label>
            <input id="detRest" type="number" value="${a.clasesRestantes}" min="0" step="1">
          </div>
          <div>
            <label>Foto</label>
            <input id="detFoto" type="file" accept="image/*">
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button id="btnGuardarAlumno" class="ok">Guardar cambios</button>
          <div class="grow"></div>
          <button id="btnEliminarAlumno" class="err">Eliminar</button>
        </div>
      </div>
      <div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="tag">Asistencias: ${a.asistencias.length}</span>
          <span class="tag">Restantes: ${a.clasesRestantes}</span>
          ${a.clasesRestantes<=1?'<span class="tag warn">Puede re‑agendar</span>':''}
        </div>
        <div class="card" style="margin-top:8px">
          <h4 style="margin:0">Pagos</h4>
          <table class="table" style="margin-top:8px">
            <thead><tr><th>Fecha</th><th>Monto</th><th>Paquete</th><th>Notas</th></tr></thead>
            <tbody>${pagosRows}</tbody>
          </table>
          <div class="grid two" style="margin-top:10px">
            <div>
              <label>Monto (MXN)</label>
              <input id="pagoMonto" type="number" min="0" step="1" placeholder="Ej. 560">
            </div>
            <div>
              <label>Paquete</label>
              <select id="pagoPaquete">${state.paquetes.map(p=>`<option value="${p.id}">${p.nombre}</option>`)}</select>
            </div>
          </div>
          <label>Notas</label>
          <input id="pagoNotas" placeholder="Opcional">
          <div class="row" style="margin-top:8px">
            <button id="btnRegistrarPago">Registrar pago</button>
            <button id="btnReagendar" class="primary" ${a.clasesRestantes<=1?'':'disabled'}>Registrar pago y re‑agendar</button>
          </div>
        </div>

        <div class="card" style="margin-top:8px">
          <h4 style="margin:0">Asistencias</h4>
          <table class="table" style="margin-top:8px">
            <thead><tr><th>Fecha y hora</th></tr></thead>
            <tbody>${asistRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Listeners detalle
  $('#detFoto').addEventListener('change', async (e)=>{
    const f = e.target.files[0]; if(!f) return;
    const data = await fileToDataURL(f);
    a.fotoData = data; save(); openAlumnoDetalle(id);
  });
  $('#btnGuardarAlumno').addEventListener('click', ()=>{
    const nuevoCodigo = $('#detCodigo').value.trim();
    if(!/^\d{4}$/.test(nuevoCodigo)) return alert('El código debe ser de 4 dígitos.');
    if(state.alumnos.some(x=> x.codigo===nuevoCodigo && x.id!==id)) return alert('Ese código ya existe.');
    a.nombre = $('#detNombre').value.trim() || a.nombre;
    a.codigo = nuevoCodigo;
    a.paqueteId = $('#detPaquete').value;
    a.montoPaquete = parseInt($('#detMonto').value||a.montoPaquete,10);
    a.totalClases = parseInt($('#detTot').value||a.totalClases,10);
    a.clasesRestantes = parseInt($('#detRest').value||a.clasesRestantes,10);
    save(); renderListaAlumnos(); openAlumnoDetalle(id);
  });
  $('#btnEliminarAlumno').addEventListener('click', ()=>{
    if(confirm('¿Eliminar este alumno?')){
      state.alumnos = state.alumnos.filter(x=> x.id!==id);
      save(); renderListaAlumnos(); $('#detalleAlumno').innerHTML = 'Selecciona un alumno…';
    }
  });
  $('#btnRegistrarPago').addEventListener('click', ()=>{
    const monto = parseInt($('#pagoMonto').value||'0',10);
    const paqueteId = $('#pagoPaquete').value;
    const notas = $('#pagoNotas').value;
    if(!monto) return alert('Indica el monto.');
    const paq = state.paquetes.find(p=> p.id===paqueteId);
    a.pagos.push({fecha: nowISO(), monto, paquete: paq?paq.nombre:'', notas});
    save(); openAlumnoDetalle(id);
    alert('Pago registrado');
  });
  $('#btnReagendar').addEventListener('click', ()=>{
    const monto = parseInt($('#pagoMonto').value||'0',10);
    const paqueteId = $('#pagoPaquete').value;
    const notas = $('#pagoNotas').value || 'Re‑agendado';
    if(!(a.clasesRestantes<=1)) return alert('Solo se puede re‑agendar cuando queda 1 clase.');
    if(!monto) return alert('Indica el monto del pago.');
    const paq = state.paquetes.find(p=> p.id===paqueteId);
    const clases = paq? paq.clases : 0;
    if(!clases) return alert('Selecciona un paquete válido.');
    a.pagos.push({fecha: nowISO(), monto, paquete: paq.nombre, notas});
    a.paqueteId = paqueteId;
    a.totalClases = clases;
    a.clasesRestantes = clases;
    a.montoPaquete = monto;
    save(); openAlumnoDetalle(id);
    alert('Pago registrado y re‑agendado');
  });
}

async function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

// Agregar alumno
const selPaquete = $('#alPaquete');
const inpMonto = $('#alMonto');
const inpClases = $('#alClases');
const inpFoto = $('#alFoto');

function syncAddFormFromPaquete(){
  const p = state.paquetes.find(x=> x.id===selPaquete.value);
  if(!p) return;
  if(!inpMonto.value) inpMonto.value = p.monto;
  if(!inpClases.value) inpClases.value = p.clases;
}
function paintPaquetes(){
  selPaquete.innerHTML = state.paquetes.map(p=> `<option value="${p.id}">${p.nombre}</option>`).join('');
  $('#cfgPaquetes').innerHTML = state.paquetes.map((p,i)=>`
    <div class="grid three" style="margin-bottom:8px">
      <div><label>Nombre</label><input data-pname="${i}" value="${p.nombre}"></div>
      <div><label>Clases</label><input data-pcls="${i}" type="number" min="1" step="1" value="${p.clases}"></div>
      <div><label>Monto (MXN)</label><input data-pmnt="${i}" type="number" min="0" step="1" value="${p.monto}"></div>
    </div>
  `).join('');
  syncAddFormFromPaquete();
}
paintPaquetes();
selPaquete.addEventListener('change', ()=>{ inpMonto.value=''; inpClases.value=''; syncAddFormFromPaquete(); });

$('#btnAddAlumno').addEventListener('click', async ()=>{
  const nombre = $('#alNombre').value.trim();
  const codigo = $('#alCodigo').value.trim();
  if(!nombre) return alert('Escribe el nombre.');
  if(!/^\d{4}$/.test(codigo)) return alert('El código debe ser de 4 dígitos.');
  if(state.alumnos.some(a=> a.codigo===codigo)) return alert('Ese código ya existe.');
  const p = state.paquetes.find(x=> x.id===selPaquete.value);
  const monto = parseInt((inpMonto.value || (p?p.monto:0)),10)||0;
  const clases = parseInt((inpClases.value || (p?p.clases:1)),10)||1;
  let fotoData = '';
  if(inpFoto.files && inpFoto.files[0]) fotoData = await fileToDataURL(inpFoto.files[0]);
  const alumno = {
    id: state.últimoId++,
    codigo, nombre,
    paqueteId: p?p.id:'',
    totalClases: clases,
    clasesRestantes: clases,
    montoPaquete: monto,
    fotoData,
    pagos: monto ? [{fecha: nowISO(), monto, paquete: p?p.nombre:'', notas:'Inicial'}] : [],
    asistencias: []
  };
  state.alumnos.push(alumno);
  save();
  // Limpia formulario
  $('#alNombre').value=''; $('#alCodigo').value=''; inpMonto.value=''; inpClases.value=''; inpFoto.value=null;
  renderListaAlumnos();
  alert('Alumno agregado');
});

// Export / Import
$('#btnExport').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'danza_datos.json';
  a.click();
});
$('#fileImport').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  const txt = await f.text();
  try{
    const data = JSON.parse(txt);
    if(!data || !data.alumnos) return alert('Archivo inválido.');
    state = data; save();
    paintPaquetes(); renderListaAlumnos(); $('#detalleAlumno').innerHTML='Importado. Selecciona un alumno…';
    alert('Datos importados');
  }catch(err){ alert('No se pudo importar'); }
});

// Configuración
$('#btnGuardarPin').addEventListener('click', ()=>{
  const p = $('#cfgPin').value.trim();
  if(!/^\d{4}$/.test(p)) return alert('El PIN debe ser de 4 dígitos.');
  state.adminPin = p; save(); alert('PIN actualizado');
});
$('#btnGuardarPaquetes').addEventListener('click', ()=>{
  state.paquetes.forEach((p,i)=>{
    const n = document.querySelector(`[data-pname="${i}"]`).value;
    const c = parseInt(document.querySelector(`[data-pcls="${i}"]`).value||p.clases,10);
    const m = parseInt(document.querySelector(`[data-pmnt="${i}"]`).value||p.monto,10);
    p.nombre = n; p.clases = c; p.monto = m;
  });
  save(); paintPaquetes(); alert('Paquetes guardados');
});
$('#btnReset').addEventListener('click', ()=>{
  if(confirm('Esto borrará todos los datos y restablecerá la app.')){
    localStorage.removeItem(STORE_KEY);
    location.reload();
  }
});
$('#btnSalirAdmin').addEventListener('click', ()=> setMode('alumno'));

// ---- Service Worker PWA (opcional) ----
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}
