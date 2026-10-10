import { MODULE_ID, SEATS, DEFAULT_COLORS } from "../constants.mjs";
import { syncOwnership } from "../ownership.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** GM-facing editor: a diagram of the table with 12 seats, each mapped to an actor. */
export default class SeatEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-seat-editor`,
    classes: [MODULE_ID, "avtt-seat-editor"],
    tag: "form",
    window: { title: "AVTT.SeatEditor.Title", icon: "fa-solid fa-chair", resizable: true },
    position: { width: 820, height: "auto" },
    form: { handler: SeatEditor.#onSubmit, closeOnSubmit: true },
    actions: { clearSeat: SeatEditor.#onClearSeat }
  };

  static PARTS = {
    // Each part must render a single root element, so the footer is its own part.
    form: { template: `modules/${MODULE_ID}/templates/seat-editor.hbs` },
    footer: { template: `modules/${MODULE_ID}/templates/seat-editor-footer.hbs` }
  };

  /** @override */
  async _prepareContext(options) {
    const saved = game.settings.get(MODULE_ID, "seats") ?? {};
    const tableUser = game.settings.get(MODULE_ID, "tableUser");
    const actors = game.actors
      .filter(a => a.type === "character")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(a => ({ id: a.id, name: a.name }));

    const seats = SEATS.map((seat, i) => {
      const data = saved[seat.key] ?? {};
      return {
        ...seat,
        label: game.i18n.localize(`AVTT.Seat.${seat.key}`),
        actorId: data.actorId ?? "",
        playerName: data.playerName ?? "",
        color: data.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]
      };
    });

    return {
      sides: ["top", "left", "right", "bottom"].map(side => ({ side, seats: seats.filter(s => s.side === side) })),
      actors,
      users: game.users.filter(u => !u.isGM).map(u => ({ id: u.id, name: u.name, selected: u.id === tableUser }))
    };
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // Warn about duplicated actors as the user edits.
    this.element.addEventListener("change", () => this.#flagDuplicates());
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#flagDuplicates();
  }

  #flagDuplicates() {
    const selects = [...this.element.querySelectorAll("select[data-seat-actor]")];
    const counts = {};
    for ( const s of selects ) if ( s.value ) counts[s.value] = (counts[s.value] ?? 0) + 1;
    for ( const s of selects ) s.classList.toggle("avtt-duplicate", !!s.value && counts[s.value] > 1);
  }

  static #onClearSeat(event, target) {
    const seat = target.closest("[data-seat]");
    seat.querySelector("select").value = "";
    seat.querySelector("input[type=text]").value = "";
    this.#flagDuplicates();
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const tableUser = data.tableUser ?? "";
    const valid = new Set(game.actors.map(a => a.id));
    const seats = {};
    for ( const seat of SEATS ) {
      const s = data.seats?.[seat.key];
      if ( !s?.actorId || !valid.has(s.actorId) ) continue;
      seats[seat.key] = {
        actorId: s.actorId,
        playerName: String(s.playerName ?? "").trim().slice(0, 64),
        color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : DEFAULT_COLORS[0]
      };
    }

    const user = game.users.get(tableUser);
    if ( tableUser && (!user || user.isGM) ) {
      ui.notifications.error("AVTT.SeatEditor.InvalidUser", { localize: true });
      return;
    }

    await game.settings.set(MODULE_ID, "seats", seats);
    if ( tableUser !== game.settings.get(MODULE_ID, "tableUser") ) {
      await game.settings.set(MODULE_ID, "tableUser", tableUser);
    }
    await syncOwnership(tableUser, seats);
    ui.notifications.info("AVTT.SeatEditor.Saved", { localize: true });
  }
}
