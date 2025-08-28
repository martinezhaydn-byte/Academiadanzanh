// ===== IndexedDB =====
const DB_NAME='adnh-renovada-db'; const DB_VERSION=1;
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
async function getVoiceChoice(){ const {stores:[m]} = await tx(['meta']); return await new Promise(res=>{ const r=m.get('voiceChoice'); r.onsuccess=()=>res(r.result?r.result.value:null); r.onerror=()=>res(null); }); }
async function setVoiceChoice(id){ const {tx:t,stores:[m]} = await tx(['meta'],'readwrite'); await m.put({key:'voiceChoice', value:id}); return new Promise(res=>t.oncomplete=()=>res(true)); }

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

// ===== Voice (Spanish clear) =====
function defaultSpanishVoice(list){
  // Prefer es-ES (claro), then any es-*, then es-419, then es-MX
  let v=list.find(x=>/es\-ES/i.test(x.lang||'') || /Spain/i.test(x.name||''));
  if(!v) v=list.find(x=>/^es/i.test(x.lang||''));
  if(!v) v=list.find(x=>/es\-419/i.test(x.lang||''));
  if(!v) v=list.find(x=>/es\-MX/i.test(x.lang||''));
  return v || list[0];
}
async function pickPreferredVoice(){
  if(!('speechSynthesis' in window)) return null;
  const list=speechSynthesis.getVoices()||[]; if(!list.length) return null;
  const choice=await getVoiceChoice();
  if(choice){ const chosen=list.find(x=>(x.name+'|'+(x.lang||'')).toLowerCase()===choice.toLowerCase()); if(chosen) return chosen; }
  return defaultSpanishVoice(list);
}
async function speak(text){
  try{
    const enabled = await getVoiceEnabled();
    if(!enabled || !('speechSynthesis' in window)) return;
    const u=new SpeechSynthesisUtterance(text);
    const v=await pickPreferredVoice(); if(v) u.voice=v;
    u.rate=1; u.pitch=1; u.volume=1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }catch(_){}
}
function updateVoiceStatus(){
  const el=document.getElementById('voice-status'); if(!el) return;
  if(!('speechSynthesis' in window)){ el.textContent='(voz no soportada)'; return; }
  const list=speechSynthesis.getVoices()||[]; const v=list.length? defaultSpanishVoice(list): null;
  el.textContent = list.length ? `Voces: ${list.length} • Predeterminada: ${v ? v.name+' ('+v.lang+')' : '—'}` : 'Cargando voces…';
}
function populateVoiceSelect(){
  const sel=document.getElementById('voice-select'); if(!sel) return;
  sel.innerHTML='';
  if(!('speechSynthesis' in window)){ sel.disabled=true; return; }
  const list=speechSynthesis.getVoices()||[];
  for(const v of list){
    const opt=document.createElement('option'); opt.value=v.name+'|'+(v.lang||''); opt.textContent=`${v.name} (${v.lang||'?'})`; sel.appendChild(opt);
  }
  getVoiceChoice().then(async saved=>{
    let target=saved;
    if(!target && list.length){ const dv=defaultSpanishVoice(list); target=dv? dv.name+'|'+(dv.lang||''): null; if(target) await setVoiceChoice(target); }
    if(target){ const i=Array.from(sel.options).findIndex(o=>o.value.toLowerCase()===target.toLowerCase()); if(i>=0) sel.selectedIndex=i; }
    updateVoiceStatus();
  });
  sel.onchange=async()=>{ await setVoiceChoice(sel.value); updateVoiceStatus(); setTimeout(()=>speak('Voz configurada.'),150); };
}
window.addEventListener('click', ()=>{ if('speechSynthesis' in window){ speechSynthesis.getVoices(); updateVoiceStatus(); } }, {once:true});
if('speechSynthesis' in window){ speechSynthesis.onvoiceschanged=()=>{ speechSynthesis.getVoices(); populateVoiceSelect(); updateVoiceStatus(); }; }

// ===== Views & Navigation =====
const views={ home:document.getElementById('view-home'), alumno:document.getElementById('view-alumno'), adminPin:document.getElementById('view-admin-pin'), admin:document.getElementById('view-admin') };
function show(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  id.classList.add('active');
  if(id===views.adminPin){ document.querySelectorAll('#view-admin-pin .pin-box input').forEach(i=>i.value=''); const m=document.getElementById('admin-pin-msg'); if(m) m.textContent=''; }
  if(id===views.alumno){
    document.querySelectorAll('#view-alumno .pin-box input').forEach(i=>i.value='');
    const msg=document.getElementById('alumno-msg'); if(msg) msg.textContent='';
    // Clear alumno panel (foto + nombre + paquete)
    const panel=document.getElementById('alumno-panel'); panel.classList.remove('active');
    document.getElementById('alumno-foto').src=''; document.getElementById('alumno-nombre').textContent=''; document.getElementById('alumno-paquete').textContent='';
  }
}
document.getElementById('go-alumno').addEventListener('click',()=>show(views.alumno));
document.getElementById('go-admin').addEventListener('click',()=>show(views.adminPin));
document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>show(views.home)));

// iOS double-tap zoom guard
let __lastTouchEnd=0; document.addEventListener('touchend', (e)=>{ const now=Date.now(); if(now-__lastTouchEnd<=300){ e.preventDefault(); } __lastTouchEnd=now; }, {passive:false});

// ===== Alumno keypad =====
const pinIds=['pin-1','pin-2','pin-3','pin-4']; const pinInputs=pinIds.map(id=>document.getElementById(id));
const alumnoMsg=document.getElementById('alumno-msg');
function setAlumnoMsg(t,c=''){ alumnoMsg.textContent=t; alumnoMsg.className='msg '+c; }
const alumnoPanel=document.getElementById('alumno-panel'); const alumnoFoto=document.getElementById('alumno-foto'); const alumnoNombre=document.getElementById('alumno-nombre'); const alumnoPaquete=document.getElementById('alumno-paquete');

document.querySelectorAll('[data-key]').forEach(btn=>btn.addEventListener('click', async ()=>{
  const k=btn.dataset.key;
  if(k==='del'){ for(let i=pinInputs.length-1;i>=0;i--){ if(pinInputs[i].value){ pinInputs[i].value=''; break; } } return; }
  if(k==='ok'){
    const pin=pinInputs.map(i=>i.value).join('');
    if(pin.length!==4){ setAlumnoMsg('Completa los 4 dígitos.','warn'); return; }
    const stu=await getStudentByPin(pin);
    if(!stu){ setAlumnoMsg('Código no encontrado. Pide soporte en recepción.','error'); await speak('Código no encontrado'); pinInputs.forEach(i=>i.value=''); return; }
    const today=todayISO();
    const inRange=(!stu.startDate||stu.startDate<=today)&&(!stu.endDate||stu.endDate>=today);
    if(!inRange){ setAlumnoMsg('Tu paquete no está vigente. Por favor reacude a recepción.','warn'); await speak('Paquete no vigente. Favor de pasar a recepción'); pinInputs.forEach(i=>i.value=''); return; }

    let wasOneLeft=false;
    if(stu.pkgType!=='mes'){
      if(!stu.remaining || stu.remaining<=0){ setAlumnoMsg('Ya no tienes clases restantes. Reagendar en recepción.','warn'); await speak('Acceso denegado. Ya no tienes clases disponibles. Pasa a recepción para reagendar'); pinInputs.forEach(i=>i.value=''); return; }
      if(stu.remaining===1){ wasOneLeft=true; stu.renewalReady = true; } // marcar que está listo para renovar
      stu.remaining -= 1;
      await addOrUpdateStudent(stu);
    }
    // Mostrar foto/nombre/paquete durante el acceso
    alumnoFoto.src = stu.photo || '';
    alumnoNombre.textContent = stu.name || '';
    alumnoPaquete.textContent = (stu.pkgType==='mes') ? `Mes: ${formatDate(stu.startDate)} → ${formatDate(stu.endDate)}` : `Clases restantes: ${stu.remaining}`;
    alumnoPanel.classList.add('active');

    await logAttendance(stu.id);
    if(wasOneLeft){
      setAlumnoMsg(`¡Acceso concedido, ${stu.name.split(' ')[0]}! Te quedaba 1 clase. Reagendar en recepción (con pago).`, 'warn');
      await speak('Acceso concedido. Te quedaba una clase. Pasa a recepción para renovar con pago');
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
const apIds=['apin-1','apin-2','apin-3','apin-4']; const apInputs=apIds.map(id=>document.getElementById(id)); const adminPinMsg=document.getElementById('admin-pin-msg');
document.querySelectorAll('[data-apkey]').forEach(btn=>btn.addEventListener('click', async ()=>{
  const k=btn.dataset.apkey;
  if(k==='del'){ for(let i=apInputs.length-1;i>=0;i--){ if(apInputs[i].value){ apInputs[i].value=''; break; } } return; }
  if(k==='ok'){
    const pin=apInputs.map(i=>i.value).join('');
    const saved=await getAdminPin();
    if(pin===saved){ apInputs.forEach(i=>i.value=''); adminPinMsg.textContent=''; await refreshStudents(); initVoiceUI(); show(views.admin); }
    else { adminPinMsg.textContent='PIN incorrecto.'; apInputs.forEach(i=>i.value=''); }
    return;
  }
  for(let i=0;i<apInputs.length;i++){ if(!apInputs[i].value){ apInputs[i].value=k; break; } }
}));

// ===== Admin UI =====
const listEl=document.getElementById('students'); const dlgStudent=document.getElementById('dlg-student'); const formStudent=document.getElementById('form-student'); const dlgTitle=document.getElementById('dlg-title'); const photoInput=document.getElementById('photo-input'); const photoPreview=document.getElementById('photo-preview');
let editingStudent=null;

document.getElementById('btn-add').addEventListener('click',()=>{
  editingStudent=null; formStudent.reset(); photoPreview.src=''; delete photoPreview.dataset.dataUrl;
  const s=formStudent.elements; s.remaining.value=pkgDefaultRemaining(s.pkgType.value); s.startDate.value=todayISO(); const d=new Date(s.startDate.value); d.setMonth(d.getMonth()+1); s.endDate.value=d.toISOString().slice(0,10);
  dlgTitle.textContent='Añadir alumno'; dlgStudent.showModal();
});
formStudent.elements.pkgType.addEventListener('change',(e)=>{ formStudent.elements.remaining.value=pkgDefaultRemaining(e.target.value); });
document.getElementById('btn-photo').addEventListener('click',()=>photoInput.click());
photoInput.addEventListener('change', async (e)=>{
  const file=e.target.files&&e.target.files[0]; if(!file) return;
  const img=new Image(); img.onload=()=>{ const canvas=document.createElement('canvas'); const max=512; const ratio=Math.min(max/img.width,max/img.height,1); canvas.width=Math.round(img.width*ratio); canvas.height=Math.round(img.height*ratio); const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,canvas.width,canvas.height); const data=canvas.toDataURL('image/jpeg',0.85); photoPreview.src=data; photoPreview.dataset.dataUrl=data; }; img.src=URL.createObjectURL(file);
});
document.getElementById('btn-save-student').addEventListener('click', async (e)=>{
  e.preventDefault(); const f=formStudent.elements; if(!f.name.value.trim() || !/^\d{4}$/.test(f.pin.value)){ alert('Nombre y PIN de 4 dígitos son obligatorios.'); return; }
  const stu=editingStudent||{id:undefined}; Object.assign(stu,{ name:f.name.value.trim(), pin:f.pin.value.trim(), phone:f.phone.value.trim(), emergency:f.emergency.value.trim(), birthdate:f.birthdate.value||null, address:f.address.value.trim(), payment:f.payment.value, pkgType:f.pkgType.value, startDate:f.startDate.value, endDate:f.endDate.value, remaining:Number(f.remaining.value||0), photo:photoPreview.dataset.dataUrl||stu.photo||null, payments: (stu.payments||[]), active:true });
  try{ await addOrUpdateStudent(stu); dlgStudent.close(); await refreshStudents(); editingStudent=null; }catch(err){ alert('Error guardando: '+err.message); }
});

async function refreshStudents(){
  const all=await getAllStudents(); listEl.innerHTML=''; if(!all.length){ listEl.innerHTML='<p class="muted">Aún no hay alumnos.</p>'; updateAdminAlerts([]); return; }
  const oneLeft=[];
  for(const s of all){
    const card=document.createElement('div'); card.className='card';
    const remainText=s.pkgType==='mes' ? `${formatDate(s.startDate)} → ${formatDate(s.endDate)}` : `${s.remaining} clases restantes`;
    const badge=(s.pkgType!=='mes' && (Number(s.remaining)===1 || s.renewalReady))?'<span class="badge">¡Falta 1 clase!</span>':'';
    card.innerHTML=`
      <img src="${s.photo||''}" alt="Foto de ${s.name}">
      <h4>${s.name} ${badge}</h4>
      <div class="muted">PIN: ${s.pin}</div>
      <div class="muted">Paquete: ${s.pkgType.toUpperCase()} — ${remainText}</div>
      <menu>
        <button data-act="edit">Editar</button>
        <button data-act="pay-renew" title="Registrar pago y reagendar">Registrar pago y Reagendar</button>
        <button data-act="payments">Pagos</button>
        <button data-act="resched">Reagendar</button>
        <button data-act="delete" class="danger">Eliminar</button>
      </menu>`;
    card.querySelector('[data-act="edit"]').addEventListener('click',()=>openEdit(s));
    card.querySelector('[data-act="pay-renew"]').addEventListener('click',()=>payAndResched(s));
    card.querySelector('[data-act="resched"]').addEventListener('click',()=>guardedResched(s));
    card.querySelector('[data-act="payments"]').addEventListener('click',()=>openPaymentsList(s));
    card.querySelector('[data-act="delete"]').addEventListener('click',async()=>{ if(confirm('¿Eliminar este alumno?')){ await deleteStudent(s.id); await refreshStudents(); } });
    if(s.pkgType!=='mes' && (Number(s.remaining)===1 || s.renewalReady)) oneLeft.push(s);
    listEl.appendChild(card);
  }
  updateAdminAlerts(oneLeft);
}
function updateAdminAlerts(list){
  const banner=document.getElementById('admin-alerts');
  if(list.length){ banner.classList.add('active'); const items=list.map(s=>`• ${s.name} (PIN ${s.pin})`).join('<br>'); banner.innerHTML=`<h4>Atención — Falta 1 clase</h4><div class="muted">Solo se puede reagendar con pago registrado:</div><div style="margin-top:6px">${items}</div>`; }
  else { banner.classList.remove('active'); banner.innerHTML=''; }
}

function openEdit(s){
  editingStudent=s; const f=formStudent.elements; document.getElementById('dlg-title').textContent='Editar alumno';
  f.name.value=s.name||''; f.pin.value=s.pin||''; f.phone.value=s.phone||''; f.emergency.value=s.emergency||''; f.birthdate.value=s.birthdate||''; f.address.value=s.address||''; f.payment.value=s.payment||''; f.pkgType.value=s.pkgType||'suelta'; f.startDate.value=s.startDate||todayISO(); f.endDate.value=s.endDate||todayISO(); f.remaining.value=s.remaining||pkgDefaultRemaining(f.pkgType.value); photoPreview.src=s.photo||''; photoPreview.dataset.dataUrl=s.photo||''; dlgStudent.showModal();
}

// --- Reagendar con control de pago ---
const dlgRes=document.getElementById('dlg-resched'); const formRes=document.getElementById('form-resched'); let resTarget=null;
function guardedResched(s){
  // Solo permitir si pagó y está en renovación (o si admin insiste, puede usar pay-renew)
  if(s.pkgType!=='mes' && (s.renewalReady || Number(s.remaining)<=0)){
    if(!s.renewalPaidAt){ alert('Debes registrar el nuevo pago antes de reagendar. Usa "Registrar pago y Reagendar".'); return; }
  }
  openResched(s);
}
function openResched(s){
  resTarget=s; const f=formRes.elements; f.pkgType.value=s.pkgType; f.startDate.value=todayISO(); const d=new Date(f.startDate.value); d.setMonth(d.getMonth()+1); f.endDate.value=d.toISOString().slice(0,10); f.remaining.value=pkgDefaultRemaining(f.pkgType.value);
  const note=document.getElementById('resched-note'); if(s.pkgType!=='mes') note.textContent = s.renewalPaidAt ? 'Pago registrado. Continúa con la renovación.' : 'Requiere pago registrado: usa "Registrar pago y Reagendar".';
  dlgRes.showModal();
}
document.getElementById('btn-resched-save').addEventListener('click', async (e)=>{
  e.preventDefault(); const f=formRes.elements; if(!resTarget) return;
  // Si es renovación de paquetes por clases, exigir pago
  if(resTarget.pkgType!=='mes' && (resTarget.renewalReady || Number(resTarget.remaining)<=0) && !resTarget.renewalPaidAt){
    alert('No puedes reagendar sin registrar el nuevo pago.'); return;
  }
  resTarget.pkgType=f.pkgType.value; resTarget.startDate=f.startDate.value; resTarget.endDate=f.endDate.value; resTarget.remaining=Number(f.remaining.value||0);
  // Reset flags tras renovar
  resTarget.renewalReady=false; resTarget.renewalPaidAt=null;
  await addOrUpdateStudent(resTarget); dlgRes.close(); await refreshStudents();
});


// ===== Payments feature =====
const dlgPayments = document.getElementById('dlg-payments');
const formPayments = document.getElementById('form-payments');
const paymentsTable = document.getElementById('payments-table');
const dlgPayment = document.getElementById('dlg-payment');
const formPayment = document.getElementById('form-payment');
let paymentsTarget = null;
let continueToResched = false;

function fmtMoney(n){ try{ return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(n||0)); }catch(_){ return '$'+Number(n||0); } }
function fmtDateTime(iso){ const d=new Date(iso); return d.toLocaleString(); }

function openPaymentsList(stu){
  paymentsTarget = stu;
  renderPaymentsList();
  dlgPayments.showModal();
}
function renderPaymentsList(){
  const stu = paymentsTarget; if(!stu) return;
  const rows = (stu.payments||[]).slice().reverse().map(p=>`<tr><td>${fmtDateTime(p.ts)}</td><td>${fmtMoney(p.amount)}</td><td>${p.method||''}</td><td>${(p.note||'')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin pagos registrados.</td></tr>';
  paymentsTable.innerHTML = `<table><thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Nota</th></tr></thead><tbody>${rows}</tbody></table>`;
}

document.getElementById('btn-add-payment').addEventListener('click', ()=>{
  if(!paymentsTarget) return;
  formPayment.reset();
  continueToResched = false;
  dlgPayment.showModal();
});

document.getElementById('btn-save-payment').addEventListener('click', async (e)=>{
  e.preventDefault();
  if(!paymentsTarget) return;
  const f=formPayment.elements;
  if(!f.amount.value){ alert('Captura el monto.'); return; }
  const entry = { ts:new Date().toISOString(), amount:Number(f.amount.value), method:f.method.value, note:(f.note.value||'') };
  paymentsTarget.payments = paymentsTarget.payments || [];
  paymentsTarget.payments.push(entry);
  paymentsTarget.renewalPaidAt = entry.ts;
  // Si estaba listo para renovación (1 clase), mantener la marca; si no, no importa
  await addOrUpdateStudent(paymentsTarget);
  dlgPayment.close();
  renderPaymentsList();
  await refreshStudents();
  if(continueToResched){ openResched(paymentsTarget); }
});

// Hook for "Registrar pago y Reagendar" -> open payment dialog and continue to resched after save
async function payAndResched(s){
  paymentsTarget = s;
  continueToResched = true;
  formPayment.reset();
  dlgPayment.showModal();
}

// From the list, admin can still open "Registrar pago y Reagendar" by closing list and clicking the card button.

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

// Voice UI
function initVoiceUI(){
  const chk=document.getElementById('voice-enabled'); if(!chk) return;
  getVoiceEnabled().then(v=>{ chk.checked=v; populateVoiceSelect(); updateVoiceStatus(); });
  chk.onchange=()=>setVoiceEnabled(chk.checked);
  document.getElementById('btn-test-voice').onclick=()=>{ setVoiceEnabled(true); chk.checked=true; if('speechSynthesis' in window){ speechSynthesis.getVoices(); } setTimeout(()=>{ updateVoiceStatus(); speak('Prueba de voz en español'); }, 200); };
}

// PWA
if('serviceWorker' in navigator){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }); }
