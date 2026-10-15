"use strict";
const el=id=>document.getElementById(id),c=el("field"),ctx=c.getContext("2d",{alpha:false});
const qs=new URLSearchParams(location.search),valid=n=>Number.isInteger(n)&&n>=0&&n<=4294967295;
const external=Number(qs.get("seed"));let seed=valid(external)&&qs.has("seed")?external:251001;
let nodes=[],play=true,phase=0,then=0,width=0,height=0,values={density:56,tension:58,tempo:36};
if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)play=false;
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
function initialize(){let r=rng(seed),n=Math.round(values.density*.74);nodes=Array.from({length:n},(_,i)=>{let a=r()*Math.PI*2,rad=.06+Math.sqrt(r())*.40;return {x:.5+Math.cos(a)*rad,y:.5+Math.sin(a)*rad,q:r()*6.28,f:.3+r()*2.2,v:.45+r()*.8,size:7+r()*21,steps:2+Math.floor(r()*4),turn:r()>0.5?1:-1};});el("seedLabel").textContent="SEMILLA "+String(seed).padStart(9,"0");history.replaceState(null,"","?seed="+seed+location.hash);draw()}
function resize(){let b=c.getBoundingClientRect();width=Math.max(320,Math.floor(b.width));height=Math.max(300,Math.floor(b.height));let d=Math.min(devicePixelRatio||1,2);c.width=Math.floor(width*d);c.height=Math.floor(height*d);ctx.setTransform(d,0,0,d,0,0);draw()}
function draw(){
 if(!width||!height)return;
 const w=width,h=height,short=Math.min(w,h),t=phase;
 const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,"#112824");grad.addColorStop(1,"#061612");ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
 ctx.save();ctx.translate(w/2,h/2);
 for(let rad=short*.16;rad<short*.66;rad+=short*.15){ctx.beginPath();ctx.arc(0,0,rad,0,Math.PI*2);ctx.strokeStyle="rgba(176,193,164,.07)";ctx.lineWidth=1;ctx.stroke()}
 ctx.restore();
 let pts=nodes.map(n=>({x:(n.x+Math.sin(t*n.v+n.q)*.016)*w,y:(n.y+Math.cos(t*n.f+n.q)*.013)*h,n}));
 const tension=values.tension/100,reach=short*(.12+tension*.20);
 ctx.lineWidth=.7;
 for(let i=0;i<pts.length;i++){for(let j=i+1;j<pts.length;j++){
 const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,dist=Math.hypot(dx,dy);
 if(dist>reach||dist<8)continue;
 let alpha=(1-dist/reach)*(.04+tension*.30)*(0.65+0.35*Math.cos(t*.7+pts[i].n.q));
 ctx.strokeStyle="rgba(225,206,158,"+Math.max(0,alpha).toFixed(3)+")";
 ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.stroke();
 }}
 for(const p of pts){const n=p.n;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(t*.09*n.turn+Math.sin(t*.30+n.q)*.3+n.q);
 ctx.strokeStyle="rgba(231,224,187,"+(0.41+tension*.42).toFixed(2)+")";ctx.lineWidth=1.2;
 ctx.beginPath();let size=n.size*(.72+short/800*.4);
 for(let k=0;k<=n.steps;k++){let a=k/n.steps*Math.PI*(1.4+n.f*.5)+n.q;
 let dist=size*(.28+.32*Math.cos(k*1.72+n.q));
 let x=Math.cos(a)*dist,y=Math.sin(a)*dist;if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
 ctx.stroke();
 ctx.beginPath();ctx.arc(0,0,1.5,0,6.28);ctx.fillStyle="#c5af86";ctx.fill();ctx.restore()}
 ctx.strokeStyle="rgba(217,199,165,.2)";ctx.strokeRect(22,22,w-44,h-44);
 ctx.font="11px monospace";ctx.fillStyle="#a0b8a0";ctx.fillText("M / 001",34,42);ctx.textAlign="right";ctx.fillText("N="+pts.length+" | T="+values.tension+" | S="+seed,w-30,42);ctx.textAlign="left";
}
function loop(ts){if(play){if(then)phase+=(ts-then)/1000*(values.tempo/100*.72);draw();then=ts}else then=0;requestAnimationFrame(loop)}
for(const id of ["density","tension","tempo"]){const e=el(id);e.addEventListener("input",()=>{values[id]=Number(e.value);el(id+"Value").textContent=e.value;if(id==="density")initialize();else draw()})}
el("play").addEventListener("click",()=>{play=!play;then=0;el("play").textContent=play?"⏸ Pausar":"▶ Reanudar";el("renderStatus").textContent=play?"EXPERIMENTO VIVO":"COMPOSICIÓN EN PAUSA"});
el("regenerate").addEventListener("click",()=>{let b=new Uint32Array(1);crypto.getRandomValues(b);seed=b[0];phase=0;initialize();el("announce").textContent="Nueva variación generada con semilla "+seed});
el("reset").addEventListener("click",()=>{values={density:56,tension:58,tempo:36};for(const id of Object.keys(values)){el(id).value=values[id];el(id+"Value").textContent=values[id]}seed=251001;phase=0;initialize();el("announce").textContent="Parámetros originales restablecidos"});
el("download").addEventListener("click",()=>{draw();const a=document.createElement("a");a.href=c.toDataURL("image/png");a.download="Matemenos-001-Glyph-Field-seed-"+seed+".png";a.click();el("announce").textContent="Imagen exportada. Autoría y derechos de reutilización sujetos a la ficha final de obra."});
el("share").addEventListener("click",async()=>{const url=location.href;try{await navigator.clipboard.writeText(url);el("announce").textContent="Enlace reproducible copiado"}catch{el("announce").textContent="Copia la URL de tu navegador para compartir la semilla."}});
addEventListener("resize",resize);initialize();resize();requestAnimationFrame(loop);
