const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0});

let config=null, client=null, session=null, me=null, accountError='';
let paymentPollTimer=null, paymentPollBusy=false, currentPaymentOrderId=null, currentHistoryId=null;

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
      ? 'Hệ thống tài khoản đang được cấu hình. Vui lòng thử lại sau.'
      : (e.message||'Không tải được thông tin tài khoản.');
    renderAccount(); renderWalletDetail(); return null;
  }
}
function renderAccount(){
  const guest=$('accountGuest'),user=$('accountUser'),label=$('accountLabel'),quota=$('quotaSummary'),admin=$('adminLink');
  if(!config?.authEnabled){hide(guest);show(user);if(label)label.textContent='Chế độ thử nghiệm';if(quota)quota.textContent='Tài khoản và hạn mức chưa được bật.';hide(admin);return;}
  if(!session){show(guest);hide(user);hide(admin);return;}
  hide(guest);show(user);
  if(label)label.textContent=me?.profile?.display_name || session.user?.email || 'Tài khoản';
  const w=me?.wallet;
  if(quota){
    if(w)quota.textContent=`Thủ công: ${w.direct_credits} · File/ảnh tự động: ${w.file_credits} · Lưu: ${w.history_credits}`;
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
    <article><span>Lượt nhập thủ công</span><strong>${Number(w.direct_credits||0)}</strong><small>lượt còn lại</small></article>
    <article><span>Lượt nhập bằng file/ảnh tự động</span><strong>${Number(w.file_credits||0)}</strong><small>lượt còn lại</small></article>
    <article><span>Lượt lưu lịch sử</span><strong>${Number(w.history_credits||0)}</strong><small>lượt còn lại</small></article>`;
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
function applyGoogleAuthAvailability(){
  const btn=$('googleLoginBtn'),hint=$('googleAuthHint');
  if(!btn)return;
  if(config?.googleAuthEnabled!==true){
    btn.disabled=true;
    btn.textContent=config?.googleAuthChecked===false?'Google tạm chưa khả dụng':'Google hiện chưa khả dụng';
    if(hint){
      hint.hidden=false;
      hint.textContent='Đăng nhập Google tạm chưa khả dụng. Vui lòng dùng email và mật khẩu.';
    }
  }else{
    btn.disabled=false;
    btn.textContent='Tiếp tục bằng Google';
    if(hint){
      hint.hidden=config?.googleAuthChecked!==false;
      hint.textContent=config?.googleAuthChecked===false?'Google tạm chưa khả dụng. Vui lòng dùng email và mật khẩu.':'';
    }
  }
}
async function signInGoogle(){
  if(config?.googleAuthEnabled!==true){
    setMessage('authMessage','error','Đăng nhập Google hiện chưa khả dụng. Vui lòng dùng email và mật khẩu.');
    return;
  }
  const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}/?login=google`}});
  if(error){
    const message=/provider.*(disabled|not enabled)|unsupported provider/i.test(error.message||'')
      ? 'Đăng nhập Google hiện chưa khả dụng. Vui lòng dùng email và mật khẩu.'
      : error.message;
    setMessage('authMessage','error',message);
  }
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
      <ul><li>${p.direct_credits} lượt nhập thủ công</li><li>${p.file_credits} lượt nhập bằng file/ảnh tự động</li><li>${p.history_credits} lượt lưu lịch sử</li></ul>
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
function stopPaymentPolling(){if(paymentPollTimer){clearInterval(paymentPollTimer);paymentPollTimer=null;}paymentPollBusy=false;currentPaymentOrderId=null;}
function setPaymentStatus(status,label){
  const el=$('paymentStatus');if(!el)return;el.className=`payment-status ${status}`;el.textContent=label;
}
function setPaymentWaiting(status='pending'){
  const el=$('paymentWaiting');if(!el)return;
  el.className=`payment-waiting ${status}`;
  if(status==='paid'){
    el.innerHTML='<span class="payment-waiting-check" aria-hidden="true">✓</span><div><strong>Giao dịch đã được xác nhận</strong><small>Số lượt của gói đã được cộng vào tài khoản của bạn.</small></div>';
  }else if(status==='cancelled'){
    el.innerHTML='<span class="payment-waiting-stop" aria-hidden="true">!</span><div><strong>Không còn chờ giao dịch</strong><small>Đơn thanh toán đã bị hủy hoặc hết hạn. Vui lòng tạo đơn mới nếu vẫn muốn mua gói.</small></div>';
  }else{
    el.innerHTML='<span class="payment-waiting-spinner" aria-hidden="true"></span><div><strong>Đang chờ xác nhận giao dịch</strong><small>Hệ thống đang kiểm tra giao dịch tự động. Sau khi ngân hàng ghi nhận tiền, số lượt sẽ được cộng vào tài khoản.</small></div>';
  }
}
function closePayment(){stopPaymentPolling();hide($('paymentModal'));}

const BANK_META={
  '970418':{short:'BIDV',name:'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam'},
  '970436':{short:'Vietcombank',name:'Ngân hàng TMCP Ngoại thương Việt Nam'},
  '970415':{short:'VietinBank',name:'Ngân hàng TMCP Công Thương Việt Nam'},
  '970405':{short:'Agribank',name:'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam'},
  '970422':{short:'MB',name:'Ngân hàng TMCP Quân đội'},
  '970407':{short:'Techcombank',name:'Ngân hàng TMCP Kỹ thương Việt Nam'},
  '970416':{short:'ACB',name:'Ngân hàng TMCP Á Châu'},
  '970432':{short:'VPBank',name:'Ngân hàng TMCP Việt Nam Thịnh Vượng'},
  '970403':{short:'Sacombank',name:'Ngân hàng TMCP Sài Gòn Thương Tín'},
  '970423':{short:'TPBank',name:'Ngân hàng TMCP Tiên Phong'},
  '970441':{short:'VIB',name:'Ngân hàng TMCP Quốc tế Việt Nam'},
  '970443':{short:'SHB',name:'Ngân hàng TMCP Sài Gòn - Hà Nội'},
  '970426':{short:'MSB',name:'Ngân hàng TMCP Hàng Hải Việt Nam'},
  '970437':{short:'HDBank',name:'Ngân hàng TMCP Phát triển TP.HCM'}
};

function bankMeta(payment={}){
  const byBin=BANK_META[String(payment.bin||'').trim()]||null;
  const fallback=String(payment.bankName||'').trim();
  return {
    short:byBin?.short||fallback||'Ngân hàng',
    name:byBin?.name||fallback||'Tài khoản nhận thanh toán'
  };
}

function buildVietQrUrl(payment={}){
  if(payment.qrImageUrl)return String(payment.qrImageUrl);
  const bin=String(payment.bin||'').trim(),account=String(payment.accountNumber||'').trim();
  const amount=Math.trunc(Number(payment.amount||0));
  if(!bin||!account||!Number.isInteger(amount)||amount<=0)return '';
  const params=new URLSearchParams({amount:String(amount)});
  const description=String(payment.description||payment.paymentCode||'').trim();
  const name=String(payment.accountName||'').trim();
  if(description)params.set('addInfo',description);
  if(name)params.set('accountName',name);
  return `https://img.vietqr.io/image/${encodeURIComponent(bin)}-${encodeURIComponent(account)}-qr_only.png?${params.toString()}`;
}

function showPaymentQr(payment){
  const img=$('paymentQrImage'),fallback=$('paymentQrFallback');
  if(!img||!fallback)return;
  const url=buildVietQrUrl(payment);
  img.hidden=true;fallback.hidden=false;
  fallback.innerHTML='<strong>Đang tải mã VietQR…</strong><span>Vui lòng chờ trong giây lát.</span>';
  img.onload=()=>{img.hidden=false;fallback.hidden=true;};
  img.onerror=()=>{img.hidden=true;fallback.hidden=false;fallback.innerHTML='<strong>Chưa tải được mã QR</strong><span>Bạn vẫn có thể chuyển khoản bằng thông tin bên cạnh hoặc mở trang thanh toán dự phòng.</span>';};
  if(!url){img.removeAttribute('src');img.onerror();return;}
  img.src=url;
}

async function copyText(value){
  const text=String(value??'').trim();if(!text)return false;
  try{await navigator.clipboard.writeText(text);return true;}catch{}
  try{
    const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok;
  }catch{return false;}
}

async function renderPayment(order,payment){
  hide($('plansModal'));show($('paymentModal'));currentPaymentOrderId=order.id;
  const amount=Number(payment.amount||order.amount_vnd||0);
  const meta=bankMeta(payment);
  $('paymentPlanName').textContent=order.plan_name||'';
  $('paymentAmount').textContent=money.format(amount);
  $('paymentAmount').dataset.copy=String(Math.trunc(amount));
  $('paymentBank').textContent=meta.name;
  $('paymentBankShort').textContent=meta.short;
  $('paymentBankBadge').textContent=meta.short.slice(0,4).toUpperCase();
  $('paymentAccount').textContent=payment.accountNumber||'—';
  $('paymentAccountName').textContent=payment.accountName||'—';
  $('paymentCode').textContent=payment.description||payment.paymentCode||'—';
  $('paymentOrderCode').textContent=String(payment.orderCode||order.payment_code||'—');
  const link=$('paymentCheckoutLink');if(link){link.href=payment.checkoutUrl||'#';link.hidden=!payment.checkoutUrl;}
  setPaymentStatus('pending','Chờ thanh toán');setPaymentWaiting('pending');setMessage('paymentMessage','','');
  showPaymentQr(payment);
  startPaymentPolling(order.id);
}
async function checkPaymentStatus(orderId){
  if(paymentPollBusy||!session||!orderId)return;paymentPollBusy=true;
  try{
    const data=await jsonResponse(await authorizedFetch(`/api/orders/${encodeURIComponent(orderId)}/status`));
    const status=data.order?.status;
    if(status==='paid'){
      stopPaymentPolling();setPaymentStatus('paid','Đã thanh toán');setPaymentWaiting('paid');
      setMessage('paymentMessage','success','Thanh toán đã được xác nhận. Lượt sử dụng đã tự động cộng vào tài khoản.');
      if(data.wallet)me={...(me||{}),wallet:data.wallet};else await refreshMe();
      renderAccount();renderWalletDetail();await loadOrders();
    }else if(status==='cancelled'||status==='expired'){
      stopPaymentPolling();setPaymentStatus('cancelled',status==='cancelled'?'Đã hủy':'Đã hết hạn');setPaymentWaiting('cancelled');
      setMessage('paymentMessage','error','Đơn thanh toán không còn hiệu lực. Vui lòng chọn lại gói để tạo QR mới.');
    }else {setPaymentStatus('pending','Chờ thanh toán');setPaymentWaiting('pending');}
  }catch(e){console.warn('Không kiểm tra được thanh toán',e);}finally{paymentPollBusy=false;}
}
function startPaymentPolling(orderId){
  stopPaymentPolling();currentPaymentOrderId=orderId;checkPaymentStatus(orderId);
  paymentPollTimer=setInterval(()=>checkPaymentStatus(orderId),3000);
}
async function createOrder(planId){
  if(!session)return openAuth();
  setMessage('planMessage','','');
  const buttons=[...document.querySelectorAll('.buy-plan')];
  buttons.forEach(b=>b.disabled=true);
  try{
    setMessage('planMessage','info','Đang tạo mã QR thanh toán…');
    const data=await jsonResponse(await authorizedFetch('/api/orders',{method:'POST',body:JSON.stringify({planId})}));
    if(!data.payment?.qrCode)throw Object.assign(new Error('Nhà cung cấp thanh toán chưa trả về mã QR. Vui lòng thử lại.'),{code:'PAYOS_NO_QR'});
    setMessage('planMessage','','');
    await renderPayment(data.order,data.payment);
    await loadOrders();
  }catch(e){
    const errorId=e?.data?.errorId||'';
    const suffix=errorId?` · Mã lỗi: ${errorId}`:'';
    setMessage('planMessage','error',`${e.message||'Không tạo được đơn thanh toán.'}${suffix}`);
  }finally{
    buttons.forEach(b=>b.disabled=false);
  }
}
async function loadOrders(){
  if(!session)return;const host=$('orderList');if(!host)return;
  host.innerHTML='<p>Đang tải đơn hàng…</p>';
  try{
    const data=await jsonResponse(await authorizedFetch('/api/orders/mine'));
    host.innerHTML=(data.orders||[]).map(o=>`<div class="account-list-row"><span>${esc(o.plan_name)} · ${money.format(o.amount_vnd)}<small>Mã đơn: ${esc(o.payment_code||'—')}</small></span><b>${o.status==='paid'?'Đã thanh toán':o.status==='pending'?'Chờ thanh toán':o.status==='cancelled'?'Đã hủy':esc(o.status)}</b></div>`).join('')||'<p>Chưa có đơn hàng.</p>';
  }catch(e){host.innerHTML=`<div class="alert error">${esc(e.code==='DATABASE_SETUP_REQUIRED'?'Chức năng đơn hàng chưa được quản trị viên cài đặt đầy đủ.':e.message)}</div>`;}
}
const HISTORY_CASE_LABELS={
  normal:'Điều kiện lao động bình thường',heavy:'Nghề/công việc nặng nhọc, độc hại hoặc vùng đặc biệt khó khăn',coal:'Khai thác than trong hầm lò',impairment61:'Suy giảm KNLĐ từ 61% đến dưới 81%',impairment81:'Suy giảm KNLĐ từ 81% trở lên',specialImpairment:'Nghề đặc biệt NNĐHNH + suy giảm KNLĐ'
};
const HISTORY_REGIME_LABELS={state:'Lương do Nhà nước quy định',employer:'Lương do NSDLĐ quyết định',voluntary:'BHXH tự nguyện',unknown:'Chưa xác định'};
function historyMonth(ym){const v=String(ym||'');return /^\d{4}-\d{2}$/.test(v)?`${v.slice(5,7)}/${v.slice(0,4)}`:'—';}
function historyDate(iso){const v=String(iso||'');if(/^\d{4}-\d{2}-\d{2}$/.test(v))return `${v.slice(8,10)}/${v.slice(5,7)}/${v.slice(0,4)}`;return v||'—';}
function historyDuration(months){if(months===null||months===undefined||months==='')return '—';const n=Math.max(0,Number(months));if(!Number.isFinite(n))return '—';const y=Math.floor(n/12),m=n%12;return `${y} năm${m?` ${m} tháng`:''}`;}
function historyPercent(v){if(v===null||v===undefined||v==='')return '—';const n=Number(v);return Number.isFinite(n)?`${new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(n)}%`:'—';}
function historyMoney(v){if(v===null||v===undefined||v==='')return '—';const n=Number(v);return Number.isFinite(n)?money.format(n):'—';}
function historyPeriodValue(p={}){
  if(p.valueType==='coefficient')return `Hệ số ${new Intl.NumberFormat('vi-VN',{maximumFractionDigits:3}).format(Number(p.coefficient||0))}`;
  return historyMoney(p.amountVnd||0);
}
function historyAllowance(p={}){
  const parts=[];
  if(Number(p.positionAllowanceCoeff||0))parts.push(`PC chức vụ ${p.positionAllowanceCoeff}`);
  if(Number(p.seniorityBeyondPercent||0))parts.push(`TNVK ${p.seniorityBeyondPercent}%`);
  if(Number(p.professionalSeniorityPercent||0))parts.push(`Thâm niên nghề ${p.professionalSeniorityPercent}%`);
  if(Number(p.reservedDifferenceCoeff||0))parts.push(`Bảo lưu ${p.reservedDifferenceCoeff}`);
  if(Number(p.allowanceVnd||0))parts.push(`PC ${historyMoney(p.allowanceVnd)}`);
  return parts.join(' · ')||'—';
}
const HISTORY_BENEFIT_LABELS={pension:'Lương hưu',one_time:'BHXH một lần',unemployment:'Trợ cấp thất nghiệp',maternity:'Chế độ thai sản'};
const HISTORY_ONE_TIME_REASON_LABELS={retirement_age:'Đủ tuổi nhưng chưa đủ thời gian hưởng lương hưu',emigration:'Ra nước ngoài để định cư',serious_condition:'Bệnh nặng/suy giảm khả năng lao động thuộc diện luật định',pre2025_after12months:'Có thời gian đóng trước 01/07/2025, sau 12 tháng không tiếp tục đóng và chưa đủ 20 năm',other:'Trường hợp khác theo luật'};
const HISTORY_MATERNITY_CASE_LABELS={female_birth:'Lao động nữ sinh con',male_birth:'Lao động nam có vợ sinh con',prenatal:'Khám thai',pregnancy_loss:'Sảy thai/phá thai/thai chết/thai ngoài tử cung',contraception_iud:'Đặt dụng cụ tránh thai',contraception_sterilization:'Triệt sản'};
function historySalaryList(values=[]){const nums=(Array.isArray(values)?values:[]).map(Number).filter(v=>Number.isFinite(v)&&v>0);return nums.length?nums.map((v,i)=>`T${i+1}: ${historyMoney(v)}`).join(' · '):'—';}
function historyBenefitType(h){const input=h.input_json||{};const saved=h.result_json||{};return saved.benefitType||input.benefitType||'pension';}
function historySummary(h){
  const saved=h.result_json||{};const type=historyBenefitType(h);
  if(type==='one_time')return {type,line:`${historyMoney(saved.estimatedAmount)} · ${historyDuration(saved.totalMonths)} · giải quyết ${historyMonth(saved.settlementMonth)}`};
  if(type==='unemployment')return {type,line:`${historyMoney(saved.monthlyBenefit)}/tháng · ${saved.durationMonths||0} tháng · tổng ${historyMoney(saved.estimatedTotal)}`};
  if(type==='maternity')return {type,line:`${historyMoney(saved.estimatedTotal)} · ${saved.durationLabel||'—'} · ${saved.eligible===false?'chưa đủ điều kiện':'ước tính'}`};
  const avg=saved.avg||{};const result=saved.result||{};
  return {type,line:`${historyMoney(result.monthlyPension)} · ${historyPercent(result.finalRate)} · ${historyDuration(avg.totalMonths||result.totalMonths)}`};
}
function closeHistoryDetail(){currentHistoryId=null;hide($('historyDetailPanel'));const c=$('historyDetailContent');if(c)c.innerHTML='';}
function periodTableHtml(periods=[]){
  const rows=periods.length?periods.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(historyMonth(p.from))} → ${esc(historyMonth(p.to))}</td><td>${esc(HISTORY_REGIME_LABELS[p.regime]||p.regime||'—')}</td><td>${esc(historyPeriodValue(p))}</td><td>${esc(historyAllowance(p))}</td><td>${esc(p.note||'—')}</td></tr>`).join(''):'<tr><td colspan="6">Bản lưu này không có chi tiết các giai đoạn đóng.</td></tr>';
  return `<div class="history-periods-wrap"><h4>Quá trình đóng đã lưu</h4><div class="table-wrap"><table class="history-detail-table"><thead><tr><th>#</th><th>Giai đoạn</th><th>Chế độ</th><th>Lương/thu nhập</th><th>Phụ cấp tính đóng</th><th>Ghi chú</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function renderHistoryDetail(record){
  currentHistoryId=record.id;
  const input=record.input_json||{};const saved=record.result_json||{};const type=historyBenefitType(record);
  const title=$('historyDetailTitle'),meta=$('historyDetailMeta'),host=$('historyDetailContent'),panel=$('historyDetailPanel');
  if(title)title.textContent=record.title||HISTORY_BENEFIT_LABELS[type]||'Kết quả đã lưu';
  if(meta)meta.textContent=`Lưu lúc ${new Date(record.created_at).toLocaleString('vi-VN')} · ${record.mode==='file'?'Nhập bằng file/ảnh tự động':'Nhập thủ công'} · ${HISTORY_BENEFIT_LABELS[type]||type} · Mã lưu ${String(record.id||'').slice(0,8).toUpperCase()}`;

  let html='';
  if(type==='one_time'){
    const periods=Array.isArray(input.periods)?input.periods:[];
    html=`<div class="history-result-grid">
      <article class="metric primary"><span>Mức hưởng ước tính</span><strong>${esc(historyMoney(saved.estimatedAmount))}</strong></article>
      <article class="metric"><span>Mức bình quân</span><strong>${esc(historyMoney(saved.averageBase))}</strong></article>
      <article class="metric"><span>Tổng thời gian đóng</span><strong>${esc(historyDuration(saved.totalMonths))}</strong></article>
      <article class="metric"><span>Phần trước 2014</span><strong>${esc(String(saved.pre2014Years??0))} năm quy đổi</strong></article>
      <article class="metric"><span>Phần từ 2014</span><strong>${esc(String(saved.post2014Years??0))} năm quy đổi</strong></article>
      <article class="metric"><span>Tháng giải quyết</span><strong>${esc(historyMonth(saved.settlementMonth))}</strong></article>
    </div><div class="history-info-grid"><div><span>Lý do/nhóm điều kiện đã chọn</span><strong>${esc(HISTORY_ONE_TIME_REASON_LABELS[saved.eligibilityReason||input.eligibilityReason]||saved.eligibilityReason||input.eligibilityReason||'—')}</strong></div><div><span>Số giai đoạn dữ liệu</span><strong>${periods.length}</strong></div><div><span>Dưới 01 năm</span><strong>${saved.underOneYear?'Có':'Không'}</strong></div><div><span>Mức tối đa nếu dưới 01 năm</span><strong>${esc(historyMoney(saved.maximumAmount))}</strong></div></div>${periodTableHtml(periods)}${historyWarnings(saved)}`;
  }else if(type==='unemployment'){
    const detail=input.input||{};
    html=`<div class="history-result-grid"><article class="metric primary"><span>Mức hưởng/tháng</span><strong>${esc(historyMoney(saved.monthlyBenefit))}</strong></article><article class="metric"><span>Số tháng hưởng</span><strong>${esc(String(saved.durationMonths||0))} tháng</strong></article><article class="metric"><span>Tổng ước tính</span><strong>${esc(historyMoney(saved.estimatedTotal))}</strong></article><article class="metric"><span>Bình quân 06 tháng</span><strong>${esc(historyMoney(saved.averageSix))}</strong></article><article class="metric"><span>Trần/tháng</span><strong>${esc(historyMoney(saved.ceiling))}</strong></article><article class="metric"><span>Thời gian đóng BHTN</span><strong>${esc(String(saved.eligibleContributionMonths||0))} tháng</strong></article></div><div class="history-info-grid"><div><span>Tháng cuối đóng BHTN</span><strong>${esc(historyMonth(saved.lastContributionMonth))}</strong></div><div><span>Vùng lương tối thiểu</span><strong>Vùng ${esc(saved.region||'—')}</strong></div><div><span>Lương tối thiểu vùng</span><strong>${esc(historyMoney(saved.minimumWage))}</strong></div><div><span>Đủ tối thiểu về thời gian đóng</span><strong>${saved.eligibleByMonths?'Có':'Chưa'}</strong></div><div><span>06 mức lương đã nhập</span><strong>${esc(historySalaryList(detail.lastSixSalaries))}</strong></div></div>${historyWarnings(saved)}`;
  }else if(type==='maternity'){
    const detail=input.input||{};
    html=`<div class="history-result-grid"><article class="metric primary"><span>Tổng mức hưởng ước tính</span><strong>${esc(historyMoney(saved.estimatedTotal))}</strong></article><article class="metric"><span>Mức trợ cấp tháng</span><strong>${esc(historyMoney(saved.monthlyBenefit))}</strong></article><article class="metric"><span>Thời gian tính hưởng</span><strong>${esc(saved.durationLabel||'—')}</strong></article><article class="metric"><span>Trợ cấp một lần</span><strong>${esc(historyMoney(saved.lumpSum))}</strong></article><article class="metric"><span>Mức hưởng/ngày</span><strong>${esc(historyMoney(saved.dailyBenefit))}</strong></article><article class="metric"><span>Điều kiện theo dữ liệu</span><strong>${saved.eligible===false?'Chưa đạt':'Đạt/không áp dụng'}</strong></article></div><div class="history-info-grid"><div><span>Loại tham gia</span><strong>${saved.scheme==='voluntary'?'BHXH tự nguyện':'BHXH bắt buộc'}</strong></div><div><span>Trường hợp</span><strong>${esc(HISTORY_MATERNITY_CASE_LABELS[saved.caseType]||saved.caseType||'—')}</strong></div><div><span>Tháng sự kiện</span><strong>${esc(historyMonth(saved.eventMonth))}</strong></div><div><span>Số con</span><strong>${esc(String(saved.children||1))}</strong></div><div><span>Mức tham chiếu</span><strong>${esc(historyMoney(saved.referenceLevel))}</strong></div><div><span>Tháng đóng trong 12 tháng</span><strong>${esc(String(saved.months12??'—'))}</strong></div><div><span>Tháng đóng trong 24 tháng</span><strong>${esc(String(saved.months24??'—'))}</strong></div><div><span>Mức lương đã nhập</span><strong>${esc(historySalaryList(detail.salaryMonths))}</strong></div></div>${saved.eligibilityRule?`<div class="alert info"><strong>Điều kiện đã áp dụng:</strong> ${esc(saved.eligibilityRule)}</div>`:''}${historyWarnings(saved)}`;
  }else{
    const person=input.person||{};const periods=Array.isArray(input.periods)?input.periods:[];const avg=saved.avg||{};const result=saved.result||{};const calcInput=saved.input||{};
    const first=periods.map(p=>p.from).filter(Boolean).sort()[0]||avg.firstCompulsoryYm||'';const last=periods.map(p=>p.to).filter(Boolean).sort().at(-1)||person.retirementMonth||'';
    html=`<div class="history-result-grid"><article class="metric primary"><span>Lương hưu ước tính/tháng</span><strong>${esc(historyMoney(result.monthlyPension))}</strong></article><article class="metric"><span>Mức bình quân</span><strong>${esc(historyMoney(avg.averageBase??calcInput.averageBase))}</strong></article><article class="metric"><span>Tỷ lệ hưởng</span><strong>${esc(historyPercent(result.finalRate))}</strong></article><article class="metric"><span>Tổng thời gian đóng</span><strong>${esc(historyDuration(avg.totalMonths??result.totalMonths))}</strong></article><article class="metric"><span>Tháng bắt đầu hưởng</span><strong>${esc(historyMonth(result.pensionStartMonth))}</strong></article><article class="metric"><span>Điều kiện hưởng</span><strong>${result.eligible===true?'Đủ theo dữ liệu đã nhập':result.eligible===false?'Chưa đủ điều kiện':'—'}</strong></article></div><div class="history-info-grid"><div><span>Giới tính</span><strong>${person.sex==='male'?'Nam':person.sex==='female'?'Nữ':'—'}</strong></div><div><span>Ngày sinh</span><strong>${esc(historyDate(person.birthDate))}</strong></div><div><span>Trường hợp nghỉ hưu</span><strong>${esc(HISTORY_CASE_LABELS[person.retirementCase]||person.retirementCase||'—')}</strong></div><div><span>Tháng nghỉ hưu dùng để tính</span><strong>${esc(historyMonth(person.retirementMonth))}</strong></div><div><span>Khoảng dữ liệu đã lưu</span><strong>${esc(historyMonth(first))} → ${esc(historyMonth(last))}</strong></div><div><span>Số giai đoạn đã lưu</span><strong>${periods.length}</strong></div><div><span>Tự bổ sung đến khi nghỉ hưu</span><strong>${input.autoExtend?'Có':'Không'}</strong></div><div><span>Thời gian tự bổ sung</span><strong>${esc(historyDuration(avg.projectedMonths||0))}</strong></div></div>${periodTableHtml(periods)}${Array.isArray(result.errors)&&result.errors.length?`<div class="alert error"><strong>Điểm cần lưu ý:</strong><ul>${result.errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}`;
  }
  if(host)host.innerHTML=html+`<p class="history-disclaimer">Đây là bản dữ liệu/kết quả tại thời điểm bạn bấm lưu. Kết quả chính thức phụ thuộc hồ sơ được cơ quan có thẩm quyền ghi nhận và quy định có hiệu lực khi giải quyết chế độ.</p>`;
  show(panel);panel?.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function historyWarnings(saved){const warnings=[...(Array.isArray(saved.warnings)?saved.warnings:[]),...(Array.isArray(saved.notes)?saved.notes:[])];return warnings.length?`<div class="alert info"><strong>Lưu ý:</strong><ul>${warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'';}
async function openHistoryDetail(id){
  if(!session||!id)return;const host=$('historyDetailContent');show($('historyDetailPanel'));if(host)host.innerHTML='<p>Đang tải chi tiết lịch sử…</p>';
  try{const data=await jsonResponse(await authorizedFetch(`/api/history/${encodeURIComponent(id)}`));renderHistoryDetail(data.history);}
  catch(e){if(host)host.innerHTML=`<div class="alert error">${esc(e.message||'Không tải được bản lịch sử.')}</div>`;}
}
async function deleteCurrentHistory(){
  if(!session||!currentHistoryId)return;
  if(!window.confirm('Xóa bản lịch sử này? Thao tác này không hoàn lại lượt lưu lịch sử.'))return;
  try{await jsonResponse(await authorizedFetch(`/api/history/${encodeURIComponent(currentHistoryId)}`,{method:'DELETE'}));closeHistoryDetail();await loadHistory();}
  catch(e){const host=$('historyDetailContent');if(host)host.insertAdjacentHTML('afterbegin',`<div class="alert error">${esc(e.message||'Không xóa được bản lịch sử.')}</div>`);}
}
async function loadHistory(){
  if(!session)return;const host=$('historyList');if(!host)return;
  host.innerHTML='<p>Đang tải lịch sử…</p>';
  try{
    const data=await jsonResponse(await authorizedFetch('/api/history?limit=30'));
    host.innerHTML=(data.history||[]).map(h=>{const sum=historySummary(h);return `<div class="account-list-row history-list-row"><span><strong>${esc(h.title||HISTORY_BENEFIT_LABELS[sum.type]||'Kết quả đã lưu')}</strong><small>${new Date(h.created_at).toLocaleString('vi-VN')} · ${h.mode==='file'?'File/ảnh tự động':'Thủ công'} · ${esc(HISTORY_BENEFIT_LABELS[sum.type]||sum.type)}</small><small>${esc(sum.line)}</small></span><button class="button secondary small history-open" data-history="${esc(h.id)}" type="button">Tra cứu</button></div>`;}).join('')||'<p>Chưa lưu kết quả nào.</p>';
    host.querySelectorAll('.history-open').forEach(btn=>btn.addEventListener('click',()=>openHistoryDetail(btn.dataset.history)));
  }catch(e){host.innerHTML=`<div class="alert error">${esc(e.code==='DATABASE_SETUP_REQUIRED'?'Chức năng lịch sử chưa được quản trị viên cài đặt đầy đủ.':e.message)}</div>`;}
}

async function saveHistory(payload){
  if(config?.authEnabled&&!session){openAuth();throw new Error('Vui lòng đăng nhập để lưu lịch sử.');}
  if(!config?.authEnabled)return {ok:true,demo:true};
  const data=await jsonResponse(await authorizedFetch('/api/history',{method:'POST',body:JSON.stringify(payload)}));
  me={...(me||{}),wallet:data.wallet||me?.wallet};renderAccount();renderWalletDetail();return data;
}

async function handlePaymentReturn(){
  const params=new URLSearchParams(location.search);
  if(!session)return;
  if(params.get('payment')==='success'||String(params.get('status')||'').toUpperCase()==='PAID'){
    await refreshMe();await openAccount();
    history.replaceState({},'',location.pathname);
  }else if(params.get('payment')==='cancel'||String(params.get('status')||'').toUpperCase()==='CANCELLED'){
    await openAccount();history.replaceState({},'',location.pathname);
  }
}

async function init(){
  config=await fetch('/api/config').then(r=>r.json()).catch(()=>({authEnabled:false}));
  applyGoogleAuthAvailability();
  if(config.authEnabled && window.supabase?.createClient){
    client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,detectSessionInUrl:true}});
    await refreshSession();
    client.auth.onAuthStateChange(async(_event,newSession)=>{session=newSession;await refreshMe();});
    await refreshMe();
  }else renderAccount();
  $('loginBtn')?.addEventListener('click',openAuth);$('accountBtn')?.addEventListener('click',openAccount);$('logoutBtn')?.addEventListener('click',signOut);
  $('authClose')?.addEventListener('click',closeAuth);$('accountClose')?.addEventListener('click',()=>{closeHistoryDetail();closeAccount();});$('plansClose')?.addEventListener('click',()=>hide($('plansModal')));$('paymentClose')?.addEventListener('click',closePayment);$('paymentCloseBottom')?.addEventListener('click',closePayment);$('historyDetailClose')?.addEventListener('click',closeHistoryDetail);$('historyDeleteBtn')?.addEventListener('click',deleteCurrentHistory);
  $('copyPaymentAccount')?.addEventListener('click',async()=>{if(await copyText($('paymentAccount')?.textContent||''))setMessage('paymentMessage','success','Đã sao chép số tài khoản.');});
  $('copyPaymentAmount')?.addEventListener('click',async()=>{if(await copyText($('paymentAmount')?.dataset.copy||''))setMessage('paymentMessage','success','Đã sao chép số tiền.');});
  $('copyPaymentCode')?.addEventListener('click',async()=>{if(await copyText($('paymentCode')?.textContent||''))setMessage('paymentMessage','success','Đã sao chép nội dung chuyển khoản.');});
  $('emailLoginBtn')?.addEventListener('click',signInEmail);$('emailSignupBtn')?.addEventListener('click',signUpEmail);$('googleLoginBtn')?.addEventListener('click',signInGoogle);
  $('buyCreditsBtn')?.addEventListener('click',openPlans);
  await handlePaymentReturn();
}

window.PensionAccount={
  ready:init(),
  get config(){return config;},get session(){return session;},get me(){return me;},
  isAuthenticated(){return Boolean(session);},requireLogin(){if(config?.authEnabled&&!session){openAuth();return false;}return true;},
  authorizedFetch,refreshMe,openPlans,saveHistory,openAuth,openAccount
};
