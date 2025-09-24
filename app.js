/* app v17 - Academia NH
   - Multi-mes enlazados
   - Reagendar multi-mes
   - Voces con prueba/selección
   - Teclado numérico, PIN admin, códigos únicos de 4 dígitos
   - Lista con orden alfabético y búsqueda
   - Perfil muestra mes activo + meses futuros, editar/eliminar meses
   - Auto-caducar días pasados (al abrir admin o perfil)
   - Toasts, limpieza automática de la vista alumno a los 8s
   - PWA ready (service worker + manifest) */

/* Nota: este es un build cliente (PWA) simplificado para desplegar en navegador/tablet.
   Abrir index.html en el navegador o publicar como PWA. */

(function(){
const $=(s,ctx=document)=>ctx.querySelector(s);
const $$=(s,ctx=document)=>Array.from((ctx||document).querySelectorAll(s));
const LS_KEY="academia_nh_v17";
const collator = new Intl.Collator('es',{sensitivity:'base'});
const state = { alumnos:[], config:{pinAdmin:"1234",voz:null,orden:"asc"}, uiPerfilOpenId:"" };

function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function load(){
  const raw = localStorage.getItem(LS_KEY);
  if(raw){ try{ const d=JSON.parse(raw); state.alumnos=d.alumnos||[]; state.config=Object.assign(state.config,d.config||{}); }catch(e){console.warn(e);} }
  // sanitize codes
  state.alumnos.forEach(a=> a.codigo = (a.codigo||"").toString().replace(/\D/g,"").slice(0,4));
  state.config.pinAdmin = (state.config.pinAdmin||"1234").toString().replace(/\D/g,"").slice(0,4);
}

// UTIL
function uid(){ return "u"+Math.random().toString(36).slice(2,9); }
function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
function dateLT(a,b){ return new Date(a) < new Date(b); }
function sortAlumnos(arr){ return arr.slice().sort((x,y)=>collator.compare(x.nombre||"", y.nombre||"")); }
function remaining(cal){ return (cal?.dias||[]).filter(d=>!(cal.usados||[]).includes(d)).length; }
function remainingFromActive(a){
  const keys=Object.keys(a.calendario||{}).sort();
  let started=false, sum=0;
  for(const k of keys){
    const rem = remaining(a.calendario[k]);
    if(rem>0 || started){ started=true; sum+=rem; }
  }
  return sum;
}

// UI: render básico (con elementos esenciales)
function buildUI(){
  const root = document.getElementById('app');
  root.innerHTML = `
  <div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
      <button id="btnModoAlumno">Modo Alumno</button>
      <button id="btnModoAdmin">Modo Admin</button>
      <select id="cfgOrden"><option value="asc">A→Z</option><option value="desc">Z→A</option></select>
      <button id="btnExport">Exportar</button>
      <button id="btnImport">Importar</button>
      <input type="file" id="fileImport" style="display:none" accept="application/json" />
    </div>
    <div id="vistas">
      <div id="vistaAlumno">
        <h2>Entrada Alumno</h2>
        <div><div id="pinAlumno" style="font-size:28px;letter-spacing:8px">____</div></div>
        <div id="tecladoAlumno"></div>
        <button id="btnEntrarAlumno">Entrar</button> <button id="btnBorrarAlumno">Borrar</button>
        <div id="resultadoAlumno" style="margin-top:12px"></div>
      </div>

      <div id="vistaAdmin" style="display:none;margin-top:14px">
        <h2>Administración</h2>
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="min-width:360px">
            <h3>Registro</h3>
            <form id="formAlumno">
              <div><label>Nombre <input id="alNombre"></label></div>
              <div><label>Código <input id="alCodigo" maxlength="4"></label></div>
              <div><label>Teléfono <input id="alTel"></label></div>
              <div><label>Edad <input id="alEdad" type="number"></label></div>
              <div><label>Fecha Nac <input id="alFN" type="date"></label></div>
              <div><label>Foto <input id="alFoto" type="file" accept="image/*"></label></div>
              <input type="hidden" id="editId">
              <div style="margin-top:8px"><button id="btnGuardarAl">Guardar</button> <button id="btnNuevoAl" type="button">Nuevo</button></div>
            </form>
            <hr/>
            <h3>Calendario</h3>
            <div><label>Alumno <select id="selAlumnoCal"></select></label></div>
            <div id="multiMes"></div>
            <div style="margin-top:8px"><button id="btnAddMes">Añadir mes</button> <button id="btnGuardarCal">Guardar calendario</button></div>
          </div>
          <div style="flex:1">
            <h3>Lista</h3>
            <input id="buscar" placeholder="buscar..." style="width:100%;margin-bottom:6px">
            <div id="lista" style="max-height:360px;overflow:auto;border:1px solid #222;padding:6px"></div>
            <div id="perfil" style="margin-top:10px;border:1px solid #222;padding:8px;display:none"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;
  // teclado simple
  const keys = ['1','2','3','4','5','6','7','8','9','0','⌫'];
  const tk = $('#tecladoAlumno');
  tk.style.display="grid"; tk.style.gridTemplateColumns="repeat(3,64px)"; tk.style.gap="6px";
  keys.forEach(k=>{ const b=document.createElement('button'); b.textContent=k; b.style.padding='10px'; b.addEventListener('click', ()=>onKeyAlumno(k)); tk.appendChild(b); });
}

// PIN display utils
function setPin(val){ const el=$('#pinAlumno'); el.dataset.val = val||''; el.textContent = (val||'').padEnd(4,'_').split('').join(' '); }
function getPin(){ return $('#pinAlumno').dataset.val||''; }
function onKeyAlumno(k){
  let cur=getPin();
  if(k==='⌫') cur = cur.slice(0,-1);
  else if(/\d/.test(k) && cur.length<4) cur = cur + k;
  setPin(cur);
}

// Core: expire past days (auto-caducar)
function expirePastDays(){
  const hoy = todayISO();
  let changed=false;
  state.alumnos.forEach(al=>{
    if(!al.calendario) return;
    Object.keys(al.calendario).forEach(mk=>{
      const cal = al.calendario[mk];
      cal.usados = cal.usados || [];
      // for each day in cal.dias, if date < hoy and not in usados -> marcar como usado (perdida)
      cal.dias.forEach(d=>{
        if(dateLT(d, hoy) && !(cal.usados||[]).includes(d)){
          cal.usados.push(d);
          changed=true;
        }
      });
      // normalize únicos
      if(cal.usados && Array.isArray(cal.usados)){
        cal.usados = Array.from(new Set(cal.usados));
      }
    });
  });
  if(changed){ save(); }
  return changed;
}

// Guardar calendario desde UI (colecta bloques)
function collectMultiMesBlocks(){
  const blocks = $$('#multiMes .mes-block');
  const result=[];
  for(const b of blocks){
    const mk = b.querySelector('.mesInput').value;
    const pack = parseInt(b.querySelector('.packInput').value,10);
    const dias = $$('.dia.activo', b).map(x=>x.dataset.full);
    if(dias.length !== pack) throw new Error(`En ${mk} selecciona exactamente ${pack} día(s)`);
    result.push({mk,dias});
  }
  return result;
}
function renderMesBlock(parent, mk, pack, preSelected=[]){
  const wrap = document.createElement('div'); wrap.className='mes-block';
  wrap.innerHTML = `
    <div><label>Mes <input class="mesInput" type="month" value="${mk}"></label>
    <label>Paquete <select class="packInput">${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label></div>
    <div class="mesGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:6px"></div>
    <div style="margin-top:6px"><button class="rmMes">Quitar</button><span class="hint" style="margin-left:8px">Selecciona días según paquete</span></div>
  `;
  parent.appendChild(wrap);
  const grid = wrap.querySelector('.mesGrid');
  const mesInput = wrap.querySelector('.mesInput');
  const packInput = wrap.querySelector('.packInput');
  packInput.value = String(pack||4);
  function drawGrid(){
    grid.innerHTML='';
    const [y,m] = mesInput.value.split('-').map(n=>parseInt(n,10));
    const first = new Date(y,m-1,1);
    const days = new Date(y,m,0).getDate();
    ['L','M','X','J','V','S','D'].forEach(h=>{ const el=document.createElement('div'); el.textContent=h; el.style.opacity=.6; grid.appendChild(el); });
    const start = (first.getDay()+6)%7;
    for(let i=0;i<start;i++){ const v=document.createElement('div'); v.style.visibility='hidden'; grid.appendChild(v); }
    for(let d=1; d<=days; d++){
      const btn = document.createElement('button'); btn.type='button'; btn.className='dia'; btn.textContent=d; btn.dataset.full = `${mesInput.value}-${String(d).padStart(2,'0')}`;
      btn.addEventListener('click', ()=>{ btn.classList.toggle('activo'); enforcePack(); });
      grid.appendChild(btn);
    }
    // preselect
    if(Array.isArray(preSelected)){
      preSelected.forEach(fd=>{ const b = Array.from(grid.querySelectorAll('.dia')).find(x=>x.dataset.full===fd); if(b) b.classList.add('activo'); });
    }
    enforcePack();
  }
  function enforcePack(){
    const pack = parseInt(packInput.value,10);
    const activos = Array.from(grid.querySelectorAll('.dia.activo'));
    while(activos.length > pack) activos.pop().classList.remove('activo');
  }
  mesInput.addEventListener('change', drawGrid);
  packInput.addEventListener('change', enforcePack);
  wrap.querySelector('.rmMes').addEventListener('click', ()=>wrap.remove());
  drawGrid();
  return wrap;
}

// render lista y perfil
function renderLista(){
  const lista = $('#lista'); lista.innerHTML='';
  const arr = sortAlumnos(state.alumnos);
  const orden = $('#cfgOrden')?$('#cfgOrden').value:state.config.orden;
  if(orden==='desc') arr.reverse();
  arr.forEach(a=>{
    const div=document.createElement('div'); div.style.display='flex'; div.style.justifyContent='space-between'; div.style.alignItems='center'; div.style.padding='6px';
    div.innerHTML = `<div><strong>${a.nombre||'—'}</strong><div style="font-size:12px;color:#aaa">Código ${a.codigo||'—'}</div></div><div><button class="verPerfil" data-id="${a.id}">Perfil</button></div>`;
    lista.appendChild(div);
  });
  $$('.verPerfil').forEach(b=>b.addEventListener('click', ()=>{ const id=b.dataset.id; expirePastDays(); mostrarPerfil(id); }));
}

function mostrarPerfil(id){
  const al = state.alumnos.find(x=>x.id===id); if(!al) return;
  const panel = $('#perfil'); panel.style.display='block';
  const keys = Object.keys(al.calendario||{}).sort();
  let activo = null;
  for(const k of keys){ if(remaining(al.calendario[k])>0){ activo=k; break; } }
  if(!activo) activo = keys[0]||'—';
  const calAct = al.calendario?.[activo];
  const restantes = remaining(calAct);
  const totalEnl = remainingFromActive(al);
  let html = `<div><strong>${al.nombre}</strong> — Código ${al.codigo}</div><div style="margin-top:8px">Mes activo: <b>${activo}</b></div>`;
  html += `<div>Clases restantes (mes): <span>${restantes}</span> · Total enlazado: <span>${totalEnl}</span></div>`;
  html += `<details style="margin-top:6px"><summary>Días mes activo</summary><ul>`;
  if(calAct){ calAct.dias.forEach(d=>{ const usado = (calAct.usados||[]).includes(d); html += `<li>${d} ${usado?'<small style="color:#f88">(perdida/usada)</small>':''}</li>` }); }
  html += `</ul></details>`;
  // meses futuros
  const other = keys.filter(k=>k!==activo);
  other.forEach(k=>{ const c=al.calendario[k]; html += `<div style="margin-top:8px;border-top:1px solid #222;padding-top:8px"><b>Próximo: ${k}</b> · clases: ${c.dias.length}<div style="margin-top:6px"><button class="editarMes" data-id="${al.id}" data-mk="${k}">Editar</button> <button class="borrarMes" data-id="${al.id}" data-mk="${k}">Eliminar</button></div></div>`; });
  html += `<div style="margin-top:8px"><button id="reagendarBtn" data-id="${al.id}">Reagendar (multi-mes)</button></div>`;
  panel.innerHTML = html;

  // attach handlers
  $('#reagendarBtn').addEventListener('click', ()=>{ reagendarMultiMes(al.id); });
  $$('.editarMes').forEach(b=> b.addEventListener('click', ()=>{ editarMes(b.dataset.id, b.dataset.mk); }));
  $$('.borrarMes').forEach(b=> b.addEventListener('click', ()=>{ eliminarMes(b.dataset.id, b.dataset.mk); }));
}

// editar/eliminar mes desde perfil
function editarMes(alId, mk){
  const al = state.alumnos.find(x=>x.id===alId); if(!al) return;
  const cal = al.calendario?.[mk]; if(!cal) return alert('No hay mes');
  // abrir calendario con bloque precargado
  $('#selAlumnoCal').value = al.id;
  $('#multiMes').innerHTML='';
  renderMesBlock($('#multiMes'), mk, cal.dias.length, cal.dias);
  // mostrar admin vista
  showAdmin();
}
function eliminarMes(alId,mk){
  const al = state.alumnos.find(x=>x.id===alId); if(!al) return;
  if(!confirm(`Eliminar mes ${mk} de ${al.nombre}?`)) return;
  delete al.calendario[mk];
  save(); renderLista(); mostrarPerfil(alId);
  alert('Mes eliminado');
}

// reagendar (abre calendarios para mes siguiente)
function reagendarMultiMes(alId){
  const al = state.alumnos.find(x=>x.id===alId); if(!al) return;
  const keys = Object.keys(al.calendario||{}).sort();
  const activo = keys.find(k=>remaining(al.calendario[k])>0) || keys[0] || new Date().toISOString().slice(0,7);
  const [y,m] = activo.split('-').map(n=>parseInt(n,10));
  const next = new Date(y,m-1,1); next.setMonth(next.getMonth()+1);
  const mkNext = next.toISOString().slice(0,7);
  $('#selAlumnoCal').value = al.id;
  $('#multiMes').innerHTML='';
  renderMesBlock($('#multiMes'), mkNext, 4);
  showAdmin();
}

// guardar calendario (colectado desde UI)
function guardarCalendarioUI(){
  try{
    const blocks = collectMultiMesBlocks();
    const id = $('#selAlumnoCal').value; if(!id) return alert('Selecciona alumno');
    const al = state.alumnos.find(x=>x.id===id);
    al.calendario = al.calendario||{};
    blocks.forEach(b=>{
      // preservar usados que todavía están en dias (si existían)
      const prev = al.calendario[b.mk] || {dias:[],usados:[]};
      const usados = (prev.usados||[]).filter(u=> b.dias.includes(u));
      al.calendario[b.mk] = { dias:b.dias, usados:usados };
    });
    save();
    alert('Calendario guardado');
    renderLista();
  }catch(e){ alert(e.message); }
}

// registro / editar alumno
async function handleFotoInput(input){
  const f = input.files && input.files[0]; if(!f) return null;
  return await new Promise((resolve)=>{
    const fr = new FileReader();
    fr.onload = ()=>{
      resolve(fr.result);
    };
    fr.readAsDataURL(f);
  });
}

async function guardarAlumnoForm(e){
  e.preventDefault();
  const id = $('#editId').value;
  const nombre = $('#alNombre').value.trim();
  const codigo = ($('#alCodigo').value||'').toString().replace(/\D/g,'').slice(0,4);
  if(!/^\d{4}$/.test(codigo)) return alert('Código debe ser 4 dígitos');
  const tel = $('#alTel').value.trim();
  const edad = parseInt($('#alEdad').value,10) || null;
  const fn = $('#alFN').value || null;
  const foto = await handleFotoInput($('#alFoto'));
  if(id){
    const al = state.alumnos.find(x=>x.id===id);
    // verificar código único
    if(state.alumnos.some(x=> x.codigo===codigo && x.id!==id)) return alert('Ese código ya existe');
    Object.assign(al,{nombre,codigo,telefono:tel,edad,fechaNac:fn});
    if(foto) al.fotoBase64 = foto;
  } else {
    if(state.alumnos.some(x=> x.codigo===codigo)) return alert('Ese código ya existe');
    const newAl = { id:uid(), nombre, codigo, telefono:tel, edad, fechaNac:fn, fotoBase64:foto||null, calendario:{} };
    state.alumnos.push(newAl);
  }
  save(); limpiarForm(); renderLista(); poblarSelect(); alert('Alumno guardado');
}

function limpiarForm(){
  $('#formAlumno').reset(); $('#editId').value=''; $('#alFoto').value='';
}

function poblarSelect(){
  const sel = $('#selAlumnoCal'); sel.innerHTML=''; sortAlumnos(state.alumnos).forEach(a=>{
    const o = document.createElement('option'); o.value = a.id; o.textContent = `${a.nombre||'—'} (${a.codigo||''})`; sel.appendChild(o);
  });
}

// export/import
function exportJSON(){
  const data = JSON.stringify(state,null,2);
  const blob = new Blob([data],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='respaldo_academia_nh_v17.json'; a.click(); URL.revokeObjectURL(url);
}
function importJSONFile(file){
  const fr = new FileReader();
  fr.onload = ()=>{ try{ const data = JSON.parse(fr.result); state.alumnos = data.alumnos||state.alumnos; state.config = Object.assign(state.config, data.config||{}); save(); renderLista(); poblarSelect(); alert('Importado'); }catch(e){ alert('Archivo inválido'); } };
  fr.readAsText(file);
}

// show/hide admin
function showAdmin(){ $('#vistaAdmin').style.display='block'; }
function hideAdmin(){ $('#vistaAdmin').style.display='none'; }

// Entrar alumno (acceso diario)
function entrarAlumno(){
  const pin = getPin();
  const res = $('#resultadoAlumno');
  res.innerHTML=''; res.style.display='block';
  const al = state.alumnos.find(x=>x.codigo===pin);
  const clear = ()=> setTimeout(()=>{ res.style.display='none'; setPin(''); },8000);
  if(!al){ speak('Acceso denegado'); res.textContent='Acceso denegado: código no encontrado'; return clear(); }
  // antes de evaluar expirar días pasados
  expirePastDays();
  const mk = new Date().toISOString().slice(0,7);
  const cal = al.calendario?.[mk];
  if(!cal){ speak('Acceso denegado'); res.textContent='Acceso denegado: no tiene clases asignadas este mes'; return clear(); }
  const hoy = todayISO();
  if(!(cal.dias||[]).includes(hoy) || (cal.usados||[]).includes(hoy)){ speak('Acceso denegado'); res.textContent='Acceso denegado: hoy no está disponible o ya fue usado'; return clear(); }
  // marcar usado
  cal.usados = cal.usados || []; cal.usados.push(hoy); cal.usados = Array.from(new Set(cal.usados));
  save();
  const restantesMes = remaining(cal);
  const totalEnl = remainingFromActive(al);
  res.innerHTML = `${al.nombre} — clases restantes mes: ${restantesMes} · total enlazado: ${totalEnl}`;
  speak('Acceso otorgado');
  if(totalEnl===1) toast(`⚠️ ${al.nombre} está en su última clase del paquete enlazado.`);
  clear();
}

// basic speech
function speak(text){
  if(!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const vs = speechSynthesis.getVoices();
  const prefer = state.config.voz ? vs.find(v=>v.name===state.config.voz) : null;
  const monica = vs.find(v=>/monic(a|á)/i.test(v.name||''));
  const es = vs.find(v=> (v.lang||'').toLowerCase().startsWith('es'));
  u.voice = prefer || monica || es || null;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

// toast
function toast(msg){ const d=document.createElement('div'); d.textContent=msg; d.style.position='fixed'; d.style.left='50%'; d.style.transform='translateX(-50%)'; d.style.bottom='18px'; d.style.background='#222'; d.style.color='#fff'; d.style.padding='8px 12px'; d.style.borderRadius='8px'; document.body.appendChild(d); setTimeout(()=>d.remove(),3800); }

// Init and wiring
function init(){
  load(); buildUI();
  // expire past days on load
  expirePastDays();
  // wiring buttons
  $('#btnModoAlumno').addEventListener('click', ()=>{ hideAdmin(); });
  $('#btnModoAdmin').addEventListener('click', ()=>{ showAdmin(); renderLista(); poblarSelect(); });
  $('#btnEntrarAlumno').addEventListener('click', entrarAlumno);
  $('#btnBorrarAlumno').addEventListener('click', ()=>setPin(''));
  $('#btnGuardarAl').addEventListener('click', guardarAlumnoForm);
  $('#btnNuevoAl').addEventListener('click', limpiarForm);
  $('#btnAddMes').addEventListener('click', ()=> renderMesBlock($('#multiMes'), new Date().toISOString().slice(0,7),4));
  $('#btnGuardarCal').addEventListener('click', guardarCalendarioUI);
  $('#btnExport').addEventListener('click', exportJSON);
  $('#btnImport').addEventListener('click', ()=>$('#fileImport').click());
  $('#fileImport').addEventListener('change', (e)=>{ const f=e.target.files[0]; if(f) importJSONFile(f); });
  $('#alCodigo').addEventListener('input', (e)=> e.target.value = (e.target.value||'').replace(/\D/g,'').slice(0,4));
  $('#cfgOrden').addEventListener('change', ()=>{ state.config.orden = $('#cfgOrden').value; save(); renderLista(); });
  // initial render
  renderLista(); poblarSelect();
  setPin('');
}
window.addEventListener('DOMContentLoaded', init);
window.expirePastDays = expirePastDays; // debug
})();