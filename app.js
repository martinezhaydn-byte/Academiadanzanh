(function(){
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const DB=['students','packages','enrollments','attendance','payments','events','pins'];
const CFG_KEY='app_config';

function loadConfig(){
  const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
  return {
    brand_name: c.brand_name || 'Academia NH',
    primary: c.primary || '#EFB8C8',
    accent: c.accent || '#111827',
    admin_pin: c.admin_pin || '1234',
    default_class: c.default_class || 'General',
    voice_ok: c.voice_ok || 'Acceso otorgado',
    voice_deny: c.voice_deny || 'Acceso denegado'
  };
}
function saveConfig(c){ localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
let config = loadConfig();
let currentMode = 'alumno';
let kioskClearTimer = null;
let lastKioskStudentId = null;
let autoPendingPaymentFlag = false; // set when click "Reagendar"

function applyBrand(){
  document.documentElement.style.setProperty('--primary', config.primary);
  document.documentElement.style.setProperty('--accent', config.accent);
  const title = $('#brand-title'); if(title) title.textContent = config.brand_name;
  document.title = config.brand_name;
}
function switchToTab(tabId){
  $$('#tabs button').forEach(x=>x.classList.remove('active'));
  $(`#tabs button[data-tab="${tabId}"]`)?.classList.add('active');
  $$('.tab').forEach(s=>s.classList.remove('active'));
  $('#'+tabId)?.classList.add('active');
}
function applyModeToUI(){
  $$('#tabs [data-admin]').forEach(el=>{ el.style.display = (currentMode==='admin') ? '' : 'none'; });
  const attendanceBtn = $('#tabs button[data-tab="attendance"]');
  if(currentMode==='admin'){
    if(attendanceBtn){ attendanceBtn.style.display='none'; }
    if($('#attendance').classList.contains('active')){ switchToTab('enrollments'); }
  } else {
    if(attendanceBtn){ attendanceBtn.style.display=''; }
    switchToTab('attendance');
  }
  $('#form-attendance').style.display = 'none';
  $$('.pin-cell, .only-admin').forEach(td=>{ td.style.display = (currentMode==='admin') ? '' : 'none'; });
  renderAttendanceHead();
}

function speak(text){
  try{
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const es = voices.find(v => /es-|Spanish|español/i.test((v.lang||'') + v.name));
    if(es) u.voice = es;
    u.rate = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }catch(e){}
}

function uid(p='id'){return p+'_'+Math.random().toString(36).slice(2,10)}
function todayISO(){return new Date().toISOString().slice(0,10)}
function parseISO(d){return d? new Date(d+'T00:00:00') : null}
function fmtISO(date){ return date.toISOString().slice(0,10); }

function load(){const db={};for(const k of DB){const raw=localStorage.getItem(k);db[k]=raw?JSON.parse(raw):[]}if(db.packages.length===0){db.packages=[
  {package_id:'CLS1', name:'Clase suelta', classes_included:1, valid_days:7, price_mxn:100},
  {package_id:'PCK2', name:'2 clases', classes_included:2, valid_days:30, price_mxn:180},
  {package_id:'PCK3', name:'3 clases', classes_included:3, valid_days:30, price_mxn:270},
  {package_id:'PCK4', name:'4 clases', classes_included:4, valid_days:30, price_mxn:360},
  {package_id:'PCK5', name:'5 clases', classes_included:5, valid_days:30, price_mxn:450},
  {package_id:'PCK6', name:'6 clases', classes_included:6, valid_days:30, price_mxn:540},
  {package_id:'PCK7', name:'7 clases', classes_included:7, valid_days:30, price_mxn:630},
  {package_id:'PCK8', name:'8 clases', classes_included:8, valid_days:30, price_mxn:720},
  {package_id:'PCK9', name:'9 clases', classes_included:9, valid_days:30, price_mxn:810},
  {package_id:'PCK10',name:'10 clases',classes_included:10,valid_days:30, price_mxn:900},
  {package_id:'PCK11',name:'11 clases',classes_included:11,valid_days:30, price_mxn:990},
  {package_id:'PCK12',name:'12 clases',classes_included:12,valid_days:30, price_mxn:1080}
]}save(db);return db}
function save(db){for(const k of DB){localStorage.setItem(k,JSON.stringify(db[k]||[]))}}
const db=load();

function getPinByStudentId(sid){ return db.pins.find(p=>p.student_id===sid) || null; }
function setPinForStudent(sid, pin){ const ex=getPinByStudentId(sid); if(ex) ex.pin=pin; else db.pins.push({student_id:sid,pin}); save(db); }
function isPinInUse(pin){ return !!db.pins.find(p=>p.pin===pin); }
function generateUniquePin(){ let p; do{ p=Math.floor(Math.random()*10000).toString().padStart(4,'0'); }while(isPinInUse(p)); return p; }
async function fileToDataURLResized(file, maxSize=340, quality=0.82){
  return await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>h){ if(w>maxSize){ h*=maxSize/w; w=maxSize; } } else { if(h>maxSize){ w*=maxSize/h; h=maxSize; } }
      const c=document.createElement('canvas'); c.width=Math.round(w); c.height=Math.round(h);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      resolve(c.toDataURL('image/jpeg',quality));
    };
    img.onerror=reject;
    img.src=URL.createObjectURL(file);
  });
}

$$('#tabs button[data-tab]').forEach(b=>b.addEventListener('click',()=>{
  $$('#tabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const t=b.dataset.tab;
  $$('.tab').forEach(s=>s.classList.remove('active'));
  $('#'+t).classList.add('active');
  renderAll();
}));
$('#mode-switch').value = currentMode;
$('#mode-switch').addEventListener('change', ()=>{
  const target = $('#mode-switch').value;
  if(target==='admin'){
    const pin = prompt('PIN de Admin:');
    if(pin === config.admin_pin){ currentMode='admin'; }
    else { alert('PIN incorrecto'); $('#mode-switch').value='alumno'; currentMode='alumno'; }
  } else { currentMode='alumno'; }
  applyModeToUI();
});

$('#btn-export')?.addEventListener('click',()=>{
  const data={}; for(const k of DB){ data[k]=db[k]; }
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='academia_nh_backup.json'; a.click(); URL.revokeObjectURL(a.href);
});
$('#btn-import')?.addEventListener('click',()=>$('#file-import').click());
$('#file-import')?.addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{ const t=await f.text(); const d=JSON.parse(t); for(const k of DB){ db[k]=Array.isArray(d[k])?d[k]:[] } save(db); alert('Importado'); renderAll(); }
  catch(err){ alert('Archivo inválido') }
  finally{ e.target.value='' }
});

$('#cfg-brand-name').value = config.brand_name;
$('#cfg-primary').value = config.primary;
$('#cfg-accent').value = config.accent;
$('#cfg-admin-pin').value = config.admin_pin;
$('#cfg-default-class').value = config.default_class;
$('#cfg-voice-ok').value = config.voice_ok;
$('#cfg-voice-deny').value = config.voice_deny;
$('#cfg-save').addEventListener('click',()=>{
  const pin=$('#cfg-admin-pin').value.trim();
  if(!/^\d{4}$/.test(pin)){ alert('PIN de admin inválido'); return; }
  config={
    brand_name: $('#cfg-brand-name').value || 'Academia NH',
    primary: $('#cfg-primary').value || '#EFB8C8',
    accent: $('#cfg-accent').value || '#111827',
    admin_pin: pin,
    default_class: $('#cfg-default-class').value || 'General',
    voice_ok: $('#cfg-voice-ok').value || 'Acceso otorgado',
    voice_deny: $('#cfg-voice-deny').value || 'Acceso denegado'
  };
  saveConfig(config);
  applyBrand();
  alert('Configuración guardada');
});

let pendingPhotoData = '';
$('#student-photo')?.addEventListener('change', async (e)=>{
  const f=e.target.files[0]; if(!f) return;
  try{ pendingPhotoData = await fileToDataURLResized(f, 340, 0.82); }catch(err){ alert('No se pudo procesar la foto'); pendingPhotoData=''; }
});
$('#form-student').addEventListener('submit',e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const s=Object.fromEntries(fd.entries());
  s.student_id=uid('stu');
  if(pendingPhotoData){ s.photo_data = pendingPhotoData; pendingPhotoData=''; $('#student-photo').value=''; }
  db.students.push(s); save(db); e.target.reset(); renderAll();
});
function renderStudents(){
  const tb=$('#table-students tbody'); tb.innerHTML='';
  for(const s of db.students){
    const rec=getPinByStudentId(s.student_id); const pin=rec?rec.pin:'—';
    const photo = s.photo_data ? `<img src="${s.photo_data}" alt="foto" class="tbl-photo" />` : '—';
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${photo}</td>
      <td>${s.full_name||''}</td>
      <td>${s.age||''}</td>
      <td>${s.phone||''}</td>
      <td>${[s.emergency_contact_name,s.emergency_contact_phone].filter(Boolean).join(' / ')}</td>
      <td class="pin-cell"><strong>${pin}</strong>
        <button data-act="setpin" data-id="${s.student_id}">PIN</button>
        <button data-act="genpin" data-id="${s.student_id}">Auto-PIN</button>
        <button data-act="copypin" data-id="${s.student_id}">Copiar</button>
      </td>
      <td>
        <button data-act="photo" data-id="${s.student_id}">Actualizar foto</button>
        <button data-act="del" data-id="${s.student_id}" class="danger-outline">Eliminar</button>
      </td>`;
    tb.appendChild(tr);
  }
  tb.addEventListener('click',async e=>{
    const btn=e.target.closest('button'); if(!btn) return;
    const sid=btn.dataset.id;
    if(btn.dataset.act==='del'){
      if(confirm('¿Eliminar alumno?')){
        db.students=db.students.filter(x=>x.student_id!==sid);
        db.enrollments=db.enrollments.filter(x=>x.student_id!==sid);
        db.attendance=db.attendance.filter(x=>x.student_id!==sid);
        db.payments=db.payments.filter(x=>x.student_id!==sid);
        db.pins=db.pins.filter(x=>x.student_id!==sid);
        save(db); renderAll();
      }
    }
    if(btn.dataset.act==='setpin'){
      const current=getPinByStudentId(sid)?.pin||'';
      const p=prompt('PIN (4 dígitos):', current||'0000');
      if(p && /^\d{4}$/.test(p)){
        if(isPinInUse(p) && getPinByStudentId(sid)?.pin!==p){ alert('Ese PIN ya está en uso'); return; }
        setPinForStudent(sid,p); renderAll();
      } else if(p!==null){ alert('PIN inválido'); }
    }
    if(btn.dataset.act==='genpin'){ const p=generateUniquePin(); setPinForStudent(sid,p); alert(`Nuevo PIN: ${p}`); renderAll(); }
    if(btn.dataset.act==='copypin'){ const p=getPinByStudentId(sid)?.pin; if(p) { try{ await navigator.clipboard.writeText(p); alert('PIN copiado'); }catch(e){ prompt('Copia el PIN:', p); } } else alert('Este alumno aún no tiene PIN'); }
    if(btn.dataset.act==='photo'){
      const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.capture='environment';
      input.onchange = async ()=>{
        const f=input.files[0]; if(!f) return;
        try{
          const dataUrl = await fileToDataURLResized(f, 340, 0.82);
          const stu=db.students.find(x=>x.student_id===sid);
          if(stu){ stu.photo_data=dataUrl; save(db); renderAll(); }
        }catch(err){ alert('No se pudo procesar la foto'); }
      };
      input.click();
    }
  },{once:true});
}

// Enrollments + Reagendar + Pago pendiente auto
function renderEnrollmentSelectors(){
  const selS=$('#form-enrollment select[name="student_id"]');
  const selP=$('#form-enrollment select[name="package_id"]');
  selS.innerHTML='<option value="">(alumno)</option>'+db.students.map(s=>`<option value="${s.student_id}">${s.full_name}</option>`).join('');
  selP.innerHTML='<option value="">(paquete)</option>'+db.packages.map(p=>`<option value="${p.package_id}">${p.name} (${p.classes_included})</option>`).join('');
}
function deleteEnrollmentCascade(enrollment_id){
  db.attendance = db.attendance.filter(a=>a.enrollment_id!==enrollment_id);
  db.payments   = db.payments.filter(p=>p.enrollment_id!==enrollment_id);
  db.enrollments= db.enrollments.filter(e=>e.enrollment_id!==enrollment_id);
  save(db);
}
function daysUntil(dateISO){
  if(!dateISO) return 9999;
  const today = new Date(todayISO());
  const end = new Date(dateISO);
  return Math.floor((end - today) / (1000*60*60*24));
}
function renderEnrollmentTable(){
  const tb=$('#table-enrollments tbody'); tb.innerHTML='';
  for(const en of db.enrollments){
    const s=db.students.find(x=>x.student_id===en.student_id);
    const p=db.packages.find(x=>x.package_id===en.package_id);
    const dLeft = daysUntil(en.end_date);
    const showRe = (en.status!=='activo') || (en.remaining_classes<=1) || (dLeft<=1);
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${s?s.full_name:''}</td><td>${p?p.name:en.package_id}</td><td>${en.start_date}</td><td>${en.end_date}</td><td>${en.remaining_classes}</td><td>${en.status}</td><td>
    <button data-act="re" data-id="${en.enrollment_id}" ${showRe?'':'disabled'}>Reagendar</button>
    <button data-act="pause" data-id="${en.enrollment_id}">${en.status==='pausado'?'Reactivar':'Pausar'}</button>
    <button data-act="close" data-id="${en.enrollment_id}">Cerrar</button>
    <button data-act="del" data-id="${en.enrollment_id}" class="danger-outline">Eliminar</button></td>`;
    tb.appendChild(tr);
  }
  tb.addEventListener('click',e=>{
    const btn=e.target.closest('button'); if(!btn) return;
    const id=btn.dataset.id; const en=db.enrollments.find(x=>x.enrollment_id===id); if(!en) return;
    if(btn.dataset.act==='pause'){ en.status=en.status==='pausado'?'activo':'pausado'; save(db); renderEnrollmentTable(); return; }
    if(btn.dataset.act==='close'){ en.status='vencido'; save(db); renderEnrollmentTable(); return; }
    if(btn.dataset.act==='del'){
      const s=db.students.find(x=>x.student_id===en.student_id);
      const p=db.packages.find(x=>x.package_id===en.package_id);
      if(confirm(`¿Eliminar el paquete "${p?p.name:en.package_id}" de ${s?s.full_name:'alumno'}?\nSe borrarán asistencias y pagos ligados a este paquete.`)){
        deleteEnrollmentCascade(id); renderEnrollmentTable();
      }
      return;
    }
    if(btn.dataset.act==='re'){
      const selS=$('#form-enrollment select[name="student_id"]');
      const selP=$('#form-enrollment select[name="package_id"]');
      selS.value = en.student_id;
      selP.value = en.package_id;
      const pkg=db.packages.find(p=>p.package_id===selP.value) || {valid_days:30, price_mxn:0};
      const start = new Date(todayISO());
      const end = new Date(todayISO()); end.setDate(end.getDate() + (pkg.valid_days||30));
      $('#form-enrollment input[name="start_date"]').value = fmtISO(start);
      $('#form-enrollment input[name="end_date"]').value = fmtISO(end);
      // marcar flag para crear pago pendiente automático con precio del paquete
      autoPendingPaymentFlag = true;
      $('#auto-pending').checked = true;
      switchToTab('enrollments');
      alert('Formulario prellenado para reagendar. Se creará un pago PENDIENTE automáticamente al asignar.');
    }
  },{once:true});
}
$('#btn-delete-active')?.addEventListener('click', ()=>{
  const sid = $('#form-enrollment select[name="student_id"]').value;
  if(!sid){ alert('Selecciona primero un alumno.'); return; }
  const en = db.enrollments.find(e => e.student_id === sid && e.status === 'activo');
  if(!en){ alert('Este alumno no tiene paquete activo.'); return; }
  const s = db.students.find(x => x.student_id === sid);
  const p = db.packages.find(x => x.package_id === en.package_id);
  if(confirm(`¿Eliminar el paquete ACTIVO "${p ? p.name : en.package_id}" de ${s ? s.full_name : 'alumno'}?\nSe borrarán asistencias y pagos de ese paquete.`)){
    deleteEnrollmentCascade(en.enrollment_id);
    renderAll();
  }
});
$('#form-enrollment').addEventListener('submit',e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const sid=fd.get('student_id'), pid=fd.get('package_id');
  const sd=fd.get('start_date'), ed=fd.get('end_date');
  const chkAuto = $('#auto-pending')?.checked;
  if(!sid||!pid||!sd||!ed){ alert('Completa alumno, paquete y fechas'); return; }
  for(const en of db.enrollments){ if(en.student_id===sid && en.status==='activo'){ en.status='vencido'; } }
  const pkg=db.packages.find(p=>p.package_id===pid) || {classes_included:0, price_mxn:0};
  const enNew={ enrollment_id:uid('enr'), student_id:sid, package_id:pid, start_date:sd, end_date:ed, remaining_classes: pkg.classes_included, status:'activo' };
  db.enrollments.push(enNew);
  // Auto crear pago pendiente si viene de "Reagendar" o si el checkbox está encendido
  if(autoPendingPaymentFlag || chkAuto){
    db.payments.push({
      payment_id: uid('pay'),
      enrollment_id: enNew.enrollment_id,
      student_id: sid,
      date: todayISO(),
      amount_mxn: pkg.price_mxn || 0,
      method: '',
      status: 'pendiente',
      reference: 'auto-reagendado'
    });
  }
  autoPendingPaymentFlag = false;
  save(db); e.target.reset(); renderAll();
  alert('Paquete asignado / re-agendado con éxito.');
});

function refreshStatuses(){
  const t=todayISO();
  for(const en of db.enrollments){ if(en.status==='activo' && en.end_date && en.end_date<t){ en.status='vencido'; } }
  save(db);
}
function getActiveEnrollment(sid){
  const t=parseISO(todayISO());
  return db.enrollments.find(en=>{
    if(en.student_id!==sid) return false;
    if(en.status!=='activo') return false;
    const sd=parseISO(en.start_date), ed=parseISO(en.end_date);
    const startsOk=!sd || sd<=t; const endsOk=!ed || ed>=t;
    return startsOk && endsOk;
  }) || null;
}
function getLatestEnrollment(sid){
  const list = db.enrollments.filter(e=>e.student_id===sid).sort((a,b)=>(b.start_date||'').localeCompare(a.start_date||''));
  return list[0] || null;
}
function hasPaidForEnrollment(en){
  const list=db.payments.filter(p=>p.enrollment_id===en.enrollment_id && p.status==='pagado');
  return list.length>0;
}

function renderAttendanceHead(){
  const head=$('#attendance-head');
  head.innerHTML='<tr><th>Fecha</th><th>Alumno</th><th>Clase/Grupo</th><th>Asistencia</th></tr>';
}
function renderAttendance(){
  const tb=$('#table-attendance tbody'); if(!tb) return; tb.innerHTML='';
  const t=todayISO();
  let rows=db.attendance.filter(a=>a.date===t);
  if(lastKioskStudentId){
    rows = rows.filter(a=>a.student_id===lastKioskStudentId);
  } else {
    rows = [];
  }
  for(const at of rows){
    const s=db.students.find(x=>x.student_id===at.student_id);
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${at.date}</td><td>${s?s.full_name:''}</td><td>${at.class_name_or_group||''}</td><td>Sí</td>`;
    tb.appendChild(tr);
  }
}
function showKioskProfile(sid){
  lastKioskStudentId = sid;
  renderAttendance();
  const box = $('#kiosk-profile');
  const s = db.students.find(x=>x.student_id===sid);
  let en = getActiveEnrollment(sid); if(!en) en=getLatestEnrollment(sid);
  const rest = en ? (en.remaining_classes ?? 0) : 0;
  const img = s?.photo_data ? `<img src="${s.photo_data}" alt="foto alumno">` : `<img src="icons/icon-192.png" alt="sin foto">`;
  box.innerHTML = `${img}<div class="info"><div class="name">${s? s.full_name : ''}</div><div class="meta">Restantes: ${rest}</div><div class="meta">Hoy: ${todayISO()}</div></div>`;
  box.style.display = 'flex';
  if(kioskClearTimer) clearTimeout(kioskClearTimer);
  kioskClearTimer = setTimeout(clearKioskView, 12000);
}
function clearKioskView(){
  lastKioskStudentId = null;
  const box = $('#kiosk-profile'); box.innerHTML=''; box.style.display='none';
  renderAttendance();
}
function markAttendanceFor(sid, by='pin'){
  const s=db.students.find(x=>x.student_id===sid); if(!s){ alert('Alumno no encontrado'); speak(config.voice_deny); return; }
  let en=getActiveEnrollment(sid); if(!en) en=getLatestEnrollment(sid);
  if(!en){ alert(`Sin paquete activo para ${s.full_name}`); speak(config.voice_deny); return; }
  if(!hasPaidForEnrollment(en)){ alert(`Acceso denegado: pago pendiente de ${s.full_name}.`); speak(config.voice_deny); return; }
  if(en.remaining_classes<=0){ alert(`${s.full_name} no tiene clases restantes.`); speak(config.voice_deny); return; }
  db.attendance.push({ attendance_id:uid('att'), enrollment_id:en.enrollment_id, student_id:sid, date:todayISO(), class_name_or_group:config.default_class||'', marked_by:by, was_counted:'yes' });
  en.remaining_classes -= 1;
  if(en.remaining_classes===1){ alert(`Aviso: a ${s.full_name} le queda 1 clase.`); }
  save(db);
  speak(config.voice_ok);
  showKioskProfile(sid);
  renderReports(); renderDashboard();
}
$('#form-pin').addEventListener('submit',e=>{
  e.preventDefault(); const fd=new FormData(e.target);
  const pin=(fd.get('pin')||'').trim();
  const rec=db.pins.find(p=>p.pin===pin); if(!rec){ alert('PIN incorrecto'); speak(config.voice_deny); return; }
  markAttendanceFor(rec.student_id, 'pin'); e.target.reset();
});
$('#form-pin input[name="pin"]').addEventListener('input', ()=>{
  if(kioskClearTimer) clearTimeout(kioskClearTimer);
  clearKioskView();
});

function renderPayments(){
  const tb=$('#table-payments tbody'); if(!tb) return; tb.innerHTML='';
  const rows=db.payments.slice().sort((a,b)=>b.date.localeCompare(a.date));
  for(const p of rows){
    const s=db.students.find(x=>x.student_id===p.student_id);
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${p.date}</td><td>${s?s.full_name:''}</td><td>${p.method||''}</td><td>${(p.amount_mxn||0).toFixed(2)}</td><td>${p.status||''}</td><td>${p.reference||''}</td>`;
    tb.appendChild(tr);
  }
}
function sumBy(a,f){return a.reduce((x,y)=>x+(+f(y)||0),0)}
function groupBy(a,k){return a.reduce((acc,x)=>{const key=k(x);(acc[key]??=[]).push(x);return acc},{})}
function renderEvents(){
  const tb=$('#table-events tbody'); if(!tb) return; tb.innerHTML='';
  const rows=(db.events||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  for(const ev of rows){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${ev.date||''} ${ev.start_time||''}</td><td>${ev.title||''}</td><td>${ev.type||''}</td><td>${ev.location||''}</td><td><button data-act="notify" data-id="${ev.event_id}">Notificar</button> <button data-act="del" data-id="${ev.event_id}">Eliminar</button></td>`;
    tb.appendChild(tr);
  }
}
function renderReports(){
  const n=new Date(); const ym=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
  const att=db.attendance.filter(a=>(a.date||'').startsWith(ym));
  const pay=db.payments.filter(p=>(p.date||'').startsWith(ym)&&p.status==='pagado');
  const sold=db.enrollments.filter(en=>(en.start_date||'').startsWith(ym));
  const g=groupBy(sold,en=>en.package_id);
  $('#r-attendance-month')?.textContent=`${att.length} asistencias`;
  $('#r-income-month')?.textContent=`$ ${sumBy(pay,x=>x.amount_mxn).toFixed(2)} MXN`;
  const ul=$('#r-top-packages'); if(ul){ ul.innerHTML=''; Object.entries(g).sort((a,b)=>b[1].length-a[1].length).forEach(([id,list])=>{
    const pkg=db.packages.find(p=>p.package_id===id);
    const li=document.createElement('li'); li.textContent=`${pkg?pkg.name:id}: ${list.length}`; ul.appendChild(li);
  });}
}
function renderDashboard(){
  const t=todayISO();
  $('#attendances-today')?.textContent=db.attendance.filter(a=>a.date===t).length;
  $('#payments-due')?.textContent=db.payments.filter(p=>(p.status||'')==='pendiente').length;
  const next7=new Date(); next7.setDate(next7.getDate()+7);
  const exp=db.enrollments.filter(en=>{ if(en.status!=='activo'||!en.end_date) return false; const ed=new Date(en.end_date); const td=new Date(t); return ed>=td&&ed<=next7; }).length;
  $('#expiring-packages')?.textContent=exp;
  const up=(db.events||[]).filter(ev=>{ if(!ev.date) return false; const d=new Date(ev.date); const td=new Date(t); const n7=new Date(td); n7.setDate(n7.getDate()+7); return d>=td&&d<=n7; }).length;
  $('#upcoming-events')?.textContent=up;
}

function renderAll(){
  refreshStatuses();
  try{ renderStudents(); }catch(e){}
  try{ renderEnrollmentSelectors(); renderEnrollmentTable(); }catch(e){}
  try{ renderAttendanceHead(); renderAttendance(); }catch(e){}
  try{ renderPayments(); }catch(e){}
  try{ renderEvents(); }catch(e){}
  try{ renderReports(); renderDashboard(); }catch(e){}
  applyModeToUI();
  applyBrand();
}
renderAll();
})();