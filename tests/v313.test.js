import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const admin=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/index.js',import.meta.url),'utf8');
const ai=fs.readFileSync(new URL('../server/shopaikey.js',import.meta.url),'utf8');
const account=fs.readFileSync(new URL('../js/account.js',import.meta.url),'utf8');

test('v3.13 defaults one-time BHXH to pre-2025 after 12 months reason',()=>{
  const select=index.match(/<select id="oneTimeReason">([\s\S]*?)<\/select>/)?.[1]||'';
  assert.match(select,/^<option value="pre2025_after12months" selected>/);
});

test('v3.13 import failure cleanup does not call catch on Supabase query builder',()=>{
  assert.doesNotMatch(server,/\.eq\('id',jobId\)\.catch\(/);
  assert.match(server,/could not mark import job failed/);
});

test('v3.13 has native Gemini vision fallback',()=>{
  assert.match(ai,/SHOPAIKEY_VISION_FALLBACK_MODEL/);
  assert.match(ai,/gemini-2\.5-pro/);
  assert.match(ai,/AI_EXTRACTION_FAILED/);
});

test('v3.13 exposes Facebook login in user and admin UI',()=>{
  assert.match(index,/id="facebookLoginBtn"/);
  assert.match(admin,/id="adminFacebookBtn"/);
  assert.match(account,/signInWithOAuth\(\{provider/);
  assert.match(server,/facebookAuthEnabled/);
});
