/* =====================================================================
   Ponto Facial — app do tablet para bater ponto pelo rosto.
   Funciona offline (PWA), guarda tudo no aparelho e exporta as batidas
   no formato do Ponto Livre.
   ===================================================================== */
(function () {
"use strict";

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const CHAVE = "pontoFacial.v1";
const CHAVE_RH = "pontoFacial.rh";
const ROTULO_BATIDA = { entrada: "Entrada", almoco: "Saída almoço", retorno: "Retorno", saida: "Saída" };
const CAMPOS_BATIDA = ["entrada", "almoco", "retorno", "saida"];

/* ------------------------------ util ------------------------------ */
const pad = n => String(n).padStart(2, "0");
const isoData = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const hojeISO = () => isoData(new Date());
const deISO = iso => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };
const brData = iso => { if (!iso) return "—"; const [a, m, d] = iso.split("-"); return d + "/" + m + "/" + a; };
const hora = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const horaExata = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEM = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const paraMin = h => { if (!h || !/^\d{1,2}:\d{2}/.test(h)) return null; const [a, b] = h.split(":").map(Number); return a * 60 + b; };
const deMin = m => { const neg = m < 0, a = Math.abs(Math.round(m)); return (neg ? "-" : "") + Math.floor(a / 60) + ":" + pad(a % 60); };
const horaSeg = () => hora() + ":" + pad(new Date().getSeconds());
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function toast(msg, ms) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("mostra");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("mostra"), ms || 2800);
}

/* ----------------------------- estado ----------------------------- */
const PADRAO = {
  empresa: "Minha Empresa", limiar: 70, motor: "local", funcionarios: [], batidas: [], pin: "",
  jornada: { entrada: "08:00", almoco: "12:00", retorno: "13:00", saida: "17:00" },
  toleranciaMin: 5, diasUteis: [1, 2, 3, 4, 5], feriados: []
};
let estado = carregar();
function carregar() {
  try {
    const o = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (!o) return JSON.parse(JSON.stringify(PADRAO));
    const base = JSON.parse(JSON.stringify(PADRAO));
    return {
      ...base, ...o,
      jornada: { ...base.jornada, ...(o.jornada || {}) },
      diasUteis: Array.isArray(o.diasUteis) ? o.diasUteis : base.diasUteis,
      feriados: Array.isArray(o.feriados) ? o.feriados : [],
      funcionarios: Array.isArray(o.funcionarios) ? o.funcionarios : [],
      batidas: Array.isArray(o.batidas) ? o.batidas : []
    };
  } catch (e) { return JSON.parse(JSON.stringify(PADRAO)); }
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)); }
  catch (e) { toast("Memória do aparelho cheia: exporte e apague rostos antigos.", 5000); console.error(e); }
}

/* ------------------------- funcionários --------------------------- */
function funcPorId(id) { return estado.funcionarios.find(f => f.id === id) || null; }
function funcPorNome(nome) {
  const alvo = String(nome || "").trim().toLowerCase();
  return estado.funcionarios.find(f => f.nome.trim().toLowerCase() === alvo) || null;
}
/** Cria o funcionário se ainda não existir (vindo do Ponto Livre). */
function garantirFunc(nome, cargo) {
  let f = funcPorNome(nome);
  if (!f) {
    f = { id: uid(), nome: String(nome).trim(), cargo: cargo || "", criadoEm: new Date().toISOString() };
    estado.funcionarios.push(f);
  } else if (cargo && !f.cargo) f.cargo = cargo;
  return f;
}
function perfilDe(funcId) { const f = funcPorId(funcId); return f ? f.perfil || null : null; }

/* --------------------------- batidas ------------------------------ */
function batidasDoDia(iso) { return estado.batidas.filter(b => b.data === iso); }
function batidasDoFunc(iso, funcId) { return batidasDoDia(iso).filter(b => b.funcId === funcId).sort((a, b) => a.hora.localeCompare(b.hora)); }

/** Qual batida vem agora para a pessoa (mesma regra do Ponto Livre). */
function proximaBatida(funcId, iso) {
  const b = batidasDoFunc(iso || hojeISO(), funcId);
  const tem = campo => b.some(x => x.campo === campo);
  if (!tem("entrada")) return "entrada";
  if (!tem("almoco")) return "almoco";
  if (!tem("retorno")) return "retorno";
  if (!tem("saida")) return "saida";
  return null;
}

function registrarBatida(func, como, nota) {
  const iso = hojeISO();
  let campo = proximaBatida(func.id, iso);
  if (!campo) {
    // já bateu as 4: a próxima batida vira uma "saída" extra registrada como nova entrada do dia seguinte? Não:
    // aqui apenas avisamos e não duplicamos.
    return { ok: false, motivo: "As 4 batidas de hoje já foram registradas." };
  }
  // guarda só o horário e o resultado do reconhecimento — nenhuma foto da batida é salva
  const b = { id: uid(), funcId: func.id, nome: func.nome, data: iso, hora: hora(), horaExata: horaExata(), campo, como, nota: nota || null, criadoEm: new Date().toISOString() };
  estado.batidas.push(b);
  salvar();
  return { ok: true, batida: b };
}

/* --------------------------- câmera -------------------------------- */
let stream = null, video = null, loop = null, ocupado = false, cameraAberta = false, frontal = true;
let canvasCamera = null;

async function abrirCamera() {
  video = $("#video");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: frontal ? "user" : "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    cameraAberta = true;
    $("#cameraArea").classList.add("ativa");
    $("#btnCamera").classList.add("oculto");
    $("#btnTrocarCamera").classList.remove("oculto");
    setStatus("Posicione o rosto dentro da moldura");
    iniciarLoop();
  } catch (e) {
    console.error(e);
    cameraAberta = false;
    setStatus(erroCamera(e), true);
    $("#cameraArea").classList.add("ativa");
    $("#btnCamera").classList.remove("oculto");
    $("#btnCamera").textContent = "🔄 Tentar abrir a câmera de novo";
  }
}

function erroCamera(e) {
  const n = e && e.name;
  if (n === "NotAllowedError" || n === "SecurityError") return "A câmera está bloqueada. Toque no cadeado ao lado do endereço e permita a câmera. (A câmera só abre em https ou em localhost.)";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "Nenhuma câmera encontrada neste aparelho.";
  if (n === "NotReadableError") return "A câmera está em uso por outro aplicativo. Feche o outro app e tente de novo.";
  return "Não foi possível abrir a câmera: " + (e && e.message ? e.message : "erro desconhecido");
}

function fecharCamera() {
  if (loop) { clearInterval(loop); loop = null; }
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; cameraAberta = false;
  $("#cameraArea").classList.remove("ativa");
  $("#btnCamera").classList.remove("oculto");
  $("#btnCamera").textContent = "📷 Abrir câmera e bater ponto";
  $("#btnTrocarCamera").classList.add("oculto");
  setStatus("Toque em “Abrir câmera e bater ponto”");
}

function setStatus(txt, erro) {
  const s = $("#status");
  s.textContent = txt;
  s.classList.toggle("erro", !!erro);
}

function iniciarLoop() {
  if (loop) clearInterval(loop);
  let falhas = 0;
  loop = setInterval(async () => {
    if (ocupado || !cameraAberta) return;
    if (perfilTotal() === 0) { setStatus("Nenhum rosto cadastrado ainda — cadastre no menu do RH.", true); return; }
    const c = Facial.tirarFoto(video);
    if (!c) return;
    ocupado = true;
    try {
      const modo = estado.motor;
      let desc = null;
      if (modo === "ia" && Facial.iaPronta()) desc = await Facial.descritorIA(c);
      if (!desc) desc = Facial.descritorLocal(c);
      const perfis = estado.funcionarios.filter(f => (f.perfil && f.perfil.descritores && f.perfil.descritores.length));
      const achado = Facial.identificar(desc, perfis, modo === "ia" && Facial.iaPronta() ? "ia" : "local", estado.limiar);
      if (achado) {
        falhas = 0;
        baterPorRosto(achado);
      } else {
        falhas++;
        if (falhas > 3) setStatus("Não reconheci. Aproxime o rosto, melhore a luz ou cadastre o rosto no RH.");
      }
    } catch (e) {
      console.warn(e);
    } finally {
      ocupado = false;
    }
  }, 900);
}

function perfilTotal() { return estado.funcionarios.filter(f => f.perfil && f.perfil.descritores && f.perfil.descritores.length).length; }

/* A pessoa é reconhecida: mostra o nome e pede a confirmação (evita bater ponto de outro). */
function baterPorRosto(achado) {
  if (loop) { clearInterval(loop); loop = null; }
  const f = funcPorId(achado.funcId);
  if (!f) return;
  const campo = proximaBatida(f.id);
  // usa a foto do rosto que já está salva no cadastro — a batida não tira nem guarda foto
  const fotoCadastro = (f.perfil && f.perfil.fotos && f.perfil.fotos[0]) || "";
  const res = $("#resultado");
  res.className = "resultado mostra";
  res.innerHTML = `
    <div class="res-foto">${fotoCadastro ? `<img src="${fotoCadastro}" alt="">` : `<span style="font-size:64px">👤</span>`}</div>
    <div class="res-info">
      <div class="res-nome">${esc(f.nome)}</div>
      <div class="res-cargo">${esc(f.cargo || "")} · ${achado.nota}% de semelhança</div>
      ${campo
        ? `<div class="res-batida">${ROTULO_BATIDA[campo]}</div>
           <div class="res-botoes">
             <button class="btn ghost" id="btnNaoSouEu" type="button">Não sou eu</button>
             <button class="btn primario grande" id="btnConfirmar" type="button">✅ Confirmar ${ROTULO_BATIDA[campo]}</button>
           </div>`
        : `<div class="res-batida">Já bateu as 4 de hoje</div>
           <div class="res-botoes"><button class="btn ghost" id="btnNaoSouEu" type="button">Fechar</button></div>`}
    </div>`;
  $("#btnNaoSouEu").addEventListener("click", () => { fecharResultado(); iniciarLoop(); });
  const conf = $("#btnConfirmar");
  if (conf) conf.addEventListener("click", () => {
    const r = registrarBatida(f, "rosto", achado.nota);
    if (!r.ok) { toast(r.motivo); fecharResultado(); iniciarLoop(); return; }
    mostrarSucesso(f, r.batida);
  });
}

function mostrarSucesso(f, b) {
  const res = $("#resultado");
  res.className = "resultado mostra sucesso";
  const fotoCad = (f.perfil && f.perfil.fotos && f.perfil.fotos[0]) || "";
  res.innerHTML = `
    <div class="res-check">✅</div>
    <div class="res-foto">${fotoCad ? `<img src="${fotoCad}" alt="">` : `<span style="font-size:64px">👤</span>`}</div>
    <div class="res-info">
      <div class="res-nome">${esc(f.nome)}</div>
      <div class="res-batida">${ROTULO_BATIDA[b.campo]} registrada às ${b.horaExata || b.hora}</div>
      <div class="res-cargo">Sua folha de ponto está logo abaixo, já atualizada.</div>
    </div>
    <div class="res-botoes">
      <button class="btn primario" id="btnVerFolha" type="button">📋 Ver minha folha</button>
      <button class="btn ghost" id="btnOutro" type="button">Próximo funcionário</button>
    </div>`;
  renderUltimos();
  // a folha do funcionário abre sozinha e se atualiza a cada batida
  abrirFolha(f.id);
  $("#btnVerFolha").addEventListener("click", () => {
    fecharResultado();
    const area = $("#folhaArea");
    if (area) area.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#btnOutro").addEventListener("click", () => {
    fecharResultado();
    fecharFolha();
    if (cameraAberta) iniciarLoop();
  });
  setTimeout(() => {
    if (!res.classList.contains("mostra")) return;
    fecharResultado();
    fecharFolha();
    if (cameraAberta) iniciarLoop();
  }, 25000);
}

function fecharResultado() {
  const res = $("#resultado");
  res.className = "resultado oculto";
  res.innerHTML = "";
}

/* ------------------------ batida com PIN -------------------------- */
function abrirPIN() {
  if (perfilTotal() === 0 && !estado.pin) { toast("Cadastre um rosto ou defina um PIN no menu do RH."); return; }
  abrirModal("Bater ponto com PIN", `
    <p class="miudo">Digite o PIN do funcionário (o RH define em “Rostos”).</p>
    <input id="pinInput" type="password" inputmode="numeric" autocomplete="off" class="campo-grande" placeholder="••••">
    <div class="modal-acoes"><button class="btn primario largo" id="btnPINok" type="button">Confirmar</button></div>`);
  const inp = $("#pinInput");
  setTimeout(() => inp.focus(), 80);
  const tentar = () => {
    const v = inp.value.trim();
    const f = estado.funcionarios.find(x => x.pin && x.pin === v);
    if (!f) { toast("PIN não encontrado."); inp.value = ""; return; }
    const r = registrarBatida(f, "pin");
    fecharModal();
    if (!r.ok) { toast(r.motivo); return; }
    mostrarSucesso(f, r.batida);
  };
  $("#btnPINok").addEventListener("click", tentar);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") tentar(); });
}

/* --------------------------- rostos (RH) -------------------------- */
let cadastro = null; // { funcId, passo, descritores[], fotos[] }

function iniciarCadastro(funcId) {
  const f = funcPorId(funcId);
  if (!f) return;
  cadastro = { funcId, passo: 0, descritores: [], fotos: [] };
  const guias = ["Olhe de frente para a câmera", "Vire levemente para a esquerda", "Vire levemente para a direita"];
  abrirModal("Cadastrar rosto — " + f.nome, `
    <p class="miudo">${guias[0]}. Ficam 3 fotos.</p>
    <div class="cad-camera"><video id="videoCad" autoplay playsinline muted></video><div class="guia"></div></div>
    <div id="cadStatus" class="miudo"></div>
    <p class="miudo">As 3 fotos ficam salvas no aparelho, no cadastro do funcionário. As batidas de ponto <b>não</b> salvam foto — só o horário.</p>
    <div class="modal-acoes">
      <button class="btn ghost" id="btnCadCancelar" type="button">Cancelar</button>
      <button class="btn primario" id="btnCadFoto" type="button">📸 Capturar</button>
    </div>`);
  const v = $("#videoCad");
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false })
    .then(s => { v._stream = s; v.srcObject = s; return v.play().catch(() => {}); })
    .catch(e => { $("#cadStatus").textContent = erroCamera(e); $("#btnCadFoto").disabled = true; });

  $("#btnCadFoto").addEventListener("click", async () => {
    const c = Facial.tirarFoto(v);
    if (!c) { toast("A câmera ainda não está pronta."); return; }
    $("#cadStatus").textContent = "Processando…";
    let desc = null;
    if (estado.motor === "ia") {
      try { desc = await Facial.descritorIA(c); } catch (e) { console.warn(e); }
      if (!desc) $("#cadStatus").textContent = "Modelo de IA ainda não baixado — usando o modo rápido.";
    }
    if (!desc) desc = Facial.descritorLocal(c);
    cadastro.descritores.push(desc);
    cadastro.fotos.push(c.toDataURL("image/jpeg", 0.75));
    cadastro.passo++;
    if (cadastro.passo < 3) {
      $("#cadStatus").textContent = guias[cadastro.passo] + " e toque em Capturar.";
    } else {
      salvarPerfil();
    }
  });
  $("#btnCadCancelar").addEventListener("click", fecharCadastro);
}

function salvarPerfil() {
  const f = funcPorId(cadastro.funcId);
  if (!f) return fecharCadastro();
  f.perfil = { descritores: cadastro.descritores, fotos: cadastro.fotos, motor: estado.motor, criadoEm: new Date().toISOString() };
  salvar();
  fecharCadastro();
  renderRostos();
  toast("Rosto de " + f.nome + " cadastrado.");
}

function fecharCadastro() {
  const v = $("#videoCad");
  if (v && v._stream) v._stream.getTracks().forEach(t => t.stop());
  cadastro = null;
  fecharModal();
}

function renderRostos() {
  const busca = ($("#buscaFunc").value || "").trim().toLowerCase();
  const lista = estado.funcionarios
    .filter(f => !busca || f.nome.toLowerCase().includes(busca))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  $("#listaRostos").innerHTML = lista.map(f => {
    const tem = f.perfil && f.perfil.fotos && f.perfil.fotos.length;
    return `<div class="rosto-card ${tem ? "tem" : ""}">
      <div class="rosto-foto">${tem ? `<img src="${f.perfil.fotos[0]}" alt="">` : `<span>👤</span>`}</div>
      ${tem && f.perfil.fotos.length > 1 ? `<div class="rosto-fotos-mini">${f.perfil.fotos.slice(1).map(src => `<img src="${src}" alt="">`).join("")}</div>` : ""}
      <div class="rosto-info">
        <b>${esc(f.nome)}</b>
        <span>${esc(f.cargo || "—")}${f.pin ? " · PIN " + "•".repeat(String(f.pin).length) : ""}</span>
        <small>${tem ? "Rosto cadastrado" : "Sem rosto"}</small>
      </div>
      <div class="rosto-acoes">
        <button class="btn mini ${tem ? "ghost" : "primario"}" data-cad="${f.id}" type="button">${tem ? "Refazer rosto" : "Cadastrar rosto"}</button>
        <button class="btn mini ghost" data-pin="${f.id}" type="button">PIN</button>
        ${tem ? `<button class="btn mini ghost perigo" data-apagar="${f.id}" type="button">Apagar rosto</button>` : ""}
      </div>
    </div>`;
  }).join("") || `<p class="miudo">Nenhum funcionário. Importe do Ponto Livre em “Ajustes”.</p>`;
}

function definirPIN(funcId) {
  const f = funcPorId(funcId);
  if (!f) return;
  abrirModal("PIN de " + f.nome, `
    <p class="miudo">4 números que o funcionário digita quando o rosto não for reconhecido.</p>
    <input id="pinNovo" type="text" inputmode="numeric" maxlength="4" class="campo-grande" value="${esc(f.pin || "")}">
    <div class="modal-acoes">
      <button class="btn ghost" id="btnPinLimpar" type="button">Remover PIN</button>
      <button class="btn primario" id="btnPinSalvar" type="button">Salvar</button>
    </div>`);
  $("#btnPinSalvar").addEventListener("click", () => {
    const v = ($("#pinNovo").value || "").replace(/\D/g, "").slice(0, 4);
    if (v && v.length < 4) { toast("O PIN precisa ter 4 números."); return; }
    f.pin = v; salvar(); fecharModal(); renderRostos();
    toast(v ? "PIN salvo." : "PIN removido.");
  });
  $("#btnPinLimpar").addEventListener("click", () => { f.pin = ""; salvar(); fecharModal(); renderRostos(); });
}

/* --------------------------- batidas (RH) ------------------------- */
function renderBatidas() {
  const iso = $("#batData").value || hojeISO();
  const lista = batidasDoDia(iso).slice().sort((a, b) => b.hora.localeCompare(a.hora));
  $("#corpoBatidas").innerHTML = lista.map(b => `<tr>
    <td class="num">${b.hora}</td>
    <td class="c-nome">${esc(b.nome)}</td>
    <td>${ROTULO_BATIDA[b.campo] || b.campo}</td>
    <td>${b.como === "rosto" ? "👤 Rosto" : b.como === "pin" ? "🔢 PIN" : "✍ Manual"}</td>
    <td class="num">${b.nota ? b.nota + "%" : "—"}</td>
  </tr>`).join("") || `<tr><td colspan="5" class="miudo">Nenhuma batida neste dia.</td></tr>`;
}


/* ------------------- folha de ponto do funcionário ------------------ */
let folhaFuncId = null, folhaPeriodo = "hoje"; // "hoje" | "mes"

function ehDiaUtil(iso) {
  if (estado.feriados.some(x => x.data === iso)) return false;
  return estado.diasUteis.includes(deISO(iso).getDay());
}
function minutosJornada() {
  const j = estado.jornada;
  const e = paraMin(j.entrada), a = paraMin(j.almoco), r = paraMin(j.retorno), s = paraMin(j.saida);
  if ([e, a, r, s].some(v => v === null)) return 480;
  return Math.max(0, (a - e) + (s - r));
}

/** Monta o dia de uma pessoa com as batidas (na ordem em que foram feitas). */
function diaDoFunc(iso, func) {
  const bs = batidasDoFunc(iso, func.id);
  const r = { entrada: "", almoco: "", retorno: "", saida: "", extras: [] };
  bs.forEach(b => {
    if (CAMPOS_BATIDA.includes(b.campo) && !r[b.campo]) r[b.campo] = b.hora;
    else r.extras.push(b);
  });
  const e = paraMin(r.entrada), a = paraMin(r.almoco), ret = paraMin(r.retorno), s = paraMin(r.saida);
  let trab = 0;
  if (e !== null && a !== null) trab += Math.max(0, a - e);
  if (ret !== null && s !== null) trab += Math.max(0, s - ret);
  if (e !== null && s !== null && a === null && ret === null) trab = Math.max(0, s - e);
  const util = ehDiaUtil(iso);
  const previsto = util ? minutosJornada() : 0;
  const dif = trab - previsto;
  const tol = Number(estado.toleranciaMin) || 0;
  const saldo = Math.abs(dif) <= tol ? 0 : dif;
  let extra50 = 0, extra100 = 0, atraso = 0;
  if (!util) extra100 = trab;
  else if (saldo > 0) { extra50 = Math.min(saldo, 120); extra100 = Math.max(0, saldo - 120); }
  else if (saldo < 0) atraso = -saldo;
  return { iso, ...r, trab, previsto, saldo, extra50, extra100, atraso, util, aberto: !!(r.entrada && !r.saida) };
}

function abrirFolha(funcId) {
  folhaFuncId = funcId || folhaFuncId;
  if (!folhaFuncId) { toast("Escolha o funcionário."); return; }
  $("#telaFolha").classList.remove("oculto");
  const sel = $("#folhaFunc");
  sel.innerHTML = estado.funcionarios.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join("");
  sel.value = folhaFuncId;
  renderFolha();
}

function fecharFolha() {
  $("#telaFolha").classList.add("oculto");
}

function renderFolha() {
  const f = funcPorId(folhaFuncId);
  const area = $("#folhaArea");
  if (!f) { area.innerHTML = `<p class="miudo">Nenhum funcionário escolhido.</p>`; return; }
  const hoje = hojeISO();
  let de, ate;
  if (folhaPeriodo === "hoje") { de = ate = hoje; }
  else {
    const d = deISO(hoje);
    de = isoData(new Date(d.getFullYear(), d.getMonth(), 1));
    ate = isoData(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  // dias a mostrar: no "mês" só até hoje; no "hoje", o próprio dia
  const dias = [];
  for (let d = deISO(de); isoData(d) <= ate; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const iso = isoData(d);
    if (iso > hoje) break;
    dias.push(iso);
  }

  const totais = { trab: 0, previsto: 0, extra50: 0, extra100: 0, atraso: 0, saldo: 0, faltas: 0, diasTrab: 0 };
  const linhas = dias.map(iso => {
    const x = diaDoFunc(iso, f);
    const dd = deISO(iso);
    const pend = x.aberto ? `<span class="st-incompleto">Falta bater a saída</span>` : "";
    let marca = "";
    if (!x.entrada && !x.trab && x.util && iso !== hoje) { marca = "Falta"; totais.faltas++; }
    if (x.trab > 0) totais.diasTrab++;
    totais.trab += x.trab; totais.previsto += x.previsto; totais.extra50 += x.extra50;
    totais.extra100 += x.extra100; totais.atraso += x.atraso; totais.saldo += x.saldo;
    const extras = x.extras.length ? x.extras.map(b => `${b.hora} (${ROTULO_BATIDA[b.campo] || b.campo})`).join(", ") : "";
    return `<tr class="${iso === hoje ? "hoje" : ""}">
      <td>${pad(dd.getDate())}/${pad(dd.getMonth() + 1)}</td>
      <td>${DIAS_CURTOS[dd.getDay()]}</td>
      <td>${x.entrada || marca || "—"}</td>
      <td>${x.almoco || ""}</td>
      <td>${x.retorno || ""}</td>
      <td>${x.saida || ""}</td>
      <td>${x.previsto ? deMin(x.previsto) : "—"}</td>
      <td>${x.trab ? deMin(x.trab) : "—"}</td>
      <td>${x.extra50 ? deMin(x.extra50) : ""}</td>
      <td>${x.extra100 ? deMin(x.extra100) : ""}</td>
      <td>${x.atraso ? deMin(x.atraso) : ""}</td>
      <td>${x.saldo ? deMin(x.saldo) : ""}</td>
      <td class="esq">${pend}${extras ? " " + esc(extras) : ""}</td>
    </tr>`;
  }).join("");

  const dia = diaDoFunc(hoje, f);
  const proxima = proximaBatida(f.id);
  const pendencias = folhaPeriodo === "hoje"
    ? (proxima ? `Próxima batida: <b>${ROTULO_BATIDA[proxima]}</b> — a folha muda assim que você bater.` : "As 4 batidas de hoje já foram registradas. ✅")
    : `${totais.faltas} falta(s) · saldo do mês ${deMin(totais.saldo)}`;

  const titulo = folhaPeriodo === "hoje"
    ? `${DIAS_SEM[deISO(hoje).getDay()]}, ${brData(hoje)}`
    : `${MESES[deISO(hoje).getMonth()]} / ${deISO(hoje).getFullYear()}`;
  $("#folhaTitulo").textContent = "Folha de ponto — " + f.nome;
  $("#folhaSub").textContent = titulo + " · atualizada às " + horaExata();

  area.innerHTML = `
  <div class="folha">
    <div class="folha-cabeca">
      <div style="display:flex; gap:14px; align-items:center">
        <img src="logo-cas-facial.png" alt="CAS">
        <div>
          <h3>${esc(estado.empresa || "Minha Empresa")}</h3>
          <div class="selo">Registro de ponto — Ponto Facial</div>
          <div><b>${esc(f.nome)}</b>${f.cargo ? " · " + esc(f.cargo) : ""}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div><b>${esc(titulo)}</b></div>
        <div class="selo">Emitida às ${horaExata()}</div>
        <div>Jornada diária: ${deMin(minutosJornada())}</div>
      </div>
    </div>
    <div class="folha-quem">
      <div>Horas trabalhadas: <b>${deMin(totais.trab)}</b></div>
      <div>Previsto: <b>${deMin(totais.previsto)}</b></div>
      <div>Extras 50%: <b>${deMin(totais.extra50)}</b></div>
      <div>Extras 100%: <b>${deMin(totais.extra100)}</b></div>
      <div>Atrasos: <b>${deMin(totais.atraso)}</b></div>
      <div>Saldo: <b>${deMin(totais.saldo)}</b></div>
    </div>
    <table>
      <thead><tr>
        <th>Dia</th><th>Sem</th><th>Entrada</th><th>Saída almoço</th><th>Retorno</th><th>Saída</th>
        <th>Previsto</th><th>Trabalhado</th><th>E. 50%</th><th>E. 100%</th><th>Atraso</th><th>Saldo</th><th>Observação</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr>
        <td colspan="6" class="esq">Totais — ${totais.diasTrab} dia(s) trabalhado(s)</td>
        <td>${deMin(totais.previsto)}</td><td>${deMin(totais.trab)}</td><td>${deMin(totais.extra50)}</td>
        <td>${deMin(totais.extra100)}</td><td>${deMin(totais.atraso)}</td><td>${deMin(totais.saldo)}</td><td></td>
      </tr></tfoot>
    </table>
    <div class="pendencias">${pendencias}</div>
    <div class="assin">
      <div>Assinatura do funcionário</div>
      <div>Assinatura do empregador</div>
    </div>
  </div>`;
}

function renderUltimos() {
  const lista = batidasDoDia(hojeISO()).slice().sort((a, b) => b.hora.localeCompare(a.hora)).slice(0, 6);
  $("#listaUltimos").innerHTML = lista.map(b => `<div class="ultimo">
    <span class="u-hora">${b.hora}</span>
    <span class="u-nome">${esc(b.nome)}</span>
    <span class="u-bat">${ROTULO_BATIDA[b.campo] || b.campo}</span>
  </div>`).join("") || `<p class="miudo">Nenhuma batida hoje ainda.</p>`;
}

/** Exporta as batidas no formato que o Ponto Livre importa. */
function exportarParaPontoLivre() {
  const registros = {};
  estado.batidas.forEach(b => {
    const f = funcPorNome(b.nome);
    const nomeChave = f ? f.nome : b.nome;
    if (!registros[b.data]) registros[b.data] = {};
    if (!registros[b.data][nomeChave]) registros[b.data][nomeChave] = { entrada: "", almoco: "", retorno: "", saida: "", obs: "", tipo: "" };
    const r = registros[b.data][nomeChave];
    if (CAMPOS_BATIDA.includes(b.campo) && !r[b.campo]) r[b.campo] = b.hora;
  });
  const saida = {
    origem: "Ponto Facial",
    geradoEm: new Date().toISOString(),
    empresa: estado.empresa,
    funcionarios: estado.funcionarios.map(f => ({ nome: f.nome, cargo: f.cargo || "" })), // sem fotos
    registros
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(saida, null, 2)], { type: "application/json" }));
  a.download = `ponto-facial-para-ponto-livre-${hojeISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Arquivo gerado. No Ponto Livre: Funcionários → Importar lista / Ajustes → Importar.");
}

/* -------------------------- importar ----------------------------- */
function importarArquivo(file) {
  const leitor = new FileReader();
  leitor.onload = () => {
    try {
      const o = JSON.parse(leitor.result);
      let nomes = [];
      if (Array.isArray(o.funcionarios)) {
        nomes = o.funcionarios.map(f => typeof f === "string" ? { nome: f, cargo: "" } : { nome: f.nome, cargo: f.cargo || "" });
      } else if (Array.isArray(o.lista)) {
        nomes = o.lista.map(p => ({ nome: Array.isArray(p) ? p[0] : p.nome, cargo: Array.isArray(p) ? p[1] : p.cargo || "" }));
      } else if (o.registros && typeof o.registros === "object") {
        const set = new Set();
        Object.values(o.registros).forEach(dia => Object.keys(dia || {}).forEach(n => set.add(n)));
        nomes = Array.from(set).map(n => ({ nome: n, cargo: "" }));
      }
      if (!nomes.length) throw new Error("não encontrei nomes de funcionários no arquivo");
      let novos = 0;
      nomes.forEach(n => { if (n.nome && !funcPorNome(n.nome)) { garantirFunc(n.nome, n.cargo); novos++; } });
      salvar(); renderRostos();
      toast(novos ? `${novos} funcionário(s) importado(s).` : "Todos já estavam na lista.");
    } catch (e) {
      alert("Não foi possível importar: " + e.message);
    }
  };
  leitor.readAsText(file);
}

function exportarBackup() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(estado, null, 2)], { type: "application/json" }));
  a.download = `ponto-facial-backup-${hojeISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Backup completo gerado.");
}

/* --------------------------- navegação --------------------------- */
function mostrarApp() {
  $("#telaAcesso").classList.add("oculto");
  $("#app").classList.remove("oculto");
  $("#nomeEmpresa").textContent = estado.empresa || "Minha Empresa";
  const tick = () => { $("#relogio").textContent = horaSeg(); };
  tick(); setInterval(tick, 1000);
  renderUltimos();
  setStatus("Toque em “Abrir câmera e bater ponto”");
  if (estado.funcionarios.length) $("#btnAcessoRH").classList.add("oculto");
}

function abrirRH() {
  if (cameraAberta) fecharCamera();
  fecharFolha();
  if (location.hash !== "#rh") history.replaceState(null, "", location.pathname + location.search + "#rh");
  const btn = $("#btnMenu");
  if (btn) { btn.textContent = "📷 Ponto"; btn.title = "Voltar ao modo câmera"; }
  const link = $("#linkRH");
  if (link) link.textContent = location.origin + location.pathname + "#rh";
  fecharResultado();
  $("#telaTerminal").classList.add("oculto");
  $("#telaRH").classList.remove("oculto");
  $("#batData").value = hojeISO();
  renderRostos(); renderBatidas(); preencherConfig();
}
function fecharRH() {
  $("#telaRH").classList.add("oculto");
  $("#telaTerminal").classList.remove("oculto");
  if (location.hash === "#rh") history.replaceState(null, "", location.pathname + location.search);
  const btn = $("#btnMenu");
  if (btn) { btn.textContent = "☰"; btn.title = "Painel do RH"; }
  if (folhaFuncId && !$("#telaFolha").classList.contains("oculto")) renderFolha();
  renderUltimos();
}
function preencherConfig() {
  $("#cfgEmpresa").value = estado.empresa || "";
  $("#cfgLimiar").value = estado.limiar;
  $("#cfgMotor").value = estado.motor;
  atualizarStatusIA();
}
function atualizarStatusIA() {
  $("#statusIA").textContent = Facial.iaPronta() ? "Modelo de IA pronto (guardado no aparelho)." : "Modelo de IA ainda não baixado.";
}

/* ---------------------------- modal ------------------------------- */
function abrirModal(titulo, html) {
  $("#modalTitulo").textContent = titulo;
  $("#modalCorpo").innerHTML = html;
  $("#modal").classList.remove("oculto");
}
function fecharModal() {
  const v = $("#videoCad");
  if (v && v._stream) v._stream.getTracks().forEach(t => t.stop());
  $("#modal").classList.add("oculto");
  $("#modalCorpo").innerHTML = "";
}

/* --------------------------- instalação --------------------------- */
let eventoInstalar = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); eventoInstalar = e;
  $("#btnInstalar").classList.remove("oculto");
});

/* ---------------------------- eventos ----------------------------- */
function ligarEventos() {
  $("#btnAcessoRH").addEventListener("click", () => { mostrarApp(); abrirRH(); });
  $("#btnMenu").addEventListener("click", () => { $("#telaRH").classList.contains("oculto") ? abrirRH() : fecharRH(); });
  const btnCopiar = $("#btnCopiarLinkRH");
  if (btnCopiar) btnCopiar.addEventListener("click", async () => {
    const link = location.origin + location.pathname + "#rh";
    try { await navigator.clipboard.writeText(link); toast("Link do RH copiado: " + link, 5000); }
    catch (e) { prompt("Copie o link do RH:", link); }
  });
  $("#btnAbrirFolha").addEventListener("click", () => {
    const lista = estado.funcionarios.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (!lista.length) { toast("Nenhum funcionário cadastrado ainda."); return; }
    const f = folhaFuncId ? funcPorId(folhaFuncId) : null;
    abrirFolha(f ? f.id : lista[0].id);
    $("#folhaArea").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#btnFolhaFechar").addEventListener("click", () => { fecharFolha(); if (cameraAberta) iniciarLoop(); });
  $("#btnFolhaHoje").addEventListener("click", () => { folhaPeriodo = "hoje"; renderFolha(); });
  $("#btnFolhaMes").addEventListener("click", () => { folhaPeriodo = "mes"; renderFolha(); });
  $("#btnFolhaPDF").addEventListener("click", () => window.print());
  $("#folhaFunc").addEventListener("change", e => { folhaFuncId = e.target.value; renderFolha(); });
  $("#btnCamera").addEventListener("click", abrirCamera);
  $("#btnTrocarCamera").addEventListener("click", () => {
    frontal = !frontal; fecharCamera(); abrirCamera();
  });
  $("#btnPIN").addEventListener("click", abrirPIN);
  $("#btnFecharModal").addEventListener("click", fecharModal);
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal") fecharModal(); });

  $("#btnInstalar").addEventListener("click", async () => {
    if (!eventoInstalar) { toast("No menu do navegador escolha “Adicionar à tela inicial”.", 4000); return; }
    eventoInstalar.prompt();
    await eventoInstalar.userChoice.catch(() => {});
    eventoInstalar = null;
    $("#btnInstalar").classList.add("oculto");
  });

  $$(".tab").forEach(b => b.addEventListener("click", () => {
    $$(".tab").forEach(x => x.classList.toggle("ativo", x === b));
    $$(".painel").forEach(p => p.classList.toggle("oculto", p.id !== "tab-" + b.dataset.tab));
  }));

  $("#buscaFunc").addEventListener("input", renderRostos);
  $("#listaRostos").addEventListener("click", e => {
    const c = e.target.closest("[data-cad]"), p = e.target.closest("[data-pin]"), a = e.target.closest("[data-apagar]");
    if (c) iniciarCadastro(c.dataset.cad);
    if (p) definirPIN(p.dataset.pin);
    if (a) {
      const f = funcPorId(a.dataset.apagar);
      if (f && confirm(`Apagar o rosto de ${f.nome}? As batidas já registradas continuam.`)) {
        delete f.perfil; salvar(); renderRostos();
      }
    }
  });
  $("#batData").addEventListener("change", renderBatidas);
  $("#btnExportar").addEventListener("click", exportarParaPontoLivre);

  $("#cfgEmpresa").addEventListener("change", e => { estado.empresa = e.target.value.trim(); salvar(); $("#nomeEmpresa").textContent = estado.empresa || "Minha Empresa"; });
  $("#cfgLimiar").addEventListener("change", e => { estado.limiar = Math.max(50, Math.min(95, Number(e.target.value) || 70)); e.target.value = estado.limiar; salvar(); });
  $("#cfgMotor").addEventListener("change", e => { estado.motor = e.target.value; salvar(); });
  $("#btnBaixarIA").addEventListener("click", async () => {
    $("#btnBaixarIA").disabled = true;
    $("#statusIA").textContent = "Baixando o modelo (precisa de internet, só a primeira vez)…";
    try { await Facial.carregarIA(); toast("Modelo de IA pronto."); }
    catch (e) { toast("Não foi possível baixar o modelo: verifique a internet.", 4000); }
    $("#btnBaixarIA").disabled = false;
    atualizarStatusIA();
  });
  $("#btnExportarBackup").addEventListener("click", exportarBackup);
  $("#btnImportarBackup").addEventListener("click", () => $("#fileBackup").click());
  $("#fileBackup").addEventListener("change", e => { const f = e.target.files[0]; if (f) importarArquivo(f); e.target.value = ""; });
  $("#btnSairRH").addEventListener("click", fecharRH);
  window.addEventListener("beforeunload", () => { if (stream) stream.getTracks().forEach(t => t.stop()); });
}

/* ---------------------------- partida ----------------------------- */
ligarEventos();
mostrarApp();
if (location.hash === "#rh") {
  abrirRH();
  // se o endereço mudar à mão (link ...#rh ou sem nada), acompanha
  window.addEventListener("hashchange", () => {
    if (location.hash === "#rh") abrirRH(); else fecharRH();
  });
}
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("sw.js").catch(e => console.warn("Service worker não registrou:", e));
}
})();
