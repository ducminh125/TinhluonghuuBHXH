import OpenAI from 'openai';
import { dedupeImportedPeriods } from '../js/contributions.js';

const SYSTEM_PROMPT = `Bạn là bộ trích xuất dữ liệu quá trình đóng BHXH Việt Nam. Chỉ đọc dữ liệu, KHÔNG tự tính lương hưu, KHÔNG suy đoán số tiền thiếu.

Có thể có NHIỀU ẢNH CHỤP LIÊN TIẾP của cùng một bảng và các ảnh có vùng gối nhau. Không tạo hai lần cùng một giai đoạn chỉ vì nó xuất hiện ở nhiều ảnh. Không đưa dòng chỉ đóng BHTN vào periods BHXH hưu trí.

Trả về DUY NHẤT một JSON object theo cấu trúc:
{
  "person": {"birthDate":"YYYY-MM-DD|null", "sex":"male|female|null"},
  "periods": [
    {
      "from":"YYYY-MM",
      "to":"YYYY-MM",
      "regime":"state|employer|voluntary|unknown",
      "valueType":"coefficient|vnd",
      "coefficient": number|null,
      "amountVnd": number|null,
      "positionAllowanceCoeff": number|null,
      "reservedDifferenceCoeff": number|null,
      "seniorityBeyondPercent": number|null,
      "professionalSeniorityPercent": number|null,
      "allowanceVnd": number|null,
      "note":"chuỗi ngắn"
    }
  ],
  "warnings":["..."]
}

Ưu tiên nhận diện: ngày sinh/giới tính nếu có; từ-tháng/đến-tháng; chế độ tiền lương; hệ số hoặc tiền VND; phụ cấp tính đóng; ngạch/bậc/chức danh/đơn vị trong note.
Nếu thiếu from, to hoặc mức lương/hệ số thì KHÔNG tự suy đoán, hãy cảnh báo.

Quy tắc:
1. Mỗi khoảng liên tục có cùng mức đóng là một period riêng.
2. Ảnh/tệp lặp cùng tháng và cùng số liệu: chỉ trả một lần. Cùng tháng khác số liệu: giữ dữ liệu rõ nhất và warning.
3. state khi lương theo chế độ Nhà nước hoặc có hệ số/ngạch/bậc; employer khi số tiền do NSDLĐ quyết định; voluntary khi BHXH tự nguyện; không chắc thì unknown.
4. Lương Nhà nước hệ số: coefficient là hệ số lương chính; tách phụ cấp chức vụ, chênh lệch bảo lưu, % thâm niên vượt khung, % thâm niên nghề.
5. Lương bằng VND: nếu tài liệu ghi tổng tiền lương làm căn cứ đóng thì amountVnd=tổng và allowanceVnd=0. Nếu tách lương chính/phụ cấp thì amountVnd=lương chính, allowanceVnd=tổng phụ cấp tính đóng.
6. Không lấy tiền thực nhận nếu không phải căn cứ đóng BHXH.
7. Bỏ các dòng chỉ thể hiện BHTN/tỷ lệ BHTN để tránh tính trùng thời gian BHXH.
8. Chỉ tạo warning khi sự không chắc chắn có thể làm thay đổi thời gian, chế độ, mức lương/hệ số, phụ cấp hoặc xung đột.`;

function stripJsonFence(text) {
  return String(text || '').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
}
function normalizeSex(value) {
  const v=String(value||'').toLowerCase().trim();
  if(['male','nam','m'].includes(v)) return 'male';
  if(['female','nữ','nu','f'].includes(v)) return 'female';
  return null;
}
function numeric(value) {
  if(value==null||value==='') return 0;
  const s=String(value).trim();
  let normalized=s;
  if (/^-?\d+(,\d+)$/.test(s)) normalized=s.replace(',','.');
  else normalized=s.replace(/[^0-9.-]/g,'');
  const n=Number(normalized);
  return Number.isFinite(n)?n:0;
}
function buildPeriodReview(row,index){
  const recognized=[],missing=[];
  if(row.from)recognized.push(`Từ ${row.from.slice(5,7)}/${row.from.slice(0,4)}`);else missing.push('Từ tháng/năm');
  if(row.to)recognized.push(`Đến ${row.to.slice(5,7)}/${row.to.slice(0,4)}`);else missing.push('Đến tháng/năm');
  if(row.from&&row.to&&row.from>row.to)missing.push('Khoảng thời gian hợp lệ');
  if(row.regime&&row.regime!=='unknown')recognized.push('Chế độ tiền lương/thu nhập');else missing.push('Chế độ tiền lương/thu nhập');
  if(row.valueType==='coefficient'&&row.coefficient>0)recognized.push(`Hệ số ${row.coefficient}`);
  else if(row.valueType==='vnd'&&row.amountVnd>0)recognized.push(`Mức đóng ${Math.round(row.amountVnd).toLocaleString('vi-VN')} đ`);
  else missing.push(row.valueType==='coefficient'?'Hệ số lương':'Mức tiền làm căn cứ đóng');
  if(row.positionAllowanceCoeff>0)recognized.push(`PC chức vụ ${row.positionAllowanceCoeff}`);
  if(row.reservedDifferenceCoeff>0)recognized.push(`CL bảo lưu ${row.reservedDifferenceCoeff}`);
  if(row.seniorityBeyondPercent>0)recognized.push(`TNVK ${row.seniorityBeyondPercent}%`);
  if(row.professionalSeniorityPercent>0)recognized.push(`Thâm niên nghề ${row.professionalSeniorityPercent}%`);
  if(row.allowanceVnd>0)recognized.push(`Phụ cấp tính đóng ${Math.round(row.allowanceVnd).toLocaleString('vi-VN')} đ`);
  if(row.note)recognized.push('Ghi chú/ngạch/bậc/chức danh');
  return {index,...row,recognizedFields:recognized,missingFields:missing,validForImport:missing.length===0};
}
function normalizePeriod(row,warnings,index){
  const regime=['state','employer','voluntary','unknown'].includes(row?.regime)?row.regime:'unknown';
  const valueType=['coefficient','vnd'].includes(row?.valueType)?row.valueType:'vnd';
  if(regime!=='state'&&valueType==='coefficient')warnings.push(`Dòng ${index+1}: hệ số xuất hiện ngoài chế độ lương Nhà nước; cần kiểm tra.`);
  return {
    from:/^\d{4}-(0[1-9]|1[0-2])$/.test(String(row?.from||''))?row.from:'',
    to:/^\d{4}-(0[1-9]|1[0-2])$/.test(String(row?.to||''))?row.to:'',
    regime,valueType,
    coefficient:valueType==='coefficient'?numeric(row?.coefficient):null,
    amountVnd:valueType==='vnd'?numeric(row?.amountVnd):null,
    positionAllowanceCoeff:numeric(row?.positionAllowanceCoeff),
    reservedDifferenceCoeff:numeric(row?.reservedDifferenceCoeff),
    seniorityBeyondPercent:numeric(row?.seniorityBeyondPercent),
    professionalSeniorityPercent:numeric(row?.professionalSeniorityPercent),
    allowanceVnd:numeric(row?.allowanceVnd),
    note:String(row?.note||'').slice(0,240)
  };
}

function extractionPrompt({text,filename,sourceCount}) {
  return `${SYSTEM_PROMPT}\n\nNguồn: ${filename}\nSố tệp: ${sourceCount}\n\nNội dung văn bản đã trích xuất:\n${text || '(không có lớp chữ; đọc từ ảnh đính kèm)'}`;
}

async function callGemini({apiKey,model,text,images,filename,sourceCount,timeoutMs}) {
  const base=(process.env.SHOPAIKEY_GEMINI_BASE_URL || 'https://api.shopaikey.com').replace(/\/$/,'');
  const parts=[{text:extractionPrompt({text,filename,sourceCount})}];
  for(const image of images){
    parts.push({text:`Nguồn ảnh: ${image.label || 'ảnh hồ sơ'}`});
    parts.push({inlineData:{data:image.base64,mimeType:image.mimeType}});
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
      body:JSON.stringify({
        contents:[{role:'user',parts}],
        generationConfig:{temperature:0,maxOutputTokens:8192,responseMimeType:'application/json'}
      }),
      signal:controller.signal
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(body?.error?.message || `Gemini HTTP ${response.status}`);
    const raw=(body.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');
    return {raw,usage:body.usageMetadata||null,provider:'gemini'};
  } finally { clearTimeout(timer); }
}

async function callOpenAICompatible({apiKey,model,text,images,filename,sourceCount,timeoutMs}) {
  const baseURL=process.env.SHOPAIKEY_BASE_URL || 'https://api.shopaikey.com/v1';
  const client=new OpenAI({apiKey,baseURL,timeout:timeoutMs,maxRetries:0});
  const imageContent=images.flatMap(image=>([
    {type:'text',text:`Nguồn ảnh: ${image.label || 'ảnh hồ sơ'}`},
    {type:'image_url',image_url:{url:`data:${image.mimeType};base64,${image.base64}`,detail:'high'}}
  ]));
  const response=await client.chat.completions.create({
    model,
    temperature:0,
    messages:[
      {role:'system',content:SYSTEM_PROMPT},
      {role:'user',content:[{type:'text',text:`Nguồn: ${filename}\nSố tệp: ${sourceCount}\n\n${text || '(đọc từ ảnh)'}`},...imageContent]}
    ]
  });
  return {raw:response.choices?.[0]?.message?.content||'',usage:response.usage||null,provider:'openai-compatible'};
}

function finalizeExtraction(raw,{model,provider,parserWarnings,sourceCount,latencyMs,usage,attempts}){
  if(!raw)throw new Error('Dịch vụ AI không trả về nội dung trích xuất.');
  let data;
  try{data=JSON.parse(stripJsonFence(raw));}catch{throw new Error('AI trả về dữ liệu không phải JSON hợp lệ.');}
  const informationalWarnings=[...parserWarnings.map(String)];
  const confirmationWarnings=Array.isArray(data.warnings)?data.warnings.map(String):[];
  const normalizationWarnings=[];
  const rawPeriods=(Array.isArray(data.periods)?data.periods:[]).map((row,index)=>normalizePeriod(row,normalizationWarnings,index));
  const reviewPeriods=rawPeriods.map((row,index)=>buildPeriodReview(row,index));
  const importable=reviewPeriods.filter(r=>r.validForImport).map(({recognizedFields,missingFields,validForImport,index,...row})=>row);
  const deduped=dedupeImportedPeriods(importable);
  confirmationWarnings.push(...normalizationWarnings,...deduped.warnings);
  const incompleteCount=reviewPeriods.filter(r=>!r.validForImport).length;
  if(incompleteCount)confirmationWarnings.push(`Có ${incompleteCount} dòng chưa đủ dữ liệu bắt buộc; các dòng này chưa được tự động điền.`);
  if(!reviewPeriods.length)confirmationWarnings.push('Chưa nhận diện được giai đoạn đóng BHXH nào.');
  const uniqueInfo=[...new Set(informationalWarnings)];
  const uniqueConfirmation=[...new Set(confirmationWarnings)];
  return {
    person:{
      birthDate:/^\d{4}-\d{2}-\d{2}$/.test(String(data.person?.birthDate||''))?data.person.birthDate:null,
      sex:normalizeSex(data.person?.sex)
    },
    reviewPeriods,periods:deduped.periods,
    warnings:[...new Set([...uniqueInfo,...uniqueConfirmation])],
    informationalWarnings:uniqueInfo,confirmationWarnings:uniqueConfirmation,
    meta:{model,provider,source:'AI',parserMode:'ai_fast',sourceCount,recognizedRows:reviewPeriods.length,incompleteRows:incompleteCount,importableRows:deduped.periods.length,duplicatesRemoved:deduped.duplicatesRemoved,conflicts:deduped.conflicts,needsConfirmation:incompleteCount>0||deduped.conflicts>0||uniqueConfirmation.length>0,latencyMs,usage,attempts}
  };
}

export async function extractBhxhWithAI({text,images=[],filename='hồ sơ',parserWarnings=[],sourceCount=1}){
  const apiKey=process.env.SHOPAIKEY_API_KEY;
  if(!apiKey)throw new Error('Server chưa cấu hình API key trích xuất hồ sơ.');

  const fastModel=process.env.SHOPAIKEY_FAST_MODEL || 'gemini-2.5-flash';
  const fallbackModel=process.env.SHOPAIKEY_FALLBACK_MODEL || 'gpt-5.6-luna';
  const fastTimeout=Number(process.env.AI_FAST_TIMEOUT_MS || 45000);
  const fallbackTimeout=Number(process.env.AI_FALLBACK_TIMEOUT_MS || 45000);
  const started=Date.now();
  const attempts=[];
  let result;

  try{
    attempts.push(fastModel);
    result=await callGemini({apiKey,model:fastModel,text,images,filename,sourceCount,timeoutMs:fastTimeout});
    // Validate JSON before accepting the fast path; malformed output falls back.
    JSON.parse(stripJsonFence(result.raw));
    return finalizeExtraction(result.raw,{model:fastModel,provider:result.provider,parserWarnings,sourceCount,latencyMs:Date.now()-started,usage:result.usage,attempts});
  }catch(error){
    console.warn('[AI fast extraction]', error?.message || error);
  }

  try{
    attempts.push(fallbackModel);
    result=await callOpenAICompatible({apiKey,model:fallbackModel,text,images,filename,sourceCount,timeoutMs:fallbackTimeout});
    return finalizeExtraction(result.raw,{model:fallbackModel,provider:result.provider,parserWarnings,sourceCount,latencyMs:Date.now()-started,usage:result.usage,attempts});
  }catch(error){
    const message=error?.name==='AbortError'?'hết thời gian xử lý':(error?.message||String(error));
    throw new Error(`Không thể trích xuất hồ sơ bằng luồng nhanh. ${message}`);
  }
}
