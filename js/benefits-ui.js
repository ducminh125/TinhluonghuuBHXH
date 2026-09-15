import { calculateOneTimeSocialInsurance, calculateUnemploymentBenefit, calculateMaternityBenefit, BENEFIT_LABELS } from './benefits.js';

const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0});
const number = new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2});
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const benefitPayloads = new Map();

function parseMonth(value){
  const raw=String(value||'').trim();
  if(/^\d{4}-(0[1-9]|1[0-2])$/.test(raw))return raw;
  const m=raw.match(/^(\d{1,2})[\/.-](\d{4})$/);if(!m)return '';
  const month=Number(m[1]);if(month<1||month>12)return '';
  return `${m[2]}-${String(month).padStart(2,'0')}`;
}
function showMonth(ym){return /^\d{4}-\d{2}$/.test(String(ym||''))?`${ym.slice(5,7)}/${ym.slice(0,4)}`:'—';}
function currentMonthText(){const d=new Date();return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;}
function duration(months){const n=Math.max(0,Number(months)||0);const y=Math.floor(n/12),m=n%12;return `${y} năm${m?` ${m} tháng`:''}`;}
function metric(label,value,primary=false){return `<article class="metric${primary?' primary':''}"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;}
function alertList(title,items=[],type='warning'){if(!items?.length)return '';return `<div class="alert ${type}"><strong>${esc(title)}</strong><ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;}

function switchTab(name){
  document.querySelectorAll('[data-benefit-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.benefitTab===name));
  document.querySelectorAll('[data-benefit-panel]').forEach(panel=>{panel.hidden=panel.dataset.benefitPanel!==name;});
  if(name==='one_time')refreshOneTimePeriodSummary();
  window.scrollTo({top:document.querySelector('.benefit-tabs')?.offsetTop||0,behavior:'smooth'});
}

function calculatorState(){return window.PensionCalculatorState||{getPeriods:()=>[],getEntryMode:()=> 'manual',getImportJobId:()=>null};}
function refreshOneTimePeriodSummary(){
  const periods=calculatorState().getPeriods?.()||[];const el=$('oneTimePeriodSummary');
  if(el)el.textContent=periods.length?`Đang có ${periods.length} giai đoạn quá trình đóng để tính.`:'Chưa có quá trình đóng. Mở tab Lương hưu để thêm dữ liệu.';
}

async function calculateCommercial(body){
  await window.PensionAccount?.ready;
  if(window.PensionAccount?.config?.authEnabled){
    if(!window.PensionAccount.requireLogin())throw Object.assign(new Error('Vui lòng đăng nhập để sử dụng lượt tính.'),{loginRequired:true});
    const r=await window.PensionAccount.authorizedFetch('/api/benefits/calculate',{method:'POST',body:JSON.stringify(body)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(data.error||`HTTP ${r.status}`),{status:r.status,data});
    await window.PensionAccount.refreshMe();
    return data;
  }
  let result;
  if(body.benefitType==='one_time')result=calculateOneTimeSocialInsurance(body);
  else if(body.benefitType==='unemployment')result=calculateUnemploymentBenefit(body.input);
  else result=calculateMaternityBenefit(body.input);
  if(!result?.ok)throw new Error((result?.errors||['Dữ liệu chưa đủ để tính.']).join(' '));
  return {ok:true,benefitType:body.benefitType,mode:body.mode||'manual',result};
}

async function saveBenefit(type,button,status){
  const payload=benefitPayloads.get(type);if(!payload)return;
  button.disabled=true;if(status)status.textContent='Đang lưu…';
  try{
    await window.PensionAccount?.ready;
    const label=BENEFIT_LABELS[type]||'Kết quả chế độ';
    await window.PensionAccount.saveHistory({title:payload.title||label,mode:payload.mode||'manual',input:payload.input,result:{benefitType:type,...payload.result}});
    if(status)status.textContent='Đã lưu.';
  }catch(e){if(status)status.textContent=e.message||'Không lưu được.';if(/hết lượt|mua thêm/i.test(e.message||''))window.PensionAccount?.openPlans?.();}
  finally{button.disabled=false;}
}
function saveControls(type){return `<div class="result-actions"><button class="button secondary benefit-save" data-save-benefit="${esc(type)}" type="button">Lưu kết quả vào lịch sử</button><span class="benefit-save-status"></span></div>`;}
function wireSave(host,type){const b=host.querySelector(`[data-save-benefit="${type}"]`),s=host.querySelector('.benefit-save-status');b?.addEventListener('click',()=>saveBenefit(type,b,s));}

function renderOneTime(data,request){
  const r=data.result,host=$('oneTimeResult');
  benefitPayloads.set('one_time',{mode:data.mode,input:{benefitType:'one_time',...request},result:r,title:`BHXH một lần · ${showMonth(r.settlementMonth)}`});
  const amount=r.estimatedAmount==null?'Cần bổ sung số tiền đã đóng':money.format(r.estimatedAmount);
  host.innerHTML=`<div class="result-heading"><div><span class="step">KẾT QUẢ</span><h2>Ước tính BHXH một lần</h2></div></div><div class="result-grid">${metric('Mức hưởng ước tính',amount,true)}${metric('Mức bình quân',money.format(r.averageBase))}${metric('Tổng thời gian đóng',duration(r.totalMonths))}${metric('Trước 2014',`${number.format(r.pre2014Years||0)} năm quy đổi`)}${metric('Từ 2014',`${number.format(r.post2014Years||0)} năm quy đổi`)}${r.underOneYear?metric('Mức tối đa',money.format(r.maximumAmount)):''}</div><div class="explain"><h3>Cách tính</h3>${r.underOneYear?`<p>Thời gian đóng chưa đủ 01 năm. Mức hưởng bằng số tiền đã đóng thực tế nhưng không quá <strong>${money.format(r.maximumAmount)}</strong>.</p>`:`<p>Phần trước 2014: <strong>${number.format(r.pre2014Years)} năm × 1,5 tháng</strong>. Phần từ 2014: <strong>${number.format(r.post2014Years)} năm × 2 tháng</strong>.</p><p>Mức bình quân dùng tính: <strong>${money.format(r.averageBase)}</strong>.</p>`}</div>${alertList('Lưu ý',r.warnings)}${alertList('Phạm vi ước tính',r.notes,'info')}${saveControls('one_time')}`;
  wireSave(host,'one_time');host.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderUnemployment(data,request){
  const r=data.result,host=$('unemploymentResult');
  benefitPayloads.set('unemployment',{mode:'manual',input:{benefitType:'unemployment',...request},result:r,title:`Trợ cấp thất nghiệp · ${showMonth(r.lastContributionMonth)}`});
  host.innerHTML=`<div class="result-heading"><div><span class="step">KẾT QUẢ</span><h2>Ước tính trợ cấp thất nghiệp</h2></div></div><div class="result-grid">${metric('Mức hưởng/tháng',money.format(r.monthlyBenefit),true)}${metric('Số tháng hưởng',`${r.durationMonths} tháng`)}${metric('Tổng ước tính',money.format(r.estimatedTotal))}${metric('Bình quân 06 tháng',money.format(r.averageSix))}${metric('Trần/tháng',money.format(r.ceiling))}${metric('Thời gian BHTN',`${r.eligibleContributionMonths} tháng`)}</div>${r.eligibleByMonths?'':`<div class="alert error"><strong>Chưa đủ điều kiện tối thiểu về thời gian đóng.</strong></div>`}${alertList('Lưu ý',r.warnings)}${alertList('Điều kiện cần đối chiếu',r.notes,'info')}${saveControls('unemployment')}`;
  wireSave(host,'unemployment');host.scrollIntoView({behavior:'smooth',block:'start'});
}

const MATERNITY_CASE_LABELS={female_birth:'Lao động nữ sinh con',male_birth:'Lao động nam có vợ sinh con',prenatal:'Khám thai',pregnancy_loss:'Sảy thai/phá thai/thai chết/thai ngoài tử cung',contraception_iud:'Đặt dụng cụ tránh thai',contraception_sterilization:'Triệt sản'};
function renderMaternity(data,request){
  const r=data.result,host=$('maternityResult');
  benefitPayloads.set('maternity',{mode:'manual',input:{benefitType:'maternity',...request},result:r,title:`Thai sản · ${MATERNITY_CASE_LABELS[r.caseType]||r.caseType} · ${showMonth(r.eventMonth)}`});
  host.innerHTML=`<div class="result-heading"><div><span class="step">KẾT QUẢ</span><h2>${esc(MATERNITY_CASE_LABELS[r.caseType]||'Chế độ thai sản')}</h2></div></div><div class="result-grid">${metric('Tổng mức hưởng ước tính',money.format(r.estimatedTotal||0),true)}${r.monthlyBenefit!=null?metric('Mức trợ cấp tháng',money.format(r.monthlyBenefit)):''}${r.durationLabel?metric('Thời gian tính hưởng',r.durationLabel):''}${r.lumpSum!=null?metric('Trợ cấp một lần',money.format(r.lumpSum||0)):''}${r.dailyBenefit!=null?metric('Mức hưởng/ngày',money.format(r.dailyBenefit)):''}${r.referenceLevel?metric('Mức tham chiếu',money.format(r.referenceLevel)):''}</div>${r.eligible===false?'<div class="alert error"><strong>Dữ liệu đã nhập chưa đạt điều kiện của trường hợp được chọn.</strong></div>':''}${r.eligibilityRule?`<div class="explain"><h3>Điều kiện đang áp dụng</h3><p>${esc(r.eligibilityRule)}</p></div>`:''}${alertList('Lưu ý',r.warnings)}${alertList('Cách tính/Phạm vi',r.notes,'info')}${saveControls('maternity')}`;
  wireSave(host,'maternity');host.scrollIntoView({behavior:'smooth',block:'start'});
}

function syncMaternityForm(){
  const scheme=$('maternityScheme')?.value||'compulsory';const caseSel=$('maternityCase');
  if(!caseSel)return;
  [...caseSel.options].forEach(o=>{o.disabled=scheme==='voluntary'&&!['female_birth','male_birth'].includes(o.value);});
  if(caseSel.selectedOptions[0]?.disabled)caseSel.value='female_birth';
  $('maternitySalaryBlock').hidden=scheme==='voluntary';
  $('maternitySpecialOptions').classList.toggle('is-muted',scheme==='voluntary');
}

function init(){
  document.querySelectorAll('[data-benefit-tab]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.benefitTab)));
  document.querySelectorAll('[data-switch-benefit]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.switchBenefit)));
  if($('oneTimeSettlementMonth')&&!$('oneTimeSettlementMonth').value)$('oneTimeSettlementMonth').value=currentMonthText();
  if($('unemploymentLastMonth')&&!$('unemploymentLastMonth').value)$('unemploymentLastMonth').value=currentMonthText();
  if($('maternityEventMonth')&&!$('maternityEventMonth').value)$('maternityEventMonth').value=currentMonthText();

  $('oneTimeForm')?.addEventListener('submit',async e=>{e.preventDefault();const state=calculatorState();const periods=state.getPeriods?.()||[];const host=$('oneTimeResult');if(!periods.length){host.innerHTML='<div class="alert error">Chưa có quá trình đóng BHXH. Hãy nhập hoặc đọc hồ sơ ở tab Lương hưu trước.</div>';return;}const request={benefitType:'one_time',mode:state.getEntryMode?.()||'manual',importJobId:state.getImportJobId?.()||null,periods,settlementMonth:parseMonth($('oneTimeSettlementMonth').value),eligibilityReason:$('oneTimeReason').value,actualPaidVnd:Number($('oneTimeActualPaid').value||0)};const b=e.submitter||e.currentTarget.querySelector('button[type="submit"]');if(b){b.disabled=true;b.textContent='Đang tính…';}try{renderOneTime(await calculateCommercial(request),request);}catch(err){host.innerHTML=`<div class="alert error"><strong>Chưa thể tính:</strong> ${esc(err.message)}</div>`;if(err.status===402)window.PensionAccount?.openPlans?.();}finally{if(b){b.disabled=false;b.textContent='Tính BHXH một lần';}}});

  $('unemploymentForm')?.addEventListener('submit',async e=>{e.preventDefault();const host=$('unemploymentResult');const input={eligibleContributionMonths:Number($('unemploymentMonths').value||0),lastContributionMonth:parseMonth($('unemploymentLastMonth').value),region:$('unemploymentRegion').value,lastSixSalaries:[...document.querySelectorAll('.unemployment-salary')].map(x=>Number(x.value||0))};const request={benefitType:'unemployment',mode:'manual',input};const b=e.submitter||e.currentTarget.querySelector('button[type="submit"]');if(b){b.disabled=true;b.textContent='Đang tính…';}try{renderUnemployment(await calculateCommercial(request),request);}catch(err){host.innerHTML=`<div class="alert error"><strong>Chưa thể tính:</strong> ${esc(err.message)}</div>`;if(err.status===402)window.PensionAccount?.openPlans?.();}finally{if(b){b.disabled=false;b.textContent='Tính trợ cấp thất nghiệp';}}});

  $('maternityScheme')?.addEventListener('change',syncMaternityForm);$('maternityCase')?.addEventListener('change',syncMaternityForm);syncMaternityForm();
  $('maternityForm')?.addEventListener('submit',async e=>{e.preventDefault();const host=$('maternityResult');const input={scheme:$('maternityScheme').value,caseType:$('maternityCase').value,eventMonth:parseMonth($('maternityEventMonth').value),children:Number($('maternityChildren').value||1),months12:Number($('maternityMonths12').value||0),months24:Number($('maternityMonths24').value||0),totalPriorMonths:Number($('maternityTotalPrior').value||0),pregnancyLeave:$('maternityPregnancyLeave').checked,infertilityTreatment:$('maternityInfertility').checked,surgeryOrUnder32:$('maternitySurgeryUnder32').checked,fatherLumpEligible:$('maternityFatherLump').checked,gestationWeeks:Number($('maternityWeeks').value||0),requestedDays:Number($('maternityDays').value||0),salaryMonths:[...document.querySelectorAll('.maternity-salary')].map(x=>Number(x.value||0)).filter(Boolean)};const request={benefitType:'maternity',mode:'manual',input};const b=e.submitter||e.currentTarget.querySelector('button[type="submit"]');if(b){b.disabled=true;b.textContent='Đang tính…';}try{renderMaternity(await calculateCommercial(request),request);}catch(err){host.innerHTML=`<div class="alert error"><strong>Chưa thể tính:</strong> ${esc(err.message)}</div>`;if(err.status===402)window.PensionAccount?.openPlans?.();}finally{if(b){b.disabled=false;b.textContent='Tính chế độ thai sản';}}});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
