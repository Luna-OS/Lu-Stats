// Selbst gezeichnete Pixelgrafik: Tab-Hintergründe, Advancement-Rahmen, Item-Symbole, Avatare.
// Alles wird zur Laufzeit auf ein <canvas> gemalt und als data:-URL zwischengespeichert. Keine Texturen von Mojang.

const cache = new Map();
function memo(key, make) {
  let v = cache.get(key);
  if (v === undefined) { v = make(); cache.set(key, v); }
  return v;
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  return [c, g];
}
function hex(c) { return typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : c; }
function rgb(c) { const n = parseInt(hex(c).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toHex([r, g, b]) { return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join(""); }
export function shade(c, f) { const [r, g, b] = rgb(c); return f >= 0 ? toHex([r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f]) : toHex([r * (1 + f), g * (1 + f), b * (1 + f)]); }
function pick(r, pal, weights) {
  if (!weights) return pal[Math.floor(r() * pal.length)];
  let x = r() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pal.length; i++) { x -= weights[i]; if (x <= 0) return pal[i]; }
  return pal[pal.length - 1];
}

// ---------------------------------------------------------------- Tab-Hintergründe (16×16, kachelbar)

function noise(g, r, pal, weights, w = 16, h = 16, y0 = 0) {
  for (let y = y0; y < y0 + h; y++) for (let x = 0; x < w; x++) { g.fillStyle = pick(r, pal, weights); g.fillRect(x, y, 1, 1); }
}
function strokes(g, r, colors, n, len = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const x = Math.floor(r() * 16), y = Math.floor(r() * 16), horiz = r() < 0.6;
    for (let k = 0; k < len; k++) g.fillRect((x + (horiz ? k : 0)) % 16, (y + (horiz ? 0 : k)) % 16, 1, 1);
  }
}
function planks(g, r, base, y0 = 0, rows = 4) {
  const light = shade(base, 0.12), dark = shade(base, -0.18), seam = shade(base, -0.38);
  for (let p = 0; p < rows; p++) {
    const top = y0 + p * 4;
    for (let y = top; y < top + 4; y++) for (let x = 0; x < 16; x++) {
      g.fillStyle = y === top + 3 ? seam : pick(r, [base, light, dark], [6, 2, 2]);
      g.fillRect(x, y, 1, 1);
    }
    const cut = (p * 7 + 3) % 16;
    g.fillStyle = seam;
    g.fillRect(cut, top, 1, 3);
  }
}
function cobble(g, r, fills, line, moss) {
  g.fillStyle = line; g.fillRect(0, 0, 16, 16);
  const cells = [[1, 1, 6, 4], [8, 0, 7, 5], [0, 6, 4, 5], [5, 6, 6, 4], [12, 6, 4, 5], [1, 12, 5, 4], [7, 11, 6, 5], [14, 12, 2, 3]];
  for (const [x, y, w, h] of cells) {
    for (let yy = y; yy < y + h - 1; yy++) for (let xx = x; xx < x + w - 1; xx++) {
      g.fillStyle = pick(r, fills, [5, 3, 2]);
      if (moss && r() < 0.28) g.fillStyle = pick(r, moss);
      g.fillRect(xx % 16, yy % 16, 1, 1);
    }
    g.fillStyle = shade(fills[0], 0.25); g.fillRect(x, y, Math.max(1, w - 2), 1);
  }
}

const TILES = {
  stone: (g, r) => { noise(g, r, ["#7f7f7f", "#757575", "#8b8b8b", "#6c6c6c", "#959595"], [6, 4, 3, 2, 1]); strokes(g, r, ["#666666", "#9a9a9a"], 9, 3); },
  dirt: (g, r) => { noise(g, r, ["#866043", "#79553a", "#96704f", "#5f4430", "#a07b5b"], [5, 4, 3, 2, 1]); },
  snow: (g, r) => { noise(g, r, ["#f0fbfb", "#e4f2f4", "#ffffff", "#d5e8ee"], [5, 4, 3, 1]); },
  oak_planks: (g, r) => planks(g, r, "#a8834c"),
  bedrock: (g, r) => { noise(g, r, ["#575757", "#2e2e2e", "#7a7a7a", "#141414", "#444444"], [4, 4, 2, 2, 3]); strokes(g, r, ["#0a0a0a", "#8a8a8a"], 8, 2); },
  obsidian: (g, r) => { noise(g, r, ["#14101e", "#1e1530", "#0d0a14", "#271c3d"], [5, 4, 3, 2]); strokes(g, r, ["#4b3473", "#3b2a5a"], 7, 2); },
  husbandry: (g, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      g.fillStyle = y === 3 || y === 12 ? pick(r, ["#7a3d17", "#8f4b1e"]) : (x % 3 === 0 ? pick(r, ["#a8861c", "#b8952a"]) : pick(r, ["#c7a52a", "#dcbf4a", "#d1b23a"]));
      g.fillRect(x, y, 1, 1);
    }
  },
  mossy_cobblestone: (g, r) => cobble(g, r, ["#8a8a8a", "#7a7a7a", "#9c9c9c"], "#4c4c4c", ["#5d7a3a", "#6f8f45", "#4f6a30"]),
  cobblestone: (g, r) => cobble(g, r, ["#8a8a8a", "#7a7a7a", "#9c9c9c"], "#4c4c4c"),
  glowstone: (g, r) => { noise(g, r, ["#f9d49c", "#c2914d", "#ffe9b5", "#a87232", "#e8b46a"], [4, 3, 2, 2, 3]); strokes(g, r, ["#fff4d6"], 6, 2); },
  piston_side: (g, r) => { planks(g, r, "#9c7f4e", 0, 1); cobbleRows(g, r, 4); },
  loom_side: (g, r) => { planks(g, r, "#b39062"); g.fillStyle = "#6e5434"; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); },
  smithing_table_top: (g, r) => {
    noise(g, r, ["#3a3a44", "#34343d", "#41414b"], [4, 3, 2]);
    g.fillStyle = "#5c5c6a";
    for (let i = 0; i < 16; i += 5) { g.fillRect(i, 0, 1, 16); g.fillRect(0, i, 16, 1); }
  },
  adventure: (g, r) => {
    for (let y = 0; y < 16; y++) {
      const band = Math.floor(y / 4) % 2 ? ["#cbb878", "#d4c286", "#bfae6c"] : ["#e3d6a3", "#d8c88f", "#ecdfb0"];
      for (let x = 0; x < 16; x++) { g.fillStyle = y % 4 === 3 ? "#b39f62" : pick(r, band, [5, 3, 2]); g.fillRect(x, y, 1, 1); }
    }
  },
  end: (g, r) => { noise(g, r, ["#dbdea0", "#e9eba9", "#c9cc8e", "#b9bc7f"], [5, 3, 3, 1]); strokes(g, r, ["#a9ac70"], 6, 1); },
  green_concrete_powder: (g, r) => noise(g, r, ["#61772c", "#566a26", "#6d8433", "#4d5f21"], [5, 4, 3, 2]),
  netherrack: (g, r) => { noise(g, r, ["#6f3533", "#7d3c39", "#5c2a28", "#8b4744", "#4a2120"], [5, 4, 3, 2, 2]); strokes(g, r, ["#9a5552", "#3c1a19"], 10, 2); }
};
function cobbleRows(g, r, y0) {
  for (let y = y0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const edge = (y - y0) % 4 === 3 || ((x + (Math.floor((y - y0) / 4) % 2) * 4) % 8 === 0);
    g.fillStyle = edge ? "#4c4c4c" : pick(r, ["#8a8a8a", "#7a7a7a", "#9c9c9c"], [5, 3, 2]);
    g.fillRect(x, y, 1, 1);
  }
}

/** data:-URL einer 16×16-Kachel, z. B. tile("stone"). */
export function tile(name) {
  const key = TILES[name] ? name : "stone";
  return memo("tile:" + key, () => {
    const [c, g] = canvas(16, 16);
    TILES[key](g, rng(hash(key)));
    return c.toDataURL();
  });
}

// ---------------------------------------------------------------- Advancement-Rahmen (26×26)

const FRAME_COLORS = {
  gray: { o: "#151515", hi: "#e2e2e2", lo: "#5c5c5c", fill: "#a9a9a9", inner: "#8e8e8e" },
  gold: { o: "#3b2700", hi: "#fff4a8", lo: "#b07a00", fill: "#f6c544", inner: "#e2a823" }
};
function insideFrame(type, x, y) {
  const dx = x - 12.5, dy = y - 12.5, ax = Math.abs(dx), ay = Math.abs(dy);
  if (type === "goal") {
    const r = 8, qx = Math.max(ax - (12.5 - r), 0), qy = Math.max(ay - (12.5 - r), 0);
    return qx * qx + qy * qy <= r * r + 0.5;
  }
  if (type === "challenge") {
    if (ax <= 8.6 && ay <= 8.6) return true;
    const ang = Math.atan2(ay, ax); // 0 … π/2 im ersten Viertel
    const dist = Math.hypot(dx, dy);
    const dAxis = Math.min(ang, Math.PI / 2 - ang);
    const dDiag = Math.abs(ang - Math.PI / 4);
    return dist <= 12.6 - dAxis * 11.5 || dist <= 16.2 - dDiag * 15;
  }
  // task: eckig, nur die äußersten Ecken abgeschnitten
  return !(ax > 11.6 && ay > 11.6);
}
function frameCanvas(type, done) {
  const col = done ? FRAME_COLORS.gold : FRAME_COLORS.gray;
  const N = 26, inside = [];
  for (let y = 0; y < N; y++) { inside.push([]); for (let x = 0; x < N; x++) inside[y].push(insideFrame(type, x, y)); }
  const isIn = (x, y) => x >= 0 && y >= 0 && x < N && y < N && inside[y][x];
  const [c, g] = canvas(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inside[y][x]) continue;
    let color;
    if (!isIn(x - 1, y) || !isIn(x + 1, y) || !isIn(x, y - 1) || !isIn(x, y + 1)) color = col.o;
    else if (!isIn(x - 2, y) || !isIn(x, y - 2) || !isIn(x - 3, y) || !isIn(x, y - 3)) color = col.hi;
    else if (!isIn(x + 2, y) || !isIn(x, y + 2) || !isIn(x + 3, y) || !isIn(x, y + 3)) color = col.lo;
    else color = Math.abs(x - 12.5) <= 8 && Math.abs(y - 12.5) <= 8 ? col.inner : col.fill;
    g.fillStyle = color;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}
/** data:-URL des Rahmens: task (eckig), goal (abgerundet), challenge (gezackt); grau oder golden. */
export function frame(type, done) {
  const t = type === "goal" || type === "challenge" ? type : "task";
  return memo("frame:" + t + (done ? 1 : 0), () => frameCanvas(t, done).toDataURL());
}

// ---------------------------------------------------------------- Item-Symbole (16×16)

// Zeichen: . leer, o Kontur, a Grundfarbe, b hell, c dunkel, w weiß, h Holz/Stiel, g grün, y gelb, k schwarz, r rot
const SHAPES = {
  block: [
    "................", "......oooo......", "....oobbbboo....", "..oobbbbbbbboo..", ".obbbbbbbbbbbbo.", ".oaabbbbbbbbcco.",
    ".oaaaabbbbcccco.", ".oaaaaaacccccco.", ".oaaaaaacccccco.", ".oaaaaaacccccco.", ".oaaaaaacccccco.", ".oaaaaaacccccco.",
    "..ooaaaaccccoo..", "....ooaaccoo....", "......oooo......", "................"],
  sword: [
    "..............oo", ".............obo", "............obao", "...........obao.", "..........obao..", ".........obao...",
    "........obao....", ".......obao.....", "..oo..obao......", "..obooobo.......", "...obhbo........", "....ohho........",
    "...ohoobo.......", "..oho..oo.......", ".oho............", ".oo............."],
  pickaxe: [
    "................", "....oooooo......", "...obbbbbboo....", "..obaaaaaabbo...", "..oaooooooaabo..", "...o.....ohoabo.",
    ".........oho.oao", "........oho...oo", ".......oho......", "......oho.......", ".....oho........", "....oho.........",
    "...oho..........", "..oho...........", "..oo............", "................"],
  axe: [
    "................", "........oooo....", ".......obbbbo...", "......obbaaaco..", "......obaaaacco.", ".....ohoaaaccco.",
    "....oho.oaacco..", "...oho...ooco...", "..oho.....oo....", ".oho............", "oho.............", "oo..............",
    "................", "................", "................", "................"],
  shovel: [
    "................", "............ooo.", "...........obbo.", "..........obaao.", ".........obaaco.", "........ohoaco..",
    ".......oho.oo...", "......oho.......", ".....oho........", "....oho.........", "...oho..........", "..oho...........",
    ".oho............", ".oo.............", "................", "................"],
  bow: [
    "................", ".......oooo.....", "......ohhhho....", ".....oh....oo...", "....oh.......o..", "....oh.......wo.",
    "...oh.......w.o.", "...oh......w..o.", "...oh.....w...o.", "...oh....w....o.", "....oh..w.....o.", "....oh.w......o.",
    ".....ohw....oo..", "......ohhhhho...", ".......oooo.....", "................"],
  apple: [
    "................", "........oh......", ".......oh.oo....", "....oooohoggo...", "...obbaaoaggo...", "..obbaaaaaooo...",
    "..obaaaaaaaao...", ".obaaaaaaaaaco..", ".obaaaaaaaaaco..", ".oaaaaaaaaaaco..", ".oaaaaaaaaaaco..", "..oaaaaaaaacco..",
    "..oaaaaaaaacco..", "...oaaaaaacco...", "....oooooooo....", "................"],
  meat: [
    "................", "................", ".....oooooo.....", "...ooaaaaaaoo...", "..oabbaaaaaaao..", ".oabbaaaaaaaaao.",
    ".oaaaaaaaaaaaco.", ".oaaaaaaaaaacco.", ".oaaaaaaaaaacco.", "..oaaaaaaaacco..", "...ooaaaacco....", ".....ooowwo.....",
    ".......owwwo....", "........owwo....", ".........oo.....", "................"],
  potion: [
    "................", "......oooo......", "......ohho......", "......owwo......", "......owwo......", ".....owwwwo.....",
    "....owwwwwwo....", "...owaaaaaaao...", "...obaaaaaaao...", "...obaaaaaaco...", "...oaaaaaaaco...", "...oaaaaaacco...",
    "....oaaaaaco....", ".....oooooo.....", "................", "................"],
  book: [
    "................", "..oooooooooo....", "..ohaaaaaaaao...", "..ohayyyyyaao...", "..ohaaaaaaaao...", "..ohaaaaaaaao...",
    "..ohaaaaaaaao...", "..ohaaaaaaaao...", "..ohaaaaaaaao...", "..ohaaaaaaaao...", "..ohaaaaaaaao...", "..ohwwwwwwwwwo..",
    "..ooooooooooooo.", "................", "................", "................"],
  gem: [
    "................", "................", "....oooooooo....", "...obbwbbbbao...", "..obbbbbbbaaao..", ".oaaaaaaaaaaaco.",
    "..oaaaaaaaaaco..", "...oaaaaaaaco...", "....oaaaaaco....", ".....oaaaco.....", "......oaco......", ".......oo.......",
    "................", "................", "................", "................"],
  ingot: [
    "................", "................", "................", "................", ".....oooooooo...", "....obbbbbbbbo..",
    "...obbaaaaaabco.", "..oaaaaaaaaacco.", ".oaaaaaaaaaacco.", ".occcccccccccoo.", ".oooooooooooooo.", "................",
    "................", "................", "................", "................"],
  dust: [
    "................", "................", "................", "................", "................", "........o.......",
    "......oobo......", ".....obbaao.....", "....obaaaaao....", "...obaaaaaaco...", "..obaaaaaaaaco..", "..oaaaaaaacccco.",
    "..ooooooooooooo.", "................", "................", "................"],
  head: [
    "................", "..oooooooooooo..", "..obbbbbbbbbbo..", "..oaaaaaaaaaao..", "..oaaaaaaaaaao..", "..oakkaaaakkao..",
    "..oakkaaaakkao..", "..oaaaaaaaaaao..", "..oaaakkkkaaao..", "..oaaakaakaaao..", "..oaaaaaaaaaao..", "..occcccccccco..",
    "..oooooooooooo..", "................", "................", "................"],
  egg: [
    "................", "......oooo......", ".....obbaao.....", "....obbaaaao....", "....obaaaaao....", "...obaaaaaaco...",
    "...oaaaccaaco...", "...oaaaaaaaco...", "...oacaaaaaco...", "...oaaaaacaco...", "....oaaaaacco...", ".....oooooo.....",
    "................", "................", "................", "................"],
  flower: [
    "................", "......oooo......", ".....oaaaao.....", "....oaabbaao....", "....oabyybao....", "....oabyybao....",
    "....oaabbaao....", ".....oaaaao.....", "......oggo......", ".......og.......", "....oo.og.......", "....oggog.......",
    ".....ooog.......", ".......og.......", ".......oo.......", "................"],
  star: [
    "................", ".......oo.......", "......obbo......", "......obao......", ".ooooobbaaooooo.", ".obbbbbaaaaaaco.",
    "..oobaaaaaacoo..", "....oaaaaaco....", "....oaaaaaco....", "...oaaaooaaco...", "...oaco..ocao...", "..oco....oco....",
    "..oo......oo....", "................", "................", "................"],
  eye: [
    "................", "................", ".....oooooo.....", "...ooaaaaaaoo...", "..obbaaaaaaaco..", ".obaaakkkkaaaco.",
    ".oaaakkggkkaaco.", ".oaaakggggkaaco.", ".oaaakkggkkaaco.", ".obaaakkkkaaaco.", "..obaaaaaaaaco..", "...oocaaaacoo...",
    ".....oooooo.....", "................", "................", "................"],
  bucket: [
    "................", "................", "...oooooooooo...", "..ow........wo..", "..oo........oo..", "...obbbbbbbbo...",
    "...obaaaaaaco...", "...obaaaaaaco...", "....oaaaaaco....", "....oaaaaaco....", "....oaaaaaco....", ".....occcco.....",
    ".....oooooo.....", "................", "................", "................"],
  chest: [
    "................", "..ooo......ooo..", ".obaaoooooobaao.", ".oaaabbbbbbaaao.", ".oaaaaaaaaaaaao.", "..ooaaaaaaaaoo..",
    "...oaaaaaaaao...", "...oaaaaaaaao...", "...oaaaaaaaao...", "...oaaaaaaaao...", "...oaacccccaao...", "...occo..occo...",
    "...ooo....ooo...", "................", "................", "................"],
  helmet: [
    "................", "................", "................", "....oooooooo....", "...obbbbbbbbo...", "..obaaaaaaaaco..",
    "..oaaaaaaaaaco..", "..oaaoooooocco..", "..oao......oco..", "..oo........oo..", "................", "................",
    "................", "................", "................", "................"],
  boots: [
    "................", "................", "................", "................", "...oooo..oooo...", "...obao..obao...",
    "...oaao..oaao...", "...oaao..oaao...", "...oaao..oaao...", "..ooaao..oaaoo..", ".obaaaao.obaaaao", ".occccco.occccco",
    ".ooooooo.ooooooo", "................", "................", "................"],
  map: [
    "................", "..oooooooooooo..", "..owwwwwwwwwwo..", "..owaagwwrwwwo..", "..owaggwwwwwwo..", "..owwwwwaaawwo..",
    "..owwrwwaggwwo..", "..owwwwwwgwwwo..", "..owaaawwwwwwo..", "..owaggwwwrwwo..", "..owwwwwwwwwwo..", "..oooooooooooo..",
    "................", "................", "................", "................"],
  disc: [
    "................", ".....oooooo.....", "...ookkkkkkoo...", "..okkkkkkkkkko..", "..okkkbbbbkkko..", ".okkkbaaaabkkko.",
    ".okkbaaoo aabkko".replace(" ", "a"), ".okkbaoooaabkko.", ".okkkbaaaabkkko.", "..okkkbbbbkkko..", "..okkkkkkkkkko..", "...ookkkkkkoo...",
    ".....oooooo.....", "................", "................", "................"],
  rod: [
    "................", "..............oo", ".............obo", "............oho.", "...........oho..", "..........oho...",
    ".........oho....", "........oho.....", ".......oho......", "......oho.......", ".....oho........", "....oho.........",
    "...oho..........", "..oho...........", "..oo............", "................"],
  heart: [
    "................", "................", "..oooo....oooo..", ".obbaao..obaaao.", ".obaaaaooaaaaco.", ".oaaaaaaaaaaaco.",
    ".oaaaaaaaaaaaco.", "..oaaaaaaaaaco..", "...oaaaaaaaco...", "....oaaaaaco....", ".....oaaaco.....", "......oaco......",
    ".......oo.......", "................", "................", "................"]
};
const FIXED = { w: "#f4f4f4", h: "#7a5230", g: "#3f9b2a", y: "#ffd83d", k: "#151515", r: "#c8302c" };

const MATERIALS = [
  ["netherite", "#4d494d"], ["diamond", "#4aedd9"], ["emerald", "#17dd62"], ["golden", "#fcee4b"], ["gold", "#fcee4b"],
  ["iron", "#d8d8d8"], ["copper", "#e77c56"], ["chainmail", "#9aa0a6"], ["leather", "#a0522d"], ["turtle", "#47bf4a"],
  ["redstone", "#e01b1b"], ["lapis", "#3557b5"], ["amethyst", "#9a5cc6"], ["quartz", "#eae5de"], ["obsidian", "#2a1b3d"],
  ["crying", "#5b2a9c"], ["netherrack", "#7a2e2e"], ["nether", "#7a2e2e"], ["blaze", "#f7b500"], ["breeze", "#9ec7f2"],
  ["ender", "#2f8f80"], ["end_", "#e8e9b0"], ["purpur", "#a97ca9"], ["chorus", "#8c5b8c"], ["prismarine", "#63a99a"],
  ["sculk", "#0f4a5a"], ["echo", "#1f6d7a"], ["honey", "#f9a825"], ["slime", "#7bc75a"], ["magma", "#c4561b"],
  ["snow", "#e8f4f6"], ["ice", "#8db4fe"], ["sand", "#dbcf9e"], ["grass", "#5da03a"], ["moss", "#5d7a3a"], ["dirt", "#7a5639"],
  ["mud", "#3e3a3c"], ["clay", "#a0a7b3"], ["tnt", "#db3a2a"], ["glass", "#c7e8f0"], ["stone", "#8f8f8f"], ["cobble", "#8a8a8a"],
  ["deepslate", "#4d4d52"], ["tuff", "#6c6d66"], ["calcite", "#e0e0dc"], ["basalt", "#4b4b51"], ["blackstone", "#2a2428"],
  ["bone", "#e8e2c8"], ["wither", "#2b2b2b"], ["skeleton", "#c8c8c8"], ["zombie", "#3e7d32"], ["creeper", "#4caf2a"],
  ["piglin", "#e3a17c"], ["dragon", "#2b1d3a"], ["spider", "#3d3029"], ["pumpkin", "#e38a1d"], ["melon", "#7cb342"],
  ["carrot", "#ff8a1e"], ["potato", "#d6b36a"], ["beetroot", "#a3212e"], ["wheat", "#d9b640"], ["bread", "#c58a3a"],
  ["cookie", "#b07032"], ["cake", "#f2e3d5"], ["cod", "#b7a17a"], ["salmon", "#d4574a"], ["tropical", "#ff9e3d"],
  ["puffer", "#e6c94a"], ["beef", "#c84b3c"], ["porkchop", "#e98a8a"], ["chicken", "#f0c8a0"], ["mutton", "#c45a4a"],
  ["rabbit", "#c79a6a"], ["cherry", "#f2a7c3"], ["bamboo", "#8fb33a"], ["mangrove", "#7a3a33"], ["crimson", "#8c2f45"],
  ["warped", "#2a8f7f"], ["dark_oak", "#4a3221"], ["spruce", "#6e4e2e"], ["birch", "#d7c785"], ["jungle", "#a3734a"],
  ["acacia", "#b55f30"], ["pale_oak", "#d9cfc6"], ["oak", "#a8834c"], ["wood", "#a8834c"], ["log", "#6e5434"],
  ["white", "#f0f0f0"], ["light_gray", "#9d9d97"], ["gray", "#474f52"], ["black", "#1d1d21"], ["brown", "#835432"],
  ["red", "#b02e26"], ["orange", "#f9801d"], ["yellow", "#fed83d"], ["lime", "#80c71f"], ["green", "#5e7c16"],
  ["light_blue", "#3ab3da"], ["cyan", "#169c9c"], ["blue", "#3c44aa"], ["purple", "#8932b8"], ["magenta", "#c74ebd"], ["pink", "#f38baa"]
];
const SHAPE_RULES = [
  [/(_sword|^sword)$/, "sword"], [/_pickaxe$/, "pickaxe"], [/_axe$/, "axe"], [/_(shovel|hoe)$/, "shovel"], [/(^|_)(cross)?bow$/, "bow"],
  [/(trident|spear|mace)/, "sword"], [/_helmet$|^turtle_helmet$/, "helmet"], [/_(chestplate|leggings)$|elytra|_horse_armor|wolf_armor/, "chest"],
  [/_boots$/, "boots"], [/potion|bottle|_brew|dragon_breath|honey_bottle/, "potion"], [/book|knowledge/, "book"], [/map$|banner_pattern|paper/, "map"],
  [/(compass|clock|spyglass)$/, "eye"], [/spawn_egg|(^|_)egg$|sniffer_egg|turtle_egg/, "egg"], [/(_head|_skull)$/, "head"],
  [/(apple|carrot|potato|beetroot|bread|cookie|cake|pie|melon_slice|berries|stew|soup|chorus_fruit|dried_kelp|honeycomb)/, "apple"],
  [/(beef|porkchop|chicken|mutton|rabbit|cod|salmon|fish|steak)/, "meat"],
  [/(diamond|emerald|amethyst_shard|quartz$|lapis_lazuli$|prismarine_crystals|echo_shard|heart_of_the_sea|shard$)/, "gem"],
  [/(_ingot|^brick$|nether_brick$|netherite_scrap|_nugget)/, "ingot"], [/(redstone$|glowstone_dust|gunpowder|sugar$|_powder$|_dye$|bone_meal)/, "dust"],
  [/bucket/, "bucket"], [/(nether_star|firework_star|_star$)/, "star"], [/(ender_eye|ender_pearl|ender_eye)/, "eye"],
  [/(poppy|dandelion|tulip|orchid|rose|lily|daisy|allium|bluet|cornflower|torchflower|pitcher|flower|lilac|peony|sunflower|azalea)/, "flower"],
  [/(sapling|propagule|fungus|mushroom$|sweet_berries)/, "flower"], [/(totem|heart$|golden_apple)/, "heart"], [/music_disc|disc_fragment/, "disc"],
  [/(stick|_rod$|fishing_rod|bone$|arrow|feather|lead$|name_tag)/, "rod"]
];

function materialColor(id) {
  const p = id.replace(/^.*:/, "");
  for (const [k, c] of MATERIALS) if (p.includes(k)) return c;
  return "#" + ((hash(p) & 0x7f7f7f) + 0x404040).toString(16).padStart(6, "0");
}
function shapeFor(id) {
  const p = id.replace(/^.*:/, "");
  for (const [re, s] of SHAPE_RULES) if (re.test(p)) return s;
  return "block";
}

/** data:-URL eines 16×16-Symbols für eine Item-ID, z. B. icon("minecraft:diamond_pickaxe"). */
export function icon(id) {
  const key = id || "minecraft:stone";
  return memo("icon:" + key, () => {
    const shape = SHAPES[shapeFor(key)] || SHAPES.block;
    const base = materialColor(key);
    const pal = { o: shade(base, -0.72), a: base, b: shade(base, 0.38), c: shade(base, -0.32), ...FIXED };
    if (shapeFor(key) === "sword" || shapeFor(key) === "pickaxe" || shapeFor(key) === "axe" || shapeFor(key) === "shovel") pal.o = "#1d1d1d";
    const [cv, g] = canvas(16, 16);
    for (let y = 0; y < 16; y++) {
      const row = (shape[y] || "").padEnd(16, ".").slice(0, 16);
      for (let x = 0; x < 16; x++) {
        const ch = row[x];
        if (ch === "." || !pal[ch]) continue;
        g.fillStyle = pal[ch];
        g.fillRect(x, y, 1, 1);
      }
    }
    return cv.toDataURL();
  });
}

// ---------------------------------------------------------------- Avatare (8×8 aus dem Namen)

const SKIN = ["#f1c7a5", "#e0ac84", "#c68a63", "#a46a46", "#7d4a2f", "#5a3522"];
const HAIR = ["#2b1b10", "#4a2f1b", "#7a4a22", "#c8a14a", "#e4d18a", "#8a2c1a", "#3a3a3a", "#d9d9d9", "#5b3a8c", "#2f6f8f"];
const EYES = ["#3b6fd1", "#3e8f3a", "#6b4a2b", "#2b2b2b", "#7a5bc0"];
// Lu-Stats: real player heads (current skin) via the server-side head proxy.
// The server resolves the skin, crops the head (+hat overlay) and caches it;
// a deterministic generated head is served as a fallback. Same-origin URL, so
// it satisfies the strict CSP (img-src 'self').
export function avatar(name) {
  return "/api/head?name=" + encodeURIComponent(name);
}
