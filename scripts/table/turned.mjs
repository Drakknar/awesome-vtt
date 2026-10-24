/**
 * Popups the browser draws outside the seats and windows, at the top of the page: Foundry's tooltips (#tooltip), its
 * fixed context menus (e.g. a window's ⋮ header menu, right-click menus) and Shadow of the Demon Lord's own tooltips
 * (tippy, `[data-tippy-root]`). When they belong to a seat, or to a window turned toward one, they are turned to face
 * that seat's player and placed beside what they belong to, as that player sees it: tooltips above it (toward the
 * table centre), menus below it.
 */

/** The seat's turn, so that "down" points toward the player at that edge (see constants.mjs). */
export const SIDE_ROTATION = { bottom: 0, top: 180, left: 90, right: -90 };

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
  cx = Math.clamp(cx, pad + (fw / 2), window.innerWidth - pad - (fw / 2));
  cy = Math.clamp(cy, pad + (fh / 2), window.innerHeight - pad - (fh / 2));
  return { left: cx - (w / 2), top: cy - (h / 2) };
}

/* -------------------------------------------- */
/*  Context menus                               */
/* -------------------------------------------- */

/**
 * Foundry's fixed context menus are added to the page body, so they kept the screen's orientation even when opened
 * from a turned window. After core places one, a menu of a seat is turned toward it and placed below its target
 * (a header button) or the pointer (a right-click), as the player sees it. Call once on the table client.
 */
export function installTurnedContextMenus() {
  const ContextMenu = foundry.applications.ux.ContextMenu;
  const original = ContextMenu?.prototype._setFixedPosition;
  if ( typeof original !== "function" ) return;
  ContextMenu.prototype._setFixedPosition = function(menu, target, options = {}) {
    const result = original.call(this, menu, target, options);
    const key = seatKeyOf(target);
    const side = key?.split("-")[0];
    if ( !side || (side === "bottom") || !menu.isConnected ) return result;
    const { event } = options;
    const atPointer = (this.relative !== "target") && event?.isTrusted && Number.isFinite(event.clientX);
    const rect = atPointer
      ? { left: event.clientX, top: event.clientY, width: 0, height: 0 }
      : target.getBoundingClientRect();
    // Core's height limit and expand direction are for an unturned menu.
    Object.assign(menu.style, { maxHeight: "", bottom: "", right: "" });
    const { left, top } = placeBeside(rect, menu.offsetWidth, menu.offsetHeight, side, "down", 2);
    Object.assign(menu.style, { left: `${left}px`, top: `${top}px`, rotate: `${SIDE_ROTATION[side]}deg` });
    menu.dataset.avttTurnedSeat = key;
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
 * sees it. The arrow, drawn for the unturned placement, is hidden (CSS). Call once on the table client.
 */
export function installTurnedTippy() {
  const watched = new WeakSet();
  const turnedTransform = new WeakMap();
  const turn = root => {
    const reference = root._tippy?.reference;
    const key = seatKeyOf(reference);
    const side = key?.split("-")[0];
    if ( !side || (side === "bottom") || !reference.isConnected ) return;
    const { left, top } = placeBeside(reference.getBoundingClientRect(), root.offsetWidth, root.offsetHeight, side, "up", 6);
    // Our own write is seen by the observer too: skip it (compared as the browser stores it), or it would loop.
    if ( root.style.transform === turnedTransform.get(root) ) return;
    root.dataset.avttTurnedSeat = key;
    // Popper places the box with inset 0 and a translate; the same, with the turn added.
    Object.assign(root.style, {
      inset: "0px auto auto 0px", transformOrigin: "center",
      transform: `translate(${Math.round(left)}px, ${Math.round(top)}px) rotate(${SIDE_ROTATION[side]}deg)`
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
