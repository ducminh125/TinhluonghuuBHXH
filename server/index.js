import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseUploadedFile } from './parsers.js';
import { extractBhxhWithAI } from './shopaikey.js';
import { dedupeImportedPeriods, buildProjectedPeriods, calculateAverageBase } from '../js/contributions.js';
import { calculatePension } from '../js/pension.js';
import {
  supabaseAdmin,
  supabaseConfigured,
  publicSupabaseConfig,
  requireUser,
  requireAdmin,
  getWallet,
  consumeCredit,
  refundCredit
} from './supabase.js';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const rootDir=path.resolve(__dirname,'..');
const app=express();
const port=Number(process.env.PORT||3000);
const MAX_TOTAL_UPLOAD=60*1024*1024;

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:20}});

app.disable('x-powered-by');
app.use(express.json({limit:'3mb'}));
app.use('/js',express.static(path.join(rootDir,'js'),{dotfiles:'ignore'}));
app.get('/styles.css',(_req,res)=>res.sendFile(path.join(rootDir,'styles.css')));
app.get(['/','/index.html'],(_req,res)=>{res.setHeader('Cache-Control','no-store');res.sendFile(path.join(rootDir,'index.html'));});
app.get(['/admin','/admin.html'],(_req,res)=>{res.setHeader('Cache-Control','no-store');res.sendFile(path.join(rootDir,'admin.html'));});
app.get(['/privacy','/privacy.html'],(_req,res)=>res.sendFile(path.join(rootDir,'privacy.html')));
app.get(['/terms','/terms.html'],(_req,res)=>res.sendFile(path.join(rootDir,'terms.html')));

function bankConfig(){return {
  bankName:process.env.PAYMENT_BANK_NAME||'',
  accountNumber:process.env.PAYMENT_BANK_ACCOUNT||'',
  accountName:process.env.PAYMENT_ACCOUNT_NAME||''
};}
function safeUser(user){return {id:user.id,email:user.email||null,phone:user.phone||null,created_at:user.created_at};}
function stableHash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function periodHash(periods=[]){
  const selected=periods.map(p=>({
    from:p.from,to:p.to,regime:p.regime,valueType:p.valueType,
    coefficient:p.coefficient??null,amountVnd:p.amountVnd??null,
    positionAllowanceCoeff:Number(p.positionAllowanceCoeff||0),reservedDifferenceCoeff:Number(p.reservedDifferenceCoeff||0),
    seniorityBeyondPercent:Number(p.seniorityBeyondPercent||0),professionalSeniorityPercent:Number(p.professionalSeniorityPercent||0),
    allowanceVnd:Number(p.allowanceVnd||0)
  })).sort((a,b)=>`${a.from}|${a.to}|${a.regime}`.localeCompare(`${b.from}|${b.to}|${b.regime}`));
  return stableHash(selected);
}
function mergeImportPayloads(payloads,sourceCount){
  const periods=[]; const unresolved=[]; const info=[]; const confirm=[];
  let person={birthDate:null,sex:null};
  let duplicatesRemoved=0,conflicts=0,totalLatency=0;
  const providers=new Set(),models=new Set(),parsers=new Set();
  for(const p of payloads){
    if(!p)continue;
    if(p.person?.birthDate){
      if(person.birthDate&&person.birthDate!==p.person.birthDate)confirm.push(`Các tệp đọc được ngày sinh khác nhau (${person.birthDate} và ${p.person.birthDate}).`);
      else person.birthDate=p.person.birthDate;
    }
    if(p.person?.sex){
      if(person.sex&&person.sex!==p.person.sex)confirm.push('Các tệp đọc được giới tính khác nhau.');
      else person.sex=p.person.sex;
    }
    periods.push(...(p.periods||[]));
    unresolved.push(...(p.reviewPeriods||[]).filter(r=>!r.validForImport));
    info.push(...(p.informationalWarnings||[])); confirm.push(...(p.confirmationWarnings||[]));
    duplicatesRemoved+=Number(p.meta?.duplicatesRemoved||0); conflicts+=Number(p.meta?.conflicts||0); totalLatency+=Number(p.meta?.latencyMs||0);
    if(p.meta?.provider)providers.add(p.meta.provider); if(p.meta?.model)models.add(p.meta.model); if(p.meta?.parserMode)parsers.add(p.meta.parserMode);
  }
  const deduped=dedupeImportedPeriods(periods); duplicatesRemoved+=deduped.duplicatesRemoved; conflicts+=deduped.conflicts; confirm.push(...deduped.warnings);
  const reviewPeriods=[...deduped.periods.map((row,index)=>({index,...row,recognizedFields:[],missingFields:[],validForImport:true})),...unresolved];
  const uniqueInfo=[...new Set(info)]; const uniqueConfirm=[...new Set(confirm)];
  return {
    person,reviewPeriods,periods:deduped.periods,
    warnings:[...new Set([...uniqueInfo,...uniqueConfirm])],informationalWarnings:uniqueInfo,confirmationWarnings:uniqueConfirm,
    meta:{
      provider:[...providers].join('+')||'local',model:[...models].join('+')||null,source:payloads.some(p=>p.meta?.source==='AI')?'hybrid':'structured_parser',
      parserMode:[...parsers].join('+')||'mixed',sourceCount,recognizedRows:reviewPeriods.length,incompleteRows:unresolved.length,importableRows:deduped.periods.length,
      duplicatesRemoved,conflicts,needsConfirmation:unresolved.length>0||conflicts>0||uniqueConfirm.length>0,latencyMs:totalLatency
    }
  };
}


async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, runner));
  return results;
}

function buildAiTasks(aiItems) {
  const imageBatchSize = Math.max(1, Math.min(6, Number(process.env.AI_IMAGE_BATCH_SIZE || 4)));
  const tasks = [];
  const textOnly = [];
  const imagePool = [];
  const warnings = [];

  for (const item of aiItems) {
    warnings.push(...item.parsed.warnings.map(w => `${item.file.originalname}: ${w}`));
    if (item.parsed.images?.length) {
      for (const image of item.parsed.images) imagePool.push({
        ...image,
        label: `${item.file.originalname}${image.label && image.label !== item.file.originalname ? ` · ${image.label}` : ''}`
      });
      // A PDF reaches the vision path only when its text layer is sparse; do not pay for a second text-only AI call.
    } else if (item.parsed.text?.trim()) {
      textOnly.push(`===== ${item.file.originalname} =====\n${item.parsed.text}`);
    }
  }

  // Text-rich documents are cheap to send together and preserve table context.
  if (textOnly.length) tasks.push({
    text: textOnly.join('\n\n'), images: [], filename: 'Văn bản trích xuất từ hồ sơ', parserWarnings: warnings, sourceCount: aiItems.length
  });

  // Vision input is split into small batches. Dedupe after extraction handles page overlap.
  for (let i = 0; i < imagePool.length; i += imageBatchSize) {
    const batch = imagePool.slice(i, i + imageBatchSize);
    tasks.push({
      text: '', images: batch, filename: `Ảnh hồ sơ ${i + 1}–${i + batch.length}`, parserWarnings: warnings,
      sourceCount: batch.length
    });
  }
  return tasks;
}

function calculateRequest(body){
  const person=body?.person||{};
  const retirementMonth=String(person.retirementMonth||'');
  let periods=Array.isArray(body?.periods)?body.periods:[];
  let forecastWarnings=[];
  if(body?.autoExtend){
    const projection=buildProjectedPeriods(periods,retirementMonth,body?.forecastOptions||{});
    periods=[...periods,...projection.periods]; forecastWarnings=projection.warnings||[];
  }
  const avg=calculateAverageBase(periods,{retirementMonth});
  avg.warnings=[...new Set([...(forecastWarnings||[]),...(avg.warnings||[])])];
  if(!avg.ok){const e=new Error((avg.errors||['Chưa thể tính mức bình quân.']).join(' '));e.status=400;e.details={avg};throw e;}
  const input={
    sex:person.sex,birthDate:person.birthDate,retirementCase:person.retirementCase||'normal',retirementMonth,
    averageBase:avg.averageBase,totalMonths:avg.totalMonths,compulsoryMonths:avg.compulsoryMonths,firstCompulsoryYm:avg.firstCompulsoryYm,
    specialMonthsTotal:Number(person.specialMonthsTotal||0),impairmentPercent:Number(person.impairmentPercent||0),minimumFloorEligible:Boolean(person.minimumFloorEligible)
  };
  const result=calculatePension(input);
  return {avg,result,input};
}

app.get('/api/config',(_req,res)=>{
  const supa=publicSupabaseConfig();
  res.json({
    authEnabled:Boolean(supabaseConfigured&&supa.publishableKey),supabaseUrl:supa.url,supabasePublishableKey:supa.publishableKey,
    freeQuota:{direct:3,file:0,history:3},bank:bankConfig()
  });
});
app.get('/api/health',(_req,res)=>res.json({ok:true,authConfigured:supabaseConfigured,aiConfigured:Boolean(process.env.SHOPAIKEY_API_KEY),fastModel:process.env.SHOPAIKEY_FAST_MODEL||'gemini-3-flash-preview',fallbackModel:process.env.SHOPAIKEY_FALLBACK_MODEL||'gpt-5.6-luna'}));

app.get('/api/plans',async(_req,res)=>{
  if(!supabaseConfigured)return res.json({plans:[]});
  const {data,error}=await supabaseAdmin.from('plans').select('*').eq('active',true).order('sort_order').order('price_vnd');
  if(error)return res.status(500).json({error:error.message});
  res.json({plans:data||[]});
});

app.get('/api/me',requireUser,async(req,res)=>{
  const wallet=await getWallet(req.user.id);
  res.json({user:safeUser(req.user),profile:req.profile,wallet});
});

app.post('/api/orders',requireUser,async(req,res)=>{
  try{
    const planId=String(req.body?.planId||'');
    const {data:plan,error}=await supabaseAdmin.from('plans').select('*').eq('id',planId).eq('active',true).maybeSingle();
    if(error)throw error; if(!plan)return res.status(404).json({error:'Gói đăng ký không tồn tại hoặc đã ngừng bán.'});
    const code=`LH${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const row={user_id:req.user.id,plan_id:plan.id,plan_name:plan.name,amount_vnd:plan.price_vnd,direct_credits:plan.direct_credits,file_credits:plan.file_credits,history_credits:plan.history_credits,payment_code:code,payment_method:'bank_transfer'};
    const {data,error:insertError}=await supabaseAdmin.from('orders').insert(row).select('*').single(); if(insertError)throw insertError;
    res.json({order:data,bank:bankConfig()});
  }catch(e){res.status(400).json({error:e.message||'Không tạo được đơn hàng.'});}
});
app.get('/api/orders/mine',requireUser,async(req,res)=>{
  const {data,error}=await supabaseAdmin.from('orders').select('*').eq('user_id',req.user.id).order('created_at',{ascending:false}).limit(30);
  if(error)return res.status(500).json({error:error.message});res.json({orders:data||[]});
});

app.get('/api/history',requireUser,async(req,res)=>{
  const limit=Math.min(50,Math.max(1,Number(req.query.limit||20)));
  const {data,error}=await supabaseAdmin.from('calculation_history').select('id,title,mode,result_json,created_at').eq('user_id',req.user.id).order('created_at',{ascending:false}).limit(limit);
  if(error)return res.status(500).json({error:error.message});res.json({history:data||[]});
});
app.post('/api/history',requireUser,async(req,res)=>{
  try{
    const {data,error}=await supabaseAdmin.rpc('save_calculation_history',{p_user_id:req.user.id,p_title:String(req.body?.title||'Kết quả lương hưu').slice(0,120),p_mode:req.body?.mode==='file'?'file':'manual',p_input:req.body?.input||{},p_result:req.body?.result||{}});
    if(error){if(/NO_CREDIT/i.test(error.message||''))return res.status(402).json({error:'Bạn đã hết lượt lưu lịch sử. Vui lòng mua thêm gói.'});throw error;}
    res.json({ok:true,id:data,wallet:await getWallet(req.user.id)});
  }catch(e){res.status(400).json({error:e.message||'Không lưu được lịch sử.'});}
});
app.delete('/api/history/:id',requireUser,async(req,res)=>{
  const {error}=await supabaseAdmin.from('calculation_history').delete().eq('id',req.params.id).eq('user_id',req.user.id);
  if(error)return res.status(400).json({error:error.message});res.json({ok:true});
});

app.post('/api/calculate',requireUser,async(req,res)=>{
  try{
    const mode=req.body?.mode==='file'?'file':'manual';
    const calculation=calculateRequest(req.body);
    const inputHash=stableHash({mode,person:req.body?.person,periods:req.body?.periods,autoExtend:req.body?.autoExtend,forecastOptions:req.body?.forecastOptions});

    if(mode==='manual'){
      await consumeCredit(req.user.id,'direct','direct_calculation',{inputHash});
    }else{
      const jobId=String(req.body?.importJobId||'');
      if(!jobId)return res.status(400).json({error:'Phiên nhập hồ sơ không hợp lệ. Hãy đọc lại file hoặc dùng lượt nhập trực tiếp.'});
      const {data:job,error}=await supabaseAdmin.from('import_jobs').select('*').eq('id',jobId).eq('user_id',req.user.id).maybeSingle();
      if(error)throw error;if(!job||job.status!=='success')return res.status(400).json({error:'Không tìm thấy phiên nhập hồ sơ hợp lệ.'});
      if(job.used_for_calculation){
        if(job.calculation_input_hash===inputHash&&job.calculation_result)return res.json({...job.calculation_result,wallet:await getWallet(req.user.id),cached:true});
        return res.status(409).json({error:'Lượt tra cứu bằng hồ sơ này đã được sử dụng cho một phép tính khác. Hãy nhập lại hồ sơ hoặc dùng lượt tính trực tiếp.'});
      }
      const payload={...calculation,mode,importJobId:jobId};
      const {data:updated,error:updateError}=await supabaseAdmin.from('import_jobs').update({used_for_calculation:true,calculation_input_hash:inputHash,calculation_result:payload,updated_at:new Date().toISOString()}).eq('id',jobId).eq('user_id',req.user.id).eq('used_for_calculation',false).select('id').maybeSingle();
      if(updateError)throw updateError;if(!updated)return res.status(409).json({error:'Phiên hồ sơ vừa được sử dụng ở một yêu cầu khác. Vui lòng tải lại trang.'});
    }
    res.json({...calculation,mode,wallet:await getWallet(req.user.id)});
  }catch(e){res.status(e.code==='NO_CREDIT'?402:(e.status||400)).json({error:e.message||'Không thể tính lương hưu.',details:e.details});}
});

app.post('/api/import',requireUser,upload.fields([{name:'files',maxCount:20},{name:'file',maxCount:1}]),async(req,res)=>{
  const start=Date.now(); let creditConsumed=false; let jobId=null;
  try{
    const files=[...(req.files?.files||[]),...(req.files?.file||[])];
    if(!files.length)return res.status(400).json({error:'Chưa nhận được tệp tải lên.'});
    const totalSize=files.reduce((sum,f)=>sum+Number(f.size||f.buffer?.length||0),0);
    if(totalSize>MAX_TOTAL_UPLOAD)return res.status(400).json({error:'Tổng dung lượng các tệp vượt 60 MB. Hãy chia thành nhiều lần import.'});

    await consumeCredit(req.user.id,'file','file_import_started',{sourceCount:files.length}); creditConsumed=true;
    const {data:newJob,error:jobError}=await supabaseAdmin.from('import_jobs').insert({user_id:req.user.id,status:'processing',source_count:files.length}).select('id').single();
    if(jobError)throw jobError; jobId=newJob.id;

    const parsedFiles=await Promise.all(files.map(async file=>({file,parsed:await parseUploadedFile(file)})));
    const payloads=[];
    for(const item of parsedFiles)if(item.parsed.structured)payloads.push(item.parsed.structured);
    const aiItems=parsedFiles.filter(item=>!item.parsed.structured);
    if(aiItems.length){
      const tasks=buildAiTasks(aiItems);
      const concurrency=Math.max(1,Math.min(3,Number(process.env.AI_BATCH_CONCURRENCY||2)));
      const extractedBatches=await mapLimit(tasks,concurrency,task=>extractBhxhWithAI(task));
      payloads.push(...extractedBatches);
    }
    const extracted=mergeImportPayloads(payloads,files.length);
    extracted.meta.latencyMs=Date.now()-start;
    const pHash=periodHash(extracted.periods);
    const {error:updateError}=await supabaseAdmin.from('import_jobs').update({status:'success',provider:extracted.meta.provider,model:extracted.meta.model,parser_mode:extracted.meta.parserMode,latency_ms:extracted.meta.latencyMs,period_hash:pHash,meta:extracted.meta,updated_at:new Date().toISOString()}).eq('id',jobId);
    if(updateError)throw updateError;
    extracted.meta.importJobId=jobId;
    extracted.meta.wallet=await getWallet(req.user.id);
    res.json(extracted);
  }catch(error){
    console.error('[api/import]',error);
    if(jobId)await supabaseAdmin.from('import_jobs').update({status:'failed',latency_ms:Date.now()-start,meta:{error:error?.message||String(error)},updated_at:new Date().toISOString()}).eq('id',jobId).catch(()=>{});
    if(creditConsumed)await refundCredit(req.user.id,'file','file_import_refund',{reason:error?.message||'import_failed',jobId}).catch(()=>{});
    res.status(error.code==='NO_CREDIT'?402:400).json({error:error?.message||'Không thể xử lý tệp.'});
  }
});

// Admin API
app.get('/api/admin/metrics',requireAdmin,async(_req,res)=>{
  const [{count:userCount},{count:pendingOrders},{data:paidOrders},{data:imports}]=await Promise.all([
    supabaseAdmin.from('profiles').select('*',{count:'exact',head:true}),
    supabaseAdmin.from('orders').select('*',{count:'exact',head:true}).eq('status','pending'),
    supabaseAdmin.from('orders').select('amount_vnd').eq('status','paid'),
    supabaseAdmin.from('import_jobs').select('latency_ms,provider,model,parser_mode,status,created_at').order('created_at',{ascending:false}).limit(200)
  ]);
  const revenue=(paidOrders||[]).reduce((s,x)=>s+Number(x.amount_vnd||0),0);
  const successful=(imports||[]).filter(x=>x.status==='success'&&Number(x.latency_ms)>0);
  const avgLatency=successful.length?Math.round(successful.reduce((s,x)=>s+Number(x.latency_ms),0)/successful.length):0;
  res.json({userCount:userCount||0,pendingOrders:pendingOrders||0,revenueVnd:revenue,avgImportLatencyMs:avgLatency,recentImports:imports||[]});
});
app.get('/api/admin/users',requireAdmin,async(req,res)=>{
  const page=Math.max(1,Number(req.query.page||1));const perPage=Math.min(100,Math.max(10,Number(req.query.perPage||50)));
  const {data:authData,error:authError}=await supabaseAdmin.auth.admin.listUsers({page,perPage});if(authError)return res.status(500).json({error:authError.message});
  const ids=authData.users.map(u=>u.id);
  const [{data:profiles},{data:wallets}]=ids.length?await Promise.all([supabaseAdmin.from('profiles').select('*').in('user_id',ids),supabaseAdmin.from('wallets').select('*').in('user_id',ids)]):[{data:[]},{data:[]}];
  const pMap=new Map((profiles||[]).map(x=>[x.user_id,x]));const wMap=new Map((wallets||[]).map(x=>[x.user_id,x]));
  res.json({users:authData.users.map(u=>({...safeUser(u),profile:pMap.get(u.id)||null,wallet:wMap.get(u.id)||null})),page,perPage});
});
app.post('/api/admin/users/:id/credits',requireAdmin,async(req,res)=>{
  try{
    const direct=Math.max(0,Number(req.body?.direct||0)),file=Math.max(0,Number(req.body?.file||0)),history=Math.max(0,Number(req.body?.history||0));
    const {data,error}=await supabaseAdmin.rpc('grant_credits',{p_user_id:req.params.id,p_direct:direct,p_file:file,p_history:history,p_action:'admin_adjustment',p_metadata:{admin:req.user.id,note:String(req.body?.note||'')}});if(error)throw error;
    await supabaseAdmin.from('admin_audit_logs').insert({admin_user_id:req.user.id,action:'grant_credits',target_user_id:req.params.id,metadata:{direct,file,history,note:req.body?.note||''}});
    res.json({ok:true,wallet:Array.isArray(data)?data[0]:data});
  }catch(e){res.status(400).json({error:e.message});}
});
app.patch('/api/admin/users/:id/status',requireAdmin,async(req,res)=>{
  const status=req.body?.status==='suspended'?'suspended':'active';
  const {data,error}=await supabaseAdmin.from('profiles').update({status,updated_at:new Date().toISOString()}).eq('user_id',req.params.id).select('*').single();
  if(error)return res.status(400).json({error:error.message});
  await supabaseAdmin.from('admin_audit_logs').insert({admin_user_id:req.user.id,action:'change_status',target_user_id:req.params.id,metadata:{status}});
  res.json({profile:data});
});
app.get('/api/admin/plans',requireAdmin,async(_req,res)=>{
  const {data,error}=await supabaseAdmin.from('plans').select('*').order('sort_order').order('price_vnd');if(error)return res.status(500).json({error:error.message});res.json({plans:data||[]});
});
app.post('/api/admin/plans',requireAdmin,async(req,res)=>{
  const row={code:String(req.body?.code||'').trim(),name:String(req.body?.name||'').trim(),description:String(req.body?.description||'').trim(),price_vnd:Math.max(0,Number(req.body?.priceVnd||0)),direct_credits:Math.max(0,Number(req.body?.direct||0)),file_credits:Math.max(0,Number(req.body?.file||0)),history_credits:Math.max(0,Number(req.body?.history||0)),active:req.body?.active!==false,sort_order:Number(req.body?.sortOrder||100)};
  if(!row.code||!row.name)return res.status(400).json({error:'Cần mã gói và tên gói.'});
  const {data,error}=await supabaseAdmin.from('plans').insert(row).select('*').single();if(error)return res.status(400).json({error:error.message});res.json({plan:data});
});
app.patch('/api/admin/plans/:id',requireAdmin,async(req,res)=>{
  const patch={updated_at:new Date().toISOString()};
  const map={name:'name',description:'description',priceVnd:'price_vnd',direct:'direct_credits',file:'file_credits',history:'history_credits',active:'active',sortOrder:'sort_order'};
  for(const [k,col] of Object.entries(map))if(req.body?.[k]!==undefined)patch[col]=['price_vnd','direct_credits','file_credits','history_credits','sort_order'].includes(col)?Math.max(0,Number(req.body[k])):req.body[k];
  const {data,error}=await supabaseAdmin.from('plans').update(patch).eq('id',req.params.id).select('*').single();if(error)return res.status(400).json({error:error.message});res.json({plan:data});
});
app.get('/api/admin/orders',requireAdmin,async(_req,res)=>{
  const {data,error}=await supabaseAdmin.from('orders').select('*').order('created_at',{ascending:false}).limit(200);
  if(error)return res.status(500).json({error:error.message});
  const orders=data||[];
  const contacts=new Map();
  const ids=[...new Set(orders.map(o=>o.user_id).filter(Boolean))];
  // Admin SDK does not expose a bulk get-by-id call. Resolve only the distinct users present in the latest orders.
  await Promise.all(ids.slice(0,100).map(async id=>{
    const {data:u}=await supabaseAdmin.auth.admin.getUserById(id);
    if(u?.user)contacts.set(id,u.user.email||u.user.phone||id);
  }));
  res.json({orders:orders.map(o=>({...o,user_contact:contacts.get(o.user_id)||o.user_id}))});
});
app.post('/api/admin/orders/:id/approve',requireAdmin,async(req,res)=>{
  const {data,error}=await supabaseAdmin.rpc('approve_order',{p_order_id:req.params.id,p_admin_id:req.user.id});if(error)return res.status(400).json({error:error.message});res.json({order:Array.isArray(data)?data[0]:data});
});

app.use((_req,res)=>res.sendFile(path.join(rootDir,'index.html')));
if(process.env.VERCEL!=='1')app.listen(port,()=>console.log(`VN Pension Calculator v3: http://localhost:${port}`));
export default app;
