import sys from "../../../awesome-vtt-core/scripts/system.mjs";
import { statusLabel } from "../../../awesome-vtt-core/scripts/common.mjs";
import { actorOf } from "../../../awesome-vtt-core/scripts/ui.mjs";

/**
 * Notices every seat sees, about one seated character (the owner's choice, 2026-11-06: "certain notifications are
 * good to see for every player"): a challenge roll the GM asked of it, and it taking damage or becoming injured,
 * incapacitated or dead (dnd5e: unconscious or dead). They are passive: they never replace a seat's own warning or
 * roll result still on screen (see Seat#showNotice), and are tinted with the colour of that character's player.
 */

/** Health changes of one character within this time (ms) make one notice (damage, then the statuses it brings). */
const HURT_WINDOW_MS = 1200;

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * "#rrggbb" from a Foundry Color (User#color) or a string, or null.
 * @param {unknown} color
 * @returns {string|null}
 */
function hexColor(color) {
  const css = (typeof color === "string") ? color : color?.css;
  return HEX.test(css ?? "") ? css : null;
}

/**
 * The colour of the player a character belongs to: the Foundry colour of the non-GM user whose assigned character
 * it is (or the character it is a transformed form of), else the colour of its seat, else null (default style).
 * @param {Actor} actor
 * @param {import("./overlay.mjs").default} overlay
 * @returns {string|null}
 */
export function playerColor(actor, overlay) {
  const ids = new Set([actor?.id, sys.originalId(actor)].filter(Boolean));
  const user = game.users.find(u => !u.isGM && u.character && ids.has(u.character.id));
  return hexColor(user?.color) ?? hexColor(overlay.seatsFor(actor)[0]?.config.color);
}

/**
 * Tell every seat about a challenge roll asked of a seated character (the core's initPrompts `announce`). The
 * character's own seat has the prompt; it gets the notice only when the prompt isn't shown ("Prompt for GM
 * requests" off).
 * @param {import("./overlay.mjs").default} overlay
 * @param {import("../../../awesome-vtt-core/scripts/prompts.mjs").Prompt} prompt
 * @param {boolean} prompted  Was the prompt shown in the character's seat?
 */
export function announceChallenge(overlay, prompt, prompted) {
  const own = prompted ? overlay.seatsFor(prompt.actor) : [];
  const notice = {
    kind: "request",
    passive: true,
    tint: playerColor(prompt.actor, overlay),
    name: prompt.actor.name,
    text: game.i18n.format("AVTT.Notice.Challenge", { attribute: prompt.attribute ?? prompt.title }),
    detail: prompt.boons ?? ""
  };
  for ( const seat of overlay.seats.values() ) if ( !own.includes(seat) ) seat.showNotice(notice);
}

/**
 * Watch the seated characters' health and tell every seat when one takes damage or gets a health status. Changes
 * within HURT_WINDOW_MS make one notice per character. Healing and statuses ending aren't announced.
 * @param {import("./overlay.mjs").default} overlay
 * @returns {{refresh: function(): void}}  Call refresh after the seats or a seated character's form changed.
 */
export function watchHealth(overlay) {
  /** Last state seen per actor id: the core's healthState ({ damage, statuses }; dnd5e also effectiveMax). */
  const last = new Map();
  const timers = new Map();

  const seatedActors = () => [...overlay.seats.values()].map(s => s.actor).filter(Boolean);
  const refresh = () => {
    const actors = seatedActors();
    const ids = new Set(actors.map(a => a.id));
    for ( const id of last.keys() ) if ( !ids.has(id) ) last.delete(id);
    for ( const actor of actors ) if ( !last.has(actor.id) ) last.set(actor.id, sys.healthState(actor));
  };

  const check = actor => {
    timers.delete(actor.id);
    const before = last.get(actor.id);
    const now = sys.healthState(actor);
    last.set(actor.id, now);
    if ( !before ) return;
    // In dnd5e, HP drop with the maximum (e.g. temporary max HP ending): only damage beyond that drop counts.
    const maxDrop = Math.max(0, (before.effectiveMax ?? 0) - (now.effectiveMax ?? 0));
    const damage = Math.max(0, now.damage - before.damage - maxDrop);
    const added = now.statuses.filter(id => !before.statuses.includes(id));
    if ( (damage <= 0) && !added.length ) return;
    const taken = (damage > 0) ? game.i18n.format("AVTT.Notice.DamageTaken", { n: damage }) : "";
    const notice = {
      kind: "hurt",
      passive: true,
      tint: playerColor(actor, overlay),
      name: actor.name,
      text: added.length ? added.map(statusLabel).join(" · ") : taken,
      detail: added.length ? taken : ""
    };
    for ( const seat of overlay.seats.values() ) seat.showNotice(notice);
  };

  const changed = doc => {
    const actor = actorOf(doc);
    if ( !(actor instanceof Actor) || !overlay.seatsFor(actor).some(s => s.actor === actor) ) return;
    // A character seen for the first time (e.g. a new form): remember it, nothing to compare with.
    if ( !last.has(actor.id) ) {
      last.set(actor.id, sys.healthState(actor));
      return;
    }
    window.clearTimeout(timers.get(actor.id));
    timers.set(actor.id, window.setTimeout(() => check(actor), HURT_WINDOW_MS));
  };
  for ( const hook of ["updateActor", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"] ) {
    Hooks.on(hook, doc => changed(doc));
  }
  refresh();
  return { refresh };
}
