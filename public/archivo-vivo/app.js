"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
let catalog=[],config={};
const legitimate=(link,domains)=>{try{const u=new URL(link);return u.protocol==="https:"&&domains.some(d=>u.hostname===d||u.hostname.endsWith("."+d))?u.href:null}catch{return null}};
function articleHTML(o){return '<article class="story" data-category="'+esc(o.category)+'"><div class="cover '+esc(o.category)+'" aria-hidden="true"><div class="cover-word">'+esc(o.cover)+'</div></div><div class="story-body"><div class="meta">'+esc(o.tag)+' · LECTURA '+esc(o.minutes)+' MIN</div><h3>'+esc(o.title)+'</h3><p>'+esc(o.summary)+'</p><button type="button" data-read="'+esc(o.slug)+'">Leer el adelanto ↗</button></div></article>'}
function draw(filter="all"){const list=catalog.filter(x=>x.status==="public_preview"&&(filter==="all"||x.category===filter));$("contentCards").innerHTML=list.length?list.map(articleHTML).join(""):'<p>Esta sección se está preparando.</p>';document.querySelectorAll("[data-read]").forEach(b=>b.addEventListener("click",()=>read(b.dataset.read)))}
function read(slug){const o=catalog.find(x=>x.slug===slug&&x.status==="public_preview");if(!o)return;$("modalTitle").textContent=o.title;$("modalCategory").textContent=o.tag;
$("modalBody").replaceChildren();(o.preview||[]).forEach(p=>{const n=document.createElement("p");n.textContent=p;$("modalBody").append(n)});
$("articleModal").classList.remove("hidden");$("closeModal").focus()}
const close=id=>$(id).classList.add("hidden");
function configure(){
 const kofi=legitimate(config.kofi_url,["ko-fi.com"]);
 if(kofi){const b=$("shopButton");b.disabled=false;b.textContent="Acceder a la tienda de Ko-fi ↗";b.onclick=()=>window.open(kofi,"_blank","noopener,noreferrer")}
 const p=legitimate(config.paypal_business_link,["paypal.com","paypal.me"]);
 if(p){const b=$("paypalButton");b.href=p;b.classList.remove("disabled");b.removeAttribute("aria-disabled");b.textContent="Ir al pago seguro PayPal ↗";b.target="_blank";b.rel="noopener noreferrer"}
 const svc=legitimate(config.service_booking_url,["ko-fi.com","paypal.com","paypal.me"]);
 if(svc){const b=$("serviceButton");b.disabled=false;b.textContent="Reservar servicio ↗";b.onclick=()=>window.open(svc,"_blank","noopener,noreferrer")}
 const phone=String(config.plin_number||"").replace(/\s/g,"");
 if(/^9\d{8}$/.test(phone)&&config.plin_confirmed===true){
   const el=$("plinContent");el.replaceChildren();
   let a=document.createElement("p");a.textContent="Número afiliado a Plin: ";let strong=document.createElement("strong");strong.textContent=phone;a.append(strong);el.append(a);
   const ol=document.createElement("ol");
   for(const t of ["Abre Plin o Yape en tu banco y selecciona enviar por número.","Introduce el número mostrado y comprueba el nombre real del destinatario antes de pagar.","Introduce exactamente el importe de tu pedido y un concepto reconocible.","Conserva el identificador bancario. La entrega requiere confirmación del abono por el vendedor."]){let li=document.createElement("li");li.textContent=t;ol.append(li)}
   el.append(ol);
 }
 $("videoCards").innerHTML=catalog.filter(x=>x.status==="public_preview").map(o=>'<a href="assets/'+esc(o.slug)+'-teaser.mp4" target="_blank" rel="noopener noreferrer">Ver avance '+esc(o.video_index)+' ▶</a>').join("");
}
function makeTicket(){
 const kind=$("concept").value;
 const name=$("buyer").value.trim().replace(/\s+/g," ").slice(0,70);
 const product=kind==="clase"?"Clase particular de IA (1 h)":"Consulta editorial (presupuesto por confirmar)";
 const price=kind==="clase"?"S/ 35.00":"A cotizar — no efectuar pagos todavía";
 const d=new Date(),date=d.toLocaleString("es-PE",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Lima"});
 const rand=new Uint32Array(2);
 if(window.crypto&&crypto.getRandomValues){crypto.getRandomValues(rand)}else{alert("Navegador sin seguridad para tickets. Actualiza tu navegador.");return}
 const code="AV-"+d.toISOString().slice(0,10).replace(/-/g,"")+"-"+[...rand].map(x=>x.toString(36).toUpperCase().padStart(7,"0")).join("").slice(0,12);
 const rows=[["Identificador",code],["Emitido",date+" (Lima)"],["Estado","PENDIENTE / SIN PAGO"],["Concepto",product],["Precio",price],["Solicitante",name||"No indicado"],["Medio de pago","A elegir; ninguna transacción iniciada"]];
 $("ticketBody").replaceChildren();const dl=document.createElement("dl");for(const [k,v]of rows){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v;dl.append(dt,dd)}$("ticketBody").append(dl);
 $("ticketModal").classList.remove("hidden");
 // No checkout activation, no paid receipt, and no personal data sent to server.
}
async function init(){
 try{
   const [r,c]=await Promise.all([fetch("catalog.json",{cache:"no-store"}),fetch("config.json",{cache:"no-store"})]);
   if(!r.ok||!c.ok)throw new Error("Catálogo o configuración no disponibles");
   catalog=await r.json();config=await c.json();draw();configure();
 }catch(e){$("contentCards").textContent="El catálogo está en revisión. No se aceptan pedidos por esta página hasta recuperar la configuración."}
 document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");draw(b.dataset.filter)}));
 $("closeModal").addEventListener("click",()=>close("articleModal"));
 $("closeTicket").addEventListener("click",()=>close("ticketModal"));
 $("articleModal").addEventListener("click",e=>{if(e.target===$("articleModal"))close("articleModal")});
 $("ticketModal").addEventListener("click",e=>{if(e.target===$("ticketModal"))close("ticketModal")});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){close("articleModal");close("ticketModal")}});
 $("ticketButton").addEventListener("click",makeTicket);
}
document.addEventListener("DOMContentLoaded",init);
