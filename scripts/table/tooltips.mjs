/**
 * Foundry's tooltips (#tooltip) for elements in a seat, or in a window turned toward a seat (e.g. the full character
 * sheet), face that seat's player and open toward the table centre.
 *
 * The seat's data-tooltip-class / data-tooltip-direction attributes alone weren't enough: core takes the nearest
 * such attribute, and dnd5e's sheets and content links set their own (a direction, or classes for rich tooltips),
 * so those tooltips came out unturned or pointing sideways; windows turned toward a seat had none at all. dnd5e also
 * re-places rich tooltips after loading them, through core's _setAnchor. So placement is wrapped here: for an element
 * of a seat, the rotation class is added and the tooltip is placed by its turned footprint.
 */

/** The side ("bottom", "top", "left", "right") of the seat an element belongs to, if any. */
function seatSide(element) {
  const key = element?.closest?.(".avtt-seat")?.dataset.seat
    ?? element?.closest?.(".application.avtt-rotated[data-avtt-seat]")?.dataset.avttSeat;
  return key ? key.split("-")[0] : null;
}

/**
 * Place the tooltip next to the element, toward the table centre as the seat's player sees it. The tooltip is turned
 * around its own centre by CSS (avtt-tooltip-<side>), so for the left and right seats its footprint on screen is its
 * height wide and its width tall.
 */
function placeTurned(manager, side) {
  const tooltip = manager.tooltip;
  const rect = manager.element.getBoundingClientRect();
  const pad = manager.constructor.TOOLTIP_MARGIN_PX ?? 5;
  const w = tooltip.offsetWidth;
  const h = tooltip.offsetHeight;
  const sideways = (side === "left") || (side === "right");
  const fw = sideways ? h : w;
  const fh = sideways ? w : h;
  let cx = rect.left + (rect.width / 2);
  let cy = rect.top + (rect.height / 2);
  switch ( side ) {
    case "bottom": cy = rect.top - pad - (fh / 2); break;
    case "top": cy = rect.bottom + pad + (fh / 2); break;
    case "left": cx = rect.right + pad + (fw / 2); break;
    case "right": cx = rect.left - pad - (fw / 2); break;
  }
  cx = Math.clamp(cx, pad + (fw / 2), window.innerWidth - pad - (fw / 2));
  cy = Math.clamp(cy, pad + (fh / 2), window.innerHeight - pad - (fh / 2));
  Object.assign(tooltip.style, { left: `${cx - (w / 2)}px`, top: `${cy - (h / 2)}px`, right: "", bottom: "" });
  tooltip.classList.remove("text-left", "text-right");
  tooltip.classList.add("text-center");
}

/** Wrap the tooltip manager's placement; call once on the table client, when game.tooltip exists. */
export function installSeatTooltips() {
  const manager = game.tooltip;
  if ( typeof manager?._setAnchor !== "function" ) return;
  const original = manager._setAnchor.bind(manager);
  manager._setAnchor = function(direction) {
    const side = seatSide(this.element);
    if ( !side ) return original(direction);
    this.tooltip.classList.add("avtt-tooltip", `avtt-tooltip-${side}`);
    return placeTurned(this, side);
  };
}
