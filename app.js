(function(){
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const DB=['students','enrollments','attendance','payments','pins'];
const CFG_KEY='cfg_v2';

function cfgLoad(){
  const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
  return {
    brand: c.brand || 'Academia NH v2',
    admin_pin: c.admin_pin || '1234',
    voice_ok: c.voice_ok || 'Acceso otorgado',
    voice_deny: c.voice_deny || 'Acceso denegado'
  };
}
function cfgSave(c){ localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
let cfg = cfgLoad();
document.title = cfg.brand;
$('#brand-title').textContent = cfg.brand;

let mode = 'alumno';
let kioskTimer = null;
let currentKioskStudentId = null;

const PACKS = Array.from({length:12}, (_,i)=>{
  const n=i+1; return {id:'P'+n, name:`${n} clase${n>1?'s':''}`, classes:n, price: n*90};
});

function speakEs(text){
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
function todayISO(){ return new Date().toISOString().slice(0,10); }
function uid(p='id'){ return p+'_'+Math.random().toString(36).slice(2,10); }
function load(){const db={};for(const k of DB){db[k]=JSON.parse(localStorage.getItem(k)||'[]')}return db}
function save(db){for(const k of DB){localStorage.setItem(k,JSON.stringify(db[k]||[]))}}
const db = load();

function getPinByStudentId(sid){ return db.pins.find(p=>p.student_id===sid)?.pin || null; }
function setPinForStudent(sid, pin){
  const found=db.pins.find(p=>p.student_id===sid);
  if(found) found.pin=pin; else db.pins.push({student_id:sid,pin});
  save(db);
}
function isPinInUse(pin, exceptSid=null){ return !!db.pins.find(p=>p.pin===pin && p.student_id!==exceptSid); }
function generatePin(){ let p; do{ p=Math.floor(Math.random()*10000).toString().padStart(4,'0'); }while(isPinInUse(p)); return p; }

async function fileToDataURLResized(file, maxSize=360, quality=0.85){
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

$('#mode-switch').addEventListener('change', ()=>{
  const target = $('#mode-switch').value;
  if(target==='admin'){
    const pin = prompt('PIN Admin (4 dígitos):');
    if(pin === cfg.admin_pin){ mode='admin'; }
    else { alert('PIN incorrecto'); $('#mode-switch').value='alumno'; mode='alumno'; }
  } else { mode='alumno'; }
  applyMode();
});
function applyMode(){
  $$('#tabs [data-admin]').forEach(el=>{ el.style.display = (mode==='admin') ? '' : 'none'; });
  if(mode==='alumno'){ switchTo('kiosk'); }
}
function switchTo(tab){
  $$('#tabs button').forEach(b=>b.classList.remove('active'));
  $(`#tabs button[data-tab="${tab}"]`)?.classList.add('active');
  $$('.tab').forEach(s=>s.classList.remove('active'));
  $('#'+tab)?.classList.add('active');
}
$$('#tabs button[data-tab]').forEach(b=>b.addEventListener('click',()=>{
  const tab=b.dataset.tab;
  switchTo(tab);
  renderAll();
}));

function fillClassSelect(sel){
  sel.innerHTML='<option value="">Paquete (clases)</option>'+
    PACKS.map(p=>`<option value="${p.id}" data-classes="${p.classes}" data-price="${p.price}">${p.name} — $${p.price} MXN</option>`).join('');
}
fillClassSelect($('#student-classes'));

let pendingPhotoData='';
$('#student-photo').addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{ pendingPhotoData=await fileToDataURLResized(f); }catch(_){ alert('No se pudo procesar la foto'); pendingPhotoData=''; }
});
$('#student-classes').addEventListener('change', e=>{
  const price = e.target.selectedOptions[0]?.dataset.price || 0;
  $('#student-amount').value = price;
});
$('#form-student').addEventListener('submit', e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const name = fd.get('full_name'); const phone=fd.get('phone');
  const packId = fd.get('classes'); const opt = $('#student-classes').selectedOptions[0];
  if(!packId){ alert('Selecciona el paquete'); return; }
  const classes = parseInt(opt.dataset.classes||'0',10);
  const amount = parseFloat(fd.get('amount_mxn')||'0');
  const payStatus = fd.get('payment_status')||'pendiente';
  const sid = uid('stu');
  const pin = generatePin();
  const endDate = (()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,10) })();
  const student = { student_id:sid, full_name:name, phone, photo_data: pendingPhotoData||'' };
  db.students.push(student);
  const enrId=uid('enr');
  db.enrollments.push({ enrollment_id:enrId, student_id:sid, classes_total:classes, remaining_classes:classes, end_date:endDate, status:'activo', amount_mxn:amount });
  db.payments.push({ payment_id:uid('pay'), enrollment_id:enrId, student_id:sid, date:todayISO(), amount_mxn:amount, method:'', status:payStatus, reference:'alta' });
  db.pins.push({ student_id:sid, pin });
  save(db);
  alert(`Alumno agregado. PIN: ${pin}`);
  e.target.reset(); pendingPhotoData='';
  renderStudents(); renderPayments();
});

function renderStudents(){
  const tb=$('#table-students tbody'); tb.innerHTML='';
  for(const s of db.students){
    const enr = db.enrollments.find(e=>e.student_id===s.student_id && e.status==='activo') || db.enrollments.filter(e=>e.student_id===s.student_id).sort((a,b)=>b.end_date.localeCompare(a.end_date))[0];
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${s.photo_data?`<img src="${s.photo_data}" class="tbl-photo" alt="foto">`:'—'}</td>
      <td>${s.full_name}</td><td>${s.phone||''}</td>
      <td>${enr?enr.classes_total:0}</td><td>${enr?enr.remaining_classes:0}</td><td>${enr?enr.end_date||'-':'-'}</td>
      <td><button data-act="open" data-id="${s.student_id}">Perfil</button></td>`;
    tb.appendChild(tr);
  }
  tb.onclick = (e)=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.act==='open'){ openProfile(b.dataset.id); }
  };
}

function openProfile(sid){
  const s = db.students.find(x=>x.student_id===sid); if(!s) return;
  const enr = db.enrollments.find(e=>e.student_id===sid && e.status==='activo') || db.enrollments.filter(e=>e.student_id===sid).sort((a,b)=>b.end_date.localeCompare(a.end_date))[0];
  $('#student-profile').style.display='block';
  $('#sp-name').textContent = s.full_name;
  $('#sp-photo').src = s.photo_data || 'icons/icon-192.png';
  $('#sp-full_name').value = s.full_name||'';
  $('#sp-phone').value = s.phone||'';
  fillClassSelect($('#sp-classes'));
  if(enr){ $('#sp-classes').value = 'P'+(enr.classes_total||1); }
  $('#sp-amount').value = enr? (enr.amount_mxn||0) : 0;
  const lastPay = db.payments.filter(p=>p.enrollment_id===enr?.enrollment_id).sort((a,b)=>b.date.localeCompare(a.date))[0];
  $('#sp-payment').value = (lastPay?.status)||'pendiente';
  $('#sp-end').value = enr? (enr.end_date||'') : '';
  $('#sp-photo-btn').onclick = ()=>{
    const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.capture='environment';
    input.onchange = async ()=>{
      const f=input.files[0]; if(!f) return;
      try{ s.photo_data=await fileToDataURLResized(f); save(db); openProfile(sid); renderStudents(); }catch(_){ alert('No se pudo procesar la foto'); }
    };
    input.click();
  };
  $('#sp-save').onclick = ()=>{
    s.full_name = $('#sp-full_name').value.trim()||s.full_name;
    s.phone = $('#sp-phone').value.trim();
    if(enr){
      const opt = $('#sp-classes').selectedOptions[0];
      if(opt){
        const classes = parseInt(opt.dataset.classes||'0',10);
        const diff = classes - (enr.classes_total||0);
        enr.classes_total = classes;
        enr.remaining_classes = Math.max(0, (enr.remaining_classes||0) + diff);
      }
      enr.amount_mxn = parseFloat($('#sp-amount').value||'0');
      enr.end_date = $('#sp-end').value || enr.end_date;
      if(lastPay && lastPay.status==='pendiente'){ lastPay.amount_mxn = enr.amount_mxn; }
      const st = $('#sp-payment').value;
      if(lastPay){ lastPay.status = st; }
      else { db.payments.push({ payment_id:uid('pay'), enrollment_id:enr.enrollment_id, student_id:sid, date:todayISO(), amount_mxn:enr.amount_mxn||0, method:'', status:st, reference:'ajuste' }); }
    }
    save(db); renderStudents(); openProfile(sid);
    alert('Cambios guardados');
  };
  $('#sp-close').onclick = ()=>{
    if(enr){ enr.status='vencido'; save(db); renderStudents(); openProfile(sid); }
  };
  $('#sp-reagenda').onclick = ()=>{
    if(!enr){ alert('Sin paquete activo'); return; }
    if((enr.remaining_classes||0)!==1){ alert('Solo se puede reagendar cuando queda 1 clase.'); return; }
    const payOk = !!db.payments.find(p=>p.enrollment_id===enr.enrollment_id && p.status==='pagado');
    if(!payOk){ alert('Para reagendar, el pago del paquete actual debe estar PAGADO.'); return; }
    const d=new Date(); d.setMonth(d.getMonth()+1);
    const newEnr = { enrollment_id:uid('enr'), student_id:sid, classes_total:enr.classes_total, remaining_classes:enr.classes_total, end_date:d.toISOString().slice(0,10), status:'activo', amount_mxn:enr.amount_mxn||0 };
    enr.status='vencido';
    db.enrollments.push(newEnr);
    db.payments.push({ payment_id:uid('pay'), enrollment_id:newEnr.enrollment_id, student_id:sid, date:todayISO(), amount_mxn:newEnr.amount_mxn||0, method:'', status:'pendiente', reference:'reagendado v2' });
    save(db); renderStudents(); openProfile(sid);
    alert('Reagendado. Se creó un nuevo paquete con pago PENDIENTE.');
  };
  // Payment history with "Pagar ahora"
  const tb=$('#table-sp-payments tbody'); tb.innerHTML='';
  const rows = db.payments.filter(p=>p.student_id===sid).sort((a,b)=>b.date.localeCompare(a.date));
  for(const p of rows){
    const tr=document.createElement('tr');
    const btn = (p.status==='pendiente') ? `<button data-act="paynow" data-id="${p.payment_id}">Pagar ahora</button>` : '';
    tr.innerHTML = `<td>${p.date}</td><td>${(p.amount_mxn||0).toFixed(2)}</td><td>${p.method||''}</td><td>${p.status}</td><td>${p.reference||''}</td><td>${btn}</td>`;
    tb.appendChild(tr);
  }
  tb.onclick = (e)=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.act==='paynow'){
      const pay = db.payments.find(x=>x.payment_id===b.dataset.id);
      if(pay){ pay.status='pagado'; save(db); openProfile(sid); renderPayments(); alert('Pago marcado como PAGADO'); }
    }
  };
}

function renderPaymentSelectors(){
  const sel=$('#form-payment select[name="student_id"]');
  sel.innerHTML='<option value="">(alumno)</option>'+db.students.map(s=>`<option value="${s.student_id}">${s.full_name}</option>`).join('');
}
$('#form-payment').addEventListener('submit', e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const sid=fd.get('student_id'); if(!sid){ alert('Elige alumno'); return; }
  const en = db.enrollments.find(x=>x.student_id===sid && x.status==='activo'); if(!en){ alert('Alumno sin paquete activo'); return; }
  db.payments.push({ payment_id:uid('pay'), enrollment_id:en.enrollment_id, student_id:sid, date:todayISO(), amount_mxn:parseFloat(fd.get('amount_mxn')||'0'), method:fd.get('method')||'', status:fd.get('status')||'pendiente', reference:fd.get('reference')||'' });
  save(db); e.target.reset(); renderPayments();
});
function renderPayments(){
  const tb=$('#table-payments tbody'); tb.innerHTML='';
  const rows=db.payments.slice().sort((a,b)=>b.date.localeCompare(a.date));
  for(const p of rows){
    const s=db.students.find(x=>x.student_id===p.student_id);
    const btn = (p.status==='pendiente') ? `<button data-act="paynow" data-id="${p.payment_id}">Pagar ahora</button>` : '';
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${p.date}</td><td>${s?s.full_name:''}</td><td>${p.method||''}</td><td>${(p.amount_mxn||0).toFixed(2)}</td><td>${p.status||''}</td><td>${p.reference||''}</td><td>${btn}</td>`;
    tb.appendChild(tr);
  }
  tb.onclick = (e)=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.act==='paynow'){
      const pay = db.payments.find(x=>x.payment_id===b.dataset.id);
      if(pay){ pay.status='pagado'; save(db); renderPayments(); alert('Pago marcado como PAGADO'); }
    }
  };
}

function renderAttendance(){
  const tb=$('#table-attendance tbody'); tb.innerHTML='';
  const rows = db.attendance.filter(a=>a.date===todayISO() && (!currentKioskStudentId || a.student_id===currentKioskStudentId));
  for(const a of rows){
    const s=db.students.find(x=>x.student_id===a.student_id);
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${a.date}</td><td>${s?s.full_name:''}</td><td>${a.group||'General'}</td><td>Sí</td>`;
    tb.appendChild(tr);
  }
}
function showKioskProfile(sid){
  currentKioskStudentId = sid;
  const box = $('#kiosk-profile');
  const s=db.students.find(x=>x.student_id===sid);
  const en = db.enrollments.find(e=>e.student_id===sid && e.status==='activo');
  const rest = en ? en.remaining_classes : 0;
  const img = s?.photo_data ? `<img src="${s.photo_data}" alt="foto">` : `<img src="icons/icon-192.png" alt="foto">`;
  box.innerHTML = `${img}<div class="info"><div class="name">${s?s.full_name:''}</div><div class="meta">Restantes: ${rest}</div><div class="meta">Hoy: ${todayISO()}</div></div>`;
  box.style.display='flex';
  renderAttendance();
  if(kioskTimer) clearTimeout(kioskTimer);
  kioskTimer = setTimeout(clearKiosk, 12000);
}
function clearKiosk(){
  currentKioskStudentId = null;
  $('#kiosk-profile').style.display='none'; $('#kiosk-profile').innerHTML='';
  renderAttendance();
}
$('#form-pin input[name="pin"]').addEventListener('input', ()=>{ if(kioskTimer) clearTimeout(kioskTimer); clearKiosk(); });
$('#form-pin').addEventListener('submit', e=>{
  e.preventDefault();
  const pin=(new FormData(e.target).get('pin')||'').trim();
  const rec=db.pins.find(p=>p.pin===pin);
  if(!rec){ alert('PIN incorrecto'); speakEs(cfg.voice_deny); return; }
  const sid=rec.student_id;
  const en = db.enrollments.find(e=>e.student_id===sid && e.status==='activo');
  const paid = en && db.payments.find(p=>p.enrollment_id===en.enrollment_id && p.status==='pagado');
  if(!en || !paid){ alert('Acceso denegado: pago pendiente o sin paquete activo.'); speakEs(cfg.voice_deny); return; }
  if(en.remaining_classes<=0){ alert('No quedan clases.'); speakEs(cfg.voice_deny); return; }
  db.attendance.push({ attendance_id:uid('att'), student_id:sid, date:todayISO(), group:'General' });
  en.remaining_classes -= 1;
  save(db);
  speakEs(cfg.voice_ok);
  e.target.reset();
  showKioskProfile(sid);
}

function renderReports(){
  const ym = todayISO().slice(0,7);
  const att = db.attendance.filter(a=>a.date.startsWith(ym)).length;
  const income = db.payments.filter(p=>p.date.startsWith(ym)&&p.status==='pagado').reduce((s,x)=>s+(+x.amount_mxn||0),0);
  $('#r-att-month').textContent=att;
  $('#r-income-month').textContent=`$ ${income.toFixed(2)} MXN`;
}

$('#cfg-save').addEventListener('click', ()=>{
  const pin=$('#cfg-admin-pin').value.trim()||cfg.admin_pin;
  if(!/^\d{4}$/.test(pin)){ alert('PIN Admin inválido'); return; }
  cfg={ brand: $('#cfg-brand').value || 'Academia NH v2', admin_pin: pin, voice_ok: $('#cfg-voice-ok').value || 'Acceso otorgado', voice_deny: $('#cfg-voice-deny').value || 'Acceso denegado' };
  cfgSave(cfg); document.title=cfg.brand; $('#brand-title').textContent=cfg.brand;
  alert('Configuración guardada');
});
$('#cfg-clear').addEventListener('click', async ()=>{
  try{
    if('caches' in window){ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }
    if('serviceWorker' in navigator){ const regs=await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r=>r.unregister())); }
  }catch(e){}
  alert('Caché borrada. Se recargará.');
  location.replace(location.pathname+'?v=clean3');
});

function renderAll(){
  renderStudents(); renderPaymentSelectors(); renderPayments(); renderAttendance(); renderReports(); applyMode();
}
renderAll();
})();