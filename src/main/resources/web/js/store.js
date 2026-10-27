// Gemeinsamer Zustand im Browser: Index der Advancements, Spielerliste, geladene Spieler.
import { api, lsGet, lsSet } from "./util.js";

export const S = {
  info: null,
  index: null,
  BYID: {},
  TABS: [],
  TABMAP: {},
  TABKEY: {},
  players: [],
  recent: [],
  total: 0,
  spoiler: lsGet("bacap.spoiler", false),
  playerCache: new Map()
};

const COLOR = /^#[0-9a-fA-F]{6}$/;
export const safeColor = (c) => (COLOR.test(c || "") ? c : "#888888");

/** Index vom Server aufbereiten: Baum, Reihenfolge, Suchtext (wie in der Vorlage). */
export function prepareIndex(d) {
  S.index = d;
  S.total = d.total;
  S.BYID = {};
  S.TABMAP = {};
  S.TABKEY = {};
  for (const a of d.advancements) {
    a.doc = a.doc || null;
    a.children = a.children || [];
    a.groups = a.groups || [];
    S.BYID[a.id] = a;
  }
  S.TABS = d.tabs.map((t) => ({ ...t, color: safeColor(t.color), items: t.ids.map((id) => S.BYID[id]).filter(Boolean) }));
  for (const t of S.TABS) {
    S.TABMAP[t.id] = t;
    S.TABKEY[t.key] = t;
    // Tiefe wie in der Vorlage: lineare Ketten bleiben auf einer Ebene, nur Verzweigungen rücken ein.
    const seen = new Set();
    const visit = (a, depth) => {
      if (!a || seen.has(a.id)) return;
      seen.add(a.id);
      a.depth = depth;
      const kids = a.children.map((id) => S.BYID[id]).filter((k) => k && k.tab === t.id);
      const inc = kids.length > 1 ? 1 : 0;
      kids.forEach((k) => visit(k, depth + inc));
    };
    if (t.items.length) visit(t.items[0], 0);
    t.items.forEach((a) => { if (!seen.has(a.id)) visit(a, 0); });
  }
  for (const a of d.advancements) {
    const p = a.parent ? S.BYID[a.parent] : null;
    const doc = a.doc || {};
    a.hay = [a.title, a.desc, doc.req, doc.full, doc.items, doc.trophy, doc.notes, p && p.title, doc.source, doc.renamedFrom, a.id,
      a.groups.map((g) => g[0]).join(" ")].filter(Boolean).join(" \u0001 ").toLowerCase();
  }
}

export async function loadIndex() {
  const d = await api("/api/advancements");
  prepareIndex(d);
  return d;
}

export async function loadPlayers() {
  const d = await api("/api/players");
  S.players = d.players;
  S.recent = d.recent;
  S.total = d.total;
  return d;
}

/** Fortschritt eines Spielers laden (immer frisch vom Server). */
export async function loadPlayer(name) {
  const d = await api("/api/player?name=" + encodeURIComponent(name));
  const P = { ...d.player, progress: d.progress, stats: d.stats || {} };
  S.playerCache.set(name.toLowerCase(), P);
  return P;
}

export function setSpoiler(on) {
  S.spoiler = !!on;
  lsSet("bacap.spoiler", S.spoiler);
}

// ---------------------------------------------------------------- Abfragen
export const isFlagged = (a) => !!(a.doc && (a.doc.isNew || a.doc.renamedFrom || a.doc.movedFrom || (a.doc.changed && a.doc.changed.length)));
export const isDone = (P, id) => !!(P && P.progress[id] && P.progress[id].d);
export function gotGroups(P, a) {
  if (!P) return 0;
  const st = P.progress[a.id];
  if (!st) return 0;
  return st.d ? a.groups.length : (st.g ? st.g.length : 0);
}
export function groupDone(P, a, i) {
  const st = P && P.progress[a.id];
  if (!st) return false;
  return st.d ? true : !!(st.g && st.g.includes(i));
}
export function statValue(P, a) {
  return P && a.stat && P.stats && a.stat.key in P.stats ? P.stats[a.stat.key] : null;
}
/** Anteil 0…1, wie weit ein Spieler bei einem Advancement ist. */
export function fraction(P, a) {
  if (isDone(P, a.id)) return 1;
  const sv = statValue(P, a);
  if (sv != null) return Math.min(1, sv / a.stat.min);
  if (!a.groups.length) return 0;
  return gotGroups(P, a) / a.groups.length;
}
/** Versteckte Advancements erst zeigen, wenn der Spieler sie hat (oder der Spoiler-Schalter an ist). */
export const visible = (a, P) => !a.hidden || S.spoiler || isDone(P, a.id);
export const counted = (a) => a.counted !== false;
