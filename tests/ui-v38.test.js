import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=async p=>readFile(new URL(p,root),'utf8');

test('v3.8 detects whether Google OAuth is actually enabled before redirecting',async()=>{
  const supabase=await read('server/supabase.js');
  const server=await read('server/index.js');
  const account=await read('js/account.js');
  const admin=await read('js/admin.js');
  assert.match(supabase,/\/auth\/v1\/settings/);
  assert.match(server,/googleAuthEnabled:authProviders\.google/);
  assert.match(account,/googleAuthEnabled!==true/);
  assert.match(admin,/googleAuthEnabled!==true/);
});

test('v3.8 account modal uses five-row scroll frames and removes popup buy button',async()=>{
  const html=await read('index.html');
  const css=await read('styles.css');
  const account=await read('js/account.js');
  assert.doesNotMatch(html,/id="accountBuyBtn"/);
  assert.match(html,/historyList" class="account-list account-scroll-list history-scroll-list/);
  assert.match(html,/orderList" class="account-list account-scroll-list order-scroll-list/);
  assert.match(css,/\.account-scroll-list\{[^}]*overflow-y:auto/);
  assert.match(account,/\/api\/history\?limit=30/);
  assert.match(account,/host\.innerHTML=\(data\.orders\|\|\[\]\)\.map/);
});

test('v3.8 admin paginates users orders imports at ten rows and supports user search',async()=>{
  const html=await read('admin.html');
  const js=await read('js/admin.js');
  const server=await read('server/index.js');
  for(const id of ['userSearchInput','usersPagination','ordersPagination','importsPagination'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/const PAGE_SIZE=10/);
  assert.match(js,/q',userQuery|params\.set\('q',userQuery\)/);
  assert.match(server,/app\.get\('\/api\/admin\/imports'/);
  assert.match(server,/adminPagination\(req,10\)/);
  assert.match(server,/String\(req\.query\.q\|\|''\)/);
});
