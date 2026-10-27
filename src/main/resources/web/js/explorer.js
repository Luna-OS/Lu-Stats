// Der Advancement-Explorer: alle Funktionen der Vorlage (Tabs, Suche, Filter, Baum/Liste, Details, NEU-Markierungen,
// "Neu & geändert") plus Fortschritt eines Spielers und die Spielansicht.
import { esc, nf, lsGet, lsSet, debounce, TIERS, TIER_ORDER, TIER_PLURAL, FIELD_DE, tierOf, frameHTML, iconHTML, barHTML, ICON,
  statPair, hl, linkify, reqBlock, showTooltip, hideTooltip, fmtDate } from "./util.js";
import * as px from "./pixel.js";
import { S, isFlagged, isDone, gotGroups, groupDone, statValue, visible, counted } from "./store.js";
import { mountGameView } from "./gameview.js";

const CRIT_LIMIT = 80;

export function tooltipHTML(a, P) {
  const ch = a.frame === "challenge";
  let prog = "";
  if (P) {
    if (isDone(P, a.id)) prog = `<div class="tt-done">✔ Erledigt</div>`;
    else if (a.stat && statValue(P, a) != null) prog = `<div class="tt-prog">${esc(statPair(a.stat, statValue(P, a)))}</div>`;
    else if (a.groups.length > 1) prog = `<div class="tt-prog">${gotGroups(P, a)}/${a.groups.length}</div>`;
  }
  const t = TIERS[tierOf(a)];
  return `<div class="tt-title${ch ? " ch" : ""}">${esc(a.title)}</div><div class="tt-desc">${esc(a.desc)}</div>${prog}` +
    `<div class="tt-meta">${esc(t ? t.de : a.frame)}${a.xp ? " · " + nf.format(a.xp) + " XP" : ""}${a.doc && a.doc.trophy ? " · Trophäe" : ""}</div>`;
}

export function rewardTags(a) {
  let s = "";
  if (a.xp) s += `<span class="tag xp" title="Erfahrungspunkte"><span class="orb"></span>${nf.format(a.xp)}</span>`;
  if (a.doc && a.doc.trophy) s += `<span class="tag tro" title="Trophäe">${ICON.cup}${esc(a.doc.trophy)}</span>`;
  if (a.doc && a.doc.items) s += `<span class="tag" title="Item-Belohnung: ${esc(a.doc.items)}">${ICON.box}${esc(a.doc.items)}</span>`;
  return s;
}

/** Fortschrittszeile (Balken + Zahl) für ein offenes Advancement. */
export function progressHTML(a, P) {
  if (!P || isDone(P, a.id)) return "";
  const sv = statValue(P, a);
  if (a.stat && sv != null) return `<div class="prog">${barHTML(Math.min(sv, a.stat.min), a.stat.min)}<span>${esc(statPair(a.stat, sv))}</span></div>`;
  if (a.groups.length > 1) {
    const g = gotGroups(P, a);
    return `<div class="prog">${barHTML(g, a.groups.length)}<span>${g}/${a.groups.length}</span></div>`;
  }
  return "";
}

/** Checkliste der Anforderungen. Mit Spieler: erledigt/offen, offene zuerst. */
export function checklistHTML(a, P, showAll) {
  if (a.groups.length < 2) return "";
  const items = a.groups.map((g, i) => ({ label: g[0], kind: g[1], ok: P ? groupDone(P, a, i) : null, i }));
  const open = items.filter((x) => x.ok === false), ok = items.filter((x) => x.ok === true);
  const ordered = P ? [...open, ...ok] : items;
  const shown = showAll ? ordered : ordered.slice(0, CRIT_LIMIT);
  const kindWord = (k) => (k && k !== "Kriterium" ? `<span class="k">${esc(k)}</span>` : "");
  const li = shown.map((x) => P
    ? `<li class="${x.ok ? "ok" : "no"}"><span class="mk" aria-hidden="true">${x.ok ? "✔" : "✘"}</span><span>${esc(x.label)}${kindWord(x.kind)}<span class="sr">${x.ok ? " (erledigt)" : " (fehlt)"}</span></span></li>`
    : `<li><span class="mk" aria-hidden="true">•</span><span>${esc(x.label)}${kindWord(x.kind)}</span></li>`).join("");
  const head = P ? `Es fehlen <b>${open.length}</b> von ${items.length}` : `${items.length} Anforderungen laut Spiel`;
  const more = ordered.length > shown.length ? `<button type="button" class="mc-btn small" data-act="allcrit" data-id="${esc(a.id)}">Alle ${nf.format(ordered.length)} anzeigen</button>` : "";
  return `<div><div class="checkhead"><h4>${P ? "Checkliste" : "Anforderungen im Spiel"}</h4><span class="muted" style="font-size:13px">${head}</span></div><ul class="checklist">${li}</ul>${more}</div>`;
}

export function detailHTML(a, words, P, opts = {}) {
  const doc = a.doc || {};
  const p = a.parent ? S.BYID[a.parent] : null;
  const kids = a.children.map((id) => S.BYID[id]).filter((k) => k && visible(k, P));
  const jump = (x) => `<button type="button" class="jump" data-jump="${esc(x.id)}">${frameHTML(x, isDone(P, x.id), "s26")}${esc(x.title)}${x.tab !== a.tab ? ` <small>(${esc(S.TABMAP[x.tab] ? S.TABMAP[x.tab].title : "")})</small>` : ""}</button>`;
  const t = TIERS[tierOf(a)] || TIERS.task;
  const frameDe = { task: "Fortschritt (eckig)", goal: "Ziel (abgerundet)", challenge: "Aufgabe (gezackt)" }[a.frame] || a.frame;
  const facts = [
    ["Stufe", `${esc(t.de)} <small class="faint">(${esc(t.en)})</small>`],
    ["Rahmen im Spiel", esc(frameDe)],
    ["Item-Belohnung", doc.items ? esc(doc.items) : "–"],
    ["XP", a.xp ? nf.format(a.xp) : "–"],
    ["Trophäe", doc.trophy ? esc(doc.trophy) : "–"],
    ["Versteckt", a.hidden ? "Ja, erscheint erst nach dem Freischalten" : "Nein"],
    ["Idee / Quelle", doc.source ? esc(doc.source) : "–"],
    ["Hinzugefügt in", doc.version ? `<span class="px" style="font-size:12px">${esc(doc.version)}</span>` : "–"],
    ["ID", `<span class="px" style="font-size:11.5px">${esc(a.id)}</span>`]
  ];
  if (P && isDone(P, a.id)) facts.unshift(["Erledigt am", esc(fmtDate(P.progress[a.id].at))]);
  let changes = "";
  if (isFlagged(a)) {
    const li = [];
    const base = S.index.meta.baseline || "";
    if (doc.isNew) li.push(`Neu seit BACAP ${esc(base)}${doc.version ? ` (hinzugefügt in ${esc(doc.version)})` : ""}.`);
    if (doc.renamedFrom) li.push(`Hieß in ${esc(base)} noch „${esc(doc.renamedFrom)}“.`);
    if (doc.movedFrom) li.push(`War vorher im Tab ${esc(doc.movedFrom)}.`);
    (doc.changed || []).forEach((k) => {
      const old = doc.was && doc.was[k] != null ? String(doc.was[k]) : "";
      const short = old.length > 220 ? old.slice(0, 220) + " …" : old;
      li.push(`${esc(FIELD_DE[k] || k)} geändert${old ? `, vorher: <span class="old">${esc(short)}</span>` : ", vorher leer"}`);
    });
    changes = `<div class="changes"><h4>Was ist anders</h4><ul>${li.map((x) => `<li>${x}</li>`).join("")}</ul></div>`;
  }
  const howTo = doc.req || (!doc.full ? a.desc : "");
  let statLine = "";
  const sv = statValue(P, a);
  if (a.stat && sv != null && !isDone(P, a.id)) {
    statLine = `<div><h4>Dein Stand</h4><div class="prog" style="display:flex;gap:10px;align-items:center;max-width:420px">${barHTML(Math.min(sv, a.stat.min), a.stat.min)}<span class="px" style="font-size:12px;white-space:nowrap">${esc(statPair(a.stat, sv))}</span></div></div>`;
  }
  const links = opts.noPageLink ? "" : `<div class="detail-links"><a class="mc-btn small" href="/advancement/${encodeURI(a.id)}" data-link>Advancement-Seite: wer hat es schon?</a></div>`;
  return `<div class="detail">
    ${howTo ? `<div><h4>So bekommst du es</h4>${reqBlock(howTo, words)}</div>` : ""}
    ${doc.full ? `<div><h4>Vollständige Anforderungen (Doku)</h4>${reqBlock(doc.full, words)}</div>` : ""}
    ${statLine}
    ${checklistHTML(a, P, opts.allCrit)}
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    ${doc.notes ? `<div><h4>Notizen</h4><p>${linkify(hl(doc.notes, words))}</p></div>` : ""}
    ${p || kids.length ? `<div><h4>Reihenfolge</h4><div class="chain">${p ? `<span class="lbl">Vorher:</span>${jump(p)}` : ""}${kids.length ? `<span class="lbl" style="margin-left:${p ? 8 : 0}px">Schaltet frei:</span>${kids.map(jump).join("")}` : ""}</div></div>` : ""}
    ${changes}
    ${links}
  </div>`;
}

/**
 * Baut den Explorer in root ein.
 * opts.player: Fortschritt (oder null), opts.view: Start-Ansicht, opts.playerPicker: Auswahl "Fortschritt von", opts.navigate(path)
 */
export function createExplorer(root, opts = {}) {
  const prefs = lsGet("bacap.explorer", {});
  let P = opts.player || null;
  const st = {
    view: opts.view || prefs.view || (S.TABS[1] ? S.TABS[1].id : S.TABS[0] ? S.TABS[0].id : "all"),
    mode: prefs.mode || "tree",
    q: "",
    tiers: new Set(),
    status: "all",
    trophy: false,
    open: new Set(),
    allCrit: new Set()
  };
  let game = null;
  const fromHash = viewFromHash();
  if (fromHash) st.view = fromHash;
  if (st.view === "changes" && !S.index.meta.baseline) st.view = "all";
  if (st.view !== "all" && st.view !== "changes" && !S.TABMAP[st.view]) st.view = S.TABS[0] ? S.TABS[0].id : "all";

  root.innerHTML = `<section class="window" aria-label="Advancements">
    <div class="mc-tabs" role="tablist" aria-label="Tabs" data-x="tabs"></div>
    <div class="mc-panel window-body" style="--notch:0px">
      <div class="window-head">
        <div class="section-head">
          <h2 class="h2" data-x="title">Advancements</h2>
          <div data-x="picker"></div>
        </div>
      </div>
      <div class="toolbar">
        <div class="searchrow">
          <label class="search">${ICON.search}
            <input class="mc-input" data-x="q" type="search" placeholder="Suchen: Name, Item, Biom, Trophäe …" autocomplete="off" aria-label="Advancements durchsuchen">
            <button class="clear" data-x="qclear" type="button" aria-label="Suche leeren" hidden>×</button>
          </label>
          <div class="seg" role="group" aria-label="Ansicht">
            <button type="button" class="mc-btn small" data-mode="tree">Baum</button>
            <button type="button" class="mc-btn small" data-mode="list">Liste</button>
            <button type="button" class="mc-btn small" data-mode="game">Spielansicht</button>
          </div>
        </div>
        <div class="filters" data-x="filters"></div>
      </div>
      <div class="window-inner" data-x="inner">
        <section class="summary" data-x="summary"></section>
        <div data-x="banner"></div>
        <div data-x="morehits"></div>
        <div data-x="game" hidden></div>
        <div data-x="gamedetail"></div>
        <ul class="list" data-x="list"></ul>
      </div>
    </div>
  </section>`;
  const X = (k) => root.querySelector(`[data-x="${k}"]`);

  function viewFromHash() {
    const h = decodeURIComponent((location.hash || "").slice(1)).toLowerCase();
    if (!h) return null;
    if (h === "alle") return "all";
    if (h === "neu") return "changes";
    const t = S.TABKEY[h];
    return t ? t.id : null;
  }
  function viewKey(v) { return v === "all" ? "alle" : v === "changes" ? "neu" : (S.TABMAP[v] ? S.TABMAP[v].key : ""); }
  function savePrefs() { lsSet("bacap.explorer", { view: st.view, mode: st.mode }); }

  // ---------------------------------------------------------------- Daten
  const allVisible = () => S.TABS.flatMap((t) => t.items).filter((a) => visible(a, P));
  function baseItems() {
    if (st.view === "all") return allVisible();
    if (st.view === "changes") return allVisible().filter(isFlagged);
    const t = S.TABMAP[st.view] || S.TABS[0];
    return t ? t.items.filter((a) => visible(a, P)) : [];
  }
  const queryWords = () => st.q.toLowerCase().split(/\s+/).filter(Boolean);
  function matches(a, words) {
    if (st.tiers.size && !st.tiers.has(tierOf(a))) return false;
    if (P && st.status === "open" && isDone(P, a.id)) return false;
    if (P && st.status === "done" && !isDone(P, a.id)) return false;
    if (st.trophy && !(a.doc && a.doc.trophy)) return false;
    return words.every((w) => a.hay.includes(w));
  }

  // ---------------------------------------------------------------- Zeichnen
  function renderTabs() {
    const tabBtn = (id, label, title, inner, extra = "") => `<button type="button" class="mc-tab${extra}" role="tab" data-view="${esc(id)}" aria-selected="${st.view === id}" title="${esc(title)}">${inner}<span class="lbl">${esc(label)}</span></button>`;
    let html = tabBtn("all", "Alle", "Alle Tabs auf einen Blick", `<span class="sym" aria-hidden="true">∑</span>`, " special");
    if (S.index.meta.baseline) html += tabBtn("changes", "Neu", `Neu & geändert seit BACAP ${S.index.meta.baseline}`, `<span class="sym" aria-hidden="true">★</span>`, " special");
    for (const t of S.TABS) {
      const items = t.items.filter(counted);
      const n = P ? items.filter((a) => isDone(P, a.id)).length : 0;
      const mini = P ? `<span class="mini"><i style="width:${items.length ? (n / items.length) * 100 : 0}%"></i></span>` : "";
      html += tabBtn(t.id, t.de, `${t.title} (${t.de})${P ? ` – ${n}/${items.length}` : ""}`, `<span class="ico" style="background-image:url(${px.icon(t.icon)})" aria-hidden="true"></span>${mini}`);
    }
    X("tabs").innerHTML = html;
    const sel = X("tabs").querySelector('[aria-selected="true"]');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function renderPicker() {
    const el = X("picker");
    if (!opts.playerPicker) { el.innerHTML = ""; return; }
    const names = S.players.map((p) => p.name);
    el.innerHTML = names.length ? `<label class="nowrap" style="display:inline-flex;gap:8px;align-items:center;font-size:13px">Fortschritt von
      <select class="mc-input" data-x="pick" style="height:34px;width:auto;min-width:160px"><option value="">– niemandem –</option>${names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select></label>` : "";
  }

  function renderFilters() {
    const scope = baseItems();
    const cnt = {};
    scope.forEach((a) => { const t = tierOf(a); cnt[t] = (cnt[t] || 0) + 1; });
    let html = TIER_ORDER.filter((t) => cnt[t]).map((t) =>
      `<button type="button" class="chip" data-tier="${t}" aria-pressed="${st.tiers.has(t)}" style="--tc:var(--t-${t})" title="${esc(TIERS[t].en)}"><span class="dot"></span>${esc(TIERS[t].de)} <span class="n">${cnt[t]}</span></button>`).join("");
    html += `<span class="fsep" aria-hidden="true"></span>`;
    if (P) {
      html += `<button type="button" class="chip" data-status="open" aria-pressed="${st.status === "open"}">Offen</button>` +
        `<button type="button" class="chip" data-status="done" aria-pressed="${st.status === "done"}" style="--tc:var(--gold)">Erledigt</button>`;
    }
    html += `<button type="button" class="chip" data-trophy="1" aria-pressed="${st.trophy}" style="--tc:var(--t-legend)">${ICON.cup.replace("<svg", '<svg width="14" height="14"')}Mit Trophäe</button>`;
    X("filters").innerHTML = html;
  }

  function sumProgText() {
    const items = baseItems().filter(counted);
    const n = items.filter((a) => isDone(P, a.id)).length;
    return P ? `${nf.format(n)} von ${nf.format(items.length)} erledigt` : `${nf.format(items.length)} Advancements`;
  }

  function renderSummary() {
    const m = S.index.meta;
    let title, sub, counts = {};
    const items = baseItems();
    items.forEach((a) => { const t = tierOf(a); counts[t] = (counts[t] || 0) + 1; });
    const t = S.TABMAP[st.view];
    if (st.view === "all") { title = "Alle Tabs"; sub = `Alle ${nf.format(items.length)} Advancements, Tab für Tab.`; }
    else if (st.view === "changes") {
      title = "Neu & geändert";
      sub = `Unterschiede zwischen BACAP ${m.baseline} und ${m.version}: ${m.newCount} neue Advancements, ${m.changedCount} geänderte, umbenannte oder verschobene${m.removed && m.removed.length ? `, ${m.removed.length} entfernte` : ""}.`;
    } else if (t) {
      title = t.title;
      const rootA = t.items[0];
      sub = (t.de !== t.title ? t.de + ". " : "") + (rootA ? rootA.desc : "");
    }
    const tc = Object.keys(TIER_PLURAL).filter((k) => counts[k]).map((k) => `<span style="--tc:var(--t-${k})"><span class="dot"></span>${counts[k]} ${TIER_PLURAL[k]}</span>`).join("");
    X("summary").innerHTML = `<div style="min-width:0">
        <h3 class="h2">${t ? `<span class="ico" style="width:32px;height:32px;display:inline-block;background-size:100% 100%;background-image:url(${px.icon(t.icon)})"></span>` : ""}${esc(title)}</h3>
        <p class="sub">${esc(sub)}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start">
        <div class="tiercount">${tc}</div>
        <div class="tiercount"><span data-x="sumprog" class="px" style="font-size:12px">${sumProgText()}</span></div>
      </div>`;
    let banner = "";
    if (t && t.banner) banner += `<p class="banner">${linkify(esc(t.banner))}</p>`;
    if (t && t.note) banner += `<p class="banner">${esc(t.note)}</p>`;
    if (st.view === "changes" && m.removed && m.removed.length) banner += `<p class="banner">Entfernt: ${m.removed.map((r) => esc(r.name) + " (" + esc(r.tab) + ")").join(", ")}</p>`;
    if (!S.index.bacapLoaded) banner += `<p class="banner">BACAP ist auf dem Server gerade nicht geladen. Es werden nur die Vanilla-Advancements angezeigt.</p>`;
    X("banner").innerHTML = banner;
    const tile = t ? px.tile(t.pattern) : px.tile("stone");
    X("inner").style.setProperty("--tile", `url(${tile})`);
    X("title").textContent = P ? `Advancements von ${P.name}` : "Advancements";
  }

  function rowHTML(a, words, o) {
    const tree = o.tree;
    const t = S.TABMAP[a.tab];
    const done = isDone(P, a.id);
    const p = a.parent ? S.BYID[a.parent] : null;
    const doc = a.doc || {};
    const base = S.index.meta.baseline || "";
    const badges =
      (doc.isNew ? `<span class="badge new" title="Neu seit ${esc(base)}">NEU</span>` : "") +
      (!doc.isNew && isFlagged(a) ? `<span class="badge chg">${doc.renamedFrom ? "UMBENANNT" : doc.movedFrom ? "VERSCHOBEN" : "GEÄNDERT"}</span>` : "") +
      (a.hidden ? `<span class="badge hid">VERSTECKT</span>` : "") +
      (done ? `<span class="badge ok">ERLEDIGT</span>` : "");
    const rew = rewardTags(a);
    let after = "";
    if (p) after = `nach <b>${hl(p.title, words)}</b>`;
    else if (doc.req) after = `Tab startet: ${hl(doc.req, words)}`;
    if (o.showTab && t) after = `<span class="tabtag" style="--c:${esc(t.color)}"><i></i>${esc(t.title)}</span>${after ? " · " + after : ""}`;
    const open = st.open.has(a.id);
    const d = tree ? Math.min(a.depth || 0, 10) : 0;
    return `<li class="row${done ? " done" : ""}${open ? " open" : ""}${tree ? " tree d" + Math.min(a.depth || 0, 1) : ""}" data-id="${esc(a.id)}" style="--d:${d}">
      <div class="row-main">
        <button type="button" class="frame-btn" data-act="open" data-tip="${esc(a.id)}" aria-label="${esc(a.title)}: Details" title="${esc((TIERS[tierOf(a)] || TIERS.task).de)}">${frameHTML(a, done, "s52")}</button>
        <div class="txt" data-act="open">
          <div class="name">${hl(a.title, words)}${badges}</div>
          <div class="desc">${hl(a.desc, words)}</div>
          ${after ? `<div class="after">${after}</div>` : ""}
          ${progressHTML(a, P)}
          ${rew ? `<div class="rew-inline">${rew}</div>` : ""}
        </div>
        <div class="side">
          ${rew ? `<div class="rew">${rew}</div>` : ""}
          <button type="button" class="expand" data-act="open" aria-expanded="${open}" aria-label="Details zu ${esc(a.title)}">${ICON.chev}</button>
        </div>
      </div>
      ${open ? detailHTML(a, words, P, { allCrit: st.allCrit.has(a.id) }) : ""}
    </li>`;
  }

  function renderList() {
    const words = queryWords();
    const base = baseItems();
    const items = base.filter((a) => matches(a, words));
    const list = X("list");
    const gameMode = st.mode === "game" && S.TABMAP[st.view];
    const tree = st.mode === "tree" && !words.length && st.view !== "changes";
    let html = "";
    if (gameMode) {
      html = "";
    } else if (st.view === "changes") {
      const groups = [
        ["Neue Advancements", items.filter((a) => a.doc && a.doc.isNew)],
        ["Umbenannt", items.filter((a) => a.doc && a.doc.renamedFrom)],
        ["In einen anderen Tab verschoben", items.filter((a) => a.doc && a.doc.movedFrom)],
        ["Geänderte Anforderungen oder Belohnungen", items.filter((a) => a.doc && !a.doc.isNew && !a.doc.renamedFrom && !a.doc.movedFrom && a.doc.changed)]
      ];
      groups.forEach(([h, arr]) => {
        if (!arr.length) return;
        html += `<li class="grouph">${esc(h)} <span class="n">${arr.length}</span></li>`;
        html += arr.map((a) => rowHTML(a, words, { tree: false, showTab: true })).join("");
      });
    } else if (st.view === "all") {
      S.TABS.forEach((t) => {
        const arr = items.filter((a) => a.tab === t.id);
        if (!arr.length) return;
        html += `<li class="grouph">${iconHTML(t.icon, "ico")}${esc(t.title)} <span class="n">${arr.length}</span></li>`;
        html += arr.map((a) => rowHTML(a, words, { tree, showTab: false })).join("");
      });
    } else {
      html = items.map((a) => rowHTML(a, words, { tree, showTab: false })).join("");
    }
    if (!items.length && !gameMode) {
      html = `<li class="empty mc-panel"><b>Nichts gefunden</b>${words.length ? "Andere Suchbegriffe probieren oder Filter lösen." : "Für diese Filter gibt es hier keine Advancements."}</li>`;
    }
    list.innerHTML = html;
    list.hidden = !!gameMode;

    let more = "";
    if (words.length && st.view !== "all") {
      const elsewhere = allVisible().filter((a) => !base.includes(a) && matches(a, words)).length;
      if (elsewhere) more = `<p class="morehits">${items.length ? "" : "Hier nichts, aber "}${nf.format(elsewhere)} weitere Treffer in anderen Tabs. <button type="button" data-act="searchall">In allen Tabs suchen</button></p>`;
    }
    if (st.mode === "game" && !S.TABMAP[st.view]) more += `<p class="morehits">Die Spielansicht gibt es pro Tab. Wähle oben einen Tab aus.</p>`;
    X("morehits").innerHTML = more;
    renderGame(items, words);
  }

  function renderGame(items, words) {
    const box = X("game");
    const t = S.TABMAP[st.view];
    if (st.mode !== "game" || !t) {
      box.hidden = true;
      X("gamedetail").innerHTML = "";
      if (game) { game.destroy(); game = null; }
      return;
    }
    box.hidden = false;
    const match = new Set(items.map((a) => a.id));
    const highlight = words.length ? match : null;
    if (game && game.tabId === t.id) {
      game.update(P, match, highlight);
    } else {
      if (game) game.destroy();
      X("gamedetail").innerHTML = "";
      game = mountGameView(box, t, P, { match, highlight, onSelect: showGameDetail });
    }
  }

  function showGameDetail(id) {
    const a = S.BYID[id];
    if (!a) return;
    const done = isDone(P, a.id);
    X("gamedetail").innerHTML = `<ul class="list" style="margin-top:10px"><li class="row open${done ? " done" : ""}" data-id="${esc(a.id)}">
      <div class="row-main">${frameHTML(a, done, "s52")}<div class="txt"><div class="name">${esc(a.title)}${done ? `<span class="badge ok">ERLEDIGT</span>` : ""}</div><div class="desc">${esc(a.desc)}</div>${progressHTML(a, P)}</div>
      <div class="side"><div class="rew">${rewardTags(a)}</div></div></div>
      ${detailHTML(a, [], P, { allCrit: st.allCrit.has(a.id) })}</li></ul>`;
  }

  function renderModes() {
    root.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === st.mode)));
  }

  function renderAll() {
    renderTabs(); renderSummary(); renderFilters(); renderModes(); renderList();
  }

  // ---------------------------------------------------------------- Aktionen
  function setView(v) {
    st.view = v; st.open.clear();
    if (v !== "changes" && v !== "all" && !S.TABMAP[v]) st.view = S.TABS[0] ? S.TABS[0].id : "all";
    savePrefs();
    renderAll();
    try { history.replaceState(history.state, "", location.pathname + location.search + "#" + viewKey(st.view)); } catch { /* egal */ }
  }
  function setMode(m) { st.mode = m; savePrefs(); renderModes(); renderList(); }

  function jumpTo(id) {
    const a = S.BYID[id];
    if (!a || !visible(a, P)) return;
    st.q = ""; X("q").value = ""; X("qclear").hidden = true;
    st.tiers.clear(); st.status = "all"; st.trophy = false;
    st.view = a.tab; st.open.add(id);
    if (st.mode === "game") st.mode = "tree";
    savePrefs();
    renderAll();
    try { history.replaceState(history.state, "", location.pathname + location.search + "#" + viewKey(st.view)); } catch { /* egal */ }
    const el = root.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    }
  }

  function rerenderRow(row) {
    const a = S.BYID[row.dataset.id];
    if (!a) return;
    const words = queryWords();
    const tree = st.mode === "tree" && !words.length && st.view !== "changes";
    const tmp = document.createElement("ul");
    tmp.innerHTML = rowHTML(a, words, { tree, showTab: st.view === "changes" });
    row.replaceWith(tmp.firstElementChild);
  }

  function onClick(e) {
    const tab = e.target.closest(".mc-tab");
    if (tab && root.contains(tab)) { setView(tab.dataset.view); return; }
    const chip = e.target.closest(".chip");
    if (chip) {
      if (chip.dataset.tier) { const t = chip.dataset.tier; st.tiers.has(t) ? st.tiers.delete(t) : st.tiers.add(t); }
      else if (chip.dataset.status) st.status = st.status === chip.dataset.status ? "all" : chip.dataset.status;
      else if (chip.dataset.trophy) st.trophy = !st.trophy;
      renderFilters(); renderList(); return;
    }
    const mode = e.target.closest("[data-mode]");
    if (mode) { setMode(mode.dataset.mode); return; }
    if (e.target.closest('[data-act="searchall"]')) { setView("all"); return; }
    const jb = e.target.closest("[data-jump]");
    if (jb) { jumpTo(jb.dataset.jump); return; }
    const allc = e.target.closest('[data-act="allcrit"]');
    if (allc) {
      st.allCrit.add(allc.dataset.id);
      const row = allc.closest(".row");
      if (row && row.closest('[data-x="gamedetail"]')) showGameDetail(allc.dataset.id);
      else if (row) rerenderRow(row);
      return;
    }
    const act = e.target.closest('[data-act="open"]');
    if (!act) return;
    const row = act.closest(".row");
    if (!row || row.closest('[data-x="gamedetail"]')) return;
    if (window.getSelection && String(window.getSelection()).length > 2) return; // Text markieren erlauben
    const id = row.dataset.id;
    st.open.has(id) ? st.open.delete(id) : st.open.add(id);
    rerenderRow(row);
  }

  function onOver(e) {
    const f = e.target.closest("[data-tip]");
    if (!f || !root.contains(f)) return;
    const a = S.BYID[f.dataset.tip];
    if (a) showTooltip(f, tooltipHTML(a, P));
  }
  function onOut(e) {
    const f = e.target.closest("[data-tip]");
    if (f && !f.contains(e.relatedTarget)) hideTooltip();
  }
  function onKey(e) {
    if (e.key === "/" && !e.target.matches("input,textarea,select")) { e.preventDefault(); X("q").focus(); }
  }

  root.addEventListener("click", onClick);
  root.addEventListener("mouseover", onOver);
  root.addEventListener("mouseout", onOut);
  root.addEventListener("focusin", onOver);
  root.addEventListener("focusout", () => hideTooltip());
  document.addEventListener("keydown", onKey);
  const search = debounce(() => { st.q = X("q").value.trim(); renderFilters(); renderList(); }, 140);
  X("q").addEventListener("input", () => { X("qclear").hidden = !X("q").value; search(); });
  X("qclear").addEventListener("click", () => { X("q").value = ""; st.q = ""; X("qclear").hidden = true; renderList(); X("q").focus(); });
  root.addEventListener("change", (e) => {
    if (e.target.matches('[data-x="pick"]') && e.target.value && opts.navigate) {
      opts.navigate("/spieler/" + encodeURIComponent(e.target.value) + "#" + viewKey(st.view));
    }
  });

  renderPicker();
  renderAll();

  return {
    /** Neuer Fortschritt (Live-Update): alles neu zeichnen, offene Details und Filter bleiben. */
    setPlayer(newP) {
      P = newP;
      renderTabs(); renderSummary(); renderFilters(); renderList();
      if (st.mode === "game") {
        const open = X("gamedetail").querySelector(".row");
        if (open) showGameDetail(open.dataset.id);
      }
    },
    refresh() { renderPicker(); renderAll(); },
    jumpTo,
    /** Nur offene Advancements zeigen (für "Alle offenen anzeigen"). */
    showOpen() {
      st.status = "open"; st.q = ""; X("q").value = ""; X("qclear").hidden = true;
      if (st.mode === "game") st.mode = "list";
      renderFilters(); renderModes(); renderList();
      root.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    },
    highlight(id) {
      const el = root.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
      if (el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
      if (game) game.flash(id);
    },
    destroy() {
      document.removeEventListener("keydown", onKey);
      if (game) game.destroy();
      hideTooltip();
    }
  };
}
