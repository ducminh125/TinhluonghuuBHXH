import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=async p=>readFile(new URL(p,root),'utf8');

test('v3.10 admin exposes per-field order filters plus general search',async()=>{
  const html=await read('admin.html');
  const js=await read('js/admin.js');
  const server=await read('server/index.js');
  for(const id of ['orderSearchInput','orderCodeFilter','orderUserFilter','orderPlanFilter','orderAmountMinFilter','orderAmountMaxFilter','orderDateFromFilter','orderDateToFilter','orderStatusFilter','orderSearchBtn','orderFilterClearBtn']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(js,/collectOrderFilters/);
  assert.match(js,/buildListParams\(orderPage,orderFilters\)/);
  for(const field of ['req.query.q','req.query.code','req.query.user','req.query.plan','req.query.amountMin','req.query.amountMax','req.query.dateFrom','req.query.dateTo','req.query.status']){
    assert.match(server,new RegExp(field.replaceAll('.','\\.')));
  }
});

test('v3.10 admin exposes per-field import filters plus general search',async()=>{
  const html=await read('admin.html');
  const js=await read('js/admin.js');
  const server=await read('server/index.js');
  for(const id of ['importSearchInput','importUserFilter','importParserFilter','importModelFilter','importLatencyMinFilter','importLatencyMaxFilter','importDateFromFilter','importDateToFilter','importStatusFilter','importSearchBtn','importFilterClearBtn']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(js,/collectImportFilters/);
  assert.match(js,/buildListParams\(importPage,importFilters\)/);
  for(const field of ['req.query.latencyMinSeconds','req.query.latencyMaxSeconds']){
    assert.match(server,new RegExp(field.replaceAll('.','\\.')));
  }
  assert.match(server,/matchingAuthUserIds/);
  assert.match(server,/range\(from,to\)/);
});
