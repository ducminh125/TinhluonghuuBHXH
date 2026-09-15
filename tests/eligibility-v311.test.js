import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=async p=>readFile(new URL(p,root),'utf8');

test('v3.11 server checks benefit eligibility before consuming a manual credit',async()=>{
  const source=await read('server/index.js');
  const start=source.indexOf("app.post('/api/benefits/calculate'");
  const end=source.indexOf("app.post('/api/calculate'",start);
  const block=source.slice(start,end);
  assert.ok(block.indexOf("result?.eligible===false")>=0);
  assert.ok(block.indexOf("result?.eligible===false")<block.indexOf("consumeCredit(req.user.id,'direct'"));
  assert.match(block,/BENEFIT_NOT_ELIGIBLE/);
  assert.match(block,/charged:false/);
});

test('v3.11 server checks pension eligibility before consuming a manual credit',async()=>{
  const source=await read('server/index.js');
  const start=source.indexOf("app.post('/api/calculate'");
  const end=source.indexOf('function runImportUpload',start);
  const block=source.slice(start,end);
  assert.ok(block.indexOf("calculation?.result?.eligible===false")>=0);
  assert.ok(block.indexOf("calculation?.result?.eligible===false")<block.indexOf("consumeCredit(req.user.id,'direct'"));
  assert.match(block,/PENSION_NOT_ELIGIBLE/);
});

test('v3.11 UI exposes eligibility confirmations and special maternity descriptions',async()=>{
  const html=await read('index.html');
  for(const id of [
    'oneTimeStoppedParticipation','oneTimeStopped12Months','oneTimeSeriousConditionConfirmed','unemploymentLookbackMonths','unemploymentContractGroup',
    'unemploymentWasContributing','unemploymentLawfulTermination','unemploymentFiledWithin3Months','unemploymentNoExclusion',
    'maternityActiveCompulsory','maternityMedicalFacility','maternityFemaleCondition','maternityWifeSurgery','maternityChildUnder32','maternityMotherNotEligible'
  ]) assert.match(html,new RegExp(`id="${id}"`));
  for(const phrase of [
    'Phải nghỉ việc để dưỡng thai theo chỉ định','điều trị vô sinh','Vợ sinh phải phẫu thuật','Sinh con dưới 32 tuần tuổi','Mẹ không đủ điều kiện hưởng chế độ thai sản khi sinh con'
  ]) assert.match(html,new RegExp(phrase,'i'));
});

test('v3.11 UI tells users eligibility failures do not consume a credit',async()=>{
  const ui=await read('js/benefits-ui.js');
  const app=await read('js/app.js');
  assert.match(ui,/Lượt tính không bị trừ/);
  assert.match(app,/Lượt tính không bị trừ/);
});
