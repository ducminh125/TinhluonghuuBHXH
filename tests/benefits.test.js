import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOneTimeSocialInsurance,
  calculateUnemploymentBenefit,
  calculateMaternityBenefit,
  regionalMinimumWage
} from '../js/benefits.js';

const closeTo=(actual,expected,epsilon=1)=>assert.ok(Math.abs(Number(actual)-Number(expected))<=epsilon,`${actual} != ${expected}`);
const employer=(from,to,amountVnd=10000000)=>({from,to,regime:'employer',valueType:'vnd',amountVnd});
const oneTimeBase={settlementMonth:'2026-08',eligibilityReason:'emigration',stoppedParticipation:true};
const unemploymentEligible={
  lookbackContributionMonths:12,
  contractGroup:'standard',
  wasContributingAtTermination:true,
  lawfulTermination:true,
  filedWithin3Months:true,
  noExclusionAfter10Days:true
};

test('BHXH one-time from 2014 uses two months average per rounded year',()=>{
  const r=calculateOneTimeSocialInsurance({...oneTimeBase,periods:[employer('2024-01','2024-12')]});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.equal(r.totalMonths,12);
  assert.equal(r.post2014Years,1);
  closeTo(r.estimatedAmount,2*r.averageBase);
});

test('BHXH one-time transfers odd pre-2014 months into post-2014 period',()=>{
  const r=calculateOneTimeSocialInsurance({...oneTimeBase,periods:[employer('2012-07','2013-12'),employer('2014-01','2014-12')]});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.equal(r.pre2014Months,18);
  assert.equal(r.transferredPre2014OddMonths,6);
  assert.equal(r.pre2014Years,1);
  assert.equal(r.post2014Years,1.5);
  closeTo(r.estimatedAmount,4.5*r.averageBase);
});

test('BHXH one-time under one year is capped at two months average',()=>{
  const r=calculateOneTimeSocialInsurance({...oneTimeBase,periods:[employer('2026-01','2026-06')],actualPaidVnd:999999999});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.equal(r.underOneYear,true);
  closeTo(r.estimatedAmount,2*r.averageBase);
  closeTo(r.maximumAmount,2*r.averageBase);
});

test('pre-2025 after-12-month one-time route blocks 20 years or more',()=>{
  const r=calculateOneTimeSocialInsurance({
    periods:[employer('2004-01','2024-12')],
    settlementMonth:'2026-08',
    eligibilityReason:'pre2025_after12months',
    stoppedParticipation:true,
    stopped12Months:true
  });
  assert.equal(r.ok,true);
  assert.equal(r.eligible,false);
  assert.ok(r.totalMonths>=240);
  assert.match(r.eligibilityErrors.join(' '),/chưa đủ 20 năm/);
  assert.equal(r.estimatedAmount,undefined);
});

test('emigration one-time route is not incorrectly blocked at 20 years',()=>{
  const r=calculateOneTimeSocialInsurance({
    periods:[employer('2004-01','2024-12')],
    settlementMonth:'2026-08',
    eligibilityReason:'emigration',
    stoppedParticipation:true
  });
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.ok(r.totalMonths>=240);
  assert.ok(r.estimatedAmount>0);
});

test('one-time route requires stopped participation',()=>{
  const r=calculateOneTimeSocialInsurance({periods:[employer('2020-01','2024-12')],settlementMonth:'2026-08',eligibilityReason:'emigration'});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,false);
  assert.match(r.eligibilityErrors.join(' '),/chấm dứt tham gia BHXH/);
});

test('serious-condition one-time route requires explicit confirmation of the statutory condition',()=>{
  const r=calculateOneTimeSocialInsurance({periods:[employer('2020-01','2024-12')],settlementMonth:'2026-08',eligibilityReason:'serious_condition',stoppedParticipation:true});
  assert.equal(r.eligible,false);
  assert.match(r.eligibilityErrors.join(' '),/81%|nhóm bệnh/);
});

test('unemployment benefit uses 60 percent, regional cap and duration rule from 2026',()=>{
  const r=calculateUnemploymentBenefit({...unemploymentEligible,eligibleContributionMonths:48,lastSixSalaries:Array(6).fill(10000000),region:'I',lastContributionMonth:'2026-02'});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.equal(r.durationMonths,4);
  closeTo(r.monthlyBenefit,6000000);
  closeTo(r.estimatedTotal,24000000);
  assert.equal(regionalMinimumWage('I','2026-02'),5310000);
});

test('unemployment benefit applies five-times regional minimum ceiling',()=>{
  const r=calculateUnemploymentBenefit({...unemploymentEligible,eligibleContributionMonths:156,lastSixSalaries:Array(6).fill(100000000),region:'I',lastContributionMonth:'2026-02'});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.equal(r.durationMonths,12);
  closeTo(r.ceiling,26550000);
  closeTo(r.monthlyBenefit,26550000);
});

test('unemployment eligibility failure returns no calculated amount',()=>{
  const r=calculateUnemploymentBenefit({
    ...unemploymentEligible,
    eligibleContributionMonths:48,
    lookbackContributionMonths:11,
    lastSixSalaries:Array(6).fill(10000000),
    region:'I',lastContributionMonth:'2026-02'
  });
  assert.equal(r.ok,true);
  assert.equal(r.eligible,false);
  assert.match(r.eligibilityErrors.join(' '),/12 tháng/);
  assert.equal(r.monthlyBenefit,undefined);
});

test('short unemployment contract uses 36-month lookback',()=>{
  const r=calculateUnemploymentBenefit({
    ...unemploymentEligible,
    contractGroup:'short_1_12',
    eligibleContributionMonths:36,
    lookbackContributionMonths:12,
    lastSixSalaries:Array(6).fill(10000000),
    region:'I',lastContributionMonth:'2026-02'
  });
  assert.equal(r.eligible,true);
  assert.equal(r.lookbackWindow,36);
});

test('unemployment tab refuses pre-2026 events because it models Employment Law 2025',()=>{
  const r=calculateUnemploymentBenefit({...unemploymentEligible,eligibleContributionMonths:36,lastSixSalaries:Array(6).fill(10000000),region:'I',lastContributionMonth:'2025-12'});
  assert.equal(r.ok,false);
  assert.match(r.errors.join(' '),/01\/01\/2026/);
});

test('compulsory maternity female birth calculates six-month pay plus one-time grant',()=>{
  const r=calculateMaternityBenefit({scheme:'compulsory',caseType:'female_birth',eventMonth:'2026-08',children:1,months12:6,salaryMonths:Array(6).fill(10000000)});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.equal(r.durationMonths,6);
  closeTo(r.monthlyBenefit,10000000);
  closeTo(r.lumpSum,5060000);
  closeTo(r.estimatedTotal,65060000);
});

test('female birth pregnancy-leave special route requires 12 prior months and 3 of 12 months',()=>{
  const r=calculateMaternityBenefit({scheme:'compulsory',caseType:'female_birth',eventMonth:'2026-08',children:1,pregnancyLeave:true,totalPriorMonths:11,months12:6,salaryMonths:Array(6).fill(10000000)});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,false);
  assert.match(r.eligibilityErrors.join(' '),/12 tháng/);
});

test('female birth infertility route requires six months in 24 months',()=>{
  const r=calculateMaternityBenefit({scheme:'compulsory',caseType:'female_birth',eventMonth:'2026-08',children:1,infertilityTreatment:true,months24:5,salaryMonths:Array(6).fill(10000000)});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,false);
  assert.match(r.eligibilityErrors.join(' '),/06 tháng.*24 tháng/);
});

test('female birth requires six salary contribution months for correct average after eligibility passes',()=>{
  const r=calculateMaternityBenefit({scheme:'compulsory',caseType:'female_birth',eventMonth:'2026-08',children:1,months12:6,salaryMonths:[10000000,10000000,10000000]});
  assert.equal(r.ok,false);
  assert.match(r.errors.join(' '),/06 mức tiền lương/);
});

test('male maternity leave requires active compulsory participation',()=>{
  const r=calculateMaternityBenefit({scheme:'compulsory',caseType:'male_birth',eventMonth:'2026-08',children:1,months12:0,activeCompulsoryAtEvent:false,salaryMonths:[10000000]});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,false);
  assert.match(r.eligibilityErrors.join(' '),/đang tham gia BHXH bắt buộc/);
});

test('male surgery or child under 32 weeks gets seven working days for one child',()=>{
  const r=calculateMaternityBenefit({scheme:'compulsory',caseType:'male_birth',eventMonth:'2026-08',children:1,activeCompulsoryAtEvent:true,surgeryOrUnder32:true,salaryMonths:Array(6).fill(10000000)});
  assert.equal(r.eligible,true);
  assert.equal(r.durationDays,7);
});

test('father one-time grant can be calculated when mother is ineligible and father has six of 12 months',()=>{
  const r=calculateMaternityBenefit({scheme:'compulsory',caseType:'male_birth',eventMonth:'2026-08',children:1,months12:6,activeCompulsoryAtEvent:false,fatherLumpEligible:true,salaryMonths:[]});
  assert.equal(r.eligible,true);
  assert.equal(r.durationDays,0);
  closeTo(r.lumpSum,5060000);
});

test('voluntary maternity pays two million per child when 6 of 12 months condition is met',()=>{
  const r=calculateMaternityBenefit({scheme:'voluntary',caseType:'male_birth',eventMonth:'2026-08',children:2,months12:6});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.equal(r.estimatedTotal,4000000);
});
