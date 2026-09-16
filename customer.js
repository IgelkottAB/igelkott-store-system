const {createClient}=supabase;
const sb=createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=s=>document.querySelector(s);

async function render(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){loginView();return}
  const {data:profile,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
  if(error){$('#customerApp').innerHTML=`<div class="card"><h2>Kundeprofil</h2><p>${esc(error.message)}</p></div>`;return}
  const [{data:services},{data:products}]=await Promise.all([
    sb.from('service_tickets').select('*').eq('customer_id',session.user.id).order('created_at',{ascending:false}),
    sb.from('products').select('*').eq('active',true).order('name')
  ]);
  $('#customerApp').innerHTML=`
  <div class="grid">
    <div class="card"><div class="muted">Inloggad</div><div class="metric" style="font-size:22px">${esc(profile.full_name||session.user.email)}</div><p>${esc(session.user.email)}</p><button id="logout" class="btn secondary">Logga ut</button></div>
    <div class="card"><div class="muted">Mina serviceärenden</div><div class="metric">${services?.length||0}</div></div>
    <div class="card"><div class="muted">Produkter</div><div class="metric">${products?.length||0}</div><p class="small">Visar produkter som butiken har publicerat.</p></div>
  </div>
  <div class="panel" style="margin-top:18px"><h2>Produkter</h2>${productHtml(products||[])}</div>
  <div class="panel" style="margin-top:18px"><h2>Mina serviceärenden</h2>${serviceHtml(services||[])}</div>
  <div class="panel" style="margin-top:18px"><h2>Mina uppgifter</h2>
    <form id="profileForm" class="form">
      <input name="full_name" placeholder="Namn" value="${esc(profile.full_name||'')}" required>
      <input name="phone" placeholder="Telefon" value="${esc(profile.phone||'')}">
      <input name="address" placeholder="Leveransadress" value="${esc(profile.address||'')}">
      <button class="btn">Spara uppgifter</button>
    </form><p id="pm" class="msg"></p>
  </div>`;
  $('#logout').onclick=async()=>{await sb.auth.signOut();render()};
  $('#profileForm').onsubmit=async e=>{
    e.preventDefault();let f=new FormData(e.target);
    let {error}=await sb.from('profiles').update({full_name:f.get('full_name'),phone:f.get('phone'),address:f.get('address')}).eq('id',session.user.id);
    $('#pm').textContent=error?error.message:'Sparat!';
  };
}

function productHtml(list){
  if(!list.length)return '<p class="muted">Butiken har inga publicerade produkter ännu.</p>';
  return `<div class="product-grid">${list.map(p=>`
    <div class="card product-card">
      <span class="badge">${esc(p.category||'Produkt')}</span>
      <h3>${esc(p.name)}</h3>
      <div class="price">${money(p.price)}</div>
      <div>${p.stock>0?'<span class="ok">I lager</span>':'<span class="out">Slut i lager</span>'}</div>
      <p class="small">Art.nr: ${esc(p.sku)}</p>
    </div>`).join('')}</div>`;
}
function serviceHtml(list){
  if(!list.length)return '<p class="muted">Du har inga serviceärenden ännu.</p>';
  let states=['Inlämnad','Undersökning','Väntar på reservdel','Reparation pågår','Klar','Hämtad'];
  return list.map(s=>{let i=states.indexOf(s.status);return `<div class="card" style="margin-bottom:12px"><div class="row"><b>${esc(s.ticket_no)}</b><span class="ok">${esc(s.status)}</span></div><h3>${esc(s.device)}</h3><p>${esc(s.problem||'')}</p><p><b>Pris:</b> ${money(s.price)}</p><div class="statusbar">${states.map((x,j)=>`<span class="${j<=i?'on':''}"></span>`).join('')}</div><p class="small">${esc(s.note||'')}</p></div>`}).join('');
}
function loginView(){
  $('#customerApp').innerHTML=`<div class="card login"><div class="tabs"><button id="showLogin">Logga in</button><button id="showSignup">Skapa konto</button></div><div id="authBox"></div></div>`;
  loginForm();$('#showLogin').onclick=loginForm;$('#showSignup').onclick=signupForm;
}
function loginForm(){
  $('#authBox').innerHTML=`<h1>Logga in</h1><form id="lf" class="form"><input name="email" type="email" placeholder="E-post" required><input name="password" type="password" placeholder="Lösenord" required><button class="btn">Logga in</button></form><p id="am" class="msg"></p>`;
  $('#lf').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);let {error}=await sb.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});$('#am').textContent=error?error.message:'Loggar in...';if(!error)render()};
}
function signupForm(){
  $('#authBox').innerHTML=`<h1>Skapa konto</h1><p class="muted">Ditt konto används för service, beställningar och leverans.</p><form id="sf" class="form"><input name="name" placeholder="För- och efternamn" required><input name="email" type="email" placeholder="E-post" required><input name="phone" placeholder="Telefon"><input name="address" placeholder="Leveransadress"><input name="password" type="password" minlength="8" placeholder="Lösenord (minst 8 tecken)" required><button class="btn">Skapa konto</button></form><p id="am" class="msg"></p>`;
  $('#sf').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);let {data,error}=await sb.auth.signUp({email:f.get('email'),password:f.get('password'),options:{data:{full_name:f.get('name'),phone:f.get('phone'),address:f.get('address')}}});if(error){$('#am').textContent=error.message;return}$('#am').textContent=data.session?'Kontot är skapat!':'Kontot är skapat. Kontrollera din e-post för att bekräfta kontot.';if(data.session)render()};
}
function money(v){return `${Number(v||0).toLocaleString('sv-SE',{minimumFractionDigits:2,maximumFractionDigits:2})} kr`}
function esc(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
render();
