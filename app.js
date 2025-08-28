
// ===== Utilidades de almacenamiento =====
const DB_KEY = "danzaDB_v3";

const defaultConfig = {
  adminPin: "2580",
  precios: { "1": 80, "2": 150, "4": 280, "6": 380, "8": 480, "mes": 600 },
  voice: { volume: 1, rate: 1.0 }
};

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const db = { config: defaultConfig, alumnos: [] };
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  }
  try {
    const parsed = JSON.parse(raw);
    // merge defaults for new fields
    if (!parsed.config) parsed.config = structuredClone(defaultConfig);
    parsed.config.precios = { ...defaultConfig.precios, ...(parsed.config.precios||{}) };
    parsed.config.voice = { ...defaultConfig.voice, ...(parsed.config.voice||{}) };
    if (!Array.isArray(parsed.alumnos)) parsed.alumnos = [];
    return parsed;
  } catch {
    const db = { config: defaultConfig, alumnos: [] };
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  }
}
function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

function mxn(n) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n||0)); }

// ===== VOZ (Web Speech API) =====
let cachedVoices = [];
function getSpanishVoice() {
  cachedVoices = window.speechSynthesis?.getVoices?.() || [];
  const prefer = ["es-MX","es-419","es-ES","Spanish"];
  // Buscar coincidencias claras por lang
  for (const p of prefer) {
    const v = cachedVoices.find(v=> (v.lang || "").toLowerCase().includes(p.toLowerCase()));
    if (v) return v;
  }
  // Si no encuentra, intentar voz por nombre con pistas comunes
  const candidates = ["Paulina", "Monica", "Mónica", "Camila", "Luciana", "Jorge", "Diego", "Marisol"];
  for (const name of candidates) {
    const v = cachedVoices.find(v=> (v.name||"").toLowerCase().includes(name.toLowerCase()));
    if (v) return v;
  }
  return null;
}
function speak(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    const db = loadDB();
    utter.volume = db.config.voice.volume ?? 1;
    utter.rate = db.config.voice.rate ?? 1;
    const voice = getSpanishVoice();
    if (voice) utter.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch(e) {
    console.warn("Voz no disponible:", e);
  }
}

// ===== Estado UI =====
const alumnoSection = document.getElementById("alumnoSection");
const adminSection = document.getElementById("adminSection");
const btnAlumno = document.getElementById("btnAlumno");
const btnAdmin = document.getElementById("btnAdmin");

btnAlumno.addEventListener("click", ()=>switchMode("alumno"));
btnAdmin.addEventListener("click", ()=>switchMode("admin"));

function switchMode(mode) {
  if (mode === "alumno") {
    alumnoSection.classList.remove("hidden");
    adminSection.classList.add("hidden");
    btnAlumno.classList.add("active"); btnAlumno.setAttribute("aria-pressed", "true");
    btnAdmin.classList.remove("active"); btnAdmin.setAttribute("aria-pressed", "false");
    resetAlumnoUI();
  } else {
    alumnoSection.classList.add("hidden");
    adminSection.classList.remove("hidden");
    btnAlumno.classList.remove("active"); btnAlumno.setAttribute("aria-pressed", "false");
    btnAdmin.classList.add("active"); btnAdmin.setAttribute("aria-pressed", "true");
    document.getElementById("adminLoginFeedback").textContent = "";
    document.getElementById("formAdminLogin").reset();
    document.getElementById("adminPanel").classList.add("hidden");
  }
}

// ===== Lógica Modo Alumno =====
let pinBuffer = "";
const pinDisplay = document.getElementById("pinDisplay");
const alumnoFeedback = document.getElementById("alumnoFeedback");
const perfilCard = document.getElementById("alumnoPerfil");
const perfilFoto = document.getElementById("perfilFoto");
const perfilNombre = document.getElementById("perfilNombre");
const perfilPaquete = document.getElementById("perfilPaquete");
const perfilRestantes = document.getElementById("perfilRestantes");
const perfilFechas = document.getElementById("perfilFechas");
const perfilUltimoPago = document.getElementById("perfilUltimoPago");
const btnMarcarAsistencia = document.getElementById("btnMarcarAsistencia");
const btnReagendar = document.getElementById("btnReagendar");
const btnCerrarSesion = document.getElementById("btnCerrarSesion");
const agendaAlumno = document.getElementById("agendaAlumno");
const formReagendar = document.getElementById("formReagendar");
const listaAgenda = document.getElementById("listaAgenda");

let alumnoActual = null;
let alumnoInactivityTimer = null;

function renderPin() {
  const arr = ["—","—","—","—"];
  for (let i=0;i<pinBuffer.length;i++) arr[i] = "•";
  pinDisplay.textContent = arr.join(" ");
}

function resetAlumnoUI() {
  pinBuffer = ""; renderPin();
  alumnoFeedback.textContent = "";
  alumnoFeedback.className = "feedback";
  perfilCard.classList.add("hidden");
  agendaAlumno.classList.add("hidden");
  alumnoActual = null;
  clearTimeout(alumnoInactivityTimer);
}

document.querySelectorAll(".keypad .key").forEach(btn => {
  btn.addEventListener("click", ()=>{
    const action = btn.dataset.action;
    if (action === "borrar") {
      pinBuffer = "";
      renderPin();
      return;
    }
    if (action === "entrar") {
      entrarConPin();
      return;
    }
    if (pinBuffer.length < 4) {
      pinBuffer += btn.textContent.trim();
      renderPin();
      if (pinBuffer.length === 4) entrarConPin();
    }
  });
});

function entrarConPin() {
  if (pinBuffer.length !== 4) return;
  const db = loadDB();
  const alumno = db.alumnos.find(a => a.codigo === pinBuffer);
  if (!alumno) {
    alumnoFeedback.textContent = "Acceso denegado: código inexistente.";
    alumnoFeedback.className = "feedback err";
    speak("Acceso denegado");
    pinBuffer = ""; renderPin();
    return;
  }
  // Mostrar perfil
  alumnoActual = alumno;
  mostrarPerfilAlumno(alumno);
  const ok = alumno.clasesRestantes > 0;
  if (ok) {
    alumnoFeedback.textContent = "Acceso autorizado";
    alumnoFeedback.className = "feedback ok";
    speak("Acceso autorizado");
  } else {
    alumnoFeedback.textContent = "Acceso denegado: sin clases disponibles";
    alumnoFeedback.className = "feedback err";
    speak("Acceso denegado");
  }
  // Auto limpiar sesión tras 30s si no hay interacción
  clearTimeout(alumnoInactivityTimer);
  alumnoInactivityTimer = setTimeout(()=>{
    cerrarSesionAlumno();
  }, 30000);
}

function mostrarPerfilAlumno(a) {
  perfilCard.classList.remove("hidden");
  perfilFoto.src = a.foto || "assets/default-avatar.png";
  perfilNombre.textContent = a.nombre;
  perfilPaquete.textContent = etiquetarPaquete(a.paquete);
  perfilRestantes.textContent = a.clasesRestantes ?? 0;
  perfilFechas.textContent = (a.inicio||"—") + " → " + (a.fin||"—");
  const ultimo = (a.pagos||[]).slice(-1)[0];
  perfilUltimoPago.textContent = ultimo ? `${mxn(ultimo.monto)} (${ultimo.metodo||"—"}) ${ultimo.fecha||""}` : "—";
  // Re-agendar: sólo visible cuando le quede 1 clase, y se haya registrado un nuevo pago (después del último acceso)
  actualizarBotonReagendar(a);
  // Render de agenda
  renderAgenda(a);
}

function etiquetarPaquete(p) {
  const mapa = { "1":"Clase suelta (1)","2":"Dos clases (2)","4":"Cuatro clases (4)","6":"Seis clases (6)","8":"Ocho clases (8)","mes":"Mes completo" };
  return mapa[p] || p;
}

function actualizarBotonReagendar(a) {
  const puede = (a.clasesRestantes === 1);
  btnReagendar.disabled = !puede;
  btnReagendar.title = puede ? "Re-agendar requiere que se haya realizado un nuevo pago" : "Disponible cuando quede 1 clase";
}

btnMarcarAsistencia.addEventListener("click", ()=>{
  if (!alumnoActual) return;
  const db = loadDB();
  const a = db.alumnos.find(x=> x.id === alumnoActual.id);
  if (!a) return;
  if ((a.clasesRestantes||0) <= 0) {
    alumnoFeedback.textContent = "No hay clases disponibles";
    alumnoFeedback.className = "feedback err";
    speak("Acceso denegado");
    return;
  }
  a.clasesRestantes = (a.clasesRestantes||0) - 1;
  saveDB(db);
  mostrarPerfilAlumno(a);
  alumnoFeedback.textContent = "Asistencia registrada";
  alumnoFeedback.className = "feedback ok";
  speak("Acceso autorizado");
});

btnReagendar.addEventListener("click", ()=>{
  if (!alumnoActual) return;
  agendaAlumno.classList.toggle("hidden");
});

formReagendar.addEventListener("submit", (e)=>{
  e.preventDefault();
  if (!alumnoActual) return;
  const db = loadDB();
  const a = db.alumnos.find(x=> x.id === alumnoActual.id);
  const fecha = document.getElementById("reagendarFecha").value;
  if (!fecha) return;
  // Reglas: sólo si hay un pago reciente (último pago en los últimos 7 días) o si clasesRestantes era 1
  const ultimoPago = (a.pagos||[]).slice(-1)[0];
  const tienePagoReciente = ultimoPago ? (Date.now() - new Date(ultimoPago.fecha||Date.now()).getTime() < 7*24*3600*1000) : false;
  if ((a.clasesRestantes||0) > 1 && !tienePagoReciente) {
    alert("Para re-agendar con más de 1 clase restante, registra primero el nuevo pago.");
    return;
  }
  a.agenda = a.agenda || [];
  a.agenda.push({ fecha });
  saveDB(db);
  renderAgenda(a);
  alumnoFeedback.textContent = "Clase re-agendada";
  alumnoFeedback.className = "feedback ok";
});

function renderAgenda(a) {
  listaAgenda.innerHTML = "";
  (a.agenda||[]).forEach((item, idx)=>{
    const li = document.createElement("li");
    const dt = new Date(item.fecha);
    li.textContent = dt.toLocaleString();
    const del = document.createElement("button");
    del.textContent = "Eliminar";
    del.className = "danger";
    del.addEventListener("click", ()=>{
      const db = loadDB();
      const aa = db.alumnos.find(x=> x.id === a.id);
      aa.agenda.splice(idx,1);
      saveDB(db);
      renderAgenda(aa);
    });
    li.appendChild(document.createTextNode(" "));
    li.appendChild(del);
    listaAgenda.appendChild(li);
  });
}

btnCerrarSesion.addEventListener("click", cerrarSesionAlumno);
function cerrarSesionAlumno() {
  resetAlumnoUI();
  speak("Sesión cerrada");
}

// ===== Lógica admin =====
const formAdminLogin = document.getElementById("formAdminLogin");
const adminLoginFeedback = document.getElementById("adminLoginFeedback");
const adminPanel = document.getElementById("adminPanel");
formAdminLogin.addEventListener("submit", (e)=>{
  e.preventDefault();
  const pin = (document.getElementById("adminPin").value||"").trim();
  const db = loadDB();
  if (pin === db.config.adminPin) {
    adminLoginFeedback.textContent = "Acceso de administrador concedido.";
    adminLoginFeedback.className = "feedback ok";
    adminPanel.classList.remove("hidden");
    cargarTablaAlumnos();
    cargarConfig();
  } else {
    adminLoginFeedback.textContent = "Código incorrecto.";
    adminLoginFeedback.className = "feedback err";
  }
});

const tablaAlumnosTbody = document.querySelector("#tablaAlumnos tbody");
const btnNuevoAlumno = document.getElementById("btnNuevoAlumno");
const inputImportar = document.getElementById("inputImportar");
const btnExportar = document.getElementById("btnExportar");
const searchAlumno = document.getElementById("searchAlumno");

btnExportar.addEventListener("click", ()=>{
  const db = loadDB();
  const blob = new Blob([JSON.stringify(db, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "respaldo_academia.json";
  a.click();
  URL.revokeObjectURL(url);
});

inputImportar.addEventListener("change", (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try {
      const json = JSON.parse(reader.result);
      if (!json || typeof json !== "object") throw new Error("Formato inválido");
      saveDB(json);
      alert("Importación exitosa");
      cargarTablaAlumnos();
      cargarConfig();
    } catch(err) {
      alert("Error al importar: " + err.message);
    }
  };
  reader.readAsText(file);
});

btnNuevoAlumno.addEventListener("click", ()=> abrirModalAlumno());

searchAlumno.addEventListener("input", cargarTablaAlumnos);

function cargarTablaAlumnos() {
  const db = loadDB();
  const term = (searchAlumno.value||"").toLowerCase();
  const fil = db.alumnos.filter(a=> !term || a.nombre.toLowerCase().includes(term) || (a.codigo||"").includes(term));
  tablaAlumnosTbody.innerHTML = "";
  fil.forEach(a => {
    const tr = document.createElement("tr");
    const img = document.createElement("img"); img.src = a.foto || "assets/default-avatar.png";
    const fotoTd = document.createElement("td"); fotoTd.appendChild(img);
    const acciones = document.createElement("td");
    const btnEditar = document.createElement("button"); btnEditar.textContent = "Editar"; btnEditar.addEventListener("click", ()=> abrirModalAlumno(a.id));
    const btnEliminar = document.createElement("button"); btnEliminar.textContent = "Eliminar"; btnEliminar.className = "danger";
    btnEliminar.addEventListener("click", ()=>{
      if (!confirm("¿Eliminar alumno?")) return;
      const db2 = loadDB();
      db2.alumnos = db2.alumnos.filter(x=> x.id !== a.id);
      saveDB(db2);
      cargarTablaAlumnos();
    });
    acciones.append(btnEditar, document.createTextNode(" "), btnEliminar);

    tr.innerHTML = `
      <td></td>
      <td>${a.nombre}</td>
      <td>${a.codigo}</td>
      <td>${etiquetarPaquete(a.paquete)}</td>
      <td>${a.clasesRestantes ?? 0}</td>
      <td>${(a.inicio||"—")} → ${(a.fin||"—")}</td>
    `;
    tr.children[0].appendChild(img);
    tr.appendChild(acciones);
    tablaAlumnosTbody.appendChild(tr);
  });
}

// ===== Modal Alumno (crear/editar) =====
const modalAlumno = document.getElementById("modalAlumno");
const formAlumno = document.getElementById("formAlumno");
const modalAlumnoTitulo = document.getElementById("modalAlumnoTitulo");

const alNombre = document.getElementById("alNombre");
const alCodigo = document.getElementById("alCodigo");
const alPaquete = document.getElementById("alPaquete");
const alMonto = document.getElementById("alMonto");
const alInicio = document.getElementById("alInicio");
const alFin = document.getElementById("alFin");
const alTel = document.getElementById("alTel");
const alTelEmerg = document.getElementById("alTelEmerg");
const alFNac = document.getElementById("alFNac");
const alEdad = document.getElementById("alEdad");
const alDir = document.getElementById("alDir");
const alFormaPago = document.getElementById("alFormaPago");
const alFoto = document.getElementById("alFoto");
const alPagos = document.getElementById("alPagos");
const btnAgregarPago = document.getElementById("btnAgregarPago");
const pagoTemplate = document.getElementById("pagoTemplate");

let editAlumnoId = null;

function abrirModalAlumno(id=null) {
  editAlumnoId = id;
  const db = loadDB();
  const cfg = db.config;
  // Prellenar
  alPagos.innerHTML = "";
  if (id) {
    const a = db.alumnos.find(x=> x.id === id);
    modalAlumnoTitulo.textContent = "Editar alumno";
    alNombre.value = a.nombre || "";
    alCodigo.value = a.codigo || "";
    alPaquete.value = a.paquete || "1";
    alMonto.value = a.monto || cfg.precios[a.paquete] || 0;
    alInicio.value = a.inicio || "";
    alFin.value = a.fin || "";
    alTel.value = a.tel || "";
    alTelEmerg.value = a.telEmerg || "";
    alFNac.value = a.fnac || "";
    alEdad.value = a.edad || "";
    alDir.value = a.dir || "";
    alFormaPago.value = a.formaPago || "";
    (a.pagos||[]).forEach(p=> agregarPagoUI(p));
  } else {
    modalAlumnoTitulo.textContent = "Nuevo alumno";
    alNombre.value = "";
    alCodigo.value = "";
    alPaquete.value = "4";
    alMonto.value = cfg.precios["4"];
    const today = new Date();
    alInicio.value = today.toISOString().slice(0,10);
    const fin = new Date(today);
    fin.setDate(fin.getDate()+30);
    alFin.value = fin.toISOString().slice(0,10);
    alTel.value = "";
    alTelEmerg.value = "";
    alFNac.value = "";
    alEdad.value = "";
    alDir.value = "";
    alFormaPago.value = "";
  }
  if (typeof modalAlumno.showModal === "function") modalAlumno.showModal();
  else modalAlumno.classList.remove("hidden");
}

alPaquete.addEventListener("change", ()=>{
  const db = loadDB();
  alMonto.value = db.config.precios[alPaquete.value] || 0;
});

btnAgregarPago.addEventListener("click", ()=> agregarPagoUI());

function agregarPagoUI(pago=null) {
  const clone = pagoTemplate.content.cloneNode(true);
  const container = clone.querySelector(".pago-item");
  const monto = clone.querySelector(".pago-monto");
  const metodo = clone.querySelector(".pago-metodo");
  const fecha = clone.querySelector(".pago-fecha");
  const nota = clone.querySelector(".pago-nota");
  const del = clone.querySelector(".pago-eliminar");
  if (pago) {
    monto.value = pago.monto ?? "";
    metodo.value = pago.metodo ?? "";
    fecha.value = pago.fecha ?? "";
    nota.value = pago.nota ?? "";
  } else {
    fecha.value = new Date().toISOString().slice(0,10);
  }
  del.addEventListener("click", ()=> container.remove());
  alPagos.appendChild(clone);
}

formAlumno.addEventListener("close", ()=>{
  // noop
});

formAlumno.addEventListener("submit", (e)=>{
  // Este evento no se dispara en <dialog> con method="dialog"; manejamos más abajo en botones
});

modalAlumno.addEventListener("close", ()=>{/* noop */});

// Interceptar el click del botón "Guardar" del dialog
formAlumno.querySelector('button[value="confirm"]').addEventListener("click", (ev)=>{
  ev.preventDefault();
  if (!alNombre.value.trim()) return alert("Falta el nombre");
  if (!/^\d{4}$/.test(alCodigo.value)) return alert("El código debe ser de 4 dígitos");
  const db = loadDB();
  // Unicidad de código
  const exists = db.alumnos.find(a=> a.codigo === alCodigo.value && a.id !== editAlumnoId);
  if (exists) return alert("Ese código ya está en uso por " + exists.nombre);

  const pagos = [];
  alPagos.querySelectorAll(".pago-item").forEach(div => {
    pagos.push({
      monto: Number(div.querySelector(".pago-monto").value||0),
      metodo: div.querySelector(".pago-metodo").value||"",
      fecha: div.querySelector(".pago-fecha").value||"",
      nota: div.querySelector(".pago-nota").value||""
    });
  });

  const baseAlumno = {
    nombre: alNombre.value.trim(),
    codigo: alCodigo.value.trim(),
    paquete: alPaquete.value,
    monto: Number(alMonto.value||0),
    inicio: alInicio.value || "",
    fin: alFin.value || "",
    tel: alTel.value || "",
    telEmerg: alTelEmerg.value || "",
    fnac: alFNac.value || "",
    edad: alEdad.value || "",
    dir: alDir.value || "",
    formaPago: alFormaPago.value || "",
    pagos,
  };

  // Foto
  const photoInput = alFoto;
  const finalize = (fotoDataUrl)=>{
    baseAlumno.foto = fotoDataUrl || (editAlumnoId ? (db.alumnos.find(x=>x.id===editAlumnoId)?.foto||"") : "");
    // clacular clasesRestantes iniciales en base al paquete si no existía
    const paqueteMap = { "1":1,"2":2,"4":4,"6":6,"8":8,"mes": 9999 }; // "mes" se maneja como grande
    if (editAlumnoId) {
      const idx = db.alumnos.findIndex(x=> x.id === editAlumnoId);
      if (idx >= 0) {
        // conservar clasesRestantes si existe
        baseAlumno.id = db.alumnos[idx].id;
        baseAlumno.clasesRestantes = db.alumnos[idx].clasesRestantes ?? paqueteMap[baseAlumno.paquete] ?? 0;
        baseAlumno.agenda = db.alumnos[idx].agenda || [];
        db.alumnos[idx] = baseAlumno;
      }
    } else {
      baseAlumno.id = crypto.randomUUID();
      baseAlumno.clasesRestantes = paqueteMap[baseAlumno.paquete] ?? 0;
      baseAlumno.agenda = [];
      db.alumnos.push(baseAlumno);
    }
    saveDB(db);
    modalAlumno.close();
    cargarTablaAlumnos();
  };

  if (photoInput.files && photoInput.files[0]) {
    const reader = new FileReader();
    reader.onload = ()=> finalize(reader.result);
    reader.readAsDataURL(photoInput.files[0]);
  } else {
    finalize(null);
  }
});

formAlumno.querySelector('button[value="cancel"]').addEventListener("click", (ev)=>{
  ev.preventDefault();
  modalAlumno.close();
});

// ===== Configuración =====
const formConfig = document.getElementById("formConfig");
const cfgAdminPin = document.getElementById("cfgAdminPin");
const precioInputs = {
  "1": document.getElementById("precio1"),
  "2": document.getElementById("precio2"),
  "4": document.getElementById("precio4"),
  "6": document.getElementById("precio6"),
  "8": document.getElementById("precio8"),
  "mes": document.getElementById("precioMes"),
};
const voiceVolume = document.getElementById("voiceVolume");
const voiceRate = document.getElementById("voiceRate");
const probarVoz = document.getElementById("probarVoz");

function cargarConfig() {
  const db = loadDB();
  cfgAdminPin.value = db.config.adminPin || "";
  for (const k of Object.keys(precioInputs)) {
    precioInputs[k].value = db.config.precios[k] ?? 0;
  }
  voiceVolume.value = db.config.voice.volume ?? 1;
  voiceRate.value = db.config.voice.rate ?? 1.0;
}
formConfig.addEventListener("submit", (e)=>{
  e.preventDefault();
  const db = loadDB();
  db.config.adminPin = cfgAdminPin.value || db.config.adminPin;
  for (const k of Object.keys(precioInputs)) {
    db.config.precios[k] = Number(precioInputs[k].value||0);
  }
  db.config.voice.volume = Number(voiceVolume.value||1);
  db.config.voice.rate = Number(voiceRate.value||1);
  saveDB(db);
  alert("Configuración guardada");
});
probarVoz.addEventListener("click", ()=>{
  speak("Esta es una prueba de voz en español. Acceso autorizado.");
});

// ===== Inicialización =====
switchMode("alumno");

// Asegurar que las voces estén cargadas
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = ()=>{
    cachedVoices = window.speechSynthesis.getVoices();
  };
}
