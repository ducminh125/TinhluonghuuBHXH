import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const account=fs.readFileSync(new URL('../js/account.js',import.meta.url),'utf8');

test('v3.9 public UI exposes concise benefit navigation and progressive help',()=>{
  assert.match(html,/hero-points/);
  assert.match(html,/benefit-tab-no/);
  assert.match(html,/helper-details file-guidance/);
  assert.match(html,/3 bước để có kết quả/);
  assert.doesNotMatch(html,/Cơ sở pháp lý và nguyên tắc tính/);
  assert.doesNotMatch(html,/Đăng nhập Google cần được bật trong cấu hình nhà cung cấp xác thực/);
});

test('v3.9 hides infrastructure jargon from end-user auth messages and has responsive polish',()=>{
  assert.doesNotMatch(account,/Supabase/);
  assert.doesNotMatch(account,/Vercel/);
  assert.match(css,/v3\.9 · polished public UI/);
  assert.match(css,/benefit-tabs\{[\s\S]*position:sticky/);
  assert.match(css,/@media\(max-width:820px\)/);
});
