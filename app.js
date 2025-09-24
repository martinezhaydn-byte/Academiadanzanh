
/* app.js v17 - Full implementation
   Features:
   - Admin PIN (4 digits), unique student codes (4 digits)
   - Teclado numeric (no zoom), visible digits
   - Register students with photo, phone, dob
   - Calendar multi-month: assign days per month, packages 1-12
   - Months linked: counts total remaining from active month through future months
   - Re-schedule (reagendar) multi-month, edit/delete month from profile
   - Auto-expire past days (mark as used/lost) on open admin or profile
   - SpeechSynthesis: select/probe voices, prioritize "Mónica" if available
   - Export/Import JSON backup, PWA-ready (manifest + sw)
*/

const $ = (q, ctx=document) => ctx.querySelector(q);
const $$ = (q, ctx=document) => Array.from((ctx||document).querySelectorAll(q));
const LS_KEY = "academia_nh_v17_full";
const collator = new Intl.Collator('es', {sensitivity:'base'});

let state = { alumnos: [], config: { pinAdmin: "1234", voz: null, orden: "asc" } };

// --- Utilities ---
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function load(){ try{ const s = JSON.parse(localStorage.getItem(LS_KEY)||'{}'); state = Object.assign({alumnos:[], config:{pinAdmin:"1234",voz:null,orden:"asc"}}, s); state.alumnos = state.alumnos || []; }catch(e){ state={alumnos:[], config:{pinAdmin:"1234",voz:null,orden:"asc"}}; } }
function uid(){ return 'a'+Math.random().toString(36).slice(2,9); }
function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
function monthKey(dateStr){ return dateStr.slice(0,7); }
function remaining(cal){ return (cal?.dias||[]).filter(d=>!(cal.usados||[]).includes(d)).length; }
function remainingFromActive(al){
  const keys = Object.keys(al.calendario||{}).sort();
  let counting=false, sum=0;
  for(const k of keys){
    const rem = remaining(al.calendario[k]);
    if(rem>0 || counting){ counting=true; sum+=rem; }
  }
  return sum;
}

// --- Speech helpers ---
function getVoices(){ return speechSynthesis.getVoices().filter(v => (v.lang||'').toLowerCase().startsWith('es') || v.lang==='' ); }
function speak(text){
  if(!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const prefer = state.config.voz ? voices.find(v=>v.name===state.config.voz) : null;
  const monica = voices.find(v=>/monic(a|á)/i.test(v.name||''));
  const es = voices.find(v=> (v.lang||'').toLowerCase().startsWith('es'));
  u.voice = prefer || monica || es || null;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

// --- Auto-expire past days ---
function expirePastDays(){
  const hoy = todayISO();
  let changed=false;
  state.alumnos.forEach(al=>{
    if(!al.calendario) return;
    Object.keys(al.calendario).forEach(mk=>{
      const cal = al.calendario[mk];
      cal.usados = cal.usados || [];
      (cal.dias||[]).forEach(d=>{
        if(new Date(d) < new Date(hoy) && !cal.usados.includes(d)){
          cal.usados.push(d); changed=true;
        }
      });
      if(cal.usados && Array.isArray(cal.usados)){
        cal.usados = Array.from(new Set(cal.usados));
      }
    });
  });
  if(changed) save();
  return changed;
}

// --- UI wiring & rendering ---
function setPinDisplay(el, val){ el.dataset.val = val||''; el.textContent = (val||'').padEnd(4,'_').split('').join(' '); }
function getPinDisplay(el){ return el.dataset.val||''; }
function buildKeypad(container, type){ container.innerHTML=''; const keys=['1','2','3','4','5','6','7','8','9','0','⌫']; keys.forEach(k=>{ const b=document.createElement('button'); b.type='button'; b.textContent=k; b.addEventListener('click', ()=> onKey(type,k)); container.appendChild(b); }); }

function onKey(type, key){
  const el = (type==='admin')? $('#pinAdmin') : $('#pinAlumno');
  let cur = el.dataset.val||'';
  if(key==='⌫') cur = cur.slice(0,-1);
  else if(/^\d$/.test(key) && cur.length<4) cur += key;
  setPinDisplay(el, cur);
}

// --- App actions ---
function initUI(){
  // keypads
  buildKeypad($('#tecladoAlumno'), 'alumno');
  buildKeypad($('#tecladoAdmin'), 'admin');
  // buttons
  $('#btnModoAlumno').addEventListener('click', ()=> showView('alumno'));
  $('#btnModoAdmin').addEventListener('click', ()=> showView('adminLogin'));
  $('#btnEntrarAdmin').addEventListener('click', onEntrarAdmin);
  $('#btnEntrarAlumno').addEventListener('click', onEntrarAlumno);
  $('#btnBorrarAdmin').addEventListener('click', ()=> setPinDisplay($('#pinAdmin'),'') );
  $('#btnBorrarAlumno').addEventListener('click', ()=> setPinDisplay($('#pinAlumno'),'') );

  // Registro
  $('#btnNuevoAlumno').addEventListener('click', limpiarForm);
  $('#formAlumno').addEventListener('submit', onGuardarAlumno);
  $('#alFoto').addEventListener('change', onFotoSelect);

  // Lista/search
  $('#buscarAlumno').addEventListener('input', ()=> renderLista());
  $('#btnLimpiarBusqueda').addEventListener('click', ()=>{ $('#buscarAlumno').value=''; renderLista(); });

  // Calendario
  $('#btnAgregarMes').addEventListener('click', ()=> addMesBlock(null,4));
  $('#btnGuardarCalendario').addEventListener('click', guardarCalendarioMulti);
  $('#btnLimpiarCalendario').addEventListener('click', ()=> $('#multiMes').innerHTML='');

  // Config
  $('#btnGuardarConfig').addEventListener('click', onGuardarConfig);
  $('#btnExportar').addEventListener('click', onExportar);
  $('#btnImportar').addEventListener('click', ()=> $('#fileImportar').click());
  $('#fileImportar').addEventListener('change', onImportFile);

  // Install prompt
  window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); $('#btnInstalar').classList.remove('oculto'); window.deferredPrompt = e; });
  $('#btnInstalar').addEventListener('click', async ()=>{ if(window.deferredPrompt){ window.deferredPrompt.prompt(); await window.deferredPrompt.userChoice; window.deferredPrompt=null; $('#btnInstalar').classList.add('oculto'); } });

  // render voices
  renderVocesList();

  // tabs
  $$('.tabs .tab').forEach(t=> t.addEventListener('click', ()=>{ $$('.tabs .tab').forEach(x=>x.classList.remove('activo')); t.classList.add('activo'); $$('.tab-content').forEach(c=>c.classList.add('oculto')); $('#tab-'+t.dataset.tab).classList.remove('oculto'); }));

  // initial values
  setPinDisplay($('#pinAdmin'),''); setPinDisplay($('#pinAlumno'),''); renderLista(); poblarSelectAlumnos(); applyConfigToUI();
}

function showView(v){
  $$('.vista').forEach(x=>x.classList.remove('activa'));
  if(v==='alumno') $('#vistaAlumno').classList.add('activa');
  else if(v==='adminLogin') $('#vistaAdminLogin').classList.add('activa');
  else if(v==='admin') { $('#vistaAdmin').classList.add('activa'); renderLista(); poblarSelectAlumnos(); }
}

// --- Admin login ---
function onEntrarAdmin(){
  const pin = getPinDisplay($('#pinAdmin'));
  if(pin === (state.config.pinAdmin||'1234')){ setPinDisplay($('#pinAdmin'),''); showView('admin'); expirePastDays(); }
  else alert('PIN incorrecto');
}

// --- Alumno entrada ---
function onEntrarAlumno(){
  const pin = getPinDisplay($('#pinAlumno'));
  const res = $('#resultadoAlumno'); res.classList.remove('oculto'); res.className='resultado';
  const clear = ()=> setTimeout(()=>{ res.classList.add('oculto'); setPinDisplay($('#pinAlumno'),''); $('#previewFotoAlumno').src=''; },8000);
  const al = state.alumnos.find(x=> x.codigo === pin);
  if(!al){ speak('Acceso denegado'); res.textContent='Acceso denegado: código no encontrado.'; res.classList.add('err'); return clear(); }
  // expire past before checking
  expirePastDays();
  $('#previewFotoAlumno').src = al.fotoBase64||'';
  const mk = new Date().toISOString().slice(0,7);
  const cal = al.calendario?.[mk];
  if(!cal){ speak('Acceso denegado'); res.textContent='Acceso denegado: no tiene calendario asignado este mes.'; res.classList.add('err'); return clear(); }
  const hoy = todayISO();
  if(!(cal.dias||[]).includes(hoy) || (cal.usados||[]).includes(hoy)){ speak('Acceso denegado'); res.textContent='Acceso denegado: hoy no está disponible o ya fue usado.'; res.classList.add('err'); return clear(); }
  cal.usados = cal.usados || []; cal.usados.push(hoy); cal.usados = Array.from(new Set(cal.usados));
  save();
  const restantesMes = remaining(cal);
  const totalEnl = remainingFromActive(al);
  res.innerHTML = `<div class="okbox"><img src="${al.fotoBase64||''}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;margin-right:8px"/> <div><strong>${al.nombre}</strong><br/>Clases restantes mes: <span class="badge">${restantesMes}</span> · Total enlazado: <span class="badge">${totalEnl}</span></div></div>`;
  res.classList.add('ok'); speak('Acceso otorgado'); if(totalEnl===1) showToast(`⚠️ ${al.nombre} está en su última clase del paquete enlazado.`); clear();
}

// --- Form: photo handling ---
function onFotoSelect(e){
  const f = e.target.files?.[0]; if(!f) return;
  const fr = new FileReader(); fr.onload = ()=>{ $('#formAlumno').dataset.foto = fr.result; }; fr.readAsDataURL(f);
}

// --- Guardar alumno ---
function onGuardarAlumno(e){
  e.preventDefault();
  const editId = $('#formAlumno').dataset.editId||'';
  const nombre = $('#alNombre').value.trim();
  const codigo = ($('#alCodigo').value||'').replace(/\D/g,'').slice(0,4);
  if(!/^\d{4}$/.test(codigo)){ alert('Código debe ser 4 dígitos'); return; }
  const telefono = $('#alTelefono').value.trim();
  const edad = parseInt($('#alEdad').value,10) || null;
  const fechaNac = $('#alFechaNac').value || null;
  const foto = $('#formAlumno').dataset.foto || null;

  if(editId){
    const existing = state.alumnos.find(a=>a.id===editId);
    if(state.alumnos.some(a=> a.codigo===codigo && a.id!==editId)){ alert('Ese código ya existe'); return; }
    Object.assign(existing,{nombre,codigo,telefono,edad,fechaNac});
    if(foto) existing.fotoBase64 = foto;
  } else {
    if(state.alumnos.some(a=>a.codigo===codigo)){ alert('Ese código ya existe'); return; }
    const newAl = { id: uid(), nombre, codigo, telefono, edad, fechaNac, fotoBase64: foto||null, calendario: {} };
    state.alumnos.push(newAl);
  }
  save(); limpiarForm(); renderLista(); poblarSelectAlumnos(); alert('Alumno guardado.');
}

function limpiarForm(){
  $('#formAlumno').reset(); $('#formAlumno').dataset.editId=''; $('#formAlumno').dataset.foto=''; $('#alFoto').value='';
}

// --- Render list & profile ---
function orderedAlumnos(){ const arr = (state.alumnos||[]).slice(); arr.sort((a,b)=> collator.compare(a.nombre||'', b.nombre||'')); if(state.config.orden==='desc') arr.reverse(); return arr; }
function renderLista(){
  const ul = $('#listaAlumnos'); ul.innerHTML='';
  const filter = ($('#buscarAlumno').value||'').toLowerCase().trim();
  orderedAlumnos().forEach(a=>{
    if(filter && !(a.nombre||'').toLowerCase().includes(filter) && !(a.codigo||'').includes(filter)) return;
    const li = document.createElement('li'); li.className='item';
    li.innerHTML = `<div><strong>${a.nombre}</strong><div style="font-size:12px;color:#aaa">Código ${a.codigo} · ${a.telefono||'—'}</div></div><div style="display:flex;gap:6px"><button class="btnEdit" data-id="${a.id}">Editar</button><button class="btnDel" data-id="${a.id}">Borrar</button><button class="btnPerfil" data-id="${a.id}">Perfil</button></div>`;
    ul.appendChild(li);
  });
  $$('.btnEdit').forEach(b=> b.addEventListener('click', ()=> editarAlumno(b.dataset.id)));
  $$('.btnDel').forEach(b=> b.addEventListener('click', ()=> borrarAlumno(b.dataset.id)));
  $$('.btnPerfil').forEach(b=> b.addEventListener('click', ()=> togglePerfil(b.dataset.id)));
}

function editarAlumno(id){
  const a = state.alumnos.find(x=>x.id===id); if(!a) return;
  $('#alNombre').value = a.nombre||''; $('#alCodigo').value = a.codigo||''; $('#alTelefono').value = a.telefono||'';
  $('#alEdad').value = a.edad||''; $('#alFechaNac').value = a.fechaNac||'';
  $('#formAlumno').dataset.editId = a.id; $('#formAlumno').dataset.foto = a.fotoBase64||'';
  // switch to registro tab
  $$('.tabs .tab').forEach(t=>t.classList.remove('activo')); $$('.tabs .tab[data-tab="registro"]')[0].classList.add('activo'); $$('.tab-content').forEach(c=>c.classList.add('oculto')); $('#tab-registro').classList.remove('oculto');
}

function borrarAlumno(id){
  if(!confirm('¿Eliminar alumno?')) return;
  state.alumnos = state.alumnos.filter(a=> a.id!==id); save(); renderLista(); poblarSelectAlumnos(); if($('#panelPerfil').classList.contains('oculto')===false) $('#panelPerfil').classList.add('oculto');
}

function togglePerfil(id){
  if(state.uiPerfilOpenId === id){ state.uiPerfilOpenId = ''; $('#panelPerfil').classList.add('oculto'); return; }
  state.uiPerfilOpenId = id; mostrarPerfil(id);
}

function mostrarPerfil(id){
  expirePastDays();
  const a = state.alumnos.find(x=>x.id===id); if(!a) return;
  $('#panelPerfil').classList.remove('oculto');
  const keys = Object.keys(a.calendario||{}).sort();
  let activo = null; for(const k of keys){ if(remaining(a.calendario[k])>0){ activo = k; break; } }
  if(!activo) activo = keys[0] || '—';
  const calAct = a.calendario?.[activo];
  const restantesAct = remaining(calAct);
  const totalEnl = remainingFromActive(a);
  let html = `<div style="display:flex;gap:8px;align-items:center"><img src="${a.fotoBase64||''}" style="width:64px;height:64px;border-radius:50%;object-fit:cover"/><div><strong>${a.nombre}</strong><br/>Código ${a.codigo} · ${a.telefono||'—'}</div></div>`;
  html += `<div style="margin-top:8px">Mes activo: <strong>${activo}</strong></div>`;
  html += `<div>Clases restantes (mes): <span class="badge">${restantesAct}</span> · Total enlazado: <span class="badge">${totalEnl}</span></div>`;
  html += `<details style="margin-top:6px"><summary>Días mes activo</summary><ul>`;
  if(calAct){ calAct.dias.forEach(d=>{ const usado = (calAct.usados||[]).includes(d); html+=`<li>${d} ${usado?'<small style="color:#f88">(perdida/usada)</small>':''}</li>`; }); }
  html += `</ul></details>`;
  // future months with edit/delete buttons
  const other = keys.filter(k=>k!==activo);
  other.forEach(k=>{ const c = a.calendario[k]; html += `<div style="margin-top:8px;border-top:1px solid #222;padding-top:8px"><strong>Mes: ${k}</strong> · Clases: ${c.dias.length}<div style="margin-top:6px"><button class="editMes" data-id="${a.id}" data-mk="${k}">Editar</button> <button class="delMes" data-id="${a.id}" data-mk="${k}">Eliminar</button></div></div>`; });
  html += `<div style="margin-top:8px"><button id="reagendarBtn" data-id="${a.id}">Reagendar</button></div>`;
  $('#perfilContenido').innerHTML = html;
  $('#reagendarBtn').addEventListener('click', ()=> reagendarMultiMes(a.id));
  $$('.editMes').forEach(b=> b.addEventListener('click', ()=> editarMes(b.dataset.id, b.dataset.mk)));
  $$('.delMes').forEach(b=> b.addEventListener('click', ()=> eliminarMes(b.dataset.id, b.dataset.mk)));
}

// --- Edit/Delete month actions ---
function editarMes(alId, mk){
  const al = state.alumnos.find(x=>x.id===alId); if(!al) return alert('Alumno no encontrado');
  const cal = al.calendario[mk]; if(!cal) return alert('Mes no encontrado');
  $('#selAlumnoCalendario').value = al.id;
  $('#multiMes').innerHTML = '';
  addMesBlock(mk, cal.dias.length, cal.dias);
  // switch to calendario tab
  $$('.tabs .tab').forEach(t=>t.classList.remove('activo')); $$('.tabs .tab[data-tab="calendario"]')[0].classList.add('activo'); $$('.tab-content').forEach(c=>c.classList.add('oculto')); $('#tab-calendario').classList.remove('oculto');
}

function eliminarMes(alId, mk){
  const al = state.alumnos.find(x=>x.id===alId); if(!al) return;
  if(!confirm(`Eliminar mes ${mk} de ${al.nombre}?`)) return;
  delete al.calendario[mk]; save(); renderLista(); mostrarPerfil(alId); alert('Mes eliminado');
}

// --- Reagendar ---
function reagendarMultiMes(alId){
  const al = state.alumnos.find(x=>x.id===alId); if(!al) return;
  const keys = Object.keys(al.calendario||{}).sort();
  const activo = keys.find(k=> remaining(al.calendario[k])>0) || keys[0] || new Date().toISOString().slice(0,7);
  const [y,m] = activo.split('-').map(n=>parseInt(n,10));
  const d = new Date(y,m-1,1); d.setMonth(d.getMonth()+1);
  const mkNext = d.toISOString().slice(0,7);
  $('#selAlumnoCalendario').value = al.id; $('#multiMes').innerHTML=''; addMesBlock(mkNext, 4);
  // switch to calendario tab
  $$('.tabs .tab').forEach(t=>t.classList.remove('activo')); $$('.tabs .tab[data-tab="calendario"]')[0].classList.add('activo'); $$('.tab-content').forEach(c=>c.classList.add('oculto')); $('#tab-calendario').classList.remove('oculto');
}

// --- Calendar: add block ---
function addMesBlock(defaultMonth=null, defaultPack=4, preDays=null){
  const wrap = document.createElement('div'); wrap.className='mes-block';
  const mk = defaultMonth || new Date().toISOString().slice(0,7);
  wrap.innerHTML = `<div class="mes-head"><label>Mes <input type="month" class="mesInput" value="${mk}"></label><label>Paquete <select class="packInput">${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label></div><div class="mes-grid"></div><div class="mes-actions"><button class="btnQuitar">Quitar</button></div>`;
  $('#multiMes').appendChild(wrap);
  const grid = wrap.querySelector('.mes-grid'); const mesInput = wrap.querySelector('.mesInput'); const packInput = wrap.querySelector('.packInput');
  packInput.value = String(defaultPack);
  function renderGrid(){
    grid.innerHTML=''; const [y,m] = mesInput.value.split('-').map(n=>parseInt(n,10)); const first = new Date(y,m-1,1); const days = new Date(y,m,0).getDate();
    ['L','M','X','J','V','S','D'].forEach(h=>{ const el=document.createElement('div'); el.textContent=h; el.style.opacity=.6; grid.appendChild(el); });
    const start = (first.getDay()+6)%7; for(let i=0;i<start;i++){ const v=document.createElement('div'); v.style.visibility='hidden'; grid.appendChild(v); }
    for(let d=1; d<=days; d++){ const btn=document.createElement('button'); btn.type='button'; btn.className='dia'; btn.textContent=d; btn.dataset.full = `${mesInput.value}-${String(d).padStart(2,'0')}`; btn.addEventListener('click', ()=>{ btn.classList.toggle('activo'); enforcePack(); }); grid.appendChild(btn); }
    if(Array.isArray(preDays)){ preDays.forEach(pd=>{ const b = Array.from(grid.querySelectorAll('.dia')).find(x=>x.dataset.full===pd); if(b) b.classList.add('activo'); }); }
    enforcePack();
  }
  function enforcePack(){ const pack = parseInt(packInput.value,10); const activos = Array.from(grid.querySelectorAll('.dia.activo')); while(activos.length > pack) activos.pop().classList.remove('activo'); }
  mesInput.addEventListener('change', renderGrid); packInput.addEventListener('change', enforcePack);
  wrap.querySelector('.btnQuitar').addEventListener('click', ()=> wrap.remove());
  renderGrid(); return wrap;
}

function collectMesBlocks(){
  const blocks = $$('.mes-block'); const result = []; for(const b of blocks){ const mk = b.querySelector('.mesInput').value; const pack = parseInt(b.querySelector('.packInput').value,10); const dias = Array.from(b.querySelectorAll('.dia.activo')).map(x=>x.dataset.full); if(dias.length !== pack) throw new Error(`En ${mk} selecciona exactamente ${pack} día(s)`); result.push({mk,dias}); } return result;
}

function guardarCalendarioMulti(){
  const selId = $('#selAlumnoCalendario').value; if(!selId) return alert('Selecciona un alumno');
  let blocks;
  try{ blocks = collectMesBlocks(); }catch(e){ return alert(e.message); }
  const al = state.alumnos.find(x=>x.id===selId); if(!al) return;
  al.calendario = al.calendario || {};
  blocks.forEach(b=>{ const prev = al.calendario[b.mk] || {dias:[],usados:[]}; const usados = (prev.usados||[]).filter(u=> b.dias.includes(u)); al.calendario[b.mk] = { dias: b.dias, usados: usados }; });
  save(); alert('Calendario guardado'); renderLista();
}

// --- Export/Import ---
function onExportar(){ const data = JSON.stringify(state,null,2); const blob = new Blob([data],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='respaldo_academia_nh_v17.json'; a.click(); URL.revokeObjectURL(url); }
function onImportFile(e){ const f = e.target.files && e.target.files[0]; if(!f) return; const fr = new FileReader(); fr.onload = ()=>{ try{ const d = JSON.parse(fr.result); state.alumnos = d.alumnos || state.alumnos; state.config = Object.assign(state.config, d.config||{}); save(); renderLista(); poblarSelectAlumnos(); alert('Importado'); }catch(_) { alert('Archivo inválido'); } }; fr.readAsText(f); }

// --- voices ---
function renderVocesList(){
  const cont = $('#listaVoces'); cont.innerHTML = '';
  const vs = getVoices();
  if(!vs.length) { cont.innerHTML = '<div class="hint">No se detectaron voces en español en este dispositivo.</div>'; return; }
  vs.sort((a,b)=> collator.compare(a.name||'', b.name||''));
  vs.forEach(v=>{
    const card = document.createElement('div'); card.className='voicecard'; card.innerHTML = `<div><strong>${v.name}</strong> <span class="badge">${v.lang}</span></div><div style="margin-top:6px"><button class="probar">Probar</button> <button class="seleccionar">Seleccionar</button></div>`;
    card.querySelector('.probar').addEventListener('click', ()=>{ const u=new SpeechSynthesisUtterance('Prueba de voz: acceso otorgado.'); u.voice=v; speechSynthesis.cancel(); speechSynthesis.speak(u); });
    card.querySelector('.seleccionar').addEventListener('click', ()=>{ state.config.voz = v.name; save(); alert('Voz seleccionada: '+v.name); });
    cont.appendChild(card);
  });
}

// --- helpers ---
function poblarSelectAlumnos(){ const sel = $('#selAlumnoCalendario'); sel.innerHTML = ''; orderedAlumnos().forEach(a=>{ const o = document.createElement('option'); o.value = a.id; o.textContent = `${a.nombre} (${a.codigo})`; sel.appendChild(o); }); }
function orderedAlumnos(){ const arr = (state.alumnos||[]).slice().sort((a,b)=> collator.compare(a.nombre||'', b.nombre||'')); if(state.config.orden==='desc') arr.reverse(); return arr; }
function editarMes(alId,mk){ /* placeholder in case called externally */ }

// --- small utilities ---
function showToast(msg){ const t = document.createElement('div'); t.textContent = msg; t.className='toast'; document.body.appendChild(t); setTimeout(()=> t.remove(),3800); }
function applyConfigToUI(){ if($('#cfgPin')) $('#cfgPin').value = state.config.pinAdmin || '1234'; if($('#cfgOrden')) $('#cfgOrden').value = state.config.orden || 'asc'; renderVocesList(); }

function onGuardarConfig(){ const p = ($('#cfgPin').value||'').toString().replace(/\D/g,'').slice(0,4); if(!/^\d{4}$/.test(p)){ alert('PIN debe ser 4 dígitos'); return; } state.config.pinAdmin = p; state.config.orden = $('#cfgOrden').value || 'asc'; save(); renderLista(); alert('Configuración guardada'); }

// --- init ---
function init(){ load(); initUI(); expirePastDays(); // expire on load
  // service worker register if supported
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
  // wire config save
  $('#btnGuardarConfig')?.addEventListener('click', onGuardarConfig);
  $('#cfgVoz') && renderVocesList();
  poblarSelectAlumnos();
}
window.addEventListener('DOMContentLoaded', init);
