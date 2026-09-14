const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0});

let config=null, client=null, session=null, me=null;

function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function show(el){if(el)el.hidden=false;} function hide(el){if(el)el.hidden=true;}
function setMessage(id,type,text){const el=$(id);if(!el)return;el.innerHTML=text?`<div class="alert ${type}">${esc(text)}</div>`:'';}

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
  if(!session){me=null;renderAccount();return null;}
  const r=await authorizedFetch('/api/me');
  if(!r.ok){me=null;renderAccount();return null;}
  me=await r.json(); renderAccount(); return me;
}
function renderAccount(){
  const guest=$('accountGuest'),user=$('accountUser'),label=$('accountLabel'),quota=$('quotaSummary'),admin=$('adminLink');
  if(!config?.authEnabled){hide(guest);show(user);if(label)label.textContent='Chế độ thử nghiệm';if(quota)quota.textContent='Cấu hình Supabase để bật tài khoản và hạn mức.';hide(admin);return;}
  if(!session){show(guest);hide(user);hide(admin);return;}
  hide(guest);show(user);
  if(label)label.textContent=me?.profile?.display_name || session.user?.email || session.user?.phone || 'Tài khoản';
  const w=me?.wallet;
  if(quota)quota.textContent=w?`Trực tiếp: ${w.direct_credits} · Hồ sơ: ${w.file_credits} · Lưu: ${w.history_credits}`:'Đang tải hạn mức…';
  if(me?.profile?.role==='admin')show(admin);else hide(admin);
}

function openAuth(){show($('authModal'));setMessage('authMessage','','');}
function closeAuth(){hide($('authModal'));}
function openAccount(){if(!session)return openAuth();show($('accountModal'));loadOrders();loadHistory();}
function closeAccount(){hide($('accountModal'));}

async function signUpEmail(){
  const email=$('authEmail').value.trim(),password=$('authPassword').value;
  if(!email||password.length<6)return setMessage('authMessage','error','Nhập email hợp lệ và mật khẩu ít nhất 6 ký tự.');
  const {error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
  if(error)return setMessage('authMessage','error',error.message);
  setMessage('authMessage','success','Đã đăng ký. Kiểm tra email để xác nhận tài khoản nếu hệ thống yêu cầu.');
}
async function signInEmail(){
  const email=$('authEmail').value.trim(),password=$('authPassword').value;
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error)return setMessage('authMessage','error',error.message);closeAuth();
}
async function signInGoogle(){
  const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin}});
  if(error)setMessage('authMessage','error',error.message);
}
async function sendPhoneOtp(){
  const phone=$('authPhone').value.trim(); if(!phone)return setMessage('authMessage','error','Nhập số điện thoại theo định dạng quốc tế, ví dụ +8490...');
  const {error}=await client.auth.signInWithOtp({phone});
  if(error)return setMessage('authMessage','error',error.message);
  show($('otpRow'));setMessage('authMessage','success','Đã gửi mã OTP. Nhập mã nhận được để đăng nhập.');
}
async function verifyPhoneOtp(){
  const phone=$('authPhone').value.trim(),token=$('authOtp').value.trim();
  const {error}=await client.auth.verifyOtp({phone,token,type:'sms'});
  if(error)return setMessage('authMessage','error',error.message);closeAuth();
}
async function signOut(){if(client)await client.auth.signOut();session=null;me=null;renderAccount();closeAccount();}

async function loadPlans(){
  const host=$('planCards'); if(!host)return;
  host.innerHTML='<p>Đang tải các gói…</p>';
  const r=await fetch('/api/plans');const data=await r.json().catch(()=>({}));
  if(!r.ok){host.innerHTML=`<div class="alert error">${esc(data.error||'Không tải được gói.')}</div>`;return;}
  const plans=data.plans||[];
  host.innerHTML=plans.length?plans.map(p=>`<article class="plan-card">
    <h4>${esc(p.name)}</h4><strong>${money.format(p.price_vnd)}</strong><p>${esc(p.description||'')}</p>
    <ul><li>${p.direct_credits} lượt nhập trực tiếp</li><li>${p.file_credits} lượt nhập hồ sơ</li><li>${p.history_credits} lượt lưu lịch sử</li></ul>
    <button class="button primary buy-plan" data-plan="${esc(p.id)}" type="button">Chọn gói</button>
  </article>`).join(''):'<p>Quản trị viên chưa mở gói trả phí.</p>';
  host.querySelectorAll('.buy-plan').forEach(btn=>btn.addEventListener('click',()=>createOrder(btn.dataset.plan)));
}
async function openPlans(){
  if(config?.authEnabled&&!session){openAuth();return;}
  show($('plansModal'));await loadPlans();
}
async function createOrder(planId){
  if(!session)return openAuth();
  const r=await authorizedFetch('/api/orders',{method:'POST',body:JSON.stringify({planId})});const data=await r.json().catch(()=>({}));
  if(!r.ok)return setMessage('planMessage','error',data.error||'Không tạo được đơn hàng.');
  const b=data.bank||{},o=data.order;
  const lines=[`Mã thanh toán: ${o.payment_code}`,`Số tiền: ${money.format(o.amount_vnd)}`];
  if(b.bankName||b.accountNumber)lines.push(`Chuyển khoản: ${b.bankName||''} ${b.accountNumber||''} ${b.accountName||''}`.trim());
  setMessage('planMessage','success',`${lines.join(' · ')}. Sau khi thanh toán được xác nhận, lượt sử dụng sẽ tự cộng vào tài khoản.`);
  await loadOrders();
}
async function loadOrders(){
  if(!session)return;const host=$('orderList');if(!host)return;
  const r=await authorizedFetch('/api/orders/mine');const data=await r.json().catch(()=>({}));
  if(!r.ok){host.textContent=data.error||'Không tải được đơn hàng.';return;}
  host.innerHTML=(data.orders||[]).slice(0,8).map(o=>`<div class="account-list-row"><span>${esc(o.plan_name)} · ${money.format(o.amount_vnd)}</span><b>${o.status==='paid'?'Đã thanh toán':o.status==='pending'?'Chờ xác nhận':esc(o.status)}</b></div>`).join('')||'<p>Chưa có đơn hàng.</p>';
}
async function loadHistory(){
  if(!session)return;const host=$('historyList');if(!host)return;
  const r=await authorizedFetch('/api/history?limit=12');const data=await r.json().catch(()=>({}));
  if(!r.ok){host.textContent=data.error||'Không tải được lịch sử.';return;}
  host.innerHTML=(data.history||[]).map(h=>`<div class="account-list-row"><span>${esc(h.title||'Kết quả lương hưu')}<small>${new Date(h.created_at).toLocaleString('vi-VN')}</small></span><b>${h.mode==='file'?'Hồ sơ':'Trực tiếp'}</b></div>`).join('')||'<p>Chưa lưu kết quả nào.</p>';
}
async function saveHistory(payload){
  if(config?.authEnabled&&!session){openAuth();throw new Error('Vui lòng đăng nhập để lưu lịch sử.');}
  if(!config?.authEnabled)return {ok:true,demo:true};
  const r=await authorizedFetch('/api/history',{method:'POST',body:JSON.stringify(payload)});const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'Không lưu được lịch sử.');
  me={...(me||{}),wallet:data.wallet||me?.wallet};renderAccount();return data;
}

async function init(){
  config=await fetch('/api/config').then(r=>r.json()).catch(()=>({authEnabled:false}));
  if(config.authEnabled && window.supabase?.createClient){
    client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
    await refreshSession();
    client.auth.onAuthStateChange(async(_event,newSession)=>{session=newSession;await refreshMe();});
    await refreshMe();
  }else renderAccount();
  $('loginBtn')?.addEventListener('click',openAuth);$('accountBtn')?.addEventListener('click',openAccount);$('logoutBtn')?.addEventListener('click',signOut);
  $('authClose')?.addEventListener('click',closeAuth);$('accountClose')?.addEventListener('click',closeAccount);$('plansClose')?.addEventListener('click',()=>hide($('plansModal')));
  $('emailLoginBtn')?.addEventListener('click',signInEmail);$('emailSignupBtn')?.addEventListener('click',signUpEmail);$('googleLoginBtn')?.addEventListener('click',signInGoogle);
  $('sendOtpBtn')?.addEventListener('click',sendPhoneOtp);$('verifyOtpBtn')?.addEventListener('click',verifyPhoneOtp);$('buyCreditsBtn')?.addEventListener('click',openPlans);$('accountBuyBtn')?.addEventListener('click',openPlans);
}

window.PensionAccount={
  ready:init(),
  get config(){return config;},get session(){return session;},get me(){return me;},
  isAuthenticated(){return Boolean(session);},requireLogin(){if(config?.authEnabled&&!session){openAuth();return false;}return true;},
  authorizedFetch,refreshMe,openPlans,saveHistory,openAuth,openAccount
};
