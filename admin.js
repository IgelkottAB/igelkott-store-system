const {createClient}=supabase;
const sb=createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=s=>document.querySelector(s);
async function init(){
 const {data:{session}}=await sb.auth.getSession();
 if(location.pathname.endsWith('/index.html')||location.pathname.endsWith('/')){if(session)location.href='admin.html';else bindLogin();return}
 if(!session){location.href='index.html';return}
 const {data:p,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
 if(error||!['owner','admin','staff'].includes(p.role)){await sb.auth.signOut();location.href='index.html';return}
 $('#who').textContent=`${p.full_name||session.user.email} · ${p.role}`;
 $('#logout').onclick=async()=>{await sb.auth.signOut();location.href='index.html'};
 renderAdmin();
}
function bindLogin(){$('#login').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);let {data,error}=await sb.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});$('#msg').textContent=error?error.message:'Loggar in...';if(!error)location.href='admin.html'}}
async function renderAdmin(){let {data:customers,error}=await sb.from('profiles').select('*').eq('role','customer').order('created_at',{ascending:false});if(error){$('#adminApp').innerHTML=`<div class="card"><h2>Fel</h2><p>${error.message}</p></div>`;return}
let {data:services}=await sb.from('service_tickets').select('*').order('created_at',{ascending:false});
$('#adminApp').innerHTML=`<h1>Butikspanel</h1><div class="grid"><div class="card"><div class="muted">Kunder</div><div class="metric">${customers?.length||0}</div></div><div class="card"><div class="muted">Serviceärenden</div><div class="metric">${services?.length||0}</div></div><div class="card"><div class="muted">Databas</div><div class="metric" style="font-size:20px">🟢 Online</div></div></div>
<div class="panel" style="margin-top:18px"><h2>Kunder</h2><table class="table"><tr><th>Namn</th><th>E-post</th><th>Telefon</th><th>Adress</th></tr>${(customers||[]).map(c=>`<tr><td>${esc(c.full_name)}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td></tr>`).join('')}</table></div>
<div class="panel" style="margin-top:18px"><div class="row"><h2>Service</h2><button id="newService" class="btn">+ Nytt ärende</button></div><table class="table"><tr><th>Ärende</th><th>Kund</th><th>Dator</th><th>Status</th><th></th></tr>${(services||[]).map(s=>{let c=(customers||[]).find(x=>x.id===s.customer_id);return `<tr><td>${esc(s.ticket_no)}</td><td>${esc(c?.full_name||'')}</td><td>${esc(s.device)}</td><td>${esc(s.status)}</td><td><button class="btn secondary edit" data-id="${s.id}">Ändra</button></td></tr>`}).join('')}</table></div>`;
$('#newService').onclick=()=>newService(customers||[]);document.querySelectorAll('.edit').forEach(b=>b.onclick=()=>editService(b.dataset.id,services||[]));
}
function newService(customers){$('#adminApp').insertAdjacentHTML('afterbegin',`<div class="panel"><h2>Nytt serviceärende</h2><form id="ns" class="form"><select name="customer">${customers.map(c=>`<option value="${c.id}">${esc(c.full_name)} – ${esc(c.email)}</option>`).join('')}</select><input name="device" placeholder="Dator/enhet" required><textarea name="problem" placeholder="Problem"></textarea><button class="btn success">Skapa</button></form></div>`);$('#ns').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);let {error}=await sb.from('service_tickets').insert({customer_id:f.get('customer'),device:f.get('device'),problem:f.get('problem'),status:'Inlämnad'});if(error)alert(error.message);else renderAdmin()}}
async function editService(id,list){let s=list.find(x=>String(x.id)===String(id));let states=['Inlämnad','Undersökning','Väntar på reservdel','Reparation pågår','Klar','Hämtad'];$('#adminApp').insertAdjacentHTML('afterbegin',`<div class="panel"><h2>Uppdatera ${esc(s.ticket_no)}</h2><form id="us" class="form"><select name="status">${states.map(x=>`<option ${x===s.status?'selected':''}>${x}</option>`).join('')}</select><textarea name="note" placeholder="Meddelande till kund">${esc(s.note||'')}</textarea><button class="btn success">Spara</button></form></div>`);$('#us').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);let {error}=await sb.from('service_tickets').update({status:f.get('status'),note:f.get('note')}).eq('id',id);if(error)alert(error.message);else renderAdmin()}}
function esc(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
init();