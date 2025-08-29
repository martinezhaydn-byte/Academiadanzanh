/* App Academia NH - Control de Accesos
   Almacenamiento: localStorage
   Voz: Web Speech API (intenta seleccionar voz en español; busca "Mónica" si existe)
   Nota: Las "notificaciones" un día antes del fin de mes intentan usar Notification API
   cuando la app está abierta. En segundo plano puede no funcionar sin PWA/Service Worker.
*/
const $ = (q,ctx=document)=>ctx.querySelector(q);
const $$ = (q,ctx=document)=>Array.from(ctx.querySelectorAll(q));

const state = {
  alumnos: [],      // {id, nombre, codigo, telefono, edad, fechaNac, fotoBase64, calendario: { '2025-08': {dias:[yyyy-mm-dd], usados:[yyyy-mm-dd]}}}
  config: { pinAdmin: "1234", voz: null },
  voces: []
};
const LS_KEY = "academia_nh_app_v1";

// ---------- Utilidades ----------
function save() { localStorage.setItem(LS_KEY, JSON.stringify({alumnos:state.alumnos, config:state.config})); }
function load() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      state.alumnos = data.alumnos || [];
      state.config = Object.assign({pinAdmin:"1234", voz:null}, data.config||{});
    } catch(e){ console.warn("LS parse", e); }
  }
}
function uid(){ return "a"+Math.random().toString(36).slice(2,9); }
function fmtDate(d){ return d.toISOString().slice(0,10); }
function monthKeyFromInput(valueMonth){ // "2025-08"
  return valueMonth || new Date().toISOString().slice(0,7);
}
function today(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
function speak(text){
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const vozId = state.config.voz;
  const voz = state.voces.find(v=> (vozId && v.name===vozId) ) ||
              state.voces.find(v=> v.lang?.toLowerCase().startsWith("es"));
  if (voz) u.voice = voz;
  u.rate = 1; u.pitch = 1; u.volume = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
function requestNotifPermission(){
  if ("Notification" in window && Notification.permission === "default"){
    Notification.requestPermission();
  }
}
function notify(text){
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") new Notification(text);
}

// ---------- Inicialización ----------
load();
document.addEventListener("DOMContentLoaded", init);
function init(){
  construirTeclado($("#vistaAlumno .teclado"), "alumno");
  construirTeclado($("#tecladoAdmin"), "admin");

  // Tabs
  $$(".tabs .tab").forEach(btn=>btn.addEventListener("click", e=>{
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

  // Calendario
  $("#btnGuardarCalendario").addEventListener("click", guardarCalendario);
  $("#btnLimpiarCalendario").addEventListener("click", ()=>renderCalendario([]));
  $("#selAlumnoCalendario").addEventListener("change", cargarCalendarioAlumno);
  $("#selPaquete").addEventListener("change", validarSeleccionCalendario);
  $("#mesAsignacion").addEventListener("change", renderCalendarioActual);

  // Lista
  renderLista();
  // Config
  renderConfig();
  $("#btnGuardarConfig").addEventListener("click", onGuardarConfig);
  $("#btnExportar").addEventListener("click", onExportar);
  $("#btnImportar").addEventListener("click", ()=>$("#fileImportar").click());
  $("#fileImportar").addEventListener("change", onImportarArchivo);

  // Voces
  if ("speechSynthesis" in window){
    const loadVoices = ()=>{
      state.voces = speechSynthesis.getVoices();
      renderVoces();
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  // Selecciones por defecto
  poblarSelectAlumnos($("#selAlumnoCalendario"));
  renderCalendarioActual();

  // Limpieza diaria de días pasados no usados
  limpiarDiasPasados();

  // Pide permiso de notificaciones
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
  const id = (tipo==="alumno")? "pinAlumno":"pinAdmin";
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
  } else {
    alert("PIN incorrecto");
  }
}

function onEntrarAlumno(){
  const pin = getPinDisplay("alumno");
  const hoy = today();
  const alumno = state.alumnos.find(a=>a.codigo===pin);
  const res = $("#resultadoAlumno");
  res.classList.remove("oculto","ok","err");
  if (!alumno){
    speak("Acceso denegado");
    res.textContent = "Acceso denegado: código no encontrado.";
    res.classList.add("err"); return;
  }
  // Buscar mes actual
  const mk = new Date().toISOString().slice(0,7);
  const cal = alumno.calendario?.[mk];
  if (!cal){ 
    speak("Acceso denegado");
    res.textContent = "Acceso denegado: no tiene calendario asignado este mes.";
    res.classList.add("err"); return;
  }
  const hoyStr = fmtDate(hoy);
  // ¿El día de hoy está permitido y no está usado?
  const puedeHoy = (cal.dias||[]).includes(hoyStr) && !(cal.usados||[]).includes(hoyStr);
  if (!puedeHoy){
    speak("Acceso denegado");
    res.textContent = "Acceso denegado: hoy no está en sus días permitidos o ya fue usado.";
    res.classList.add("err"); return;
  }
  // Marcar usado
  cal.usados = cal.usados || [];
  cal.usados.push(hoyStr);
  // Mostrar perfil por 8 segundos
  const restantes = (cal.dias||[]).filter(d=>!cal.usados.includes(d)).length;
  const foto = alumno.fotoBase64 ? `<img src="${alumno.fotoBase64}" alt="foto" />` : "";
  res.innerHTML = `<div class="okbox">
    ${foto}
    <div>
      <strong>${alumno.nombre}</strong><br/>
      Clases disponibles este mes: <span class="badge">${restantes}</span>
    </div>
  </div>`;
  res.classList.add("ok");
  speak("Acceso otorgado");
  save();
  setTimeout(()=>{
    res.classList.add("oculto");
    setPinDisplay("alumno","");
  }, 8000);
}

function limpiarForm(){
  $("#formAlumno").reset();
  $("#formAlumno").dataset.editId = "";
}

function onFotoSelect(e){
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{ $("#formAlumno").dataset.fotoBase64 = reader.result; };
  reader.readAsDataURL(file);
}

function onGuardarAlumno(e){
  e.preventDefault();
  const f = $("#formAlumno");
  const data = {
    nombre: $("#alNombre").value.trim(),
    codigo: $("#alCodigo").value.trim(),
    telefono: $("#alTelefono").value.trim(),
    edad: parseInt($("#alEdad").value || "0", 10) || null,
    fechaNac: $("#alFechaNac").value || null,
    fotoBase64: f.dataset.fotoBase64 || null
  };
  if (!/^\d{4}$/.test(data.codigo)){ alert("El código debe ser de 4 dígitos."); return; }

  if (f.dataset.editId){
    const idx = state.alumnos.findIndex(a=>a.id===f.dataset.editId);
    if (idx>=0) state.alumnos[idx] = Object.assign({}, state.alumnos[idx], data);
  } else {
    if (state.alumnos.some(a=>a.codigo===data.codigo)){ alert("Ese código ya existe."); return; }
    data.id = uid();
    data.calendario = {};
    state.alumnos.push(data);
  }

  save();
  limpiarForm();
  renderLista();
  poblarSelectAlumnos($("#selAlumnoCalendario"));
  alert("Alumno guardado.");
}

function poblarSelectAlumnos(sel){
  sel.innerHTML = "";
  state.alumnos.forEach(a=>{
    const o = document.createElement("option");
    o.value = a.id; o.textContent = `${a.nombre} (${a.codigo})`;
    sel.appendChild(o);
  });
}

function renderCalendarioActual(){
  const mk = $("#mesAsignacion").value || new Date().toISOString().slice(0,7);
  const [y,m] = mk.split("-").map(n=>parseInt(n,10));
  const first = new Date(y, m-1, 1);
  const days = new Date(y, m, 0).getDate();
  const grid = $("#calendario");
  grid.innerHTML = "";

  // encabezado días semana
  const diasSem = ["L","M","X","J","V","S","D"];
  diasSem.forEach(d=>{
    const h = document.createElement("div"); h.textContent = d; h.className="dia"; h.style.opacity="0.6"; h.style.cursor="default";
    grid.appendChild(h);
  });

  const startW = (first.getDay() + 6) % 7; // lunes=0
  for (let i=0;i<startW;i++){
    const v = document.createElement("div"); v.className="dia"; v.style.visibility="hidden";
    grid.appendChild(v);
  }
  for (let d=1; d<=days; d++){
    const el = document.createElement("button");
    el.type="button"; el.className="dia"; el.textContent = d;
    el.dataset.full = `${mk}-${String(d).padStart(2,'0')}`;
    el.addEventListener("click", ()=>{
      el.classList.toggle("activo");
      validarSeleccionCalendario();
    });
    grid.appendChild(el);
  }
}

function renderCalendario(seleccion){
  renderCalendarioActual();
  const map = new Set(seleccion);
  $$("#calendario .dia").forEach(b=>{
    const d = b.dataset.full;
    if (map.has(d)) b.classList.add("activo");
  });
  validarSeleccionCalendario();
}

function validarSeleccionCalendario(){
  const paquete = parseInt($("#selPaquete").value,10);
  const activos = $$("#calendario .dia.activo").filter(el=>el.dataset.full);
  if (activos.length > paquete){
    // desactivar los últimos seleccionados
    while ($$("#calendario .dia.activo").length > paquete){
      const last = $$("#calendario .dia.activo").pop();
      last.classList.remove("activo");
    }
  }
}

function guardarCalendario(){
  const selId = $("#selAlumnoCalendario").value;
  if (!selId) { alert("Selecciona un alumno."); return; }
  const paquete = parseInt($("#selPaquete").value,10);
  const mk = monthKeyFromInput($("#mesAsignacion").value);
  const dias = $$("#calendario .dia.activo").map(el=>el.dataset.full);
  if (dias.length !== paquete){
    alert(`Selecciona exactamente ${paquete} día(s).`); return;
  }
  const al = state.alumnos.find(a=>a.id===selId);
  al.calendario = al.calendario || {};
  al.calendario[mk] = { dias: dias.sort(), usados: [] };
  save();
  programarAlertaMes(al, mk);
  alert("Calendario guardado.");
}

function cargarCalendarioAlumno(){
  const selId = $("#selAlumnoCalendario").value;
  const mk = monthKeyFromInput($("#mesAsignacion").value);
  const al = state.alumnos.find(a=>a.id===selId);
  const cal = al?.calendario?.[mk];
  renderCalendario(cal?.dias || []);
}

function programarAlertaMes(alumno, mk){
  // Notificar 1 día antes del último día del mes asignado
  const [y,m] = mk.split("-").map(n=>parseInt(n,10));
  const last = new Date(y, m, 0); // último día mes
  const alerta = new Date(last); alerta.setDate(last.getDate()-1); alerta.setHours(10,0,0,0);
  const now = new Date();
  const ms = alerta - now;
  if (ms>0 && ms < 2147483647){ // ~24d límite setTimeout
    setTimeout(()=>{
      notify(`Mañana termina la mensualidad de ${alumno.nombre}. Reagenda.`);
    }, ms);
  }
}

function limpiarDiasPasados(){
  const hoyStr = fmtDate(today());
  state.alumnos.forEach(a=>{
    if (!a.calendario) return;
    Object.entries(a.calendario).forEach(([mk,cal])=>{
      if (!cal?.dias) return;
      const nuevos = cal.dias.filter(d=> d>=hoyStr || (cal.usados||[]).includes(d));
      // si un día ya pasó y no está en usados -> se pierde (no acumulable)
      cal.dias = nuevos;
      // también limpia "usados" que no existan ya
      cal.usados = (cal.usados||[]).filter(u=>nuevos.includes(u) || u<hoyStr);
    });
  });
  save();
}

// ---------- Lista & Perfil ----------
function renderLista(){
  const ul = $("#listaAlumnos");
  ul.innerHTML = "";
  state.alumnos.forEach(a=>{
    const li = document.createElement("li");
    li.className="item";
    const img = document.createElement("img");
    img.src = a.fotoBase64 || "";
    img.alt = "foto";
    const nombre = document.createElement("div");
    nombre.className="nombre";
    nombre.appendChild(img);
    const nm = document.createElement("div");
    nm.innerHTML = `<strong>${a.nombre}</strong><div class="muted">Código ${a.codigo} · ${a.telefono||"s/tel"}</div>`;
    nombre.appendChild(nm);

    const mini = document.createElement("div");
    mini.textContent = a.codigo;
    const btnEditar = document.createElement("button");
    btnEditar.textContent = "Editar";
    btnEditar.className="ghost";
    btnEditar.addEventListener("click", ()=>editarAlumno(a.id));

    const btnBorrar = document.createElement("button");
    btnBorrar.textContent = "Borrar";
    btnBorrar.style.background = "var(--danger)";
    btnBorrar.addEventListener("click", ()=>borrarAlumno(a.id));

    const btnPerfil = document.createElement("button");
    btnPerfil.textContent = "Perfil";
    btnPerfil.className="secondary";
    btnPerfil.addEventListener("click", ()=>mostrarPerfil(a.id));

    li.appendChild(nombre);
    li.appendChild(mini);
    li.appendChild(btnEditar);
    li.appendChild(btnBorrar);
    li.appendChild(btnPerfil);
    ul.appendChild(li);
  });
}

function editarAlumno(id){
  const a = state.alumnos.find(x=>x.id===id);
  if (!a) return;
  $("#alNombre").value = a.nombre || "";
  $("#alCodigo").value = a.codigo || "";
  $("#alTelefono").value = a.telefono || "";
  $("#alEdad").value = a.edad || "";
  $("#alFechaNac").value = a.fechaNac || "";
  $("#formAlumno").dataset.editId = a.id;
  $("#formAlumno").dataset.fotoBase64 = a.fotoBase64 || "";
  // Ir a tab Registro
  $$(".tabs .tab").forEach(b=>b.classList.remove("activo"));
  $$(`.tabs .tab[data-tab="registro"]`)[0].classList.add("activo");
  $$(".tab-content").forEach(t=>t.classList.add("oculto"));
  $("#tab-registro").classList.remove("oculto");
}

function borrarAlumno(id){
  if (!confirm("¿Eliminar alumno? Esta acción no se puede deshacer.")) return;
  state.alumnos = state.alumnos.filter(a=>a.id!==id);
  save();
  renderLista();
  poblarSelectAlumnos($("#selAlumnoCalendario"));
  $("#perfilContenido").textContent = "Selecciona un alumno para ver su perfil.";
}

function mostrarPerfil(id){
  const a = state.alumnos.find(x=>x.id===id);
  if (!a) return;
  const mk = new Date().toISOString().slice(0,7);
  const cal = a.calendario?.[mk];
  const restantes = cal ? cal.dias.filter(d=> !(cal.usados||[]).includes(d)).length : 0;

  const foto = a.fotoBase64 ? `<img src="${a.fotoBase64}" alt="foto" style="width:72px;height:72px;border-radius:50%;object-fit:cover;margin-right:10px"/>` : "";
  const diasHtml = cal ? cal.dias.map(d=>{
    const usado = (cal.usados||[]).includes(d);
    return `<li>${d} ${usado?"<span class='badge'>usado</span>":""}</li>`;
  }).join("") : "<li>Sin calendario asignado este mes.</li>";

  $("#perfilContenido").innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">${foto}
      <div>
        <strong>${a.nombre}</strong><br/>
        Código: ${a.codigo} · Tel: ${a.telefono||"—"}
      </div>
    </div>
    <div>Clases restantes del mes: <span class="badge">${restantes}</span></div>
    <details style="margin-top:8px"><summary>Días asignados</summary><ul>${diasHtml}</ul></details>
    <div class="acciones" style="margin-top:10px">
      <button class="primary" id="btnReagendar">Reagendar (si queda 1 clase)</button>
    </div>
  `;
  $("#btnReagendar").addEventListener("click", ()=>reagendarSiAplica(a.id));
}

function reagendarSiAplica(id){
  const a = state.alumnos.find(x=>x.id===id);
  const mk = new Date().toISOString().slice(0,7);
  const cal = a.calendario?.[mk];
  const restantes = cal ? cal.dias.filter(d=> !(cal.usados||[]).includes(d)).length : 0;
  if (restantes!==1){ alert("Solo puede reagendar cuando quede 1 clase."); return; }
  // Abrir tab Calendario preseleccionado para el próximo mes
  const next = new Date(); next.setMonth(next.getMonth()+1);
  const nextKey = next.toISOString().slice(0,7);
  $("#mesAsignacion").value = nextKey;
  poblarSelectAlumnos($("#selAlumnoCalendario"));
  $("#selAlumnoCalendario").value = a.id;
  // sugerir mismo paquete que el actual (cantidad de dias del mes actual)
  const paquete = cal.dias.length;
  $("#selPaquete").value = String(paquete);
  renderCalendarioActual();

  // Cambia a tab Calendario
  $$(".tabs .tab").forEach(b=>b.classList.remove("activo"));
  $$(`.tabs .tab[data-tab="calendario"]`)[0].classList.add("activo");
  $$(".tab-content").forEach(t=>t.classList.add("oculto"));
  $("#tab-calendario").classList.remove("oculto");
}

function renderConfig(){
  $("#cfgPin").value = state.config.pinAdmin || "1234";
  renderVoces();
}
function renderVoces(){
  const sel = $("#cfgVoz");
  if (!sel) return;
  sel.innerHTML = "";
  (state.voces||[]).filter(v=>v.lang?.toLowerCase().startsWith("es"))
    .forEach(v=>{
      const o = document.createElement("option");
      o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
      sel.appendChild(o);
    });
  // intentar seleccionar Mónica si existe
  const monica = (state.voces||[]).find(v=>/monic(a|á)/i.test(v.name||""));
  if (monica) sel.value = monica.name;
  else if (state.config.voz) sel.value = state.config.voz;
}

function onGuardarConfig(){
  const p = $("#cfgPin").value.trim();
  if (!/^\d{4}$/.test(p)){ alert("El PIN debe ser 4 dígitos."); return; }
  state.config.pinAdmin = p;
  state.config.voz = $("#cfgVoz").value || null;
  save();
  alert("Configuración guardada.");
}

function onExportar(){
  const data = JSON.stringify({alumnos:state.alumnos, config:state.config}, null, 2);
  const blob = new Blob([data], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "respaldo_academia_nh.json";
  a.click();
  URL.revokeObjectURL(url);
}
function onImportarArchivo(e){
  const file = e.target.files?.[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = ()=>{
    try{
      const data = JSON.parse(fr.result);
      state.alumnos = data.alumnos||[];
      state.config = Object.assign({pinAdmin:"1234", voz:null}, data.config||{});
      save();
      renderLista(); renderConfig(); poblarSelectAlumnos($("#selAlumnoCalendario"));
      alert("Respaldo importado.");
    }catch(err){ alert("Archivo inválido."); }
  };
  fr.readAsText(file);
}
