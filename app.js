// ===== IndexedDB =====
const DB_NAME='adnh-clean-db'; const DB_VERSION=1;
let db;
const openDB=()=>new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=(e)=>{const d=e.target.result;
    if(!d.objectStoreNames.contains('students')){const s=d.createObjectStore('students',{keyPath:'id',autoIncrement:true}); s.createIndex('pin','pin',{unique:true});}
    if(!d.objectStoreNames.contains('meta')){d.createObjectStore('meta',{keyPath:'key'});}
    if(!d.objectStoreNames.contains('attendance')){const a=d.createObjectStore('attendance',{keyPath:'id',autoIncrement:true}); a.createIndex('byStudent','studentId',{unique:false});}
  };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
});
async function tx(names,mode='readonly'){ if(!db) db=await openDB(); const t=db.transaction(names,mode); return {tx:t, stores:names.map(n=>t.objectStore(n))}; }

// ===== Meta helpers =====
async function getAdminPin(){ const {stores:[m]}=await tx(['meta']); return await new Promise(res=>{const r=m.get('adminPin'); r.onsuccess=()=>res(r.result?r.result.value:'0000'); r.onerror=()=>res('0000');});}
async function setAdminPin(v){ const {tx:t,stores:[m]}=await tx(['meta'],'readwrite'); await m.put({key:'adminPin',value:v}); return new Promise(res=>t.oncomplete=()=>res(true)); }
async function getVoiceEnabled(){ const {stores:[m]}=await tx(['meta']); return await new Promise(res=>{const r=m.get('voiceEnabled'); r.onsuccess=()=>res(r.result?!!r.result.value:true); r.onerror=()=>res(true);});}
async function setVoiceEnabled(v){ const {tx:t,stores:[m]}=await tx(['meta'],'readwrite'); await m.put({key:'voiceEnabled',value:!!v}); return new Promise(res=>t.oncomplete=()=>res(true)); }

// ===== Students =====
async function addOrUpdateStudent(s){ const {tx:t,stores:[st]}=await tx(['students'],'readwrite'); await st.put(s); return new Promise(res=>t.oncomplete=()=>res(true)); }
async function deleteStudent(id){ const {tx:t,stores:[st]}=await tx(['students'],'readwrite'); st.delete(id); return new Promise(res=>t.oncomplete=()=>res(true)); }
async function getStudentByPin(pin){ const {stores:[st]}=await tx(['students']); return await new Promise(res=>{const r=st.index('pin').get(pin); r.onsuccess=()=>res(r.result||null); r.onerror=()=>res(null);});}
async function getAllStudents(){ const {stores:[st]}=await tx(['students']); return await new Promise(res=>{const list=[]; const c=st.openCursor(); c.onsuccess=(e)=>{const cur=e.target.result; if(cur){list.push(cur.value); cur.continue();} else res(list);};});}

// ===== Attendance =====
async function logAttendance(studentId){ const {tx:t,stores:[att]}=await tx(['attendance'],'readwrite'); await att.add({studentId, ts:new Date().toISOString()}); return new Promise(res=>t.oncomplete=()=>res(true)); }

// ===== Utils =====
function pkgDefaultRemaining(type){ switch(type){ case 'suelta':return 1; case 'dos':return 2; case 'cuatro':return 4; case 'seis':return 6; case 'ocho':return 8; case 'diez':return 10; case 'doce':return 12; case 'mes':return 0; default:return 0; } }
function todayISO(){ const d=new Date(); const z=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())); return z.toISOString().slice(0,10); }
function formatDate(d){ return new Date(d).toLocaleDateString(); }

// ===== Voice (es-MX priority) =====
let userInteracted = false;

function updateVoiceStatus(){
  const el = document.getElementById('voice-status'); if(!el) return;
  if(!('speechSynthesis' in window)){ el.textContent = 'Voz no soportada en este dispositivo'; return; }
  const list = speechSynthesis.getVoices();
  const v = pickSpanishVoice();
  if (list && list.length) {
    el.textContent = v ? `Voz detectada: ${v.name} (${v.lang})` : `Voces disponibles: ${list.length}`;
  } else {
    el.textContent = 'Cargando voces… toca "Probar voz"';
  }
}

function pickSpanishVoice(){
  const list = speechSynthesis.getVoices() || [];
  let v = list.find(x=>/es\-MX/i.test(x.lang||'') || /mexico/i.test(x.name||''));
  if(!v) v = list.find(x=>/es\-419/i.test(x.lang||''));
  if(!v) v = list.find(x=>/^es/i.test(x.lang||''));
  if(!v && list.length) v = list[0];
  return v || null;
}
async function speak(text){
  try{
    const enabled = await getVoiceEnabled();
    if(!enabled || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickSpanishVoice();
    if(v) u.voice = v;
    u.rate = 1; u.pitch = 1; u.volume = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }catch(_){}
}
// iOS loads voices after interaction: bind once
window.addEventListener('click', ()=>{ userInteracted=true; if('speechSynthesis' in window){ speechSynthesis.getVoices(); updateVoiceStatus(); } }, {once:true});
window.addEventListener('touchstart', ()=>{ userInteracted=true; if('speechSynthesis' in window){ speechSynthesis.getVoices(); updateVoiceStatus(); } }, {once:true});

// ===== Views & Navigation (robust) =====
const views = {
  home: document.getElementById('view-home'),
  alumno: document.getElementById('view-alumno'),
  adminPin: document.getElementById('view-admin-pin'),
  admin: document.getElementById('view-admin'),
};
function show(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  id.classList.add('active');
  if(id===views.adminPin){
    document.querySelectorAll('#view-admin-pin .pin-box input').forEach(i=>i.value='');
    const msg=document.getElementById('admin-pin-msg'); if(msg) msg.textContent='';
  }
  if(id===views.alumno){
    document.querySelectorAll('#view-alumno .pin-box input').forEach(i=>i.value='');
    const msg=document.getElementById('alumno-msg'); if(msg) msg.textContent='';
  }
}

// ===== UI Bindings =====
document.getElementById('go-alumno').addEventListener('click',()=>{ if('speechSynthesis' in window){ speechSynthesis.getVoices(); updateVoiceStatus(); } show(views.alumno); });
document.getElementById('go-admin').addEventListener('click',()=>{ if('speechSynthesis' in window){ speechSynthesis.getVoices(); updateVoiceStatus(); } show(views.adminPin); });
document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>show(views.home)));

// iOS double-tap zoom guard
let __lastTouchEnd=0;
document.addEventListener('touchend', (e)=>{ const now=Date.now(); if(now-__lastTouchEnd<=300){ e.preventDefault(); } __lastTouchEnd=now; }, {passive:false});

// ===== Alumno keypad =====
const pinIds=['pin-1','pin-2','pin-3','pin-4'];
const pinInputs = pinIds.map(id=>document.getElementById(id));
const alumnoMsg = document.getElementById('alumno-msg');
function setAlumnoMsg(t,c=''){ alumnoMsg.textContent=t; alumnoMsg.className='msg '+c; }

document.querySelectorAll('[data-key]').forEach(btn=>btn.addEventListener('click', async ()=>{
  const k=btn.dataset.key;
  if(k==='del'){ for(let i=pinInputs.length-1;i>=0;i--){ if(pinInputs[i].value){ pinInputs[i].value=''; break; } } return; }
  if(k==='ok'){
    const pin=pinInputs.map(i=>i.value).join('');
    if(pin.length!==4){ setAlumnoMsg('Completa los 4 dígitos.','warn'); return; }
    const stu=await getStudentByPin(pin);
    if('speechSynthesis' in window){ speechSynthesis.getVoices(); updateVoiceStatus(); }
    if(!stu){ setAlumnoMsg('Código no encontrado. Pide soporte en recepción.','error'); await speak('Código no encontrado'); pinInputs.forEach(i=>i.value=''); return; }
    const today=todayISO();
    const inRange=(!stu.startDate||stu.startDate<=today)&&(!stu.endDate||stu.endDate>=today);
    if(!inRange){ setAlumnoMsg('Tu paquete no está vigente. Por favor reacude a recepción.','warn'); await speak('Paquete no vigente. Favor de pasar a recepción'); pinInputs.forEach(i=>i.value=''); return; }
    let wasOneLeft=false;
    if(stu.pkgType!=='mes'){
      if(!stu.remaining || stu.remaining<=0){ setAlumnoMsg('Ya no tienes clases restantes. Reagendar en recepción.','warn'); await speak('Acceso denegado. Ya no tienes clases disponibles. Pasa a recepción para reagendar'); pinInputs.forEach(i=>i.value=''); return; }
      if(stu.remaining===1){ wasOneLeft=true; }
      stu.remaining -= 1;
      await addOrUpdateStudent(stu);
    }
    await logAttendance(stu.id);
    if(wasOneLeft){
      setAlumnoMsg(`¡Acceso concedido, ${stu.name.split(' ')[0]}! Te quedaba 1 clase. Reagendar en recepción.`, 'warn');
      await speak('Acceso concedido. Te quedaba una clase. Pasa a recepción para reagendar');
    } else {
      setAlumnoMsg(`¡Acceso concedido, ${stu.name.split(' ')[0]}!`, 'success');
      await speak(`Acceso concedido, ${stu.name.split(' ')[0]}`);
    }
    setTimeout(()=>{ pinInputs.forEach(i=>i.value=''); setAlumnoMsg(''); show(views.home); }, 3000);
    return;
  }
  for(let i=0;i<pinInputs.length;i++){ if(!pinInputs[i].value){ pinInputs[i].value=k; break; } }
}));

// ===== Admin PIN keypad =====
const apIds=['apin-1','apin-2','apin-3','apin-4'];
const apInputs = apIds.map(id=>document.getElementById(id));
const adminPinMsg = document.getElementById('admin-pin-msg');
document.querySelectorAll('[data-apkey]').forEach(btn=>btn.addEventListener('click', async ()=>{
  const k=btn.dataset.apkey;
  if(k==='del'){ for(let i=apInputs.length-1;i>=0;i--){ if(apInputs[i].value){ apInputs[i].value=''; break; } } return; }
  if(k==='ok'){
    const pin=apInputs.map(i=>i.value).join('');
    const saved=await getAdminPin();
    if(pin===saved){ if('speechSynthesis' in window){ speechSynthesis.getVoices(); updateVoiceStatus(); } apInputs.forEach(i=>i.value=''); adminPinMsg.textContent=''; await refreshStudents(); initVoiceUI(); show(views.admin); }
    else { adminPinMsg.textContent='PIN incorrecto.'; apInputs.forEach(i=>i.value=''); }
    return;
  }
  for(let i=0;i<apInputs.length;i++){ if(!apInputs[i].value){ apInputs[i].value=k; break; } }
}));

// ===== Admin UI =====
const listEl=document.getElementById('students');
const dlgStudent=document.getElementById('dlg-student');
const formStudent=document.getElementById('form-student');
const dlgTitle=document.getElementById('dlg-title');
const photoInput=document.getElementById('photo-input');
const photoPreview=document.getElementById('photo-preview');
let editingStudent=null;

document.getElementById('btn-add').addEventListener('click',()=>{
  editingStudent=null; formStudent.reset(); photoPreview.src=''; delete photoPreview.dataset.dataUrl;
  const s=formStudent.elements;
  s.remaining.value=pkgDefaultRemaining(s.pkgType.value);
  s.startDate.value=todayISO();
  const d=new Date(s.startDate.value); d.setMonth(d.getMonth()+1); s.endDate.value=d.toISOString().slice(0,10);
  dlgTitle.textContent='Añadir alumno'; dlgStudent.showModal();
});

formStudent.elements.pkgType.addEventListener('change',(e)=>{
  formStudent.elements.remaining.value=pkgDefaultRemaining(e.target.value);
});

document.getElementById('btn-photo').addEventListener('click',()=>photoInput.click());
photoInput.addEventListener('change', async (e)=>{
  const file=e.target.files&&e.target.files[0]; if(!file) return;
  const img=new Image(); img.onload=()=>{
    const canvas=document.createElement('canvas'); const max=512;
    const ratio=Math.min(max/img.width,max/img.height,1);
    canvas.width=Math.round(img.width*ratio); canvas.height=Math.round(img.height*ratio);
    const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/jpeg',0.85);
    photoPreview.src=data; photoPreview.dataset.dataUrl=data;
  }; img.src=URL.createObjectURL(file);
});

document.getElementById('btn-save-student').addEventListener('click', async (e)=>{
  e.preventDefault();
  const f=formStudent.elements;
  if(!f.name.value.trim() || !/^\d{4}$/.test(f.pin.value)){ alert('Nombre y PIN de 4 dígitos son obligatorios.'); return; }
  const stu=editingStudent||{id:undefined};
  Object.assign(stu,{
    name:f.name.value.trim(), pin:f.pin.value.trim(),
    phone:f.phone.value.trim(), emergency:f.emergency.value.trim(),
    birthdate:f.birthdate.value||null, address:f.address.value.trim(), payment:f.payment.value,
    pkgType:f.pkgType.value, startDate:f.startDate.value, endDate:f.endDate.value,
    remaining:Number(f.remaining.value||0), photo:photoPreview.dataset.dataUrl||stu.photo||null, active:true,
  });
  try{
    await addOrUpdateStudent(stu); dlgStudent.close(); await refreshStudents();
    // Si se acaba de crear y queda 1 clase, ofrecer reagendar
    const justSaved = (editingStudent===null) ? (await getStudentByPin(stu.pin)) : stu;
    if(justSaved && justSaved.pkgType!=='mes' && Number(justSaved.remaining)===1){
      if(confirm('Falta 1 clase para este alumno. ¿Quieres reagendar ahora?')) openResched(justSaved);
    }
    editingStudent=null;
  }catch(err){ alert('Error guardando: '+err.message); }
});

async function refreshStudents(){
  const all=await getAllStudents();
  listEl.innerHTML='';
  if(!all.length){ listEl.innerHTML='<p class="muted">Aún no hay alumnos.</p>'; updateAdminAlerts([]); return; }
  const oneLeft=[];
  for(const s of all){
    const card=document.createElement('div'); card.className='card';
    const remainText=s.pkgType==='mes' ? `${formatDate(s.startDate)} → ${formatDate(s.endDate)}` : `${s.remaining} clases restantes`;
    const badge=(s.pkgType!=='mes' && Number(s.remaining)===1)?'<span class="badge">¡Falta 1 clase!</span>':'';
    card.innerHTML=`
      <img src="${s.photo||''}" alt="Foto de ${s.name}">
      <h4>${s.name} ${badge}</h4>
      <div class="muted">PIN: ${s.pin}</div>
      <div class="muted">Paquete: ${s.pkgType.toUpperCase()} — ${remainText}</div>
      <menu>
        <button data-act="edit">Editar</button>
        <button data-act="resched">Reagendar</button>
        <button data-act="delete" class="danger">Eliminar</button>
      </menu>`;
    card.querySelector('[data-act="edit"]').addEventListener('click',()=>openEdit(s));
    card.querySelector('[data-act="resched"]').addEventListener('click',()=>openResched(s));
    card.querySelector('[data-act="delete"]').addEventListener('click',async()=>{ if(confirm('¿Eliminar este alumno?')){ await deleteStudent(s.id); await refreshStudents(); } });
    if(s.pkgType!=='mes' && Number(s.remaining)===1) oneLeft.push(s);
    listEl.appendChild(card);
  }
  updateAdminAlerts(oneLeft);
}
function updateAdminAlerts(list){
  const banner=document.getElementById('admin-alerts');
  if(list.length){ banner.classList.add('active'); const items=list.map(s=>`• ${s.name} (PIN ${s.pin})`).join('<br>');
    banner.innerHTML=`<h4>Atención — Falta 1 clase</h4><div class="muted">Estos alumnos están por terminar su paquete:</div><div style="margin-top:6px">${items}</div>`;
  } else { banner.classList.remove('active'); banner.innerHTML=''; }
}

function openEdit(s){
  editingStudent=s;
  const f=formStudent.elements;
  document.getElementById('dlg-title').textContent='Editar alumno';
  f.name.value=s.name||''; f.pin.value=s.pin||''; f.phone.value=s.phone||''; f.emergency.value=s.emergency||'';
  f.birthdate.value=s.birthdate||''; f.address.value=s.address||''; f.payment.value=s.payment||'';
  f.pkgType.value=s.pkgType||'suelta'; f.startDate.value=s.startDate||todayISO(); f.endDate.value=s.endDate||todayISO();
  f.remaining.value=s.remaining||pkgDefaultRemaining(f.pkgType.value);
  photoPreview.src=s.photo||''; photoPreview.dataset.dataUrl=s.photo||'';
  dlgStudent.showModal();
}

const dlgRes=document.getElementById('dlg-resched');
const formRes=document.getElementById('form-resched');
let resTarget=null;
function openResched(s){
  resTarget=s;
  const f=formRes.elements;
  f.pkgType.value=s.pkgType; f.startDate.value=todayISO(); const d=new Date(f.startDate.value); d.setMonth(d.getMonth()+1); f.endDate.value=d.toISOString().slice(0,10);
  f.remaining.value=pkgDefaultRemaining(f.pkgType.value);
  dlgRes.showModal();
}
document.getElementById('btn-resched-save').addEventListener('click', async (e)=>{
  e.preventDefault();
  const f=formRes.elements; if(!resTarget) return;
  resTarget.pkgType=f.pkgType.value; resTarget.startDate=f.startDate.value; resTarget.endDate=f.endDate.value; resTarget.remaining=Number(f.remaining.value||0);
  await addOrUpdateStudent(resTarget); dlgRes.close(); await refreshStudents();
});

// Export/Import/Reset
document.getElementById('btn-export').addEventListener('click', async ()=>{
  const [students,pin]=[await getAllStudents(), await getAdminPin()];
  const data={when:new Date().toISOString(), adminPin:pin, students, version:1};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`adnh-respaldo-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
});
document.getElementById('file-import').addEventListener('change', async (e)=>{
  const file=e.target.files&&e.target.files[0]; if(!file) return;
  if(!confirm('Esto reemplazará tu lista de alumnos. ¿Continuar?')) return;
  const text=await file.text(); const data=JSON.parse(text);
  const {tx:t,stores:[st,meta]}=await tx(['students','meta'],'readwrite');
  await new Promise(res=>{ const cr=st.clear(); cr.onsuccess=()=>res(); cr.onerror=()=>res(); });
  if(Array.isArray(data.students)){ for(const s of data.students){ delete s.id; await st.add(s); } }
  if(data.adminPin){ await meta.put({key:'adminPin',value:data.adminPin}); }
  await new Promise(res=>t.oncomplete=()=>res()); await refreshStudents(); alert('Datos importados.');
});
document.getElementById('btn-reset').addEventListener('click', async ()=>{
  if(!confirm('Reiniciar app (borra alumnos y ajustes)?')) return;
  if(db) db.close(); await indexedDB.deleteDatabase(DB_NAME); db=null; location.reload();
});

// Voice toggle UI
function initVoiceUI(){
  const chk=document.getElementById('voice-enabled'); if(!chk) return;
  getVoiceEnabled().then(v=>{ chk.checked=v; updateVoiceStatus(); });
  chk.onchange=()=>setVoiceEnabled(chk.checked);
  document.getElementById('btn-test-voice').onclick=()=>{ setVoiceEnabled(true); chk.checked=true; if('speechSynthesis' in window){ speechSynthesis.getVoices(); } setTimeout(()=>{ updateVoiceStatus(); speak('Prueba de voz: Español México'); }, 200); };
}
// In case voices load later
if('speechSynthesis' in window){ speechSynthesis.onvoiceschanged=()=>{ speechSynthesis.getVoices(); updateVoiceStatus(); }; }

// PWA
if('serviceWorker' in navigator){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }); }
