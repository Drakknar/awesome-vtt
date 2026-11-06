import { MODULE_ID } from "./constants.mjs";
import { registerSettings, isTableClient, getSetting } from "./settings.mjs";
import TableOverlay from "./table/overlay.mjs";
import { registerFulfillment, activateDiceSocket, syncTableDiceConfig } from "./dice/fulfillment.mjs";
import { activateShareListeners } from "../../awesome-vtt-core/scripts/journal.mjs";
import { setKeepAwake } from "../../awesome-vtt-core/scripts/wake-lock.mjs";
import { activateHandMode, onToolChange } from "./table/canvas-tools.mjs";
import { registerUseChecks } from "./table/use-checks.mjs";
import { closeStartupUserConfig, onActorDataChange, onChatChange, actorOf } from "../../awesome-vtt-core/scripts/ui.mjs";
import { initPrompts, relayChallenges } from "../../awesome-vtt-core/scripts/prompts.mjs";
import { answerVisibility } from "../../awesome-vtt-core/scripts/vision.mjs";
import { registerCoreSettings } from "../../awesome-vtt-core/scripts/settings.mjs";
import sys, { isSupported, markSystem } from "../../awesome-vtt-core/scripts/system.mjs";
import { installSeatedVisibility, refreshSeatedTokens } from "./table/visibility.mjs";
import { installSeatTooltips } from "./table/tooltips.mjs";
import { installTurnedContextMenus, installTurnedPopups, installTurnedTippy } from "./table/turned.mjs";
import { activateSeatSocket, movableActors, seatOf, seatOptions, moveSeat } from "./seat-moves.mjs";
import { announceChallenge, watchHealth } from "./table/notices.mjs";

/** Setting of each automation prompt kind (see the core's prompts.mjs); the same keys as on the phone. */
const PROMPT_SETTINGS = {
  deathSave: "autoDeathSaves", concentration: "autoConcentration", save: "autoSaves",
  request: "autoRequests", initiative: "autoInitiative"
};

/** @type {TableOverlay|null} */
let overlay = null;

/** The seated characters' health, for the notices every seat sees (table/notices.mjs). */
let health = null;

Hooks.once("init", () => {
  markSystem();
  registerSettings();
  registerCoreSettings();
  // Seat choice for every user (the phone module shows it in its Settings tab).
  game.modules.get(MODULE_ID).api = { movableActors, seatOf, seatOptions, moveSeat };
  registerFulfillment();
  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/inventory.hbs`,
    `modules/${MODULE_ID}/templates/inventory-item.hbs`,
    `modules/${MODULE_ID}/templates/actions.hbs`,
    `modules/${MODULE_ID}/templates/spells.hbs`
  ]);
  // SotDL's "Banes … Boons" line under the Next roll choice ({{> avttAdvScale}}): Dice panel and prompts.
  foundry.applications.handlebars.loadTemplates({ avttAdvScale: `modules/${MODULE_ID}/templates/adv-scale.hbs` });
});

// Seated characters stay visible on the map (see table/visibility.mjs); installed before the map is first drawn.
Hooks.once("setup", () => {
  if ( !isSupported() || !isTableClient() ) return;
  installSeatedVisibility();
  refreshSeatedTokens();
});

// The table user deliberately has no assigned character (it plays every seated character), so on the table screen
// core's automatic User Configuration window at startup is closed.
closeStartupUserConfig(isTableClient);

Hooks.once("ready", () => {
  // Physical dice: every client listens, because the GM may be asked to enter results.
  activateDiceSocket();
  activateSeatSocket();
  syncTableDiceConfig();
  Hooks.on(`${MODULE_ID}.physicalDice`, syncTableDiceConfig);

  if ( !isSupported() ) {
    console.warn(`${MODULE_ID} | Only dnd5e and Shadow of the Demon Lord are supported; table mode disabled.`);
    return;
  }
  // SotDL: the GM's challenge cards are whispered to the players' own users only; the active GM's client relays them
  // to the table user, only for seated characters (seatOf reads the world seats setting and compares the original
  // character, so a form counts too; nothing in dnd5e, or on other clients).
  relayChallenges(actor => (seatOf(actor) ? [getSetting("tableUser")].filter(Boolean) : []));
  if ( !isTableClient() ) return;

  overlay = new TableOverlay();
  overlay.rebuild();
  activateShareListeners(() => overlay.seats.forEach(s => s.onJournalShared()));
  setKeepAwake(getSetting("keepAwake"));
  activateHandMode();
  installSeatTooltips();
  // Context menus and SotDL's own tooltips are drawn outside the turned windows: turn them toward the seat too.
  installTurnedContextMenus();
  installTurnedPopups();
  if ( game.system.id === "demonlord" ) installTurnedTippy();
  onToolChange(() => overlay.seats.forEach(s => s.refreshTools()));
  game.modules.get(MODULE_ID).api.overlay = overlay;
  registerTableHooks();
  registerUseChecks(overlay);
  health = watchHealth(overlay);
  // Phones without the map ask which creatures their character can see (target list); this screen draws its vision.
  answerVisibility();
  // Prompts go to the seat of the character they are for. SotDL challenge requests also come relayed by the GM, and
  // the other seats get a notice about them.
  initPrompts({
    show: prompt => overlay.seatsFor(prompt.actor)[0]?.prompts.add(prompt),
    close: key => overlay.seats.forEach(s => s.prompts.close(key)),
    enabled: kind => getSetting(PROMPT_SETTINGS[kind]),
    isMine: actor => overlay.seatsFor(actor).length > 0,
    announce: (prompt, prompted) => announceChallenge(overlay, prompt, prompted),
    relayed: true
  });
});

/**
 * Register the table screen's hooks: refreshes, windows opened from seats, and the actor data, initiative and
 * chat the seats show.
 */
function registerTableHooks() {
  Hooks.on(`${MODULE_ID}.refresh`, () => {
    overlay.rebuild();
    refreshSeatedTokens();
    health?.refresh();
  });

  // Windows opened from a seat are rotated toward it; core UI is re-hidden when it re-renders.
  Hooks.on("renderApplicationV2", (app, element, context, options) => overlay.onRenderApplication(app, element, options));

  // Actor data shown in pills and sheets.
  onActorDataChange(doc => {
    const actor = actorOf(doc);
    if ( actor instanceof Actor ) overlay.renderActor(actor);
  });

  // A seated character transformed or reverted (a form actor created, deleted, or its flags removed): its seat shows
  // the new form, and the form's tokens count as seated.
  const transformed = () => {
    overlay.renderAll();
    refreshSeatedTokens();
    health?.refresh();
  };
  Hooks.on("createActor", actor => sys.isTransformed(actor) && transformed());
  Hooks.on("deleteActor", actor => sys.isTransformed(actor) && transformed());
  // Only transform flag changes on a seated character or its forms (the system writes other flags often).
  Hooks.on("updateActor", (actor, change) => {
    const seated = [...overlay.seats.values()].map(s => s.config.actorId);
    if ( sys.transformChanged(actor, change, seated) ) transformed();
  });

  // Initiative and the your-turn indicator.
  for ( const hook of ["createCombat", "updateCombat", "deleteCombat",
    "createCombatant", "updateCombatant", "deleteCombatant", "combatTurnChange"] ) {
    Hooks.on(hook, () => overlay.renderInitiative());
  }

  // Chat panels.
  onChatChange((message, action) => overlay.onChatMessage(message, action));
}
