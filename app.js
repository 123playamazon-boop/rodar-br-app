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
  const ok=()=>{ const o=btn.textContent; btn.textContent="Copiado ✓"; btn.classList.add("ok"); setTimeout(()=>{btn.textContent=o;btn.classList.remove("ok");},1200); };
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
  Tabs.init(); Guide.render(); Dash.render();
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
   TABS
   ============================================================ */
const Tabs = (function(){
  function init(){
    document.querySelectorAll(".tab").forEach(b=>{
      b.onclick = ()=>{
        document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        const t=b.dataset.tab;
        $("guideView").classList.toggle("hidden", t!=="guide");
        $("dashView").classList.toggle("hidden", t!=="dash");
        if(t==="dash") Dash.render();
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
      links:[{l:"ClickBank",u:"https://www.clickbank.com"},{l:"CartPanda",u:"https://www.cartpanda.com"},{l:"BuyGoods",u:"https://www.buygoods.com"}],
      fields:[{id:"nicho",label:"Produto / nicho escolhido",ph:"Ex.: Vigor Boost"},{id:"account_id",label:"BuyGoods: account_id (ID do PRODUTO)",ph:"Ex.: 11749"},{id:"aff_id",label:"BuyGoods: aff_id (SEU ID — é POR PRODUTO, não um número único)",ph:"Ex.: 68398 (Dashboard do produto → Your Affiliate Links)"},{id:"afflink2",label:"Link de afiliado — 2 unidades",ph:"Cole o link do pack de 2"},{id:"afflink3",label:"Link de afiliado — 3 unidades",ph:"Cole o link do pack de 3"},{id:"afflink6",label:"Link de afiliado — 6 unidades",ph:"Cole o link do pack de 6"},{id:"codenames",label:"BuyGoods: codenames dos packs 2/3/6",ph:"Ex.: PP_VGB2UNITS_AFF / 3UNITS / 6UNITS"},{id:"bg_track",label:"BuyGoods: Script A (tracking) — vai na PÁGINA",ph:"Cole o script A (tracking)",ml:true},{id:"bg_conv",label:"BuyGoods: Script B (conversão) — vai na PÁGINA",ph:"Cole o script B (conversão)",ml:true},{id:"bg_rt",label:"BuyGoods: RT script — Funnel Pixels → Checkout (marca o IC)",ph:"Settings → Funnel Pixels → campo Checkout",ml:true}],
      why:"O link de afiliado garante a sua comissão. Sem o link certo, a venda não cai pra você." },
    { id:"s2", title:"Comprar um domínio próprio", short:"Domínio",
      what:"Compre um domínio próprio (ex.: .shop, que é barato). Ele será o endereço da sua oferta.",
      links:[{l:"Hostinger",u:"https://www.hostinger.com.br"}],
      fields:[{id:"dominio",label:"Domínio que comprei",ph:"Ex.: minhaoferta.shop"}],
      why:"O domínio é o endereço que a pessoa abre ao clicar no anúncio. Domínio próprio passa confiança." },
    { id:"s3", title:"Blindar o domínio no cloaker (TWR)", short:"Cloaker TWR",
      what:"Coloque o domínio dentro do TWR e ligue a blindagem (cloaker).",
      links:[{l:"The White Rabbit",u:"https://thewhiterabbit.app"}],
      fields:[{id:"twr",label:"Status no TWR",ph:"Ex.: ligado e verificado"}],
      why:"O cloaker é o porteiro do link: manda o cliente certo pra oferta e protege a operação." },
    { id:"s4", title:"Gerar a página da VSL (com o Claude)", short:"Página VSL",
      what:"Peça ao Claude a página da VSL pronta. Copie o texto abaixo e mande no chat trocando pelo seu produto.",
      links:[], prompt:"Claude, gera a página da VSL pro produto __PRODUTO__, nicho __NICHO__. Página simples: vídeo no topo, copy de venda e botão de comprar.",
      fields:[{id:"angulo",label:"Ângulo / promessa da página",ph:"Ex.: secar a barriga em 21 dias"},{id:"kitimg2",label:"Foto do kit — 2 unidades (link da imagem)",ph:"Cole o link da imagem (ou me manda a foto no chat)"},{id:"kitimg3",label:"Foto do kit — 3 unidades (link da imagem)",ph:"Cole o link da imagem (ou me manda a foto no chat)"},{id:"kitimg6",label:"Foto do kit — 6 unidades (link da imagem)",ph:"Cole o link da imagem (ou me manda a foto no chat)"}],
      why:"É a página que transforma o clique em venda. O Claude monta; você só ajusta o seu produto. As fotos dos kits 2/3/6 viram os boxes de oferta." },
    { id:"s5", title:"Hospedar a página da VSL", short:"Hospedar (CyberPanel)",
      what:"Suba a página gerada no CyberPanel e ligue ao seu domínio para ela ficar no ar.",
      links:[{l:"CyberPanel",u:"https://cyberpanel.net"}],
      fields:[{id:"pageurl",label:"URL da página no ar",ph:"Ex.: https://minhaoferta.shop"}],
      why:"Hospedar é colocar a página de pé na internet. Sem isso, ela não abre pra ninguém." },
    { id:"s6", title:"Hospedar o vídeo da VSL (VTurb)", short:"Vídeo (VTurb)",
      what:"Suba o vídeo da VSL na VTurb e coloque o player dentro da sua página.",
      links:[{l:"VTurb",u:"https://vturb.com.br"}],
      fields:[{id:"video",label:"Link / código do vídeo (embed)",ph:"Cole o embed ou o link",ml:true},{id:"vturbid",label:"VTurb: PLAYER_ID (depois do upload)",ph:"Ex.: 6a206e119215eb145b928e99"},{id:"pitch",label:"⭐ Pitch da VSL (MM:SS) — minuto da oferta (só assistindo o vídeo)",ph:"Ex.: 12:34 — define quando a página revela 6/3/2"}],
      why:"A VTurb guarda e toca o vídeo com qualidade e recursos que vendem mais." },
    { id:"s7", title:"Fazer o trackeamento dos resultados", short:"Trackeamento",
      what:"Configure o rastreamento pra medir cliques, vendas e gastos. Use o RedTrack OU a Utmify.",
      links:[{l:"RedTrack",u:"https://www.redtrack.io"},{l:"Utmify",u:"https://utmify.com.br"}],
      fields:[{id:"track",label:"Ferramenta + ID da campanha",ph:"Ex.: Utmify - campanha 001"}],
      why:"É o seu painel real: mostra de onde vêm as vendas e qual anúncio dá lucro." },
    { id:"sqa", title:"Checagem final dos links (antes de escalar)", short:"Checagem final",
      what:"Antes de ligar o tráfego — e toda vez que trocar vídeo, pitch, página ou offer — confira a oferta ponta a ponta numa aba anônima (cookies limpos).",
      links:[], clTitle:"O que conferir:", checklist:["Página abre pelo link de tracking (rtkcid na URL)","Player do VTurb é o do vídeo ATIVO (nos 3 lugares do embed)","Botões revelam no pitch certo (delaySeconds = MM:SS do vídeo)","Os 2 scripts da BuyGoods estão na página (tracking + conversão)","aff_id é o DO PRODUTO + subid={clickid} na offer","Botões 2/3/6 caem na oferta certa → checkout","IC marca no tracker (RT script no Funnel Pixels → Checkout)"],
      fields:[{id:"qacheck",label:"Status da checagem",ph:"Ex.: testado em aba anônima — tudo ok"}],
      why:"Um link errado (player/pitch antigo, aff_id de outro produto, subid faltando) faz a venda não cair pra você. 2 minutos de conferência salvam a comissão." },
    { id:"s8", title:"Comprar a conta e ativar o Meta Ads", short:"Meta Ads",
      what:"Consiga sua conta de anúncio, configure e ative no Meta Ads. Dá pra usar agências (AdCentral, Outlaw, ScaleShield) e validar com número dos EUA no Virtunum.",
      links:[{l:"Meta Ads",u:"https://www.facebook.com/business/ads"},{l:"Virtunum (nº EUA)",u:"https://virtunum.com/en",alt:true}],
      fields:[{id:"adacc",label:"ID da conta de anúncio",ph:"Ex.: act_123456789"}],
      why:"O anúncio é o que traz pessoas até a oferta. Sem anúncio, ninguém entra na página." },
    { id:"s9", title:"Acompanhar tudo no dashboard", short:"Dashboard",
      what:"Use a aba Dashboard pra acompanhar a operação num lugar só.",
      links:[], checklist:["Saldo das contas","ROI (lucro sobre o gasto)","Vendas em tempo real","CPA (custo por venda)","Métricas da VSL (VTurb)","O que escalar ou pausar"],
      fields:[], why:"Com tudo num só painel, você decide rápido e com clareza." },
    { id:"s10", title:"Escolher o modelo de campanha", short:"Modelo de campanha",
      what:"Na hora de subir no Meta, escolha a melhor estratégia pro momento da oferta:",
      links:[], options:[
        {k:"CBO",t:"CBO — Orçamento na Campanha",d:"O Meta distribui o orçamento sozinho. Bom pra escalar com menos trabalho."},
        {k:"ABO",t:"ABO — Orçamento no Conjunto",d:"Você controla o orçamento em cada conjunto. Bom pra testar públicos."},
        {k:"CAT",t:"Catálogo",d:"O Meta mostra o produto certo pra cada pessoa. Bom com vários produtos."},
        {k:"BIDCAP",t:"Bid Cap — Lance Máximo",d:"Você define o máximo por resultado. Bom pra controlar o CPA escalando."}
      ], fields:[], why:"Não existe modelo único: escolha conforme o momento — testar, controlar custo ou escalar." }
  ];
  let g;
  function root(){ return $("guideView"); }
  function countDone(){ return STEPS.filter(s=>g.done[s.id]).length; }
  function fieldHTML(f){
    const v=(g.data[f.id]||"");
    const inp = f.ml
      ? `<textarea rows="2" data-f="${f.id}" placeholder="${f.ph}">${esc(v)}</textarea>`
      : `<input type="text" data-f="${f.id}" value="${esc(v)}" placeholder="${f.ph}">`;
    return `<div class="field"><label>${f.label}</label><div class="frow">${inp}<button class="copy" data-copy="${f.id}">Copiar</button></div></div>`;
  }
  function render(){
    g = state.guide;
    root().innerHTML = `
      <div class="gprog">
        <div class="top"><span>Seu progresso</span><b><span id="gPdone">0</span>/${STEPS.length} etapas</b></div>
        <div class="bar"><i id="gPbar"></i></div>
        <div class="copilot">🤝 <b>Modo co-piloto:</b> quando tiver todos os acessos, peça ao Claude: “vai clicando e configurando comigo etapa por etapa”.</div>
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
    if(s.prompt) h+=`<div class="note blue"><b>Texto pra colar no Claude:</b><div class="field" style="margin-top:8px"><div class="frow"><textarea rows="3" id="gPrompt">${esc(s.prompt)}</textarea><button class="copy" data-copyraw="gPrompt">Copiar</button></div></div></div>`;
    if(s.checklist) h+='<div class="note green"><b>'+(s.clTitle||"O que o painel mostra:")+'</b><ul style="margin:8px 0 0;padding-left:20px">'+s.checklist.map(c=>`<li>${c}</li>`).join("")+'</ul></div>';
    if(s.options) h+='<div class="opts">'+s.options.map(o=>`<div class="opt ${g.model===o.k?'sel':''}" data-model="${o.k}"><b>${o.t}</b><span>${o.d}</span></div>`).join("")+'</div>';
    (s.fields||[]).forEach(f=> h+=fieldHTML(f));
    h+=`<div class="why"><b>Por que isso importa:</b> ${s.why}</div>`;
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
    const map={nicho:"Produto / nicho",account_id:"BuyGoods account_id",aff_id:"BuyGoods aff_id",afflink2:"Link 2 un",afflink3:"Link 3 un",afflink6:"Link 6 un",codenames:"Codenames",dominio:"Domínio",twr:"TWR",angulo:"Ângulo",kitimg2:"Foto kit 2un",kitimg3:"Foto kit 3un",kitimg6:"Foto kit 6un",pageurl:"URL da página",video:"Vídeo",vturbid:"VTurb PLAYER_ID",pitch:"Pitch VSL (MM:SS)",track:"Trackeamento",qacheck:"Checagem final",adacc:"Conta de anúncio"};
    let rows=""; Object.keys(map).forEach(k=>{ if(g.data[k]) rows+=`<tr><td>${map[k]}</td><td>${esc(g.data[k])}</td></tr>`; });
    const mn={CBO:"CBO",ABO:"ABO",CAT:"Catálogo",BIDCAP:"Bid Cap"}[g.model]||"(não escolhido)";
    rows+=`<tr><td>Modelo de campanha</td><td>${mn}</td></tr>`;
    return `<div class="note blue" style="margin-top:24px"><b>Resumo da sua oferta</b><table class="sumtable">${rows}</table></div>`;
  }
  function bind(){
    const p=$("gPrev"); if(p) p.onclick=()=>{ g.active=Math.max(0,g.active-1); persist(); render(); };
    const t=$("gToggle"); if(t) t.onclick=()=>{ const s=STEPS[g.active]; g.done[s.id]=!g.done[s.id]; if(g.done[s.id]&&g.active<STEPS.length-1)g.active++; persist(); render(); };
    $("gPanel").querySelectorAll("[data-f]").forEach(el=> el.addEventListener("input",e=>{ g.data[e.target.dataset.f]=e.target.value; persist(); }));
    $("gPanel").querySelectorAll("[data-model]").forEach(el=> el.onclick=()=>{ g.model=el.dataset.model; persist(); renderPanel(); });
    $("gPanel").querySelectorAll("[data-copy]").forEach(b=> b.onclick=()=>copyText(g.data[b.dataset.copy]||"",b));
    $("gPanel").querySelectorAll("[data-copyraw]").forEach(b=> b.onclick=()=>{ const el=$(b.dataset.copyraw); copyText(el.value,b); });
  }
  return { render };
})();

/* ============================================================
   DASHBOARD
   ============================================================ */
const Dash = (function(){
  const MODELS=["CBO","ABO","Catálogo","Bid Cap"];
  let d;
  const SKELETON = `
    <div class="dhead">
      <div><h2 style="font-size:18px;margin:0">Painel da Oferta</h2>
      <p style="color:var(--gray);font-size:13px;margin:6px 0 0">Lance contas e campanhas. O painel calcula ROI, lucro, CPA e o que escalar/pausar.</p></div>
      <div class="settings">
        <div class="set">Moeda <select id="dCur"><option>R$</option><option>$</option></select></div>
        <div class="set">Meta ROI <input id="dRoi" type="number" value="30">%</div>
        <div class="set">CPA máx <input id="dCpa" type="number" value="0"></div>
      </div>
    </div>
    <div class="live">🔌 <span><b>Modo ao vivo:</b> pra puxar gasto, vendas e métricas da VSL sozinho, é preciso conectar Meta Ads (API), VTurb e o tracker. Por enquanto, lance os números aqui.</span></div>
    <div class="cards" id="dCards"></div>
    <div class="sec"><div class="secbar"><h2>Campanhas</h2><button class="add" id="dAddCamp">+ Nova campanha</button></div>
      <div class="tablewrap"><table class="dt"><thead><tr>
        <th>Conta</th><th>Campanha</th><th>Modelo</th><th class="r">Gasto</th><th class="r">Vendas</th><th class="r">Faturamento</th><th class="r">CPA</th><th class="r">Lucro</th><th class="r">ROI</th><th>Status</th><th></th>
      </tr></thead><tbody id="dCampBody"></tbody><tfoot id="dCampFoot"></tfoot></table></div></div>
    <div class="sec"><div class="secbar"><h2>Desempenho da VSL (VTurb)</h2><span class="hint">views, play rate e retenção no pitch → onde a VSL ganha ou perde a venda</span></div>
      <div class="tablewrap"><table class="dt"><thead><tr>
        <th>VSL / Campanha</th><th class="r">Visualizações</th><th class="r">Play rate</th><th class="r">Retenção no pitch</th><th class="r">CPV</th><th class="r">Conversão VSL</th><th>Leitura</th>
      </tr></thead><tbody id="dVslBody"></tbody><tfoot id="dVslFoot"></tfoot></table></div></div>
    <div class="sec"><div class="secbar"><h2>Ranking de lucro</h2><span class="hint">verde = lucro · vermelho = prejuízo</span></div><div class="rank" id="dRank"></div></div>
    <div class="sec"><div class="secbar"><h2>Contas &amp; saldos</h2><button class="add" id="dAddAcc">+ Nova conta</button></div>
      <div class="tablewrap"><table class="dt"><thead><tr><th>Conta de anúncio</th><th class="r">Saldo</th><th class="r">Gasto</th><th class="r">Restante</th><th></th></tr></thead><tbody id="dAccBody"></tbody><tfoot id="dAccFoot"></tfoot></table></div></div>
    <div class="tools"><button class="tbtn" id="dCopy">Copiar resumo</button><button class="tbtn" id="dExample">Carregar exemplo</button><button class="tbtn danger" id="dReset">Zerar tudo</button></div>`;

  function ensureSeed(){
    if(!d.seeded && d.campaigns.length===0 && d.accounts.length===0){
      d.accounts=[{id:uid(),name:"Conta 01",balance:500}];
      d.campaigns=[
        {id:uid(),acc:"Conta 01",name:"VSL Emagrecimento",model:"CBO",spend:120,sales:9,revenue:360,views:300,playRate:70,pitchRet:28},
        {id:uid(),acc:"Conta 01",name:"VSL Sono",model:"ABO",spend:80,sales:2,revenue:60,views:150,playRate:52,pitchRet:12}
      ];
      d.seeded=true; persist();
    }
  }
  function fmt(n){ if(!isFinite(n))n=0; return d.cur+" "+Number(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function pct(n){ if(!isFinite(n))n=0; return (n>0?"+":"")+Math.round(n)+"%"; }
  function calc(c){
    const spend=+c.spend||0, rev=+c.revenue||0, sales=+c.sales||0;
    const profit=rev-spend, roi=spend>0?profit/spend*100:0, cpa=sales>0?spend/sales:0;
    let st,cls;
    if(spend===0&&rev===0){st="Sem dados";cls="b-nd";}
    else if(profit<0){st="Pausar";cls="b-pau";}
    else if(roi>=(+d.roiTarget||0)){st="Escalar";cls="b-esc";}
    else{st="Manter";cls="b-man";}
    return {spend,rev,sales,profit,roi,cpa,st,cls,cpaWarn:(+d.cpaMax>0&&cpa>+d.cpaMax)};
  }
  function accOptions(sel){ return d.accounts.map(a=>`<option ${a.name===sel?"selected":""}>${esc(a.name)}</option>`).join(""); }
  function setText(id,t){ const e=$(id); if(e)e.textContent=t; }
  function card(k,v,cls){ return `<div class="c ${cls||''}"><div class="k">${k}</div><div class="v">${v}</div></div>`; }

  function buildCampaigns(){
    const body=$("dCampBody"); body.innerHTML="";
    if(d.campaigns.length===0){ body.innerHTML=`<tr><td colspan="11" class="empty">Nenhuma campanha. Clique em “+ Nova campanha”.</td></tr>`; }
    d.campaigns.forEach(c=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td><select data-f="acc">${accOptions(c.acc)}</select></td>
        <td><input data-f="name" value="${esc(c.name)}" placeholder="Nome"></td>
        <td><select data-f="model">${MODELS.map(m=>`<option ${m===c.model?"selected":""}>${m}</option>`).join("")}</select></td>
        <td class="num"><input data-f="spend" type="number" value="${c.spend||0}"></td>
        <td class="num"><input data-f="sales" type="number" value="${c.sales||0}"></td>
        <td class="num"><input data-f="revenue" type="number" value="${c.revenue||0}"></td>
        <td class="r"><span class="out" id="dcpa-${c.id}"></span></td>
        <td class="r"><span class="out" id="dprofit-${c.id}"></span></td>
        <td class="r"><span class="out" id="droi-${c.id}"></span></td>
        <td><span id="dstatus-${c.id}"></span></td>
        <td><button class="del" title="Remover">✕</button></td>`;
      body.appendChild(tr);
      tr.querySelectorAll("[data-f]").forEach(el=>{
        const ev=el.tagName==="SELECT"?"change":"input";
        el.addEventListener(ev,e=>{ c[el.dataset.f]=(el.type==="number")?(+e.target.value||0):e.target.value; persist(); updateDerived(); });
      });
      tr.querySelector(".del").onclick=()=>{ d.campaigns=d.campaigns.filter(x=>x.id!==c.id); persist(); buildCampaigns(); buildVSL(); updateDerived(); };
    });
  }
  function buildVSL(){
    const body=$("dVslBody"); body.innerHTML="";
    if(d.campaigns.length===0){ body.innerHTML=`<tr><td colspan="7" class="empty">Adicione uma campanha para lançar as métricas da VSL.</td></tr>`; return; }
    d.campaigns.forEach(c=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${c.name?esc(c.name):'<span style="color:var(--gray)">(sem nome)</span>'}</td>
        <td class="num"><input data-f="views" type="number" value="${c.views||0}"></td>
        <td class="num"><input data-f="playRate" type="number" value="${c.playRate||0}"></td>
        <td class="num"><input data-f="pitchRet" type="number" value="${c.pitchRet||0}"></td>
        <td class="r"><span class="out" id="dcpv-${c.id}"></span></td>
        <td class="r"><span class="out" id="dconv-${c.id}"></span></td>
        <td><span id="dvread-${c.id}"></span></td>`;
      body.appendChild(tr);
      tr.querySelectorAll("[data-f]").forEach(el=> el.addEventListener("input",e=>{ c[el.dataset.f]=+e.target.value||0; persist(); updateDerived(); }));
    });
  }
  function buildAccounts(){
    const body=$("dAccBody"); body.innerHTML="";
    if(d.accounts.length===0){ body.innerHTML=`<tr><td colspan="5" class="empty">Nenhuma conta. Clique em “+ Nova conta”.</td></tr>`; }
    d.accounts.forEach(a=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td><input data-f="name" value="${esc(a.name)}" placeholder="Ex.: Conta 01"></td>
        <td class="num"><input data-f="balance" type="number" value="${a.balance||0}"></td>
        <td class="r"><span class="out" id="daccspend-${a.id}"></span></td>
        <td class="r"><span class="out" id="daccleft-${a.id}"></span></td>
        <td><button class="del" title="Remover">✕</button></td>`;
      body.appendChild(tr);
      tr.querySelectorAll("[data-f]").forEach(el=>{
        el.addEventListener("input",e=>{
          if(el.dataset.f==="balance"){ a.balance=+e.target.value||0; }
          else { const old=a.name; a.name=e.target.value; d.campaigns.forEach(c=>{ if(c.acc===old)c.acc=a.name; }); }
          persist(); updateDerived();
        });
        if(el.dataset.f==="name") el.addEventListener("change",()=>{ buildCampaigns(); buildVSL(); });
      });
      tr.querySelector(".del").onclick=()=>{ d.accounts=d.accounts.filter(x=>x.id!==a.id); persist(); buildAccounts(); buildCampaigns(); buildVSL(); updateDerived(); };
    });
  }
  function updateDerived(){
    let tS=0,tR=0,tP=0,tSales=0;
    d.campaigns.forEach(c=>{
      const r=calc(c); tS+=r.spend; tR+=r.rev; tP+=r.profit; tSales+=r.sales;
      setText("dcpa-"+c.id, r.sales>0?fmt(r.cpa):"—");
      const pe=$("dprofit-"+c.id); if(pe){ pe.textContent=fmt(r.profit); pe.style.color=r.profit<0?"var(--red)":(r.profit>0?"var(--green)":"var(--ink)"); }
      setText("droi-"+c.id, r.spend>0?pct(r.roi):"—");
      const se=$("dstatus-"+c.id); if(se) se.innerHTML=`<span class="badge2 ${r.cls}">${r.st}</span>`+(r.cpaWarn?`<span class="warn">CPA acima do limite</span>`:"");
    });
    const roiAll=tS>0?tP/tS*100:0, cpaAll=tSales>0?tS/tSales:0;
    $("dCards").innerHTML = card("Faturamento",fmt(tR))+card("Gasto",fmt(tS))+card("Lucro",fmt(tP),tP>0?"good":(tP<0?"bad":""))+card("ROI geral",pct(roiAll),roiAll>0?"good":(roiAll<0?"bad":""))+card("Vendas",String(tSales))+card("CPA médio",tSales>0?fmt(cpaAll):"—");
    $("dCampFoot").innerHTML = d.campaigns.length?`<tr><td colspan="3">TOTAL</td><td class="r">${fmt(tS)}</td><td class="r">${tSales}</td><td class="r">${fmt(tR)}</td><td class="r">${tSales>0?fmt(cpaAll):"—"}</td><td class="r" style="color:${tP<0?'var(--red)':'var(--green)'}">${fmt(tP)}</td><td class="r">${tS>0?pct(roiAll):"—"}</td><td colspan="2"></td></tr>`:"";
    // contas
    let tBal=0,tLeft=0;
    d.accounts.forEach(a=>{
      const sp=d.campaigns.filter(c=>c.acc===a.name).reduce((s,c)=>s+(+c.spend||0),0);
      const left=(+a.balance||0)-sp; tBal+=(+a.balance||0); tLeft+=left;
      setText("daccspend-"+a.id,fmt(sp));
      const le=$("daccleft-"+a.id); if(le){ le.textContent=fmt(left); le.style.color=left<0?"var(--red)":"var(--ink)"; }
    });
    $("dAccFoot").innerHTML = d.accounts.length?`<tr><td>TOTAL</td><td class="r">${fmt(tBal)}</td><td class="r">${fmt(tS)}</td><td class="r" style="color:${tLeft<0?'var(--red)':'var(--ink)'}">${fmt(tLeft)}</td><td></td></tr>`:"";
    // VSL
    let tViews=0,sumPlay=0,sumPitch=0,nV=0;
    d.campaigns.forEach(c=>{
      const views=+c.views||0, sales=+c.sales||0, spend=+c.spend||0;
      const cpv=views>0?spend/views:0, conv=views>0?sales/views*100:0;
      setText("dcpv-"+c.id, views>0?fmt(cpv):"—");
      const ce=$("dconv-"+c.id); if(ce) ce.textContent=views>0?conv.toFixed(1)+"%":"—";
      const re=$("dvread-"+c.id);
      if(re){ let txt="—",cls="b-nd";
        if(views>0){ const pr=+c.playRate||0, pit=+c.pitchRet||0;
          if(pr>0&&pr<50){txt="Hook fraco (play baixo)";cls="b-pau";}
          else if(pit>0&&pit<15){txt="Perde antes do pitch";cls="b-man";}
          else if(conv<1){txt="Chega no pitch, vende pouco";cls="b-man";}
          else{txt="VSL saudável";cls="b-esc";} }
        re.innerHTML=`<span class="badge2 ${cls}">${txt}</span>`; }
      if(views>0){ tViews+=views; sumPlay+=(+c.playRate||0); sumPitch+=(+c.pitchRet||0); nV++; }
    });
    const avgPlay=nV?sumPlay/nV:0, avgPitch=nV?sumPitch/nV:0, avgCPV=tViews>0?tS/tViews:0, convAll=tViews>0?tSales/tViews*100:0;
    $("dVslFoot").innerHTML = d.campaigns.length?`<tr><td>TOTAL / MÉDIA</td><td class="r">${tViews.toLocaleString("pt-BR")}</td><td class="r">${avgPlay.toFixed(0)}%</td><td class="r">${avgPitch.toFixed(0)}%</td><td class="r">${tViews>0?fmt(avgCPV):"—"}</td><td class="r">${tViews>0?convAll.toFixed(1)+"%":"—"}</td><td></td></tr>`:"";
    buildRanking(); persist();
  }
  function buildRanking(){
    const el=$("dRank");
    const arr=d.campaigns.map(c=>({n:c.name||"(sem nome)",...calc(c)})).filter(c=>c.spend>0||c.rev>0);
    if(arr.length===0){ el.innerHTML=`<div class="empty">Sem dados para ranquear ainda.</div>`; return; }
    arr.sort((a,b)=>b.profit-a.profit);
    const max=Math.max(1,...arr.map(c=>Math.abs(c.profit)));
    el.innerHTML=arr.map(c=>{
      const w=Math.max(3,Math.abs(c.profit)/max*100);
      const col=c.profit<0?"var(--red)":(c.st==="Escalar"?"var(--green)":"var(--amber)");
      return `<div class="rk"><div class="nm">${esc(c.n)}</div><div class="track"><div class="fill" style="width:${w}%;background:${col}"></div></div><div class="val" style="color:${c.profit<0?'var(--red)':'var(--green)'}">${fmt(c.profit)}</div></div>`;
    }).join("");
  }
  function wireStatic(){
    const cur=$("dCur"); cur.value=d.cur; cur.onchange=()=>{ d.cur=cur.value; persist(); updateDerived(); };
    const roi=$("dRoi"); roi.value=d.roiTarget; roi.oninput=()=>{ d.roiTarget=+roi.value||0; persist(); updateDerived(); };
    const cpa=$("dCpa"); cpa.value=d.cpaMax; cpa.oninput=()=>{ d.cpaMax=+cpa.value||0; persist(); updateDerived(); };
    $("dAddCamp").onclick=()=>{ d.campaigns.push({id:uid(),acc:(d.accounts[0]&&d.accounts[0].name)||"",name:"",model:"CBO",spend:0,sales:0,revenue:0,views:0,playRate:0,pitchRet:0}); persist(); buildCampaigns(); buildVSL(); updateDerived(); };
    $("dAddAcc").onclick=()=>{ d.accounts.push({id:uid(),name:"Conta "+String(d.accounts.length+1).padStart(2,"0"),balance:0}); persist(); buildAccounts(); buildCampaigns(); buildVSL(); updateDerived(); };
    $("dReset").onclick=()=>{ if(confirm("Apagar todas as contas e campanhas?")){ d.accounts=[]; d.campaigns=[]; d.seeded=true; persist(); buildAccounts(); buildCampaigns(); buildVSL(); updateDerived(); } };
    $("dExample").onclick=()=>{ d.accounts=[{id:uid(),name:"Conta 01",balance:500}]; d.campaigns=[{id:uid(),acc:"Conta 01",name:"VSL Emagrecimento",model:"CBO",spend:120,sales:9,revenue:360,views:300,playRate:70,pitchRet:28},{id:uid(),acc:"Conta 01",name:"VSL Sono",model:"ABO",spend:80,sales:2,revenue:60,views:150,playRate:52,pitchRet:12}]; persist(); buildAccounts(); buildCampaigns(); buildVSL(); updateDerived(); };
    $("dCopy").onclick=()=>{
      let tS=0,tR=0,tP=0,tSales=0; d.campaigns.forEach(c=>{const r=calc(c);tS+=r.spend;tR+=r.rev;tP+=r.profit;tSales+=r.sales;});
      const roiAll=tS>0?tP/tS*100:0;
      let t="RESUMO DO DASHBOARD\n"+`Faturamento: ${fmt(tR)} | Gasto: ${fmt(tS)} | Lucro: ${fmt(tP)} | ROI: ${pct(roiAll)} | Vendas: ${tSales}\n\nCampanhas:\n`;
      d.campaigns.forEach(c=>{ const r=calc(c); const v=+c.views||0; const cv=v>0?(r.sales/v*100).toFixed(1)+"%":"—"; t+=`- ${c.name||"(sem nome)"} [${c.model}] ${r.st}: lucro ${fmt(r.profit)}, ROI ${pct(r.roi)}, CPA ${r.sales>0?fmt(r.cpa):"—"} | VSL: ${v} views, play ${+c.playRate||0}%, pitch ${+c.pitchRet||0}%, conv ${cv}\n`; });
      copyText(t,$("dCopy"));
    };
  }
  function render(){
    d = state.dash;
    const host=$("dashView");
    if(!host.dataset.built){ host.innerHTML=SKELETON; host.dataset.built="1"; ensureSeed(); wireStatic(); }
    else ensureSeed();
    buildAccounts(); buildCampaigns(); buildVSL(); updateDerived();
  }
  return { render };
})();

/* ---------- start ---------- */
document.addEventListener("DOMContentLoaded", boot);
})();
