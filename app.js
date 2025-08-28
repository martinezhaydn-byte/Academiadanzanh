function speak(text, type='') {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-MX';
  if (type==='error') u.pitch = 0.8;
  if (type==='success') u.pitch = 1.2;
  window.speechSynthesis.speak(u);
}

// Minimal IndexedDB wrapper
const DB_NAME = 'adan-nh-db';
const DB_VERSION = 1;
let db;

const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('students')) {
      const s = db.createObjectStore('students', { keyPath: 'id', autoIncrement: true });
      s.createIndex('pin', 'pin', { unique: true });
    }
    if (!db.objectStoreNames.contains('meta')) {
      db.createObjectStore('meta', { keyPath: 'key' });
    }
    if (!db.objectStoreNames.contains('attendance')) {
      const a = db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
      a.createIndex('byStudent', 'studentId', { unique: false });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function dbTx(storeNames, mode='readonly') {
  if (!db) db = await openDB();
  const tx = db.transaction(storeNames, mode);
  const stores = storeNames.map(n => tx.objectStore(n));
  return { tx, stores };
}

// Meta helpers
async function getAdminPin() {
  const { tx, stores:[meta] } = await dbTx(['meta']);
  return await new Promise(res=>{
    const r = meta.get('adminPin');
    r.onsuccess = () => res(r.result ? r.result.value : '0000');
    r.onerror = () => res('0000');
  });
}
async function setAdminPin(pin) {
  const { tx, stores:[meta] } = await dbTx(['meta'],'readwrite');
  await meta.put({ key:'adminPin', value: pin });
  return new Promise(res=>tx.oncomplete=()=>res(true));
}

// Student helpers
async function addOrUpdateStudent(stu) {
  const { tx, stores:[students] } = await dbTx(['students'],'readwrite');
  await students.put(stu);
  return new Promise(res=>tx.oncomplete=()=>res(true));
}
async function getStudentByPin(pin) {
  const { tx, stores:[students] } = await dbTx(['students']);
  return new Promise((res, rej)=>{
    const idx = students.index('pin');
    const r = idx.get(pin);
    r.onsuccess = ()=>res(r.result||null);
    r.onerror = ()=>res(null);
  });
}
async function getAllStudents() {
  const { tx, stores:[students] } = await dbTx(['students']);
  return new Promise((res)=>{
    const list = [];
    const c = students.openCursor();
    c.onsuccess = (e)=>{
      const cur = e.target.result;
      if (cur) { list.push(cur.value); cur.continue(); } else res(list);
    };
  });
}
async function deleteStudent(id) {
  const { tx, stores:[students] } = await dbTx(['students'],'readwrite');
  students.delete(id);
  return new Promise(res=>tx.oncomplete=()=>res(true));
}

// Attendance helpers
async function logAttendance(studentId) {
  const { tx, stores:[attendance] } = await dbTx(['attendance'],'readwrite');
  await attendance.add({ studentId, ts: new Date().toISOString() });
  return new Promise(res=>tx.oncomplete=()=>res(true));
}
async function getAttendanceByStudent(studentId) {
  const { tx, stores:[attendance] } = await dbTx(['attendance']);
  return new Promise(res=>{
    const idx = attendance.index('byStudent');
    const req = idx.getAll(studentId);
    req.onsuccess = ()=>res(req.result||[]);
    req.onerror = ()=>res([]);
  });
}

// Export/Import
async function exportAll() {
  const [students, pin] = await Promise.all([getAllStudents(), getAdminPin()]);
  const data = { when: new Date().toISOString(), adminPin: pin, students, version: 1 };
  return new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
}
async function importAll(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const { tx, stores:[students, meta] } = await dbTx(['students','meta'],'readwrite');
  await new Promise((res)=>{
    const clearReq = students.clear();
    clearReq.onsuccess = ()=>res();
    clearReq.onerror = ()=>res();
  });
  if (data.students && Array.isArray(data.students)) {
    for (const s of data.students) {
      delete s.id; // let it autoincrement to avoid clashes
      await students.add(s);
    }
  }
  if (data.adminPin) await meta.put({ key:'adminPin', value:data.adminPin });
  return new Promise(res=>tx.oncomplete=()=>res(true));
}
async function resetAll() {
  if (!db) db = await openDB();
  db.close();
  await indexedDB.deleteDatabase(DB_NAME);
  db = null;
}

// Utilities
function pkgDefaultRemaining(type) {
  switch(type){
    case 'suelta': return 1;
    case 'dos': return 2;
    case 'cuatro': return 4;
    case 'seis': return 6;
    case 'ocho': return 8;
    case 'diez': return 10;
    case 'doce': return 12;
    case 'mes': return 0;
    default: return 0;
  }
}
function formatDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString();
}
function todayISO() {
  const d = new Date();
  const z = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return z.toISOString().slice(0,10);
}

// UI logic
const views = {
  home: document.getElementById('view-home'),
  alumno: document.getElementById('view-alumno'),
  adminPin: document.getElementById('view-admin-pin'),
  admin: document.getElementById('view-admin'),
};
function show(id) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  id.classList.add('active');
}

// Routing
document.getElementById('btn-alumno').addEventListener('click', ()=>show(views.alumno));
document.getElementById('btn-admin').addEventListener('click', ()=>show(views.adminPin));
document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click', ()=>show(views.home)));

// Alumno keypad
const pinInputs = [ 'pin-1','pin-2','pin-3','pin-4' ].map(id=>document.getElementById(id));
const alumnoMsg = document.getElementById('alumno-msg');
function setAlumnoMsg(text, cls='') {
  alumnoMsg.textContent = text;
  alumnoMsg.className = 'msg ' + cls;
}
document.querySelectorAll('[data-key]').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const k = btn.dataset.key;
    if (k === 'del') {
      for (let i=pinInputs.length-1;i>=0;i--) {
        if (pinInputs[i].value) { pinInputs[i].value=''; break; }
      }
      return;
    }
    if (k === 'ok') {
      const pin = pinInputs.map(i=>i.value).join('');
      if (pin.length !== 4) return setAlumnoMsg('Completa los 4 dígitos.', 'warn');
      const stu = await getStudentByPin(pin);
      if (!stu) {
        setAlumnoMsg('Código no encontrado. Pide soporte en recepción.', 'error'); await speak('Código no encontrado');
        pinInputs.forEach(i=>i.value='');
        return;
      }
      // Validar paquete
      const today = todayISO();
      const inRange = (!stu.startDate || stu.startDate <= today) && (!stu.endDate || stu.endDate >= today);
      if (!inRange) {
        setAlumnoMsg('Tu paquete no está vigente. Por favor reacude a recepción.', 'warn'); await speak('Paquete no vigente. Favor de pasar a recepción');
        pinInputs.forEach(i=>i.value='');
        return;
      }
      // Decrementar clases si aplica
      if (stu.pkgType !== 'mes') {
        if (!stu.remaining || stu.remaining <= 0) {
          setAlumnoMsg('Ya no tienes clases restantes. Reagendar en recepción.', 'warn'); await speak('Acceso denegado. Ya no tienes clases disponibles. Pasa a recepción para reagendar');
          speak('Acceso denegado, no te quedan clases', 'error');
          pinInputs.forEach(i=>i.value='');
          return;
        }
        if (stu.remaining === 1) {
          alert('⚠️ Atención: te queda solo 1 clase restante. Acude a recepción para reagendar.');
        }
        stu.remaining -= 1;
        await addOrUpdateStudent(stu);
      }
      await logAttendance(stu.id);
      setAlumnoMsg(`¡Acceso concedido, ${stu.name.split(' ')[0]}!`, 'success'); await speak(`Acceso concedido, ${stu.name.split(' ')[0]}`);
      // Ocultar datos y volver a inicio
      setTimeout(()=>{
        pinInputs.forEach(i=>i.value='');
        setAlumnoMsg('');
        show(views.home);
      }, 2500);
      return;
    }
    // digit
    for (let i=0;i<pinInputs.length;i++) {
      if (!pinInputs[i].value) { pinInputs[i].value = k; break; }
    }
  });
});

// Admin PIN keypad
const apInputs = [ 'apin-1','apin-2','apin-3','apin-4' ].map(id=>document.getElementById(id));
const adminPinMsg = document.getElementById('admin-pin-msg');
document.querySelectorAll('[data-apkey]').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const k = btn.dataset.apkey;
    if (k === 'del') {
      for (let i=apInputs.length-1;i>=0;i--) {
        if (apInputs[i].value) { apInputs[i].value=''; break; }
      }
      return;
    }
    if (k === 'ok') {
      const pin = apInputs.map(i=>i.value).join('');
      const saved = await getAdminPin();
      if (pin === saved) {
        apInputs.forEach(i=>i.value='');
        adminPinMsg.textContent = '';
        await refreshStudents();
  // Ofrecer reagendar inmediatamente
  if (editingStudent === null) {
    const all = await getAllStudents();
    const saved = all.find(x => x.pin === stu.pin);
    if (saved) {
      if (confirm('Alumno guardado. ¿Quieres reagendar ahora su paquete?')) {
        openResched(saved);
      }
    }
  }
        show(views.admin);
      } else {
        adminPinMsg.textContent = 'PIN incorrecto.';
        apInputs.forEach(i=>i.value='');
      }
      return;
    }
    for (let i=0;i<apInputs.length;i++) {
      if (!apInputs[i].value) { apInputs[i].value = k; break; }
    }
  });
});

// Admin settings
document.getElementById('btn-save-admin-pin').addEventListener('click', async ()=>{
  const val = document.getElementById('admin-pin-input').value.trim();
  if (!/^\d{4}$/.test(val)) { alert('El PIN debe tener 4 dígitos.'); return; }
  await setAdminPin(val);
  alert('PIN actualizado.');
});

// Students list & dialog
const listEl = document.getElementById('students');
const dlgStudent = document.getElementById('dlg-student');
const formStudent = document.getElementById('form-student');
const dlgTitle = document.getElementById('dlg-title');
const photoInput = document.getElementById('student-photo-input');
const photoPreview = document.getElementById('student-photo-preview');

let editingStudent = null;

document.getElementById('btn-add-student').addEventListener('click', ()=>{
  editingStudent = null;
  formStudent.reset();
  photoPreview.src = '';
  const s = formStudent.elements;
  s.remaining.value = pkgDefaultRemaining(s.pkgType.value);
  s.startDate.value = todayISO();
  const d = new Date(s.startDate.value); d.setMonth(d.getMonth()+1); s.endDate.value = d.toISOString().slice(0,10);
  dlgTitle.textContent = 'Añadir alumno';
  dlgStudent.showModal();
});

formStudent.elements.pkgType.addEventListener('change', (e)=>{
  formStudent.elements.remaining.value = pkgDefaultRemaining(e.target.value);
});

document.getElementById('btn-take-photo').addEventListener('click', ()=>{
  photoInput.click();
});
photoInput.addEventListener('change', async (e)=>{
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = ()=>{
    const canvas = document.createElement('canvas');
    const max = 512;
    const ratio = Math.min(max/img.width, max/img.height, 1);
    canvas.width = Math.round(img.width*ratio);
    canvas.height = Math.round(img.height*ratio);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    photoPreview.src = data;
    photoPreview.dataset.dataUrl = data;
  };
  img.src = URL.createObjectURL(file);
});

document.getElementById('btn-save-student').addEventListener('click', async (e)=>{
  e.preventDefault();
  const f = formStudent.elements;
  const stu = editingStudent || { id: undefined };
  // Required fields
  if (!f.name.value.trim() || !/^\d{4}$/.test(f.pin.value)) {
    alert('Nombre y PIN de 4 dígitos son obligatorios.'); return;
  }
  Object.assign(stu, {
    name: f.name.value.trim(),
    pin: f.pin.value.trim(),
    phone: f.phone.value.trim(),
    emergency: f.emergency.value.trim(),
    birthdate: f.birthdate.value || null,
    address: f.address.value.trim(),
    payment: f.payment.value,
    pkgType: f.pkgType.value,
    startDate: f.startDate.value,
    endDate: f.endDate.value,
    remaining: Number(f.remaining.value||0),
    photo: photoPreview.dataset.dataUrl || stu.photo || null,
    active: true,
  });
  try {
    await addOrUpdateStudent(stu);
    dlgStudent.close();
    await refreshStudents();
  // Ofrecer reagendar inmediatamente
  if (editingStudent === null) {
    const all = await getAllStudents();
    const saved = all.find(x => x.pin === stu.pin);
    if (saved) {
      if (confirm('Alumno guardado. ¿Quieres reagendar ahora su paquete?')) {
        openResched(saved);
      }
    }
  }
  } catch (err) {
    alert('Error guardando: ' + err.message);
  }
});

async function refreshStudents() {
  const all = await getAllStudents();
  listEl.innerHTML = '';
  if (!all.length) {
    listEl.innerHTML = '<p class="muted">Aún no hay alumnos.</p>';
    return;
  }
  const oneLeft = [];
  for (const s of all) {
    const card = document.createElement('div');
    card.className = 'card';
    const remainText = s.pkgType === 'mes' ? `${formatDate(s.startDate)} → ${formatDate(s.endDate)}` : `${s.remaining} clases restantes`;
    const badge = (s.pkgType !== 'mes' && Number(s.remaining) === 1) ? '<span class="badge">¡Falta 1 clase!</span>' : '';
    card.innerHTML = `
      <img src="${s.photo || ''}" alt="Foto de ${s.name}">
      <h4>${s.name} ${badge}</h4>
      <div class="muted">PIN: ${s.pin}</div>
      <div class="muted">Paquete: ${s.pkgType.toUpperCase()} — ${remainText}</div>
      <menu>
        <button data-act="edit">Editar</button>
        <button data-act="resched">Reagendar</button>
        <button data-act="delete" class="danger">Eliminar</button>
      </menu>
    `;
    card.querySelector('[data-act="edit"]').addEventListener('click', ()=>openEdit(s));
    card.querySelector('[data-act="resched"]').addEventListener('click', ()=>openResched(s));
    card.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
      if (confirm('¿Eliminar este alumno?')) {
        await deleteStudent(s.id);
        await refreshStudents();
  // Ofrecer reagendar inmediatamente
  if (editingStudent === null) {
    const all = await getAllStudents();
    const saved = all.find(x => x.pin === stu.pin);
    if (saved) {
      if (confirm('Alumno guardado. ¿Quieres reagendar ahora su paquete?')) {
        openResched(saved);
      }
    }
  }
      }
    });
    if (s.pkgType !== 'mes' && Number(s.remaining) === 1) { oneLeft.push(s); }
    listEl.appendChild(card);
  }
  // Alert banner
  const banner = document.getElementById('admin-alerts');
  if (oneLeft.length) {
    banner.classList.add('active');
    const items = oneLeft.map(s=>`• ${s.name} (PIN ${s.pin})`).join('<br>');
    banner.innerHTML = `<h4>Atención — Falta 1 clase</h4><div class="muted">Estos alumnos están por terminar su paquete:</div><div style="margin-top:6px">${items}</div>`;
  } else {
    banner.classList.remove('active');
    banner.innerHTML = '';
  }
}

function openEdit(s) {
  editingStudent = s;
  const f = formStudent.elements;
  document.getElementById('dlg-title').textContent = 'Editar alumno';
  f.name.value = s.name||'';
  f.pin.value = s.pin||'';
  f.phone.value = s.phone||'';
  f.emergency.value = s.emergency||'';
  f.birthdate.value = s.birthdate||'';
  f.address.value = s.address||'';
  f.payment.value = s.payment||'';
  f.pkgType.value = s.pkgType||'suelta';
  f.startDate.value = s.startDate||todayISO();
  f.endDate.value = s.endDate||todayISO();
  f.remaining.value = s.remaining||pkgDefaultRemaining(f.pkgType.value);
  photoPreview.src = s.photo||'';
  photoPreview.dataset.dataUrl = s.photo||'';
  dlgStudent.showModal();
}

// Reagendar
const dlgRes = document.getElementById('dlg-resched');
const formRes = document.getElementById('form-resched');
let resTarget = null;
function openResched(s) {
  resTarget = s;
  const f = formRes.elements;
  f.pkgType.value = s.pkgType;
  f.startDate.value = todayISO();
  const d = new Date(f.startDate.value); d.setMonth(d.getMonth()+1); f.endDate.value = d.toISOString().slice(0,10);
  f.remaining.value = pkgDefaultRemaining(f.pkgType.value);
  dlgRes.showModal();
}
document.getElementById('btn-resched-save').addEventListener('click', async (e)=>{
  e.preventDefault();
  const f = formRes.elements;
  if (!resTarget) return;
  resTarget.pkgType = f.pkgType.value;
  resTarget.startDate = f.startDate.value;
  resTarget.endDate = f.endDate.value;
  resTarget.remaining = Number(f.remaining.value||0);
  await addOrUpdateStudent(resTarget);
  dlgRes.close();
  await refreshStudents();
  // Ofrecer reagendar inmediatamente
  if (editingStudent === null) {
    const all = await getAllStudents();
    const saved = all.find(x => x.pin === stu.pin);
    if (saved) {
      if (confirm('Alumno guardado. ¿Quieres reagendar ahora su paquete?')) {
        openResched(saved);
      }
    }
  }
});

// Export / Import / Reset
document.getElementById('btn-export').addEventListener('click', async ()=>{
  const blob = await exportAll();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `adan-nh-respaldo-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('file-import').addEventListener('change', async (e)=>{
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!confirm('Esto reemplazará tu lista de alumnos. ¿Continuar?')) return;
  await importAll(file);
  await refreshStudents();
  // Ofrecer reagendar inmediatamente
  if (editingStudent === null) {
    const all = await getAllStudents();
    const saved = all.find(x => x.pin === stu.pin);
    if (saved) {
      if (confirm('Alumno guardado. ¿Quieres reagendar ahora su paquete?')) {
        openResched(saved);
      }
    }
  }
  alert('Datos importados.');
});
document.getElementById('btn-reset').addEventListener('click', async ()=>{
  if (!confirm('Reiniciar toda la app (borrar alumnos y ajustes)? Esta acción no se puede deshacer.')) return;
  await resetAll();
  location.reload();
});

// PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
