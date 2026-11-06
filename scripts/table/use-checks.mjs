import { getSetting } from "../settings.mjs";
import sys, { damageAction } from "../../../awesome-vtt-core/scripts/system.mjs";
import { messageActor } from "../../../awesome-vtt-core/scripts/common.mjs";

/**
 * Hooks on the table screen, around using an item's activity (dnd5e 6.x; in SotDL the targets rule, around the
 * core's useItem and the card buttons that act on targets, and the roll results apply, since the dnd5e hooks never
 * fire there and the adapters' follow-up rolls are no-ops):
 * - Before use ("dnd5e.preUseActivity"): stop, with a notice in the character's seat, when something it needs is
 *   missing: targets, a spell slot, or uses (the item's or the activity's). dnd5e would otherwise open its dialog
 *   first, then fail with a notification in the middle of the screen, facing nobody in particular. Other resources
 *   (actions, attributes, hit dice, materials) are left to dnd5e's own check.
 * - After use ("dnd5e.postUseActivity"): roll what dnd5e leaves on a chat-card button (a save's damage, a utility
 *   formula), as the card's own button would. Damage and healing activities already roll by themselves; an attack's
 *   damage is rolled right after each attack roll (the core's rollDamageAfterAttacks), hit or miss.
 * - Roll results (the core's onRollResult: any roll made on this screen, Foundry's dice or physical ones, shown once
 *   Dice So Nice has finished): a notice with the total in the rolling character's seat. The table is a shared
 *   screen, so pass / fail follows dnd5e's "challenge visibility" as for other players (see the core's summarizeRoll).
 *   An attack, spell or other action that didn't miss gets a "Roll damage" button on its notice (the core's
 *   damageAction), unless its damage is already rolled after the attack; the damage roll's own
 *   message then shows the damage notice.
 */

/**
 * Register the checks and notices for actions used from a seat (see above).
 * @param {import("./overlay.mjs").default} overlay
 */
export function registerUseChecks(overlay) {

  /**
   * Show a notice in the actor's seats, or as a normal notification if the actor isn't seated.
   * @param {Actor} actor
   * @param {object} notice
   */
  const notify = (actor, notice) => {
    const seats = overlay.seatsFor(actor);
    if ( seats.length ) seats.forEach(s => s.showNotice(notice));
    else if ( notice.kind === "warning" ) ui.notifications.warn(notice.text);
  };

  // Targets belong to the one Table user, so all seats share them. Targets used by an action are cleared when the
  // next targeted action starts (not right after use, so its attack, damage and damage application still see them):
  // each action needs fresh targets, and one player's target is never reused by another without a warning.
  // `usedBy`: the character (original id) whose action used the current targets, or null when they are fresh.
  let usedBy = null;
  const clearUsed = () => {
    usedBy = null;
    canvas.tokens?.setTargets([], { mode: "replace" });
  };
  Hooks.on("targetToken", (user, token, targeted) => {
    if ( (user === game.user) && targeted ) usedBy = null;
  });
  Hooks.on("dnd5e.postUseActivity", activity => {
    if ( sys.needsTargets(activity) && game.user.targets.size ) usedBy = sys.originalId(activity.actor) ?? "";
  });

  Hooks.on("dnd5e.preUseActivity", (activity, usageConfig) => {
    if ( !getSetting("useChecks") ) return;
    if ( (usedBy !== null) && sys.needsTargets(activity) ) clearUsed();
    const problem = missingTargets(activity) ?? describeProblem(sys.usageProblem(activity, usageConfig));
    if ( problem ) {
      notify(activity.actor, { kind: "warning", ...problem });
      return false;
    }
  });

  Hooks.on("dnd5e.postUseActivity", (activity, usageConfig, results) => {
    if ( !getSetting("autoRoll") || (usageConfig.subsequentActions === false) ) return;
    const message = results?.message;
    const origin = message?.id;
    if ( (activity.type === "save") && activity.damage?.parts?.length ) {
      activity.rollDamage({}, {}, { data: { system: { targets: message?.system?.targets, origin } } });
    }
    else if ( (activity.type === "utility") && activity.roll?.formula ) {
      activity.rollFormula({}, {}, { data: { system: { origin } } });
    }
  });

  // SotDL: the same rule around the core's useItem (seat buttons, favorites, item prompts), for items that attack.
  Hooks.on("awesome-vtt-core.preUseItem", (actor, item) => {
    if ( getSetting("useChecks") && (usedBy !== null) && sys.itemNeedsTargets(item) ) clearUsed();
  });
  Hooks.on("awesome-vtt-core.useItem", (actor, item) => {
    if ( sys.itemNeedsTargets(item) && game.user.targets.size ) usedBy = sys.originalId(actor) ?? "";
  });
  // SotDL card buttons that act on the targets (damage, healing, effects; the adapter's CARD_TARGET_BUTTONS), in a
  // seat's chat: targets another character's action used are cleared first, so a healing button pressed in one seat
  // doesn't heal what another seat attacked. The card's own character keeps them (its damage after its attack).
  if ( sys.CARD_TARGET_BUTTONS ) overlay.element.addEventListener("click", event => {
    const button = event.target.closest?.(sys.CARD_TARGET_BUTTONS);
    const messageId = button?.closest("[data-message-id]")?.dataset.messageId;
    if ( !messageId || !getSetting("useChecks") ) return;
    const message = game.messages.get(messageId);
    const actor = message ? messageActor(message) : null;
    const id = sys.originalId(actor) ?? "";
    if ( (usedBy !== null) && (usedBy !== id) ) {
      const had = game.user.targets.size > 0;
      clearUsed();
      const seat = had ? overlay.seats.get(event.target.closest(".avtt-seat")?.dataset.seat) : null;
      seat?.showNotice({
        kind: "warning",
        text: game.i18n.localize("AVTT.Checks.TargetsCleared"),
        detail: game.i18n.localize("AVTT.Checks.TargetsClearedHint")
      });
    }
    else if ( game.user.targets.size ) usedBy = id;
  }, { capture: true });

  // Attack rolls from a seat's character are followed by their damage roll (the user's choice: always both).
  sys.rollDamageAfterAttacks(actor => getSetting("autoRoll") && (overlay.seatsFor(actor).length > 0));

  sys.onRollResult((result, message) => {
    const actor = messageActor(message);
    const seats = actor ? overlay.seatsFor(actor) : [];
    if ( !seats.length ) return;
    const notice = {
      ...sys.rollNotice(result, NOTICE_LABELS), name: actor.name,
      // "Roll damage" only for rolls made here: a roll from the player's phone offers it on the phone.
      action: message.isAuthor
        ? damageAction(result, message, getSetting("autoRoll"), game.i18n.localize("AVTT.Notice.RollDamage"))
        : undefined
    };
    seats.forEach(s => s.showNotice(notice));
  }, {
    shared: true,
    enabled: () => getSetting("rollNotices"),
    // A player's roll from their phone (or desktop) for a seated character shows in its seat too; the GM's don't.
    others: message => {
      if ( message.author?.isGM ) return false;
      const actor = messageActor(message);
      return !!actor && (overlay.seatsFor(actor).length > 0);
    }
  });
}

/* -------------------------------------------- */

/**
 * Targets on the table are picked on the map before use; areas are placed on the map after use.
 * @param {Activity} activity
 * @returns {{text: string, detail: string}|null}
 */
function missingTargets(activity) {
  if ( !sys.needsTargets(activity) || game.user.targets.size ) return null;
  return {
    text: game.i18n.localize("AVTT.Checks.NoTarget"),
    detail: game.i18n.format("AVTT.Checks.NoTargetHint", { name: activity.item.name })
  };
}

/**
 * The seat notice for a problem found by the core's usageProblem().
 * @param {object|null} problem
 * @returns {{text: string, detail: string}|null}
 */
function describeProblem(problem) {
  if ( !problem ) return null;
  const { reason, ...data } = problem;
  const key = { noSlot: "NoSlot", noUses: "NoUses" }[reason];
  return { text: game.i18n.localize(`AVTT.Checks.${key}`), detail: game.i18n.format(`AVTT.Checks.${key}Hint`, data) };
}

/**
 * Label keys for the words of a roll notice (see the core's rollNotice).
 * @param {string} id
 * @returns {string|undefined}
 */
const NOTICE_LABELS = id => ({
  damage: "AVTT.Notice.Damage", healing: "AVTT.Notice.Healing", critical: "AVTT.Notice.Critical", fumble: "AVTT.Notice.Fumble",
  success: "AVTT.Notice.Success", failure: "AVTT.Notice.Failure", hit: "AVTT.Notice.Hit", miss: "AVTT.Notice.Miss",
  hitCount: "AVTT.Notice.HitCount"
})[id];
