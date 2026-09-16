const {createClient}=supabase;
const sb=createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=s=>document.querySelector(s);

async function init(){
  const {data:{session}}=await sb.auth.getSession();
  const isLogin=location.pathname.endsWith('/index.html')||location.pathname.endsWith('/');
  if(isLogin){ if(session) location.href='admin.html'; else bindLogin(); return; }
  if(!session){location.href='index.html';return;}
  const {data:p,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
  if(error||!['owner','admin','staff'].includes(p.role)){await sb.auth.signOut();location.href='index.html';return;}
  $('#who').textContent=`${p.full_name||session.user.email} · ${p.role}`;
  $('#logout').onclick=async()=>{await sb.auth.signOut();location.href='index.html'};
  renderAdmin();
}

function bindLogin(){
  $('#login').onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    const {error}=await sb.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});
    $('#msg').textContent=error?error.message:'Loggar in...';
    if(!error)location.href='admin.html';
  };
}

async function renderAdmin(){
  const [{data:customers,error:cErr},{data:services,error:sErr},{data:products,error:pErr}]=await Promise.all([
    sb.from('profiles').select('*').eq('role','customer').order('created_at',{ascending:false}),
    sb.from('service_tickets').select('*').order('created_at',{ascending:false}),
    sb.from('products').select('*').order('created_at',{ascending:false})
  ]);
  if(cErr||sErr||pErr){
    const err=cErr||sErr||pErr;
    $('#adminApp').innerHTML=`<div class="card"><h2>Fel</h2><p>${esc(err.message)}</p><p class="small">Kontrollera att du har kört v4-migreringen i Supabase SQL Editor.</p></div>`;
    return;
  }

  const stockTotal=(products||[]).reduce((n,p)=>n+(Number(p.stock)||0),0);
  const low=(products||[]).filter(p=>p.active && Number(p.stock)<=Number(p.low_stock_threshold||2)).length;

  $('#adminApp').innerHTML=`
  <h1>Butikspanel</h1>
  <div class="grid">
    <div class="card"><div class="muted">Kunder</div><div class="metric">${customers?.length||0}</div></div>
    <div class="card"><div class="muted">Produkter</div><div class="metric">${products?.length||0}</div><p class="small">${stockTotal} st totalt i lager · ${low} lågt/eller slut</p></div>
    <div class="card"><div class="muted">Serviceärenden</div><div class="metric">${services?.length||0}</div><p class="small">Databas 🟢 Online</p></div>
  </div>

  <div class="panel" style="margin-top:18px">
    <div class="row"><h2>Produkter & lager</h2><button id="newProduct" class="btn">+ Ny produkt</button></div>
    <div id="productFormArea"></div>
    <table class="table">
      <tr><th>Produkt</th><th>Art.nr</th><th>Kategori</th><th>Pris</th><th>Lager</th><th>Status</th><th></th></tr>
      ${(products||[]).map(p=>`
        <tr>
          <td><b>${esc(p.name)}</b></td>
          <td>${esc(p.sku||'')}</td>
          <td>${esc(p.category||'')}</td>
          <td>${money(p.price)}</td>
          <td><b>${Number(p.stock)||0}</b></td>
          <td>${stockBadge(p)}</td>
          <td><div class="actions">
            <button class="btn secondary smallbtn editProduct" data-id="${p.id}">Ändra</button>
            <button class="btn secondary smallbtn stockProduct" data-id="${p.id}">Lager</button>
          </div></td>
        </tr>`).join('')}
    </table>
  </div>

  <div class="panel" style="margin-top:18px">
    <h2>Kunder</h2>
    <table class="table"><tr><th>Namn</th><th>E-post</th><th>Telefon</th><th>Adress</th></tr>
    ${(customers||[]).map(c=>`<tr><td>${esc(c.full_name)}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td></tr>`).join('')}
    </table>
  </div>

  <div class="panel" style="margin-top:18px">
    <div class="row"><h2>Service</h2><button id="newService" class="btn">+ Nytt ärende</button></div>
    <div id="serviceFormArea"></div>
    <table class="table"><tr><th>Ärende</th><th>Kund</th><th>Enhet</th><th>Pris</th><th>Status</th><th></th></tr>
    ${(services||[]).map(s=>{let c=(customers||[]).find(x=>x.id===s.customer_id);return `<tr><td>${esc(s.ticket_no)}</td><td>${esc(c?.full_name||c?.email||'')}</td><td>${esc(s.device)}</td><td>${money(s.price)}</td><td>${esc(s.status)}</td><td><button class="btn secondary smallbtn editService" data-id="${s.id}">Ändra</button></td></tr>`}).join('')}
    </table>
  </div>`;

  $('#newProduct').onclick=()=>showProductForm();
  document.querySelectorAll('.editProduct').forEach(b=>b.onclick=()=>showProductForm((products||[]).find(p=>String(p.id)===String(b.dataset.id))));
  document.querySelectorAll('.stockProduct').forEach(b=>b.onclick=()=>showStockForm((products||[]).find(p=>String(p.id)===String(b.dataset.id))));
  $('#newService').onclick=()=>showServiceForm(customers||[]);
  document.querySelectorAll('.editService').forEach(b=>b.onclick=()=>showEditService((services||[]).find(s=>String(s.id)===String(b.dataset.id))));
}

function showProductForm(p=null){
  const area=$('#productFormArea');
  area.innerHTML=`<div class="notice"><h3>${p?'Ändra produkt':'Ny produkt'}</h3>
  <form id="pf" class="form">
    <input name="name" placeholder="Produktnamn" value="${esc(p?.name||'')}" required>
    <input name="sku" placeholder="Produktnummer / SKU" value="${esc(p?.sku||'')}" required>
    <input name="category" placeholder="Kategori, t.ex. Datorer" value="${esc(p?.category||'')}">
    <input name="price" type="number" min="0" step="0.01" placeholder="Försäljningspris (kr)" value="${p?.price??''}" required>
    <input name="purchase_price" type="number" min="0" step="0.01" placeholder="Inköpspris (kr)" value="${p?.purchase_price??''}">
    <input name="stock" type="number" min="0" step="1" placeholder="Lagerantal" value="${p?.stock??0}" required>
    <input name="low_stock_threshold" type="number" min="0" step="1" placeholder="Larmnivå för lågt lager" value="${p?.low_stock_threshold??2}">
    <label><input name="active" type="checkbox" ${p?.active===false?'':'checked'}> Synlig för kunder</label>
    <div class="actions"><button class="btn success">Spara</button><button type="button" id="cancelProduct" class="btn secondary">Avbryt</button></div>
    <p id="pfmsg" class="msg"></p>
  </form></div>`;
  $('#cancelProduct').onclick=()=>area.innerHTML='';
  $('#pf').onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    const payload={name:f.get('name'),sku:f.get('sku'),category:f.get('category'),price:Number(f.get('price')),purchase_price:Number(f.get('purchase_price')||0),stock:Math.max(0,Number(f.get('stock'))),low_stock_threshold:Math.max(0,Number(f.get('low_stock_threshold')||2)),active:f.get('active')==='on'};
    let result=p
      ? await sb.from('products').update(payload).eq('id',p.id)
      : await sb.from('products').insert(payload);
    $('#pfmsg').textContent=result.error?result.error.message:'Sparat!';
    if(!result.error)setTimeout(renderAdmin,400);
  };
}

function showStockForm(p){
  const area=$('#productFormArea');
  area.innerHTML=`<div class="notice"><h3>Lager: ${esc(p.name)}</h3>
  <p>Nuvarande lager: <b>${Number(p.stock)||0} st</b></p>
  <form id="stockf" class="form">
    <input name="stock" type="number" min="0" step="1" value="${Number(p.stock)||0}" required>
    <div class="actions"><button class="btn success">Spara lager</button><button type="button" id="cancelStock" class="btn secondary">Avbryt</button></div>
    <p id="stockmsg" class="msg"></p>
  </form></div>`;
  $('#cancelStock').onclick=()=>area.innerHTML='';
  $('#stockf').onsubmit=async e=>{
    e.preventDefault();
    const stock=Math.max(0,Number(new FormData(e.target).get('stock')));
    const {error}=await sb.from('products').update({stock}).eq('id',p.id);
    $('#stockmsg').textContent=error?error.message:'Lager sparat!';
    if(!error)setTimeout(renderAdmin,400);
  };
}

function showServiceForm(customers){
  const area=$('#serviceFormArea');
  if(!customers.length){
    area.innerHTML=`<div class="notice"><h3>Nytt serviceärende</h3><p>Det finns inga kunder ännu. Kunden måste först skapa ett konto.</p><button type="button" id="cancelService" class="btn secondary">Stäng</button></div>`;
    $('#cancelService').onclick=()=>area.innerHTML='';
    return;
  }
  area.innerHTML=`<div class="notice"><h3>➕ Nytt serviceärende</h3>
  <form id="sf2" class="form">
    <label>Kund<select name="customer" required>${customers.map(c=>`<option value="${c.id}">${esc(c.full_name||'Okänd kund')}${c.email?' – '+esc(c.email):''}</option>`).join('')}</select></label>
    <label>Produkt / enhet<input name="device" placeholder="T.ex. Lenovo Legion 5" required></label>
    <label>Felbeskrivning<textarea name="problem" placeholder="Beskriv problemet kunden har"></textarea></label>
    <label>Pris (kr)<input name="price" type="number" min="0" step="0.01" placeholder="T.ex. 799"></label>
    <label>Anteckningar<textarea name="note" placeholder="Interna eller kundsynliga anteckningar"></textarea></label>
    <label>Status<select name="status"><option>Inlämnad</option><option>Undersökning</option><option>Väntar på reservdel</option><option>Reparation pågår</option><option>Klar</option><option>Hämtad</option></select></label>
    <div class="actions"><button class="btn success">Skapa serviceärende</button><button type="button" id="cancelService" class="btn secondary">Avbryt</button></div>
    <p id="sfmsg" class="msg"></p>
  </form></div>`;
  $('#cancelService').onclick=()=>area.innerHTML='';
  $('#sf2').onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    const payload={
      customer_id:f.get('customer'),
      device:f.get('device'),
      problem:f.get('problem'),
      price:Number(f.get('price')||0),
      note:f.get('note'),
      status:f.get('status')
    };
    const {error}=await sb.from('service_tickets').insert(payload);
    $('#sfmsg').textContent=error?error.message:'Serviceärendet är skapat!';
    if(!error)setTimeout(renderAdmin,500);
  };
}

function showEditService(s){
  const states=['Inlämnad','Undersökning','Väntar på reservdel','Reparation pågår','Klar','Hämtad'];
  $('#serviceFormArea').innerHTML=`<div class="notice"><h3>Uppdatera ${esc(s.ticket_no)}</h3>
  <form id="us" class="form">
    <select name="status">${states.map(x=>`<option ${x===s.status?'selected':''}>${x}</option>`).join('')}</select>
    <input name="price" type="number" min="0" step="0.01" placeholder="Pris (kr)" value="${s?.price??0}">
    <textarea name="note" placeholder="Meddelande till kund">${esc(s.note||'')}</textarea>
    <div class="actions"><button class="btn success">Spara</button><button type="button" id="cancelEditService" class="btn secondary">Avbryt</button></div>
    <p id="usmsg" class="msg"></p>
  </form></div>`;
  $('#cancelEditService').onclick=()=>$('#serviceFormArea').innerHTML='';
  $('#us').onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.target);
    const {error}=await sb.from('service_tickets').update({status:f.get('status'),price:Number(f.get('price')||0),note:f.get('note'),updated_at:new Date().toISOString()}).eq('id',s.id);
    $('#usmsg').textContent=error?error.message:'Sparat!';
    if(!error)setTimeout(renderAdmin,400);
  };
}

function stockBadge(p){
  if(!p.active)return '<span class="badge">Dold</span>';
  const n=Number(p.stock)||0, t=Number(p.low_stock_threshold)||2;
  if(n===0)return '<span class="out">Slut</span>';
  if(n<=t)return '<span class="low">Lågt lager</span>';
  return '<span class="ok">I lager</span>';
}
function money(v){return `${Number(v||0).toLocaleString('sv-SE',{minimumFractionDigits:2,maximumFractionDigits:2})} kr`}
function esc(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
init();
