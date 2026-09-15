import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateMaternityBenefit } from '../js/benefits.js';

const root=new URL('../',import.meta.url);
const read=async p=>readFile(new URL(p,root),'utf8');

test('v3.12 female maternity uses one contextual condition selector instead of two overlapping checkboxes',async()=>{
  const html=await read('index.html');
  assert.match(html,/id="maternityFemaleCondition"/);
  assert.doesNotMatch(html,/id="maternityPregnancyLeave"/);
  assert.doesNotMatch(html,/id="maternityInfertility"/);
});

test('v3.12 special male controls are factual inputs and only one-time grant condition is derived by system',async()=>{
  const html=await read('index.html');
  assert.match(html,/id="maternityWifeSurgery"/);
  assert.match(html,/id="maternityChildUnder32"/);
  assert.match(html,/id="maternityMotherNotEligible"/);
  assert.doesNotMatch(html,/id="maternityFatherLump"/);
  assert.match(html,/hệ thống sẽ tự kiểm tra người cha có đủ 06 tháng/i);
});

test('v3.12 female pregnancy-leave selector changes eligibility route',()=>{
  const r=calculateMaternityBenefit({scheme:'compulsory',caseType:'female_birth',femaleCondition:'pregnancy_leave',eventMonth:'2026-08',children:1,totalPriorMonths:12,months12:3,salaryMonths:Array(6).fill(10000000)});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.match(r.eligibilityRule,/03 tháng.*12 tháng/);
});

test('v3.12 female infertility selector changes eligibility route',()=>{
  const r=calculateMaternityBenefit({scheme:'compulsory',caseType:'female_birth',femaleCondition:'infertility',eventMonth:'2026-08',children:1,months24:6,salaryMonths:Array(6).fill(10000000)});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.match(r.eligibilityRule,/06 tháng.*24 tháng/);
});

test('v3.12 surgery/under-32 control changes father leave from 5 to 7 days for one child',()=>{
  const common={scheme:'compulsory',caseType:'male_birth',eventMonth:'2026-08',children:1,activeCompulsoryAtEvent:true,salaryMonths:[10000000]};
  const normal=calculateMaternityBenefit({...common,surgeryOrUnder32:false});
  const special=calculateMaternityBenefit({...common,childUnder32:true});
  assert.equal(normal.durationDays,5);
  assert.equal(special.durationDays,7);
  assert.ok(special.estimatedTotal>normal.estimatedTotal);
});



test('v3.12 multiple birth under 32 weeks does not incorrectly use the surgery-only 14-day rule',()=>{
  const common={scheme:'compulsory',caseType:'male_birth',eventMonth:'2026-08',children:2,activeCompulsoryAtEvent:true,salaryMonths:[10000000]};
  const premature=calculateMaternityBenefit({...common,childUnder32:true,wifeSurgery:false});
  const surgery=calculateMaternityBenefit({...common,childUnder32:false,wifeSurgery:true});
  assert.equal(premature.durationDays,10);
  assert.equal(surgery.durationDays,14);
});

test('v3.12 mother-not-eligible input triggers father one-time grant only when father has 6 of 12 months',()=>{
  const yes=calculateMaternityBenefit({scheme:'compulsory',caseType:'male_birth',eventMonth:'2026-08',children:1,motherNotEligible:true,months12:6,activeCompulsoryAtEvent:false,salaryMonths:[]});
  assert.equal(yes.eligible,true);
  assert.ok(yes.lumpSum>0);
  const no=calculateMaternityBenefit({scheme:'compulsory',caseType:'male_birth',eventMonth:'2026-08',children:1,motherNotEligible:true,months12:5,activeCompulsoryAtEvent:false,salaryMonths:[]});
  assert.equal(no.eligible,false);
  assert.match(no.eligibilityErrors.join(' '),/06 tháng/);
});

test('v3.12 UI synchronizer hides irrelevant maternity controls by selected case',async()=>{
  const ui=await read('js/benefits-ui.js');
  for(const token of ['maternityFemaleSpecial','maternityMaleSpecial','maternityMonths12Row','maternityMonths24Row','maternityTotalPriorRow','maternityWeeksRow','maternityDaysRow']) assert.match(ui,new RegExp(token));
  assert.match(ui,/caseType === 'female_birth'/);
  assert.match(ui,/caseType === 'male_birth'/);
});
