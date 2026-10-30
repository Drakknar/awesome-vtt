import { MODULE_ID } from "../constants.mjs";

const SettingsConfig = foundry.applications.settings.SettingsConfig;

/**
 * Core's settings window, opened from a seat: centered on the screen, turned toward that seat, and not draggable
 * (dragging a rotated window follows screen directions, which feels wrong from most seats).
 * It opens on this module's settings. The table user is a player, so core only lists client settings.
 */
export default class TableSettingsConfig extends SettingsConfig {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-settings`,
    classes: ["avtt-table-settings"],
    window: { resizable: false },
    initialCategory: MODULE_ID
  };

  /** The one open instance, if any. */
  static #instance = null;

  /**
   * Open the window for a seat. Opening it again from the same seat closes it; from another seat it turns to face it.
   * @param {string} seatKey
   * @returns {Promise<TableSettingsConfig|undefined>}
   */
  static async toggle(seatKey) {
    const open = TableSettingsConfig.#instance;
    if ( open?.rendered ) {
      await open.close();
      if ( open.avttSeat === seatKey ) return;
    }
    const size = Math.min(window.innerWidth, window.innerHeight);
    const app = new TableSettingsConfig({
      position: { width: Math.min(780, Math.round(size * 0.9)), height: Math.min(680, Math.round(size * 0.85)) }
    });
    // Read by the table overlay: rotate toward this seat and center on the screen.
    app.avttSeat = seatKey;
    app.avttCenter = true;
    TableSettingsConfig.#instance = app;
    return app.render({ force: true });
  }

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const header = this.window.header;
    // Stop core's drag (and double-click minimize) before they start; header buttons such as Close keep working.
    const block = event => {
      if ( !event.target.closest(".header-control") ) event.stopImmediatePropagation();
    };
    header.addEventListener("pointerdown", block, { capture: true });
    header.addEventListener("dblclick", block, { capture: true });
  }

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    if ( TableSettingsConfig.#instance === this ) TableSettingsConfig.#instance = null;
  }
}
