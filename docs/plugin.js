// Código que roda dentro do Penpot (tem acesso ao objeto `penpot`).
// Para testar localmente, troque por "http://localhost:4408/index.html".
const UI_URL = "https://studioreviofc-wq.github.io/penpot-image-tune/index.html";
penpot.ui.open("Image Tune", `${UI_URL}?theme=${penpot.theme}`, { width: 320, height: 820 });

// Edição não destrutiva: a imagem original continua na lista de preenchimentos
// (com opacidade 0) e a versão ajustada fica por cima. Os ajustes ficam salvos na
// própria camada, então dá para reabrir, reajustar ou restaurar o original depois.
const KEY = "imagetune";

function fillsOf(shape) {
  return Array.isArray(shape.fills) ? shape.fills : [];
}

function readMeta(shape) {
  try {
    const raw = shape.getPluginData(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writeMeta(shape, meta) {
  shape.setPluginData(KEY, meta ? JSON.stringify(meta) : "");
}

const idxById = (fills, id) => fills.findIndex((f) => f && f.fillImage && f.fillImage.id === id);

// Descobre onde estão a original e a ajustada. Se a camada foi alterada fora do
// plugin e a original sumiu, a edição antiga é descartada.
function locate(shape) {
  const fills = fillsOf(shape);
  const meta = readMeta(shape);
  if (meta) {
    const o = idxById(fills, meta.orig);
    if (o >= 0) return { fills, meta, origIdx: o, adjIdx: idxById(fills, meta.adj) };
  }
  const first = fills.findIndex((f) => f && f.fillImage);
  return first >= 0 ? { fills, meta: null, origIdx: first, adjIdx: -1 } : null;
}

function selectionInfo() {
  const images = [];
  for (const s of penpot.selection) {
    const loc = locate(s);
    if (!loc) continue;
    const img = loc.fills[loc.origIdx].fillImage;
    images.push({
      id: s.id, name: s.name, width: img.width, height: img.height,
      edited: !!loc.meta, settings: loc.meta ? loc.meta.settings : null,
    });
  }
  return { images };
}

function findShape(id) {
  return penpot.selection.find((s) => s.id === id) ||
    (penpot.currentPage ? penpot.currentPage.getShapeById(id) : null);
}

function reply(reqId, data) { penpot.ui.sendMessage({ type: "reply", reqId, ...data }); }

async function getImage(shapeId) {
  const shape = findShape(shapeId);
  if (!shape) throw new Error("NOT_FOUND");
  const loc = locate(shape);
  if (!loc) throw new Error("NO_IMAGE");
  const img = loc.fills[loc.origIdx].fillImage;
  return { bytes: await img.data(), mtype: img.mtype || "image/png", settings: loc.meta ? loc.meta.settings : null };
}

async function setImage(shapeId, bytes, mtype, mode, name, settings) {
  const shape = findShape(shapeId);
  if (!shape) throw new Error("NOT_FOUND");
  const loc = locate(shape);
  if (!loc) throw new Error("NO_IMAGE");
  const uploaded = await penpot.uploadMediaData(name || "image-tune", bytes, mtype);
  const next = loc.fills.slice();
  const orig = next[loc.origIdx];

  if (mode === "replace") {
    // Achata: a ajustada vira a única imagem e a original sai da camada.
    const opacity = loc.meta ? loc.meta.origOpacity : (orig.fillOpacity ?? 1);
    const out = next.filter((_, i) => i !== loc.adjIdx);
    out[out.indexOf(orig)] = { fillOpacity: opacity, fillImage: uploaded };
    shape.fills = out;
    writeMeta(shape, null);
    return;
  }

  const origOpacity = loc.meta ? loc.meta.origOpacity : (orig.fillOpacity ?? 1);
  const adjusted = { fillOpacity: origOpacity, fillImage: uploaded };
  if (loc.adjIdx >= 0) {
    next[loc.adjIdx] = adjusted;
  } else {
    next[loc.origIdx] = { ...orig, fillOpacity: 0 };
    next.splice(loc.origIdx, 0, adjusted); // fica imediatamente acima da original
  }
  shape.fills = next;
  writeMeta(shape, { orig: orig.fillImage.id, adj: uploaded.id, origOpacity, settings });
}

function restore(shapeId) {
  const shape = findShape(shapeId);
  if (!shape) throw new Error("NOT_FOUND");
  const loc = locate(shape);
  if (!loc || !loc.meta) return;
  const next = loc.fills.map((f, i) => (i === loc.origIdx ? { ...f, fillOpacity: loc.meta.origOpacity } : f))
    .filter((_, i) => i !== loc.adjIdx);
  shape.fills = next;
  writeMeta(shape, null);
}

const sendSelection = () => penpot.ui.sendMessage({ type: "selection", ...selectionInfo() });

penpot.ui.onMessage(async (msg) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "ready") {
    penpot.ui.sendMessage({ type: "theme", theme: penpot.theme });
    sendSelection();
    return;
  }

  const { reqId } = msg;
  try {
    if (msg.type === "get-image") {
      reply(reqId, await getImage(msg.shapeId));
    } else if (msg.type === "set-image") {
      await setImage(msg.shapeId, msg.bytes, msg.mtype, msg.mode, msg.name, msg.settings);
      reply(reqId, { ok: true });
    } else if (msg.type === "restore") {
      restore(msg.shapeId);
      reply(reqId, { ok: true });
    } else if (msg.type === "refresh") {
      sendSelection();
      reply(reqId, { ok: true });
    }
  } catch (err) {
    reply(reqId, { error: String((err && err.message) || err) });
  }
});

penpot.on("selectionchange", sendSelection);

penpot.on("themechange", (theme) => {
  penpot.ui.sendMessage({ type: "theme", theme });
});
