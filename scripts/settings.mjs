import { MODULE_ID } from "./constants.mjs";
import SeatEditor from "./apps/seat-editor.mjs";
import SeatPicker from "./apps/seat-picker.mjs";
import { setKeepAwake } from "../../awesome-vtt-core/scripts/wake-lock.mjs";

const { BooleanField, NumberField, StringField, ObjectField } = foundry.data.fields;

/** Notify the rest of the module that something changed which requires a refresh. */
const refresh = () => Hooks.callAll(`${MODULE_ID}.refresh`);

export function registerSettings() {
  game.settings.registerMenu(MODULE_ID, "seatEditor", {
    name: "AVTT.Settings.SeatEditor.Name",
    label: "AVTT.Settings.SeatEditor.Label",
    hint: "AVTT.Settings.SeatEditor.Hint",
    icon: "fa-solid fa-chair",
    type: SeatEditor,
    restricted: true
  });

  // Every user (players, the table user) may choose the seats of the characters they own.
  game.settings.registerMenu(MODULE_ID, "seatPicker", {
    name: "AVTT.Settings.SeatPicker.Name",
    label: "AVTT.Settings.SeatPicker.Label",
    hint: "AVTT.Settings.SeatPicker.Hint",
    icon: "fa-solid fa-chair",
    type: SeatPicker,
    restricted: false
  });

  // Id of the user logged in on the table screen.
  game.settings.register(MODULE_ID, "tableUser", {
    scope: "world",
    config: false,
    type: new StringField({ blank: true, initial: "" }),
    requiresReload: true
  });

  // { [seatKey]: { actorId, playerName, color } }
  game.settings.register(MODULE_ID, "seats", {
    scope: "world",
    config: false,
    type: new ObjectField({ initial: {} }),
    // Also on clients without the table overlay: open seat pickers and the phone's seat choice re-render.
    onChange: () => {
      refresh();
      Hooks.callAll(`${MODULE_ID}.seatsChanged`);
    }
  });

  game.settings.register(MODULE_ID, "hideCoreUI", {
    name: "AVTT.Settings.HideCoreUI.Name",
    hint: "AVTT.Settings.HideCoreUI.Hint",
    scope: "world",
    config: true,
    type: new BooleanField({ initial: true }),
    onChange: refresh
  });

  game.settings.register(MODULE_ID, "keepSceneControls", {
    name: "AVTT.Settings.KeepSceneControls.Name",
    hint: "AVTT.Settings.KeepSceneControls.Hint",
    scope: "world",
    config: true,
    type: new BooleanField({ initial: false }),
    onChange: refresh
  });

  game.settings.register(MODULE_ID, "rotateWindows", {
    name: "AVTT.Settings.RotateWindows.Name",
    hint: "AVTT.Settings.RotateWindows.Hint",
    scope: "world",
    config: true,
    type: new BooleanField({ initial: true })
  });

  game.settings.register(MODULE_ID, "turnIndicator", {
    name: "AVTT.Settings.TurnIndicator.Name",
    hint: "AVTT.Settings.TurnIndicator.Hint",
    scope: "world",
    config: true,
    type: new BooleanField({ initial: true }),
    onChange: refresh
  });

  game.settings.register(MODULE_ID, "chatHistory", {
    name: "AVTT.Settings.ChatHistory.Name",
    hint: "AVTT.Settings.ChatHistory.Hint",
    scope: "world",
    config: true,
    type: new NumberField({ initial: 30, min: 5, max: 200, step: 5, integer: true }),
    onChange: refresh
  });

  game.settings.register(MODULE_ID, "physicalDice", {
    name: "AVTT.Settings.PhysicalDice.Name",
    hint: "AVTT.Settings.PhysicalDice.Hint",
    scope: "world",
    config: true,
    type: new StringField({
      required: true,
      blank: false,
      initial: "off",
      choices: {
        off: "AVTT.Settings.PhysicalDice.Choices.off",
        player: "AVTT.Settings.PhysicalDice.Choices.player",
        gm: "AVTT.Settings.PhysicalDice.Choices.gm",
        both: "AVTT.Settings.PhysicalDice.Choices.both"
      }
    }),
    onChange: () => {
      Hooks.callAll(`${MODULE_ID}.physicalDice`);
      refresh();
    }
  });

  game.settings.register(MODULE_ID, "diceSoNice", {
    name: "AVTT.Settings.DiceSoNice.Name",
    hint: "AVTT.Settings.DiceSoNice.Hint",
    scope: "world",
    config: true,
    type: new BooleanField({ initial: true })
  });

  // Client-scoped: only meaningful on the table screen itself.
  game.settings.register(MODULE_ID, "uiScale", {
    name: "AVTT.Settings.UIScale.Name",
    hint: "AVTT.Settings.UIScale.Hint",
    scope: "client",
    config: true,
    type: new NumberField({ initial: 1, min: 0.5, max: 2, step: 0.05 }),
    onChange: refresh
  });

  game.settings.register(MODULE_ID, "keepAwake", {
    name: "AVTT.Settings.KeepAwake.Name",
    hint: "AVTT.Settings.KeepAwake.Hint",
    scope: "client",
    config: true,
    type: new BooleanField({ initial: true }),
    onChange: value => isTableClient() && setKeepAwake(value)
  });

  game.settings.register(MODULE_ID, "iconOnlyButtons", {
    name: "AVTT.Settings.IconOnlyButtons.Name",
    hint: "AVTT.Settings.IconOnlyButtons.Hint",
    scope: "client",
    config: true,
    type: new BooleanField({ initial: false }),
    onChange: refresh
  });

  game.settings.register(MODULE_ID, "foldPill", {
    name: "AVTT.Settings.FoldPill.Name",
    hint: "AVTT.Settings.FoldPill.Hint",
    scope: "client",
    config: true,
    type: new BooleanField({ initial: true }),
    onChange: refresh
  });

  // Per seat on this screen: whether quick actions are open, and the open quick actions and sheet tabs, so they stay
  // as the player left them across re-renders, seat changes and reloads. { [seatKey]: { quick, quickTab, sheetTab } }
  game.settings.register(MODULE_ID, "seatPanels", {
    scope: "client",
    config: false,
    type: new ObjectField({ initial: {} })
  });

  // Opening a panel in one seat closes the panels open in the other seats (off by default, the user's choice).
  game.settings.register(MODULE_ID, "closeOtherPanels", {
    name: "AVTT.Settings.CloseOtherPanels.Name",
    hint: "AVTT.Settings.CloseOtherPanels.Hint",
    scope: "client",
    config: true,
    type: new BooleanField({ initial: false })
  });

  // Automation prompts in the seats (see the core's prompts.mjs), each off by default, as on the phone.
  for ( const [key, name] of [["autoDeathSaves", "AutoDeathSaves"], ["autoConcentration", "AutoConcentration"],
    ["autoSaves", "AutoSaves"], ["autoRequests", "AutoRequests"], ["autoInitiative", "AutoInitiative"]] ) {
    game.settings.register(MODULE_ID, key, {
      name: `AVTT.Settings.${name}.Name`,
      hint: `AVTT.Settings.${name}.Hint`,
      scope: "client",
      config: true,
      type: new BooleanField({ initial: false })
    });
  }

  // Around using an action from a seat: checks before, the follow-up roll after, and the result notice.
  for ( const [key, name] of [["useChecks", "UseChecks"], ["autoRoll", "AutoRoll"], ["rollNotices", "RollNotices"]] ) {
    game.settings.register(MODULE_ID, key, {
      name: `AVTT.Settings.${name}.Name`,
      hint: `AVTT.Settings.${name}.Hint`,
      scope: "client",
      config: true,
      type: new BooleanField({ initial: true })
    });
  }

  game.settings.register(MODULE_ID, "idleOpacity", {
    name: "AVTT.Settings.IdleOpacity.Name",
    hint: "AVTT.Settings.IdleOpacity.Hint",
    scope: "client",
    config: true,
    type: new NumberField({ initial: 0.55, min: 0.2, max: 1, step: 0.05 }),
    onChange: refresh
  });
}

export const getSetting = key => game.settings.get(MODULE_ID, key);

/** Is the current client the table screen? */
export function isTableClient() {
  const id = getSetting("tableUser");
  return !!id && game.user.id === id;
}
