const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0});
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
let config=null,client=null,session=null;

function msg(id,type,text){const el=$(id);if(el)el.innerHTML=text?`<div class="alert ${type}">${esc(text)}</div>`:'';}
async function api(url,options={}){
  const headers=new Headers(options.headers||{});if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  if(session?.access_token)headers.set('Authorization',`Bearer ${session.access_token}`);
  const r=await fetch(url,{...options,headers});const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(data.error||`HTTP ${r.status}`),{status:r.status,data});return data;
}
const viDate=v=>v?new Date(v).toLocaleString('vi-VN'):'—';
const secs=ms=>Number(ms)>0?(Number(ms)/1000).toLocaleString('vi-VN',{maximumFractionDigits:1})+' giây':'—';

async function authenticate(){
  config=await fetch('/api/config').then(r=>r.json());
  if(!config.authEnabled)throw new Error('Chưa cấu hình Supabase. Xem README v3 để bật hệ thống tài khoản.');
  client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
  ({data:{session}}=await client.auth.getSession());
  client.auth.onAuthStateChange(async(_event,s)=>{session=s;if(session)await enter();else showLogin();});
  if(!session)return showLogin();await enter();
}
function showLogin(text=''){ $('adminGate').hidden=true;$('adminApp').hidden=true;$('adminAuthModal').hidden=false;if(text)msg('adminAuthMessage','error',text); }
async function enter(){
  try{
    await api('/api/admin/metrics');$('adminAuthModal').hidden=true;$('adminGate').hidden=true;$('adminApp').hidden=false;await refreshAll();
  }catch(e){if(e.status===401||e.status===403)return showLogin(e.message);throw e;}
}
async function emailLogin(){
  const email=$('adminEmail').value.trim(),password=$('adminPassword').value;
  const {error}=await client.auth.signInWithPassword({email,password});if(error)msg('adminAuthMessage','error',error.message);
}
async function googleLogin(){const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/admin'}});if(error)msg('adminAuthMessage','error',error.message);}

async function loadMetrics(){
  const d=await api('/api/admin/metrics');
  $('metricCards').innerHTML=[
    ['Tài khoản',d.userCount||0,'Người dùng đã đăng ký'],
    ['Đơn chờ',d.pendingOrders||0,'Chờ xác nhận thanh toán'],
    ['Doanh thu ghi nhận',money.format(d.revenueVnd||0),'Các đơn đã duyệt'],
    ['TG đọc hồ sơ TB',secs(d.avgImportLatencyMs),'200 lượt gần nhất']
  ].map(([a,b,c])=>`<article class="admin-metric"><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></article>`).join('');
  $('importsTable').querySelector('tbody').innerHTML=(d.recentImports||[]).slice(0,30).map(x=>`<tr><td>${esc(viDate(x.created_at))}</td><td>${esc(x.parser_mode||x.provider||'—')}</td><td>${esc(x.model||'Không dùng AI')}</td><td>${esc(secs(x.latency_ms))}</td><td><span class="admin-pill ${x.status==='success'?'ok':'warn'}">${esc(x.status)}</span></td></tr>`).join('')||'<tr><td colspan="5">Chưa có dữ liệu.</td></tr>';
}
async function loadUsers(){
  const d=await api('/api/admin/users?perPage=100');
  $('usersTable').querySelector('tbody').innerHTML=(d.users||[]).map(u=>{
    const w=u.wallet||{};const p=u.profile||{};const id=esc(u.id);
    return `<tr data-user="${id}"><td><b>${esc(u.email||u.phone||u.id)}</b><small>${p.role==='admin'?'Quản trị viên':'Người dùng'}</small></td><td>${esc(viDate(u.created_at))}</td><td><span class="admin-pill ${p.status==='suspended'?'warn':'ok'}">${esc(p.status||'active')}</span></td><td>TT <b>${w.direct_credits??0}</b> · HS <b>${w.file_credits??0}</b> · Lưu <b>${w.history_credits??0}</b></td><td><div class="credit-controls"><input class="grant-direct" type="number" min="0" value="0" title="Trực tiếp"><input class="grant-file" type="number" min="0" value="0" title="Hồ sơ"><input class="grant-history" type="number" min="0" value="0" title="Lưu"><button class="button secondary small grant-btn" type="button">Cộng</button></div></td><td>${p.role==='admin'?'—':`<button class="button secondary small status-btn" type="button" data-next="${p.status==='suspended'?'active':'suspended'}">${p.status==='suspended'?'Mở khóa':'Tạm khóa'}</button>`}</td></tr>`;
  }).join('')||'<tr><td colspan="6">Chưa có tài khoản.</td></tr>';
  document.querySelectorAll('.grant-btn').forEach(b=>b.addEventListener('click',()=>grant(b.closest('tr'))));
  document.querySelectorAll('.status-btn').forEach(b=>b.addEventListener('click',()=>changeStatus(b.closest('tr'),b.dataset.next)));
}
async function grant(row){
  try{const id=row.dataset.user;const body={direct:+row.querySelector('.grant-direct').value||0,file:+row.querySelector('.grant-file').value||0,history:+row.querySelector('.grant-history').value||0,note:'Điều chỉnh từ trang quản trị'};await api(`/api/admin/users/${id}/credits`,{method:'POST',body:JSON.stringify(body)});msg('userMessage','success','Đã cộng lượt cho tài khoản.');await loadUsers();}catch(e){msg('userMessage','error',e.message);}
}
async function changeStatus(row,status){try{await api(`/api/admin/users/${row.dataset.user}/status`,{method:'PATCH',body:JSON.stringify({status})});await loadUsers();}catch(e){msg('userMessage','error',e.message);}}

async function loadPlans(){
  const d=await api('/api/admin/plans');
  $('plansTable').querySelector('tbody').innerHTML=(d.plans||[]).map(p=>`<tr data-plan="${esc(p.id)}"><td><b>${esc(p.name)}</b><small>${esc(p.code)}</small></td><td><input class="p-price" type="number" min="0" step="1000" value="${Number(p.price_vnd||0)}"></td><td><input class="p-direct" type="number" min="0" value="${Number(p.direct_credits||0)}"></td><td><input class="p-file" type="number" min="0" value="${Number(p.file_credits||0)}"></td><td><input class="p-history" type="number" min="0" value="${Number(p.history_credits||0)}"></td><td><input class="p-active" type="checkbox" ${p.active?'checked':''}></td><td><button class="button secondary small save-plan" type="button">Lưu</button></td></tr>`).join('')||'<tr><td colspan="7">Chưa có gói. Tạo gói đầu tiên ở biểu mẫu phía trên.</td></tr>';
  document.querySelectorAll('.save-plan').forEach(b=>b.addEventListener('click',()=>savePlan(b.closest('tr'))));
}
async function createPlan(ev){
  ev.preventDefault();try{const body={code:$('planCode').value.trim(),name:$('planName').value.trim(),description:$('planDescription').value.trim(),priceVnd:+$('planPrice').value||0,direct:+$('planDirect').value||0,file:+$('planFile').value||0,history:+$('planHistory').value||0,active:true};await api('/api/admin/plans',{method:'POST',body:JSON.stringify(body)});msg('planMessage','success','Đã tạo gói mới.');ev.target.reset();$('planDirect').value=0;$('planFile').value=0;$('planHistory').value=0;await loadPlans();}catch(e){msg('planMessage','error',e.message);}
}
async function savePlan(row){try{const body={priceVnd:+row.querySelector('.p-price').value||0,direct:+row.querySelector('.p-direct').value||0,file:+row.querySelector('.p-file').value||0,history:+row.querySelector('.p-history').value||0,active:row.querySelector('.p-active').checked};await api(`/api/admin/plans/${row.dataset.plan}`,{method:'PATCH',body:JSON.stringify(body)});msg('planMessage','success','Đã cập nhật gói.');await loadPlans();}catch(e){msg('planMessage','error',e.message);}}

async function loadOrders(){
  const d=await api('/api/admin/orders');
  $('ordersTable').querySelector('tbody').innerHTML=(d.orders||[]).map(o=>`<tr><td><b>${esc(o.payment_code)}</b></td><td>${esc(o.user_contact||o.user_id)}</td><td>${esc(o.plan_name)}</td><td>${esc(money.format(o.amount_vnd||0))}</td><td>${esc(viDate(o.created_at))}</td><td><span class="admin-pill ${o.status==='paid'?'ok':o.status==='pending'?'warn':''}">${esc(o.status)}</span></td><td>${o.status==='pending'?`<button class="button primary small approve-order" data-order="${esc(o.id)}" type="button">Xác nhận đã thanh toán</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="7">Chưa có đơn hàng.</td></tr>';
  document.querySelectorAll('.approve-order').forEach(b=>b.addEventListener('click',()=>approveOrder(b.dataset.order)));
}
async function approveOrder(id){try{await api(`/api/admin/orders/${id}/approve`,{method:'POST',body:'{}'});msg('orderMessage','success','Đã xác nhận thanh toán và cộng lượt vào tài khoản.');await Promise.all([loadOrders(),loadMetrics(),loadUsers()]);}catch(e){msg('orderMessage','error',e.message);}}
async function refreshAll(){await Promise.all([loadMetrics(),loadUsers(),loadPlans(),loadOrders()]);}

$('adminLoginBtn').addEventListener('click',emailLogin);$('adminGoogleBtn').addEventListener('click',googleLogin);$('adminLogoutBtn').addEventListener('click',async()=>{if(client)await client.auth.signOut();location.href='/';});$('refreshUsersBtn').addEventListener('click',loadUsers);$('planForm').addEventListener('submit',createPlan);
authenticate().catch(e=>showLogin(e.message));
