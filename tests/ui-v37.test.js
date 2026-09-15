import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=async p=>readFile(new URL(p,root),'utf8');

test('v3.7 index exposes all four benefit tabs and consistent credit labels',async()=>{
  const html=await read('index.html');
  for(const text of ['Lương hưu','BHXH một lần','Trợ cấp thất nghiệp','Chế độ thai sản'])assert.match(html,new RegExp(text));
  assert.match(html,/benefits-ui\.js/);
});

test('v3.7 admin supports deleting plans and cancelling pending payments',async()=>{
  const js=await read('js/admin.js');
  const server=await read('server/index.js');
  assert.match(js,/delete-plan/);
  assert.match(js,/cancel-order/);
  assert.match(server,/app\.delete\('\/api\/admin\/plans\/:id'/);
  assert.match(server,/app\.post\('\/api\/admin\/orders\/:id\/cancel'/);
});

test('v3.7 benefit calculations use shared server-side manual credit and history endpoints',async()=>{
  const server=await read('server/index.js');
  const ui=await read('js/benefits-ui.js');
  assert.match(server,/benefit_calculation/);
  assert.match(server,/consumeCredit\(req\.user\.id,'direct'/);
  assert.match(ui,/saveHistory/);
  assert.match(server,/app\.post\('\/api\/history'/);
});

test('v3.7 history knows the new benefit types',async()=>{
  const account=await read('js/account.js');
  for(const token of ["one_time:'BHXH một lần'","unemployment:'Trợ cấp thất nghiệp'","maternity:'Chế độ thai sản'"])assert.ok(account.includes(token),token);
});
