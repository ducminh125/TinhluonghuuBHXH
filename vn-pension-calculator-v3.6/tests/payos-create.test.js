import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PAYOS_CLIENT_ID=' client-id ';
process.env.PAYOS_API_KEY=' api-key ';
process.env.PAYOS_CHECKSUM_KEY='checksum-secret';
process.env.PAYOS_TIMEOUT_MS='5000';

const payos = await import('../server/payos.js?payos-create-test=1');

test('createPayosPayment sends minimal valid request and returns QR', async()=>{
  const originalFetch=globalThis.fetch;
  let captured;
  globalThis.fetch=async(url,options)=>{
    captured={url,options,body:JSON.parse(options.body)};
    return new Response(JSON.stringify({code:'00',desc:'success',data:{
      orderCode:123456789,amount:99000,accountNumber:'0123456789',accountName:'NGUYEN VAN A',
      paymentLinkId:'abc',checkoutUrl:'https://pay.payos.vn/web/abc',qrCode:'000201-test',status:'PENDING'
    }}),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const result=await payos.createPayosPayment({
      orderCode:123456789,amount:99000,description:'LH4567890',
      returnUrl:'https://example.com/?payment=success',cancelUrl:'https://example.com/?payment=cancel',expiredAt:1800000000
    });
    assert.equal(result.qrCode,'000201-test');
    assert.equal(captured.url,'https://api-merchant.payos.vn/v2/payment-requests');
    assert.equal(captured.options.headers['x-client-id'],'client-id');
    assert.equal(captured.options.headers['x-api-key'],'api-key');
    assert.deepEqual(Object.keys(captured.body).sort(),['amount','cancelUrl','description','expiredAt','orderCode','returnUrl','signature'].sort());
    assert.equal(captured.body.description.length,9);
  }finally{globalThis.fetch=originalFetch;}
});

test('createPayosPayment exposes payOS authentication error instead of generic 500', async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({code:'01',desc:'Unauthorized'}),{status:401,headers:{'content-type':'application/json'}});
  try{
    await assert.rejects(
      ()=>payos.createPayosPayment({orderCode:123456789,amount:29000,description:'LH4567890',returnUrl:'https://example.com/ok',cancelUrl:'https://example.com/cancel'}),
      err=>err.code==='PAYOS_AUTH_FAILED' && /Client ID/i.test(err.message)
    );
  }finally{globalThis.fetch=originalFetch;}
});

test('buildVietQrImageUrl creates an embeddable VietQR image from payOS payment data',()=>{
  const url=payos.buildVietQrImageUrl({
    bin:'970418',accountNumber:'V3CAS8885141200',amount:1000,
    description:'CSO1Z9RJNA4 LH1652774',accountName:'MAI DUC MINH',template:'qr_only'
  });
  const parsed=new URL(url);
  assert.equal(parsed.hostname,'img.vietqr.io');
  assert.equal(parsed.pathname,'/image/970418-V3CAS8885141200-qr_only.png');
  assert.equal(parsed.searchParams.get('amount'),'1000');
  assert.equal(parsed.searchParams.get('addInfo'),'CSO1Z9RJNA4 LH1652774');
  assert.equal(parsed.searchParams.get('accountName'),'MAI DUC MINH');
});
