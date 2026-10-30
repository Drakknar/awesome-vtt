import { PHYSICAL_DICE_METHOD, syncDefaultDiceMethod } from "../../../awesome-vtt-core/scripts/dice.mjs";
import { getSetting, isTableClient } from "../settings.mjs";
import { CHANNEL, ID_PATTERN, MAX_SLOTS, MAX_DICE_PER_SLOT } from "./socket.mjs";
import { PAD_TEMPLATE } from "./pad.mjs";
import TableRollResolver from "./table-resolver.mjs";
import GmDiceEntry from "./gm-entry.mjs";

/**
 * Register "Physical dice" as a dice fulfillment method. It then appears in core's Configure Dice menu on every
 * client, and the table client selects it automatically when the Physical dice setting is on.
 * Must run during init.
 */
export function registerFulfillment() {
  CONFIG.Dice.fulfillment.methods[PHYSICAL_DICE_METHOD] = {
    label: "AVTT.Dice.Method",
    icon: '<i class="fa-solid fa-dice"></i>',
    interactive: true,
    resolver: TableRollResolver
  };
  foundry.applications.handlebars.loadTemplates([PAD_TEMPLATE]);
}

/** Listen for dice requests (GM), results (roller) and cancellations (GM). */
export function activateDiceSocket() {
  game.socket.on(CHANNEL, data => {
    if ( !data || (typeof data !== "object") ) return;
    switch ( data.type ) {
      case "diceRequest": return onDiceRequest(data);
      case "diceResult": return TableRollResolver.receiveResult(data);
      case "diceDone": return game.user.isGM && GmDiceEntry.closeRequests(data);
    }
  });
}

/**
 * On the table client, make Physical dice the default method while the setting is on, and remove it when off
 * (per-die choices made in Configure Dice still win).
 * @returns {Promise<void>|undefined}
 */
export function syncTableDiceConfig() {
  if ( !isTableClient() ) return;
  return syncDefaultDiceMethod(getSetting("physicalDice") !== "off");
}

/* -------------------------------------------- */

const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");

/**
 * GM side: validate a request from a player client and open an entry window for it.
 * @param {object} data
 */
function onDiceRequest(data) {
  if ( !game.user.isGM || !["gm", "both"].includes(getSetting("physicalDice")) ) return;
  const user = game.users.get(data.userId);
  if ( !user || user.isGM || !user.active || !ID_PATTERN.test(data.requestId ?? "") ) return;

  const slots = (Array.isArray(data.slots) ? data.slots : []).slice(0, MAX_SLOTS).flatMap(s => {
    const faces = Number(s?.faces);
    const count = Number(s?.count);
    if ( !ID_PATTERN.test(s?.termId ?? "") || !Number.isInteger(faces) || !Number.isInteger(count) ) return [];
    if ( (faces < 2) || (faces > 1000) || (count < 1) || (count > MAX_DICE_PER_SLOT) ) return [];
    return [{ termId: s.termId, faces, count, extra: s.extra === true }];
  });
  if ( !slots.length ) return;

  new GmDiceEntry({
    requestId: data.requestId,
    user,
    speaker: text(data.speaker, 100) || user.name,
    formula: text(data.formula, 200),
    flavor: text(data.flavor, 200),
    slots
  }).render({ force: true });
}
