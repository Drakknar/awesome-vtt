import { MODULE_ID } from "../constants.mjs";
import { getSetting } from "../settings.mjs";
import sys from "../../../awesome-vtt-core/scripts/system.mjs";
import { setTool, toggleTool, currentTool, zoom, resetZoom } from "./canvas-tools.mjs";
import TableSettingsConfig from "../apps/table-settings.mjs";
import { CompendiumPanel, JournalPanel } from "../../../awesome-vtt-core/scripts/panels.mjs";
import { DicePanel, advModes, advModeChoices, advModeScale, advModeShort, advModeTone } from "../../../awesome-vtt-core/scripts/dice.mjs";
import * as sheet from "../../../awesome-vtt-core/scripts/sheet.mjs";
import { PromptQueue, askAbilityRoll } from "../../../awesome-vtt-core/scripts/prompts.mjs";
import * as coreUI from "../../../awesome-vtt-core/scripts/ui.mjs";
import Keypad from "./keypad.mjs";

const { renderTemplate } = foundry.applications.handlebars;
const tpl = name => `modules/${MODULE_ID}/templates/${name}.hbs`;

/**
 * Actions that submit something to the server (or load from it); their button is disabled while they run.
 * Not listed: actions that only change what's on screen (panels, tabs, dice pool, map tools).
 */
const BUSY_ACTIONS = new Set([
  "rollAbility", "rollSave", "rollSkill", "deathSave", "useItem", "applyHp", "spellPrepare", "invToParty", "toggleFavorite", "toggleInspiration", "toggleCondition",
  "endConcentration", "exhaustion", "toggleEffect", "promptChoice", "chatSend",
  "shortRest", "longRest", "openFullSheet", "levelUp", "usesAdjust", "slotAdjust", "invQty", "invEquip", "invAttune", "invDetails",
  "diceRoll", "compSearch", "compBrowse", "compMore", "compOpen", "compOpenSheet", "compAddItem",
  "journalOpen", "journalShared", "journalPage", "journalFull", "rollInitiative", "turnSpeed", "endTurn", "focusToken", "trackAdjust"
]);

/** How long notices stay up unless dismissed. */
const NOTICE_WARNING_MS = 8000;
const NOTICE_RESULT_MS = 15000;
/** A notice with a button (e.g. Roll damage) stays longer, so the player has time to use it. */
const NOTICE_ACTION_MS = 30000;

/**
 * Panels of a seat: quick actions (from the player pill) and the sections (section bar; "party" while the shared
 * inventory module is active). One section at a time; quick actions may stay open next to it when there is room.
 */
const panels = () => ["quick", ...coreUI.sectionList()];

/** Panel widths (em), as in the CSS: quick actions, the character sheet, the other sections; and the gap between. */
const PANEL_EM = { quick: 25, character: 24, other: 22, gap: 0.5 };
const ADV_LABELS = { normal: "AVTT.Sheet.Normal", adv: "AVTT.Sheet.Advantage", dis: "AVTT.Sheet.Disadvantage" };

/** Horizontal padding plus border of an element (px). */
function horizontalFrame(el) {
  const cs = getComputedStyle(el);
  return ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"].reduce((sum, k) => sum + (parseFloat(cs[k]) || 0), 0);
}

/** Natural width (px) of a button with an icon above a label, independent of its current layout. */
let measureContext = null;
function naturalButtonWidth(button) {
  const frame = horizontalFrame(button);
  const label = button.querySelector("span");
  let text = 0;
  if ( label ) {
    measureContext ??= document.createElement("canvas").getContext("2d");
    measureContext.font = getComputedStyle(label).font;
    text = measureContext.measureText(label.textContent).width;
  }
  const icon = button.querySelector("i")?.getBoundingClientRect().width ?? 0;
  return Math.ceil(Math.max(text, icon) + frame);
}

/** Tooltip direction per edge: away from the player, i.e. "up" in the seat's own orientation. */
const TOOLTIP_DIRECTIONS = { bottom: "UP", top: "DOWN", left: "RIGHT", right: "LEFT" };


/**
 * One seat at the table: a rotated container holding, from the player's edge inward, the pill (section bar, map tools
 * and options, player pill), notices and prompts, the initiative strip, and the open panel (quick actions, character,
 * dice, chat, journal or compendium; one at a time, as on the phone).
 */
export default class Seat {
  constructor(seat, config) {
    this.seat = seat;
    this.config = config;
    this.state = {
      // The open section panel (sectionList), or null; quick actions are open beside it when `quick` is true.
      panel: null,
      quick: false,
      sheetTab: "actions",
      // The quick actions' open tab (the core's quickTab).
      quickTab: "quick",
      initOpen: true,
      // Advantage / disadvantage for the next d20 roll from this seat (sheet, dice, prompts), as on the phone.
      advMode: "normal",
      hpMode: "damage",
      chatFilter: "all",
      // Expanded item descriptions, in Actions and Inventory (id -> enriched HTML).
      inv: { details: {} },
      // Effects toggled from the quick actions this session, kept in their list once enabled.
      toggledEffects: new Set()
    };
    // Quick actions left open, and the tabs last used, are remembered per seat (see #saveState).
    const saved = getSetting("seatPanels")?.[seat.key] ?? {};
    Object.assign(this.state, {
      quick: saved.quick === true,
      quickTab: sheet.quickTab(saved.quickTab),
      sheetTab: sheet.sheetTab(saved.sheetTab)
    });
    this.render = foundry.utils.debounce(this.#renderNow.bind(this), 50);
    this.element = this.#build();
    const body = name => this.element.querySelector(`[data-body="${name}"]`);
    this.compendium = new CompendiumPanel({
      render: () => this.renderCompendium(), root: () => body("compendium"), actor: () => this.actor
    });
    // The party's shared inventory (its own module, optional), drawn into this seat's Party panel.
    const party = body("party");
    this.party = party ? coreUI.sharedInventory()?.mount(party, { actor: () => this.actor, device: "table" }) : null;
    // A number pad for the number fields, since the table has only a shared mouse.
    this.keypad = new Keypad(this.element, Object.fromEntries(["pad", "clear", "back", "less", "more", "done"]
      .map(k => [k, game.i18n.localize(`AVTT.Keypad.${k}`)])));
    this.journal = new JournalPanel({ render: () => this.renderJournal(), root: () => body("journal") });
    // Automation prompts for this seat's character (see the core's prompts.mjs), one at a time above the pill.
    this.prompts = new PromptQueue(() => this.renderPrompt());
    // Dice panel (the core's): real dice when the Physical dice setting is on; a single d20 uses the Next roll choice.
    this.dice = new DicePanel({
      render: () => this.renderDice(),
      physicalAvailable: () => getSetting("physicalDice") !== "off",
      advMode: () => this.state.advMode,
      actor: () => this.actor,
      flavor: game.i18n.localize("AVTT.Utility.Dice.Flavor"),
      onRolled: usedAdvantage => usedAdvantage && this.#setAdvMode("normal")
    });
  }

  get actor() {
    return game.actors.get(this.config.actorId);
  }

  /* -------------------------------------------- */
  /*  DOM                                         */
  /* -------------------------------------------- */

  #build() {
    const el = document.createElement("section");
    el.className = `avtt-seat avtt-side-${this.seat.side}`;
    el.dataset.seat = this.seat.key;
    el.style.setProperty("--seat-color", this.config.color);
    // Text on the seat colour (active buttons, roll notices): dark or white, whichever reads better.
    el.style.setProperty("--seat-ink", coreUI.inkFor(this.config.color));
    el.style.setProperty("--seat-rotation", `${this.seat.rotation}deg`);
    // Foundry's tooltips inside this seat (buttons, chat cards) open toward the table centre and are turned to face
    // the player: the direction and class are read by core's TooltipManager from the nearest ancestor.
    el.dataset.tooltipDirection = TOOLTIP_DIRECTIONS[this.seat.side];
    el.dataset.tooltipClass = `avtt-tooltip avtt-tooltip-${this.seat.side}`;
    el.innerHTML = `
      <div class="avtt-turn-banner"></div>
      <div class="avtt-drawers">
        <div class="avtt-panel avtt-quick" data-panel="quick" hidden></div>
        <div class="avtt-panel avtt-sheet" data-panel="character" hidden></div>
        <div class="avtt-panel avtt-util-body" data-panel="dice" data-body="dice" hidden></div>
        <div class="avtt-panel avtt-util-body" data-panel="chat" data-body="chat" hidden><ol class="avtt-chat-log chat-log plain themed theme-dark"></ol></div>
        <div class="avtt-panel avtt-util-body" data-panel="journal" data-body="journal" hidden></div>
        <div class="avtt-panel avtt-util-body" data-panel="compendium" data-body="compendium" hidden></div>
        ${coreUI.sharedInventory() ? '<div class="avtt-panel avtt-util-body avtt-party" data-panel="party" data-body="party" hidden></div>' : ""}
      </div>
      <div class="avtt-initiative"></div>
      <section class="avtt-prompt" role="dialog" aria-live="assertive" hidden></section>
      <button type="button" class="avtt-notice" data-action="dismissNotice" hidden></button>
      <button type="button" class="avtt-notice-action" data-action="noticeAction" hidden></button>
      <div class="avtt-pill"></div>`;
    el.addEventListener("click", this.#onClick.bind(this));
    el.addEventListener("change", this.#onChange.bind(this));
    el.addEventListener("keydown", this.#onKeyDown.bind(this));
    el.addEventListener("input", this.#onInput.bind(this));
    // Compendium entries can be dragged onto sheets, the shared inventory or the map.
    el.addEventListener("dragstart", this.#onDragStart.bind(this));
    return el;
  }

  /** Position the seat's anchor on its screen edge. Called on build and on window resize. */
  layout() {
    const { innerWidth: W, innerHeight: H } = window;
    const { side, along } = this.seat;
    const horizontal = side === "top" || side === "bottom";
    const span = (horizontal ? W : H) / 3;
    const x = horizontal ? along * W : (side === "left" ? 0 : W);
    const y = horizontal ? (side === "top" ? 0 : H) : along * H;
    Object.assign(this.element.style, { left: `${x}px`, top: `${y}px`, width: `${span}px` });
    // Leave room for the seats on the perpendicular edges.
    this.element.style.setProperty("--seat-depth", `${(horizontal ? H : W) / 2}px`);
  }

  /** Screen-space anchor and inward direction, used to place windows opened from this seat. */
  get anchor() {
    const r = this.element.getBoundingClientRect();
    const { side } = this.seat;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    switch ( side ) {
      case "bottom": return { x: cx, y: window.innerHeight, nx: 0, ny: -1 };
      case "top": return { x: cx, y: 0, nx: 0, ny: 1 };
      case "left": return { x: 0, y: cy, nx: 1, ny: 0 };
      default: return { x: window.innerWidth, y: cy, nx: -1, ny: 0 };
    }
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async #renderNow() {
    const actor = this.actor;
    if ( !actor ) {
      this.element.querySelector(".avtt-pill").innerHTML =
        `<div class="avtt-pill-missing">${game.i18n.localize("AVTT.Pill.MissingActor")}</div>`;
      return;
    }
    // First draw: show the panels as remembered (quick actions may have been left open). Afterwards, character
    // data changed: the pill, and the open panels that show character data.
    const panels = this.#drawn ? [this.state.quick ? this.renderQuick() : null, (this.state.panel === "character") ? this.renderSheet() : null]
      : [this.renderPanel()];
    this.#drawn = true;
    await Promise.all([this.renderPill(), ...panels, this.renderInitiative(), this.renderPrompt()]);
  }

  /** Has the seat been drawn once (see #renderNow)? */
  #drawn = false;

  async renderPill() {
    const actor = this.actor;
    if ( !actor ) return;
    const html = await renderTemplate(tpl("pill"), {
      ...sys.getSummary(actor),
      playerName: this.config.playerName,
      isOwner: actor.isOwner,
      tool: currentTool(),
      iconOnly: getSetting("iconOnlyButtons"),
      state: this.state,
      // The character's favorites, a row of their own below the player pill (folds with the other rows).
      favorites: sys.getFavoriteActions(actor),
      canFavorite: sys.canFavorite(actor),
      sections: coreUI.sectionList().map(id => ({
        id, icon: coreUI.SECTION_ICONS[id], label: game.i18n.localize(`AVTT.Sections.${id}`), active: id === this.state.panel
      })),
      rollMode: (this.state.advMode === "normal") ? null : {
        // dnd5e: "adv" / "dis"; SotDL: boons ("boon2") or banes, shown green or red.
        id: this.state.advMode,
        tone: advModeTone(this.state.advMode),
        short: advModeShort({ adv: "AVTT.Pill.AdvShort.adv", dis: "AVTT.Pill.AdvShort.dis" }, this.state.advMode),
        label: sys.rollModeLabel(this.state.advMode) ?? game.i18n.localize(ADV_LABELS[this.state.advMode])
      }
    });
    this.element.querySelector(".avtt-pill").innerHTML = html;
    // Fold the map tools and sections away until the pointer comes near (see the CSS).
    this.element.classList.toggle("avtt-fold", getSetting("foldPill"));
    this.#applyCompact();
    this.onPillRendered?.();
  }

  /* -------------------------------------------- */
  /*  Pill width                                  */
  /* -------------------------------------------- */

  /** Hide the pill's button labels because its edge has no room for them (set by the overlay's fitting). */
  #compact = false;

  #applyCompact() {
    const row = this.element.querySelector(".avtt-pill-sections");
    if ( !row ) return;
    row.classList.toggle("compact", this.#compact);
    // Section buttons show a tooltip only while their labels are hidden (Icon-only setting or a narrowed pill).
    const hidden = this.#compact || !row.classList.contains("labeled");
    for ( const button of row.querySelectorAll("button") ) {
      if ( hidden ) button.dataset.tooltip = "";
      else delete button.dataset.tooltip;
    }
  }

  /**
   * Width (px) the pill needs to show each button row on one line: the map tools at their natural width, and the
   * sections all as wide as the widest labelled one (they share the row equally). The widest row plus the pill's
   * padding and border; never less than the pill's standard width.
   */
  measurePillNeed() {
    const pill = this.element.querySelector(".avtt-pill");
    const tools = pill?.querySelector(".avtt-pill-tools");
    const sections = pill?.querySelector(".avtt-pill-sections");
    if ( !tools || !sections ) return 0;
    // Rows of fixed-size icon buttons (map tools, favorites) at their natural width.
    const naturalWidth = row => {
      if ( !row ) return 0;
      row.style.width = "max-content";
      const width = row.offsetWidth;
      row.style.width = "";
      return width;
    };
    const toolsWidth = Math.max(naturalWidth(tools), naturalWidth(pill.querySelector(".avtt-pill-favorites")));
    sections.classList.remove("compact");
    // Each section button's natural width: its label (or icon) plus padding and borders. Measured from the text,
    // because the browser's natural width of these column-layout buttons follows their current width.
    const buttons = [...sections.querySelectorAll("button")];
    const widest = Math.max(0, ...buttons.map(b => naturalButtonWidth(b)));
    const gap = parseFloat(getComputedStyle(sections).columnGap) || 0;
    const sectionsWidth = (widest * buttons.length) + (gap * Math.max(buttons.length - 1, 0));
    const natural = Math.max(toolsWidth, sectionsWidth);
    this.#applyCompact();
    const frame = horizontalFrame(pill);
    const standard = 28 * (parseFloat(getComputedStyle(this.element).fontSize) || 14);
    return Math.ceil(Math.max(natural + frame, standard));
  }

  /** Height (px) of the pill, i.e. how far it reaches in from its edge, with its folded rows shown. */
  get pillDepth() {
    const pill = this.element.querySelector(".avtt-pill");
    const more = pill?.querySelector(".avtt-pill-more");
    if ( !more ) return pill?.offsetHeight ?? 0;
    return pill.offsetHeight - more.offsetHeight + more.firstElementChild.scrollHeight;
  }

  /**
   * Set the pill's width; labels are hidden only when it is narrower than it needs.
   * @param {number} width
   * @param {number} need
   */
  setPillWidth(width, need) {
    this.element.style.setProperty("--avtt-pill-width", `${width}px`);
    this.#compact = width < need - 1;
    this.#applyCompact();
  }

  /** Show the open panels (hide the others) and draw them. */
  async renderPanel() {
    const { panel: open, quick } = this.state;
    // The pill stays unfolded while a panel is open.
    this.element.classList.toggle("avtt-panel-open", !!open || quick);
    for ( const el of this.element.querySelectorAll(".avtt-drawers > .avtt-panel") ) {
      el.hidden = (el.dataset.panel === "quick") ? !quick : (el.dataset.panel !== open);
    }
    const drawn = [quick ? this.renderQuick() : null];
    switch ( open ) {
      case "character": drawn.push(this.renderSheet()); break;
      case "dice": drawn.push(this.renderDice()); break;
      case "chat": drawn.push(this.renderChat()); break;
      case "journal": drawn.push(this.renderJournal()); break;
      case "compendium": drawn.push(this.renderCompendium()); break;
      case "party": drawn.push(this.party?.render()); break;
    }
    await Promise.all(drawn);
  }

  /** Width (px) the open panels take along the edge (0 when none is open). */
  drawersWidth({ quick = this.state.quick, panel = this.state.panel } = {}) {
    const em = parseFloat(getComputedStyle(this.element).fontSize) || 14;
    let width = (quick ? PANEL_EM.quick : 0) * em;
    if ( panel ) {
      const panelWidth = (panel === "character") ? Math.max(this.#sheetWidth, PANEL_EM.character * em) : PANEL_EM.other * em;
      width += panelWidth + (quick ? PANEL_EM.gap * em : 0);
    }
    return width;
  }

  /** Is there room on the table to show quick actions next to this section panel? */
  fitsSideBySide(panel) {
    return this.drawersWidth({ quick: true, panel }) <= (this.freeSpan?.() ?? 0);
  }

  /** Close this seat's panels (all, or only quick actions). */
  closePanels({ quickOnly = false } = {}) {
    const s = this.state;
    if ( !s.quick && (quickOnly || !s.panel) ) return;
    s.quick = false;
    if ( !quickOnly ) s.panel = null;
    this.#saveState();
    return this.renderAllPanels();
  }

  /** Remember (on this screen) whether quick actions are open, and the quick actions and sheet tabs. */
  #saveState = foundry.utils.debounce(() => {
    const { quick, quickTab, sheetTab } = this.state;
    const all = foundry.utils.deepClone(getSetting("seatPanels") ?? {});
    all[this.seat.key] = { quick, quickTab, sheetTab };
    game.settings.set(MODULE_ID, "seatPanels", all);
  }, 300);

  /**
   * Open a panel, or close it if it is open. One section panel at a time; quick actions stay open next to it while
   * the table has room for both (see fitsSideBySide), otherwise opening one closes the other.
   */
  #togglePanel(panel) {
    if ( !panels().includes(panel) ) return;
    const s = this.state;
    let opened = false;
    if ( panel === "quick" ) {
      s.quick = !s.quick;
      opened = s.quick;
      if ( opened && s.panel && !this.fitsSideBySide(s.panel) ) s.panel = null;
    } else {
      s.panel = (s.panel === panel) ? null : panel;
      opened = !!s.panel;
      if ( opened && s.quick && !this.fitsSideBySide(panel) ) s.quick = false;
    }
    if ( opened ) this.onPanelOpened?.();
    this.#saveState();
    return this.renderAllPanels();
  }

  /** Quick actions (the phone's launcher): inspiration, rests, HP, concentration, exhaustion, conditions, effects. */
  async renderQuick() {
    const panel = this.element.querySelector(".avtt-quick");
    const actor = this.actor;
    if ( !this.state.quick || !actor ) return;
    // A typed amount survives data updates.
    const amount = panel.querySelector('input[name="hpAmount"]')?.value ?? "";
    const scroll = panel.querySelector(".avtt-quick-body")?.scrollTop ?? 0;
    const context = sheet.quickActionsContext(actor, {
      tab: this.state.quickTab, tabLabel: id => `AVTT.Quick.Tab.${id}`,
      toggled: this.state.toggledEffects, hpMode: this.state.hpMode, hpLabel: id => `AVTT.Quick.Hp.${id}`
    });
    const sameTab = this.#lastQuickTab === context.tab;
    this.#lastQuickTab = context.tab;
    panel.innerHTML = await renderTemplate(tpl("quick"), { ...context, state: this.state });
    const body = panel.querySelector(".avtt-quick-body");
    if ( body && sameTab ) body.scrollTop = scroll;
    const input = panel.querySelector('input[name="hpAmount"]');
    if ( input ) input.value = amount;
  }

  /** The automation prompt waiting for this seat's player, if any. */
  async renderPrompt() {
    const el = this.element.querySelector(".avtt-prompt");
    const prompt = this.prompts.current;
    el.hidden = !prompt;
    if ( !prompt ) return el.replaceChildren();
    el.className = `avtt-prompt avtt-prompt-${prompt.kind}`;
    el.innerHTML = await renderTemplate(tpl("prompt"), this.prompts.context(this.#advModes()));
  }

  /** The Normal / Advantage / Disadvantage choice for the next d20 roll (Dice panel and prompts). */
  #advModes() {
    return advModeChoices(ADV_LABELS, this.state.advMode);
  }

  async renderSheet() {
    const panel = this.element.querySelector(".avtt-sheet");
    const actor = this.actor;
    if ( (this.state.panel !== "character") || !actor ) return;
    // Only the latest render draws: an older one that finishes later (e.g. the Bio tab's enrichment) is dropped.
    const draw = ++this.#sheetDraw;
    const context = {
      ...sheet.sheetContext(actor, this.state.sheetTab, id => `AVTT.Sheet.Tab.${id}`),
      state: this.state,
      levelUp: sys.levelInfo(actor)
    };
    await sheet.enrichSheet(context, actor);
    const html = await renderTemplate(tpl("sheet"), context);
    if ( draw !== this.#sheetDraw ) return;
    const scroll = panel.querySelector(".avtt-sheet-body")?.scrollTop ?? 0;
    const sameTab = this.#lastSheetTab === context.tab;
    panel.innerHTML = html;
    this.#fitSheetWidth(panel);
    // Keep the list's scroll position across data updates (a new tab starts at the top).
    const body = panel.querySelector(".avtt-sheet-body");
    if ( body && sameTab ) body.scrollTop = scroll;
    this.#lastSheetTab = context.tab;
  }

  #lastSheetTab = null;
  #sheetDraw = 0;

  /** The character panel's width (px) once drawn: wide enough for all its tabs on one line. */
  #sheetWidth = 0;

  /**
   * Widen the character panel so its tab row fits on one line (labels differ per language and UI scale); never
   * narrower than the standard width (PANEL_EM.character).
   */
  #fitSheetWidth(panel) {
    const nav = panel.querySelector(".avtt-tabs");
    if ( !nav ) return;
    nav.style.width = "max-content";
    nav.style.flexWrap = "nowrap";
    // The exact (fractional) width: offsetWidth rounds, and half a pixel short wraps the last tab. The seat is
    // rotated, so the row's own width is its on-screen width, or its height for the left and right seats.
    const rect = nav.getBoundingClientRect();
    const sideways = Math.abs(this.seat.rotation) === 90;
    const need = Math.ceil((sideways ? rect.height : rect.width) + horizontalFrame(panel)) + 1;
    nav.style.width = nav.style.flexWrap = "";
    const em = parseFloat(getComputedStyle(this.element).fontSize) || 14;
    this.#sheetWidth = Math.max(need, PANEL_EM.character * em);
    panel.style.width = `${this.#sheetWidth}px`;
  }
  #lastQuickTab = null;

  async renderInitiative() {
    const el = this.element.querySelector(".avtt-initiative");
    const combat = game.combat;
    const actor = this.actor;
    const isTurn = !!combat?.started && !!actor && combat.combatant?.actor?.id === actor.id;
    this.element.classList.toggle("avtt-active-turn", isTurn && getSetting("turnIndicator"));
    this.element.querySelector(".avtt-turn-banner").textContent = isTurn
      ? game.i18n.format("AVTT.Turn.Banner", { name: this.config.playerName || actor.name })
      : "";

    if ( !combat ) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const turns = combat.turns.filter(c => c.visible).map(c => ({
      name: c.name,
      img: c.img ?? c.actor?.img,
      initiative: c.initiative ?? "–",
      current: c.id === combat.combatant?.id,
      mine: c.actor?.id === actor?.id,
      defeated: c.isDefeated
    }));
    el.innerHTML = await renderTemplate(tpl("initiative"), {
      round: combat.round,
      started: combat.started,
      turns,
      open: this.state.initOpen,
      // SotDL's default mode: a fast or slow turn instead of a roll.
      speed: sys.turnSpeed(actor),
      canRoll: !sys.turnSpeed(actor) && (sys.initiativeDue(actor, combat).length > 0),
      canEndTurn: isTurn
    });
  }

  /* -------------------------------------------- */
  /*  Chat                                        */
  /* -------------------------------------------- */

  /** The "Mine" filter shows only messages spoken as this seat's character. */
  get #chatActorId() {
    return sheet.chatActorId(this.state.chatFilter, this.actor);
  }

  async renderChat() {
    const log = this.element.querySelector(".avtt-chat-log");
    const { messages } = sheet.chatMessages({ actorId: this.#chatActorId, limit: getSetting("chatHistory") });
    const items = await Promise.all(messages.map(m => coreUI.renderMessage(m)));
    log.replaceChildren(...items.filter(Boolean));
    this.#chatHeader();
    log.scrollTop = log.scrollHeight;
  }

  /** The All / Mine filter above the log and the message box below it (built once, then kept). */
  #chatHeader() {
    const body = this.element.querySelector('[data-body="chat"]');
    let header = body.querySelector(".avtt-chat-filter");
    if ( !header ) {
      header = document.createElement("div");
      header.className = "avtt-chat-filter";
      body.prepend(header);
    }
    header.innerHTML = sheet.CHAT_FILTERS.map(f => `
      <button type="button" data-action="chatFilter" data-filter="${f}" class="${f === this.state.chatFilter ? "active" : ""}"
              aria-pressed="${f === this.state.chatFilter}">
        ${coreUI.escapeHTML(game.i18n.localize(`AVTT.Utility.Chat.${f}`))}
      </button>`).join("");
    if ( !body.querySelector(".avtt-chat-compose") ) {
      const compose = document.createElement("div");
      compose.className = "avtt-chat-compose";
      const placeholder = coreUI.escapeHTML(game.i18n.localize("AVTT.Utility.Chat.Placeholder"));
      compose.innerHTML = `
        <input type="text" name="chatText" maxlength="${sheet.MAX_CHAT_TEXT}" autocomplete="off" placeholder="${placeholder}" aria-label="${placeholder}">
        <button type="button" data-action="chatSend" data-tooltip="" aria-label="${coreUI.escapeHTML(game.i18n.localize("AVTT.Utility.Chat.Send"))}">
          <i class="fa-solid fa-paper-plane" inert></i>
        </button>`;
      body.append(compose);
    }
  }

  /** Send the message box's text as this seat's character. Enter and the Send button share one guard. */
  #sendChat = coreUI.exclusive(async () => {
    const input = this.element.querySelector('input[name="chatText"]');
    try {
      if ( await sheet.sendChat(input?.value, this.actor) ) input.value = "";
    } catch(err) {
      ui.notifications.error(err.message);
    }
  });

  /** Incremental update from chat hooks, so that open chat panels don't fully re-render on every roll. */
  async onChatMessage(message, action) {
    if ( this.state.panel !== "chat" ) return;
    const log = this.element.querySelector(".avtt-chat-log");
    const result = await coreUI.syncMessage(log, message, action, sheet.chatShows(message, this.#chatActorId));
    if ( result !== "added" ) return;
    const limit = getSetting("chatHistory");
    while ( log.children.length > limit ) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  /* -------------------------------------------- */
  /*  Dice                                        */
  /* -------------------------------------------- */

  async renderDice() {
    const body = this.element.querySelector('[data-body="dice"]');
    const html = await renderTemplate(tpl("dice"), { ...this.dice.context(), advModes: this.#advModes(), advScale: advModeScale() });
    // Keep the scrolled position of the choices while dice are added or removed.
    const scroll = body.querySelector(".avtt-dice-scroll")?.scrollTop ?? 0;
    body.innerHTML = html;
    const scroller = body.querySelector(".avtt-dice-scroll");
    if ( scroller ) scroller.scrollTop = scroll;
  }

  /* -------------------------------------------- */
  /*  Compendium                                  */
  /* -------------------------------------------- */

  async renderCompendium() {
    const body = this.element.querySelector('[data-body="compendium"]');
    body.innerHTML = await renderTemplate(tpl("compendium"), await this.compendium.context());
  }

  /* -------------------------------------------- */
  /*  Journal                                     */
  /* -------------------------------------------- */

  async renderJournal() {
    const body = this.element.querySelector('[data-body="journal"]');
    body.innerHTML = await renderTemplate(tpl("journal"), await this.journal.context());
  }

  /** Called when the GM shares something: refresh an open journal list. */
  onJournalShared() {
    if ( (this.state.panel === "journal") && this.journal.showsList ) this.renderJournal();
  }

  /* -------------------------------------------- */
  /*  Inventory                                   */
  /* -------------------------------------------- */

  async #toggleDetails(itemId) {
    await sheet.toggleItemDetails(this.state.inv.details, this.actor, itemId,
      game.i18n.localize("AVTT.Inventory.NoDescription"), "avtt-muted");
    // Action rows show in the sheet and in quick actions.
    return Promise.all([this.renderSheet(), this.renderQuick()]);
  }

  /* -------------------------------------------- */
  /*  Events                                      */
  /* -------------------------------------------- */

  async #onClick(event) {
    const target = event.target.closest("[data-action]");
    if ( !target || !this.element.contains(target) ) return;
    if ( coreUI.handleMessageClick(event, target, ".avtt-chat-log") ) return;
    event.preventDefault();
    return coreUI.runAction(target, BUSY_ACTIONS, () => this.#dispatch(target.dataset.action, target), `${MODULE_ID} | Seat action`);
  }

  /** Run one action of this seat (buttons with data-action). */
  async #dispatch(action, target) {
    if ( CompendiumPanel.ACTIONS.has(action) ) return this.compendium.handle(action, target);
    if ( JournalPanel.ACTIONS.has(action) ) return this.journal.handle(action, target);
    if ( DicePanel.ACTIONS.has(action) ) return this.dice.handle(action, target.dataset);
    // SotDL: an attribute asks for boons or banes first (per-browser setting), in a prompt preset to the Next roll.
    if ( (action === "rollAbility") && getSetting("askBoons") && askAbilityRoll(this.prompts, this.actor, target.dataset.ability) ) return;
    if ( sheet.D20_ACTIONS.has(action) ) return this.#d20(mode => sheet.runSheetAction(this.actor, action, target.dataset, mode));
    if ( sheet.SHEET_ACTIONS.has(action) ) {
      return sheet.runSheetAction(this.actor, action, target.dataset, "normal", { toggled: this.state.toggledEffects });
    }
    const actor = this.actor;
    const s = this.state;
    switch ( action ) {
      // Pill
      case "togglePanel": return this.#togglePanel(target.dataset.panel);
      case "focusToken": return this.#focusToken();
      case "zoom": return zoom(Math.sign(Number(target.dataset.direction)));
      case "resetZoom": return resetZoom();
      case "openSettings": return TableSettingsConfig.toggle(this.seat.key);
      // Map tools are shared by all seats; every pill's buttons are updated through onToolChange.
      case "tool": {
        const tool = target.dataset.tool;
        // Ruler and Target toggle back to Select.
        if ( ["ruler", "target"].includes(tool) ) return toggleTool(tool);
        if ( ["select", "hand"].includes(tool) ) return setTool(tool);
        return;
      }
      case "dismissNotice": return this.hideNotice();
      case "noticeAction": {
        const run = coreUI.takeNoticeAction(target);
        this.hideNotice();
        return run?.();
      }
      case "promptChoice": return this.prompts.choose(target.dataset.index, roll => this.#d20(roll));
      case "promptLater": return this.prompts.dismiss();
      case "advMode": return this.#setAdvMode(target.dataset.mode);

      // Sheet
      case "sheetTab":
        s.sheetTab = sheet.sheetTab(target.dataset.tab);
        this.#saveState();
        return this.renderSheet();
      case "quickTab":
        s.quickTab = sheet.quickTab(target.dataset.tab);
        this.#saveState();
        return this.renderQuick();
      // SotDL rolls straight away with the Next roll's boons or banes; dnd5e asks in its own windows.
      case "useItem":
        if ( sys.FEATURES.itemRollMode ) return this.#d20(mode => sys.useItem(actor, target.dataset.itemId, mode));
        return sys.useItem(actor, target.dataset.itemId);
      case "turnSpeed": return sys.setTurnSpeed(actor, target.dataset.fast === "true");
      case "hpMode": return this.#setHpMode(target.dataset.mode);
      case "applyHp": return this.#applyHp();

      // Chat
      case "chatFilter": if ( sheet.CHAT_FILTERS.includes(target.dataset.filter) ) s.chatFilter = target.dataset.filter; return this.renderChat();
      case "chatSend": return this.#sendChat();

      // Inventory
      // The character's configured sheet (dnd5e's, or another sheet module's), turned toward this seat.
      case "openFullSheet": return actor?.sheet.render({ force: true });
      // Hero Mancer's level-up window if it is active, otherwise the character's sheet (dnd5e's class level selector).
      case "levelUp": return sys.openLevelUp(actor);
      case "invDetails": return this.#toggleDetails(target.dataset.itemId);

      // Initiative
      case "toggleInitiative": s.initOpen = !s.initOpen; return this.renderInitiative();
      case "endTurn": return game.combat?.nextTurn();
    }
  }

  #onChange(event) {
    const { name, value } = event.target;
    if ( name === "hpAmount" ) event.target.value = sys.hpAmount(value) || "";
    sheet.onSheetChange(this.actor, name, value);
  }

  /** Dragging a compendium entry: the drag data Foundry's sheets and the map expect. */
  #onDragStart(event) {
    const entry = event.target.closest?.('[data-action="compOpen"][data-uuid]');
    if ( !entry ) return;
    const type = foundry.utils.parseUuid(entry.dataset.uuid)?.type ?? "Item";
    event.dataTransfer.setData("text/plain", JSON.stringify({ type, uuid: entry.dataset.uuid }));
  }

  #onInput(event) {
    if ( event.target.name === "compQuery" ) this.compendium.onInput(event.target.value);
    if ( event.target.name === "journalQuery" ) this.journal.onInput(event.target.value);
  }

  #onKeyDown(event) {
    if ( event.key !== "Enter" ) return;
    if ( event.target.name === "compQuery" ) {
      event.preventDefault();
      this.compendium.search();
    }
    if ( event.target.name === "hpAmount" ) {
      event.preventDefault();
      this.#applyHp();
    }
    if ( event.target.name === "chatText" ) {
      event.preventDefault();
      this.#sendChat();
    }
  }

  async renderAllPanels() {
    await Promise.all([this.renderPill(), this.renderPanel()]);
  }

  /** Arm (or clear) advantage / disadvantage for the next d20 roll; shown as a chip on the player pill. */
  #setAdvMode(mode) {
    if ( !advModes().includes(mode) ) return;
    this.state.advMode = mode;
    return Promise.all([this.renderPill(), (this.state.panel === "dice") ? this.renderDice() : null, this.renderPrompt()]);
  }

  /** Run a d20 roll with the armed advantage choice, then reset it so it doesn't carry over to the next roll. */
  async #d20(roll) {
    await roll(this.state.advMode);
    if ( this.state.advMode !== "normal" ) this.#setAdvMode("normal");
  }

  /** Switch between damage, heal and temp HP without re-rendering, so a typed amount is kept. */
  #setHpMode(mode) {
    if ( !sys.HP_MODES.includes(mode) ) return;
    this.state.hpMode = mode;
    coreUI.markChoice(this.element, "hpMode", "mode", mode);
  }

  /** Enter and the Apply button share one guard, so an amount isn't applied twice. */
  #applyHp = coreUI.exclusive(async () => {
    const input = this.element.querySelector('input[name="hpAmount"]');
    const amount = sys.hpAmount(input?.value);
    if ( !amount ) return;
    await sys.applyHpChange(this.actor, this.state.hpMode, amount);
    if ( input ) input.value = "";
  });

  /* -------------------------------------------- */
  /*  Notices                                     */
  /* -------------------------------------------- */

  #noticeTimer;

  /**
   * A short notice just above the pill, facing this seat's player: a warning before an action (e.g. no target), or
   * the result of a damage or healing roll. Clicking it dismisses it; it also goes away by itself.
   * @param {object} notice
   * @param {"warning"|"damage"|"healing"} notice.kind
   * @param {string} notice.text      Main line.
   * @param {string} [notice.detail]  Smaller second line.
   * @param {{label: string, run: Function}} [notice.action]  A button under the notice (e.g. Roll damage); using it
   *   closes the notice.
   * Drawn by the core's fillNotice, with the classes avtt-notice-warning / avtt-notice-damage / avtt-notice-healing,
   * avtt-notice-text, avtt-notice-detail and avtt-notice-close; the button is drawn by the core's fillNoticeAction.
   */
  showNotice(notice) {
    const el = this.element.querySelector(".avtt-notice");
    coreUI.fillNotice(el, "avtt-notice", notice, game.i18n.localize("AVTT.Notice.Dismiss"));
    coreUI.fillNoticeAction(this.element.querySelector(".avtt-notice-action"), notice.action);
    window.clearTimeout(this.#noticeTimer);
    const ms = notice.action ? NOTICE_ACTION_MS : (notice.kind === "warning") ? NOTICE_WARNING_MS : NOTICE_RESULT_MS;
    this.#noticeTimer = window.setTimeout(() => this.hideNotice(), ms);
  }

  hideNotice() {
    window.clearTimeout(this.#noticeTimer);
    for ( const el of this.element.querySelectorAll(".avtt-notice, .avtt-notice-action") ) el.hidden = true;
  }

  /** Mark the active map tool on this seat's pill without re-rendering it. */
  refreshTools() {
    const tool = currentTool();
    for ( const b of this.element.querySelectorAll('[data-action="tool"]') ) {
      const active = b.dataset.tool === tool;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    }
  }

  #focusToken() {
    const token = this.actor?.getActiveTokens()[0];
    if ( !token ) return ui.notifications.warn("AVTT.Pill.NoToken", { localize: true });
    token.control({ releaseOthers: true });
    return canvas.animatePan({ x: token.center.x, y: token.center.y });
  }
}
