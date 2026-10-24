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

import { seatSide, placeBeside } from "./turned.mjs";

/**
 * Place the tooltip next to the element, toward the table centre as the seat's player sees it. The tooltip is turned
 * around its own centre by CSS (avtt-tooltip-<side>).
 */
function placeTurned(manager, side) {
  const tooltip = manager.tooltip;
  const pad = manager.constructor.TOOLTIP_MARGIN_PX ?? 5;
  const { left, top } = placeBeside(manager.element.getBoundingClientRect(), tooltip.offsetWidth, tooltip.offsetHeight, side, "up", pad);
  Object.assign(tooltip.style, { left: `${left}px`, top: `${top}px`, right: "", bottom: "" });
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
