import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../server/index.js', import.meta.url),'utf8');

test('order route uses the declared expiredAt value for payOS',()=>{
  assert.match(source,/const\s+expiredAt\s*=\s*paymentExpiry\(\)/);
  assert.match(source,/createPayosPayment\(\{[\s\S]*?description,expiredAt,returnUrl,cancelUrl[\s\S]*?\}\)/);
  assert.doesNotMatch(source,/const\s+expiresAt\s*=\s*paymentExpiry\(\)/);
});

test('order route returns an embeddable VietQR image URL',()=>{
  assert.match(source,/qrImageUrl:buildVietQrImageUrl\(\{[\s\S]*?template:'qr_only'[\s\S]*?\}\)/);
});
