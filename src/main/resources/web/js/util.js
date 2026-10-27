// Kleine Helfer, die alle Seiten brauchen. Alle Texte, die vom Server oder aus der Doku kommen, gehen durch esc().
import * as px from "./pixel.js";

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const nf = new Intl.NumberFormat("de-DE");
const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
export const pct = (a, b) => (b > 0 ? Math.floor((a / b) * 100) : 0);

export function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* Speicher nicht verfügbar */ } }

export function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export async function api(path) {
  const r = await fetch(path, { headers: { Accept: "application/json" }, cache: "no-cache" });
  if (!r.ok) {
    const err = new Error("HTTP " + r.status);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// ---------------------------------------------------------------- Datum & Zeit
const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtDate = (ms) => (ms > 0 ? dateFmt.format(new Date(ms)) : "–");
export const fmtDateTime = (ms) => (ms > 0 ? dateTimeFmt.format(new Date(ms)) : "–");
export function fmtIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || "–");
}
export function ago(ms) {
  if (!ms) return "–";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  if (s < 86400 * 30) { const d = Math.floor(s / 86400); return d === 1 ? "gestern" : `vor ${d} Tagen`; }
  return fmtDate(ms);
}

// ---------------------------------------------------------------- Stufen (aus der Vorlage)
export const TIERS = {
  root: { de: "Start", en: "Root", toast: "Tab freigeschaltet!" },
  task: { de: "Fortschritt", en: "Task", toast: "Fortschritt erzielt!" },
  goal: { de: "Ziel", en: "Goal", toast: "Ziel erreicht!" },
  challenge: { de: "Aufgabe", en: "Challenge", toast: "Aufgabe abgeschlossen!" },
  super: { de: "Super-Aufgabe", en: "Super Challenge", toast: "Super-Aufgabe geschafft!" },
  hidden: { de: "Versteckt", en: "Hidden", toast: "Geheimnis gelüftet!" },
  milestone: { de: "Meilenstein", en: "Milestone", toast: "Meilenstein erreicht!" },
  legend: { de: "Legende", en: "Advancement Legend", toast: "Advancement Legend!" }
};
export const TIER_ORDER = ["task", "goal", "challenge", "super", "hidden", "milestone"];
export const TIER_PLURAL = { root: "Start", task: "Fortschritte", goal: "Ziele", challenge: "Aufgaben", super: "Super-Aufgaben", hidden: "versteckt", milestone: "Meilensteine", legend: "Legende" };
export const FIELD_DE = { desc: "Beschreibung", parent: "Vorgänger", req: "Anforderung", items: "Item-Belohnung", xp: "XP", trophy: "Trophäe", full: "Vollständige Liste" };
export const tierOf = (a) => TIERS[a.tier] ? a.tier : a.frame;
/** Toast-Text wie im Spiel: Aufgaben lila, alles andere gelb. */
export function toastTitle(a) {
  if (a.frame === "challenge") return { text: "Aufgabe abgeschlossen!", ch: true };
  if (a.frame === "goal") return { text: "Ziel erreicht!", ch: false };
  return { text: "Fortschritt erzielt!", ch: false };
}

// ---------------------------------------------------------------- Pixel-Bausteine als HTML
export function frameHTML(a, done, size = "s52", extraClass = "") {
  const f = px.frame(a.frame, done);
  const ic = px.icon(a.icon);
  return `<span class="fr ${size} ${extraClass}" style="background-image:url(${f})"><i style="background-image:url(${ic})"></i></span>`;
}
export function iconHTML(id, cls = "ico") {
  return `<span class="${cls}" style="background-image:url(${px.icon(id)});background-size:100% 100%;display:inline-block"></span>`;
}
export function avatarHTML(name, cls = "") {
  return `<span class="avatar ${cls}" style="background-image:url(${px.avatar(name)})" aria-hidden="true"></span>`;
}
export function barHTML(got, total, cls = "") {
  const w = total > 0 ? Math.min(100, (got / total) * 100) : 0;
  return `<div class="bar ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${got}"><i style="width:${w.toFixed(2)}%"></i></div>`;
}
export function xpHTML(done, total, label) {
  const w = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return `<div class="xp">
    <span class="xp-num">${nf.format(done)}</span>
    <div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="Erledigte Advancements"><i style="width:${w.toFixed(2)}%"></i></div>
    <div class="xp-label">${label}</div>
  </div>`;
}
export const ICON = {
  chev: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 5h2v2h2v2h2V7h2V5h2v2h-2v2h-2v2H7V9H5V7H3z"/></svg>',
  cup: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2h8v1h2v3h-1v1h-1v1h-1v1H9v2h2v1h1v2H4v-2h1v-1h2V9H5V8H4V7H3V6H2V3h2zm0 2H3v1h1zm8 0v1h1V4z"/></svg>',
  box: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 4h12v10H2zm1 3v6h10V7zm4 1h2v2H7zM2 2h12v1H2z"/></svg>',
  search: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 1h5v1h1v1h1v5h-1v1h-1v1H5V9H4V8H3V3h1V2h1zm0 2v1H4v3h1v1h5V7h1V4h-1V3zm6 7h2v1h1v1h1v2h-2v-1h-1v-1h-1z"/></svg>',
  sun: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7 0h2v3H7zM7 13h2v3H7zM0 7h3v2H0zM13 7h3v2h-3zM5 4h6v1h1v6h-1v1H5v-1H4V5h1zM2 2h2v2H2zM12 2h2v2h-2zM2 12h2v2H2zM12 12h2v2h-2z"/></svg>',
  moon: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6 1h4v1H8v1H7v2H6v6h1v2h1v1h2v1H6v-1H4v-1H3v-2H2V5h1V3h1V2h2z"/></svg>'
};

// ---------------------------------------------------------------- Statistik-Werte
export function statPair(stat, value) {
  const v = Math.min(value, stat.min);
  switch (stat.unit) {
    case "cm": return stat.min >= 100000 ? `${nf1.format(v / 100000)} / ${nf1.format(stat.min / 100000)} km` : `${nf.format(Math.floor(v / 100))} / ${nf.format(Math.floor(stat.min / 100))} m`;
    case "ticks": return stat.min >= 72000 ? `${nf1.format(v / 72000)} / ${nf1.format(stat.min / 72000)} Std.` : `${nf.format(Math.floor(v / 1200))} / ${nf.format(Math.floor(stat.min / 1200))} Min.`;
    case "damage": return `${nf.format(Math.floor(v / 10))} / ${nf.format(Math.floor(stat.min / 10))}`;
    default: return `${nf.format(v)} / ${nf.format(stat.min)}`;
  }
}

// ---------------------------------------------------------------- Tooltip (wie bei Items)
let ttTimer = null;
export function showTooltip(target, html) {
  const tt = document.getElementById("tooltip");
  if (!tt) return;
  tt.innerHTML = html;
  tt.hidden = false;
  const r = target.getBoundingClientRect();
  const tw = tt.offsetWidth, th = tt.offsetHeight;
  let x = r.right + 10, y = r.top - 4;
  if (x + tw > window.innerWidth - 8) x = Math.max(8, r.left - tw - 10);
  if (y + th > window.innerHeight - 8) y = Math.max(8, window.innerHeight - th - 8);
  tt.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  clearTimeout(ttTimer);
}
export function hideTooltip() {
  const tt = document.getElementById("tooltip");
  if (!tt) return;
  ttTimer = setTimeout(() => { tt.hidden = true; }, 40);
}

// ---------------------------------------------------------------- Text der Doku aufbereiten (aus der Vorlage)
export function hl(text, words) {
  const out = esc(text);
  if (!words || !words.length) return out;
  const re = new RegExp("(" + words.map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return out.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, txt) => tag || txt.replace(re, "<mark>$1</mark>"));
}
export function linkify(html) {
  return html.replace(/(https?:\/\/[^\s<"']+[^\s<"'.,;:)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
export function reqBlock(text, words) {
  // Bei "Riddle Me This" steht die Lösung dabei; die bleibt hinter einem Klick.
  const lines = String(text).split(/\n+/);
  const sp = lines.findIndex((l) => /spoiler/i.test(l) || /^walkthrough/i.test(l));
  if (sp > 0) {
    return reqLines(lines.slice(0, sp), words) + `<details class="spoiler"><summary>Lösung anzeigen (Spoiler)</summary>${reqLines(lines.slice(sp), words)}</details>`;
  }
  return reqLines(lines, words);
}
function reqLines(lines, words) {
  return lines.map((line) => {
    const m = /^(.{3,140}?):\s+(.+)$/.exec(line);
    if (m && m[2].includes(",") && !/https?:\/\//.test(m[1])) {
      const parts = m[2].split(/,\s*(?:and\s+)?|\s+and\s+(?=[A-Z])/).map((s) => s.trim().replace(/\.$/, "")).filter(Boolean);
      if (parts.length >= 3) {
        return `<div><div class="reqhead">${hl(m[1], words)}: <span class="n">${parts.length}</span></div><div class="reqlist">${parts.map((x) => `<span>${hl(x, words)}</span>`).join("")}</div></div>`;
      }
    }
    return `<p>${linkify(hl(line, words))}</p>`;
  }).join("");
}
