const {createClient}=supabase;
const sb=createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=s=>document.querySelector(s);
let currentSession=null, allProducts=[], cart=[];

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=n=>new Intl.NumberFormat('sv-SE',{style:'currency',currency:'SEK'}).format(Number(n||0));

async function render(){
  const {data:{session}}=await sb.auth.getSession();
  currentSession=session;
  if(!session){loginView();return}
  const {data:profile,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
  if(error){$('#customerApp').innerHTML=`<div class="card"><h2>Kundeprofil</h2><p>${esc(error.message)}</p></div>`;return}
  const [{data:services},{data:products},{data:orders},{data:reviews}]=await Promise.all([
    sb.from('service_tickets').select('*').eq('customer_id',session.user.id).order('created_at',{ascending:false}),
    sb.from('products').select('*').eq('active',true).order('name'),
    sb.from('orders').select('*').eq('customer_id',session.user.id).order('created_at',{ascending:false}),
    sb.from('product_reviews').select('*').eq('customer_id',session.user.id)
  ]);
  allProducts=products||[];
  loadCart();
  $('#customerApp').innerHTML=`
  <div class="grid">
    <div class="card"><div class="muted">Inloggad</div><div class="metric" style="font-size:22px">${esc(profile.full_name||session.user.email)}</div><p>${esc(session.user.email)}</p><button id="logout" class="btn secondary">Logga ut</button></div>
    <div class="card"><div class="muted">Mina beställningar</div><div class="metric">${orders?.length||0}</div></div>
    <div class="card"><div class="muted">Mina serviceärenden</div><div class="metric">${services?.length||0}</div></div>
    <div class="card"><div class="muted">Kundvagn</div><div class="metric" id="cartCount">0</div></div>
  </div>

  <div class="panel" style="margin-top:18px">
    <div class="row"><h2>🛍️ Butik</h2><button id="cartBtn" class="btn">🛒 Kundvagn</button></div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <input id="searchBox" placeholder="🔍 Sök produkt..." style="flex:1;min-width:200px">
      <select id="categoryFilter"><option value="">Alla kategorier</option>${[...new Set(allProducts.map(p=>p.category).filter(Boolean))].sort().map(c=>`<option>${esc(c)}</option>`).join('')}</select>
      <select id="sortProducts"><option value="name">Sortera: namn</option><option value="priceAsc">Pris: lägst först</option><option value="priceDesc">Pris: högst först</option></select>
    </div>
    <div id="productArea" style="margin-top:14px"></div>
  </div>

  <div class="panel" style="margin-top:18px"><h2>📦 Mina beställningar</h2>${ordersHtml(orders||[])}</div>
  <div class="panel" style="margin-top:18px"><h2>🔧 Mina serviceärenden</h2>${serviceHtml(services||[])}</div>
  <div class="panel" style="margin-top:18px"><h2>👤 Mina uppgifter</h2>
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
  $('#cartBtn').onclick=()=>showCart(profile);
  $('#searchBox').oninput=renderProducts;
  $('#categoryFilter').onchange=renderProducts;
  $('#sortProducts').onchange=renderProducts;
  renderProducts();
  updateCartCount();
}

function renderProducts(){
  let q=($('#searchBox')?.value||'').toLowerCase(), cat=$('#categoryFilter')?.value||'', sort=$('#sortProducts')?.value||'name';
  let list=allProducts.filter(p=>(!q || `${p.name} ${p.sku} ${p.category||''}`.toLowerCase().includes(q)) && (!cat||p.category===cat));
  list.sort((a,b)=>sort==='priceAsc'?Number(a.price)-Number(b.price):sort==='priceDesc'?Number(b.price)-Number(a.price):a.name.localeCompare(b.name,'sv'));
  $('#productArea').innerHTML=list.length?`<div class="product-grid">${list.map(productCard).join('')}</div>`:'<p class="muted">Inga produkter matchar sökningen.</p>';
  document.querySelectorAll('.addCart').forEach(b=>b.onclick=()=>addToCart(Number(b.dataset.id)));
  document.querySelectorAll('.reviewBtn').forEach(b=>b.onclick=()=>showReviews(Number(b.dataset.id)));
}

function productCard(p){
  let avg=''; // review summary is loaded on demand
  return `<div class="card product-card">
    <span class="badge">${esc(p.category||'Produkt')}</span>
    <h3>${esc(p.name)}</h3><div class="price">${money(p.price)}</div>
    <div>${p.stock>0?`<span class="ok">${Number(p.stock)} st i lager</span>`:'<span class="out">Slut i lager</span>'}</div>
    <p class="small">Art.nr: ${esc(p.sku)}</p>
    <div class="actions"><button class="btn addCart" data-id="${p.id}" ${p.stock<=0?'disabled':''}>🛒 Lägg i kundvagn</button><button class="btn secondary reviewBtn" data-id="${p.id}">⭐ Recensioner</button></div>
  </div>`;
}

function loadCart(){try{cart=JSON.parse(localStorage.getItem('igelkott_cart')||'[]').filter(x=>allProducts.some(p=>p.id===x.id));}catch{cart=[]}}
function saveCart(){localStorage.setItem('igelkott_cart',JSON.stringify(cart))}
function addToCart(id){
  let p=allProducts.find(x=>x.id===id); if(!p||p.stock<=0)return;
  let row=cart.find(x=>x.id===id);
  if(row) row.qty=Math.min(row.qty+1,Number(p.stock)); else cart.push({id,qty:1});
  saveCart(); updateCartCount(); renderProducts();
}
function updateCartCount(){let n=cart.reduce((s,x)=>s+x.qty,0); if($('#cartCount'))$('#cartCount').textContent=n}

async function showCart(profile){
  if(!cart.length){alert('Kundvagnen är tom.');return}
  let rows=cart.map(x=>{let p=allProducts.find(y=>y.id===x.id);return p?{...x,p}:null}).filter(Boolean);
  let subtotal=rows.reduce((s,x)=>s+Number(x.p.price)*x.qty,0);
  let box=document.createElement('div'); box.className='card'; box.id='cartModal';
  box.innerHTML=`<div class="row"><h2>🛒 Kundvagn</h2><button id="closeCart" class="btn secondary">Stäng</button></div>
  ${rows.map(x=>`<div class="row" style="margin:10px 0"><div><b>${esc(x.p.name)}</b><div class="small">${money(x.p.price)} × ${x.qty}</div></div><div><button class="btn secondary cartMinus" data-id="${x.id}">−</button> <button class="btn secondary cartPlus" data-id="${x.id}">+</button> <button class="btn secondary cartRemove" data-id="${x.id}">Ta bort</button></div></div>`).join('')}
  <hr><p><b>Summa: ${money(subtotal)}</b></p>
  <div class="row"><input id="promoInput" placeholder="Rabattkod (t.ex. IGELKOTT10)" style="flex:1"><button id="applyPromo" class="btn secondary">Använd kod</button></div>
  <p id="promoMsg" class="msg"></p><p id="cartTotal"><b>Totalt: ${money(subtotal)}</b></p>
  <button id="checkoutBtn" class="btn">Till kassan →</button>`;
  document.body.appendChild(box);
  const close=()=>box.remove();
  $('#closeCart').onclick=close;
  box.querySelectorAll('.cartMinus').forEach(b=>b.onclick=()=>changeQty(Number(b.dataset.id),-1,box,profile));
  box.querySelectorAll('.cartPlus').forEach(b=>b.onclick=()=>changeQty(Number(b.dataset.id),1,box,profile));
  box.querySelectorAll('.cartRemove').forEach(b=>b.onclick=()=>{cart=cart.filter(x=>x.id!==Number(b.dataset.id));saveCart();box.remove();updateCartCount();showCart(profile)});
  let discount=0,promoCode='';
  $('#applyPromo').onclick=async()=>{
    let code=$('#promoInput').value.trim().toUpperCase(); if(!code)return;
    let {data,error}=await sb.from('promo_codes').select('*').eq('code',code).eq('active',true).maybeSingle();
    if(error||!data|| (data.expires_at&&new Date(data.expires_at)<new Date()) || (data.max_uses!==null&&data.uses>=data.max_uses)){discount=0;promoCode='';$('#promoMsg').textContent='Rabattkoden är inte giltig.';return}
    discount=Math.min(subtotal,subtotal*Number(data.discount_percent)/100);promoCode=code;
    $('#promoMsg').textContent=`Rabatt ${Number(data.discount_percent)}% tillagd.`;$('#cartTotal').innerHTML=`<b>Totalt: ${money(subtotal-discount)}</b>`;
  };
  $('#checkoutBtn').onclick=()=>showCheckout(profile,rows,discount,promoCode,close);
}
function changeQty(id,delta,box,profile){
  let p=allProducts.find(x=>x.id===id),r=cart.find(x=>x.id===id);if(!r)return;
  r.qty=Math.max(1,Math.min(r.qty+delta,Number(p.stock)));saveCart();box.remove();updateCartCount();showCart(profile);
}

function showCheckout(profile,rows,discount,promoCode,closeCart){
  let total=rows.reduce((s,x)=>s+Number(x.p.price)*x.qty,0)-discount;
  let box=document.createElement('div');box.className='card';box.id='checkoutModal';
  box.innerHTML=`<div class="row"><h2>📦 Kassa</h2><button id="closeCheckout" class="btn secondary">Tillbaka</button></div>
  <form id="checkoutForm" class="form">
    <input name="name" value="${esc(profile.full_name||'')}" placeholder="Namn" required>
    <input name="phone" value="${esc(profile.phone||'')}" placeholder="Telefon" required>
    <input name="address" value="${esc(profile.address||'')}" placeholder="Leveransadress" required>
    <select name="payment"><option>Betala senare</option><option>Swish</option><option>Kort</option></select>
    <p class="small">Kort/Swish är förberett som betalmetod. Riktig betalning kräver att vi kopplar en betalningsleverantör.</p>
    <p><b>Att betala: ${money(total)}</b></p>
    <button class="btn">Lägg beställning</button>
    <p id="checkoutMsg" class="msg"></p>
  </form>`;
  document.body.appendChild(box);$('#closeCheckout').onclick=()=>{box.remove();showCart(profile)};
  $('#checkoutForm').onsubmit=async e=>{
    e.preventDefault();let f=new FormData(e.target);
    let orderNo='IG-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+Math.floor(10000+Math.random()*90000);
    let payload={order_no:orderNo,customer_id:currentSession.user.id,status:'Ny',payment_method:f.get('payment'),payment_status:'Väntar',subtotal:total+discount,discount,total,promo_code:promoCode||null,shipping_name:f.get('name'),shipping_address:f.get('address'),shipping_phone:f.get('phone')};
    let {data:order,error}=await sb.from('orders').insert(payload).select().single();
    if(error){$('#checkoutMsg').textContent=error.message;return}
    let items=rows.map(x=>({order_id:order.id,product_id:x.p.id,product_name:x.p.name,sku:x.p.sku,quantity:x.qty,unit_price:x.p.price}));
    let {error:itemErr}=await sb.from('order_items').insert(items);
    if(itemErr){$('#checkoutMsg').textContent=itemErr.message;return}
    // Stock is adjusted server-side through an RPC if available; otherwise inform admin.
    for(const x of rows){
      await sb.from('products').update({stock:Math.max(0,Number(x.p.stock)-x.qty)}).eq('id',x.p.id);
    }
    if(promoCode) await sb.rpc('increment_promo_use',{promo_code:promoCode}).catch(()=>{});
    cart=[];saveCart();box.innerHTML=`<div class="card"><h2>✅ Beställningen är skapad!</h2><p>Ordernummer: <b>${esc(orderNo)}</b></p><p>Du hittar ordern under <b>Mina beställningar</b>.</p><button id="doneOrder" class="btn">Klar</button></div>`;$('#doneOrder').onclick=()=>{box.remove();render()};
  };
}

async function showReviews(productId){
  let p=allProducts.find(x=>x.id===productId);let {data}=await sb.from('product_reviews').select('*').eq('product_id',productId).order('created_at',{ascending:false});
  let box=document.createElement('div');box.className='card';box.id='reviewModal';
  box.innerHTML=`<div class="row"><h2>⭐ ${esc(p.name)}</h2><button id="closeReview" class="btn secondary">Stäng</button></div>
  ${(data||[]).map(r=>`<div class="card" style="margin:8px 0"><b>${'⭐'.repeat(r.rating)}</b><p>${esc(r.review_text||'')}</p></div>`).join('')||'<p class="muted">Inga recensioner ännu.</p>'}
  <form id="reviewForm" class="form"><select name="rating"><option value="5">5 ⭐</option><option value="4">4 ⭐</option><option value="3">3 ⭐</option><option value="2">2 ⭐</option><option value="1">1 ⭐</option></select><textarea name="text" placeholder="Skriv en recension"></textarea><button class="btn">Spara recension</button></form><p id="reviewMsg" class="msg"></p>`;
  document.body.appendChild(box);$('#closeReview').onclick=()=>box.remove();
  $('#reviewForm').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);let {error}=await sb.from('product_reviews').upsert({product_id:productId,customer_id:currentSession.user.id,rating:Number(f.get('rating')),review_text:f.get('text')},{onConflict:'product_id,customer_id'});$('#reviewMsg').textContent=error?error.message:'Recension sparad!';};
}

function ordersHtml(list){
 if(!list.length)return '<p class="muted">Du har inga beställningar ännu.</p>';
 return list.map(o=>`<div class="card" style="margin-bottom:12px"><div class="row"><b>${esc(o.order_no)}</b><span class="badge">${esc(o.status)}</span></div><p>${money(o.total)} · ${esc(o.payment_method)} · ${esc(o.payment_status)}</p><p class="small">${new Date(o.created_at).toLocaleString('sv-SE')}</p></div>`).join('');
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
 $('#authBox').innerHTML=`<h1>Skapa konto</h1><p class="muted">Ditt konto används för service, beställningar och leverans.</p><form id="sf" class="form"><input name="name" placeholder="För- och efternamn" required><input name="email" type="email" placeholder="E-post" required><input name="phone" placeholder="Telefon"><input name="address" placeholder="Leveransadress"><input name="password" type="password" minlength="8" placeholder="Lösenord (minst 8 tecken)" required><button class="btn">Skapa konto</button></form><p id="sm" class="msg"></p>`;
 $('#sf').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);let {error}=await sb.auth.signUp({email:f.get('email'),password:f.get('password'),options:{data:{full_name:f.get('name'),phone:f.get('phone'),address:f.get('address')}}});$('#sm').textContent=error?error.message:'Konto skapat – kontrollera din e-post.'};
}
render();
