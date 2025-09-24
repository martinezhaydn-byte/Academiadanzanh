/* App Academia NH v10 (PWA consolidada)
  - Códigos/PIN saneados: solo 4 dígitos [0-9], sin espacios/caracteres raros.
  - Lista con búsqueda y orden (A→Z / Z→A), scroll + perfil toggle.
  - Calendario mensual no acumulable; aviso fin de mes; reagenda con 1 clase.
  - Mes en cola y promoción automática al agotar mes actual.
  - Modo Alumno con voz (Mónica si está), acceso otorgado/denegado y limpieza 8s.
  - Compresión de foto de perfil a ~300px (JPEG) al subir (Android/iPad friendly).
  - PWA: offline, instalar, notificaciones.
*/
const $ = (q,ctx=document)=>ctx.querySelector(q);
const $$ = (q,ctx=document)=>Array.from(ctx.querySelectorAll(q));
const collator = new Intl.Collator('es', {sensitivity:'base', numeric:false});

const state = {
  alumnos: [],
  config: { pinAdmin: "1234", voz: null, orden: "asc" },
  voces: [],
  uiPerfilOpenId: "",
  filtro: ""
};
const LS_KEY = "academia_nh_app_v1";

function save(){ localStorage.setItem(LS_KEY, JSON.stringify({alumnos:state.alumnos, config:state.config})); }
function load(){
  const raw = localStorage.getItem(LS_KEY);
  if (raw){
    try{
      const data = JSON.parse(raw);
      state.alumnos = data.alumnos||[];
      state.config = Object.assign({pinAdmin:"1234", voz:null, orden:"asc"}, data.config||{});
      // saneo de códigos preexistentes
      state.alumnos.forEach(a=> a.codigo = sanitizeCode(a.codigo));
      state.config.pinAdmin = sanitizeCode(state.config.pinAdmin);
    }catch(e){console.warn(e);}
  }
}

function uid(){ return "a"+Math.random().toString(36).slice(2,9); }
function fmtDate(d){ return d.toISOString().slice(0,10); }
function monthKeyFromInput(v){ return v || new Date().toISOString().slice(0,7); }
function today(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function norm(s){ return (s||"").toString().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim(); }
function sanitizeCode(s){ return (s||"").toString().normalize("NFKC").replace(/\D+/g,"").slice(0,4); }

// ---- Foto: compresión a ~300 px ----
function compressFileToBase64(file, maxSize=300, quality=0.72){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h){ if (w > maxSize){ h = Math.round(h*maxSize/w); w = maxSize; } }
        else { if (h > maxSize){ w = Math.round(w*maxSize/h); h = maxSize; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

// ---- Meses ----
function sortKeysAsc(keys){ return keys.sort(); }
function getActiveAndNextMonth(alumno){
  const keys = Object.keys(alumno.calendario||{});
  if (!keys.length) return {activeKey:null,nextKey:null};
  const sorted = sortKeysAsc(keys.slice());
  let activeKey = null;
  for (const k of sorted){
    const cal = alumno.calendario[k];
    const restantes = (cal?.dias||[]).filter(d=> !(cal.usados||[]).includes(d)).length;
    if (restantes>0) { activeKey = k; break; }
  }
  if (!activeKey) return {activeKey:null,nextKey:null};
  const idx = sorted.indexOf(activeKey);
  const nextKey = (idx>=0 && idx<sorted.length-1)? sorted[idx+1] : null;
  return {activeKey, nextKey};
}
function promoteIfNeeded(alumno, justUsedKey){
  const cal = alumno.calendario?.[justUsedKey];
  const restantes = cal ? cal.dias.filter(d=> !(cal.usados||[]).includes(d)).length : 0;
  if (restantes===0){
    const { nextKey } = getActiveAndNextMonth(alumno);
    if (nextKey){
      delete alumno.calendario[justUsedKey];
      save();
      return {promoted:true, toKey: nextKey};
    }
  }
  return {promoted:false};
}

// ---- Voz y notificaciones ----
function speak(text, voiceName=null){
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  let voz = null;
  if (voiceName){ voz = state.voces.find(v=>v.name===voiceName) || null; }
  else {
    const monica = state.voces.find(v=>/monic(a|á)/i.test(v.name||"")) || null;
    const vozId = state.config.voz;
    if (monica) voz = monica;
    else if (vozId) voz = state.voces.find(v=>v.name===vozId);
    if (!voz) voz = state.voces.find(v=> (v.lang||"").toLowerCase().startsWith("es"));
  }
  if (voz) u.voice = voz;
  u.rate=1; u.pitch=1; u.volume=1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
function requestNotifPermission(){
  if ("Notification" in window && Notification.permission==="default"){
    Notification.requestPermission();
  }
}
async function notify(text){
  try{
    if (!("Notification" in window)) return;
    if (Notification.permission!=="granted") return;
    if ("serviceWorker" in navigator){
      const reg = await navigator.serviceWorker.ready;
      if (reg?.showNotification){ await reg.showNotification(text, {icon:"icons/icon-192.png", badge:"icons/icon-192.png"}); return; }
    }
    new Notification(text);
  }catch(e){ console.warn("notify:", e); }
}

// ---- SW / Install ----
let deferredPrompt=null;
if ("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("sw.js");
  });
}
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  $("#btnInstalar").classList.remove("oculto");
});
$("#btnInstalar")?.addEventListener("click", async ()=>{
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("#btnInstalar").classList.add("oculto");
});

load();
document.addEventListener("DOMContentLoaded", init);
function init(){
  construirTeclado($("#vistaAlumno .teclado"), "alumno");
  construirTeclado($("#tecladoAdmin"), "admin");

  // Tabs
  $$(".tabs .tab").forEach(btn=>btn.addEventListener("click", ()=>{
    $$(".tabs .tab").forEach(b=>b.classList.remove("activo"));
    btn.classList.add("activo");
    const tab = btn.dataset.tab;
    $$(".tab-content").forEach(t=>t.classList.add("oculto"));
    $("#tab-"+tab).classList.remove("oculto");
  }));

  // Nav
  $("#btnModoAlumno").addEventListener("click", ()=>mostrarVista("alumno"));
  $("#btnModoAdmin").addEventListener("click", ()=>mostrarVista("adminLogin"));
  $("#btnEntrarAlumno").addEventListener("click", onEntrarAlumno);
  $("#btnBorrarAlumno").addEventListener("click", ()=>setPinDisplay("alumno",""));
  $("#btnEntrarAdmin").addEventListener("click", onEntrarAdmin);
  $("#btnBorrarAdmin").addEventListener("click", ()=>setPinDisplay("admin",""));

  // Registro
  $("#btnNuevoAlumno").addEventListener("click", limpiarForm);
  $("#formAlumno").addEventListener("submit", onGuardarAlumno);
  $("#alFoto").addEventListener("change", onFotoSelect);
  $("#alCodigo").addEventListener("input", (e)=>{
    const cleaned = sanitizeCode(e.target.value);
    if (e.target.value !== cleaned) e.target.value = cleaned;
  });

  // Calendario
  $("#btnGuardarCalendario").addEventListener("click", guardarCalendario);
  $("#btnLimpiarCalendario").addEventListener("click", ()=>renderCalendario([]));
  $("#selAlumnoCalendario").addEventListener("change", cargarCalendarioAlumno);
  $("#selPaquete").addEventListener("change", validarSeleccionCalendario);
  $("#mesAsignacion").addEventListener("change", renderCalendarioActual);

  // Lista + búsqueda
  $("#buscarAlumno").addEventListener("input", (e)=>{ state.filtro = e.target.value; renderLista(); });
  $("#btnLimpiarBusqueda").addEventListener("click", ()=>{ state.filtro=""; $("#buscarAlumno").value=""; renderLista(); });
  renderLista();

  // Config
  renderConfig();
  $("#btnGuardarConfig").addEventListener("click", onGuardarConfig);
  $("#btnExportar").addEventListener("click", onExportar);
  $("#btnImportar").addEventListener("click", ()=>$("#fileImportar").click());
  $("#fileImportar").addEventListener("change", onImportarArchivo);
  $("#cfgPin").addEventListener("input", (e)=>{
    const cleaned = sanitizeCode(e.target.value);
    if (e.target.value !== cleaned) e.target.value = cleaned;
  });

  // Voces
  if ("speechSynthesis" in window){
    const loadVoices = ()=>{
      state.voces = speechSynthesis.getVoices();
      renderVoces();
      renderVocesList();
      const monica = state.voces.find(v=>/monic(a|á)/i.test(v.name||""));
      if (monica && !state.config.voz) { state.config.voz = monica.name; save(); renderConfig(); }
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  poblarSelectAlumnos($("#selAlumnoCalendario"));
  renderCalendarioActual();
  limpiarDiasPasados();
  requestNotifPermission();
}

function mostrarVista(which){
  $$(".vista").forEach(v=>v.classList.remove("activa"));
  if (which==="alumno") $("#vistaAlumno").classList.add("activa");
  else if (which==="adminLogin") $("#vistaAdminLogin").classList.add("activa");
  else if (which==="admin") $("#vistaAdmin").classList.add("activa");
}

function construirTeclado(container, tipo){
  container.innerHTML = "";
  const nums = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
  nums.forEach(n=>{
    const b = document.createElement("button");
    b.setAttribute("type","button");
    if (n===""){
      b.className="ghost"; b.disabled=true; b.textContent=" ";
    } else {
      b.textContent = n;
      b.addEventListener("click", ()=>onKey(tipo, n));
    }
    container.appendChild(b);
  });
}
function onKey(tipo, key){
  const cur = getPinDisplay(tipo);
  if (key==="⌫") setPinDisplay(tipo, cur.slice(0,-1));
  else if (/^\d$/.test(key) && cur.length<4) setPinDisplay(tipo, cur+key);
}
function getPinDisplay(tipo){
  const el = (tipo==="alumno")? $("#pinAlumno"):$("#pinAdmin");
  return el.dataset.val||"";
}
function setPinDisplay(tipo, val){
  const el = (tipo==="alumno")? $("#pinAlumno"):$("#pinAdmin");
  el.dataset.val = val;
  el.textContent = (val+"____").slice(0,4).split("").join("");
}

function onEntrarAdmin(){
  const pin = getPinDisplay("admin");
  if (pin === state.config.pinAdmin){
    mostrarVista("admin");
    setPinDisplay("admin","");
  } else { alert("PIN incorrecto"); }
}

function onEntrarAlumno(){
  const pin = getPinDisplay("alumno");
  const hoy = today();
  const alumno = state.alumnos.find(a=>a.codigo===pin);
  const res = $("#resultadoAlumno");
  res.classList.remove("oculto","ok","err");
  const previewImg = $("#previewFotoAlumno");

  const clearAfter = ()=>{
    setTimeout(()=>{
      res.classList.add("oculto");
      setPinDisplay("alumno","");
      if (previewImg) previewImg.src = "";
    }, 8000);
  };

  if (!alumno){
    speak("Acceso denegado");
    res.textContent = "Acceso denegado: código no encontrado.";
    res.classList.add("err");
    if (previewImg) previewImg.src = "";
    clearAfter();
    return;
  }
  previewImg.src = alumno.fotoBase64 || "";

  const mk = new Date().toISOString().slice(0,7);
  const cal = alumno.calendario?.[mk];
  if (!cal){
    speak("Acceso denegado");
    res.textContent = "Acceso denegado: no tiene calendario asignado este mes.";
    res.classList.add("err"); clearAfter(); return;
  }
  const hoyStr = fmtDate(hoy);
  const puedeHoy = (cal.dias||[]).includes(hoyStr) && !(cal.usados||[]).includes(hoyStr);
  if (!puedeHoy){
    speak("Acceso denegado");
    res.textContent = "Acceso denegado: hoy no está en sus días permitidos o ya fue usado.";
    res.classList.add("err"); clearAfter(); return;
  }
  cal.usados = cal.usados || [];
  cal.usados.push(hoyStr);
  let restantes = (cal.dias||[]).filter(d=>!cal.usados.includes(d)).length;

  let promoMsg = "";
  const promo = promoteIfNeeded(alumno, mk);
  if (promo.promoted){
    promoMsg = `<div class="badge">Se activó el nuevo mes (${promo.toKey})</div>`;
  }

  const foto = alumno.fotoBase64 ? `<img src="${alumno.fotoBase64}" alt="foto" />` : "";
  res.innerHTML = `<div class="okbox">${foto}
    <div>
      <strong>${alumno.nombre}</strong><br/>
      Clases disponibles este mes: <span class="badge">${restantes}</span>
      ${promoMsg}
    </div>
  </div>`;
  res.classList.add("ok");
  speak("Acceso otorgado");
  save();
  setTimeout(()=>{
    res.classList.add("oculto");
    setPinDisplay("alumno","");
    if (previewImg) previewImg.src = "";
  }, 8000);
}

// -------- Registro --------
function limpiarForm(){ $("#formAlumno").reset(); $("#formAlumno").dataset.editId=""; $("#formAlumno").dataset.fotoBase64=""; }
async function onFotoSelect(e){
  const f = e.target.files?.[0]; if(!f) return;
  try{
    const base64 = await compressFileToBase64(f, 300, 0.72);
    $("#formAlumno").dataset.fotoBase64 = base64;
  }catch(err){
    console.warn("Error al comprimir foto:", err);
  }
}
function onGuardarAlumno(e){
  e.preventDefault();
  const f = $("#formAlumno");
  const data = {
    nombre: $("#alNombre").value.trim(),
    codigo: sanitizeCode($("#alCodigo").value),
    telefono: $("#alTelefono").value.trim(),
    edad: parseInt($("#alEdad").value||"0",10)||null,
    fechaNac: $("#alFechaNac").value||null,
    fotoBase64: f.dataset.fotoBase64 || null
  };
  if (!/^\d{4}$/.test(data.codigo)){ alert("El código debe ser exactamente 4 dígitos."); return; }

  if (f.dataset.editId){
    // Si edita y cambia a un código ya tomado por otro alumno, impedir
    const taken = state.alumnos.some(a=> a.codigo===data.codigo && a.id!==f.dataset.editId);
    if (taken){ alert("Ese código ya existe."); return; }
    const idx = state.alumnos.findIndex(a=>a.id===f.dataset.editId);
    if (idx>=0) state.alumnos[idx] = Object.assign({}, state.alumnos[idx], data);
  } else {
    if (state.alumnos.some(a=>a.codigo===data.codigo)){ alert("Ese código ya existe."); return; }
    data.id = uid(); data.calendario = {}; state.alumnos.push(data);
  }
  save(); limpiarForm(); renderLista(); poblarSelectAlumnos($("#selAlumnoCalendario"));
  alert("Alumno guardado.");
}

// ---- Orden y filtro ----
function orderedAlumnos(){
  const arr = state.alumnos.slice().sort((a,b)=>collator.compare(a.nombre||"", b.nombre||""));
  return (state.config.orden==="desc") ? arr.reverse() : arr;
}
function filteredAlumnos(){
  const f = norm(state.filtro);
  if (!f) return orderedAlumnos();
  return orderedAlumnos().filter(a=> norm(a.nombre).includes(f) || norm(a.codigo).includes(f));
}

// -------- Calendario --------
function poblarSelectAlumnos(sel){
  sel.innerHTML = "";
  const ordenados = orderedAlumnos();
  ordenados.forEach(a=>{
    const o=document.createElement("option"); o.value=a.id; o.textContent=`${a.nombre} (${a.codigo})`; sel.appendChild(o);
  });
}
function renderCalendarioActual(){
  const mk = $("#mesAsignacion").value || new Date().toISOString().slice(0,7);
  const [y,m] = mk.split("-").map(n=>parseInt(n,10));
  const first = new Date(y, m-1, 1);
  const days = new Date(y, m, 0).getDate();
  const grid = $("#calendario"); grid.innerHTML="";

  const diasSem = ["L","M","X","J","V","S","D"];
  diasSem.forEach(d=>{ const h=document.createElement("div"); h.textContent=d; h.className="dia"; h.style.opacity="0.6"; h.style.cursor="default"; grid.appendChild(h); });
  const startW = (first.getDay()+6)%7;
  for(let i=0;i<startW;i++){ const v=document.createElement("div"); v.className="dia"; v.style.visibility="hidden"; grid.appendChild(v); }
  for(let d=1; d<=days; d++){
    const el=document.createElement("button"); el.type="button"; el.className="dia"; el.textContent=d;
    el.dataset.full = `${mk}-${String(d).padStart(2,'0')}`;
    el.addEventListener("click", ()=>{ el.classList.toggle("activo"); validarSeleccionCalendario(); });
    grid.appendChild(el);
  }
}
function renderCalendario(sel){ renderCalendarioActual(); const S=new Set(sel); $$("#calendario .dia").forEach(b=>{ const d=b.dataset.full; if (S.has(d)) b.classList.add("activo"); }); validarSeleccionCalendario(); }
function validarSeleccionCalendario(){
  const paquete=parseInt($("#selPaquete").value,10);
  const activos = $$("#calendario .dia.activo").filter(el=>el.dataset.full);
  while (activos.length > paquete){
    activos.pop().classList.remove("activo");
  }
}
function guardarCalendario(){
  const selId=$("#selAlumnoCalendario").value; if(!selId){alert("Selecciona un alumno."); return;}
  const paquete=parseInt($("#selPaquete").value,10);
  const mk = monthKeyFromInput($("#mesAsignacion").value);
  const dias = $$("#calendario .dia.activo").map(el=>el.dataset.full);
  if (dias.length!==paquete){ alert(`Selecciona exactamente ${paquete} día(s).`); return; }
  const al = state.alumnos.find(a=>a.id===selId);
  al.calendario = al.calendario || {};
  al.calendario[mk] = { dias: dias.sort(), usados: [] };
  save(); programarAlertaMes(al, mk); alert("Calendario guardado.");
}
function cargarCalendarioAlumno(){
  const selId=$("#selAlumnoCalendario").value;
  const mk = monthKeyFromInput($("#mesAsignacion").value);
  const al = state.alumnos.find(a=>a.id===selId);
  const cal = al?.calendario?.[mk];
  renderCalendario(cal?.dias||[]);
}
function programarAlertaMes(alumno, mk){
  const [y,m] = mk.split("-").map(n=>parseInt(n,10));
  const last = new Date(y, m, 0);
  const alerta = new Date(last); alerta.setDate(last.getDate()-1); alerta.setHours(10,0,0,0);
  const now = new Date(); const ms = alerta-now;
  if (ms>0 && ms<2147483647){ setTimeout(()=>{ notify(`Mañana termina la mensualidad de ${alumno.nombre}. Reagenda.`); }, ms); }
}
function limpiarDiasPasados(){
  const hoyStr = fmtDate(today());
  state.alumnos.forEach(a=>{
    if(!a.calendario) return;
    Object.entries(a.calendario).forEach(([mk,cal])=>{
      if(!cal?.dias) return;
      const nuevos = cal.dias.filter(d=> d>=hoyStr || (cal.usados||[]).includes(d));
      cal.dias = nuevos;
      cal.usados = (cal.usados||[]).filter(u=>nuevos.includes(u) || u<hoyStr);
    });
  });
  save();
}

// -------- Lista + Perfil --------
function renderLista(){
  const ul=$("#listaAlumnos"); ul.innerHTML="";
  const arr = filteredAlumnos();
  arr.forEach(a=>{
    const li=document.createElement("li"); li.className="item";
    const img=document.createElement("img"); img.src=a.fotoBase64||""; img.alt="foto";
    const nombre=document.createElement("div"); nombre.className="nombre";
    const nm=document.createElement("div"); nm.innerHTML=`<strong>${a.nombre}</strong><div class="muted">Código ${a.codigo} · ${a.telefono||"s/tel"}</div>`;
    nombre.appendChild(img); nombre.appendChild(nm);

    const mini=document.createElement("div"); mini.textContent=a.codigo;
    const bEdit=document.createElement("button"); bEdit.textContent="Editar"; bEdit.className="ghost"; bEdit.addEventListener("click",()=>editarAlumno(a.id));
    const bDel=document.createElement("button"); bDel.textContent="Borrar"; bDel.style.background="var(--danger)"; bDel.addEventListener("click",()=>borrarAlumno(a.id));
    const bPerfil=document.createElement("button"); bPerfil.textContent="Perfil"; bPerfil.className="secondary"; bPerfil.addEventListener("click",()=>togglePerfil(a.id));

    li.appendChild(nombre); li.appendChild(mini); li.appendChild(bEdit); li.appendChild(bDel); li.appendChild(bPerfil);
    ul.appendChild(li);
  });
}
function editarAlumno(id){
  const a=state.alumnos.find(x=>x.id===id); if(!a) return;
  $("#alNombre").value=a.nombre||"";
  $("#alCodigo").value=a.codigo||"";
  $("#alTelefono").value=a.telefono||"";
  $("#alEdad").value=a.edad||"";
  $("#alFechaNac").value=a.fechaNac||"";
  $("#formAlumno").dataset.editId=a.id;
  $("#formAlumno").dataset.fotoBase64=a.fotoBase64||"";
  $$(".tabs .tab").forEach(b=>b.classList.remove("activo"));
  $$(`.tabs .tab[data-tab="registro"]`)[0].classList.add("activo");
  $$(".tab-content").forEach(t=>t.classList.add("oculto"));
  $("#tab-registro").classList.remove("oculto");
}
function borrarAlumno(id){
  if(!confirm("¿Eliminar alumno?")) return;
  state.alumnos = state.alumnos.filter(a=>a.id!==id);
  save(); renderLista(); poblarSelectAlumnos($("#selAlumnoCalendario"));
  if (state.uiPerfilOpenId===id){ ocultarPerfil(); }
}
function togglePerfil(id){
  if (state.uiPerfilOpenId === id){ ocultarPerfil(); return; }
  state.uiPerfilOpenId = id; mostrarPerfil(id);
}
function ocultarPerfil(){
  state.uiPerfilOpenId = "";
  $("#panelPerfil").classList.add("oculto");
  $("#perfilContenido").innerHTML = "Selecciona un alumno para ver su perfil.";
}
function mostrarPerfil(id){
  const a=state.alumnos.find(x=>x.id===id); if(!a) return;
  const {activeKey, nextKey} = getActiveAndNextMonth(a);
  const calAct = activeKey ? a.calendario[activeKey] : null;
  const restantesAct = calAct ? calAct.dias.filter(d=> !(calAct.usados||[]).includes(d)).length : 0;
  const diasHtmlAct = calAct ? calAct.dias.map(d=>{
    const usado = (calAct.usados||[]).includes(d);
    return `<li>${d} ${usado?"<span class='badge'>usado</span>":""}</li>`;
  }).join("") : "<li>Sin calendario activo.</li>";

  let proxHtml = "";
  if (nextKey){
    const calNext = a.calendario[nextKey];
    const restantesNext = calNext ? calNext.dias.length : 0;
    const diasHtmlNext = calNext ? calNext.dias.map(d=>`<li>${d}</li>`).join("") : "";
    proxHtml = `
      <div class="section">
        <h5>Próximo mes pagado: <span class="badge">${nextKey}</span></h5>
        <div>Clases programadas: <span class="badge">${restantesNext}</span></div>
        <details style="margin-top:6px"><summary>Ver días</summary><ul>${diasHtmlNext}</ul></details>
        <div class="hint">Cuando se agoten las clases del mes activo, este mes se activará automáticamente y el anterior se eliminará.</div>
      </div>
    `;
  }

  const foto = a.fotoBase64 ? `<img src="${a.fotoBase64}" alt="foto" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid #222;margin-right:10px"/>` : "";

  $("#perfilContenido").innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">${foto}
      <div>
        <strong>${a.nombre}</strong><br/>
        Código: ${a.codigo} · Tel: ${a.telefono||"—"}
      </div>
    </div>

    <div class="section">
      <h5>Mes activo: <span class="badge">${activeKey || "—"}</span></h5>
      <div>Clases restantes: <span class="badge">${restantesAct}</span></div>
      <details style="margin-top:6px"><summary>Días asignados</summary><ul>${diasHtmlAct}</ul></details>
      <div class="acciones" style="margin-top:8px">
        <button class="primary" id="btnReagendar">Reagendar (si queda 1 clase)</button>
      </div>
    </div>

    ${proxHtml}
  `;
  $("#btnReagendar").addEventListener("click", ()=>reagendarSiAplica(a.id));
  $("#panelPerfil").classList.remove("oculto");
}
function reagendarSiAplica(id){
  const a=state.alumnos.find(x=>x.id===id);
  const {activeKey} = getActiveAndNextMonth(a);
  const cal = activeKey ? a.calendario[activeKey] : null;
  const restantes = cal ? cal.dias.filter(d=> !(cal.usados||[]).includes(d)).length : 0;
  if (restantes!==1){ alert("Solo puede reagendar cuando quede 1 clase en el mes activo."); return; }
  const next=new Date(); next.setMonth(next.getMonth()+1);
  const nextKey=next.toISOString().slice(0,7);
  $("#mesAsignacion").value=nextKey;
  poblarSelectAlumnos($("#selAlumnoCalendario"));
  $("#selAlumnoCalendario").value=a.id;
  $("#selPaquete").value=String(cal.dias.length);
  renderCalendarioActual();
  $$(".tabs .tab").forEach(b=>b.classList.remove("activo"));
  $$(`.tabs .tab[data-tab="calendario"]`)[0].classList.add("activo");
  $$(".tab-content").forEach(t=>t.classList.add("oculto"));
  $("#tab-calendario").classList.remove("oculto");
}

// -------- Config: voces + orden --------
function renderConfig(){
  $("#cfgPin").value = state.config.pinAdmin || "1234";
  $("#cfgOrden").value = state.config.orden || "asc";
  renderVoces();
  renderVocesList();
}
function renderVoces(){
  const sel=$("#cfgVoz"); if(!sel) return;
  sel.innerHTML="";
  const vocesES = (state.voces||[]).filter(v=>(v.lang||"").toLowerCase().startsWith("es"));
  vocesES.sort((a,b)=>collator.compare(a.name, b.name));
  vocesES.forEach(v=>{
    const o=document.createElement("option"); o.value=v.name; o.textContent=`${v.name} (${v.lang})`; sel.appendChild(o);
  });
  const monica = vocesES.find(v=>/monic(a|á)/i.test(v.name||""));
  if (state.config.voz && vocesES.some(v=>v.name===state.config.voz)) sel.value = state.config.voz;
  else if (monica) sel.value = monica.name;
}
function renderVocesList(){
  const cont=$("#listaVoces"); if(!cont) return;
  cont.innerHTML = "";
  const vocesES = (state.voces||[]).filter(v=>(v.lang||"").toLowerCase().startsWith("es")).sort((a,b)=>collator.compare(a.name, b.name));
  if (!vocesES.length){ cont.innerHTML = "<div class='hint'>No se detectaron voces en español en este dispositivo.</div>"; return; }
  vocesES.forEach(v=>{
    const card=document.createElement("div");
    card.className="voicecard";
    card.innerHTML = `
      <div><strong>${v.name}</strong> <span class="badge">${v.lang}</span></div>
      <div class="acciones">
        <button class="ghost btnProbar">Probar</button>
        <button class="primary btnSeleccionar">Seleccionar</button>
      </div>
    `;
    card.querySelector(".btnProbar").addEventListener("click", ()=>{
      speak("Esta es una prueba de voz para acceso otorgado y acceso denegado en la Academia de Danza N H.", v.name);
    });
    card.querySelector(".btnSeleccionar").addEventListener("click", ()=>{
      state.config.voz = v.name; save(); renderConfig();
      alert(`Voz seleccionada: ${v.name}`);
    });
    cont.appendChild(card);
  });
}
function onGuardarConfig(){
  const p=sanitizeCode($("#cfgPin").value);
  if(!/^\d{4}$/.test(p)){ alert("El PIN debe ser 4 dígitos."); return; }
  state.config.pinAdmin=p;
  state.config.voz=$("#cfgVoz").value || null;
  state.config.orden=$("#cfgOrden").value || "asc";
  save();
  poblarSelectAlumnos($("#selAlumnoCalendario"));
  renderLista();
  alert("Configuración guardada.");
}
function onExportar(){
  const data=JSON.stringify({alumnos:state.alumnos, config:state.config}, null, 2);
  const blob=new Blob([data],{type:"application/json"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download="respaldo_academia_nh.json"; a.click(); URL.revokeObjectURL(url);
}
function onImportarArchivo(e){
  const file=e.target.files?.[0]; if(!file) return;
  const fr=new FileReader();
  fr.onload=()=>{
    try{
      const data=JSON.parse(fr.result);
      state.alumnos=(data.alumnos||[]).map(a=>({ ...a, codigo: sanitizeCode(a.codigo) }));
      state.config=Object.assign({pinAdmin:"1234", voz:null, orden:"asc"}, data.config||{});
      state.config.pinAdmin = sanitizeCode(state.config.pinAdmin);
      save(); renderLista(); renderConfig(); poblarSelectAlumnos($("#selAlumnoCalendario"));
      alert("Respaldo importado.");
    }catch(err){ alert("Archivo inválido."); }
  };
  fr.readAsText(file);
}
