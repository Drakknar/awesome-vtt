# Awesome VTT – In-Person Table Mode

A Foundry VTT module for playing in person around a screen under a glass table. One browser, logged in as a dedicated "table" user, shows a panel for each seated player. Each panel is rotated to face that player.

- **Targets:** Foundry VTT v14 and dnd5e 6.0.x (built against 6.0.5).
- **Input:** a shared mouse or trackpad. It is not designed for touch.

## Features

Each occupied seat shows:

- **Pill**, laid out like the phone app, in three rows divided by separators (from the player's edge inward):
  - **Sections:** **Character**, **Dice**, **Chat**, **Journal** and **Compendium** (plus **Party** with the [Shared Inventory](../awesome-vtt-shared-inventory) module), the same sections as the phone's tab bar. Each button opens its own panel above the pill; pressing it again closes it. One section panel is open at a time per seat; Quick actions can stay open next to it when there is room (see below). With **Close other seats' panels** (per-browser setting, off by default), opening a panel in one seat closes the panels open in the other seats.
  - **Favorites** (first row below the player pill, shown when the pill unfolds): the character's dnd5e favorites, up to eight, as icon buttons; click one to use it. Rows in the Actions, Spells and Inventory tabs have a ☆ star to add or remove a favorite (the same favorites as dnd5e's own sheet). Until there are any, the row shows a short hint.
  - **Map tools and options** (always icons only): **Select**, **Hand**, **Target**, **Ruler**, **Zoom in**, **Reset zoom** (back to 100%, within the scene's zoom limits), **Zoom out** and **My token** (centers on the player's token), then the **Settings** gear at the end. Select, Target and Ruler are Foundry's own token tools, with the toolbar's icons. With Target on, clicking a token targets it (Shift-click adds more); press Target again to return to Select. Foundry v14 has no hand tool (it pans with right-drag or Ctrl + arrow keys), so Hand mode is the module's own: while it's on, a left-drag on the map pans it and doesn't select or move tokens. That's easier than right-drag on a trackpad.
  - **Player pill:** portrait, HP bar, AC, initiative bonus, speed, inspiration and active conditions (each names itself in a tooltip on hover),  two round buttons: **Full sheet** (opens the character's configured sheet, turned toward the seat) and **Quick actions** (bolt), and an **ADV** / **DIS** chip while advantage or disadvantage is armed for the next roll (click it to open the Dice panel).

  Each row stays on one line. Each pill is made just wide enough to show its rows, section labels included, and may extend past its third of the edge into free space. Only when the pills on one edge of the table can't all fit (for example, three occupied seats on the short side of the screen) are they narrowed, all to the same width, and then the section buttons show icons only. Corners are kept clear for the neighbouring edge's pills. By default each pill is folded: only the character row shows, with a small handle at its bottom edge. When the pointer comes near the pill, the map tools and section buttons open below the character row. They stay open while the pointer is over any of that seat's controls or while one of its panels is open, and fold again shortly after the pointer leaves. Turn off **Fold pill rows** (a per-browser setting) to always show them. The section buttons show their names by default; turn on **Icon-only pill buttons** (a per-browser setting) to hide them. Every button without a visible name shows Foundry's own tooltip on hover, opening toward the table centre and turned to face that seat's player. This also covers dnd5e's own tooltips (rich item tooltips, content links in descriptions) and tooltips in windows turned toward a seat, such as the full character sheet. The gear button opens Foundry's settings window on this module's section. The window appears in the middle of the screen, turned toward that seat, and can't be dragged. Pressing the gear again closes it. The table user is a player, so only per-browser settings (e.g. Table UI scale, Idle panel opacity) are shown. World settings stay GM-only.
- **Level up** (character panel, at the right of the name and level; D&D 5e only; shown while the character is below dnd5e's maximum level; it glows gold when the character has enough XP): opens **Hero Mancer**'s level-up window when that module is active, otherwise the character's sheet, where dnd5e levels up from the class level selector. The module has no levelling logic of its own.
- **Advantage, as on the phone:** one **Next roll** choice per seat (Normal / Advantage / Disadvantage, in the Dice panel and in prompts) applies to the next d20 roll from that seat, whether from the sheet, the dice pool or a prompt, and then resets.
- **Quick actions** panel (the bolt on the player pill, the same as the phone's), in three tabs:
  - **Quick actions:** only the character's **actions** (the same rows as the sheet's Actions tab).
  - **Damage & effects:** death saves at 0 HP, inspiration, common conditions (prone, dodging, hiding, invisible), the HP field (**Damage / Heal / Temp** and Apply; Enter also applies; temporary HP is kept only if higher, per the rules), concentration (with End), exhaustion level −/+, and the character's toggleable effects.
  - **Rest:** short and long rest.

   When the table has room along that edge (up to the neighbouring seats' open panels), Quick actions stays open next to the other open panel; otherwise opening one closes the other. Each seat remembers on this screen whether Quick actions was left open and which Quick actions and Character tabs were last used, also after a reload.
- **Character** panel, the compact sheet, wide enough to show all six tabs on one line, in this order:
  - **Actions:** favorites, equipped weapons, spells that can be cast now (cantrips, prepared spells, and spells that don't need preparing) by level with slots, features and consumables. Slots left and item uses left have − / + buttons, to undo an accidental use. The ⓘ button on each row shows what the action does (the item's description) under it; press it again to hide it.
  - **Skills.**
  - **Spells:** every spell the character has, by level with slots: cast it (when it can be cast now), prepare or unprepare it (book button; always-prepared spells show a pin), C / R marks for concentration and ritual, uses −/+, and its description.
  - **Abilities:** checks and saves.
  - **Inventory:** editable currency, carrying weight and attunement. Carried items are grouped by type, with container contents nested. Each item has quantity −/+, equip and attune toggles, **Give to the party** (with the Shared Inventory module), a Use button, and its description (tap the name). Unidentified items show only what dnd5e lets the player see.
  - **Status:** all conditions. Inspiration, rests, death saves and the HP field are in Quick actions, as on the phone.
- **Chat, Dice, Journal and Compendium** panels:
  - **Chat:** **All / Mine** shows everyone's messages, or only this character's. dnd5e card buttons such as Attack and Damage work inside the panel. A message box below the log (needs a keyboard) sends as the seat's character, through Foundry's chat, so commands such as `/r 1d20` work; Enter also sends.
  - **Dice:** the **Next roll** choice, and a click-to-build dice pool with a modifier (a single d20 uses the Next roll choice). When Physical dice is on, a **Real dice / Foundry rolls** toggle picks whether **Enter results** opens the dice entry window or Foundry rolls straight away. The choice is kept per seat.
  - **Number fields** (HP amount, coins, …): clicking one opens a number pad as its own panel beside the seat's open panels, titled with the field's name, with digits, Clear, ⌫, − / + (hold to repeat faster) and OK, so no keyboard is needed. Keyboard typing still works.
  - **Compendium:** with an empty search box, a browser of every Item and Journal compendium the user can see, grouped by where it comes from (its sidebar folder, the system, a module or the world). Open a compendium to go through its folders and entries, with a breadcrumb back and "Show more" for long lists. Typing searches all of them live, from 2 characters on, and a Clear button returns to browsing. Tap an entry for an inline preview. Entries can also be dragged onto sheets, the Party panel or the map.
  - **Journal:** the journals the table user can view, with a filter. Pages show inline: text, images and captions. Other page types (PDF, video) open in the full journal. **Recently shared** lists what the GM showed to players (entries, pages and images), so a handout can be reopened at any seat.
- **Checks before an action** (per-browser setting, on by default): when an action needs something that's missing, it stops before any dialog opens and says so in that seat:
  - **No target:** attacks, saving-throw actions without an area, and actions aimed at specific creatures (e.g. a healing spell on an ally) need a targeted token. Areas are placed on the map after use, so they don't.
  - **No spell slot** of the spell's level or higher (pact slots included).
  - **No uses left** on the item or the action, for fixed costs. Other resources (actions, hit dice, materials, costs with dice) are left to dnd5e's own check.
- **Follow-up rolls** (per-browser setting, on by default): every attack roll is followed by its damage roll (hit or miss, with critical damage on a critical hit, same attack mode and ammunition, without dnd5e's damage dialog); after a saving-throw action with damage, its damage is rolled; after a utility action with a formula, the formula is rolled. dnd5e otherwise leaves these on a chat-card button. Damage and healing actions already roll by themselves.
- **Roll results** (per-browser setting "Show roll results", on by default): after each roll made at the table (checks, saves, attacks, initiative, damage, healing, the dice pool), the result shows in the seat of the character who rolled it, just above the pill, with the character's name in small type. Results other than damage and healing use the seat's colour, with dark or white text, whichever reads better. Damage and healing totals are split by type when there are several; other rolls show what was rolled, "Critical" or "Fumble" on a natural 20 or 1, **Pass** or **Fail** when a check or save has a DC, and **Hit** or **Miss** for an attack against targets with a known AC ("2 hit, 1 missed" for several). The DC and AC themselves are never shown. Because everyone at the table can read the screen, pass or fail follows dnd5e's *challenge visibility* setting as it does for other players: shown for "All" and "Player" (the default), hidden for "None". Hit or miss shows only when dnd5e's *attack roll visibility* isn't "None" (its default). It shows for real and Foundry dice alike, and for rolls from the chat card. With Dice So Nice, it appears when the dice stop. Blind rolls are not shown. Click it to dismiss. The total is the roll's, before the target's resistances or immunities. An attack, a spell or another action that didn't miss (it hit, or there was no target to tell) gets a **Roll damage** button under its result, unless its damage is already rolled after the attack; click it to roll the damage, whose total then shows in the seat. A result with this button stays up for 30 seconds.
- **Busy buttons:** buttons that send something to Foundry (rolls, uses, HP, conditions, rests, inventory changes) are disabled until it's done, so a double click doesn't count twice.
- **Automation prompts** (per-browser settings, each off by default, the same as the phone's): death saves at the start of the character's turn at 0 HP, concentration checks, saving throws targeting the character, GM requests, and initiative. A prompt appears in the character's seat, above the pill, with Normal / Advantage / Disadvantage for d20 rolls; several are shown one after another, and ✕ skips one. When the player also has the phone module, answering or skipping on one device closes the prompt on the other.
- **Initiative strip:** the turn order, the round number, a "Roll initiative" button when this character hasn't rolled (it rolls without dnd5e's dialog, with the Next roll choice (Normal / Advantage / Disadvantage) on top of the character's own modifiers, for that character's tokens still without initiative, the same as on the phone), and an "End turn" button on this character's turn.
- **Your-turn indicator:** a banner, a glowing pill and a colored edge bar on the active player's seat.

Across the whole table:

- **Window rotation:** windows opened from a seat, such as roll dialogs, spell-slot dialogs, rest dialogs and journals, are rotated and moved toward that seat.
- **Optional hiding of the standard Foundry UI:** the sidebar, hotbar, player list, scene navigation, scene controls and chat pop-ups. They are hidden with CSS only. They take no space and can't be clicked, but they keep working in the background. The pill's Ruler button and the R key still work, for example. "Keep scene controls visible" brings the toolbar back if you want it.
- **Keep the screen on:** stops the table screen from dimming or sleeping (per-browser setting, on by default; needs HTTPS).
- **Idle transparency:** pills and the initiative strip fade while the mouse isn't over them, so the map stays visible. Set the level with **Idle pill opacity** (per browser). Open panels are always fully opaque, on a solid background, so they stay readable while a player uses them.
- **Physical dice (optional):** roll real dice and record the results in Foundry. See below.
- **Seated characters always on the map:** their tokens are always shown on the table screen, and each one's vision counts even while another token is selected. Core otherwise shows a token only where a selected token can see it, so characters far from each other disappeared. Tokens hidden by the GM stay hidden.
- **Map tools:** right-drag panning and mouse-wheel zoom work as normal, and the pill's Hand mode adds left-drag panning. The ruler toggles with the R key or the pill's Ruler button. Press the button again to return to the Select tool. The tools are shared by all seats, so every pill shows which one is active.

## Shadow of the Demon Lord

The table also runs in **Shadow of the Demon Lord** worlds (system `demonlord` 6.1.x), with the same seats and panels showing SotDL's rules:

- **Pill:** health left (the system counts damage taken), Defense, Perception, Speed and Healing rate, and a star while the character has Fortune.
- **Next roll:** boons or banes, from 3 banes to 3 boons (−3 … +3), instead of advantage; it applies to the next challenge roll, attack, spell or talent from the seat, then resets.
- **Sheet:** Actions (weapons in hand, talents, spells, usable gear), Spells (by tradition and rank, with castings left), Abilities (the five attributes, rolled as challenges), Inventory (gc, ss, cp, bits; worn items) and Status (afflictions). No Skills tab.
- **Using things** rolls straight away with the Next roll, without the system's dialog: spells spend a casting, talents a use, weapons their ammunition (one attack per target), consumables one of their quantity. Afflictions that make an action fail stop it with the system's warning.
- **Quick actions:** Fortune, action statuses (Defend, Concentrate, Prone, Help, Prepare), damage / healing, insanity and corruption − / +, effects, and Rest (8 hours or a full day, through the system's rest).
- **Initiative strip:** **Fast** / **Slow** choose the turn and set the initiative (default mode); the optional modes roll without a dialog.
- **Roll results** in the seat: totals, success / failure of challenges, hit / miss of attacks, damage totals, and the spell's name for a spell cast without an attack roll.
- **Damage:** not rolled automatically. An attack, spell, talent or item that didn't miss (or had no target) and has damage gets **Roll damage** under its result: it clicks the card's damage buttons for you (the system's own damage roll, including extra damage types and the 20+ extra damage when the card offers them), and the result shows the total.
- **Prompts:** GM challenge requests (the GM's challenge button on a card whispers a "make a challenge roll" card; the seat offers the roll, with the card's boons plus the Next roll) and, at the start of an encounter, Fast / Slow turn.
- **Favorites:** stars in the sheet, the favorites row on the pill (kept on the character, as the system has none).
- **Party:** with the Shared Inventory module, a Party actor the GM creates or chooses (see that module).

## Setup

1. Copy or symlink this folder and [`awesome-vtt-core`](../awesome-vtt-core) (the shared library it requires) to `<Foundry user data>/Data/modules/`, then enable **Awesome VTT** in your world. Foundry asks to enable the core library with it.
2. As GM, create a normal **Player** user, for example "Table".
3. Open **Game Settings → Configure Settings → Awesome VTT → Configure Seats**.
   1. Pick the table user.
   2. Assign a character to each occupied seat. Player names and colors are optional.
   3. Save.

   Saving gives the table user Owner permission on the seated characters. Clearing a seat, or changing the table user, restores the permission level those characters had before.
4. On the table computer, log in as the table user and press F11. Don't assign a character to the table user. Foundry would treat it as the table user's default actor, so one seat would be favored. Foundry normally opens User Configuration on every load for a player without a character. The module closes that window automatically on the table screen.
5. Adjust **Table UI scale** in that browser. It is a per-browser (client) setting.

**Players choose their own seats:** every user can open **Configure Settings → Awesome VTT → Choose your seat** and pick a seat for each character they own. On the table screen, the table user opens it from a seat's gear, and it lists all seated characters. Picking a taken seat swaps the two characters. A character that isn't seated yet can only take a free seat. Players' choices are saved by the GM's client, so a GM must be logged in. The GM's **Configure Seats** still sets the table user, player names and colours.

Seat positions follow the screen's default orientation, meaning the way the OS draws the desktop. For example, "Left top" is the upper seat on the left edge of the screen.

## Physical dice

The module registers a dice fulfillment method, **Physical dice (Awesome VTT)**, using Foundry's standard dice configuration API. When a roll needs dice, Foundry waits for the results. Once they're entered, Foundry and dnd5e carry on as with a digital roll: modifiers, advantage, critical hits, chat cards and damage all work as usual.

Choose who enters the results with the world setting **Physical dice**:

| Choice | What happens |
|---|---|
| Off | Foundry rolls every die (default). |
| The player enters the results | An entry window opens, turned toward the seat that rolled. Click the faces rolled, then **Confirm**. |
| The GM enters the results | The GM gets an entry window naming the character and the formula. The results are sent back and the roll finishes by itself. The GM can also choose **Let Foundry roll**. If no GM is logged in, the player enters them instead. |
| The player or the GM | Both windows open. The first entry counts, and the other window closes. |

Details:

- **Keypad:** dice up to d20 get one button per face. d100 gets a tens/units pad (00 + 0 = 100). Other dice are typed.
- **Rerolls and extra dice** (e.g. Halfling Luck, exploding dice) ask for one more die in the same window.
- **Empty dice** are rolled by Foundry when you confirm, so you can mix real and digital dice (e.g. "Let Foundry roll instead").
- **Table screen:** the module selects Physical dice as the default method on the table screen when the setting is on. It removes it when the setting is turned off. Per-die choices made in **Configure Dice** on that screen still take priority.
- **GM's own rolls** stay digital. The module never changes the GM's dice configuration. The "GM enters the results" choices only affect rolls made at the table. A GM who wants physical dice for their own rolls can pick the method in their own Configure Dice.
- **Other users** (e.g. a player on a phone) can opt in by picking Physical dice (Awesome VTT) in their own **Configure Dice**.
- **Dice So Nice (optional):** turn on **3D dice for Foundry-rolled dice** to animate dice that Foundry rolls in place of real ones ("Let Foundry roll", or dice left empty) as 3D dice. Dice entered by hand follow Dice So Nice's own "Disabled for manually entered rolls" setting: by default they aren't animated again. With Physical dice off, rolls are ordinary digital rolls and Dice So Nice animates them as usual, whatever this option says.
  - How it works: Foundry-rolled dice are labelled with core's digital method on the finished roll, and hand-entered results get Dice So Nice's `hidden` flag. In a term with both kinds (e.g. one real and one Foundry d20 for advantage), the chat tooltip then no longer shows the physical-dice icon for that term.
- **Blind rolls and some automatic system rolls** are always rolled by Foundry. This is core behavior.
- **Only one interactive method:** if a client has another interactive dice method configured (e.g. a Bluetooth dice module), Foundry falls back to its standard entry window.
- **GM relay:** the GM relay uses the module's socket. Each side checks that messages come from an expected user and that values fit the die. This is meant to prevent mistakes, not tampering by a logged-in player.

## Permissions and privacy

- **Owner access only.** The table user needs Owner permission on seated characters, and nothing more. It never needs GM rights, so hidden tokens, GM-only rolls and GM whispers stay hidden from the table.
- **Rolls show the character's name.** Rolls made from a seat are posted by the table user, with the seat's character as the speaker.
- **Shared screen.** Everything on the table screen is visible to everyone sitting around it. Whispers to the table user are therefore not private.
- **Private messages via phones (optional).** A player can also log in as their own Foundry user on a phone to get private whispers and secret information. This needs nothing from this module.

## Known limits and things to check on first run

These parts are based on the v14 API docs and the dnd5e 6.0.5 source, but have **not yet been tested in a running v14 world**:

- **Ruler button:** it toggles the core `ruler` tool of the token controls. If the tool isn't found, it shows a reminder to press R. The button's highlight only updates when the button is used, not when R is pressed.
- **Rotated windows can be dragged,** but the drag follows screen directions. On the top seat, for example, dragging feels mirrored.
- **Tooltips inside a seat** (its buttons, and dnd5e chat cards in its chat panel) are Foundry's own and turn toward that seat's player. Tooltips inside windows opened from a seat (e.g. a roll dialog) and **right-click menus** are not rotated.
- **Stacking:** the overlay sits at `z-index: 50`, meant to be above the canvas and below application windows. Adjust this in `styles/awesome-vtt.css` if dialogs appear behind panels.
- **Corner overlap:** open panels on corner seats (e.g. "Bottom left" and "Left bottom") can overlap. The seat you last clicked is drawn on top.
- **Pill height:** the pill has three rows, so it reaches further into the table than a one-row pill; panels get the remaining depth.

## Structure

```
module.json
scripts/
  main.mjs              hooks and startup (table client only)
  constants.mjs         seat definitions and rotations
  settings.mjs          world/client settings and the seat editor menu
  ownership.mjs         grants/reverts Owner permission for the table user (GM side)
  apps/seat-editor.mjs  GM seat editor (ApplicationV2)
  table/overlay.mjs     overlay, core UI hiding, window rotation
  table/seat.mjs        one seat: pill, panels (quick actions, sections), prompts, notices, initiative
  table/canvas-tools.mjs map tools: select, target, hand (pan), ruler, zoom
  table/visibility.mjs  seated characters' tokens always shown, their vision always counted
  table/tooltips.mjs    Foundry / dnd5e tooltips turned toward the seat's player
  table/keypad.mjs      number pad for number fields
  table/fit.mjs          shares each table edge between its pills
  table/use-checks.mjs  checks before an action, follow-up rolls, damage/healing notices
  apps/table-settings.mjs the settings window opened from a seat
  dice/fulfillment.mjs  registers the Physical dice method, GM relay socket, table dice config
  dice/table-resolver.mjs entry window for the roller (extends core RollResolver)
  dice/gm-entry.mjs     entry window on the GM side
  dice/pad.mjs          shared keypad logic
  dice/socket.mjs       socket channel helper
templates/              Handlebars templates (pill, quick actions, sheet, dice, prompt, …)
styles/awesome-vtt.css
lang/en.json
```

The dnd5e data and rolls, journals, compendium browsing and keep-screen-on code live in [`awesome-vtt-core`](../awesome-vtt-core), shared with the phone module. Adding another game system means writing a new adapter there with the same exports as its `scripts/dnd5e.mjs`.
