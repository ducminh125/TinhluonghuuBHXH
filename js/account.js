const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0});

let config=null, client=null, session=null, me=null, accountError='';

function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function show(el){if(el)el.hidden=false;} function hide(el){if(el)el.hidden=true;}
function setMessage(id,type,text){const el=$(id);if(!el)return;el.innerHTML=text?`<div class="alert ${type}">${esc(text)}</div>`:'';}

async function jsonResponse(r){
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const err=new Error(data.error||`HTTP ${r.status}`);
    err.status=r.status; err.code=data.code||''; err.data=data;
    throw err;
  }
  return data;
}

async function authorizedFetch(url,options={}){
  const headers=new Headers(options.headers||{});
  if(!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json');
  const token=session?.access_token;
  if(token)headers.set('Authorization',`Bearer ${token}`);
  return fetch(url,{...options,headers});
}

async function refreshSession(){
  if(!client)return null;
  const {data}=await client.auth.getSession(); session=data.session||null; return session;
}
async function refreshMe(){
  accountError='';
  if(!session){me=null;renderAccount();return null;}
  try{
    const data=await jsonResponse(await authorizedFetch('/api/me'));
    me=data; renderAccount(); renderWalletDetail(); return me;
  }catch(e){
    me=null;
    accountError=e.code==='DATABASE_SETUP_REQUIRED'
      ? 'Cơ sở dữ liệu tài khoản chưa được cài đặt đầy đủ. Quản trị viên cần chạy migration v3.1.'
      : (e.message||'Không tải được thông tin tài khoản.');
    renderAccount(); renderWalletDetail(); return null;
  }
}
function renderAccount(){
  const guest=$('accountGuest'),user=$('accountUser'),label=$('accountLabel'),quota=$('quotaSummary'),admin=$('adminLink');
  if(!config?.authEnabled){hide(guest);show(user);if(label)label.textContent='Chế độ thử nghiệm';if(quota)quota.textContent='Cấu hình Supabase để bật tài khoản và hạn mức.';hide(admin);return;}
  if(!session){show(guest);hide(user);hide(admin);return;}
  hide(guest);show(user);
  if(label)label.textContent=me?.profile?.display_name || session.user?.email || 'Tài khoản';
  const w=me?.wallet;
  if(quota){
    if(w)quota.textContent=`Trực tiếp: ${w.direct_credits} · Hồ sơ: ${w.file_credits} · Lưu: ${w.history_credits}`;
    else quota.textContent=accountError||'Đang tải hạn mức…';
  }
  if(me?.profile?.role==='admin')show(admin);else hide(admin);
}
function renderWalletDetail(){
  const host=$('walletSummary'); if(!host)return;
  const w=me?.wallet;
  if(!session){host.innerHTML='<p>Đăng nhập để xem lượt sử dụng.</p>';return;}
  if(!w){host.innerHTML=`<div class="alert error">${esc(accountError||'Chưa tải được hạn mức sử dụng.')}</div>`;return;}
  host.innerHTML=`
    <article><span>Nhập trực tiếp</span><strong>${Number(w.direct_credits||0)}</strong><small>lượt còn lại</small></article>
    <article><span>Nhập hồ sơ</span><strong>${Number(w.file_credits||0)}</strong><small>lượt còn lại</small></article>
    <article><span>Lưu lịch sử</span><strong>${Number(w.history_credits||0)}</strong><small>lượt còn lại</small></article>`;
}

function openAuth(){show($('authModal'));setMessage('authMessage','','');}
function closeAuth(){hide($('authModal'));}
async function openAccount(){
  if(!session)return openAuth();
  show($('accountModal')); renderWalletDetail();
  await refreshMe();
  await Promise.all([loadOrders(),loadHistory()]);
}
function closeAccount(){hide($('accountModal'));}

async function signUpEmail(){
  const email=$('authEmail').value.trim(),password=$('authPassword').value;
  if(!email||password.length<6)return setMessage('authMessage','error','Nhập email hợp lệ và mật khẩu ít nhất 6 ký tự.');
  const redirectTo=`${location.origin}/auth/confirmed`;
  const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});
  if(error)return setMessage('authMessage','error',error.message);
  if(data?.session){
    setMessage('authMessage','success','Đăng ký thành công. Tài khoản đã được đăng nhập.');
    setTimeout(closeAuth,700);
    return;
  }
  setMessage('authMessage','success','Đã đăng ký. Vui lòng mở email và bấm “Xác nhận email”. Sau khi xác nhận, bạn sẽ được chuyển về trang báo đăng ký thành công.');
}
async function signInEmail(){
  const email=$('authEmail').value.trim(),password=$('authPassword').value;
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error)return setMessage('authMessage','error',error.message);closeAuth();
}
async function signInGoogle(){
  const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}/?login=google`}});
  if(error)setMessage('authMessage','error',error.message);
}
async function signOut(){if(client)await client.auth.signOut();session=null;me=null;accountError='';renderAccount();renderWalletDetail();closeAccount();}

async function loadPlans(){
  const host=$('planCards'); if(!host)return;
  host.innerHTML='<p>Đang tải các gói…</p>';
  try{
    const data=await jsonResponse(await fetch('/api/plans'));
    const plans=data.plans||[];
    host.innerHTML=plans.length?plans.map(p=>`<article class="plan-card">
      <h4>${esc(p.name)}</h4><strong>${money.format(p.price_vnd)}</strong><p>${esc(p.description||'')}</p>
      <ul><li>${p.direct_credits} lượt nhập trực tiếp</li><li>${p.file_credits} lượt nhập hồ sơ</li><li>${p.history_credits} lượt lưu lịch sử</li></ul>
      <button class="button primary buy-plan" data-plan="${esc(p.id)}" type="button">Chọn gói</button>
    </article>`).join(''):'<p>Quản trị viên chưa mở gói trả phí.</p>';
    host.querySelectorAll('.buy-plan').forEach(btn=>btn.addEventListener('click',()=>createOrder(btn.dataset.plan)));
  }catch(e){
    const message=e.code==='DATABASE_SETUP_REQUIRED'
      ? 'Hệ thống gói sử dụng đang được quản trị viên hoàn tất cấu hình. Vui lòng thử lại sau.'
      : (e.message||'Không tải được gói.');
    host.innerHTML=`<div class="alert error">${esc(message)}</div>`;
  }
}
async function openPlans(){
  if(config?.authEnabled&&!session){openAuth();return;}
  show($('plansModal'));setMessage('planMessage','','');await loadPlans();
}
async function createOrder(planId){
  if(!session)return openAuth();
  try{
    const data=await jsonResponse(await authorizedFetch('/api/orders',{method:'POST',body:JSON.stringify({planId})}));
    const b=data.bank||{},o=data.order;
    const lines=[`Mã thanh toán: ${o.payment_code}`,`Số tiền: ${money.format(o.amount_vnd)}`];
    if(b.bankName||b.accountNumber)lines.push(`Chuyển khoản: ${b.bankName||''} ${b.accountNumber||''} ${b.accountName||''}`.trim());
    setMessage('planMessage','success',`${lines.join(' · ')}. Sau khi thanh toán được xác nhận, lượt sử dụng sẽ tự cộng vào tài khoản.`);
    await loadOrders();
  }catch(e){setMessage('planMessage','error',e.message||'Không tạo được đơn hàng.');}
}
async function loadOrders(){
  if(!session)return;const host=$('orderList');if(!host)return;
  host.innerHTML='<p>Đang tải đơn hàng…</p>';
  try{
    const data=await jsonResponse(await authorizedFetch('/api/orders/mine'));
    host.innerHTML=(data.orders||[]).slice(0,8).map(o=>`<div class="account-list-row"><span>${esc(o.plan_name)} · ${money.format(o.amount_vnd)}</span><b>${o.status==='paid'?'Đã thanh toán':o.status==='pending'?'Chờ xác nhận':esc(o.status)}</b></div>`).join('')||'<p>Chưa có đơn hàng.</p>';
  }catch(e){host.innerHTML=`<div class="alert error">${esc(e.code==='DATABASE_SETUP_REQUIRED'?'Chức năng đơn hàng chưa được quản trị viên cài đặt đầy đủ.':e.message)}</div>`;}
}
async function loadHistory(){
  if(!session)return;const host=$('historyList');if(!host)return;
  host.innerHTML='<p>Đang tải lịch sử…</p>';
  try{
    const data=await jsonResponse(await authorizedFetch('/api/history?limit=12'));
    host.innerHTML=(data.history||[]).map(h=>`<div class="account-list-row"><span>${esc(h.title||'Kết quả lương hưu')}<small>${new Date(h.created_at).toLocaleString('vi-VN')}</small></span><b>${h.mode==='file'?'Hồ sơ':'Trực tiếp'}</b></div>`).join('')||'<p>Chưa lưu kết quả nào.</p>';
  }catch(e){host.innerHTML=`<div class="alert error">${esc(e.code==='DATABASE_SETUP_REQUIRED'?'Chức năng lịch sử chưa được quản trị viên cài đặt đầy đủ.':e.message)}</div>`;}
}
async function saveHistory(payload){
  if(config?.authEnabled&&!session){openAuth();throw new Error('Vui lòng đăng nhập để lưu lịch sử.');}
  if(!config?.authEnabled)return {ok:true,demo:true};
  const data=await jsonResponse(await authorizedFetch('/api/history',{method:'POST',body:JSON.stringify(payload)}));
  me={...(me||{}),wallet:data.wallet||me?.wallet};renderAccount();renderWalletDetail();return data;
}

async function init(){
  config=await fetch('/api/config').then(r=>r.json()).catch(()=>({authEnabled:false}));
  if(config.authEnabled && window.supabase?.createClient){
    client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,detectSessionInUrl:true}});
    await refreshSession();
    client.auth.onAuthStateChange(async(_event,newSession)=>{session=newSession;await refreshMe();});
    await refreshMe();
  }else renderAccount();
  $('loginBtn')?.addEventListener('click',openAuth);$('accountBtn')?.addEventListener('click',openAccount);$('logoutBtn')?.addEventListener('click',signOut);
  $('authClose')?.addEventListener('click',closeAuth);$('accountClose')?.addEventListener('click',closeAccount);$('plansClose')?.addEventListener('click',()=>hide($('plansModal')));
  $('emailLoginBtn')?.addEventListener('click',signInEmail);$('emailSignupBtn')?.addEventListener('click',signUpEmail);$('googleLoginBtn')?.addEventListener('click',signInGoogle);
  $('buyCreditsBtn')?.addEventListener('click',openPlans);$('accountBuyBtn')?.addEventListener('click',openPlans);
}

window.PensionAccount={
  ready:init(),
  get config(){return config;},get session(){return session;},get me(){return me;},
  isAuthenticated(){return Boolean(session);},requireLogin(){if(config?.authEnabled&&!session){openAuth();return false;}return true;},
  authorizedFetch,refreshMe,openPlans,saveHistory,openAuth,openAccount
};
