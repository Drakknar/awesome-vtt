import { SIDE_ROTATION } from "../constants.mjs";

/**
 * Popups the browser draws outside the seats and windows, at the top of the page: Foundry's tooltips (#tooltip), its
 * fixed context menus (e.g. a window's ⋮ header menu, right-click menus) and Shadow of the Demon Lord's own tooltips
 * (tippy, `[data-tippy-root]`). When they belong to a seat, or to a window turned toward one, they are turned to face
 * that seat's player and placed beside what they belong to, as that player sees it: tooltips above it (toward the
 * table centre), menus below it, or above when there is more room there.
 */

/** Popups turned toward a seat carry its key, so what opens from them (a tooltip in a menu) is turned the same way. */
const TURNED = "[data-avtt-turned-seat]";

/** The key of the seat an element belongs to (a seat, a window or popup turned toward one), if any. */
export function seatKeyOf(element) {
  return element?.closest?.(".avtt-seat")?.dataset.seat
    ?? element?.closest?.(".application.avtt-rotated[data-avtt-seat]")?.dataset.avttSeat
    ?? element?.closest?.(TURNED)?.dataset.avttTurnedSeat
    ?? null;
}

/** The side ("bottom", "top", "left", "right") of the seat an element belongs to, if any. */
export function seatSide(element) {
  return seatKeyOf(element)?.split("-")[0] ?? null;
}

/** The seat of an element when it isn't the screen's own orientation (the bottom seats): {key, side}, else null. */
function turnedSeat(element) {
  const key = seatKeyOf(element);
  const side = key?.split("-")[0];
  return (side && (side !== "bottom")) ? { key, side } : null;
}

/** Space on screen beside `rect`, "down" or "up" as the player of `side` sees it. */
function roomToward(rect, side, toward) {
  const down = {
    bottom: window.innerHeight - (rect.top + rect.height), top: rect.top,
    left: rect.left, right: window.innerWidth - (rect.left + rect.width)
  };
  const up = {
    bottom: rect.top, top: window.innerHeight - (rect.top + rect.height),
    left: window.innerWidth - (rect.left + rect.width), right: rect.left
  };
  return (toward === "down") ? down[side] : up[side];
}

/**
 * Where to put a w × h box, turned around its own centre for `side`, beside `rect`: "up" or "down" as that seat's
 * player sees it, centred along the other axis and kept on screen. For the left and right seats its footprint on
 * screen is its height wide and its width tall.
 * @returns {{left: number, top: number}}  The unturned box's top-left corner.
 */
export function placeBeside(rect, w, h, side, toward, pad = 5) {
  const sideways = (side === "left") || (side === "right");
  const fw = sideways ? h : w;
  const fh = sideways ? w : h;
  let cx = rect.left + (rect.width / 2);
  let cy = rect.top + (rect.height / 2);
  // "down" for each seat's player, on screen; "up" is the other way.
  const sign = toward === "down" ? 1 : -1;
  switch ( side ) {
    case "bottom": cy += sign * ((rect.height / 2) + pad + (fh / 2)); break;
    case "top": cy -= sign * ((rect.height / 2) + pad + (fh / 2)); break;
    case "left": cx -= sign * ((rect.width / 2) + pad + (fw / 2)); break;
    case "right": cx += sign * ((rect.width / 2) + pad + (fw / 2)); break;
  }
  // A box larger than the screen keeps its start edge on screen (Math.clamp would favour the far edge).
  cx = Math.max(Math.min(cx, window.innerWidth - pad - (fw / 2)), pad + (fw / 2));
  cy = Math.max(Math.min(cy, window.innerHeight - pad - (fh / 2)), pad + (fh / 2));
  return { left: cx - (w / 2), top: cy - (h / 2) };
}

/* -------------------------------------------- */
/*  Context menus                               */
/* -------------------------------------------- */

/**
 * Foundry's fixed context menus are added to the page body, so they kept the screen's orientation even when opened
 * from a turned window. After core places one, a menu of a seat is turned toward it and placed below its target
 * (a header button) or the pointer (a right-click), as the player sees it, or above when there is more room there,
 * no longer than that room (it scrolls). Core's open animation is measured by the menu's own height, not its turned
 * footprint. Call once on the table client.
 */
export function installTurnedContextMenus() {
  const ContextMenu = foundry.applications.ux.ContextMenu;
  const setFixed = ContextMenu?.prototype._setFixedPosition;
  const animate = ContextMenu?.prototype._animate;
  if ( (typeof setFixed !== "function") || (typeof animate !== "function") ) return;

  ContextMenu.prototype._setFixedPosition = function(menu, target, options = {}) {
    const result = setFixed.call(this, menu, target, options);
    const seat = turnedSeat(target);
    if ( !seat || !menu.isConnected ) return result;
    const { event } = options;
    // As core: a pointer position counts unless both are 0 on a synthetic event (dnd5e's ⋮ buttons send one).
    const atPointer = (this.relative !== "target") && Number.isFinite(event?.clientX)
      && (event.isTrusted || event.clientX || event.clientY);
    const rect = atPointer
      ? { left: event.clientX, top: event.clientY, width: 0, height: 0 }
      : target.getBoundingClientRect();
    const pad = 2;
    const down = roomToward(rect, seat.side, "down");
    const up = roomToward(rect, seat.side, "up");
    // Core's limits are for an unturned menu; the menu's own height lies along the player's down / up.
    Object.assign(menu.style, { maxHeight: "", bottom: "", right: "" });
    const toward = ((menu.offsetHeight + pad) <= down) || (down >= up) ? "down" : "up";
    menu.style.maxHeight = `${Math.max((toward === "down" ? down : up) - (2 * pad), 80)}px`;
    const { left, top } = placeBeside(rect, menu.offsetWidth, menu.offsetHeight, seat.side, toward, pad);
    Object.assign(menu.style, { left: `${left}px`, top: `${top}px`, rotate: `${SIDE_ROTATION[seat.side]}deg` });
    menu.dataset.avttTurnedSeat = seat.key;
    return result;
  };

  ContextMenu.prototype._animate = async function(open = false) {
    const el = this.element;
    if ( !el?.dataset.avttTurnedSeat ) return animate.call(this, open);
    // As core, measured by offsetHeight: the bounding box of a menu turned sideways is its width tall.
    const height = el.offsetHeight;
    const from = open ? "0" : `${height}px`;
    const to = open ? `${height}px` : "0";
    Object.assign(el.style, { height: from, padding: "0", overflow: "hidden" });
    const win = el.ownerDocument.defaultView;
    if ( !win || win.closed ) return;
    await el.animate({ height: [from, to] }, { duration: 200, easing: "ease", fill: "forwards" })?.finished;
    if ( open ) Object.assign(el.style, { height: "", padding: "", overflow: "" });
  };
}

/* -------------------------------------------- */
/*  Popovers and modal dialogs                  */
/* -------------------------------------------- */

/** Inline styles a turned popup gets, cleared when it closes so the system's own placement works again. */
const POPUP_STYLES = ["inset", "margin", "left", "top", "rotate", "maxHeight", "positionTryFallbacks"];

/** Turn an open popup of a seat toward it, below `anchor` as the player sees it (or above, with more room). */
function turnPopup(el, anchor) {
  const seat = turnedSeat(anchor ?? el);
  if ( !seat || !el.isConnected ) return;
  const rect = (anchor ?? el.parentElement).getBoundingClientRect();
  const pad = 4;
  const down = roomToward(rect, seat.side, "down");
  const up = roomToward(rect, seat.side, "up");
  // Our own place, not the system's anchor positioning (dnd5e's breakdowns would flip it on overflow).
  Object.assign(el.style, { inset: "auto", margin: "0", maxHeight: "", positionTryFallbacks: "none" });
  const toward = ((el.offsetHeight + pad) <= down) || (down >= up) ? "down" : "up";
  el.style.maxHeight = `${Math.max((toward === "down" ? down : up) - (2 * pad), 80)}px`;
  const { left, top } = placeBeside(rect, el.offsetWidth, el.offsetHeight, seat.side, toward, pad);
  Object.assign(el.style, { left: `${left}px`, top: `${top}px`, rotate: `${SIDE_ROTATION[seat.side]}deg` });
  el.dataset.avttTurnedSeat = seat.key;
}

function unturnPopup(el) {
  if ( !el.dataset.avttTurnedSeat ) return;
  for ( const prop of POPUP_STYLES ) el.style[prop] = "";
  delete el.dataset.avttTurnedSeat;
}

/**
 * Popovers and modal dialogs are drawn in the page's top layer, outside the seat or window they belong to, so they
 * kept the screen's orientation: dnd5e's roll breakdowns and damage target lists in a seat's chat, and its sheet's
 * warnings dialog. When one of a seat opens, it is turned toward the seat and placed below what opened it (the roll
 * or button; for a dialog, the button with the focus) as the player sees it. Call once on the table client.
 */
export function installTurnedPopups() {
  // `toggle` doesn't bubble, but a capturing listener on the document still sees it.
  document.addEventListener("toggle", event => {
    const el = event.target;
    if ( !(el instanceof HTMLElement) || !el.hasAttribute("popover") || (el.id === "tooltip") || (el.id === "context-menu") ) return;
    if ( event.newState !== "open" ) return unturnPopup(el);
    // A breakdown's invoker is the roll just before it; a damage target list sits inside its toggle.
    turnPopup(el, el.previousElementSibling ?? el.parentElement);
  }, { capture: true });

  const showModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function(...args) {
    const result = showModal.apply(this, args);
    const active = document.activeElement;
    const app = this.closest(".application");
    turnPopup(this, (active && app?.contains(active)) ? active : this.parentElement);
    this.addEventListener("close", () => unturnPopup(this), { once: true });
    return result;
  };
}

/* -------------------------------------------- */
/*  Shadow of the Demon Lord's tooltips         */
/* -------------------------------------------- */

/**
 * The demonlord system shows its sheet tooltips with its own copy of tippy, which adds a `[data-tippy-root]` box to
 * the page body and places it with Popper (a `transform` on the box). For a box whose element is in a seat or a
 * turned window, each time Popper places it, it is turned toward the seat and moved above the element as the player
 * sees it. The arrow, drawn for the unturned placement, is hidden (CSS). Its interactive dropdowns stay inside the
 * window (tippy's appendTo "parent") and aren't handled. Call once on the table client.
 */
export function installTurnedTippy() {
  const watched = new WeakSet();
  const turnedTransform = new WeakMap();
  const turn = root => {
    // Our own write is seen by the observer too: skip it (compared as the browser stores it), or it would loop.
    if ( root.style.transform === turnedTransform.get(root) ) return;
    const reference = root._tippy?.reference;
    const seat = turnedSeat(reference);
    if ( !seat || !reference.isConnected ) return;
    const { left, top } = placeBeside(reference.getBoundingClientRect(), root.offsetWidth, root.offsetHeight, seat.side, "up", 6);
    root.dataset.avttTurnedSeat = seat.key;
    // Popper places the box with inset 0 and a translate; the same, with the turn added.
    Object.assign(root.style, {
      inset: "0px auto auto 0px", transformOrigin: "center",
      transform: `translate(${Math.round(left)}px, ${Math.round(top)}px) rotate(${SIDE_ROTATION[seat.side]}deg)`
    });
    turnedTransform.set(root, root.style.transform);
  };
  const watch = root => {
    if ( watched.has(root) ) return;
    watched.add(root);
    // Popper writes the box's style again on each update (scroll, resize, content): turn it again after each write.
    new MutationObserver(() => turn(root)).observe(root, { attributes: true, attributeFilter: ["style"] });
    turn(root);
  };
  new MutationObserver(records => {
    for ( const record of records ) {
      for ( const node of record.addedNodes ) {
        if ( (node instanceof HTMLElement) && ("tippyRoot" in node.dataset) ) watch(node);
      }
    }
  }).observe(document.body, { childList: true });
}
