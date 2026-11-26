const fs = require("fs");
const TOKEN = process.env.GH_TOKEN;
const DONO = "kisemonsk-lgtm", REPO = "ponto-facial", BRANCO = "main";
const arquivos = JSON.parse(fs.readFileSync("payload.json", "utf8"));

async function api(caminho, metodo, corpo) {
  const r = await fetch("https://api.github.com" + caminho, {
    method: metodo || "GET",
    headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github+json", "User-Agent": "ponto-facial-upload", "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const txt = await r.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = { raw: txt }; }
  return { ok: r.ok, status: r.status, json };
}

(async () => {
  // 1) commit único com todos os arquivos (API Git Data: blobs -> tree -> commit -> ref)
  // repositório vazio: cria o primeiro arquivo (README) para o branch existir
  let base = await api(`/repos/${DONO}/${REPO}/git/ref/heads/${BRANCO}`);
  if (!base.ok) {
    const primeiro = await api(`/repos/${DONO}/${REPO}/contents/README.md`, "PUT", {
      message: "Início do repositório", content: Buffer.from("# Ponto Facial\n").toString("base64"), branch: BRANCO
    });
    if (!primeiro.ok) { console.error("falha primeiro arquivo", primeiro.status, JSON.stringify(primeiro.json).slice(0, 300)); process.exit(1); }
    base = await api(`/repos/${DONO}/${REPO}/git/ref/heads/${BRANCO}`);
  }
  const pai = base.ok ? base.json.object.sha : null;
  console.log("branch base:", pai);
  const blobs = [];
  for (const a of arquivos) {
    const b = await api(`/repos/${DONO}/${REPO}/git/blobs`, "POST", { content: a.conteudo, encoding: "base64" });
    if (!b.ok) { console.error("falha no blob", a.path, b.status, JSON.stringify(b.json).slice(0, 200)); process.exit(1); }
    blobs.push({ path: a.path, mode: "100644", type: "blob", sha: b.json.sha });
    process.stdout.write(".");
  }
  console.log("\nblobs:", blobs.length);
  const tree = await api(`/repos/${DONO}/${REPO}/git/trees`, "POST", { tree: blobs });
  if (!tree.ok) { console.error("falha tree", tree.status, JSON.stringify(tree.json).slice(0, 300)); process.exit(1); }
  const commit = await api(`/repos/${DONO}/${REPO}/git/commits`, "POST", {
    message: "Ponto Facial: app de ponto por reconhecimento facial para tablet (logo CAS)",
    tree: tree.json.sha,
    parents: pai ? [pai] : []
  });
  if (!commit.ok) { console.error("falha commit", commit.status, JSON.stringify(commit.json).slice(0, 300)); process.exit(1); }
  const ref = pai
    ? await api(`/repos/${DONO}/${REPO}/git/refs/heads/${BRANCO}`, "PATCH", { sha: commit.json.sha, force: true })
    : await api(`/repos/${DONO}/${REPO}/git/refs`, "POST", { ref: `refs/heads/${BRANCO}`, sha: commit.json.sha });
  if (!ref.ok) { console.error("falha ref", ref.status, JSON.stringify(ref.json).slice(0, 300)); process.exit(1); }
  console.log("commit:", commit.json.sha, "→", `https://github.com/${DONO}/${REPO}`);

  // 2) GitHub Pages pelo Actions
  const pages = await api(`/repos/${DONO}/${REPO}/pages`, "POST", { build_type: "workflow" });
  console.log("pages:", pages.status, pages.ok ? "ativado" : JSON.stringify(pages.json).slice(0, 200));
})();
