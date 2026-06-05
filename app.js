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
  function init(){
    // Dashboard desativado por agora (volta fácil depois)
    const dtab=document.querySelector('.tab[data-tab="dash"]'); if(dtab) dtab.style.display="none";
    const dview=$("dashView"); if(dview) dview.classList.add("hidden");
    const gtab=document.querySelector('.tab[data-tab="guide"]'); if(gtab) gtab.classList.add("active");
    document.querySelectorAll(".tab").forEach(b=>{
      b.onclick = ()=>{
        document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        const t=b.dataset.tab;
        $("guideView").classList.toggle("hidden", t!=="guide");
        $("dashView").classList.toggle("hidden", t!=="dash");
      };
    });
  }
  return { init };
})();

/* ============================================================
   GUIA (passos)
   ============================================================ */
const Guide = (function(){
  const STEPS = [
    { id:"s1", title:"Pegar o produto e gerar o link de afiliado", short:"Produto + link",
      what:"Escolha um produto campeão e gere o SEU link de afiliado dentro da plataforma. É esse link que registra a venda no seu nome.",
      links:[{l:"ClickBank",u:"https://www.clickbank.com"},{l:"CartPanda",u:"https://www.cartpanda.com"},{l:"BuyGoods (Affiliate Hub)",u:"https://backoffice.buygoods.com/campaigns"}],
      fields:[{id:"nicho",label:"Produto / nicho escolhido",ph:"Ex.: Vigor Boost",help:"O nome do produto que você vai promover."},{id:"account_id",label:"BuyGoods: account_id (ID do PRODUTO)",ph:"Ex.: 11749",help:"BuyGoods → Dashboard do produto → Your Affiliate Links: é o account_id=… do link (e o a=… nos scripts). É igual pros 3 packs.",shot:"print-afflink.png"},{id:"aff_id",label:"BuyGoods: aff_id (SEU ID — é POR PRODUTO, não um número único)",ph:"Ex.: 68398",help:"BuyGoods → Dashboard do produto → Your Affiliate Links: é o ?aff_id=… do SEU link. ⚠️ Muda por produto — nunca reaproveite de outra oferta, senão a comissão não cai pra você.",shot:"print-afflink.png"},{id:"afflink2",label:"Link de afiliado — 2 unidades",ph:"Cole o link do pack de 2",help:"BuyGoods → Dashboard do produto → Your Affiliate Links → copie o link do pack de 2 unidades."},{id:"afflink3",label:"Link de afiliado — 3 unidades",ph:"Cole o link do pack de 3",help:"Mesmo lugar (Your Affiliate Links) → o link do pack de 3 unidades."},{id:"afflink6",label:"Link de afiliado — 6 unidades",ph:"Cole o link do pack de 6",help:"Mesmo lugar (Your Affiliate Links) → o link do pack de 6 unidades."},{id:"codenames",label:"BuyGoods: codenames dos packs 2/3/6",ph:"Ex.: PP_VGB2UNITS_AFF / 3UNITS / 6UNITS",help:"Estão dentro de cada link de afiliado, no product_codename=… (um por pack: 2/3/6)."},{id:"bg_track",label:"BuyGoods: Script A (tracking) — vai na PÁGINA",ph:"Cole o script A (tracking)",ml:true,help:"Script de TRACKING (área de Tools/Pixels do produto na BuyGoods). Confira que tem tracking.buygoods.com/track e a=<seu account_id>. Cria o cookie sessid2."},{id:"bg_conv",label:"BuyGoods: Script B (conversão) — vai na PÁGINA",ph:"Cole o script B (conversão)",ml:true,help:"Script de CONVERSÃO (mesma área de Tools/Pixels). Confira que tem conversion/iframe/bg e o token t=… Vai na página DEPOIS do Script A."},{id:"bg_rt",label:"BuyGoods: RT script — Funnel Pixels → Checkout (marca o IC)",ph:"Settings → Funnel Pixels → campo Checkout",ml:true,help:"BuyGoods → abra o produto → Settings → Funnel Pixels → campo Checkout. Se estiver vazio, copie o RT script de um produto SEU que já marca. É o que faz o IC marcar no RedTrack.",helpAnchor:"#profile/funnelsnippet",helpLabel:"Abrir Funnel pixels ↗",shot:"print-funnelpixels.png"}],
      why:"O link de afiliado garante a sua comissão. Sem o link certo, ou com o aff_id de outro produto, a venda não cai pra você." },
    { id:"s2", title:"Comprar um domínio próprio", short:"Domínio",
      what:"Põe abaixo o domínio que você pensou — ou deixe em branco que o Claude sugere um do nicho. O Claude monta a compra na Hostinger e PARA no pagamento (você paga).",
      links:[{l:"Hostinger",u:"https://www.hostinger.com.br"}],
      fields:[{id:"dominio",label:"Domínio que você pensou (ou deixe vazio — o Claude sugere)",ph:"Ex.: minhaoferta.shop (ou deixe em branco)"}],
      why:"O domínio é o endereço que a pessoa abre ao clicar no anúncio. Domínio próprio passa confiança." },
    { id:"s3", title:"Blindar o domínio no cloaker (TWR)", short:"Cloaker TWR",
      what:"O Claude faz essa etapa pra você (já temos a skill do TWR): adiciona o domínio no The White Rabbit e aponta o DNS. Você só confirma o login quando ele pedir.",
      links:[{l:"The White Rabbit",u:"https://thewhiterabbit.app"}],
      fields:[{id:"twr",label:"Status no TWR (o Claude preenche)",ph:"Ex.: ligado e verificado"}],
      why:"O cloaker é o porteiro do link: manda o cliente certo pra oferta e protege a operação." },
    { id:"s4", title:"Página da VSL — o Claude gera e hospeda", short:"Página (Claude faz)",
      what:"O Claude CONSTRÓI a página da VSL no estilo Amanda Khayat (modo agressivo) — headline forte, copy de venda e comentários do Facebook (prova social) — e já hospeda no seu domínio (CyberPanel). Você só dá o ângulo e as fotos dos kits.",
      links:[],
      fields:[{id:"angulo",label:"Ângulo / promessa da página",ph:"Ex.: secar a barriga em 21 dias"},{id:"kitimg2",label:"Foto do kit — 2 unidades (link da imagem)",ph:"Cole o link da imagem (ou me manda a foto no chat)"},{id:"kitimg3",label:"Foto do kit — 3 unidades (link da imagem)",ph:"Cole o link da imagem (ou me manda a foto no chat)"},{id:"kitimg6",label:"Foto do kit — 6 unidades (link da imagem)",ph:"Cole o link da imagem (ou me manda a foto no chat)"},{id:"pageurl",label:"URL da página no ar (o Claude te passa)",ph:"O Claude preenche quando hospedar"}],
      ask:"Constrói a página da VSL usando a skill de copy da Amanda Khayat em MODO AGRESSIVO: headline/lead forte, copy de venda no ritmo de dopamina e os COMENTÁRIOS do Facebook (prova social, perfis fictícios). Embarca o player da VSL, usa as fotos dos kits 2/3/6 nos boxes de oferta e revela os botões no pitch. Depois hospeda no meu domínio.",
      why:"É a página que transforma o clique em venda — a headline agressiva e os comentários do Facebook (prova social) fazem o trabalho pesado. O Claude monta (copy Amanda) e hospeda; as fotos dos kits 2/3/6 viram os boxes de oferta." },
    { id:"s6", title:"VSL — subir o vídeo (VTurb)", short:"Vídeo (VTurb)",
      what:"Suba o ARQUIVO da VSL (o vídeo é grande): cole um link de download (Drive/Dropbox) ou me mande o arquivo aqui no chat. E diga o Pitch (MM:SS). O Claude sobe no VTurb e já pega o embed/PLAYER_ID — você não precisa preencher isso.",
      links:[{l:"VTurb",u:"https://vturb.com.br"}],
      fields:[{id:"vslfile",label:"Arquivo da VSL — link de download (Drive/Dropbox) ou manda no chat",ph:"Cole o link do vídeo (ou diga que vai mandar no chat)",ml:true},{id:"pitch",label:"⭐ Pitch da VSL (MM:SS) — minuto da oferta (só assistindo o vídeo)",ph:"Ex.: 12:34 — define quando a página revela 6/3/2"}],
      why:"A VTurb hospeda e toca o vídeo. O Pitch (MM:SS) é o minuto em que a oferta aparece — é nele que a página revela os botões 2/3/6. O embed o Claude já pega no upload." },
    { id:"s7", title:"Fazer o trackeamento dos resultados", short:"Trackeamento",
      what:"O Claude configura o rastreamento no RedTrack pra você (seguindo a skill): offers 2/3/6, source, campanha e a CAPI. Você só confirma o login.",
      links:[{l:"RedTrack",u:"https://www.redtrack.io"},{l:"Utmify",u:"https://utmify.com.br"}],
      fields:[{id:"track",label:"Ferramenta + ID da campanha (o Claude preenche)",ph:"Ex.: RedTrack - campanha 001"}],
      why:"É o seu painel real: mostra de onde vêm as vendas e qual anúncio dá lucro." },
    { id:"sqa", title:"Checagem final dos links (o Claude dá o OK)", short:"Checagem final",
      what:"O Claude confere a oferta ponta a ponta (numa aba anônima) e te dá o OK se está tudo certo — antes de ligar o tráfego, e toda vez que trocar vídeo, pitch, página ou offer.",
      links:[], clTitle:"O que o Claude confere:", checklist:["Página abre pelo link de tracking (rtkcid na URL)","Player do VTurb é o do vídeo ATIVO (nos 3 lugares do embed)","Botões revelam no pitch certo (delaySeconds = MM:SS do vídeo)","Os 2 scripts da BuyGoods estão na página (tracking + conversão)","aff_id é o DO PRODUTO + subid={clickid} na offer","Botões 2/3/6 caem na oferta certa → checkout","IC marca no tracker (RT script no Funnel Pixels → Checkout)"],
      fields:[{id:"qacheck",label:"Resultado da checagem (o Claude preenche)",ph:"Ex.: OK — testado em aba anônima"}],
      why:"Um link errado (player/pitch antigo, aff_id de outro produto, subid faltando) faz a venda não cair pra você. 2 minutos de conferência salvam a comissão." }
  ];
  let g;
  function root(){ return $("guideView"); }
  function countDone(){ return STEPS.filter(s=>g.done[s.id]).length; }
  function fieldHTML(f){
    const v=(g.data[f.id]||"");
    const inp = f.ml
      ? `<textarea rows="2" data-f="${f.id}" placeholder="${f.ph}">${esc(v)}</textarea>`
      : `<input type="text" data-f="${f.id}" value="${esc(v)}" placeholder="${f.ph}">`;
    let help="";
    if(f.help){
      const red=(f.helpTone==="red"||f.id==="aff_id");
      const box=red
        ? "background:rgba(220,38,38,.09);border-left:3px solid var(--red,#dc2626);color:#b42318"
        : "background:rgba(21,163,74,.10);border-left:3px solid var(--green,#15a34a);color:#0f7a3d";
      const acc=(g.data.account_id||"").trim();
      const prodUrl=acc?("https://backoffice.buygoods.com/?a="+encodeURIComponent(acc)):"https://backoffice.buygoods.com/campaigns";
      const url=f.helpUrl||(prodUrl+(f.helpAnchor||""));
      const lbl=f.helpLabel||(acc?("Abrir o produto ("+acc+") ↗"):"Abrir Affiliate Hub ↗");
      const lnk=` <a href="${url}" target="_blank" rel="noopener" style="color:inherit;font-weight:700;text-decoration:underline">${lbl}</a>`;
      help=`<div class="fhelp" style="${box};padding:6px 10px;border-radius:6px;margin:5px 0 0;font-size:11.5px;line-height:1.5">📍 ${f.help}${lnk}</div>`;
    }
    let shot="";
    if(f.shot){
      shot=`<button type="button" class="shotbtn" data-shot="${f.id}" style="margin:6px 0 0;font-size:11.5px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:6px;padding:4px 9px;cursor:pointer">📷 Ver o local exato no BuyGoods</button><div id="shot-${f.id}" style="display:none;margin:6px 0 0"><img src="${f.shot}" alt="Local exato no BuyGoods" style="max-width:100%;border:1px solid #ddd;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08)"></div>`;
    }
    return `<div class="field"><label>${f.label}</label><div class="frow">${inp}<button class="copy" data-copy="${f.id}">Copiar</button></div>${help}${shot}</div>`;
  }
  function askPrompt(s){
    const nicho=g.data.nicho||"(sem nome)";
    const lines=(s.fields||[]).map(f=>"- "+f.label+": "+(g.data[f.id]||"(vazio)")).join("\n");
    return "Claude, vamos rodar a oferta \""+nicho+"\" — ETAPA: "+s.title+".\n\n"+
           "O que é: "+s.what+"\n"+
           (lines?("\nMeus dados desta etapa:\n"+lines+"\n"):"")+
           (s.ask?("\n"+s.ask+"\n"):"")+
           "\nExecuta essa etapa comigo (rotina EASY DR), parando nos cliques que são meus (login, pagamento, 2FA).";
  }
  function render(){
    g = state.guide;
    root().innerHTML = `
      <div class="gprog">
        <div class="top"><span>Seu progresso</span><b><span id="gPdone">0</span>/${STEPS.length} etapas</b></div>
        <div class="bar"><i id="gPbar"></i></div>
        <div class="copilot">🤝 <b>Modo co-piloto:</b> em cada etapa, clique em <b>“Pedir ao Claude”</b> — copia um prompt pronto com seus dados pra você colar aqui no Claude (Cowork) e eu executo.</div>
      </div>
      <div class="glayout"><nav class="stepper" id="gStepper"></nav><main class="panel" id="gPanel"></main></div>`;
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
    if(s.checklist) h+='<div class="note green"><b>'+(s.clTitle||"O que o painel mostra:")+'</b><ul style="margin:8px 0 0;padding-left:20px">'+s.checklist.map(c=>`<li>${c}</li>`).join("")+'</ul></div>';
    (s.fields||[]).forEach(f=> h+=fieldHTML(f));
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
  function summary(){
    const map={nicho:"Produto / nicho",account_id:"BuyGoods account_id",aff_id:"BuyGoods aff_id",afflink2:"Link 2 un",afflink3:"Link 3 un",afflink6:"Link 6 un",codenames:"Codenames",dominio:"Domínio",twr:"TWR",angulo:"Ângulo",kitimg2:"Foto kit 2un",kitimg3:"Foto kit 3un",kitimg6:"Foto kit 6un",pageurl:"URL da página",vslfile:"Arquivo da VSL",pitch:"Pitch VSL (MM:SS)",track:"Trackeamento",qacheck:"Checagem final"};
    let rows=""; Object.keys(map).forEach(k=>{ if(g.data[k]) rows+=`<tr><td>${map[k]}</td><td>${esc(g.data[k])}</td></tr>`; });
    return `<div class="note blue" style="margin-top:24px"><b>Resumo da sua oferta</b><table class="sumtable">${rows}</table></div>`;
  }
  function bind(){
    const p=$("gPrev"); if(p) p.onclick=()=>{ g.active=Math.max(0,g.active-1); persist(); render(); };
    const t=$("gToggle"); if(t) t.onclick=()=>{ const s=STEPS[g.active]; g.done[s.id]=!g.done[s.id]; if(g.done[s.id]&&g.active<STEPS.length-1)g.active++; persist(); render(); };
    const ask=$("gAsk"); if(ask){ const sa=STEPS[g.active]; ask.onclick=()=>copyText(askPrompt(sa),ask); }
    $("gPanel").querySelectorAll("[data-f]").forEach(el=> el.addEventListener("input",e=>{ g.data[e.target.dataset.f]=e.target.value; persist(); }));
    $("gPanel").querySelectorAll("[data-copy]").forEach(b=> b.onclick=()=>copyText(g.data[b.dataset.copy]||"",b));
    $("gPanel").querySelectorAll("[data-shot]").forEach(b=> b.onclick=()=>{ const d=$("shot-"+b.dataset.shot); if(d) d.style.display=(d.style.display==="none"?"block":"none"); });
  }
  return { render };
})();

/* ---------- start ---------- */
document.addEventListener("DOMContentLoaded", boot);
})();
