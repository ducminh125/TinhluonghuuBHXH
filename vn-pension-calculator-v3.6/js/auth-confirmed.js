const title=document.getElementById('confirmTitle');
const message=document.getElementById('confirmMessage');
const icon=document.getElementById('confirmIcon');
const loginButton=document.getElementById('loginButton');

function hashParams(){return new URLSearchParams(location.hash.replace(/^#/,''));}
function queryParams(){return new URLSearchParams(location.search);}
function fail(text){
  title.textContent='Chưa xác nhận được email';
  message.textContent=text||'Liên kết xác nhận không hợp lệ hoặc đã hết hạn. Bạn có thể quay lại trang chủ để đăng nhập hoặc đăng ký lại.';
  icon.textContent='!';
  icon.style.background='#fff3e8';
  loginButton.textContent='Quay lại trang chủ';
}

async function main(){
  const hp=hashParams(), qp=queryParams();
  const err=hp.get('error_description')||qp.get('error_description')||hp.get('error')||qp.get('error');
  if(err)return fail(decodeURIComponent(err));
  try{
    const config=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
    if(!config.authEnabled||!window.supabase?.createClient){
      title.textContent='Email đã được xác nhận';
      message.textContent='Bạn có thể quay lại trang chủ và đăng nhập bằng email vừa xác nhận.';
      return;
    }
    const client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,detectSessionInUrl:true}});
    // Supabase parses the confirmation hash into a persistent browser session when present.
    await new Promise(resolve=>setTimeout(resolve,120));
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    title.textContent='Đăng ký thành công';
    if(data?.session){
      message.textContent='Email đã được xác nhận và tài khoản đã sẵn sàng. Bạn có thể vào công cụ ngay.';
      loginButton.hidden=true;
    }else{
      message.textContent='Email đã được xác nhận. Bạn có thể về trang chủ và đăng nhập bằng tài khoản vừa tạo.';
    }
  }catch(e){
    title.textContent='Email đã được xác nhận';
    message.textContent='Bạn có thể quay lại trang chủ để đăng nhập. Nếu chưa đăng nhập được, hãy thử tải lại trang.';
  }
}
main();
