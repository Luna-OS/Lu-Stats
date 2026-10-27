// Spielansicht: der Advancement-Baum eines Tabs wie im Spiel, als verschiebbare Fläche mit Rahmen und Verbindungslinien.
// Positionen kommen vom Server (dieselbe Anordnung, die Minecraft dem Client schickt).
import { esc, frameHTML, showTooltip, hideTooltip } from "./util.js";
import * as px from "./pixel.js";
import { S, isDone, visible } from "./store.js";
import { tooltipHTML } from "./explorer.js";

const CELL_X = 28, CELL_Y = 27, SIZE = 26;

export function mountGameView(box, tab, P, opts) {
  let zoom = window.innerWidth < 640 ? 1.5 : 2;
  let ox = 0, oy = 0;
  let player = P;
  let match = opts.match || null, highlight = opts.highlight || null;

  box.innerHTML = `<div class="gv-bar">
      <span>Ziehen zum Verschieben · Mausrad scrollt · Klick auf einen Rahmen zeigt Details</span>
      <span class="gv-zoom">
        <button type="button" class="mc-btn small icon-btn" data-gv="out" aria-label="Verkleinern">−</button>
        <button type="button" class="mc-btn small icon-btn" data-gv="in" aria-label="Vergrößern">+</button>
        <button type="button" class="mc-btn small" data-gv="home">Zum Start</button>
      </span>
    </div>
    <div class="gameview" tabindex="0" aria-label="Spielansicht ${esc(tab.title)}" style="--tile:url(${px.tile(tab.pattern)})">
      <div class="gv-shade"></div>
      <div class="gv-plane"></div>
    </div>`;
  const view = box.querySelector(".gameview");
  const plane = box.querySelector(".gv-plane");

  function nodes() { return tab.items.filter((a) => visible(a, player)); }

  function draw() {
    const list = nodes();
    const shown = new Set(list.map((a) => a.id));
    const s = zoom;
    let maxX = 0, maxY = 0;
    const pos = {};
    for (const a of list) {
      const x = Math.round(a.x * CELL_X * s), y = Math.round(a.y * CELL_Y * s);
      pos[a.id] = [x, y];
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    const size = Math.round(SIZE * s);
    // Linien wie im Spiel: vom Vorgänger waagerecht ein Stück nach rechts, senkrecht, dann waagerecht zum Kind.
    let black = "", white = "";
    for (const a of list) {
      if (!a.parent || !shown.has(a.parent)) continue;
      const [cx, cy] = pos[a.id], [px0, py0] = pos[a.parent];
      const half = size / 2;
      const startX = px0 + half, midX = px0 + size + Math.round(4 * s), y1 = py0 + half, y2 = cy + half, endX = cx + half;
      const d = `M${startX} ${y1}H${midX}V${y2}H${endX}`;
      black += d; white += d;
    }
    const lw = Math.max(1, Math.round(s));
    let html = `<svg class="gv-lines" width="${maxX + size + 40}" height="${maxY + size + 40}" aria-hidden="true">
      <path d="${black}" fill="none" stroke="#000" stroke-width="${lw * 3}" stroke-linecap="square" stroke-linejoin="miter"/>
      <path d="${white}" fill="none" stroke="#fff" stroke-width="${lw}" stroke-linecap="square" stroke-linejoin="miter"/></svg>`;
    for (const a of list) {
      const [x, y] = pos[a.id];
      const done = isDone(player, a.id);
      const dim = match && !match.has(a.id);
      const hit = highlight && highlight.has(a.id);
      html += `<button type="button" class="gv-node${dim ? " dim" : ""}${hit ? " hit" : ""}" data-gid="${esc(a.id)}" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px" aria-label="${esc(a.title)}${done ? " (erledigt)" : ""}">${frameHTML(a, done, "", "")}</button>`;
    }
    plane.innerHTML = html;
    plane.querySelectorAll(".fr").forEach((f) => { f.style.setProperty("--s", size + "px"); });
    apply();
  }

  function apply() { plane.style.transform = `translate(${Math.round(ox)}px, ${Math.round(oy)}px)`; }

  function home() {
    const root = tab.items[0];
    const rect = view.getBoundingClientRect();
    if (!root) { ox = 20; oy = 20; apply(); return; }
    ox = 24 - root.x * CELL_X * zoom;
    oy = Math.round(rect.height / 2 - (root.y * CELL_Y + SIZE / 2) * zoom);
    // Nicht über den oberen Rand hinaus, wenn der Baum klein ist.
    const minY = Math.min(...nodes().map((a) => a.y));
    oy = Math.min(oy, 20 - minY * CELL_Y * zoom);
    apply();
  }

  function setZoom(z, cx, cy) {
    const nz = Math.max(1, Math.min(4, z));
    if (nz === zoom) return;
    const rect = view.getBoundingClientRect();
    const px0 = cx ?? rect.width / 2, py0 = cy ?? rect.height / 2;
    ox = px0 - ((px0 - ox) * nz) / zoom;
    oy = py0 - ((py0 - oy) * nz) / zoom;
    zoom = nz;
    draw();
  }

  // Verschieben mit Maus, Finger oder Stift
  let drag = null;
  function down(e) {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, ox, oy, moved: false, id: e.pointerId };
  }
  function move(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      drag.moved = true;
      view.classList.add("drag");
      try { view.setPointerCapture(drag.id); } catch { /* egal */ }
      hideTooltip();
    }
    if (drag.moved) { ox = drag.ox + dx; oy = drag.oy + dy; apply(); }
  }
  function up(e) {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    view.classList.remove("drag");
    if (wasDrag) { e.preventDefault(); return; }
    const node = e.target.closest("[data-gid]");
    if (node) select(node.dataset.gid);
  }
  function select(id) {
    plane.querySelectorAll(".gv-node.sel").forEach((n) => n.classList.remove("sel"));
    if (opts.onSelect) opts.onSelect(id);
  }
  function wheel(e) {
    if (e.ctrlKey) { e.preventDefault(); const r = view.getBoundingClientRect(); setZoom(zoom + (e.deltaY < 0 ? 0.5 : -0.5), e.clientX - r.left, e.clientY - r.top); return; }
    e.preventDefault();
    ox -= e.shiftKey ? e.deltaY : e.deltaX;
    oy -= e.shiftKey ? 0 : e.deltaY;
    apply();
  }
  function key(e) {
    const step = 40;
    if (e.key === "ArrowLeft") ox += step; else if (e.key === "ArrowRight") ox -= step;
    else if (e.key === "ArrowUp") oy += step; else if (e.key === "ArrowDown") oy -= step;
    else if (e.key === "+") setZoom(zoom + 0.5); else if (e.key === "-") setZoom(zoom - 0.5);
    else if (e.key === "Enter" && e.target.dataset && e.target.dataset.gid) { select(e.target.dataset.gid); return; }
    else return;
    e.preventDefault();
    apply();
  }
  function over(e) {
    if (drag && drag.moved) return;
    const node = e.target.closest("[data-gid]");
    if (!node) return;
    const a = S.BYID[node.dataset.gid];
    if (a) showTooltip(node, tooltipHTML(a, player));
  }
  function out(e) {
    const node = e.target.closest("[data-gid]");
    if (node && !node.contains(e.relatedTarget)) hideTooltip();
  }
  function bar(e) {
    const b = e.target.closest("[data-gv]");
    if (!b) return;
    if (b.dataset.gv === "in") setZoom(zoom + 0.5);
    else if (b.dataset.gv === "out") setZoom(zoom - 0.5);
    else home();
  }

  view.addEventListener("pointerdown", down);
  view.addEventListener("pointermove", move);
  view.addEventListener("pointerup", up);
  view.addEventListener("pointercancel", () => { drag = null; view.classList.remove("drag"); });
  view.addEventListener("wheel", wheel, { passive: false });
  view.addEventListener("keydown", key);
  view.addEventListener("mouseover", over);
  view.addEventListener("mouseout", out);
  view.addEventListener("focusin", over);
  view.addEventListener("focusout", () => hideTooltip());
  box.addEventListener("click", bar);

  draw();
  home();

  return {
    tabId: tab.id,
    update(newP, newMatch, newHighlight) { player = newP; match = newMatch; highlight = newHighlight; draw(); },
    flash(id) {
      const n = plane.querySelector(`[data-gid="${CSS.escape(id)}"]`);
      if (n) n.animate([{ filter: "brightness(2)" }, { filter: "none" }], { duration: 1200 });
    },
    destroy() { hideTooltip(); box.innerHTML = ""; box.removeEventListener("click", bar); }
  };
}
