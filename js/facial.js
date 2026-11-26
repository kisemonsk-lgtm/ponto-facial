/* =====================================================================
   Motor de reconhecimento facial — 100% no aparelho, sem servidor.
   - "local": histogramas de cor + textura (instantâneo, sem download)
   - "ia": descritor com o modelo FaceNet (face-api/tiny_face_detector,
     baixado uma única vez e guardado no cache do navegador)
   Nada é enviado para lugar nenhum: as fotos ficam no próprio tablet.
   ===================================================================== */
(function () {
"use strict";

const CDN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/";
const MODELOS = CDN + "model/";

/* ---------------------------- captura ---------------------------- */
function tirarFoto(video) {
  const vw = video.videoWidth || 0, vh = video.videoHeight || 0;
  if (!vw || !vh) return null;
  const lado = Math.min(vw, vh);
  const c = document.createElement("canvas");
  c.width = 160; c.height = 160;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  // recorta o quadrado central e espelha, para ficar igual ao que a pessoa vê
  ctx.translate(c.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, (vw - lado) / 2, (vh - lado) / 2, lado, lado, 0, 0, c.width, c.height);
  return c;
}

/* ---------------------- descritor "local" ------------------------ */
function descritorLocal(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const dados = ctx.getImageData(0, 0, w, h).data;

  // 1) histograma de matizes e saturação
  const matiz = new Float32Array(12), sat = new Float32Array(3), val = new Float32Array(3);
  // 2) grade 4×4 de luminância normalizada (textura / formato do rosto)
  const grade = new Float32Array(16);
  const contagem = new Float32Array(16);
  let n = 0;

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const r = dados[i] / 255, g = dados[i + 1] / 255, b = dados[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let hu = 0;
      if (d > 0.0001) {
        if (mx === r) hu = ((g - b) / d) % 6;
        else if (mx === g) hu = (b - r) / d + 2;
        else hu = (r - g) / d + 4;
        hu *= 60; if (hu < 0) hu += 360;
      }
      matiz[Math.min(11, Math.floor(hu / 30))] += d > 0.05 ? 1 : 0;
      const s = mx > 0 ? d / mx : 0;
      sat[Math.min(2, Math.floor(s * 3))]++;
      val[Math.min(2, Math.floor(mx * 3))]++;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const gx = Math.min(3, Math.floor(x / w * 4)), gy = Math.min(3, Math.floor(y / h * 4));
      grade[gy * 4 + gx] += lum;
      contagem[gy * 4 + gx]++;
      n++;
    }
  }
  const vet = [];
  const somaH = matiz.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < 12; i++) vet.push(matiz[i] / somaH);
  for (let i = 0; i < 3; i++) vet.push(sat[i] / n);
  for (let i = 0; i < 3; i++) vet.push(val[i] / n);
  const medias = [];
  for (let i = 0; i < 16; i++) {
    const m = contagem[i] ? grade[i] / contagem[i] : 0;
    medias.push(m);
  }
  const media = medias.reduce((a, b) => a + b, 0) / 16;
  const desvio = Math.sqrt(medias.reduce((a, b) => a + (b - media) ** 2, 0) / 16) || 1;
  for (let i = 0; i < 16; i++) vet.push((medias[i] - media) / desvio);
  return vet;
}

/* ------------------------ descritor "ia" ------------------------- */
let faceapi = null, iaPronta = false, iaCarregando = null;

async function carregarIA() {
  if (iaPronta) return true;
  if (iaCarregando) return iaCarregando;
  iaCarregando = (async () => {
    const carregar = src => new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = src; s.async = true; s.onload = ok; s.onerror = () => falha(new Error("não foi possível baixar " + src));
      document.head.appendChild(s);
    });
    await carregar(CDN + "face-api.js");
    faceapi = window.faceapi;
    if (!faceapi) throw new Error("modelo não carregou");
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODELOS);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELOS);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODELOS);
    iaPronta = true;
    return true;
  })();
  try { return await iaCarregando; } finally { iaCarregando = null; }
}

async function descritorIA(canvas) {
  if (!(await carregarIA())) return null;
  const opcoes = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 });
  const r = await faceapi.detectSingleFace(canvas, opcoes).withFaceLandmarks(true).withFaceDescriptor();
  if (!r) return null;
  return Array.from(r.descriptor);
}

/* --------------------------- comparação -------------------------- */
function cosseno(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

/** Similaridade 0..1 entre dois rostos. No modo IA a distância vira nota. */
function similaridade(desA, desB, modo) {
  if (!desA || !desB || !desA.length) return 0;
  if (modo === "ia") {
    // distância euclidiana do FaceNet: 0 = idêntico, 0.6 ≈ limite usual
    let soma = 0;
    for (let i = 0; i < desA.length; i++) soma += (desA[i] - desB[i]) ** 2;
    const dist = Math.sqrt(soma);
    return Math.max(0, Math.min(1, 1 - dist / 1.2));
  }
  const c = cosseno(desA, desB);           // -1..1
  return Math.max(0, (c + 1) / 2);
}

window.Facial = {
  tirarFoto,
  descritorLocal,
  descritorIA,
  carregarIA,
  iaPronta: () => iaPronta,
  similaridade,
  /** Identifica: devolve { funcId, nota } do melhor candidato acima do limiar. */
  identificar(descritor, perfis, modo, limiar) {
    let melhor = null;
    (perfis || []).forEach(p => {
      if (!p.descritores || !p.descritores.length) return;
      let nota = 0;
      p.descritores.forEach(d => { nota = Math.max(nota, similaridade(descritor, d, modo)); });
      if (!melhor || nota > melhor.nota) melhor = { funcId: p.funcId, nome: p.nome, nota };
    });
    if (!melhor) return null;
    melhor.nota = Math.round(melhor.nota * 100);
    return melhor.nota >= (limiar || 70) ? melhor : null;
  }
};
})();
