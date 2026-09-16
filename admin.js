const {createClient}=supabase;
const sb=createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=n=>new Intl.NumberFormat('sv-SE',{style:'currency',currency:'SEK'}).format(Number(n||0));

async function init(){
 const {data:{session}}=await sb.auth.getSession();
 const isLogin=location.pathname.endsWith('/index.html')||location.pathname.endsWith('/');
 if(isLogin){if(session)location.href='admin.html';else bindLogin();return}
 if(!session){location.href='index.html';return}
 const {data:p,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
 if(error||!['owner','admin','staff'].includes(p.role)){await sb.auth.signOut();location.href='index.html';return}
 $('#who').textContent=`${p.full_name||session.user.email} · ${p.role}`;
 $('#logout').onclick=async()=>{await sb.auth.signOut();location.href='index.html'};
 renderAdmin();
}

function bindLogin(){
 $('#login').onsubmit=async e=>{
  e.preventDefault();
  let f=new FormData(e.target);
  let {error}=await sb.auth.signInWithPassword({
   email:f.get('email'),
   password:f.get('password')
  });
  $('#msg').textContent=error?error.message:'Loggar in...';
  if(!error)location.href='admin.html';
 }
}

async function renderAdmin(){
 const [
  {data:customers,error:cErr},
  {data:services,error:sErr},
  {data:products,error:pErr},
  {data:orders,error:oErr},
  {data:promos,error:promoErr}
 ]=await Promise.all([
  sb.from('profiles').select('*').eq('role','customer').order('created_at',{ascending:false}),
  sb.from('service_tickets').select('*').order('created_at',{ascending:false}),
  sb.from('products').select('*').order('created_at',{ascending:false}),
  sb.from('orders').select('*').order('created_at',{ascending:false}),
  sb.from('promo_codes').select('*').order('created_at',{ascending:false})
 ]);

 if(cErr||sErr||pErr||oErr||promoErr){
  let err=cErr||sErr||pErr||oErr||promoErr;
  $('#adminApp').innerHTML=`
   <div class="card">
    <h2>Fel</h2>
    <p>${esc(err.message)}</p>
    <p class="small">Kontrollera att v5-migreringen är körd.</p>
   </div>`;
  return;
 }

 const stockTotal=(products||[]).reduce((n,p)=>n+(Number(p.stock)||0),0);
 const low=(products||[]).filter(
  p=>p.active&&Number(p.stock)<=Number(p.low_stock_threshold||2)
 ).length;

 $('#adminApp').innerHTML=`
  <h1>Butikspanel</h1>

  <div class="grid">
   <div class="card">
    <div class="muted">Kunder</div>
    <div class="metric">${customers?.length||0}</div>
   </div>

   <div class="card">
    <div class="muted">Produkter</div>
    <div class="metric">${products?.length||0}</div>
    <p class="small">${stockTotal} st i lager · ${low} lågt/slut</p>
   </div>

   <div class="card">
    <div class="muted">Serviceärenden</div>
    <div class="metric">${services?.length||0}</div>
   </div>

   <div class="card">
    <div class="muted">Beställningar</div>
    <div class="metric">${orders?.length||0}</div>
   </div>
  </div>

  <div class="panel" style="margin-top:18px">
   <div class="row">
    <h2>🛒 Beställningar</h2>
   </div>

   <table class="table">
    <tr>
     <th>Order</th>
     <th>Kund</th>
     <th>Summa</th>
     <th>Betalning</th>
     <th>Status</th>
    </tr>

    ${(orders||[]).map(o=>{
     let c=(customers||[]).find(x=>x.id===o.customer_id);

     let statuses=[
      'Ny',
      'Bekräftad',
      'Packas',
      'Skickad',
      'Klar',
      'Avbruten'
     ];

     return `
      <tr>
       <td><b>${esc(o.order_no)}</b></td>

       <td>
        ${esc(c?.full_name||c?.email||'')}
       </td>

       <td>
        ${money(o.total)}
       </td>

       <td>
        ${esc(o.payment_method)} / ${esc(o.payment_status)}
       </td>

       <td>
        <select
         class="orderStatusSelect"
         data-id="${o.id}"
        >
         ${statuses.map(s=>`
          <option
           value="${s}"
           ${o.status===s?'selected':''}
          >
           ${s}
          </option>
         `).join('')}
        </select>
       </td>
      </tr>
     `;
    }).join('')}
   </table>
  </div>

  <div class="panel" style="margin-top:18px">
   <div class="row">
    <h2>📦 Produkter & lager</h2>
    <button id="newProduct" class="btn">+ Ny produkt</button>
   </div>

   <div id="productFormArea"></div>

   <table class="table">
    <tr>
     <th>Produkt</th>
     <th>Art.nr</th>
     <th>Kategori</th>
     <th>Pris</th>
     <th>Lager</th>
     <th>Status</th>
     <th></th>
    </tr>

    ${(products||[]).map(p=>`
     <tr>
      <td><b>${esc(p.name)}</b></td>
      <td>${esc(p.sku)}</td>
      <td>${esc(p.category||'')}</td>
      <td>${money(p.price)}</td>
      <td><b>${Number(p.stock)||0}</b></td>
      <td>${p.active?'🟢 Aktiv':'⚪ Dold'}</td>
      <td>
       <button
        class="btn secondary smallbtn editProduct"
        data-id="${p.id}"
       >
        Ändra
       </button>

       <button
        class="btn secondary smallbtn stockProduct"
        data-id="${p.id}"
       >
        Lager
       </button>
      </td>
     </tr>
    `).join('')}
   </table>
  </div>

  <div class="panel" style="margin-top:18px">
   <h2>👥 Kunder</h2>

   <table class="table">
    <tr>
     <th>Namn</th>
     <th>E-post</th>
     <th>Telefon</th>
     <th>Adress</th>
    </tr>

    ${(customers||[]).map(c=>`
     <tr>
      <td>${esc(c.full_name)}</td>
      <td>${esc(c.email)}</td>
      <td>${esc(c.phone)}</td>
      <td>${esc(c.address)}</td>
     </tr>
    `).join('')}
   </table>
  </div>

  <div class="panel" style="margin-top:18px">
   <div class="row">
    <h2>🔧 Service</h2>
    <button id="newService" class="btn">+ Nytt ärende</button>
   </div>

   <div id="serviceFormArea"></div>

   <table class="table">
    <tr>
     <th>Ärende</th>
     <th>Kund</th>
     <th>Enhet</th>
     <th>Pris</th>
     <th>Status</th>
     <th></th>
    </tr>

    ${(services||[]).map(s=>{
     let c=(customers||[]).find(x=>x.id===s.customer_id);

     return `
      <tr>
       <td>${esc(s.ticket_no)}</td>
       <td>${esc(c?.full_name||c?.email||'')}</td>
       <td>${esc(s.device)}</td>
       <td>${money(s.price)}</td>
       <td>${esc(s.status)}</td>
       <td>
        <button
         class="btn secondary smallbtn editService"
         data-id="${s.id}"
        >
         Ändra
        </button>
       </td>
      </tr>
     `;
    }).join('')}
   </table>
  </div>

  <div class="panel" style="margin-top:18px">
   <div class="row">
    <h2>🏷️ Rabattkoder</h2>
    <button id="newPromo" class="btn">+ Ny kod</button>
   </div>

   <div id="promoFormArea"></div>

   <table class="table">
    <tr>
     <th>Kod</th>
     <th>Rabatt</th>
     <th>Använda</th>
     <th>Aktiv</th>
     <th>Går ut</th>
     <th></th>
    </tr>

    ${(promos||[]).map(p=>`
     <tr>
      <td><b>${esc(p.code)}</b></td>
      <td>${Number(p.discount_percent)}%</td>
      <td>${p.uses}${p.max_uses===null?'':' / '+p.max_uses}</td>
      <td>${p.active?'🟢':'⚪'}</td>
      <td>
       ${p.expires_at
        ?new Date(p.expires_at).toLocaleDateString('sv-SE')
        :'–'}
      </td>
      <td>
       <button
        class="btn secondary smallbtn editPromo"
        data-id="${p.id}"
       >
        Ändra
       </button>
      </td>
     </tr>
    `).join('')}
   </table>
  </div>

  <div class="panel" style="margin-top:18px">
   <h2>📊 Statistik</h2>

   <div class="grid">
    <div class="card">
     <div class="muted">Ordervärde</div>
     <div class="metric">
      ${money(
       (orders||[])
       .filter(o=>o.status!=='Avbruten')
       .reduce((s,o)=>s+Number(o.total),0)
      )}
     </div>
    </div>

    <div class="card">
     <div class="muted">Genomsnitt/order</div>
     <div class="metric">
      ${money(
       orders?.length
        ?orders.reduce((s,o)=>s+Number(o.total),0)/orders.length
        :0
      )}
     </div>
    </div>

    <div class="card">
     <div class="muted">Lågt lager</div>
     <div class="metric">${low}</div>
    </div>
   </div>
  </div>
 `;

 $('#newProduct').onclick=()=>showProductForm();

 document.querySelectorAll('.editProduct').forEach(b=>{
  b.onclick=()=>showProductForm(
   products.find(p=>String(p.id)===String(b.dataset.id))
  );
 });

 document.querySelectorAll('.stockProduct').forEach(b=>{
  b.onclick=()=>showStockForm(
   products.find(p=>String(p.id)===String(b.dataset.id))
  );
 });

 $('#newService').onclick=()=>showServiceForm(customers||[]);

 document.querySelectorAll('.editService').forEach(b=>{
  b.onclick=()=>showServiceForm(
   customers||[],
   services.find(s=>String(s.id)===String(b.dataset.id))
  );
 });

 $('#newPromo').onclick=()=>showPromoForm();

 document.querySelectorAll('.editPromo').forEach(b=>{
  b.onclick=()=>showPromoForm(
   promos.find(p=>String(p.id)===String(b.dataset.id))
  );
 });

 document.querySelectorAll('.orderStatusSelect').forEach(select=>{
  select.onchange=()=>{
   changeOrderStatus(
    Number(select.dataset.id),
    select.value
   );
  };
 });
}

function showProductForm(p){
 $('#productFormArea').innerHTML=`
  <form id="pf" class="form card">
   <h3>${p?'Ändra':'Ny'} produkt</h3>

   <input
    name="name"
    placeholder="Namn"
    value="${esc(p?.name)}"
    required
   >

   <input
    name="sku"
    placeholder="SKU"
    value="${esc(p?.sku)}"
    required
   >

   <input
    name="category"
    placeholder="Kategori"
    value="${esc(p?.category)}"
   >

   <input
    name="price"
    type="number"
    step="0.01"
    placeholder="Försäljningspris"
    value="${p?.price??0}"
    required
   >

   <input
    name="purchase_price"
    type="number"
    step="0.01"
    placeholder="Inköpspris"
    value="${p?.purchase_price??0}"
   >

   <input
    name="stock"
    type="number"
    placeholder="Lager"
    value="${p?.stock??0}"
   >

   <input
    name="low"
    type="number"
    placeholder="Låglagergräns"
    value="${p?.low_stock_threshold??2}"
   >

   <label>
    <input
     name="active"
     type="checkbox"
     ${p?.active!==false?'checked':''}
    >
    Aktiv
   </label>

   <button class="btn">Spara</button>
  </form>
 `;

 $('#pf').onsubmit=async e=>{
  e.preventDefault();

  let f=new FormData(e.target);

  let obj={
   name:f.get('name'),
   sku:f.get('sku'),
   category:f.get('category'),
   price:Number(f.get('price')),
   purchase_price:Number(f.get('purchase_price')),
   stock:Number(f.get('stock')),
   low_stock_threshold:Number(f.get('low')),
   active:f.get('active')==='on'
  };

  let r=p
   ?await sb.from('products').update(obj).eq('id',p.id)
   :await sb.from('products').insert(obj);

  if(r.error)alert(r.error.message);
  else renderAdmin();
 };
}

function showStockForm(p){
 let n=prompt(
  `Nytt lagerantal för ${p.name}:`,
  p.stock
 );

 if(n!==null){
  sb.from('products')
   .update({stock:Number(n)})
   .eq('id',p.id)
   .then(r=>r.error?alert(r.error.message):renderAdmin());
 }
}

function showServiceForm(customers,p){
 let states=[
  'Inlämnad',
  'Undersökning',
  'Väntar på reservdel',
  'Reparation pågår',
  'Klar',
  'Hämtad'
 ];

 $('#serviceFormArea').innerHTML=`
  <form id="sf" class="form card">
   <h3>${p?'Ändra':'Nytt'} serviceärende</h3>

   <select name="customer" required>
    <option value="">Välj kund</option>

    ${customers.map(c=>`
     <option
      value="${c.id}"
      ${p?.customer_id===c.id?'selected':''}
     >
      ${esc(c.full_name||c.email)}
     </option>
    `).join('')}
   </select>

   <input
    name="device"
    placeholder="Produkt/enhet"
    value="${esc(p?.device)}"
    required
   >

   <textarea
    name="problem"
    placeholder="Felbeskrivning"
   >${esc(p?.problem)}</textarea>

   <input
    name="price"
    type="number"
    step="0.01"
    placeholder="Pris"
    value="${p?.price??0}"
   >

   <select name="status">
    ${states.map(s=>`
     <option ${p?.status===s?'selected':''}>
      ${s}
     </option>
    `).join('')}
   </select>

   <textarea
    name="note"
    placeholder="Anteckningar"
   >${esc(p?.note)}</textarea>

   <button class="btn">Spara</button>
  </form>
 `;

 $('#sf').onsubmit=async e=>{
  e.preventDefault();

  let f=new FormData(e.target);

  let obj={
   customer_id:f.get('customer'),
   device:f.get('device'),
   problem:f.get('problem'),
   price:Number(f.get('price')),
   status:f.get('status'),
   note:f.get('note')
  };

  let r;

  if(p){
   r=await sb
    .from('service_tickets')
    .update(obj)
    .eq('id',p.id);
  }else{
   obj.ticket_no='S-'+Date.now().toString().slice(-8);
   r=await sb
    .from('service_tickets')
    .insert(obj);
  }

  if(r.error)alert(r.error.message);
  else renderAdmin();
 };
}

function showPromoForm(p){
 $('#promoFormArea').innerHTML=`
  <form id="promoForm" class="form card">
   <h3>${p?'Ändra':'Ny'} rabattkod</h3>

   <input
    name="code"
    placeholder="Kod"
    value="${esc(p?.code)}"
    required
   >

   <input
    name="percent"
    type="number"
    min="0"
    max="100"
    step="0.01"
    placeholder="Rabatt %"
    value="${p?.discount_percent??10}"
    required
   >

   <input
    name="max"
    type="number"
    min="0"
    placeholder="Max antal användningar"
    value="${p?.max_uses??''}"
   >

   <input
    name="expires"
    type="date"
    value="${
     p?.expires_at
      ?new Date(p.expires_at).toISOString().slice(0,10)
      :''
    }"
   >

   <label>
    <input
     name="active"
     type="checkbox"
     ${p?.active!==false?'checked':''}
    >
    Aktiv
   </label>

   <button class="btn">Spara</button>
  </form>
 `;

 $('#promoForm').onsubmit=async e=>{
  e.preventDefault();

  let f=new FormData(e.target);

  let obj={
   code:f.get('code').trim().toUpperCase(),
   discount_percent:Number(f.get('percent')),
   max_uses:f.get('max')?Number(f.get('max')):null,
   expires_at:f.get('expires')
    ?new Date(f.get('expires')+'T23:59:59').toISOString()
    :null,
   active:f.get('active')==='on'
  };

  let r=p
   ?await sb.from('promo_codes').update(obj).eq('id',p.id)
   :await sb.from('promo_codes').insert(obj);

  if(r.error)alert(r.error.message);
  else renderAdmin();
 };
}

async function changeOrderStatus(id,next){
 let paymentStatus=
  next==='Bekräftad'||
  next==='Packas'||
  next==='Skickad'||
  next==='Klar'
   ?'Betald'
   :undefined;

 let obj={
  status:next
 };

 if(paymentStatus){
  obj.payment_status=paymentStatus;
 }

 let {error}=await sb
  .from('orders')
  .update(obj)
  .eq('id',id);

 if(error){
  alert(error.message);
 }else{
  renderAdmin();
 }
}

init();
