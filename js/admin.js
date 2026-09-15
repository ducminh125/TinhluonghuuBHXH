const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0});
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const PAGE_SIZE=10;
let config=null,client=null,session=null,systemStatus=null;
let userPage=1,userTotalPages=1,userQuery='';
let orderPage=1,orderTotalPages=1;
let importPage=1,importTotalPages=1;
let orderFilters={};
let importFilters={};

function msg(id,type,text){const el=$(id);if(el)el.innerHTML=text?`<div class="alert ${type}">${esc(text)}</div>`:'';}
async function api(url,options={}){
  const headers=new Headers(options.headers||{});if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  if(session?.access_token)headers.set('Authorization',`Bearer ${session.access_token}`);
  const r=await fetch(url,{...options,headers});const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(data.error||`HTTP ${r.status}`),{status:r.status,data});return data;
}
const viDate=v=>v?new Date(v).toLocaleString('vi-VN'):'—';
const secs=ms=>Number(ms)>0?(Number(ms)/1000).toLocaleString('vi-VN',{maximumFractionDigits:1})+' giây':'—';

function cleanValue(id){const el=$(id);return el?String(el.value??'').trim():'';}
function buildListParams(page,filters={}){
  const params=new URLSearchParams({page:String(page),perPage:String(PAGE_SIZE)});
  for(const [key,value] of Object.entries(filters)){
    if(value===undefined||value===null||String(value).trim()==='')continue;
    params.set(key,String(value).trim());
  }
  return params;
}
function hasFilters(filters={}){return Object.values(filters).some(value=>value!==undefined&&value!==null&&String(value).trim()!=='');}
function collectOrderFilters(){
  return {
    q:cleanValue('orderSearchInput'),code:cleanValue('orderCodeFilter'),user:cleanValue('orderUserFilter'),plan:cleanValue('orderPlanFilter'),
    amountMin:cleanValue('orderAmountMinFilter'),amountMax:cleanValue('orderAmountMaxFilter'),dateFrom:cleanValue('orderDateFromFilter'),dateTo:cleanValue('orderDateToFilter'),status:cleanValue('orderStatusFilter')
  };
}
function collectImportFilters(){
  return {
    q:cleanValue('importSearchInput'),user:cleanValue('importUserFilter'),parser:cleanValue('importParserFilter'),model:cleanValue('importModelFilter'),
    latencyMinSeconds:cleanValue('importLatencyMinFilter'),latencyMaxSeconds:cleanValue('importLatencyMaxFilter'),dateFrom:cleanValue('importDateFromFilter'),dateTo:cleanValue('importDateToFilter'),status:cleanValue('importStatusFilter')
  };
}
function clearInputs(ids=[]){for(const id of ids){const el=$(id);if(el)el.value='';}}

function renderPager(id,{page=1,totalPages=1,total=0,label='bản ghi'}={},onPage){
  const host=$(id);if(!host)return;
  const safeTotalPages=Math.max(1,Number(totalPages)||1),safePage=Math.min(safeTotalPages,Math.max(1,Number(page)||1));
  host.innerHTML=`<div class="admin-page-summary">${Number(total||0).toLocaleString('vi-VN')} ${esc(label)} · Trang ${safePage}/${safeTotalPages}</div><div class="admin-page-actions"><button class="button secondary small pager-prev" type="button" ${safePage<=1?'disabled':''}>← Trước</button><button class="button secondary small pager-next" type="button" ${safePage>=safeTotalPages?'disabled':''}>Sau →</button></div>`;
  host.querySelector('.pager-prev')?.addEventListener('click',()=>onPage(Math.max(1,safePage-1)));
  host.querySelector('.pager-next')?.addEventListener('click',()=>onPage(Math.min(safeTotalPages,safePage+1)));
}

async function checkSystemStatus(){
  try{
    systemStatus=await fetch('/api/system/status',{cache:'no-store'}).then(r=>r.json());
    const notice=$('systemSetupNotice'),text=$('systemSetupText');
    if(systemStatus?.ready){if(notice)notice.hidden=true;return true;}
    if(notice)notice.hidden=false;
    if(text)text.textContent=systemStatus?.configured
      ? `Supabase đang thiếu: ${(systemStatus.missing||[]).join(', ') || 'một số bảng/chức năng'}.`
      : 'Chưa cấu hình kết nối Supabase trên Vercel.';
    return false;
  }catch(_e){return false;}
}

function applyAdminGoogleAvailability(){
  const btn=$('adminGoogleBtn'),hint=$('adminGoogleAuthHint');if(!btn)return;
  if(config?.googleAuthEnabled!==true){
    btn.disabled=true;
    btn.textContent=config?.googleAuthChecked===false?'Tạm thời chưa xác minh được Google':'Google chưa được bật trong Supabase';
    if(hint){
      hint.hidden=false;
      hint.textContent=config?.googleAuthChecked===false
        ?'Không kiểm tra được trạng thái Google Provider từ Supabase. Hãy dùng email/mật khẩu và kiểm tra kết nối Supabase.'
        :'Bật Authentication → Providers → Google trong Supabase và nhập Client ID/Client Secret của Google Cloud.';
    }
  }else{
    btn.disabled=false;btn.textContent='Đăng nhập bằng Google';
    if(hint){hint.hidden=config?.googleAuthChecked!==false;hint.textContent=config?.googleAuthChecked===false?'Không kiểm tra được trạng thái Google Provider. Nếu đăng nhập lỗi, hãy kiểm tra cấu hình Supabase.':'';}
  }
}

async function authenticate(){
  await checkSystemStatus();
  config=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
  if(!config.authEnabled)throw new Error('Chưa cấu hình Supabase. Xem README để bật hệ thống tài khoản.');
  applyAdminGoogleAvailability();
  client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
  ({data:{session}}=await client.auth.getSession());
  client.auth.onAuthStateChange(async(_event,s)=>{session=s;if(session)await enter();else showLogin();});
  if(!session)return showLogin();await enter();
}
function showLogin(text=''){ $('adminGate').hidden=true;$('adminApp').hidden=true;$('adminAuthModal').hidden=false;if(text)msg('adminAuthMessage','error',text); }
async function enter(){
  try{await api('/api/admin/metrics');$('adminAuthModal').hidden=true;$('adminGate').hidden=true;$('adminApp').hidden=false;await refreshAll();}
  catch(e){if(e.status===401||e.status===403)return showLogin(e.message);throw e;}
}
async function emailLogin(){
  const email=$('adminEmail').value.trim(),password=$('adminPassword').value;
  const {error}=await client.auth.signInWithPassword({email,password});if(error)msg('adminAuthMessage','error',error.message);
}
async function googleLogin(){
  if(config?.googleAuthEnabled!==true)return msg('adminAuthMessage','error','Google Provider chưa được bật trong Supabase. Hãy bật Provider trước rồi thử lại.');
  const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/admin'}});
  if(error){
    const text=/provider.*(disabled|not enabled)|unsupported provider/i.test(error.message||'')?'Google Provider chưa được bật trong Supabase.':error.message;
    msg('adminAuthMessage','error',text);
  }
}

async function loadMetrics(){
  const d=await api('/api/admin/metrics');
  $('metricCards').innerHTML=[
    ['Tài khoản',d.userCount||0,'Người dùng đã đăng ký'],
    ['Đơn chờ',d.pendingOrders||0,'Chờ xác nhận thanh toán'],
    ['Doanh thu ghi nhận',money.format(d.revenueVnd||0),'Các đơn đã duyệt'],
    ['TG đọc hồ sơ TB',secs(d.avgImportLatencyMs),'200 lượt gần nhất']
  ].map(([a,b,c])=>`<article class="admin-metric"><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></article>`).join('');
}

async function loadUsers(){
  const params=new URLSearchParams({page:String(userPage),perPage:String(PAGE_SIZE)});if(userQuery)params.set('q',userQuery);
  const d=await api(`/api/admin/users?${params}`);
  userTotalPages=Math.max(1,Number(d.totalPages||1));
  if(userPage>userTotalPages){userPage=userTotalPages;return loadUsers();}
  $('usersTable').querySelector('tbody').innerHTML=(d.users||[]).map(u=>{
    const w=u.wallet||{},p=u.profile||{},id=esc(u.id);
    return `<tr data-user="${id}"><td><b>${esc(u.email||u.id)}</b><small>${p.role==='admin'?'Quản trị viên':'Người dùng'} · ${esc(u.id)}</small></td><td>${esc(viDate(u.created_at))}</td><td><span class="admin-pill ${p.status==='suspended'?'warn':'ok'}">${esc(p.status||'active')}</span></td><td>Thủ công <b>${w.direct_credits??0}</b> · File/ảnh <b>${w.file_credits??0}</b> · Lưu <b>${w.history_credits??0}</b></td><td><div class="credit-controls"><input class="grant-direct" type="number" min="0" value="0" title="Nhập thủ công"><input class="grant-file" type="number" min="0" value="0" title="File/ảnh tự động"><input class="grant-history" type="number" min="0" value="0" title="Lưu"><button class="button secondary small grant-btn" type="button">Cộng</button></div></td><td>${p.role==='admin'?'—':`<button class="button secondary small status-btn" type="button" data-next="${p.status==='suspended'?'active':'suspended'}">${p.status==='suspended'?'Mở khóa':'Tạm khóa'}</button>`}</td></tr>`;
  }).join('')||'<tr><td colspan="6">Không tìm thấy tài khoản phù hợp.</td></tr>';
  document.querySelectorAll('.grant-btn').forEach(b=>b.addEventListener('click',()=>grant(b.closest('tr'))));
  document.querySelectorAll('.status-btn').forEach(b=>b.addEventListener('click',()=>changeStatus(b.closest('tr'),b.dataset.next)));
  renderPager('usersPagination',{page:d.page,totalPages:userTotalPages,total:d.total,label:userQuery?'kết quả':'tài khoản'},next=>{userPage=next;loadUsers();});
  if(d.searchTruncated)msg('userMessage','info','Kết quả tra cứu được giới hạn trong 5.000 tài khoản đầu tiên. Hãy nhập từ khóa cụ thể hơn nếu cần.');
}
async function runUserSearch(){userQuery=$('userSearchInput')?.value.trim()||'';userPage=1;msg('userMessage','','');await loadUsers();}
async function clearUserSearch(){userQuery='';userPage=1;if($('userSearchInput'))$('userSearchInput').value='';msg('userMessage','','');await loadUsers();}
async function grant(row){
  try{const id=row.dataset.user;const body={direct:+row.querySelector('.grant-direct').value||0,file:+row.querySelector('.grant-file').value||0,history:+row.querySelector('.grant-history').value||0,note:'Điều chỉnh từ trang quản trị'};await api(`/api/admin/users/${id}/credits`,{method:'POST',body:JSON.stringify(body)});msg('userMessage','success','Đã cộng lượt cho tài khoản.');await loadUsers();}catch(e){msg('userMessage','error',e.message);}
}
async function changeStatus(row,status){try{await api(`/api/admin/users/${row.dataset.user}/status`,{method:'PATCH',body:JSON.stringify({status})});await loadUsers();}catch(e){msg('userMessage','error',e.message);}}

async function loadPlans(){
  const d=await api('/api/admin/plans');
  $('plansTable').querySelector('tbody').innerHTML=(d.plans||[]).map(p=>`<tr data-plan="${esc(p.id)}"><td><b>${esc(p.name)}</b><small>${esc(p.code)}</small></td><td><input class="p-price" type="number" min="0" step="1000" value="${Number(p.price_vnd||0)}"></td><td><input class="p-direct" type="number" min="0" value="${Number(p.direct_credits||0)}"></td><td><input class="p-file" type="number" min="0" value="${Number(p.file_credits||0)}"></td><td><input class="p-history" type="number" min="0" value="${Number(p.history_credits||0)}"></td><td><input class="p-active" type="checkbox" ${p.active?'checked':''}></td><td><div class="admin-action-row"><button class="button secondary small save-plan" type="button">Lưu</button><button class="button danger small delete-plan" type="button">Xóa</button></div></td></tr>`).join('')||'<tr><td colspan="7">Chưa có gói. Tạo gói đầu tiên ở biểu mẫu phía trên.</td></tr>';
  document.querySelectorAll('.save-plan').forEach(b=>b.addEventListener('click',()=>savePlan(b.closest('tr'))));
  document.querySelectorAll('.delete-plan').forEach(b=>b.addEventListener('click',()=>deletePlan(b.closest('tr'))));
}
async function createPlan(ev){
  ev.preventDefault();try{const body={code:$('planCode').value.trim(),name:$('planName').value.trim(),description:$('planDescription').value.trim(),priceVnd:+$('planPrice').value||0,direct:+$('planDirect').value||0,file:+$('planFile').value||0,history:+$('planHistory').value||0,active:true};await api('/api/admin/plans',{method:'POST',body:JSON.stringify(body)});msg('planMessage','success','Đã tạo gói mới.');ev.target.reset();$('planDirect').value=0;$('planFile').value=0;$('planHistory').value=0;await loadPlans();}catch(e){msg('planMessage','error',e.message);}
}
async function savePlan(row){try{const body={priceVnd:+row.querySelector('.p-price').value||0,direct:+row.querySelector('.p-direct').value||0,file:+row.querySelector('.p-file').value||0,history:+row.querySelector('.p-history').value||0,active:row.querySelector('.p-active').checked};await api(`/api/admin/plans/${row.dataset.plan}`,{method:'PATCH',body:JSON.stringify(body)});msg('planMessage','success','Đã cập nhật gói.');await loadPlans();}catch(e){msg('planMessage','error',e.message);}}
async function deletePlan(row){if(!window.confirm('Xóa gói này khỏi danh sách bán? Các đơn hàng cũ vẫn được giữ để đối soát.'))return;try{await api(`/api/admin/plans/${row.dataset.plan}`,{method:'DELETE'});msg('planMessage','success','Đã xóa gói.');await loadPlans();}catch(e){msg('planMessage','error',e.message);}}

async function loadPayosStatus(){
  const status=$('payosAdminStatus'),url=$('payosWebhookUrl'),btn=$('confirmPayosWebhookBtn');if(!status)return;
  try{const d=await api('/api/admin/payments/payos/status');const x=d.diagnostics||{};status.textContent=d.configured?`payOS đã có đủ khóa kết nối · API: ${x.apiBase||'mặc định'} · APP_URL: ${x.appUrl||'chưa xác định'}`:`Chưa đủ cấu hình payOS (Client ID: ${x.clientIdPresent?'có':'thiếu'}, API Key: ${x.apiKeyPresent?'có':'thiếu'}, Checksum Key: ${x.checksumKeyPresent?'có':'thiếu'}).`;status.className=d.configured?'ok-text':'warn-text';if(url)url.textContent=d.webhookUrl||'';if(btn)btn.disabled=!d.configured;}
  catch(e){status.textContent=e.message;if(btn)btn.disabled=true;}
}
async function confirmPayos(){
  const btn=$('confirmPayosWebhookBtn');if(btn)btn.disabled=true;
  try{const d=await api('/api/admin/payments/payos/confirm-webhook',{method:'POST',body:'{}'});msg('orderMessage','success',`Đã đăng ký webhook payOS: ${d.webhookUrl}`);await loadPayosStatus();}
  catch(e){msg('orderMessage','error',e.message);}finally{if(btn)btn.disabled=false;}
}

async function loadOrders(){
  const params=buildListParams(orderPage,orderFilters);
  const d=await api(`/api/admin/orders?${params.toString()}`);orderTotalPages=Math.max(1,Number(d.totalPages||1));
  if(orderPage>orderTotalPages){orderPage=orderTotalPages;return loadOrders();}
  $('ordersTable').querySelector('tbody').innerHTML=(d.orders||[]).map(o=>`<tr><td><b>${esc(o.payment_code)}</b></td><td>${esc(o.user_contact||o.user_id)}</td><td>${esc(o.plan_name)}</td><td>${esc(money.format(o.amount_vnd||0))}</td><td>${esc(viDate(o.created_at))}</td><td><span class="admin-pill ${o.status==='paid'?'ok':o.status==='pending'?'warn':''}">${esc(o.status)}</span></td><td>${o.status==='pending'?`<div class="admin-action-row"><button class="button primary small approve-order" data-order="${esc(o.id)}" type="button">Xác nhận đã thanh toán</button><button class="button danger small cancel-order" data-order="${esc(o.id)}" type="button">Hủy thanh toán</button></div>`:'—'}</td></tr>`).join('')||'<tr><td colspan="7">Không có đơn hàng phù hợp bộ lọc.</td></tr>';
  document.querySelectorAll('.approve-order').forEach(b=>b.addEventListener('click',()=>approveOrder(b.dataset.order)));
  document.querySelectorAll('.cancel-order').forEach(b=>b.addEventListener('click',()=>cancelOrder(b.dataset.order)));
  renderPager('ordersPagination',{page:d.page,totalPages:orderTotalPages,total:d.total,label:hasFilters(orderFilters)?'đơn phù hợp':'đơn hàng'},next=>{orderPage=next;loadOrders();});
  if(d.searchTruncated)msg('orderMessage','info','Kết quả tra cứu đang giới hạn trong 5.000 đơn gần nhất phù hợp điều kiện. Hãy thu hẹp bộ lọc nếu cần.');
}
async function runOrderSearch(){orderFilters=collectOrderFilters();orderPage=1;msg('orderMessage','','');await loadOrders();}
async function clearOrderFilters(){orderFilters={};orderPage=1;clearInputs(['orderSearchInput','orderCodeFilter','orderUserFilter','orderPlanFilter','orderAmountMinFilter','orderAmountMaxFilter','orderDateFromFilter','orderDateToFilter','orderStatusFilter']);msg('orderMessage','','');await loadOrders();}
async function approveOrder(id){try{await api(`/api/admin/orders/${id}/approve`,{method:'POST',body:'{}'});msg('orderMessage','success','Đã xác nhận thanh toán và cộng lượt vào tài khoản.');await Promise.all([loadOrders(),loadMetrics(),loadUsers()]);}catch(e){msg('orderMessage','error',e.message);}}
async function cancelOrder(id){if(!window.confirm('Hủy giao dịch đang chờ này? QR/link payOS cũng sẽ được hủy nếu còn hiệu lực.'))return;try{await api(`/api/admin/orders/${id}/cancel`,{method:'POST',body:JSON.stringify({reason:'Quản trị viên hủy giao dịch'})});msg('orderMessage','success','Đã hủy giao dịch.');await Promise.all([loadOrders(),loadMetrics()]);}catch(e){msg('orderMessage','error',e.message);}}

async function loadImports(){
  const params=buildListParams(importPage,importFilters);
  const d=await api(`/api/admin/imports?${params.toString()}`);importTotalPages=Math.max(1,Number(d.totalPages||1));
  if(importPage>importTotalPages){importPage=importTotalPages;return loadImports();}
  $('importsTable').querySelector('tbody').innerHTML=(d.imports||[]).map(x=>`<tr><td><b>${esc(x.user_contact||x.user_id||'—')}</b></td><td>${esc(viDate(x.created_at))}</td><td>${esc(x.parser_mode||x.provider||'—')}</td><td>${esc(x.model||'Không dùng AI')}</td><td>${esc(secs(x.latency_ms))}</td><td><span class="admin-pill ${x.status==='success'?'ok':'warn'}">${esc(x.status)}</span></td></tr>`).join('')||'<tr><td colspan="6">Không có lượt đọc hồ sơ phù hợp bộ lọc.</td></tr>';
  renderPager('importsPagination',{page:d.page,totalPages:importTotalPages,total:d.total,label:hasFilters(importFilters)?'kết quả':'lượt đọc hồ sơ'},next=>{importPage=next;loadImports();});
  if(d.searchTruncated)msg('importMessage','info','Kết quả tra cứu đang giới hạn trong 5.000 lượt đọc hồ sơ gần nhất phù hợp điều kiện. Hãy thu hẹp bộ lọc nếu cần.');
}
async function runImportSearch(){importFilters=collectImportFilters();importPage=1;msg('importMessage','','');await loadImports();}
async function clearImportFilters(){importFilters={};importPage=1;clearInputs(['importSearchInput','importUserFilter','importParserFilter','importModelFilter','importLatencyMinFilter','importLatencyMaxFilter','importDateFromFilter','importDateToFilter','importStatusFilter']);msg('importMessage','','');await loadImports();}

async function refreshAll(){
  const tasks=[loadMetrics(),loadUsers(),loadPlans(),loadOrders(),loadImports(),loadPayosStatus()];
  const results=await Promise.allSettled(tasks);const failed=results.find(r=>r.status==='rejected');
  if(failed)msg('userMessage','error',failed.reason?.message||'Một phần trang quản trị chưa tải được. Hãy kiểm tra database.');
}

$('confirmPayosWebhookBtn')?.addEventListener('click',confirmPayos);
$('adminLoginBtn')?.addEventListener('click',emailLogin);
$('adminGoogleBtn')?.addEventListener('click',googleLogin);
$('adminLogoutBtn')?.addEventListener('click',async()=>{if(client)await client.auth.signOut();location.href='/';});
$('refreshUsersBtn')?.addEventListener('click',loadUsers);
$('userSearchBtn')?.addEventListener('click',runUserSearch);
$('userSearchClearBtn')?.addEventListener('click',clearUserSearch);
$('userSearchInput')?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runUserSearch();}});
$('orderSearchBtn')?.addEventListener('click',runOrderSearch);
$('orderFilterClearBtn')?.addEventListener('click',clearOrderFilters);
$('refreshOrdersBtn')?.addEventListener('click',loadOrders);
$('importSearchBtn')?.addEventListener('click',runImportSearch);
$('importFilterClearBtn')?.addEventListener('click',clearImportFilters);
$('refreshImportsBtn')?.addEventListener('click',loadImports);
['orderSearchInput','orderCodeFilter','orderUserFilter','orderPlanFilter','orderAmountMinFilter','orderAmountMaxFilter'].forEach(id=>$(id)?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runOrderSearch();}}));
['importSearchInput','importUserFilter','importParserFilter','importModelFilter','importLatencyMinFilter','importLatencyMaxFilter'].forEach(id=>$(id)?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runImportSearch();}}));
$('planForm')?.addEventListener('submit',createPlan);
authenticate().catch(e=>showLogin(e.message));
