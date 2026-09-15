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

test('BHXH one-time from 2014 uses two months average per rounded year',()=>{
  const r=calculateOneTimeSocialInsurance({periods:[employer('2024-01','2024-12')],settlementMonth:'2026-08',eligibilityReason:'emigration'});
  assert.equal(r.ok,true);
  assert.equal(r.totalMonths,12);
  assert.equal(r.post2014Years,1);
  closeTo(r.estimatedAmount,2*r.averageBase);
});

test('BHXH one-time transfers odd pre-2014 months into post-2014 period',()=>{
  const r=calculateOneTimeSocialInsurance({periods:[employer('2012-07','2013-12'),employer('2014-01','2014-12')],settlementMonth:'2026-08'});
  assert.equal(r.ok,true);
  assert.equal(r.pre2014Months,18);
  assert.equal(r.transferredPre2014OddMonths,6);
  assert.equal(r.pre2014Years,1);
  assert.equal(r.post2014Years,1.5);
  closeTo(r.estimatedAmount,4.5*r.averageBase);
});

test('BHXH one-time under one year is capped at two months average',()=>{
  const r=calculateOneTimeSocialInsurance({periods:[employer('2026-01','2026-06')],settlementMonth:'2026-08',actualPaidVnd:999999999});
  assert.equal(r.ok,true);
  assert.equal(r.underOneYear,true);
  closeTo(r.estimatedAmount,2*r.averageBase);
  closeTo(r.maximumAmount,2*r.averageBase);
});

test('unemployment benefit uses 60 percent, regional cap and duration rule from 2026',()=>{
  const r=calculateUnemploymentBenefit({eligibleContributionMonths:48,lastSixSalaries:Array(6).fill(10000000),region:'I',lastContributionMonth:'2026-02'});
  assert.equal(r.ok,true);
  assert.equal(r.durationMonths,4);
  closeTo(r.monthlyBenefit,6000000);
  closeTo(r.estimatedTotal,24000000);
  assert.equal(regionalMinimumWage('I','2026-02'),5310000);
});

test('unemployment benefit applies five-times regional minimum ceiling',()=>{
  const r=calculateUnemploymentBenefit({eligibleContributionMonths:156,lastSixSalaries:Array(6).fill(100000000),region:'I',lastContributionMonth:'2026-02'});
  assert.equal(r.ok,true);
  assert.equal(r.durationMonths,12);
  closeTo(r.ceiling,26550000);
  closeTo(r.monthlyBenefit,26550000);
});

test('unemployment tab refuses pre-2026 events because it models Employment Law 2025',()=>{
  const r=calculateUnemploymentBenefit({eligibleContributionMonths:36,lastSixSalaries:Array(6).fill(10000000),region:'I',lastContributionMonth:'2025-12'});
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

test('female birth requires six salary contribution months for correct average',()=>{
  const r=calculateMaternityBenefit({scheme:'compulsory',caseType:'female_birth',eventMonth:'2026-08',children:1,months12:6,salaryMonths:[10000000,10000000,10000000]});
  assert.equal(r.ok,false);
  assert.match(r.errors.join(' '),/06 mức tiền lương/);
});

test('voluntary maternity pays two million per child when 6 of 12 months condition is met',()=>{
  const r=calculateMaternityBenefit({scheme:'voluntary',caseType:'male_birth',eventMonth:'2026-08',children:2,months12:6});
  assert.equal(r.ok,true);
  assert.equal(r.eligible,true);
  assert.equal(r.estimatedTotal,4000000);
});
