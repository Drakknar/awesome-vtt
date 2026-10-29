import { SEATS, WINDOW_ADOPT_MS } from "../constants.mjs";
import { getSetting } from "../settings.mjs";
import Seat from "./seat.mjs";
import { allocateEdge } from "./fit.mjs";
import { inkFor } from "../../../awesome-vtt-core/scripts/ui.mjs";

/**
 * Owns the full-screen overlay on the table client, its seats, and the rotation of windows opened from a seat.
 */
export default class TableOverlay {
  /** @type {Map<string, Seat>} */
  seats = new Map();

  /** Last seat the mouse interacted with, used to adopt windows it opens. */
  #lastSeat = { key: null, time: 0 };

  /** Windows already rotated toward a seat. */
  #adopted = new WeakMap();

  constructor() {
    this.element = document.createElement("div");
    this.element.id = "avtt-overlay";
    document.body.append(this.element);
    this.element.addEventListener("pointerdown", event => {
      const seatEl = event.target.closest(".avtt-seat");
      if ( !seatEl ) return;
      this.#lastSeat = { key: seatEl.dataset.seat, time: Date.now() };
      for ( const s of this.seats.values() ) s.element.classList.toggle("avtt-front", s.element === seatEl);
    }, { capture: true });
    // Clicks inside a window already turned toward a seat (e.g. a roll dialog) keep that seat current,
    // so the windows it opens next (e.g. the physical dice entry) face the same player.
    document.addEventListener("pointerdown", event => {
      const win = event.target.closest?.(".application.avtt-rotated[data-avtt-seat]");
      if ( win ) this.#lastSeat = { key: win.dataset.avttSeat, time: Date.now() };
    }, { capture: true });
    window.addEventListener("resize", foundry.utils.debounce(() => this.layout(), 100));
  }

  /**
   * The seat interacted with in the last few seconds, if any.
   * @returns {import("./seat.mjs").default|null}
   */
  get recentSeat() {
    if ( Date.now() - this.#lastSeat.time > WINDOW_ADOPT_MS ) return null;
    return this.seats.get(this.#lastSeat.key) ?? null;
  }

  /** (Re)create all seats from the world setting. */
  rebuild() {
    this.seats.clear();
    this.element.replaceChildren();
    const config = getSetting("seats") ?? {};
    for ( const seat of SEATS ) {
      if ( !config[seat.key]?.actorId ) continue;
      const s = new Seat(seat, config[seat.key]);
      s.onPillRendered = () => this.#fitSoon();
      s.onPanelOpened = () => this.#onPanelOpened(s);
      s.freeSpan = () => this.freeSpan(s);
      this.seats.set(seat.key, s);
      this.element.append(s.element);
    }
    this.element.style.setProperty("--avtt-scale", getSetting("uiScale"));
    this.element.style.setProperty("--avtt-idle-opacity", getSetting("idleOpacity"));
    this.applyCoreUI();
    this.layout();
    this.renderAll();
  }

  layout() {
    for ( const s of this.seats.values() ) s.layout();
    this.#fitSoon();
  }

  /* -------------------------------------------- */
  /*  Pill widths                                 */
  /* -------------------------------------------- */

  #fitSoon = foundry.utils.debounce(() => this.fitPills(), 50);

  /**
   * The seat of the neighbouring edge that shares each corner with an edge's ends.
   * Edges run left→right (top, bottom) or top→bottom (left, right) in screen coordinates.
   */
  static #CORNERS = {
    top: ["left-top", "right-top"],
    bottom: ["left-bottom", "right-bottom"],
    left: ["top-left", "bottom-left"],
    right: ["top-right", "bottom-right"]
  };

  /**
   * Give every pill the width its labelled buttons need, edge by edge. A pill may extend past its third of the edge
   * into free room; only where the pills on an edge can't all fit are they narrowed, and then hide their labels.
   */
  fitPills() {
    const any = this.seats.values().next().value;
    if ( !any ) return;
    const unit = parseFloat(getComputedStyle(any.element).fontSize) || 14;
    const gap = 0.5 * unit;
    const { innerWidth: W, innerHeight: H } = window;

    for ( const side of ["top", "bottom", "left", "right"] ) {
      const seats = [...this.seats.values()].filter(s => s.seat.side === side);
      if ( !seats.length ) continue;
      const length = (side === "top" || side === "bottom") ? W : H;
      // Keep the corners free for an occupied seat of the neighbouring edge (its pill reaches in by its height).
      const [first, last] = TableOverlay.#CORNERS[side].map(key => this.seats.get(key));
      const start = first ? first.pillDepth + gap : 0;
      const end = length - (last ? last.pillDepth + gap : 0);
      const pills = seats.map(s => ({ center: s.seat.along * length, need: s.measurePillNeed() }));
      const widths = allocateEdge(pills, { start, end, gap });
      seats.forEach((s, i) => s.setPillWidth(widths[i], pills[i].need));
    }
  }

  /* -------------------------------------------- */
  /*  Open panels                                 */
  /* -------------------------------------------- */

  /**
   * Room (px) along its edge for a seat's open panels, centred on the seat: up to the panels open in the neighbouring
   * seats of the same edge (or the corners kept for the next edge's pills, or the screen's end).
   * @param {import("./seat.mjs").default} seat
   * @returns {number}
   */
  freeSpan(seat) {
    const { side, along } = seat.seat;
    const length = ((side === "top") || (side === "bottom")) ? window.innerWidth : window.innerHeight;
    const center = along * length;
    const gap = 0.5 * (parseFloat(getComputedStyle(seat.element).fontSize) || 14);
    const [first, last] = TableOverlay.#CORNERS[side].map(key => this.seats.get(key));
    let lo = first ? first.pillDepth + gap : 0;
    let hi = length - (last ? last.pillDepth + gap : 0);
    for ( const other of this.seats.values() ) {
      if ( (other === seat) || (other.seat.side !== side) ) continue;
      const c = other.seat.along * length;
      const half = other.drawersWidth() / 2;
      if ( c < center ) lo = Math.max(lo, c + (half ? half + gap : 0));
      else hi = Math.min(hi, c - (half ? half + gap : 0));
    }
    return Math.max(0, 2 * Math.min(center - lo, hi - center));
  }

  /**
   * A seat opened a panel: with the "Close other panels" setting, the other seats' panels close; otherwise a seat
   * showing quick actions next to another panel keeps only the other one if the new panel leaves it no room.
   * @param {import("./seat.mjs").default} opened
   */
  #onPanelOpened(opened) {
    const closeOthers = getSetting("closeOtherPanels");
    for ( const s of this.seats.values() ) {
      if ( s === opened ) continue;
      if ( closeOthers ) s.closePanels();
      else if ( s.state.quick && s.state.panel && !s.fitsSideBySide(s.state.panel) ) s.closePanels({ quickOnly: true });
    }
  }

  renderAll() {
    for ( const s of this.seats.values() ) s.render();
  }

  /**
   * Seats showing a given actor.
   * @param {Actor|null} actor
   * @returns {import("./seat.mjs").default[]}
   */
  seatsFor(actor) {
    return [...this.seats.values()].filter(s => s.config.actorId === actor?.id);
  }

  renderActor(actor) {
    for ( const s of this.seatsFor(actor) ) s.render();
  }

  renderInitiative() {
    for ( const s of this.seats.values() ) s.renderInitiative();
  }

  onChatMessage(message, action) {
    for ( const s of this.seats.values() ) s.onChatMessage(message, action);
  }

  /* -------------------------------------------- */
  /*  Core UI                                     */
  /* -------------------------------------------- */

  /**
   * Core UI applications hidden in table mode. They are hidden with CSS only: they keep rendering and stay
   * controllable from code (e.g. the ruler via ui.controls), but take no space and cannot be clicked.
   * @returns {ApplicationV2[]}
   */
  static get #coreApps() {
    return [ui.sidebar, ui.hotbar, ui.players, ui.nav, ui.controls].filter(Boolean);
  }

  applyCoreUI() {
    const hide = getSetting("hideCoreUI");
    const keepControls = getSetting("keepSceneControls");
    document.body.classList.add("avtt-table");
    document.body.classList.toggle("avtt-hide-ui", hide);
    for ( const app of TableOverlay.#coreApps ) {
      app.element?.classList.toggle("avtt-core-hidden", hide && !(keepControls && (app === ui.controls)));
    }
  }

  /**
   * Called from the generic ApplicationV2 render hook (options: its render options).
   * @param {ApplicationV2} app
   * @param {HTMLElement} element
   * @param {object} options
   */
  onRenderApplication(app, element, options) {
    if ( TableOverlay.#coreApps.includes(app) ) {
      this.applyCoreUI();
      return;
    }
    if ( !app.hasFrame || element.closest("#avtt-overlay") ) return;

    // Windows opened for a specific seat (e.g. the settings window) always face it, whatever "rotateWindows" says.
    // With "rotateWindows" on, a seated character's sheet (or one of its items) faces that character's seat, however
    // it was opened (e.g. double-clicking its token); other windows face the seat interacted with just before.
    // Foundry reuses a sheet's instance each time it opens: a new opening chooses its seat again.
    if ( options?.isFirstRender ) this.#adopted.delete(app);
    let seatKey = this.#adopted.get(app);
    if ( !seatKey ) {
      if ( app.avttSeat && this.seats.has(app.avttSeat) ) seatKey = app.avttSeat;
      else if ( getSetting("rotateWindows") ) seatKey = this.#ownerSeat(app) ?? this.recentSeat?.seat.key;
      if ( !seatKey ) return;
      this.#adopted.set(app, seatKey);
      // Wait a frame so the window has its final size before placing it.
      requestAnimationFrame(() => this.#placeWindow(app, seatKey));
    }
    this.#rotateWindow(element, seatKey);
  }

  /**
   * The seat of the character a sheet belongs to (an actor sheet, or the sheet of an item it owns), or undefined.
   * A character in several seats uses the one interacted with just before, if it is one of them.
   * @param {ApplicationV2} app
   * @returns {string|undefined}
   */
  #ownerSeat(app) {
    const doc = app.document;
    const actor = (doc instanceof Actor) ? doc : ((doc?.parent instanceof Actor) ? doc.parent : null);
    const seats = actor ? this.seatsFor(actor) : [];
    if ( !seats.length ) return undefined;
    const recent = this.recentSeat;
    return (seats.includes(recent) ? recent : seats[0]).seat.key;
  }

  #rotateWindow(element, seatKey) {
    const seat = this.seats.get(seatKey);
    if ( !seat ) return;
    element.classList.add("avtt-rotated");
    element.dataset.avttSeat = seatKey;
    element.style.setProperty("--seat-color", seat.config.color);
    element.style.setProperty("--seat-ink", inkFor(seat.config.color));
    // Individual `rotate` property composes with the transform Foundry may set for window scaling.
    element.style.rotate = `${seat.seat.rotation}deg`;
  }

  /**
   * Move a window next to its seat, with its bottom edge facing the player.
   * @param {ApplicationV2} app
   * @param {string} seatKey
   */
  #placeWindow(app, seatKey) {
    const seat = this.seats.get(seatKey);
    const el = app.element;
    if ( !seat || !el?.isConnected ) return;
    // Centered windows: rotation is around the window's center, so centering the unrotated box is enough.
    if ( app.avttCenter ) {
      app.setPosition({
        left: Math.max(0, (window.innerWidth - el.offsetWidth) / 2),
        top: Math.max(0, (window.innerHeight - el.offsetHeight) / 2)
      });
      return;
    }
    const { x, y, nx, ny } = seat.anchor;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // The window's own height always lies along the inward direction, whatever the rotation.
    const inset = 110 * getSetting("uiScale");
    let cx = x + (nx * (inset + (h / 2)));
    let cy = y + (ny * (inset + (h / 2)));
    // Keep the rotated footprint on screen.
    const horizontal = ny !== 0;
    const halfX = (horizontal ? w : h) / 2;
    const halfY = (horizontal ? h : w) / 2;
    cx = Math.clamp(cx, halfX, window.innerWidth - halfX);
    cy = Math.clamp(cy, halfY, window.innerHeight - halfY);
    app.setPosition({ left: cx - (w / 2), top: cy - (h / 2) });
  }
}
