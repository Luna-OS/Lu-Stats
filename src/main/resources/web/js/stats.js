// Statistiken, Tode, Live-Ereignisse und Karte. Die Werte kommen roh vom Server (Ticks, Zentimeter, Zehntel-Schaden)
// und werden hier formatiert. Alle Texte vom Server gehen durch esc().
import { esc, nf, pct, api, debounce, ago, fmtDate, fmtDateTime, frameHTML, iconHTML, avatarHTML, barHTML, toastTitle } from "./util.js";
import * as px from "./pixel.js";
import { S } from "./store.js";

const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const sameName = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
const playerLink = (name) => "/spieler/" + encodeURIComponent(name);
const advLink = (id) => "/advancement/" + encodeURI(id);
function setTitle(t) { document.title = t ? `${t} – ${S.info.title}` : S.info.title; }
function errorPanel(view, title, html) { view.innerHTML = `<div class="mc-panel empty"><b>${esc(title)}</b>${html}</div>`; }
const noop = { onEvent() {}, destroy() {} };

// ---------------------------------------------------------------- Katalog
export const ST = { catalog: null, BYKEY: {}, at: 0 };

export async function loadCatalog(force) {
  if (!force && ST.catalog && Date.now() - ST.at < 30000) return ST.catalog;
  const c = await api("/api/stats/catalog");
  ST.catalog = c;
  ST.at = Date.now();
  ST.BYKEY = {};
  c.stats.forEach((s) => { ST.BYKEY[s.key] = s; });
  return c;
}

const idPath = (id) => String(id || "").replace(/^[^:]*:/, "");
export function shortName(id) {
  if (idPath(id) === "player") return "Spieler";
  return idPath(id).split(/[_/.]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}
/** Platz in einer absteigend sortierten Liste; Gleichstand teilt sich den Platz. */
const places = (rows) => rows.map((r, i, a) => (i > 0 && a[i - 1].v === r.v ? null : i + 1)).map((p, i, a) => { while (p == null) p = a[--i]; return p; });
/** Statistik zu einem Schlüssel, auch wenn sie (noch) nicht im Katalog steht. */
export function statInfo(key) {
  if (ST.BYKEY[key]) return ST.BYKEY[key];
  const [type, value] = String(key).split("|");
  return { key, type, value, cat: "", name: shortName(value), unit: "count" };
}

// Namen wie in der deutschen Statistik-Ansicht des Spiels.
const CUSTOM_DE = {
  play_time: "Gespielte Zeit", total_world_time: "Zeit in der Welt", time_since_death: "Zeit seit dem letzten Tod",
  time_since_rest: "Zeit seit dem letzten Schlaf", sneak_time: "Geschlichene Zeit", deaths: "Tode", mob_kills: "Getötete Kreaturen",
  player_kills: "Getötete Spieler", damage_dealt: "Verursachter Schaden", damage_taken: "Erlittener Schaden",
  damage_blocked_by_shield: "Mit Schild abgewehrt", damage_absorbed: "Absorbierter Schaden", damage_resisted: "Widerstandener Schaden",
  damage_dealt_absorbed: "Verursachter Schaden (absorbiert)", damage_dealt_resisted: "Verursachter Schaden (widerstanden)",
  walk_one_cm: "Gelaufen", sprint_one_cm: "Gesprintet", crouch_one_cm: "Geschlichen", swim_one_cm: "Geschwommen",
  fall_one_cm: "Gefallen", climb_one_cm: "Geklettert", fly_one_cm: "Geflogen", walk_under_water_one_cm: "Unter Wasser gelaufen",
  walk_on_water_one_cm: "Auf Wasser gelaufen", boat_one_cm: "Boot gefahren", minecart_one_cm: "Lore gefahren", horse_one_cm: "Geritten (Pferd)",
  pig_one_cm: "Geritten (Schwein)", strider_one_cm: "Geritten (Schreiter)", aviate_one_cm: "Mit Elytren geflogen",
  happy_ghast_one_cm: "Geflogen (Glücklicher Ghast)", nautilus_one_cm: "Geritten (Nautilus)", jump: "Sprünge", drop: "Gegenstände fallen gelassen",
  leave_game: "Spiel verlassen", animals_bred: "Tiere gezüchtet", fish_caught: "Fische gefangen", talked_to_villager: "Mit Dorfbewohnern geredet",
  traded_with_villager: "Mit Dorfbewohnern gehandelt", eat_cake_slice: "Kuchenstücke gegessen", fill_cauldron: "Kessel befüllt",
  use_cauldron: "Aus Kessel geschöpft", clean_armor: "Rüstung gewaschen", clean_banner: "Banner gewaschen", clean_shulker_box: "Shulker-Kisten gewaschen",
  interact_with_brewingstand: "Braustand benutzt", interact_with_beacon: "Leuchtfeuer benutzt", interact_with_crafting_table: "Werkbank benutzt",
  interact_with_furnace: "Ofen benutzt", interact_with_blast_furnace: "Schmelzofen benutzt", interact_with_smoker: "Räucherofen benutzt",
  interact_with_anvil: "Amboss benutzt", interact_with_grindstone: "Schleifstein benutzt", interact_with_stonecutter: "Steinsäge benutzt",
  interact_with_loom: "Webstuhl benutzt", interact_with_cartography_table: "Kartentisch benutzt", interact_with_smithing_table: "Schmiedetisch benutzt",
  interact_with_lectern: "Lesepult benutzt", interact_with_campfire: "Lagerfeuer benutzt", inspect_dispenser: "Werfer durchsucht",
  inspect_dropper: "Spender durchsucht", inspect_hopper: "Trichter durchsucht", open_chest: "Truhen geöffnet", open_enderchest: "Endertruhen geöffnet",
  open_shulker_box: "Shulker-Kisten geöffnet", open_barrel: "Fässer geöffnet", trigger_trapped_chest: "Redstone-Truhen ausgelöst",
  play_noteblock: "Notenblöcke gespielt", tune_noteblock: "Notenblöcke gestimmt", pot_flower: "Pflanzen eingetopft",
  play_record: "Schallplatten abgespielt", sleep_in_bed: "Im Bett geschlafen", enchant_item: "Gegenstände verzaubert",
  raid_trigger: "Überfälle ausgelöst", raid_win: "Überfälle gewonnen", target_hit: "Zielblöcke getroffen", bell_ring: "Glocken geläutet"
};
const ACTIVITY_DE = { active_time: "Aktiv gespielt", afk_time: "AFK-Zeit" };

export const CATS = [["Activity", "Aktivität"], ["General", "Allgemein"], ["Mobs Killed", "Getötet"], ["Killed By", "Getötet von"],
  ["Blocks Mined", "Abgebaut"], ["Items Crafted", "Hergestellt"], ["Items Used", "Benutzt"], ["Items Broken", "Verbraucht"],
  ["Items Picked Up", "Aufgehoben"], ["Items Dropped", "Fallen gelassen"]];
const CAT_DE = Object.fromEntries(CATS);
export const catLabel = (cat) => CAT_DE[cat] || cat || "Sonstiges";
const catOrder = (cat) => { const i = CATS.findIndex(([c]) => c === cat); return i < 0 ? 99 : i; };
const VERB = { mined: "abgebaut", crafted: "hergestellt", used: "benutzt", broken: "verbraucht", picked_up: "aufgehoben", dropped: "fallen gelassen", killed: "getötet" };

/** Kurzer Name, z. B. in einer Liste unter der Kategorie. */
export function statName(s) {
  const t = idPath(s.type), v = idPath(s.value);
  if (t === "custom") return CUSTOM_DE[v] || s.name || shortName(v);
  if (t === "activity") return ACTIVITY_DE[v] || s.name;
  return shortName(s.value);
}
/** Ganzer Titel, z. B. über einer Rangliste. */
export function statTitle(s) {
  const t = idPath(s.type);
  if (t === "custom" || t === "activity") return statName(s);
  if (t === "killed_by") return `Getötet von: ${shortName(s.value)}`;
  return VERB[t] ? `${shortName(s.value)} ${VERB[t]}` : (s.name || shortName(s.value));
}

export function fmtTicks(t) {
  const s = Math.floor((Number(t) || 0) / 20);
  if (s < 60) return `${s} Sek.`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} Std. ${m % 60} Min.`;
  return `${nf.format(Math.floor(h / 24))} T. ${h % 24} Std.`;
}
export const fmtSeconds = (s) => fmtTicks((Number(s) || 0) * 20);
export function fmtStat(unit, v) {
  v = Number(v) || 0;
  switch (unit) {
    case "time": return fmtTicks(v);
    case "distance": return v >= 100000 ? `${nf1.format(v / 100000)} km` : `${nf.format(Math.round(v / 100))} m`;
    case "damage": return `${nf1.format(v / 20)} ♥`;
    default: return nf.format(v);
  }
}

const CUSTOM_ICON = [[/time/, "minecraft:clock"], [/^deaths$/, "minecraft:skeleton_skull"], [/player_kills/, "minecraft:diamond_sword"],
  [/mob_kills/, "minecraft:iron_sword"], [/damage_(taken|blocked|absorbed|resisted)/, "minecraft:golden_apple"], [/damage/, "minecraft:iron_axe"],
  [/aviate|fly|ghast/, "minecraft:elytra"], [/swim|water/, "minecraft:cod"], [/boat/, "minecraft:oak_boat"], [/minecart/, "minecraft:minecart"],
  [/horse|pig|strider|nautilus/, "minecraft:saddle"], [/_one_cm$/, "minecraft:leather_boots"], [/jump/, "minecraft:rabbit_foot"],
  [/fish/, "minecraft:fishing_rod"], [/bred/, "minecraft:wheat"], [/villager/, "minecraft:emerald"], [/enchant/, "minecraft:enchanted_book"],
  [/sleep/, "minecraft:red_bed"], [/chest|barrel|shulker/, "minecraft:chest"], [/noteblock|record/, "minecraft:music_disc_cat"],
  [/cake/, "minecraft:cake"], [/raid/, "minecraft:white_banner"], [/bell/, "minecraft:bell"], [/flower/, "minecraft:poppy"]];
export const mobIcon = (type) => (!type ? "minecraft:bone" : idPath(type) === "player" ? "minecraft:player_head" : type + "_spawn_egg");
export function statIcon(s) {
  const t = idPath(s.type), v = idPath(s.value);
  if (t === "killed" || t === "killed_by") return mobIcon(s.value);
  if (t === "activity") return v === "afk_time" ? "minecraft:cobweb" : "minecraft:clock";
  if (t === "custom") {
    for (const [re, id] of CUSTOM_ICON) if (re.test(v)) return id;
    return "minecraft:book";
  }
  return s.value;
}

/** /stats/custom/jump statt /stats/minecraft%3Acustom%7Cminecraft%3Ajump. */
export function statLink(key) {
  const [t, v] = String(key).split("|");
  const short = (id) => (String(id).startsWith("minecraft:") ? String(id).slice(10) : id);
  return "/stats/" + encodeURI(short(t) + "/" + short(v));
}
export function keyFromSlug(slug) {
  const i = slug.indexOf("/");
  if (i < 0) return null;
  const full = (id) => (id.includes(":") ? id : "minecraft:" + id);
  return full(slug.slice(0, i)) + "|" + full(slug.slice(i + 1).replace(/\/+$/, ""));
}

// ---------------------------------------------------------------- Tode
// Damage-Typ (msgId) → [Bezeichnung, Symbol, kurz vor „durch …“]
const CAUSES = {
  mob: ["Von einer Kreatur getötet", "minecraft:zombie_spawn_egg", "Getötet"], player: ["Von einem Spieler getötet", "minecraft:diamond_sword", "Getötet"],
  arrow: ["Erschossen", "minecraft:arrow"], trident: ["Aufgespießt", "minecraft:trident"], thrown: ["Getroffen", "minecraft:snowball"],
  fall: ["Fallschaden", "minecraft:feather"], lava: ["In Lava verbrannt", "minecraft:lava_bucket"], inFire: ["In Flammen aufgegangen", "minecraft:blaze_powder"],
  onFire: ["Verbrannt", "minecraft:blaze_powder"], hotFloor: ["Magmablock", "minecraft:magma_block"], campfire: ["Lagerfeuer", "minecraft:campfire"],
  drown: ["Ertrunken", "minecraft:water_bucket"], dryout: ["Ausgetrocknet", "minecraft:sand"], starve: ["Verhungert", "minecraft:rotten_flesh"],
  cactus: ["Kaktus", "minecraft:cactus"], sweetBerryBush: ["Süßbeerenstrauch", "minecraft:sweet_berries"], explosion: ["Explosion", "minecraft:tnt", "Gesprengt"],
  "explosion.player": ["Gesprengt", "minecraft:tnt"], badRespawnPoint: ["Bett oder Seelenanker explodiert", "minecraft:red_bed"],
  fireworks: ["Feuerwerk", "minecraft:firework_rocket"], fireball: ["Feuerball", "minecraft:fire_charge"], witherSkull: ["Witherschädel", "minecraft:wither_skeleton_skull"],
  wither: ["Verdorrt", "minecraft:wither_rose"], magic: ["Magie", "minecraft:potion"], indirectMagic: ["Magie", "minecraft:splash_potion"],
  thorns: ["Dornen", "minecraft:rose_bush"], sting: ["Gestochen", "minecraft:honeycomb"], freeze: ["Erfroren", "minecraft:powder_snow_bucket"],
  stalagmite: ["Auf Tropfstein gefallen", "minecraft:pointed_dripstone"], fallingStalactite: ["Von Tropfstein erschlagen", "minecraft:pointed_dripstone"],
  fallingBlock: ["Von einem Block erschlagen", "minecraft:gravel"], anvil: ["Vom Amboss erschlagen", "minecraft:anvil"],
  lightningBolt: ["Vom Blitz getroffen", "minecraft:lightning_rod"], outOfWorld: ["Ins Leere gefallen", "minecraft:ender_pearl"],
  outsideBorder: ["Außerhalb der Weltbarriere", "minecraft:barrier"], inWall: ["In einer Wand erstickt", "minecraft:gravel"],
  cramming: ["Zerquetscht", "minecraft:piston"], flyIntoWall: ["Gegen die Wand geflogen", "minecraft:elytra"],
  dragonBreath: ["Drachenatem", "minecraft:dragon_breath"], sonic_boom: ["Schallschlag", "minecraft:echo_shard"],
  mace_smash: ["Zerschmettert", "minecraft:mace"], spit: ["Angespuckt", "minecraft:llama_spawn_egg"], windCharge: ["Windkugel", "minecraft:wind_charge"],
  genericKill: ["Mit /kill getötet", "minecraft:barrier"], generic: ["Gestorben", "minecraft:bone"]
};
export const causeLabel = (id) => (CAUSES[id] ? CAUSES[id][0] : shortName(id || "generic"));
export const causeIcon = (id) => (CAUSES[id] ? CAUSES[id][1] : "minecraft:bone");
const DIM = { "minecraft:overworld": "Oberwelt", "minecraft:the_nether": "Nether", "minecraft:the_end": "Ende" };
export const dimLabel = (d) => DIM[d] || shortName(d);
export const mobName = (type, name) => name || shortName(type);

function killerHTML(e) {
  if (e.killerPlayer) return `<a href="${playerLink(e.killerPlayer)}" data-link>${esc(e.killerPlayer)}</a>`;
  if (e.killerType === "minecraft:player") return "einen Spieler";
  if (e.killerType) return `<a href="${statLink("minecraft:killed_by|" + e.killerType)}" data-link>${esc(mobName(e.killerType, e.killer))}</a>`;
  return "";
}
/** „Erschossen durch Skelett“ oder nur „Fallschaden“. */
export function deathText(e) {
  const k = killerHTML(e);
  if (!k) return esc(causeLabel(e.cause));
  const c = CAUSES[e.cause];
  return `${esc(c ? c[2] || c[0] : causeLabel(e.cause))} durch ${k}`;
}
const deathIcon = (e) => (e.killerType ? mobIcon(e.killerType) : causeIcon(e.cause));
const where = (e) => (e.dim ? `${esc(dimLabel(e.dim))} · X ${e.x} · Y ${e.y} · Z ${e.z}` : "");
const timeHTML = (at) => `<time datetime="${new Date(at).toISOString()}" title="${esc(fmtDateTime(at))}">${esc(ago(at))}</time>`;

/** Ein Tod oder ein Advancement als Zeile wie eine Chat-Meldung im Spiel. */
export function eventHTML(e, opts = {}) {
  const cls = `${opts.fresh ? " flash" : ""}`;
  if (e.type === "death") {
    return `<li class="ev${cls}" data-seq="${esc(e.seq)}">
      <span class="fr s39" style="background-image:url(${px.frame("task", false)})"><i style="background-image:url(${px.icon(deathIcon(e))})"></i></span>
      <div style="min-width:0"><div class="f1 death">Gestorben</div>
        <div class="f2">${opts.noPlayer ? "" : `<a href="${playerLink(e.player)}" data-link>${esc(e.player)}</a>: `}${deathText(e)}</div>
        ${e.message ? `<div class="f3">„${esc(e.message)}“</div>` : ""}
        ${opts.where === false || !e.dim ? "" : `<div class="f3">${where(e)}</div>`}
      </div>${timeHTML(e.at)}</li>`;
  }
  const a = S.BYID[e.adv] || { id: e.adv, frame: e.kind || "task", icon: "", title: e.title };
  const t = toastTitle(a);
  return `<li class="ev${cls}" data-seq="${esc(e.seq)}">${frameHTML(a, true, "s39")}
    <div style="min-width:0"><div class="f1${t.ch ? " ch" : ""}">${esc(t.text)}</div>
      <div class="f2">${opts.noPlayer ? "" : `<a href="${playerLink(e.player)}" data-link>${esc(e.player)}</a>: `}${S.BYID[e.adv] ? `<a href="${advLink(e.adv)}" data-link>${esc(a.title)}</a>` : esc(e.title || e.adv)}</div>
    </div>${timeHTML(e.at)}</li>`;
}
const emptyLi = (title, text) => `<li class="empty" style="background:none;border:0;box-shadow:none;color:inherit;display:block"><b>${esc(title)}</b>${esc(text)}</li>`;

function barList(items, render) {
  if (!items.length) return `<p class="muted">Noch nichts.</p>`;
  const max = Math.max(1, ...items.map((i) => i.n));
  return `<ul class="barlist">${items.map((it) => {
    const r = render(it);
    return `<li>${iconHTML(r.icon, "ico")}<div class="bl-main"><div class="bl-t">${r.label}</div>${barHTML(it.n, max)}</div><b class="px">${esc(r.value ?? nf.format(it.n))}</b></li>`;
  }).join("")}</ul>`;
}
function onlineChips(list) {
  if (!list || !list.length) return `<p class="muted" style="margin:0">Gerade ist niemand online.</p>`;
  return `<div class="chips">${list.map((o) => `<a class="pchip${o.afk ? " afk" : ""}" href="${playerLink(o.name)}" data-link>${avatarHTML(o.name, "xs")}${esc(o.name)}${o.afk ? `<span class="afk-tag" title="seit ${esc(fmtSeconds(o.idle))} untätig">AFK</span>` : ""}</a>`).join("")}</div>`;
}

// ---------------------------------------------------------------- Seite: Statistiken
function boardCard(b) {
  const s = statInfo(b.key);
  const pl = places(b.rows);
  const rows = b.rows.length ? b.rows.map((r, i) => `<li><span class="px place-${pl[i]}">${pl[i]}</span>${avatarHTML(r.name, "xs")}<a href="${playerLink(r.name)}" data-link>${esc(r.name)}</a><b>${esc(fmtStat(s.unit, r.v))}</b></li>`).join("")
    : `<li class="muted">Noch niemand.</li>`;
  return `<section class="mc-panel board-card">
    <div class="section-head"><h2 class="h3">${iconHTML(statIcon(s), "ico")} ${esc(statTitle(s))}</h2><a class="faint" href="${statLink(b.key)}" data-link style="font-size:13px">Rangliste</a></div>
    <ol class="mini-rank">${rows}</ol></section>`;
}

export async function statsPage(view, nav) {
  setTitle("Statistiken");
  let [cat, ov] = await Promise.all([loadCatalog(true), api("/api/stats/overview")]);
  let q = "", fcat = "";
  view.innerHTML = `
    <section class="mc-panel hero" data-x="hero"></section>
    <section class="mc-panel"><div class="section-head"><h2 class="h2">Gerade online</h2></div><div data-x="online"></div></section>
    <div class="board-grid" data-x="boards"></div>
    <section class="mc-panel" style="margin-top:18px">
      <div class="section-head"><h2 class="h2">Alle Statistiken <span class="count" data-x="count"></span></h2></div>
      <input class="mc-input" type="search" data-x="q" placeholder="Statistik suchen, z. B. Diamant, Sprünge, Zombie …" aria-label="Statistik suchen">
      <div class="filters" data-x="cats" style="margin:10px 0 12px"></div>
      <div class="stat-list" data-x="list"></div>
    </section>
    <section class="mc-panel"><div class="section-head"><h2 class="h2">Wo wird gespielt?</h2><span class="faint" style="font-size:13px">alle Spieler zusammen</span></div><div data-x="map"></div></section>`;
  const X = (k) => view.querySelector(`[data-x="${k}"]`);
  function drawTop() {
    X("hero").innerHTML = `<div><h1 class="h1">Statistiken</h1>
        <p class="lead">Alle Statistiken aus dem Spiel, live vom Server. Ein Klick auf eine Statistik zeigt die Rangliste aller Spieler.</p>
        <div class="meta"><span><b>${nf.format(ov.players)}</b> Spieler, <b>${nf.format(ov.online)}</b> online</span><span><b>${nf.format(cat.stats.length)}</b> Statistiken</span></div></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end"><a class="mc-btn" href="/tode" data-link>Tode</a><a class="mc-btn" href="/live" data-link>Live</a></div>`;
    X("online").innerHTML = onlineChips(ov.onlinePlayers);
    X("boards").innerHTML = ov.boards.map(boardCard).join("");
  }
  function drawCats() {
    const counts = {};
    cat.stats.forEach((s) => { counts[s.cat] = (counts[s.cat] || 0) + 1; });
    const cats = Object.keys(counts).sort((a, b) => catOrder(a) - catOrder(b));
    X("cats").innerHTML = `<button type="button" class="chip" data-cat="" aria-pressed="${!fcat}">Alle <span class="n">${nf.format(cat.stats.length)}</span></button>` +
      cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === fcat}">${esc(catLabel(c))} <span class="n">${nf.format(counts[c])}</span></button>`).join("");
  }
  function drawList() {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = cat.stats.filter((s) => (!fcat || s.cat === fcat) && words.every((w) => `${statTitle(s)} ${s.name} ${s.value} ${catLabel(s.cat)}`.toLowerCase().includes(w)))
      .sort((a, b) => catOrder(a.cat) - catOrder(b.cat) || (b.topV || 0) - (a.topV || 0));
    X("count").textContent = nf.format(list.length);
    const shown = list.slice(0, 300);
    X("list").innerHTML = shown.length ? shown.map((s) => `<a href="${statLink(s.key)}" data-link>${iconHTML(statIcon(s), "ico")}
        <div style="min-width:0"><div class="t">${esc(statTitle(s))}</div><div class="s">${esc(catLabel(s.cat))}${s.top ? ` · vorne: <b>${esc(s.top)}</b> mit ${esc(fmtStat(s.unit, s.topV))}` : ""}</div></div></a>`).join("") +
      (list.length > shown.length ? `<p class="muted">… und ${nf.format(list.length - shown.length)} weitere. Suche eingrenzen.</p>` : "")
      : `<p class="muted">Keine Statistik gefunden.</p>`;
  }
  drawTop(); drawCats(); drawList();
  const map = await mountMap(X("map"), "");

  const onInput = debounce(() => { q = X("q").value; drawList(); }, 120);
  X("q").addEventListener("input", onInput);
  function onClick(e) {
    const c = e.target.closest("[data-cat]");
    if (c) { fcat = c.dataset.cat; drawCats(); drawList(); }
  }
  view.addEventListener("click", onClick);
  const refetch = debounce(async () => {
    try {
      [cat, ov] = await Promise.all([loadCatalog(true), api("/api/stats/overview")]);
      drawTop(); drawCats(); drawList();
    } catch { /* nächster Versuch beim nächsten Ereignis */ }
  }, 800);
  const timer = setInterval(refetch, 30000);
  return {
    onEvent(type) { if (type === "feed" || type === "player") refetch(); },
    destroy() { clearInterval(timer); map.destroy(); view.removeEventListener("click", onClick); }
  };
}

// ---------------------------------------------------------------- Seite: Rangliste einer Statistik
export async function boardPage(view, slug, nav) {
  const key = keyFromSlug(slug);
  await loadCatalog().catch(() => {});
  let b;
  try {
    b = await api("/api/stats/top?key=" + encodeURIComponent(key || ""));
  } catch {
    setTitle("Nicht gefunden");
    errorPanel(view, "Statistik nicht gefunden", `Diese Statistik gibt es hier nicht. <a href="/stats" data-link>Alle Statistiken</a>`);
    return noop;
  }
  const s = statInfo(key);
  setTitle(statTitle(s));
  const options = () => {
    const groups = {};
    ST.catalog.stats.forEach((x) => { (groups[x.cat] = groups[x.cat] || []).push(x); });
    return Object.keys(groups).sort((x, y) => catOrder(x) - catOrder(y)).map((c) => `<optgroup label="${esc(catLabel(c))}">${groups[c]
      .sort((x, y) => statTitle(x).localeCompare(statTitle(y), "de")).map((x) => `<option value="${esc(x.key)}"${x.key === key ? " selected" : ""}>${esc(statTitle(x))}</option>`).join("")}</optgroup>`).join("");
  };
  function draw() {
    const max = b.rows.length ? b.rows[0].v : 1;
    const pl = places(b.rows);
    const rows = b.rows.map((r, i) => `<tr>
        <td class="px ${pl[i] <= 3 ? "place-" + pl[i] : ""}">${pl[i]}</td>
        <td><div class="pl">${avatarHTML(r.name, "xs")}<a href="${playerLink(r.name)}/stats" data-link>${esc(r.name)}</a>${r.online ? `<span class="status on" title="online"><i></i></span>` : ""}</div></td>
        <td class="px nowrap">${esc(fmtStat(s.unit, r.v))}</td>
        <td class="barcell hide-sm">${barHTML(r.v, max, pl[i] === 1 ? "gold" : "")}</td>
        <td class="nowrap hide-sm faint">${pct(r.v, b.total)} %</td></tr>`).join("");
    view.innerHTML = `
      <section class="mc-panel adv-head">
        <span class="fr s78" style="background-image:url(${px.frame("goal", b.rows.length > 0)})"><i style="background-image:url(${px.icon(statIcon(s))})"></i></span>
        <div style="min-width:0">
          <h1 class="h1">${esc(statTitle(s))}</h1>
          <p class="lead">${esc(catLabel(s.cat))} · zusammen <b>${esc(fmtStat(s.unit, b.total))}</b> · ${nf.format(b.rows.length)} Spieler</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center">
            <select class="mc-input" data-x="pick" style="height:34px;width:auto;max-width:100%" aria-label="Andere Statistik">${ST.catalog ? options() : ""}</select>
            <a class="mc-btn small" href="/stats" data-link>Alle Statistiken</a>
          </div>
        </div>
      </section>
      <section class="mc-panel">
        <div class="section-head"><h2 class="h2">Rangliste</h2><span class="faint" style="font-size:13px">live vom Server</span></div>
        ${b.rows.length ? `<div style="overflow-x:auto"><table class="rank"><thead><tr><th>#</th><th>Spieler</th><th>Wert</th><th class="hide-sm">Vergleich</th><th class="hide-sm">Anteil</th></tr></thead><tbody>${rows}</tbody></table></div>`
          : `<div class="empty"><b>Noch niemand</b>Bei dieser Statistik hat noch kein Spieler etwas.</div>`}
      </section>`;
  }
  draw();
  function onChange(e) { if (e.target.matches('[data-x="pick"]')) nav(statLink(e.target.value)); }
  view.addEventListener("change", onChange);
  const refetch = debounce(async () => {
    try { b = await api("/api/stats/top?key=" + encodeURIComponent(key)); const y = window.scrollY; draw(); window.scrollTo(0, y); } catch { /* egal */ }
  }, 800);
  const timer = setInterval(refetch, 20000);
  return {
    onEvent(type) { if (type === "feed" || type === "player") refetch(); },
    destroy() { clearInterval(timer); view.removeEventListener("change", onChange); }
  };
}

// ---------------------------------------------------------------- Seite: Tode
export async function deathsPage(view, nav) {
  setTitle("Tode");
  let d = await api("/api/deaths");
  let q = "", fcause = "";
  const fresh = new Set();
  view.innerHTML = `
    <section class="mc-panel hero" data-x="hero"></section>
    <div class="two-col" style="margin-top:18px">
      <section class="mc-panel">
        <div class="section-head"><h2 class="h2">Todesprotokoll <span class="count" data-x="n"></span></h2><span class="faint" style="font-size:13px">neue Tode erscheinen sofort</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <input class="mc-input" type="search" data-x="q" placeholder="Spieler, Kreatur oder Todesnachricht …" aria-label="Tode durchsuchen" style="flex:1 1 220px">
          <select class="mc-input" data-x="cause" style="width:auto" aria-label="Todesursache"></select>
        </div>
        <ul class="feed evlist" data-x="log"></ul>
      </section>
      <div data-x="side"></div>
    </div>`;
  const X = (k) => view.querySelector(`[data-x="${k}"]`);
  function drawHero() {
    X("hero").innerHTML = `<div><h1 class="h1">Tode</h1>
      <p class="lead">Wer ist wie gestorben? Todesursachen, die gefährlichsten Kreaturen und jeder einzelne Tod, live vom Server.</p>
      <div class="meta"><span><b>${nf.format(d.total)}</b> Tode insgesamt</span>${d.logged ? `<span><b>${nf.format(d.logged)}</b> mit Ursache seit ${esc(fmtDate(d.since))}</span>` : ""}</div></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end"><a class="mc-btn" href="${statLink("minecraft:custom|minecraft:deaths")}" data-link>Rangliste Tode</a><a class="mc-btn" href="/live" data-link>Live</a></div>`;
  }
  function drawSide() {
    X("side").innerHTML = `
      <section class="mc-panel"><div class="section-head"><h2 class="h2">Todesursachen</h2></div>
        ${barList(d.causes, (c) => ({ icon: causeIcon(c.id), label: `<a href="#" data-cause="${esc(c.id)}">${esc(causeLabel(c.id))}</a>` }))}</section>
      <section class="mc-panel"><div class="section-head"><h2 class="h2">Gefährlichste Kreaturen</h2><span class="faint" style="font-size:13px">so oft getötet</span></div>
        ${barList(d.mobs.slice(0, 12), (m) => ({ icon: mobIcon(m.id), label: `<a href="${statLink("minecraft:killed_by|" + m.id)}" data-link>${esc(shortName(m.id))}</a>` }))}</section>
      <section class="mc-panel"><div class="section-head"><h2 class="h2">Die meisten Tode</h2></div>
        ${barList(d.perPlayer.slice(0, 12).map((r) => ({ id: r.name, n: r.v })), (r) => ({ icon: "minecraft:skeleton_skull", label: `<a href="${playerLink(r.id)}/stats" data-link>${esc(r.id)}</a>` }))}</section>
      ${d.pvp.length ? `<section class="mc-panel"><div class="section-head"><h2 class="h2">PvP</h2><span class="faint" style="font-size:13px">Spieler, die andere getötet haben</span></div>
        ${barList(d.pvp, (r) => ({ icon: "minecraft:diamond_sword", label: `<a href="${playerLink(r.id)}" data-link>${esc(r.id)}</a>` }))}</section>` : ""}`;
  }
  function drawFilter() {
    X("cause").innerHTML = `<option value="">Alle Ursachen</option>` + d.causes.map((c) => `<option value="${esc(c.id)}"${c.id === fcause ? " selected" : ""}>${esc(causeLabel(c.id))} (${nf.format(c.n)})</option>`).join("");
  }
  function drawLog() {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = d.recent.filter((e) => (!fcause || e.cause === fcause) &&
      words.every((w) => `${e.player} ${e.killer || ""} ${e.killerPlayer || ""} ${e.message || ""} ${causeLabel(e.cause)} ${shortName(e.killerType || "")}`.toLowerCase().includes(w)));
    X("n").textContent = nf.format(list.length);
    X("log").innerHTML = list.length ? list.map((e) => eventHTML(e, { fresh: fresh.has(e.seq) })).join("")
      : emptyLi(d.recent.length ? "Nichts gefunden" : "Noch keine Tode", d.recent.length ? "Filter ändern." : "Hier erscheint jeder Tod, sobald er passiert.");
    fresh.clear();
  }
  drawHero(); drawSide(); drawFilter(); drawLog();
  const onInput = debounce(() => { q = X("q").value; drawLog(); }, 120);
  X("q").addEventListener("input", onInput);
  function onChange(e) { if (e.target.matches('[data-x="cause"]')) { fcause = e.target.value; drawLog(); } }
  function onClick(e) {
    const c = e.target.closest("[data-cause]");
    if (c) { e.preventDefault(); fcause = c.dataset.cause; drawFilter(); drawLog(); X("log").scrollIntoView({ block: "start" }); }
  }
  view.addEventListener("change", onChange);
  view.addEventListener("click", onClick);
  const refetch = debounce(async () => {
    try {
      const before = new Set(d.recent.map((e) => e.seq));
      d = await api("/api/deaths");
      d.recent.forEach((e) => { if (!before.has(e.seq)) fresh.add(e.seq); });
      drawHero(); drawSide(); drawFilter(); drawLog();
    } catch { /* egal */ }
  }, 400);
  return {
    onEvent(type, e) { if (type === "feed" && e.type === "death") refetch(); },
    destroy() { view.removeEventListener("change", onChange); view.removeEventListener("click", onClick); }
  };
}

// ---------------------------------------------------------------- Seite: Live
function chartHTML(events) {
  const H = 3600000;
  const start = Math.floor(Date.now() / H) * H - 23 * H;
  const buckets = Array.from({ length: 24 }, (_, i) => ({ t: start + i * H, d: 0, a: 0 }));
  events.forEach((e) => {
    const i = Math.floor((e.at - start) / H);
    if (i >= 0 && i < 24) { if (e.type === "death") buckets[i].d++; else buckets[i].a++; }
  });
  const max = Math.max(1, ...buckets.map((b) => b.d + b.a));
  return `<div class="chart" role="img" aria-label="Ereignisse pro Stunde, letzte 24 Stunden">${buckets.map((b) => {
    const h = new Date(b.t).getHours();
    return `<div class="col" title="${h}–${(h + 1) % 24} Uhr: ${b.a} Advancements, ${b.d} Tode"><div class="stack"><i class="a" style="height:${(b.a / max) * 100}%"></i><i class="d" style="height:${(b.d / max) * 100}%"></i></div><span>${h % 3 === 0 ? h : ""}</span></div>`;
  }).join("")}</div>
  <div class="chart-legend"><span><i class="a"></i>Advancements</span><span><i class="d"></i>Tode</span></div>`;
}

export async function livePage(view, nav) {
  setTitle("Live");
  let [feed, ov] = await Promise.all([api("/api/feed?limit=500"), api("/api/stats/overview")]);
  let events = feed.events;
  let kind = "";
  const fresh = new Set();
  view.innerHTML = `
    <section class="mc-panel hero"><div><h1 class="h1">Live</h1>
      <p class="lead">Was gerade auf dem Server passiert: wer gestorben ist und woran, und wer welches Advancement geschafft hat. Neue Ereignisse erscheinen sofort.</p></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end"><a class="mc-btn" href="/tode" data-link>Tode</a><a class="mc-btn" href="/stats" data-link>Statistiken</a></div></section>
    <div class="two-col" style="margin-top:18px">
      <section class="mc-panel">
        <div class="section-head"><h2 class="h2">Ereignisse</h2>
          <div class="filters" data-x="kinds"></div></div>
        <ul class="feed evlist" data-x="list"></ul>
      </section>
      <div>
        <section class="mc-panel"><div class="section-head"><h2 class="h2">Gerade online</h2></div><div data-x="online"></div></section>
        <section class="mc-panel"><div class="section-head"><h2 class="h2">Letzte 24 Stunden</h2></div><div data-x="chart"></div></section>
      </div>
    </div>`;
  const X = (k) => view.querySelector(`[data-x="${k}"]`);
  function drawKinds() {
    const n = (k) => events.filter((e) => !k || e.type === k).length;
    X("kinds").innerHTML = [["", "Alle"], ["death", "Tode"], ["advancement", "Advancements"]]
      .map(([k, l]) => `<button type="button" class="chip" data-kind="${k}" aria-pressed="${k === kind}">${l} <span class="n">${nf.format(n(k))}</span></button>`).join("");
  }
  function drawList() {
    const list = events.filter((e) => !kind || e.type === kind).slice(0, 200);
    X("list").innerHTML = list.length ? list.map((e) => eventHTML(e, { fresh: fresh.has(e.seq) })).join("")
      : emptyLi("Noch nichts passiert", "Sobald jemand stirbt oder ein Advancement schafft, steht es hier.");
    fresh.clear();
  }
  function drawSide() {
    X("online").innerHTML = onlineChips(ov.onlinePlayers);
    X("chart").innerHTML = chartHTML(events);
  }
  drawKinds(); drawList(); drawSide();
  function onClick(e) {
    const k = e.target.closest("[data-kind]");
    if (k) { kind = k.dataset.kind; drawKinds(); drawList(); }
  }
  view.addEventListener("click", onClick);
  const refreshOnline = debounce(async () => { try { ov = await api("/api/stats/overview"); drawSide(); } catch { /* egal */ } }, 800);
  const timer = setInterval(() => { drawList(); refreshOnline(); }, 30000);
  return {
    onEvent(type, d) {
      if (type === "feed" && !events.some((e) => e.seq === d.seq)) {
        events.unshift(d);
        if (events.length > 500) events.length = 500;
        fresh.add(d.seq);
        drawKinds(); drawList(); drawSide();
      } else if (type === "player") refreshOnline();
    },
    destroy() { clearInterval(timer); view.removeEventListener("click", onClick); }
  };
}

// ---------------------------------------------------------------- Startseite: letzte Tode
export async function loadRecentDeaths(n = 5) {
  try { return (await api("/api/feed?type=death&limit=" + n)).events; } catch { return []; }
}
export function recentDeathsHTML(events, freshSeq) {
  return events.length ? events.map((e) => eventHTML(e, { fresh: e.seq === freshSeq, where: false })).join("")
    : emptyLi("Noch keine Tode", "Hier erscheint, wer gerade gestorben ist und woran.");
}

// ---------------------------------------------------------------- Spielerseite: Statistiken
export async function mountPlayerStats(root, name, nav) {
  let [cat, P] = await Promise.all([loadCatalog(), api("/api/stats/player?name=" + encodeURIComponent(name))]);
  let q = "";
  const openCats = new Set(["General", "Activity"]);
  root.innerHTML = `
    <section class="mc-panel"><div class="section-head"><h2 class="h2">Auf einen Blick</h2><span class="faint" style="font-size:13px">Platz in der Rangliste aller ${nf.format(P.players)} Spieler</span></div><div class="tiles" data-x="tiles"></div></section>
    <div class="two-col">
      <section class="mc-panel"><div class="section-head"><h2 class="h2">Tode <span class="count" data-x="dn"></span></h2><a class="faint" href="/tode" data-link style="font-size:13px">Alle Tode</a></div><div data-x="deaths"></div></section>
      <section class="mc-panel"><div class="section-head"><h2 class="h2">Aktivität</h2></div><div data-x="act"></div></section>
    </div>
    <section class="mc-panel"><div class="section-head"><h2 class="h2">Karte</h2><span class="faint" style="font-size:13px">wo ${esc(P.name)} unterwegs war</span></div><div data-x="map"></div></section>
    <section class="mc-panel"><div class="section-head"><h2 class="h2">Alle Statistiken <span class="count" data-x="n"></span></h2></div>
      <input class="mc-input" type="search" data-x="q" placeholder="Statistik suchen …" aria-label="Statistik suchen" style="margin-bottom:12px">
      <div data-x="all"></div></section>`;
  const X = (k) => root.querySelector(`[data-x="${k}"]`);
  const rankHTML = (key) => (P.ranks[key] ? `<span class="rk${P.ranks[key] <= 3 ? " top" : ""}">Platz ${P.ranks[key]}</span>` : "");

  function drawTiles() {
    const keys = [...cat.featured];
    X("tiles").innerHTML = keys.map((k) => {
      const s = statInfo(k);
      const v = P.values[k] || 0;
      return `<a class="tile" href="${statLink(k)}" data-link>${iconHTML(statIcon(s), "ico")}
        <div style="min-width:0"><div class="v px">${esc(fmtStat(s.unit, v))}</div><div class="s">${esc(statName(s))}</div>${rankHTML(k)}</div></a>`;
    }).join("");
  }
  function drawActivity() {
    const a = P.activity;
    if (!a) { X("act").innerHTML = `<p class="muted">Noch keine Aktivität aufgezeichnet.</p>`; return; }
    const total = a.active + a.afkTime;
    X("act").innerHTML = `<div class="kv">
        <div><span>Status</span><b>${P.online ? (a.afk ? `<span class="afk-tag">AFK</span> seit ${esc(fmtSeconds(a.idle))}` : `<span class="status on"><i></i>online</span>`) : `zuletzt da ${esc(ago(a.lastSeen))}`}</b></div>
        <div><span>Aktiv gespielt</span><b>${esc(fmtSeconds(a.active))}</b></div>
        <div><span>AFK-Zeit</span><b>${esc(fmtSeconds(a.afkTime))}</b></div>
        ${total ? `<div><span>Davon aktiv</span><b>${pct(a.active, total)} %</b></div>` : ""}
        ${a.dim ? `<div><span>${P.online ? "Gerade" : "Zuletzt"}</span><b>${esc(dimLabel(a.dim))} · X ${a.x} · Y ${a.y} · Z ${a.z}</b></div>` : ""}
      </div>${total ? `<div class="split" title="aktiv / AFK"><i style="width:${(a.active / total) * 100}%"></i></div>` : ""}`;
  }
  function drawDeaths() {
    const total = P.values["minecraft:custom|minecraft:deaths"] || 0;
    X("dn").textContent = nf.format(total);
    const chips = (list, render) => list.length ? `<div class="chips">${list.slice(0, 8).map((c) => `<span class="tag">${render(c)} <b>×${nf.format(c.n)}</b></span>`).join("")}</div>` : "";
    X("deaths").innerHTML = (P.deaths.length ? `<ul class="feed evlist">${P.deaths.slice(0, 6).map((e) => eventHTML(e, { noPlayer: true })).join("")}</ul>`
      : `<p class="muted">${total ? "Die letzten Tode sind von vor Lu-Stats, dazu gibt es keine Ursache." : "Noch nie gestorben."}</p>`) +
      (P.causes.length ? `<h3 class="h3" style="margin-top:14px">Häufigste Ursachen</h3>${chips(P.causes, (c) => `${iconHTML(causeIcon(c.id), "ico")} ${esc(causeLabel(c.id))}`)}` : "") +
      (P.killers.length ? `<h3 class="h3" style="margin-top:14px">Getötet von</h3>${chips(P.killers, (k) => `${iconHTML(mobIcon(k.player ? "minecraft:player" : k.type), "ico")} ${esc(k.name || shortName(k.type))}`)}` : "") +
      (P.victims.length ? `<h3 class="h3" style="margin-top:14px">Hat getötet</h3>${chips(P.victims, (v) => `${avatarHTML(v.id, "xs")} ${esc(v.id)}`)}` : "");
  }
  function drawAll() {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const groups = {};
    let n = 0;
    for (const [k, v] of Object.entries(P.values)) {
      const s = statInfo(k);
      if (words.length && !words.every((w) => `${statTitle(s)} ${s.name} ${s.value} ${catLabel(s.cat)}`.toLowerCase().includes(w))) continue;
      (groups[s.cat] = groups[s.cat] || []).push({ s, v });
      n++;
    }
    X("n").textContent = nf.format(n);
    const cats = Object.keys(groups).sort((a, b) => catOrder(a) - catOrder(b));
    X("all").innerHTML = cats.length ? `<div class="missing">${cats.map((c) => `<details data-cat="${esc(c)}"${openCats.has(c) || words.length ? " open" : ""}>
        <summary><span class="ico" style="background-image:url(${px.icon(statIcon(groups[c][0].s))});background-size:100% 100%"></span><div class="t">${esc(catLabel(c))}</div><span class="num">${nf.format(groups[c].length)}</span></summary>
        <div class="body"><table class="stat-table"><tbody>${groups[c].sort((x, y) => (P.ranks[x.s.key] || 99) - (P.ranks[y.s.key] || 99) || y.v - x.v)
          .map(({ s, v }) => `<tr><td>${iconHTML(statIcon(s), "ico")} <a href="${statLink(s.key)}" data-link>${esc(statName(s))}</a></td><td class="px nowrap">${esc(fmtStat(s.unit, v))}</td><td class="nowrap">${rankHTML(s.key)}</td></tr>`).join("")}</tbody></table></div>
      </details>`).join("")}</div>` : `<p class="muted">${words.length ? "Nichts gefunden." : "Noch keine Statistiken."}</p>`;
  }
  function drawEverything() { drawTiles(); drawActivity(); drawDeaths(); drawAll(); }
  drawEverything();
  const map = await mountMap(X("map"), P.name, P.activity);

  const onInput = debounce(() => { q = X("q").value; drawAll(); }, 120);
  X("q").addEventListener("input", onInput);
  function onToggle(e) {
    const d = e.target.closest && e.target.closest("details[data-cat]");
    if (d && !q) d.open ? openCats.add(d.dataset.cat) : openCats.delete(d.dataset.cat);
  }
  root.addEventListener("toggle", onToggle, true);
  const refetch = debounce(async () => {
    try {
      [cat, P] = await Promise.all([loadCatalog(), api("/api/stats/player?name=" + encodeURIComponent(name))]);
      drawEverything();
    } catch { /* Spieler inzwischen ausgeblendet */ }
  }, 600);
  const timer = setInterval(refetch, 30000);
  return {
    onEvent(type, d) {
      if ((type === "feed" && (sameName(d.player, name) || sameName(d.killerPlayer, name))) || (type === "player" && sameName(d.player, name))) refetch();
    },
    destroy() { clearInterval(timer); map.destroy(); root.removeEventListener("toggle", onToggle, true); }
  };
}

// ---------------------------------------------------------------- Vergleich: Statistiken
export async function compareStatsHTML(nameA, nameB) {
  const [cat, A, B] = await Promise.all([loadCatalog(), api("/api/stats/player?name=" + encodeURIComponent(nameA)), api("/api/stats/player?name=" + encodeURIComponent(nameB))]);
  const keys = [...new Set([...cat.featured, "minecraft:custom|minecraft:mob_kills", "minecraft:custom|minecraft:deaths"])];
  const rows = keys.map((k) => {
    const s = statInfo(k);
    const a = A.values[k] || 0, b = B.values[k] || 0;
    const max = Math.max(a, b, 1);
    return `<tr class="${a > b ? "lead-a" : b > a ? "lead-b" : ""}"><td class="tab-name">${iconHTML(statIcon(s), "ico")} <a href="${statLink(k)}" data-link>${esc(statName(s))}</a></td>
      <td class="n a">${esc(fmtStat(s.unit, a))}</td><td style="width:22%">${barHTML(a, max)}</td><td style="width:22%">${barHTML(b, max)}</td><td class="n b">${esc(fmtStat(s.unit, b))}</td></tr>`;
  }).join("");
  return `<section class="mc-panel" style="margin-top:18px"><div class="section-head"><h2 class="h2">Statistiken</h2><span class="faint" style="font-size:13px">grün = liegt vorn</span></div>
    <div style="overflow-x:auto"><table class="vs-table"><tbody>${rows}</tbody></table></div></section>`;
}

// ---------------------------------------------------------------- Karte (Heatmap + Weg)
const HEAT = ["#1d3b2a", "#2f6b2f", "#5a9a2a", "#a8c62a", "#f0d23a", "#f09a2a", "#e0502a", "#ff3355"];

export async function mountMap(box, name, activity) {
  box.innerHTML = `<div class="map-tools">
      <label>Dimension <select class="mc-input" data-m="dim" style="height:34px;width:auto"></select></label>
      ${name ? `<label class="switch"><input type="checkbox" data-m="path" checked><span class="switch-box" aria-hidden="true"></span><span>Weg zeigen</span></label>` : ""}
      <span class="faint map-pos" data-m="pos"></span>
    </div>
    <div class="mapbox"><canvas data-m="cv" aria-label="Karte der Bewegungen"></canvas><div class="map-empty" data-m="empty" hidden></div></div>
    <div class="map-legend" data-m="legend"></div>`;
  const M = (k) => box.querySelector(`[data-m="${k}"]`);
  let data = null, dim = "", showPath = true, view = null;
  try { data = await api("/api/movement" + (name ? "?name=" + encodeURIComponent(name) : "")); } catch { /* keine Daten */ }
  const heat = data ? data.heat : [];
  const points = data ? data.points : [];
  const dims = {};
  heat.forEach((h) => { dims[h.dim] = (dims[h.dim] || 0) + h.count; });
  points.forEach((p) => { dims[p.dim] = dims[p.dim] || 0; });
  const dimList = Object.keys(dims).sort((a, b) => dims[b] - dims[a]);
  dim = activity && activity.dim && dims[activity.dim] != null ? activity.dim : dimList[0] || "";
  M("dim").innerHTML = dimList.length ? dimList.map((d) => `<option value="${esc(d)}"${d === dim ? " selected" : ""}>${esc(dimLabel(d))}</option>`).join("") : `<option>–</option>`;

  function draw() {
    const cv = M("cv");
    const W = Math.max(200, box.clientWidth - 4), Hh = Math.round(Math.min(520, Math.max(260, W * 0.55)));
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    cv.style.width = W + "px"; cv.style.height = Hh + "px";
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#0b1410"; g.fillRect(0, 0, W, Hh);
    const hs = heat.filter((h) => h.dim === dim);
    const ps = showPath ? points.filter((p) => p.dim === dim) : [];
    M("empty").hidden = !!(hs.length || ps.length);
    M("empty").textContent = data ? "Hier wurde noch keine Bewegung aufgezeichnet." : "Keine Bewegungsdaten.";
    if (!hs.length && !ps.length) { M("legend").innerHTML = ""; view = null; return; }
    const bs = data.bucketSize || 8;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxC = 1;
    hs.forEach((h) => { minX = Math.min(minX, h.x); maxX = Math.max(maxX, h.x + bs); minZ = Math.min(minZ, h.z); maxZ = Math.max(maxZ, h.z + bs); maxC = Math.max(maxC, h.count); });
    ps.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + 1); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z + 1); });
    const pad = 16, spanX = Math.max(bs * 4, maxX - minX), spanZ = Math.max(bs * 4, maxZ - minZ);
    const scale = Math.min((W - pad * 2) / spanX, (Hh - pad * 2) / spanZ);
    const ox = pad + (W - pad * 2 - (maxX - minX) * scale) / 2, oz = pad + (Hh - pad * 2 - (maxZ - minZ) * scale) / 2;
    const tx = (x) => ox + (x - minX) * scale, tz = (z) => oz + (z - minZ) * scale;
    view = { tx, tz, minX, minZ, ox, oz, scale };
    // Raster alle 128 Blöcke, Ursprung hervorgehoben
    const step = 128 * Math.max(1, Math.ceil(24 / (128 * scale)));
    g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1;
    for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) { g.beginPath(); g.moveTo(Math.round(tx(x)) + 0.5, 0); g.lineTo(Math.round(tx(x)) + 0.5, Hh); g.stroke(); }
    for (let z = Math.ceil(minZ / step) * step; z <= maxZ; z += step) { g.beginPath(); g.moveTo(0, Math.round(tz(z)) + 0.5); g.lineTo(W, Math.round(tz(z)) + 0.5); g.stroke(); }
    const cell = Math.max(2, Math.ceil(bs * scale));
    hs.forEach((h) => {
      const t = Math.log(h.count + 1) / Math.log(maxC + 1);
      g.fillStyle = HEAT[Math.min(HEAT.length - 1, Math.floor(t * HEAT.length))];
      g.fillRect(Math.floor(tx(h.x)), Math.floor(tz(h.z)), cell, cell);
    });
    if (ps.length > 1) {
      g.strokeStyle = "rgba(170,240,255,.85)"; g.lineWidth = 1.5; g.beginPath();
      ps.forEach((p, i) => { const X = tx(p.x + 0.5), Z = tz(p.z + 0.5); if (i) g.lineTo(X, Z); else g.moveTo(X, Z); });
      g.stroke();
    }
    if (minX <= 0 && maxX >= 0 && minZ <= 0 && maxZ >= 0) {
      g.fillStyle = "#ffffff"; g.fillRect(Math.round(tx(0)) - 3, Math.round(tz(0)), 7, 1); g.fillRect(Math.round(tx(0)), Math.round(tz(0)) - 3, 1, 7);
    }
    const here = activity && activity.dim === dim ? activity : ps.length ? ps[ps.length - 1] : null;
    if (here) {
      const X = Math.round(tx(here.x + 0.5)), Z = Math.round(tz(here.z + 0.5));
      g.fillStyle = "#000"; g.fillRect(X - 4, Z - 4, 9, 9);
      g.fillStyle = "#55ffff"; g.fillRect(X - 3, Z - 3, 7, 7);
    }
    M("legend").innerHTML = `<span>X ${minX} … ${maxX}</span><span>Z ${minZ} … ${maxZ}</span><span>Feld = ${bs}×${bs} Blöcke</span>
      <span class="heat-scale">wenig ${HEAT.map((c) => `<i style="background:${c}"></i>`).join("")} viel</span>${here ? `<span><i class="here"></i>${activity && activity.dim === dim ? "Position" : "zuletzt"}</span>` : ""}${minX <= 0 && maxX >= 0 && minZ <= 0 && maxZ >= 0 ? "<span>+ = 0 / 0</span>" : ""}`;
  }
  draw();
  function onChange(e) {
    if (e.target.matches('[data-m="dim"]')) { dim = e.target.value; draw(); }
    if (e.target.matches('[data-m="path"]')) { showPath = e.target.checked; draw(); }
  }
  function onMove(e) {
    if (!view) return;
    const r = M("cv").getBoundingClientRect();
    const x = Math.floor(view.minX + (e.clientX - r.left - view.ox) / view.scale), z = Math.floor(view.minZ + (e.clientY - r.top - view.oz) / view.scale);
    M("pos").textContent = `X ${x} · Z ${z}`;
  }
  const onResize = debounce(draw, 150);
  box.addEventListener("change", onChange);
  M("cv").addEventListener("mousemove", onMove);
  window.addEventListener("resize", onResize);
  return { destroy() { window.removeEventListener("resize", onResize); } };
}
