/* ============================================================
   EASY DR – VEXIS GROUP — app do aluno (estático + Supabase)
   - Login na nuvem se o Supabase estiver configurado (config.js)
   - Sem config => "modo local" (salva só neste navegador)
   ============================================================ */
(function(){
"use strict";
const CFG = window.APP_CONFIG || {};
const cloud = (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase)
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
  : null;
const LKEY = "rodar_br_state_v1";
const $ = id => document.getElementById(id);
let user = null, state = defaultState(), saveTimer = null;

function defaultState(){
  return {
    guide: { done:{}, data:{}, model:"", active:0 },
    dash:  { cur:"R$", roiTarget:30, cpaMax:0, accounts:[], campaigns:[], seeded:false }
  };
}
function mergeDefault(o){ const d=defaultState(); o=o||{}; return { guide:Object.assign(d.guide,o.guide||{}), dash:Object.assign(d.dash,o.dash||{}) }; }
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function uid(){ return Math.random().toString(36).slice(2,9); }
function copyText(v,btn){
  const ok=()=>{ const o=btn.textContent; btn.textContent="Copiado ✓"; btn.classList.add("ok"); setTimeout(()=>{btn.textContent=o;btn.classList.remove("ok");},1400); };
  if(navigator.clipboard && v){ navigator.clipboard.writeText(v).then(ok).catch(()=>fb(v,ok)); } else fb(v,ok);
}
function fb(v,cb){ const t=document.createElement("textarea"); t.value=v; document.body.appendChild(t); t.select(); try{document.execCommand("copy");}catch(e){} t.remove(); cb&&cb(); }

/* ---------- persistência ---------- */
function loadLocal(){ try{ const s=localStorage.getItem(LKEY); if(s) return JSON.parse(s); }catch(e){} return null; }
function saveLocal(){ try{ localStorage.setItem(LKEY, JSON.stringify(state)); }catch(e){} }
function persist(){
  saveLocal();
  if(cloud && user){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=>{ cloud.from("app_state").upsert({ user_id:user.id, data:state }, {onConflict:"user_id"}).then(()=>{},()=>{}); }, 600);
  }
}
async function loadState(){
  const local = loadLocal(); if(local) state = mergeDefault(local);
  if(cloud && user){
    try{
      const { data, error } = await cloud.from("app_state").select("data").eq("user_id", user.id).maybeSingle();
      if(!error && data && data.data){ state = mergeDefault(data.data); saveLocal(); }
    }catch(e){}
  }
}

/* ============================================================
   AUTENTICAÇÃO
   ============================================================ */
let mode = "signin";
function setMsg(t,kind){ const m=$("authMsg"); m.textContent=t||""; m.className="authmsg"+(t?(" "+kind):""); }
function applyMode(){
  $("authTitle").textContent = mode==="signin" ? "Entrar na sua conta" : "Criar sua conta";
  $("authBtn").textContent   = mode==="signin" ? "Entrar" : "Criar conta";
  $("password").autocomplete = mode==="signin" ? "current-password" : "new-password";
  $("authSwitch").innerHTML  = mode==="signin"
    ? 'Ainda não tem conta? <a id="toSignup">Criar conta</a>'
    : 'Já tem conta? <a id="toSignup">Entrar</a>';
  $("toSignup").onclick = ()=>{ mode = mode==="signin"?"signup":"signin"; setMsg(""); applyMode(); };
}
async function doAuth(){
  const email=$("email").value.trim(), pass=$("password").value;
  if(!email || pass.length<6){ setMsg("Informe e-mail e senha (mín. 6 caracteres).","err"); return; }
  $("authBtn").disabled=true;
  try{
    if(mode==="signin"){
      const { data, error } = await cloud.auth.signInWithPassword({ email, password:pass });
      if(error){ setMsg(traduz(error.message),"err"); return; }
      user = data.user; await enterApp();
    } else {
      const { data, error } = await cloud.auth.signUp({ email, password:pass });
      if(error){ setMsg(traduz(error.message),"err"); return; }
      if(data.session){ user=data.user; await enterApp(); }
      else setMsg("Conta criada! Confirme o e-mail (se exigido) e faça login.","ok");
    }
  } finally { $("authBtn").disabled=false; }
}
function traduz(m){
  m=(m||"").toLowerCase();
  if(m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if(m.includes("already registered")||m.includes("already exists")) return "Esse e-mail já tem conta. Faça login.";
  if(m.includes("password")) return "Senha fraca: use 6+ caracteres.";
  return "Não deu certo. Tente de novo.";
}
function showAuth(){
  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
  applyMode();
  $("authBtn").onclick = doAuth;
  $("password").onkeydown = e=>{ if(e.key==="Enter") doAuth(); };
}
async function enterApp(){
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  await loadState();
  if(cloud && user){
    $("userEmail").textContent = user.email || "";
    $("signOut").classList.remove("hidden");
    const mb=$("modeBar"); mb.className="modebar cloud"; mb.textContent="☁️ Conectado à nuvem — seus dados sincronizam em qualquer aparelho.";
  } else {
    $("userEmail").textContent = "";
    $("signOut").classList.add("hidden");
    const mb=$("modeBar"); mb.className="modebar local"; mb.textContent="💾 Modo local — os dados ficam só neste navegador. Configure o Supabase (config.js) para login na nuvem.";
  }
  $("signOut").onclick = async ()=>{ if(cloud){ try{ await cloud.auth.signOut(); }catch(e){} } user=null; location.reload(); };
  Tabs.init(); Guide.render();
}
async function boot(){
  if(cloud){
    try{ const { data } = await cloud.auth.getSession(); if(data.session){ user=data.session.user; await enterApp(); return; } }catch(e){}
    showAuth();
  } else {
    await enterApp(); // modo local: entra direto
  }
}

/* ============================================================
   TABS  (Dashboard escondido por enquanto — foco no Guia)
   ============================================================ */
const Tabs = (function(){
  const START_HTML = `<div style="max-width:760px;margin:0 auto;padding:4px 0">
    <h2 style="font-size:20px;margin:0 0 6px">Comece aqui: instale a skill EASY DR</h2>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 14px">Pra eu (o Claude) montar suas ofertas com o passo a passo certo, você instala a skill <b>EASY DR</b> no seu Claude (Cowork) <b>uma vez</b>. Leva 1 minuto. Depois é só preencher a oferta no Guia e clicar em <b>🚀 Subir a oferta</b>.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px">
      <a href="easy-dr.skill" download style="display:inline-block;background:#13a892;color:#fff;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px">⬇️ Baixar a skill (.skill)</a>
      <a href="guia-instalar-skill.pdf" target="_blank" rel="noopener" style="display:inline-block;background:#eef2ff;color:#3730a3;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px;border:1px solid #c7d2fe">📄 Abrir o guia de instalação (PDF)</a>
    </div>
    <div style="background:rgba(19,168,146,.12);border-left:3px solid #13a892;color:#0e7d6f;padding:10px 12px;border-radius:8px;font-size:13px;line-height:1.7">
      <b>Rápido:</b> 1) Baixe a skill · 2) abra o seu Claude · 3) anexe o <b>easy-dr.skill</b> no chat · 4) clique em <b>"Save skill"</b> · 5) pronto — volte no Guia e use o <b>🚀 Subir a oferta</b>.<br>O guia em PDF tem o passo a passo com as telas.
    </div>
  </div>`;
  function init(){
    const tabsbar=document.querySelector(".tabs");
    if(tabsbar && !document.querySelector('.tab[data-tab="start"]')){
      const sb=document.createElement("button"); sb.className="tab"; sb.setAttribute("data-tab","start"); sb.textContent="📦 Comece aqui";
      tabsbar.insertBefore(sb, tabsbar.firstChild);
    }
    const guideV=$("guideView");
    if(guideV && guideV.parentNode && !$("startView")){
      const sv=document.createElement("div"); sv.id="startView"; sv.className="hidden"; sv.innerHTML=START_HTML;
      guideV.parentNode.insertBefore(sv, guideV);
    }
    const dtab=document.querySelector('.tab[data-tab="dash"]'); if(dtab) dtab.style.display="none";
    const dview=$("dashView"); if(dview) dview.classList.add("hidden");
    const gtab=document.querySelector('.tab[data-tab="guide"]'); if(gtab) gtab.classList.add("active");
    document.querySelectorAll(".tab").forEach(b=>{
      b.onclick = ()=>{
        document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        const t=b.dataset.tab;
        $("guideView").classList.toggle("hidden", t!=="guide");
        const dv=$("dashView"); if(dv) dv.classList.toggle("hidden", t!=="dash");
        const sv=$("startView"); if(sv) sv.classList.toggle("hidden", t!=="start");
      };
    });
  }
  return { init };
})();

/* ============================================================
   GUIA (passos) — fluxo de subir oferta
   ============================================================ */
const Guide = (function(){
  const PRODOC="https://docs.google.com/document/d/1PjfnZpaAzyWWiiSojdhCyp4HCKGbC69_qqzzm_XFG3U/edit?usp=sharing";
  // Catálogo da doc do produtor (links de venda + script de conversão por produto). O aff_id é seu — o app cola no fim de cada link.
  const CATALOG=[
{name:"Neurosalt",account_id:"12343",cn2:"PP_NST2UNITS_AFF",cn3:"PP_NST3UNITS_AFF",cn6:"PP_NST6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12343&product_codename=PP_NST2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL25zdC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12343&product_codename=PP_NST3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL25zdC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12343&product_codename=PP_NST6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL25zdC1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12343&t=b3d0fd06130bd594b8c86a268643319d&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Nerve Alive",account_id:"10762",cn2:"PP_NVA2UNITS_AFF",cn3:"PP_NVA3UNITS_AFF",cn6:"PP_NVA6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=10762&product_codename=PP_NVA2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL252YS1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=10762&product_codename=PP_NVA3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL252YS1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=10762&product_codename=PP_NVA6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL252YS1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=10762&t=09fa15c03cd29c2712d13f3f905a7017&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Gelatide",account_id:"12278",cn2:"PP_GLT2UNITS_AFF",cn3:"PP_GLT3UNITS_AFF",cn6:"PP_GLT6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12278&product_codename=PP_GLT2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dsdC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12278&product_codename=PP_GLT3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dsdC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12278&product_codename=PP_GLT6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dsdC1hZmYtYnV5LXVwMS1meDI=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12278&t=432bffe2125734e094720e426c4a5eb9&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Glycopezil",account_id:"12281",cn2:"PP_GPZ2UNITS_AFF",cn3:"PP_GPZ3UNITS_AFF",cn6:"PP_GPZ6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12281&product_codename=PP_GPZ2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dwei1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12281&product_codename=PP_GPZ3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dwei1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12281&product_codename=PP_GPZ6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dwei1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12281&t=55be639cd2e0995d1163edb1a4b6bc70&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Memopezil",account_id:"12340",cn2:"PP_MMP2UNITS_AFF",cn3:"PP_MMP3UNITS_AFF",cn6:"PP_MMP6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12340&product_codename=PP_MMP2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL21tcC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12340&product_codename=PP_MMP3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL21tcC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12340&product_codename=PP_MMP6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL21tcC1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12340&t=26c1ede9725adf100c34d8e9f3b0db6b&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Glyco Harmony",account_id:"12374",cn2:"PP_GHY2UNITS_AFF",cn3:"PP_GHY3UNITS_AFF",cn6:"PP_GHY6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12374&product_codename=PP_GHY2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2doeS1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12374&product_codename=PP_GHY3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2doeS1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12374&product_codename=PP_GHY6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2doeS1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12374&t=6ea517007b32b1d2a2d38802c0bbcd55&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Vapofil",account_id:"12308",cn2:"PP_VPF2UNITS_AFF",cn3:"PP_VPF3UNITS_AFF",cn6:"PP_VPF6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12308&product_codename=PP_VPF2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3ZwZi1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12308&product_codename=PP_VPF3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3ZwZi1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12308&product_codename=PP_VPF6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3ZwZi1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12308&t=fa1ddb12f5e0bdbc570b8695b11b0c07&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Gelatine Sculpt",account_id:"12063",cn2:"gel2",cn3:"gel3",cn6:"gel6",link2:"https://buygoods.com/secure/checkout.html?account_id=12063&product_codename=gel2&redirect=aHR0cHM6Ly9nZWxhdGluZXNjdWxwdC5jb20vZ3N0LXVwMS1idXktYWZmLw%3D%3D",link3:"https://buygoods.com/secure/checkout.html?account_id=12063&product_codename=gel3&redirect=aHR0cHM6Ly9nZWxhdGluZXNjdWxwdC5jb20vZ3N0LXVwMS1idXktYWZmLw%3D%3D",link6:"https://buygoods.com/secure/checkout.html?account_id=12063&product_codename=gel6&redirect=aHR0cHM6Ly9nZWxhdGluZXNjdWxwdC5jb20vZ3N0LXVwMS1idXktYWZmLw%3D%3D",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12063&t=9963b24e9f0977d54c552faab680fe4b&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Derma essential",account_id:"12311",cn2:"PP_DEL2UNITS_AFF",cn3:"PP_DEL3UNITS_AFF",cn6:"PP_DEL6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12311&product_codename=PP_DEL2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2RlbC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12311&product_codename=PP_DEL3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2RlbC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12311&product_codename=PP_DEL6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2RlbC1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12311&t=f22168b5483b44631b9ad7be3869534b&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Clean Eye",account_id:"11583",cn2:"PP_CLE2UNITS_AFF",cn3:"PP_CLE3UNITS_AFF",cn6:"PP_CLE6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?&account_id=11583&product_codename=PP_CLE2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2NsZS1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?&account_id=11583&product_codename=PP_CLE3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2NsZS1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?&account_id=11583&product_codename=PP_CLE6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2NsZS1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=11583&t=b96d1b39a5fd2d92a03329030f08c44c&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Gelatide Cápsulas",account_id:"12306",cn2:"PP_C_GT2UNITS_AFF",cn3:"PP_C_GT3UNITS_AFF",cn6:"PP_C_GT6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12306&product_codename=PP_C_GT2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2MtZ3QtYWZmLWJ1eS11cDEv",link3:"https://buygoods.com/secure/checkout.html?account_id=12306&product_codename=PP_C_GT3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2MtZ3QtYWZmLWJ1eS11cDEv",link6:"https://buygoods.com/secure/checkout.html?account_id=12306&product_codename=PP_C_GT6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2MtZ3QtYWZmLWJ1eS11cDEv",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12306&t=72779af4448a17f759e670cdf6392b8b&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Sonus Zen",account_id:"11479",cn2:"PP_SNZ2UNITS_AFF",cn3:"PP_SNZ3UNITS_AFF",cn6:"PP_SNZ6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=11479&product_codename=PP_SNZ2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3Nuei1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=11479&product_codename=PP_SNZ3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3Nuei1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=11479&product_codename=PP_SNZ6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3Nuei1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=11479&t=d1b12595f394d75ace6a28efa15d8436&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Gluco Control",account_id:"10214",cn2:"PP_GLC2UNITS_AFF",cn3:"PP_GLC3UNITS_AFF",cn6:"PP_GLC6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?&account_id=10214&product_codename=PP_GLC2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dsYy11cDEtYnV5LWFmZi8=",link3:"https://buygoods.com/secure/checkout.html?&account_id=10214&product_codename=PP_GLC3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dsYy11cDEtYnV5LWFmZi8=",link6:"https://buygoods.com/secure/checkout.html?&account_id=10214&product_codename=PP_GLC6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dsYy11cDEtYnV5LWFmZi8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=10214&t=b88dcd834cb3449602475e0213896aa5&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Flexi Move",account_id:"12082",cn2:"PP_FLM2UNITS_AFF",cn3:"PP_FLM3UNITS_AFF",cn6:"PP_FLM6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12082&product_codename=PP_FLM2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2ZsbS1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12082&product_codename=PP_FLM3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2ZsbS1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12082&product_codename=PP_FLM6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2ZsbS1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12082&t=e12853ea64afd943d8e2006bace8e24d&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"FitBurn",account_id:"11300",cn2:"PP_FTB2UNITS_AFF",cn3:"PP_FTB3UNITS_AFF",cn6:"PP_FTB6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?&account_id=11300&product_codename=PP_FTB2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2Z0Yi1hZmYtYnV5LXVwMS1meDI=",link3:"https://buygoods.com/secure/checkout.html?&account_id=11300&product_codename=PP_FTB3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2Z0Yi1hZmYtYnV5LXVwMS1meDI=",link6:"https://buygoods.com/secure/checkout.html?&account_id=11300&product_codename=PP_FTB6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2Z0Yi1hZmYtYnV5LXVwMS1meDI=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=11300&t=5a004a792e991de86a7665a606134f30&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Vigor Boost",account_id:"11749",cn2:"PP_VGB2UNITS_AFF",cn3:"PP_VGB3UNITS_AFF",cn6:"PP_VGB6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=11749&product_codename=PP_VGB2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3ZnYi1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=11749&product_codename=PP_VGB3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3ZnYi1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=11749&product_codename=PP_VGB6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3ZnYi1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=11749&t=2b97adea74685984c16eab7b717e75e1&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"PrimeAge",account_id:"11280",cn2:"PP_PMA2UNITS_AFF",cn3:"PP_PMA3UNITS_AFF",cn6:"PP_PMA6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=11280&product_codename=PP_PMA2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3BtYS1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=11280&product_codename=PP_PMA3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3BtYS1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=11280&product_codename=PP_PMA6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3BtYS1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=11280&t=6e78fc3f6cec7471140cab5d009a6414&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Jellytide",account_id:"12446",cn2:"PP_JYT2UNITS_AFF",cn3:"PP_JYT3UNITS_AFF",cn6:"PP_JYT6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?&account_id=12446&product_codename=PP_JYT2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2p5dC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?&account_id=12446&product_codename=PP_JYT3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2p5dC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?&account_id=12446&product_codename=PP_JYT6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2p5dC1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12446&t=798b06153881c0a93517f4d2eb4185af&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"GlycoTide",account_id:"12445",cn2:"PP_GTD2UNITS_AFF",cn3:"PP_GTD3UNITS_AFF",cn6:"PP_GTD6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12445&product_codename=PP_GTD2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2d0ZC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12445&product_codename=PP_GTD3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2d0ZC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12445&product_codename=PP_GTD6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2d0ZC1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12445&t=e4c0ebc75c2ae5d223db1bcc0d1526ba&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Neurozen",account_id:"12447",cn2:"PP_NZN2UNITS_AFF",cn3:"PP_NZN3UNITS_AFF",cn6:"PP_NZN6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12447&product_codename=PP_NZN2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL256bi1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12447&product_codename=PP_NZN3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL256bi1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12447&product_codename=PP_NZN6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL256bi1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12447&t=2a5170c11bb42ae8a5413a2057172918&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Men's Growth",account_id:"10016",cn2:"PP_MG2UNITS_AFF",cn3:"PP_MG3UNITS_AFF",cn6:"PP_MG6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=10016&product_codename=PP_MG2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL21nLWFmZi1idXktdXAxLw=",link3:"https://buygoods.com/secure/checkout.html?&account_id=10016&product_codename=PP_MG3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL21nLWFmZi1idXktdXAxLw=",link6:"https://buygoods.com/secure/checkout.html?account_id=10016&product_codename=PP_MG6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL21nLWFmZi1idXktdXAxLw=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=10016&t=f4fc646445123550943df745a6aa953d&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Prostate Max",account_id:"11100",cn2:"PP_PRT2UNITS_AFF",cn3:"PP_PRT3UNITS_AFF",cn6:"PP_PRT6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=11100&product_codename=PP_PRT2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3BydC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=11100&product_codename=PP_PRT3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3BydC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=11100&product_codename=PP_PRT6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3BydC1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=11100&t=b3fdf7bff514e97287a6a94f57e56441&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"BloodPril",account_id:"12425",cn2:"PP_BDP2UNITS_AFF",cn3:"PP_BDP3UNITS_AFF",cn6:"PP_BDP6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12425&product_codename=PP_BDP2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2JkcC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12425&product_codename=PP_BDP3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2JkcC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12425&product_codename=PP_BDP6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2JkcC1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12425&t=9967a50dd228f4f28f8b2290817d09cb&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Javatide",account_id:"12439",cn2:"PP_JVT2UNITS_AFF",cn3:"PP_JVT3UNITS_AFF",cn6:"PP_JVT6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12439&product_codename=PP_JVT2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2p2dC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12439&product_codename=PP_JVT3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2p2dC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12439&product_codename=PP_JVT6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2p2dC1hZmYtYnV5LXVwMS1meDI=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12439&t=4f4489dd02954f6fee49d9301d52abb3&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Derma Pure",account_id:"12505",cn2:"PP_DMP2UNITS_AFF",cn3:"PP_DMP3UNITS_AFF",cn6:"PP_DMP6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12505&product_codename=PP_DMP2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2RtcC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12505&product_codename=PP_DMP3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2RtcC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12505&product_codename=PP_DMP6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2RtcC1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12505&t=6ce4ec8486209ed9b1e203e018f3bd0a&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Gumitide",account_id:"12512",cn2:"PP_GMT2UNITS_AFF",cn3:"PP_GMT3UNITS_AFF",cn6:"PP_GMT6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12512&product_codename=PP_GMT2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dtdC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12512&product_codename=PP_GMT3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dtdC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12512&product_codename=PP_GMT6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2dtdC1hZmYtYnV5LXVwMS1meDI=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12512&t=3f21a068506f8f5ad9453e583e3b64e2&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"SlimTide",account_id:"12501",cn2:"PP_SLT2UNITS_AFF",cn3:"PP_SLT3UNITS_AFF",cn6:"PP_SLT6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12501&product_codename=PP_SLT2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3NsdC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12501&product_codename=PP_SLT3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3NsdC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12501&product_codename=PP_SLT6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL3NsdC1hZmYtYnV5LXVwMS1meDI=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12501&t=b41f2d52b731d284c53197aada03e0ad&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Flash Burn",account_id:"10666",cn2:"PP_FLB2UNITS_AFF",cn3:"PP_FLB3UNITS_AFF",cn6:"PP_FLB6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=10666&product_codename=PP_FLB2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2ZsYi1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=10666&product_codename=PP_FLB3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2ZsYi1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=10666&product_codename=PP_FLB6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2ZsYi1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=10666&t=796b68b29e9a8c1ca810e271c2d16e34&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Lean Burn Drops",account_id:"12386",cn2:"PP_LBD2UNITS_AFF",cn3:"PP_LBD3UNITS_AFF",cn6:"PP_LBD6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12386&product_codename=PP_LBD2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2xiZC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12386&product_codename=PP_LBD3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2xiZC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12386&product_codename=PP_LBD6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2xiZC1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12386&t=d83fac08e46178b2712b0f8a0cdc280a&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"LipoFlow",account_id:"11966",cn2:"PP_LPF2UNITS_AFF",cn3:"PP_LPF3UNITS_AFF",cn6:"PP_LPF6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=11966&product_codename=PP_LPF2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2xwZi1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=11966&product_codename=PP_LPF3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2xwZi1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=11966&product_codename=PP_LPF6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2xwZi1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=11966&t=36138f55f869dfa6de726e3e50149194&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"Horse boost",account_id:"12661",cn2:"PP_HSB2UNITS_AFF",cn3:"PP_HSB3UNITS_AFF",cn6:"PP_HSB6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12661&product_codename=PP_HSB2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2hzYi1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12661&product_codename=PP_HSB3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2hzYi1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12661&product_codename=PP_HSB6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL2hzYi1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12661&t=c2be18cfc43eeda55d53cc59ab6ef117&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"},
{name:"MemoCept",account_id:"12742",cn2:"PP_MMT2UNITS_AFF",cn3:"PP_MMT3UNITS_AFF",cn6:"PP_MMT6UNITS_AFF",link2:"https://buygoods.com/secure/checkout.html?account_id=12742&product_codename=PP_MMT2UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL21tdC1hZmYtYnV5LXVwMS8=",link3:"https://buygoods.com/secure/checkout.html?account_id=12742&product_codename=PP_MMT3UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL21tdC1hZmYtYnV5LXVwMS8=",link6:"https://buygoods.com/secure/checkout.html?account_id=12742&product_codename=PP_MMT6UNITS_AFF&redirect=aHR0cHM6Ly9pbXByb3ZpbmdvdXJoZWFsdGguY29tL21tdC1hZmYtYnV5LXVwMS8=",conv:"<script type=\"text/javascript\">setTimeout(function () {var i = document.createElement(\"iframe\"),oid = new URLSearchParams(window.location.search);i.async = true;i.style=\"display:none\";i.setAttribute(\"src\", \"https://buygoods.com/affiliates/go/conversion/iframe/bg?a=12742&t=83b83587cc69862c34106dfbda79df66&s=\"+ReadCookie('sessid2'));document.body.appendChild(i);}, 1000);<\/script>"}
  ];

  const STEPS = [
    { id:"s1", title:"Produto + seu aff_id", short:"Produto",
      what:"Escolha o produto na lista e cole o SEU aff_id (pega na BuyGoods). O app já monta os 3 links de venda + os scripts da página COM o seu aff_id — você não copia nada da doc à mão.",
      links:[{l:"BuyGoods (Affiliate Hub)",u:"https://backoffice.buygoods.com/campaigns"},{l:"📄 Doc do produtor",u:PRODOC}],
      fields:[
        {id:"produto",type:"select",label:"Produto (lista da doc do produtor)"},
        {id:"aff_id",label:"Seu aff_id (BuyGoods) — É POR PRODUTO",ph:"Ex.: 68398",help:"BuyGoods → Dashboard do produto → Your Affiliate Links: é o ?aff_id=… do SEU link. ⚠️ Muda por produto — sem ele a venda NÃO marca.",helpTone:"red",shot:"print-afflink.png"},
        {id:"bg_rt",label:"RT script — Funnel Pixels → Checkout (marca o IC)",ph:"Settings → Funnel pixels → campo Checkout",ml:true,help:"BuyGoods → produto → Settings → Funnel pixels → campo Checkout. Se vazio, copie de um produto SEU que já marca.",helpAnchor:"#profile/funnelsnippet",helpLabel:"Abrir Funnel pixels ↗",shot:"print-funnelpixels.png"}
      ], gen:true,
      why:"Os links de venda e o script de conversão saem da doc; o aff_id é seu e o app cola no fim de cada link. Sem aff_id certo, a venda não cai pra você." },
    { id:"s2", title:"Comprar um domínio próprio", short:"Domínio",
      what:"Põe o domínio que você pensou — ou deixe em branco que o Claude sugere um do nicho. O Claude monta a compra na Hostinger e PARA no pagamento (você paga).",
      links:[{l:"Hostinger",u:"https://www.hostinger.com.br"}],
      fields:[{id:"dominio",label:"Domínio que você pensou (ou deixe vazio — o Claude sugere)",ph:"Ex.: minhaoferta.shop (ou deixe em branco)"}],
      why:"O domínio é o endereço que a pessoa abre ao clicar no anúncio." },
    { id:"s4", title:"Página da VSL — o Claude gera e hospeda", short:"Página (Claude faz)",
      what:"O Claude CONSTRÓI a página no estilo Amanda Khayat (agressivo) — headline forte + comentários do Facebook (prova social) — e já hospeda. Você só dá o ângulo e as fotos dos kits.",
      links:[],
      fields:[{id:"angulo",label:"Ângulo / promessa da página",ph:"Ex.: secar a barriga em 21 dias"},{id:"kitimg2",label:"Foto do kit — 2 unidades (link da imagem)",ph:"Cole o link da imagem (ou me manda a foto no chat)"},{id:"kitimg3",label:"Foto do kit — 3 unidades (link da imagem)",ph:"Cole o link da imagem (ou me manda a foto no chat)"},{id:"kitimg6",label:"Foto do kit — 6 unidades (link da imagem)",ph:"Cole o link da imagem (ou me manda a foto no chat)"}],
      ask:"Constrói a página da VSL no estilo Amanda Khayat (MODO AGRESSIVO): headline/lead forte, copy no ritmo de dopamina e os COMENTÁRIOS do Facebook (prova social). Usa as fotos dos kits 2/3/6 nos boxes, embarca o player da VSL e revela os botões no pitch. Depois hospeda no meu domínio.",
      why:"A headline agressiva e os comentários do Facebook fazem o trabalho pesado de converter." },
    { id:"s6", title:"VSL — subir o vídeo (VTurb)", short:"Vídeo (VTurb)",
      what:"Suba o ARQUIVO da VSL (é grande): cole um link de download (Drive/Dropbox) ou me mande no chat. E diga o Pitch (MM:SS). O Claude sobe no VTurb e pega o embed.",
      links:[{l:"VTurb",u:"https://vturb.com.br"}],
      fields:[{id:"vslfile",label:"Arquivo da VSL — link de download (Drive/Dropbox) ou manda no chat",ph:"Cole o link do vídeo (ou diga que vai mandar no chat)",ml:true},{id:"pitch",label:"⭐ Pitch da VSL (MM:SS) — minuto da oferta",ph:"Assista a VSL até aparecer o preço/oferta e anote o minuto:segundo (ex.: 12:34)"}],
      why:"O Pitch (MM:SS) é o minuto em que a oferta aparece — é nele que a página revela os botões 2/3/6. Acertar isso é alavanca de conversão." }
  ];

  let g;
  function root(){ return $("guideView"); }
  function countDone(){ return STEPS.filter(s=>g.done[s.id]).length; }
  function prod(){ const n=(g.data.produto||""); for(var i=0;i<CATALOG.length;i++){ if(CATALOG[i].name===n) return CATALOG[i]; } return null; }
  function aff(){ return (g.data.aff_id||"").trim(); }
  function withAff(link){ if(!link) return ""; return aff()? (link+"&aff_id="+encodeURIComponent(aff())) : link; }

  function fieldHTML(f){
    const v=(g.data[f.id]||"");
    let inp;
    if(f.type==="select"){
      let opts='<option value="">— escolha o produto —</option>';
      CATALOG.forEach(p=>{ opts+='<option'+(v===p.name?' selected':'')+'>'+esc(p.name)+'</option>'; });
      inp='<select data-f="'+f.id+'" style="width:100%;padding:9px;border:1px solid #ccc;border-radius:8px;font-size:14px">'+opts+'</select>';
    } else if(f.ml){
      inp=`<textarea rows="2" data-f="${f.id}" placeholder="${f.ph||''}">${esc(v)}</textarea>`;
    } else {
      inp=`<input type="text" data-f="${f.id}" value="${esc(v)}" placeholder="${f.ph||''}">`;
    }
    let help="";
    if(f.help){
      const red=(f.helpTone==="red"||f.id==="aff_id");
      const box=red
        ? "background:rgba(220,38,38,.09);border-left:3px solid var(--red,#dc2626);color:#b42318"
        : "background:rgba(19,168,146,.12);border-left:3px solid var(--green,#13a892);color:#0e7d6f";
      const acc=(prod()?prod().account_id:"");
      const prodUrl=acc?("https://backoffice.buygoods.com/?a="+encodeURIComponent(acc)):"https://backoffice.buygoods.com/campaigns";
      const url=f.helpUrl||(prodUrl+(f.helpAnchor||""));
      const lbl=f.helpLabel||(acc?("Abrir o produto ("+acc+") ↗"):"Abrir BuyGoods ↗");
      const lnk=` <a href="${url}" target="_blank" rel="noopener" style="color:inherit;font-weight:700;text-decoration:underline">${lbl}</a>`;
      help=`<div class="fhelp" style="${box};padding:6px 10px;border-radius:6px;margin:5px 0 0;font-size:11.5px;line-height:1.5">📍 ${f.help}${lnk}</div>`;
    }
    let shot="";
    if(f.shot){
      shot=`<button type="button" class="shotbtn" data-shot="${f.id}" style="margin:6px 0 0;font-size:11.5px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:6px;padding:4px 9px;cursor:pointer">📷 Ver o local exato no BuyGoods</button><div id="shot-${f.id}" style="display:none;margin:6px 0 0"><img src="${f.shot}" alt="Local exato no BuyGoods" style="max-width:100%;border:1px solid #ddd;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08)"></div>`;
    }
    return `<div class="field"><label>${f.label}</label><div class="frow">${inp}<button class="copy" data-copy="${f.id}">Copiar</button></div>${help}${shot}</div>`;
  }

  function genRow(id,label,val,ml){
    const tag = ml? `<textarea rows="2" id="gen-${id}" readonly>${esc(val)}</textarea>` : `<input type="text" id="gen-${id}" readonly value="${esc(val)}">`;
    return `<div class="field"><label>${label}</label><div class="frow">${tag}<button class="copy" data-copyraw="gen-${id}">Copiar</button></div></div>`;
  }
  function genPanel(){
    const p=prod();
    if(!p) return `<div class="note green" style="margin-top:8px">Escolha o produto na lista pra gerar os links e scripts.</div>`;
    const warn = aff()? "" : `<div style="color:#b42318;font-weight:700;margin:0 0 8px">⚠️ Cole o seu aff_id acima — sem ele os links NÃO marcam a venda.</div>`;
    let h=`<button type="button" class="btn prim" id="gGen" style="width:100%;margin:12px 0 0">📋 Ver os links e scripts gerados (já com o seu aff_id)</button>`;
    h+=`<div id="genBox" style="display:none;margin:8px 0 0">${warn}`;
    h+=genRow("acc","account_id (do produto)",p.account_id);
    h+=genRow("l2","Link de venda — 2 unidades",withAff(p.link2),true);
    h+=genRow("l3","Link de venda — 3 unidades",withAff(p.link3),true);
    h+=genRow("l6","Link de venda — 6 unidades",withAff(p.link6),true);
    h+=genRow("cn","Codenames (2/3/6)",p.cn2+" / "+p.cn3+" / "+p.cn6);
    h+=genRow("conv","Script B (conversão) — vai na PÁGINA",p.conv,true);
    h+=`<div class="note green" style="margin-top:8px">O <b>Script A</b> (tracking) e a página inteira o Claude monta quando você clica em <b>🚀 Subir a oferta</b>.</div></div>`;
    return h;
  }

  function fullPrompt(){
    const p=prod(); const a=aff();
    let s="Claude, sobe a minha oferta inteira do EASY DR, do começo ao fim:\n\n";
    s+="PRODUTO: "+(p?p.name:(g.data.produto||"(escolha o produto)"))+"\n";
    if(p){
      s+="account_id: "+p.account_id+"\n";
      s+="aff_id (meu): "+(a||"(FALTA — pego na BuyGoods)")+"\n";
      s+="codenames: "+p.cn2+" / "+p.cn3+" / "+p.cn6+"\n";
      s+="Link 2un: "+withAff(p.link2)+"\nLink 3un: "+withAff(p.link3)+"\nLink 6un: "+withAff(p.link6)+"\n";
      s+="Script B (conversão) p/ a página:\n"+p.conv+"\n";
    }
    s+="RT script (Funnel Pixels → Checkout): "+(g.data.bg_rt||"(coloca o do meu produto)")+"\n";
    s+="Domínio: "+(g.data.dominio||"(sugere um do nicho e compra — para no pagamento)")+"\n";
    s+="Ângulo: "+(g.data.angulo||"(cria um)")+"\n";
    s+="Fotos dos kits: 2un "+(g.data.kitimg2||"-")+" | 3un "+(g.data.kitimg3||"-")+" | 6un "+(g.data.kitimg6||"-")+"\n";
    s+="VSL: "+(g.data.vslfile||"(vou mandar o arquivo no chat)")+" | Pitch: "+(g.data.pitch||"(MM:SS)")+"\n\n";
    s+="Faz tudo: blinda o domínio no TWR + DNS; gera a página (Amanda agressivo: headline + comentários do Facebook) com o Script A montado (a=account_id, product=os 3 codenames), o Script B acima e os botões 2/3/6 com os links acima (já com o meu aff_id); hospeda no CyberPanel; sobe a VSL no VTurb e ajusta o reveal no pitch; liga o tracking no RedTrack (offers 2/3/6 + CAPI, subid={clickid}); e no fim faz a checagem ponta a ponta e me dá o OK. Para nos cliques que são meus (login, pagamento, 2FA).";
    return s;
  }

  function render(){
    g = state.guide;
    root().innerHTML = `
      <div class="gprog">
        <div class="top"><span>Seu progresso</span><b><span id="gPdone">0</span>/${STEPS.length} etapas</b></div>
        <div class="bar"><i id="gPbar"></i></div>
        <button class="btn prim" id="gShip" style="width:100%;margin:10px 0 2px;font-size:15px;padding:12px">🚀 Subir a oferta inteira comigo</button>
        <div style="font-size:12px;color:var(--gray);margin:4px 0 8px">Copia um prompt pronto com tudo (produto, aff_id, links, scripts, VSL, pitch) — cole no Claude (Cowork) e eu faço domínio → página → hospedagem → VTurb → tracking → checagem.</div>
        <div class="copilot">🤖 <b>O Claude faz por você (sem etapa):</b> blindagem no TWR, trackeamento no RedTrack e a checagem final dos links. Você só preenche o que está abaixo.</div>
      </div>
      <div class="glayout"><nav class="stepper" id="gStepper"></nav><main class="panel" id="gPanel"></main></div>`;
    const sh=$("gShip"); if(sh) sh.onclick=()=>copyText(fullPrompt(),sh);
    renderStepper(); renderPanel();
  }
  function renderProgress(){ const n=countDone(); $("gPdone").textContent=n; $("gPbar").style.width=(n/STEPS.length*100)+"%"; }
  function renderStepper(){
    const st=$("gStepper"); st.innerHTML="";
    STEPS.forEach((s,i)=>{
      const b=document.createElement("button");
      b.className="stepbtn"+(i===g.active?" active":"")+(g.done[s.id]?" done":"");
      b.innerHTML=`<span class="dot">${g.done[s.id]?"✓":(i+1)}</span><span class="lbl">${s.title}<small>${s.short}</small></span>`;
      b.onclick=()=>{ g.active=i; persist(); render(); };
      st.appendChild(b);
    });
  }
  function renderPanel(){
    renderProgress();
    const s=STEPS[g.active];
    let h=`<div class="kicker">Passo ${g.active+1} de ${STEPS.length} ${g.done[s.id]?'<span class="pill done">concluído ✓</span>':'<span class="pill">pendente</span>'}</div>`;
    h+=`<h2>${s.title}</h2><p class="what">${s.what}</p>`;
    if(s.links&&s.links.length) h+='<div class="links">'+s.links.map(l=>`<a class="lk ${l.alt?'alt':''}" href="${l.u}" target="_blank" rel="noopener">${l.l} ↗</a>`).join("")+'</div>';
    (s.fields||[]).forEach(f=> h+=fieldHTML(f));
    if(s.gen) h+=genPanel();
    h+=`<div class="why"><b>Por que isso importa:</b> ${s.why}</div>`;
    h+=`<button class="btn prim" id="gAsk" style="width:100%;margin:12px 0 0">🤖 Pedir ao Claude pra fazer essa etapa</button>`;
    h+=`<div style="font-size:12px;color:var(--gray);margin:6px 0 0">Copia um prompt pronto com seus dados — cole aqui no Claude (Cowork) e eu executo.</div>`;
    h+='<div class="actions">';
    h+=`<button class="btn ghost" id="gPrev" ${g.active===0?'style="visibility:hidden"':''}>← Voltar</button>`;
    const last=g.active===STEPS.length-1;
    h+= g.done[s.id] ? `<button class="btn done" id="gToggle">✓ Concluído — desmarcar</button>`
                     : `<button class="btn prim" id="gToggle">${last?"Concluir":"Concluir e avançar →"}</button>`;
    h+='</div>';
    if(last) h+=summary();
    $("gPanel").innerHTML=h; bind();
  }
  function askPrompt(s){
    const p=prod();
    const lines=(s.fields||[]).map(f=>{ if(f.type==="select") return "- Produto: "+(g.data.produto||"(escolha)"); return "- "+f.label+": "+(g.data[f.id]||"(vazio)"); }).join("\n");
    return "Claude, vamos rodar a oferta \""+(p?p.name:(g.data.produto||"(sem nome)"))+"\" — ETAPA: "+s.title+".\n\n"+
           "O que é: "+s.what+"\n"+
           (lines?("\nMeus dados desta etapa:\n"+lines+"\n"):"")+
           (s.ask?("\n"+s.ask+"\n"):"")+
           "\nExecuta essa etapa comigo (rotina EASY DR), parando nos cliques que são meus (login, pagamento, 2FA).";
  }
  function summary(){
    const p=prod();
    let rows="";
    function row(k,val){ if(val) rows+=`<tr><td>${k}</td><td>${esc(val)}</td></tr>`; }
    row("Produto", p?p.name:g.data.produto);
    row("aff_id", g.data.aff_id);
    row("Domínio", g.data.dominio);
    row("Ângulo", g.data.angulo);
    row("VSL", g.data.vslfile);
    row("Pitch (MM:SS)", g.data.pitch);
    return `<div class="note blue" style="margin-top:24px"><b>Resumo da sua oferta</b><table class="sumtable">${rows||'<tr><td>—</td><td>preencha as etapas</td></tr>'}</table></div>`;
  }
  function bind(){
    const p=$("gPrev"); if(p) p.onclick=()=>{ g.active=Math.max(0,g.active-1); persist(); render(); };
    const t=$("gToggle"); if(t) t.onclick=()=>{ const s=STEPS[g.active]; g.done[s.id]=!g.done[s.id]; if(g.done[s.id]&&g.active<STEPS.length-1)g.active++; persist(); render(); };
    const ask=$("gAsk"); if(ask){ const sa=STEPS[g.active]; ask.onclick=()=>copyText(askPrompt(sa),ask); }
    const gg=$("gGen"); if(gg) gg.onclick=()=>{ const d=$("genBox"); if(d) d.style.display=(d.style.display==="none"?"block":"none"); };
    $("gPanel").querySelectorAll("select[data-f]").forEach(el=> el.addEventListener("change",e=>{ g.data[el.dataset.f]=e.target.value; persist(); renderPanel(); }));
    $("gPanel").querySelectorAll("input[data-f],textarea[data-f]").forEach(el=> el.addEventListener("input",e=>{ g.data[e.target.dataset.f]=e.target.value; persist(); }));
    $("gPanel").querySelectorAll("input[data-f]").forEach(el=> el.addEventListener("change",e=>{ if(el.dataset.f==="aff_id") renderPanel(); }));
    $("gPanel").querySelectorAll("[data-shot]").forEach(b=> b.onclick=()=>{ const d=$("shot-"+b.dataset.shot); if(d) d.style.display=(d.style.display==="none"?"block":"none"); });
    $("gPanel").querySelectorAll("[data-copy]").forEach(b=> b.onclick=()=>copyText(g.data[b.dataset.copy]||"",b));
    $("gPanel").querySelectorAll("[data-copyraw]").forEach(b=> b.onclick=()=>{ const el=$(b.dataset.copyraw); copyText(el?el.value:"",b); });
  }
  return { render };
})();

/* ---------- start ---------- */
document.addEventListener("DOMContentLoaded", boot);
})();
