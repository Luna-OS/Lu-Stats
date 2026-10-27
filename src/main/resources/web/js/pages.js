// Die Seiten der Website. Jede Seite bekommt das <main>-Element und gibt { onEvent, destroy } zurück.
import { $, esc, nf, pct, api, debounce, ago, fmtDate, fmtDateTime, fmtIso, frameHTML, iconHTML, avatarHTML, barHTML, xpHTML,
  toastTitle, statPair, TIERS, tierOf } from "./util.js";
import * as px from "./pixel.js";
import { S, loadPlayers, loadPlayer, isDone, gotGroups, statValue, fraction, visible, counted } from "./store.js";
import { createExplorer, detailHTML, checklistHTML, progressHTML, rewardTags } from "./explorer.js";

const sameName = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
const playerLink = (name) => "/spieler/" + encodeURIComponent(name);
const advLink = (id) => "/advancement/" + encodeURI(id);

/** XP-Punkte in ein Minecraft-Level umrechnen (Formel aus dem Spiel). */
function levelFor(points) {
  const total = (l) => (l <= 16 ? l * l + 6 * l : l <= 31 ? 2.5 * l * l - 40.5 * l + 360 : 4.5 * l * l - 162.5 * l + 2220);
  let l = 0;
  while (total(l + 1) <= points && l < 10000) l++;
  return l;
}
function xpLabel(P, total) {
  const lvl = levelFor(P.xp || 0);
  return `<span><b>${nf.format(P.done)}</b> von ${nf.format(total)} Advancements (${pct(P.done, total)} %)</span>` +
    `<span>${nf.format(P.xp || 0)} XP${lvl ? ` · reicht für Level ${nf.format(lvl)}` : ""}</span>`;
}
function onlineHTML(p) {
  return p.online ? `<span class="status on"><i></i>online</span>` : `<span class="status"><i></i>zuletzt da ${esc(ago(p.lastSeen))}</span>`;
}
function errorPanel(view, title, text) {
  view.innerHTML = `<div class="mc-panel empty"><b>${esc(title)}</b>${text}</div>`;
}
function setTitle(t) { document.title = t ? `${t} – ${S.info.title}` : S.info.title; }

// ---------------------------------------------------------------- Start
export async function startPage(view, nav) {
  setTitle("");
  await loadPlayers();
  const draw = () => {
    const ps = S.players;
    const total = S.total;
    const online = ps.filter((p) => p.online).length;
    const m = S.index.meta || {};
    const cards = ps.map((p) => `<a class="card${p.done >= total && total ? " done" : ""}" href="${playerLink(p.name)}" data-link>
        ${avatarHTML(p.name, "sm")}
        <div style="min-width:0"><div class="t">${esc(p.name)}</div><div class="s">${nf.format(p.done)} / ${nf.format(total)} · ${pct(p.done, total)} %</div></div>
        ${barHTML(p.done, total, p.done >= total ? "gold" : "")}
      </a>`).join("");
    const rank = ps.map((p, i) => `<tr>
        <td class="px ${i < 3 ? "place-" + (i + 1) : ""}">${i + 1}</td>
        <td><div class="pl">${avatarHTML(p.name, "xs")}<a href="${playerLink(p.name)}" data-link>${esc(p.name)}</a>${p.online ? `<span class="status on" title="online"><i></i></span>` : ""}</div></td>
        <td class="px nowrap">${nf.format(p.done)}</td>
        <td class="barcell hide-sm">${barHTML(p.done, total)}</td>
        <td class="nowrap hide-sm">${nf.format(p.xp)} XP</td>
        <td class="nowrap hide-sm faint">${p.lastUnlock ? esc(ago(p.lastUnlock)) : "–"}</td>
      </tr>`).join("");
    view.innerHTML = `
      <section class="mc-panel hero">
        <div>
          <h1 class="h1">${esc(S.info.title)}</h1>
          <p class="lead">Wer hat welche Advancements aus BlazeandCave's Advancements Pack? Was fehlt dir noch? Alles live vom Server.</p>
          <div class="meta">
            <span>BACAP <b>${esc(m.version || S.info.docVersion || "?")}</b></span>
            ${m.mcVersion ? `<span>Minecraft <b>${esc(m.mcVersion)}</b></span>` : ""}
            <span><b>${nf.format(total)}</b> Advancements</span>
            <span><b>${nf.format(ps.length)}</b> Spieler, <b>${nf.format(online)}</b> online</span>
            ${m.updated ? `<span>Doku-Stand <b>${esc(fmtIso(m.updated))}</b></span>` : ""}
          </div>
          ${S.index.bacapLoaded ? "" : `<p class="banner" style="margin-top:12px;color:#fff">BACAP ist auf dem Server gerade nicht geladen. Es werden nur die Vanilla-Advancements gezählt.</p>`}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">
          <a class="mc-btn" href="/alle" data-link>Alle Advancements</a>
          ${m.baseline ? `<a class="mc-btn" href="/neu" data-link>Neu &amp; geändert</a>` : ""}
          <a class="mc-btn" href="/vergleich" data-link>Spieler vergleichen</a>
        </div>
      </section>
      <div class="two-col" style="margin-top:18px">
        <div>
          <section class="mc-panel">
            <div class="section-head"><h2 class="h2">Spieler <span class="count">${nf.format(ps.length)}</span></h2></div>
            ${ps.length ? `<div class="grid cards">${cards}</div>` : `<div class="empty"><b>Noch keine Spieler</b>Sobald jemand auf dem Server war, taucht er hier auf.</div>`}
          </section>
          ${ps.length ? `<section class="mc-panel" id="rangliste">
            <div class="section-head"><h2 class="h2">Rangliste</h2><span class="faint" style="font-size:13px">nach erledigten Advancements</span></div>
            <div style="overflow-x:auto"><table class="rank"><thead><tr><th>#</th><th>Spieler</th><th>Erledigt</th><th class="hide-sm">Fortschritt</th><th class="hide-sm">XP</th><th class="hide-sm">Zuletzt</th></tr></thead><tbody>${rank}</tbody></table></div>
          </section>` : ""}
        </div>
        <section class="mc-panel">
          <div class="section-head"><h2 class="h2">Zuletzt freigeschaltet</h2></div>
          <ul class="feed" id="feed">${feedHTML()}</ul>
        </section>
      </div>`;
  };
  const feedHTML = () => {
    // Auch versteckte: wer sie hier sieht, sieht sie bei einem Spieler, der sie schon hat (wie die Chat-Meldung im Spiel).
    const items = S.recent.filter((r) => S.BYID[r.adv]);
    if (!items.length) return `<li class="empty" style="background:none;border:0;box-shadow:none;color:inherit;display:block"><b>Noch nichts</b>Hier erscheint, was gerade freigeschaltet wird.</li>`;
    return items.map((r, i) => {
      const a = S.BYID[r.adv];
      const t = toastTitle(a);
      return `<li data-k="${esc(r.player + "|" + r.adv)}"${i === 0 && r.fresh ? ' class="flash"' : ""}>${frameHTML(a, true, "s39")}
        <div style="min-width:0"><div class="f1${t.ch ? " ch" : ""}">${esc(t.text)}</div>
        <div class="f2"><a href="${playerLink(r.player)}" data-link>${esc(r.player)}</a>: <a href="${advLink(a.id)}" data-link>${esc(a.title)}</a></div></div>
        <time datetime="${new Date(r.at).toISOString()}" title="${esc(fmtDateTime(r.at))}">${esc(ago(r.at))}</time></li>`;
    }).join("");
  };
  draw();
  const refetch = debounce(async () => {
    const before = new Set(S.recent.map((r) => r.player + "|" + r.adv));
    await loadPlayers();
    S.recent.forEach((r) => { r.fresh = !before.has(r.player + "|" + r.adv); });
    const y = window.scrollY;
    draw();
    window.scrollTo(0, y);
  }, 400);
  return {
    onEvent(type) { if (type === "progress" || type === "player" || type === "players" || type === "stats") refetch(); },
    destroy() {}
  };
}

// ---------------------------------------------------------------- Spieler
export async function playerPage(view, name, nav) {
  let P;
  try {
    P = await loadPlayer(name);
  } catch (e) {
    setTitle("Spieler nicht gefunden");
    errorPanel(view, "Spieler nicht gefunden", `Kein Spieler „${esc(name)}“ – entweder war er noch nie auf dem Server, oder er hat sich mit <span class="px">/bacap privat</span> ausgeblendet. <a href="/" data-link>Zur Startseite</a>`);
    return { onEvent() {}, destroy() {} };
  }
  setTitle(P.name);
  view.innerHTML = `
    <section class="mc-panel player-head" data-x="head"></section>
    <section class="mc-panel"><div class="section-head"><h2 class="h2">Fortschritt pro Tab</h2></div><div class="grid tabs-grid" data-x="tabs"></div></section>
    <section class="mc-panel" data-x="almost-wrap"><div class="section-head"><h2 class="h2">Fast geschafft</h2><span class="faint" style="font-size:13px">hier bist du am nächsten dran</span></div><div class="almost" data-x="almost"></div></section>
    <section class="mc-panel"><div class="section-head"><h2 class="h2">Was fehlt dir noch?</h2><button type="button" class="mc-btn small" data-act="allopen">Alle offenen im Explorer</button></div><div data-x="missing"></div></section>
    <div style="margin-top:18px" data-x="explorer"></div>`;
  const X = (k) => view.querySelector(`[data-x="${k}"]`);
  let showAllMissing = false;
  const openMissing = new Set();
  const ex = createExplorer(X("explorer"), { player: P, navigate: nav });

  function candidates() {
    const out = [];
    for (const a of Object.values(S.BYID)) {
      if (!counted(a) || !visible(a, P) || isDone(P, a.id)) continue;
      const f = fraction(P, a);
      if (f <= 0) continue;
      if (a.groups.length < 2 && statValue(P, a) == null) continue;
      const left = a.stat && statValue(P, a) != null ? 1 : a.groups.length - gotGroups(P, a);
      out.push({ a, f, left });
    }
    out.sort((x, y) => y.f - x.f || x.left - y.left);
    return out;
  }
  function progText(a) {
    const sv = statValue(P, a);
    return a.stat && sv != null ? statPair(a.stat, sv) : `${gotGroups(P, a)}/${a.groups.length}`;
  }
  function drawHead() {
    X("head").innerHTML = `${avatarHTML(P.name)}
      <div class="who"><h1 class="h1">${esc(P.name)}</h1>
        <div style="margin-top:6px">${onlineHTML(P)}</div>
        <div class="actions">
          <a class="mc-btn small" href="/vergleich/${encodeURIComponent(P.name)}" data-link>Vergleichen</a>
          <button type="button" class="mc-btn small" data-act="copy">Link kopieren</button>
        </div>
      </div>
      ${xpHTML(P.done, S.total, xpLabel(P, S.total))}`;
  }
  function drawTabs() {
    X("tabs").innerHTML = S.TABS.map((t) => {
      const items = t.items.filter(counted);
      const n = items.filter((a) => isDone(P, a.id)).length;
      return `<a class="card${n >= items.length && items.length ? " done" : ""}" href="#${esc(t.key)}" data-tabjump="${esc(t.id)}">
        <span class="ico" style="background-image:url(${px.icon(t.icon)});background-size:100% 100%"></span>
        <div style="min-width:0"><div class="t">${esc(t.de)}</div><div class="s">${nf.format(n)} / ${nf.format(items.length)} · ${pct(n, items.length)} %</div></div>
        ${barHTML(n, items.length, n >= items.length && items.length ? "gold" : "")}</a>`;
    }).join("");
  }
  function drawAlmost() {
    const list = candidates().slice(0, 8);
    X("almost-wrap").hidden = !list.length;
    X("almost").innerHTML = list.map(({ a, f }) => `<a href="#" data-jumpto="${esc(a.id)}">
        ${frameHTML(a, false, "s39")}
        <div style="min-width:0"><div class="t">${esc(a.title)}</div><div class="s">${esc(progText(a))} · ${Math.floor(f * 100)} %</div></div>
        ${barHTML(Math.round(f * 1000), 1000)}</a>`).join("");
  }
  function drawMissing() {
    const all = candidates();
    const list = showAllMissing ? all : all.slice(0, 10);
    const notStarted = Object.values(S.BYID).filter((a) => counted(a) && visible(a, P) && !isDone(P, a.id)).length - all.length;
    if (!all.length) {
      X("missing").innerHTML = `<p class="muted">Gerade nichts angefangen, das mehrere Schritte hat. Offen sind noch ${nf.format(Math.max(0, notStarted))} Advancements.</p>`;
      return;
    }
    X("missing").innerHTML = `<p class="muted" style="margin:0 0 10px">${nf.format(all.length)} Advancements angefangen, ${nf.format(Math.max(0, notStarted))} noch gar nicht. Aufklappen zeigt genau, was noch fehlt.</p>
      <div class="missing">${list.map(({ a }) => `<details data-mid="${esc(a.id)}"${openMissing.has(a.id) ? " open" : ""}>
        <summary>${frameHTML(a, false, "s39")}<div style="min-width:0"><div class="t">${esc(a.title)}</div><div class="s">${esc(a.desc)}</div></div><span class="num">${esc(progText(a))}</span></summary>
        <div class="body">${progressHTML(a, P)}${checklistHTML(a, P, false) || (a.stat ? "" : `<p class="muted">${esc(a.desc)}</p>`)}
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="mc-btn small" data-jumpto="${esc(a.id)}">Im Explorer zeigen</button>
          <a class="mc-btn small" href="${advLink(a.id)}" data-link>Wer hat es schon?</a></div></div>
      </details>`).join("")}</div>
      ${all.length > list.length ? `<div style="margin-top:10px"><button type="button" class="mc-btn small" data-act="moremissing">Alle ${nf.format(all.length)} angefangenen zeigen</button></div>` : ""}`;
  }
  function drawAll() { drawHead(); drawTabs(); drawAlmost(); drawMissing(); }
  drawAll();

  function onClick(e) {
    const j = e.target.closest("[data-jumpto]");
    if (j) { e.preventDefault(); ex.jumpTo(j.dataset.jumpto); return; }
    const t = e.target.closest("[data-tabjump]");
    if (t) {
      e.preventDefault();
      const tab = S.TABMAP[t.dataset.tabjump];
      const tabBtn = X("explorer").querySelector(`.mc-tab[data-view="${CSS.escape(tab.id)}"]`);
      if (tabBtn) tabBtn.click();
      X("explorer").scrollIntoView({ block: "start" });
      return;
    }
    if (e.target.closest('[data-act="moremissing"]')) { showAllMissing = true; drawMissing(); return; }
    if (e.target.closest('[data-act="allopen"]')) { ex.showOpen(); return; }
    if (e.target.closest('[data-act="copy"]')) {
      const url = location.origin + playerLink(P.name);
      const btn = e.target.closest("button");
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => { btn.textContent = "Kopiert!"; }, () => { prompt("Link zu dieser Seite:", url); });
      setTimeout(() => { btn.textContent = "Link kopieren"; }, 1800);
    }
  }
  function onToggle(e) {
    const d = e.target.closest && e.target.closest("details[data-mid]");
    if (!d) return;
    d.open ? openMissing.add(d.dataset.mid) : openMissing.delete(d.dataset.mid);
  }
  view.addEventListener("click", onClick);
  view.addEventListener("toggle", onToggle, true);

  let lastAdv = null;
  const refetch = debounce(async () => {
    try {
      P = await loadPlayer(P.name);
      drawAll();
      ex.setPlayer(P);
      if (lastAdv) { ex.highlight(lastAdv); lastAdv = null; }
    } catch { /* Spieler inzwischen ausgeblendet: Seite bleibt, bis neu geladen wird */ }
  }, 250);
  return {
    onEvent(type, d) {
      if ((type === "progress" || type === "stats" || type === "player") && sameName(d.player, P.name)) {
        if (type === "progress") lastAdv = d.adv;
        refetch();
      }
    },
    destroy() { ex.destroy(); view.removeEventListener("click", onClick); view.removeEventListener("toggle", onToggle, true); }
  };
}

// ---------------------------------------------------------------- Advancement
export async function advancementPage(view, id, nav) {
  const a = S.BYID[id];
  if (!a) {
    setTitle("Nicht gefunden");
    errorPanel(view, "Advancement nicht gefunden", `Die ID „${esc(id)}“ gibt es auf diesem Server nicht. <a href="/alle" data-link>Alle Advancements</a>`);
    return { onEvent() {}, destroy() {} };
  }
  await loadPlayers();
  let data = await api("/api/advancement?id=" + encodeURIComponent(id));
  let chosen = "";
  let chosenP = null;
  setTitle(a.title);
  const tab = S.TABMAP[a.tab];
  const draw = () => {
    if (a.hidden && !S.spoiler) {
      const has = data.players.filter((p) => p.done);
      view.innerHTML = `<section class="mc-panel adv-head">${frameHTML(a, false, "s78")}<div><h1 class="h1">Verstecktes Advancement</h1>
        <p class="lead">Name und Beschreibung bleiben geheim, bis man es hat. Den Spoiler-Schalter oben einschalten, um alles zu sehen.</p>
        <p class="muted">${has.length ? `${nf.format(has.length)} Spieler haben es schon.` : "Noch niemand hat es."}</p></div></section>`;
      return;
    }
    const done = data.players.filter((p) => p.done).sort((x, y) => (x.at || 0) - (y.at || 0));
    const partial = data.players.filter((p) => !p.done && (p.got > 0 || (p.stat != null && p.stat > 0))).sort((x, y) => (y.stat ?? y.got) - (x.stat ?? x.got));
    const t = TIERS[tierOf(a)] || TIERS.task;
    const ch = a.frame === "challenge";
    const parts = (p) => (a.stat && p.stat != null ? statPair(a.stat, p.stat) : `${p.got}/${a.groups.length}`);
    view.innerHTML = `
      <section class="mc-panel adv-head">
        ${frameHTML(a, chosenP ? isDone(chosenP, a.id) : done.length > 0, "s78")}
        <div style="min-width:0">
          <h1 class="h1${ch ? " title-ch" : ""}" style="${ch ? "" : "color:var(--t-task)"}">${esc(a.title)}</h1>
          <p class="lead">${esc(a.desc)}</p>
          <div class="meta" style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;font-size:13.5px;color:var(--ink-soft)">
            <span>${esc(t.de)}</span>
            ${tab ? `<a href="/alle#${esc(tab.key)}" data-link>${iconHTML(tab.icon, "ico")} ${esc(tab.title)}</a>` : ""}
            <span>${nf.format(done.length)} von ${nf.format(data.players.length)} Spielern haben es</span>
          </div>
          <div class="rew" style="justify-content:flex-start;margin-top:10px;max-width:none">${rewardTags(a)}</div>
        </div>
      </section>
      <div class="two-col" style="margin-top:18px">
        <section class="mc-panel">
          <div class="section-head"><h2 class="h2">Details</h2>
            <label class="nowrap" style="display:inline-flex;gap:8px;align-items:center;font-size:13px">Checkliste für
              <select class="mc-input" data-x="who" style="height:34px;width:auto;min-width:150px"><option value="">– niemanden –</option>
              ${data.players.map((p) => `<option value="${esc(p.name)}"${sameName(p.name, chosen) ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
          </div>
          <div class="row" style="margin:0">${detailHTML(a, [], chosenP, { noPageLink: true, allCrit: true }).replace('class="detail"', 'class="detail" style="padding-left:14px;border-top:0"')}</div>
        </section>
        <div>
          <section class="mc-panel">
            <div class="section-head"><h2 class="h2">Wer hat es schon? <span class="count">${nf.format(done.length)}</span></h2></div>
            ${done.length ? `<ul class="who-has">${done.map((p) => `<li class="got">${avatarHTML(p.name, "sm")}<a href="${playerLink(p.name)}" data-link>${esc(p.name)}</a><span class="s" title="${esc(fmtDateTime(p.at))}">${esc(fmtDate(p.at))}</span></li>`).join("")}</ul>`
              : `<p class="muted">Noch niemand. Wer wird der Erste?</p>`}
          </section>
          ${partial.length ? `<section class="mc-panel">
            <div class="section-head"><h2 class="h2">Auf dem Weg <span class="count">${nf.format(partial.length)}</span></h2></div>
            <ul class="who-has">${partial.map((p) => `<li>${avatarHTML(p.name, "sm")}<a href="${playerLink(p.name)}" data-link>${esc(p.name)}</a><span class="s">${esc(parts(p))}</span></li>`).join("")}</ul>
          </section>` : ""}
        </div>
      </div>`;
  };
  draw();
  async function onChange(e) {
    if (!e.target.matches('[data-x="who"]')) return;
    chosen = e.target.value;
    chosenP = chosen ? await loadPlayer(chosen).catch(() => null) : null;
    draw();
  }
  function onClick(e) {
    const j = e.target.closest("[data-jump]");
    if (j) { e.preventDefault(); nav(advLink(j.dataset.jump)); }
  }
  view.addEventListener("change", onChange);
  view.addEventListener("click", onClick);
  const refetch = debounce(async () => {
    data = await api("/api/advancement?id=" + encodeURIComponent(id));
    if (chosen) chosenP = await loadPlayer(chosen).catch(() => null);
    draw();
  }, 300);
  return {
    onEvent(type, d) { if ((type === "progress" && d.adv === id) || type === "players" || (type === "stats" && a.stat)) refetch(); },
    destroy() { view.removeEventListener("change", onChange); view.removeEventListener("click", onClick); }
  };
}

// ---------------------------------------------------------------- Vergleich
export async function comparePage(view, nameA, nameB, nav) {
  setTitle("Vergleich");
  await loadPlayers();
  let A = null, B = null, filterTab = "";
  const opts = (sel) => S.players.map((p) => `<option value="${esc(p.name)}"${sameName(p.name, sel) ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  async function load() {
    A = nameA ? await loadPlayer(nameA).catch(() => null) : null;
    B = nameB ? await loadPlayer(nameB).catch(() => null) : null;
  }
  function draw() {
    let body = "";
    if (A && B) {
      const rows = S.TABS.map((t) => {
        const items = t.items.filter(counted);
        const na = items.filter((a) => isDone(A, a.id)).length, nb = items.filter((a) => isDone(B, a.id)).length;
        return `<tr class="${na > nb ? "lead-a" : nb > na ? "lead-b" : ""}"><td class="tab-name">${iconHTML(t.icon, "ico")} ${esc(t.de)}</td>
          <td class="n a">${nf.format(na)}</td><td style="width:28%">${barHTML(na, items.length)}</td><td style="width:28%">${barHTML(nb, items.length)}</td><td class="n b">${nf.format(nb)}</td><td class="n faint">${nf.format(items.length)}</td></tr>`;
      }).join("");
      const pool = Object.values(S.BYID).filter((a) => counted(a) && (!filterTab || a.tab === filterTab));
      const onlyA = pool.filter((a) => isDone(A, a.id) && !isDone(B, a.id) && (visible(a, A) || visible(a, B)));
      const onlyB = pool.filter((a) => isDone(B, a.id) && !isDone(A, a.id) && (visible(a, A) || visible(a, B)));
      const both = pool.filter((a) => isDone(A, a.id) && isDone(B, a.id));
      const li = (arr, P) => arr.length ? `<ul>${arr.map((a) => `<li><a href="${advLink(a.id)}" data-link>${frameHTML(a, true, "s26")}${esc(a.title)}</a></li>`).join("")}</ul>` : `<p class="muted">Keine.</p>`;
      body = `
        <div class="two-col" style="margin-top:18px">
          <section class="mc-panel"><div class="section-head"><h2 class="h2">${avatarHTML(A.name, "sm")} ${esc(A.name)}</h2>${onlineHTML(A)}</div>${xpHTML(A.done, S.total, xpLabel(A, S.total))}</section>
          <section class="mc-panel"><div class="section-head"><h2 class="h2">${avatarHTML(B.name, "sm")} ${esc(B.name)}</h2>${onlineHTML(B)}</div>${xpHTML(B.done, S.total, xpLabel(B, S.total))}</section>
        </div>
        <section class="mc-panel"><div class="section-head"><h2 class="h2">Pro Tab</h2><span class="faint" style="font-size:13px">grün = liegt vorn</span></div>
          <div style="overflow-x:auto"><table class="vs-table"><tbody>${rows}</tbody></table></div></section>
        <section class="mc-panel">
          <div class="section-head"><h2 class="h2">Wer hat was?</h2>
            <label class="nowrap" style="display:inline-flex;gap:8px;align-items:center;font-size:13px">Tab
              <select class="mc-input" data-x="ftab" style="height:34px;width:auto"><option value="">Alle Tabs</option>${S.TABS.map((t) => `<option value="${esc(t.id)}"${t.id === filterTab ? " selected" : ""}>${esc(t.de)}</option>`).join("")}</select></label>
          </div>
          <div class="vs-lists">
            <div><h3 class="h3">Nur ${esc(A.name)} <span class="count">${nf.format(onlyA.length)}</span></h3>${li(onlyA, A)}</div>
            <div><h3 class="h3">Beide <span class="count">${nf.format(both.length)}</span></h3>${li(both, A)}</div>
            <div><h3 class="h3">Nur ${esc(B.name)} <span class="count">${nf.format(onlyB.length)}</span></h3>${li(onlyB, B)}</div>
          </div>
        </section>`;
    } else if (nameA && nameB) {
      body = `<div class="mc-panel empty" style="margin-top:18px"><b>Spieler nicht gefunden</b>Einer der beiden ist unbekannt oder ausgeblendet.</div>`;
    }
    view.innerHTML = `<section class="mc-panel">
        <h1 class="h1" style="margin-bottom:12px">Spieler vergleichen</h1>
        ${S.players.length < 2 ? `<p class="muted">Dafür braucht es mindestens zwei Spieler.</p>` : `<form class="vs-pick" data-x="form">
          <label>Spieler 1<select class="mc-input" name="a"><option value="">– wählen –</option>${opts(nameA)}</select></label>
          <span class="vs">VS</span>
          <label>Spieler 2<select class="mc-input" name="b"><option value="">– wählen –</option>${opts(nameB)}</select></label>
          <button class="mc-btn" type="submit">Vergleichen</button>
        </form>`}
      </section>${body}`;
  }
  await load();
  draw();
  function onSubmit(e) {
    if (!e.target.matches('[data-x="form"]')) return;
    e.preventDefault();
    const f = new FormData(e.target);
    const a = f.get("a"), b = f.get("b");
    if (a && b) nav(`/vergleich/${encodeURIComponent(a)}/${encodeURIComponent(b)}`);
  }
  function onChange(e) { if (e.target.matches('[data-x="ftab"]')) { filterTab = e.target.value; draw(); } }
  view.addEventListener("submit", onSubmit);
  view.addEventListener("change", onChange);
  const refetch = debounce(async () => { await load(); draw(); }, 400);
  return {
    onEvent(type, d) { if ((type === "progress" || type === "stats") && (sameName(d.player, nameA) || sameName(d.player, nameB))) refetch(); },
    destroy() { view.removeEventListener("submit", onSubmit); view.removeEventListener("change", onChange); }
  };
}

// ---------------------------------------------------------------- Alle Advancements (Doku-Übersicht ohne Spieler)
export async function explorerPage(view, which, nav) {
  setTitle(which === "changes" ? "Neu & geändert" : "Alle Advancements");
  if (!S.players.length) await loadPlayers().catch(() => {});
  view.innerHTML = `<div data-x="ex"></div>`;
  if (which === "changes" && !location.hash) history.replaceState(history.state, "", location.pathname + "#neu");
  const ex = createExplorer(view.querySelector('[data-x="ex"]'), { player: null, view: which === "changes" ? "changes" : undefined, playerPicker: true, navigate: nav });
  return { onEvent(type) { if (type === "players") ex.refresh(); }, destroy() { ex.destroy(); } };
}

export function notFoundPage(view) {
  setTitle("Nicht gefunden");
  errorPanel(view, "Seite nicht gefunden", `<a href="/" data-link>Zur Startseite</a>`);
  return { onEvent() {}, destroy() {} };
}
