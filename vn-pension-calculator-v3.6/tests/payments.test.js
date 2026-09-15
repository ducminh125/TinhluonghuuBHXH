import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PAYOS_CLIENT_ID='test-client';
process.env.PAYOS_API_KEY='test-api';
process.env.PAYOS_CHECKSUM_KEY='1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675';

const payos = await import('../server/payos.js?payments-test=1');

test('payOS payment description respects 9-character compatibility limit',()=>{
  const description=payos.buildPaymentDescription(175792812345678);
  assert.equal(description.length,9);
  assert.match(description,/^LH\d{7}$/);
});

test('payOS webhook verifier matches official documentation sample',()=>{
  const payload={
    code:'00',desc:'success',success:true,
    data:{
      orderCode:123,amount:3000,description:'VQRIO123',accountNumber:'12345678',reference:'TF230204212323',
      transactionDateTime:'2023-02-04 18:25:00',currency:'VND',paymentLinkId:'124c33293c43417ab7879e14c8d9eb18',
      code:'00',desc:'Thành công',counterAccountBankId:'',counterAccountBankName:'',counterAccountName:'',counterAccountNumber:'',
      virtualAccountName:'',virtualAccountNumber:''
    },
    signature:'412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03'
  };
  assert.equal(payos.verifyPayosWebhook(payload).orderCode,123);
});
