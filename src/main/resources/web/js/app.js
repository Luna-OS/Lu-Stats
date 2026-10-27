// Start der Website: Daten laden, Seiten anzeigen (Routing über die History-API), Live-Updates per Server-Sent Events.
import { $, $$, esc, api, debounce, frameHTML, toastTitle, ICON, fmtIso } from "./util.js";
import * as px from "./pixel.js";
import { S, loadIndex, loadPlayers, setSpoiler } from "./store.js";
import { startPage, playerPage, advancementPage, comparePage, explorerPage, notFoundPage } from "./pages.js";

const view = $("#view");
let current = null;
let routeToken = 0;

// ---------------------------------------------------------------- Theme & Spoiler
function effectiveDark() {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}
function drawThemeBtn() {
  const b = $("#themeBtn");
  b.innerHTML = effectiveDark() ? ICON.sun : ICON.moon;
  b.setAttribute("aria-label", effectiveDark() ? "Helles Design" : "Dunkles Design");
}
$("#themeBtn").addEventListener("click", () => {
  const next = effectiveDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("bacap.theme", next); } catch { /* egal */ }
  drawThemeBtn();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawThemeBtn);

const spoiler = $("#spoiler");
spoiler.checked = S.spoiler;
spoiler.addEventListener("change", () => { setSpoiler(spoiler.checked); route(true); });

// ---------------------------------------------------------------- Routing
export function navigate(path) {
  if (path === location.pathname + location.hash) return;
  history.pushState({}, "", path);
  route();
  window.scrollTo(0, 0);
}

document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest("a[href]");
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/fonts/")) return;
  if (url.pathname === location.pathname && url.hash && !a.hasAttribute("data-link")) return; // Sprung innerhalb der Seite
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});
window.addEventListener("popstate", () => route());

async function route(keepScroll) {
  const token = ++routeToken;
  const y = window.scrollY;
  if (current) { try { current.destroy(); } catch { /* egal */ } current = null; }
  const path = decodeURIComponent(location.pathname);
  let nav = "start", page;
  try {
    if (path === "/" || path === "/rangliste") page = () => startPage(view, navigate);
    else if (path === "/alle") { nav = "alle"; page = () => explorerPage(view, "all", navigate); }
    else if (path === "/neu") { nav = "neu"; page = () => explorerPage(view, "changes", navigate); }
    else if (path.startsWith("/spieler/")) { nav = ""; const name = path.slice(9).replace(/\/+$/, ""); page = () => playerPage(view, name, navigate); }
    else if (path.startsWith("/advancement/")) { nav = "alle"; page = () => advancementPage(view, path.slice(13), navigate); }
    else if (path === "/vergleich" || path.startsWith("/vergleich/")) {
      nav = "vergleich";
      const [a, b] = path.slice(11).split("/").filter(Boolean);
      page = () => comparePage(view, a || "", b || "", navigate);
    } else page = () => notFoundPage(view);
    $$(".mainnav a").forEach((l) => l.setAttribute("aria-current", l.dataset.nav === nav ? "page" : "false"));
    const p = await page();
    if (token !== routeToken) { p.destroy(); return; }
    current = p;
    if (keepScroll) window.scrollTo(0, y);
  } catch (err) {
    if (token !== routeToken) return;
    view.innerHTML = `<div class="mc-panel empty"><b>Das hat nicht geklappt</b>Der Server antwortet gerade nicht (${esc(err.message || err)}). Seite neu laden oder gleich nochmal versuchen.</div>`;
  }
}

// ---------------------------------------------------------------- Toasts wie im Spiel
// Bei vielen Freischaltungen auf einmal (z. B. /advancement grant … everything) wird zusammengefasst.
const toastQueue = [];
let toastTimer = null;
function toast(d) {
  toastQueue.push(d);
  if (!toastTimer) toastTimer = setTimeout(flushToasts, 150);
}
function flushToasts() {
  toastTimer = null;
  const batch = toastQueue.splice(0);
  if (batch.length > 4) {
    const byPlayer = {};
    batch.forEach((d) => { byPlayer[d.player] = (byPlayer[d.player] || 0) + 1; });
    Object.entries(byPlayer).forEach(([player, n]) => showToast({ id: "", frame: "challenge", icon: "minecraft:nether_star", title: "" }, "Viele Advancements!", true, `<b>${esc(player)}</b>: ${esc(n)} auf einmal freigeschaltet`));
    return;
  }
  batch.forEach((d) => {
    const a = S.BYID[d.adv] || { id: d.adv, frame: d.frame || "task", icon: "", title: d.title };
    const t = toastTitle(a);
    showToast(a, t.text, t.ch, `<b>${esc(d.player)}</b>: ${esc(a.title || d.title)}`);
  });
}
function showToast(a, title, ch, bodyHTML) {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `${frameHTML(a, true, "s39")}<div style="min-width:0"><div class="t1${ch ? " ch" : ""}">${esc(title)}</div><div class="t2">${bodyHTML}</div></div>`;
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 5000);
}

// ---------------------------------------------------------------- Live-Updates
const reloadIndex = debounce(async () => {
  try { await loadIndex(); await loadPlayers(); route(true); } catch { /* nächster Versuch beim nächsten Ereignis */ }
}, 500);
const refreshPlayers = debounce(() => { loadPlayers().catch(() => {}); }, 800);

function connect() {
  if (!S.info.live || !window.EventSource) return;
  const live = $("#live");
  live.hidden = false;
  const es = new EventSource("/api/events");
  let connectedOnce = false;
  es.addEventListener("hello", () => {
    live.classList.add("on");
    live.title = "Live-Verbindung steht";
    // Nach einem Abbruch können Ereignisse verloren sein: aktuellen Stand neu laden.
    if (connectedOnce) loadPlayers().then(() => route(true), () => {});
    connectedOnce = true;
  });
  es.onerror = () => { live.classList.remove("on"); live.title = "Live-Verbindung unterbrochen, verbinde neu …"; };
  const handle = (type) => (e) => {
    let d = {};
    try { d = JSON.parse(e.data); } catch { return; }
    if (type === "index") { reloadIndex(); return; }
    if (type === "progress" && d.kind === "done") toast(d);
    if (type !== "stats") refreshPlayers();
    if (current && current.onEvent) { try { current.onEvent(type, d); } catch { /* Seite kümmert sich selbst */ } }
  };
  for (const type of ["progress", "player", "players", "stats", "index"]) es.addEventListener(type, handle(type));
}

// ---------------------------------------------------------------- Start
function renderFoot() {
  const m = S.index.meta || {};
  $("#foot").innerHTML =
    `<span>BACAP Tracker ${esc(S.info.modVersion)}</span>` +
    (m.version ? `<span>Doku: offizielle BACAP-Dokumentation von Cavinator1${m.sourceUrl ? `, <a href="${esc(m.sourceUrl)}" target="_blank" rel="noopener noreferrer">BACAP ${esc(m.version)}</a>` : ` ${esc(m.version)}`}, Stand ${esc(fmtIso(m.updated))}</span>` : "") +
    `<span><a href="https://modrinth.com/datapack/blazeandcaves-advancements-pack" target="_blank" rel="noopener noreferrer">Datapack auf Modrinth</a></span>` +
    `<span>Taste <kbd>/</kbd> springt in die Suche</span>` +
    `<span>Schrift: Monocraft (OFL), <a href="/fonts/OFL.txt">Lizenz</a></span>`;
}

async function boot() {
  drawThemeBtn();
  document.body.style.setProperty("--page-tile", `url(${px.tile("stone")})`);
  $(".logo-mark").style.backgroundImage = `url(${px.frame("challenge", true)})`;
  try {
    const [info] = await Promise.all([api("/api/info"), loadIndex(), loadPlayers()]);
    S.info = info;
  } catch (err) {
    view.innerHTML = `<div class="mc-panel empty"><b>Keine Verbindung zum Server</b>Die Daten konnten nicht geladen werden (${esc(err.message || err)}). Läuft der Minecraft-Server? Seite in ein paar Sekunden neu laden.</div>`;
    return;
  }
  $("#siteTitle").textContent = S.info.title;
  renderFoot();
  await route();
  connect();
}
boot();
