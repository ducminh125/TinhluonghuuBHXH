import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('commercial credit labels use v3.6 terminology',()=>{
  const account=read('js/account.js');
  assert.match(account,/lượt nhập thủ công/);
  assert.match(account,/lượt nhập bằng file\/ảnh tự động/);
  assert.match(account,/lượt lưu lịch sử/);
});

test('payment modal contains visible pending transaction notice and bounded scroll card',()=>{
  const html=read('index.html');
  const css=read('styles.css');
  assert.match(html,/Đang chờ xác nhận giao dịch/);
  assert.match(css,/\.payment-card\{[^}]*max-height:calc\(100dvh - 32px\)[^}]*overflow:auto/);
});

test('saved history can be retrieved with input and result JSON',()=>{
  const server=read('server/index.js');
  const account=read('js/account.js');
  assert.match(server,/app\.get\('\/api\/history\/:id'/);
  assert.match(server,/input_json,result_json/);
  assert.match(account,/Tra cứu/);
  assert.match(account,/Quá trình đóng đã lưu/);
});

test('history detail endpoint is scoped to signed-in user',()=>{
  const server=read('server/index.js');
  const match=server.match(/app\.get\('\/api\/history\/:id'[\s\S]*?res\.json\(\{history:data\}\);\n\}\);/);
  assert.ok(match);
  assert.match(match[0],/\.eq\('user_id',req\.user\.id\)/);
});
