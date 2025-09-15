/* v16: Meses enlazados -> aviso de última clase considerando todo el paquete (activo + futuros)
   + contador total enlazado en el Perfil */
const $ = (q,ctx=document)=>ctx.querySelector(q);
const $$ = (q,ctx=document)=>Array.from(ctx.querySelectorAll(q));
const collator = new Intl.Collator('es', {sensitivity:'base', numeric:false});
const state = { alumnos: [], config: { pinAdmin: "1234", voz: null, orden: "asc" }, voces: [], uiPerfilOpenId: "", filtro: "" };
const LS_KEY = "academia_nh_app_v1";

function save(){ localStorage.setItem(LS_KEY, JSON.stringify({alumnos:state.alumnos, config:state.config})); }
function load(){
  const raw = localStorage.getItem(LS_KEY);
  if (raw){
    try{
      const data = JSON.parse(raw);
      state.alumnos = data.alumnos||[];
      state.config = Object.assign({pinAdmin:"1234", voz:null, orden:"asc"}, data.config||{});
      state.alumnos.forEach(a=> a.codigo = sanitizeCode(a.codigo));
      state.config.pinAdmin = sanitizeCode(state.config.pinAdmin);
    }catch(e){console.warn(e);}
  }
}
function uid(){ return "a"+Math.random().toString(36).slice(2,9); }
function fmtDate(d){ return d.toISOString().slice(0,10); }
function sanitizeCode(s){ return (s||"").toString().normalize("NFKC").replace(/\D+/g,"").slice(0,4); }
function norm(s){ return (s||"").toString().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim(); }
function today(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function remaining(cal){ return (cal?.dias||[]).filter(d=>!(cal.usados||[]).includes(d)).length; }
function remainingFromActive(a){
  const keys = Object.keys(a.calendario||{}).sort();
  let sum=0;
  for (const k of keys){
    const rem = remaining(a.calendario[k]);
    if (rem>0 || sum>0){ // empieza a contar desde el primer mes con >0 hasta el final
      sum += rem;
    }
  }
  return sum;
}

function speak(text){
  if(!("speechSynthesis" in window)) return;
  const u=new SpeechSynthesisUtterance(text);
  const vs=speechSynthesis.getVoices();
  const prefer=state.config.voz ? vs.find(v=>v.name===state.config.voz) : null;
  const monica=vs.find(v=>/monic(a|á)/i.test(v.name||""));
  const es=vs.find(v=>(v.lang||"").toLowerCase().startsWith("es"));
  u.voice = prefer || monica || es || null;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

let deferredPrompt=null;
if ("serviceWorker" in navigator){ window.addEventListener("load", ()=>{ navigator.serviceWorker.register("sw.js"); }); }
window.addEventListener("beforeinstallprompt", (e)=>{ e.preventDefault(); deferredPrompt=e; $("#btnInstalar").classList.remove("oculto"); });
$("#btnInstalar")?.addEventListener("click", async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $("#btnInstalar").classList.add("oculto"); });

document.addEventListener("DOMContentLoaded", init);
load();
function init(){
  construirTeclado($("#vistaAlumno .teclado"), "alumno");
  construirTeclado($("#tecladoAdmin"), "admin");
  $$(".tabs .tab").forEach(btn=>btn.addEventListener("click", ()=>{
    $$(".tabs .tab").forEach(b=>b.classList.remove("activo"));
    btn.classList.add("activo");
    const tab = btn.dataset.tab;
    $$(".tab-content").forEach(t=>t.classList.add("oculto"));
    $("#tab-"+tab).classList.remove("oculto");
  }));
  $("#btnModoAlumno").addEventListener("click", ()=>mostrarVista("alumno"));
  $("#btnModoAdmin").addEventListener("click", ()=>mostrarVista("adminLogin"));
  $("#btnEntrarAlumno").addEventListener("click", onEntrarAlumno);
  $("#btnBorrarAlumno").addEventListener("click", ()=>setPinDisplay("alumno",""));
  $("#btnEntrarAdmin").addEventListener("click", onEntrarAdmin);
  $("#btnBorrarAdmin").addEventListener("click", ()=>setPinDisplay("admin",""));
  $("#btnNuevoAlumno").addEventListener("click", limpiarForm);
  $("#formAlumno").addEventListener("submit", onGuardarAlumno);
  $("#alFoto").addEventListener("change", onFotoSelect);
  $("#alCodigo").addEventListener("input", (e)=>{ const c=sanitizeCode(e.target.value); if(e.target.value!==c) e.target.value=c; });
  $("#buscarAlumno").addEventListener("input", (e)=>{ state.filtro=e.target.value; renderLista(); });
  $("#btnLimpiarBusqueda").addEventListener("click", ()=>{ state.filtro=""; $("#buscarAlumno").value=""; renderLista(); });
  renderLista();
  renderConfig();
  $("#btnGuardarConfig").addEventListener("click", onGuardarConfig);
  $("#btnExportar").addEventListener("click", onExportar);
  $("#btnImportar").addEventListener("click", ()=>$("#fileImportar").click());
  $("#fileImportar").addEventListener("change", onImportarArchivo);
  $("#cfgPin").addEventListener("input", (e)=>{ const c=sanitizeCode(e.target.value); if(e.target.value!==c) e.target.value=c; });
  poblarSelectAlumnos($("#selAlumnoCalendario"));
  $("#btnAgregarMes").addEventListener("click", ()=>addMesBlock());
  $("#btnLimpiarCalendario").addEventListener("click", ()=>{ $("#multiMes").innerHTML=""; });
  $("#btnGuardarCalendario").addEventListener("click", guardarCalendarioMulti);
  addMesBlock();
  mostrarVista("alumno");
}

function mostrarVista(which){
  $$(".vista").forEach(v=>v.classList.remove("activa"));
  if (which==="alumno") $("#vistaAlumno").classList.add("activa");
  else if (which==="adminLogin") $("#vistaAdminLogin").classList.add("activa");
  else if (which==="admin") $("#vistaAdmin").classList.add("activa");
}
function construirTeclado(container, tipo){
  container.innerHTML=""; const nums=["1","2","3","4","5","6","7","8","9","","0","⌫"];
  nums.forEach(n=>{ const b=document.createElement("button"); b.type="button";
    if(n===""){ b.className="ghost"; b.disabled=true; b.textContent=" "; }
    else { b.textContent=n; b.addEventListener("click",()=>onKey(tipo,n)); }
    container.appendChild(b);
  });
}
function onKey(tipo, key){ const cur=getPinDisplay(tipo); if(key==="⌫") setPinDisplay(tipo,cur.slice(0,-1)); else if(/^\d$/.test(key)&&cur.length<4) setPinDisplay(tipo,cur+key); }
function getPinDisplay(tipo){ const el=(tipo==="alumno")?$("#pinAlumno"):$("#pinAdmin"); return el.dataset.val||""; }
function setPinDisplay(tipo, val){ const el=(tipo==="alumno")?$("#pinAlumno"):$("#pinAdmin"); el.dataset.val=val; el.textContent=(val+"____").slice(0,4).split("").join(""); }

function toast(msg){
  const t=document.createElement("div"); t.className="toast"; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{ t.remove(); }, 3500);
}

function onEntrarAdmin(){ const pin=getPinDisplay("admin"); if(pin===state.config.pinAdmin){ mostrarVista("admin"); setPinDisplay("admin",""); } else alert("PIN incorrecto"); }
function onEntrarAlumno(){
  const pin=getPinDisplay("alumno"); const res=$("#resultadoAlumno"); res.classList.remove("oculto","ok","err");
  const alumno=state.alumnos.find(a=>a.codigo===pin); const preview=$("#previewFotoAlumno");
  const clear=()=>setTimeout(()=>{ res.classList.add("oculto"); setPinDisplay("alumno",""); if(preview) preview.src=""; },8000);
  if(!alumno){ speak("Acceso denegado"); res.textContent="Acceso denegado: código no encontrado."; res.classList.add("err"); return clear(); }
  preview.src=alumno.fotoBase64||"";
  const mk=new Date().toISOString().slice(0,7); const cal=alumno.calendario?.[mk];
  if(!cal){ speak("Acceso denegado"); res.textContent="Acceso denegado: no tiene calendario asignado este mes."; res.classList.add("err"); return clear(); }
  const hoyStr=fmtDate(today()); const puedeHoy=(cal.dias||[]).includes(hoyStr) && !(cal.usados||[]).includes(hoyStr);
  if(!puedeHoy){ speak("Acceso denegado"); res.textContent="Acceso denegado: hoy no está en sus días permitidos o ya fue usado."; res.classList.add("err"); return clear(); }
  cal.usados=cal.usados||[]; cal.usados.push(hoyStr);
  const restantesMes=remaining(cal);
  const totalEnlazado = remainingFromActive(alumno); // suma activo + futuros
  res.innerHTML=`<div class="okbox">${alumno.fotoBase64?`<img src="${alumno.fotoBase64}" alt="foto"/>`:""}<div><strong>${alumno.nombre}</strong><br/>Clases restantes este mes: <span class="badge">${restantesMes}</span> · Total enlazado: <span class="badge">${totalEnlazado}</span></div></div>`;
  res.classList.add("ok"); speak("Acceso otorgado"); save();
  if (totalEnlazado===1){ toast(`⚠️ ${alumno.nombre} está en su última clase del paquete enlazado.`); }
  clear();
}

// ---- Registro
function limpiarForm(){ $("#formAlumno").reset(); $("#formAlumno").dataset.editId=""; $("#formAlumno").dataset.fotoBase64=""; }
async function onFotoSelect(e){
  const f=e.target.files?.[0]; if(!f) return;
  try{
    const base64=await compressFileToBase64(f,300,0.72);
    $("#formAlumno").dataset.fotoBase64=base64;
  }catch(err){ console.warn("Error foto:",err); }
}
function compressFileToBase64(file, maxSize=300, quality=0.72){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        let w=img.width,h=img.height;
        if(w>h){ if(w>maxSize){ h=Math.round(h*maxSize/w); w=maxSize; } }
        else { if(h>maxSize){ w=Math.round(w*maxSize/h); h=maxSize; } }
        const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror=reject; img.src=fr.result;
    };
    fr.onerror=reject; fr.readAsDataURL(file);
  });
}
function onGuardarAlumno(e){
  e.preventDefault();
  const f=$("#formAlumno");
  const data={
    nombre: $("#alNombre").value.trim(),
    codigo: sanitizeCode($("#alCodigo").value),
    telefono: $("#alTelefono").value.trim(),
    edad: parseInt($("#alEdad").value||"0",10)||null,
    fechaNac: $("#alFechaNac").value||null,
    fotoBase64: f.dataset.fotoBase64||null
  };
  if(!/^\d{4}$/.test(data.codigo)){ alert("El código debe ser exactamente 4 dígitos."); return; }
  if (f.dataset.editId){
    const taken = state.alumnos.some(a=> a.codigo===data.codigo && a.id!==f.dataset.editId);
    if(taken){ alert("Ese código ya existe."); return; }
    const idx=state.alumnos.findIndex(a=>a.id===f.dataset.editId);
    if(idx>=0) state.alumnos[idx]=Object.assign({}, state.alumnos[idx], data);
  } else {
    if(state.alumnos.some(a=>a.codigo===data.codigo)){ alert("Ese código ya existe."); return; }
    data.id=uid(); data.calendario={}; state.alumnos.push(data);
  }
  save(); limpiarForm(); renderLista(); poblarSelectAlumnos($("#selAlumnoCalendario"));
  alert("Alumno guardado.");
}

// ---- Lista / Perfil
function orderedAlumnos(){ const arr=state.alumnos.slice().sort((a,b)=>collator.compare(a.nombre||"", b.nombre||"")); return (state.config.orden==="desc")?arr.reverse():arr; }
function filteredAlumnos(){ const f=norm(state.filtro); if(!f) return orderedAlumnos(); return orderedAlumnos().filter(a=>norm(a.nombre).includes(f)||norm(a.codigo).includes(f)); }
function renderLista(){
  const ul=$("#listaAlumnos"); ul.innerHTML="";
  filteredAlumnos().forEach(a=>{
    const li=document.createElement("li"); li.className="item";
    li.innerHTML=`<div class="nombre"><img src="${a.fotoBase64||""}" alt="foto"/><div><strong>${a.nombre}</strong><div class="muted">Código ${a.codigo} · ${a.telefono||"s/tel"}</div></div></div>
                  <div>${a.codigo}</div>
                  <button class="ghost btnEdit">Editar</button>
                  <button class="btnDel" style="background:var(--danger)">Borrar</button>
                  <button class="secondary btnPerfil">Perfil</button>`;
    li.querySelector(".btnEdit").addEventListener("click",()=>editarAlumno(a.id));
    li.querySelector(".btnDel").addEventListener("click",()=>borrarAlumno(a.id));
    li.querySelector(".btnPerfil").addEventListener("click",()=>togglePerfil(a.id));
    ul.appendChild(li);
  });
}
function editarAlumno(id){
  const a=state.alumnos.find(x=>x.id===id); if(!a) return;
  $("#alNombre").value=a.nombre||""; $("#alCodigo").value=a.codigo||""; $("#alTelefono").value=a.telefono||"";
  $("#alEdad").value=a.edad||""; $("#alFechaNac").value=a.fechaNac||"";
  $("#formAlumno").dataset.editId=a.id; $("#formAlumno").dataset.fotoBase64=a.fotoBase64||"";
  $$(".tabs .tab").forEach(b=>b.classList.remove("activo"));
  $$(`.tabs .tab[data-tab="registro"]`)[0].classList.add("activo");
  $$(".tab-content").forEach(t=>t.classList.add("oculto")); $("#tab-registro").classList.remove("oculto");
}
function borrarAlumno(id){
  if(!confirm("¿Eliminar alumno?")) return;
  state.alumnos = state.alumnos.filter(a=>a.id!==id);
  save(); renderLista(); poblarSelectAlumnos($("#selAlumnoCalendario"));
  if (state.uiPerfilOpenId===id){ ocultarPerfil(); }
}
function togglePerfil(id){ if(state.uiPerfilOpenId===id){ ocultarPerfil(); } else { state.uiPerfilOpenId=id; mostrarPerfil(id); } }
function ocultarPerfil(){ state.uiPerfilOpenId=""; $("#panelPerfil").classList.add("oculto"); $("#perfilContenido").innerHTML="Selecciona un alumno para ver su perfil."; }

function mostrarPerfil(id){
  const a=state.alumnos.find(x=>x.id===id); if(!a) return;
  const keys = Object.keys(a.calendario||{}).sort();
  let activoKey = null;
  for (const k of keys){
    if (remaining(a.calendario[k])>0){ activoKey = k; break; }
  }
  if (!activoKey) activoKey = keys[0] || "—";
  const calAct = a.calendario?.[activoKey];
  const restantesAct = remaining(calAct);
  const totalEnlazado = remainingFromActive(a);
  const diasHtmlAct = calAct ? calAct.dias.map(d=>{
    const usado = (calAct.usados||[]).includes(d);
    return `<li>${d} ${usado?"<span class='badge'>usado</span>":""}</li>`;
  }).join("") : "<li>Sin calendario activo.</li>";

  const otherKeys = keys.filter(k=>k!==activoKey);
  let proximosHtml = "";
  if (otherKeys.length){
    proximosHtml = otherKeys.map(k=>{
      const c = a.calendario[k];
      const dias = (c?.dias||[]).map(d=>`<li>${d}</li>`).join("");
      return `<div class="section">
        <h5>Próximo mes: <span class="badge">${k}</span> · Clases totales: <span class="badge">${c?.dias?.length||0}</span></h5>
        <details style="margin-top:6px"><summary>Ver días</summary><ul>${dias}</ul></details>
      </div>`;
    }).join("");
  }

  const foto = a.fotoBase64 ? `<img src="${a.fotoBase64}" alt="foto" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid #222;margin-right:10px"/>` : "";
  $("#perfilContenido").innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">${foto}
      <div><strong>${a.nombre}</strong><br/>Código: ${a.codigo} · Tel: ${a.telefono||"—"}</div>
    </div>
    <div class="section">
      <h5>Mes activo: <span class="badge">${activoKey || "—"}</span></h5>
      <div>Clases restantes (mes): <span class="badge">${restantesAct}</span> · <strong>Total enlazado:</strong> <span class="badge">${totalEnlazado}</span></div>
      <details style="margin-top:6px"><summary>Días asignados</summary><ul>${diasHtmlAct}</ul></details>
      <div class="acciones" style="margin-top:8px">
        <button class="primary" id="btnReagendar">Reagendar (multi‑mes)</button>
      </div>
    </div>
    ${proximosHtml || "<div class='hint'>No hay meses futuros cargados.</div>"}
  `;
  $("#btnReagendar").addEventListener("click", ()=>reagendarMultiMes(a.id, calAct?.dias?.length||4));
  $("#panelPerfil").classList.remove("oculto");
}

// ---- Config
function renderConfig(){ $("#cfgPin").value=state.config.pinAdmin||"1234"; $("#cfgOrden").value=state.config.orden||"asc"; renderVocesList(); }
function renderVocesList(){
  const cont=$("#listaVoces"); if(!cont) return;
  const vs=speechSynthesis.getVoices().filter(v=>(v.lang||"").toLowerCase().startsWith("es")).sort((a,b)=>collator.compare(a.name,b.name));
  cont.innerHTML="";
  if(!vs.length){ cont.innerHTML="<div class='hint'>No se detectaron voces en español en este dispositivo.</div>"; return; }
  vs.forEach(v=>{
    const card=document.createElement("div"); card.className="voicecard";
    card.innerHTML=`<div><strong>${v.name}</strong> <span class="badge">${v.lang}</span></div>
    <div class="acciones"><button class="ghost">Probar</button><button class="primary">Seleccionar</button></div>`;
    card.querySelector(".ghost").addEventListener("click",()=>{
      const u=new SpeechSynthesisUtterance("Esta es una prueba de voz para acceso otorgado y acceso denegado en la Academia de Danza N H.");
      u.voice=v; speechSynthesis.cancel(); speechSynthesis.speak(u);
    });
    card.querySelector(".primary").addEventListener("click",()=>{ state.config.voz=v.name; save(); alert("Voz seleccionada: "+v.name); });
    cont.appendChild(card);
  });
}
function onGuardarConfig(){
  const p=sanitizeCode($("#cfgPin").value); if(!/^\d{4}$/.test(p)){ alert("El PIN debe ser 4 dígitos."); return; }
  state.config.pinAdmin=p; state.config.orden=$("#cfgOrden").value||"asc"; save(); renderLista(); poblarSelectAlumnos($("#selAlumnoCalendario")); alert("Configuración guardada.");
}
function onExportar(){ const data=JSON.stringify({alumnos:state.alumnos, config:state.config}, null, 2); const blob=new Blob([data],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="respaldo_academia_nh.json"; a.click(); URL.revokeObjectURL(url); }
function onImportarArchivo(e){
  const file=e.target.files?.[0]; if(!file) return;
  const fr=new FileReader(); fr.onload=()=>{
    try{
      const data=JSON.parse(fr.result);
      state.alumnos=(data.alumnos||[]).map(a=>({...a, codigo:sanitizeCode(a.codigo)}));
      state.config=Object.assign({pinAdmin:"1234", voz:null, orden:"asc"}, data.config||{});
      state.config.pinAdmin=sanitizeCode(state.config.pinAdmin);
      save(); renderLista(); poblarSelectAlumnos($("#selAlumnoCalendario")); alert("Respaldo importado.");
    }catch(err){ alert("Archivo inválido."); }
  };
  fr.readAsText(file);
}

// ---- Calendario multi‑mes
function poblarSelectAlumnos(sel){ sel.innerHTML=""; const arr=orderedAlumnos(); arr.forEach(a=>{ const o=document.createElement("option"); o.value=a.id; o.textContent=`${a.nombre} (${a.codigo})`; sel.appendChild(o); }); }
function orderedAlumnos(){ const arr=state.alumnos.slice().sort((a,b)=>collator.compare(a.nombre||"", b.nombre||"")); return (state.config.orden==="desc")?arr.reverse():arr; }

function addMesBlock(defaultMonth=null, defaultPack=4){
  const wrap=document.createElement("div"); wrap.className="mes-block";
  const mk = defaultMonth || new Date().toISOString().slice(0,7);
  wrap.innerHTML = `
    <div class="mes-head">
      <label>Mes <input type="month" class="mesInput" value="${mk}"></label>
      <label>Paquete
        <select class="packInput">
          ${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1} clase${i? 's':''}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="mes-grid"></div>
    <div class="mes-actions">
      <button type="button" class="ghost btnQuitar">Quitar este mes</button>
      <span class="hint">Selecciona exactamente tantos días como el paquete.</span>
    </div>
  `;
  $("#multiMes").appendChild(wrap);
  const mesInput = $(".mesInput", wrap);
  const packInput = $(".packInput", wrap);
  const grid = $(".mes-grid", wrap);

  function renderGrid(){
    grid.innerHTML="";
    const mk = mesInput.value;
    const [y,m] = mk.split("-").map(n=>parseInt(n,10));
    const first = new Date(y, m-1, 1);
    const days = new Date(y, m, 0).getDate();
    const diasSem = ["L","M","X","J","V","S","D"];
    diasSem.forEach(d=>{ const h=document.createElement("div"); h.textContent=d; h.className="dia"; h.style.opacity="0.6"; h.style.cursor="default"; grid.appendChild(h); });
    const startW = (first.getDay()+6)%7;
    for(let i=0;i<startW;i++){ const v=document.createElement("div"); v.className="dia"; v.style.visibility="hidden"; grid.appendChild(v); }
    for(let d=1; d<=days; d++){
      const el=document.createElement("button"); el.type="button"; el.className="dia"; el.textContent=d;
      el.dataset.full = `${mk}-${String(d).padStart(2,'0')}`;
      el.addEventListener("click", ()=>{ el.classList.toggle("activo"); enforcePack(); });
      grid.appendChild(el);
    }
  }
  function enforcePack(){
    const pack = parseInt(packInput.value,10);
    const activos = $$(".dia.activo", grid).filter(el=>el.dataset.full);
    while (activos.length > pack){
      activos.pop().classList.remove("activo");
    }
  }

  mesInput.addEventListener("change", renderGrid);
  packInput.addEventListener("change", enforcePack);
  $(".btnQuitar", wrap).addEventListener("click", ()=>wrap.remove());
  packInput.value = String(defaultPack);
  renderGrid();
  return wrap;
}

function collectMesBlocks(){
  const blocks = $$(".mes-block");
  const result = [];
  for (const b of blocks){
    const mk = $(".mesInput", b).value;
    const pack = parseInt($(".packInput", b).value,10);
    const dias = $$(".dia.activo", b).map(el=>el.dataset.full);
    if (dias.length !== pack){ throw new Error(`En ${mk} selecciona exactamente ${pack} día(s).`); }
    result.push({ mk, dias: dias.sort() });
  }
  return result;
}

function guardarCalendarioMulti(){
  const selId=$("#selAlumnoCalendario").value; if(!selId){ alert("Selecciona un alumno."); return; }
  let data;
  try{ data = collectMesBlocks(); } catch(err){ alert(err.message); return; }
  const al = state.alumnos.find(a=>a.id===selId);
  al.calendario = al.calendario || {};
  data.forEach(({mk, dias})=>{ al.calendario[mk] = { dias, usados: [] }; });
  save();
  alert("Calendario guardado en los meses seleccionados.");
}

// ---- Reagendar multi‑mes
function nextMonthKey(mk){ const [y,m]=mk.split("-").map(n=>parseInt(n,10)); const d=new Date(y, m-1, 1); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,7); }
function reagendarMultiMes(alumnoId, paquete=4){
  const a=state.alumnos.find(x=>x.id===alumnoId); if(!a) return;
  const keys=Object.keys(a.calendario||{}).sort();
  const activo=keys[0]||new Date().toISOString().slice(0,7);
  const mkSig = nextMonthKey(activo);
  $$(".tabs .tab").forEach(b=>b.classList.remove("activo"));
  $$(`.tabs .tab[data-tab="calendario"]`)[0].classList.add("activo");
  $$(".tab-content").forEach(t=>t.classList.add("oculto")); $("#tab-calendario").classList.remove("oculto");
  $("#selAlumnoCalendario").value = a.id;
  $("#multiMes").innerHTML = "";
  addMesBlock(mkSig, paquete);
  window.scrollTo({top: $("#tab-calendario").offsetTop - 20, behavior: "smooth"});
}
