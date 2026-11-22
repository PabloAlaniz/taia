---
name: TAIA
description: A multi-agent task board laid out as flight-strip bays, where agents and people are equal participants.
colors:
  background: "#e7ebee"
  background-dark: "#111519"
  card: "#f4f6f8"
  card-dark: "#1a1f24"
  strip: "#dde3e8"
  strip-dark: "#343d46"
  strip-done: "#cdd3d8"
  strip-done-dark: "#2a323a"
  border: "#c3cbd2"
  border-dark: "#46515c"
  foreground: "#15191d"
  foreground-dark: "#e6ebef"
  muted: "#4f5a63"
  muted-dark: "#b4bfc8"
  accent: "#176087"
  accent-dark: "#6cc0ea"
  rack: "#2b3138"
  rack-dark: "#1d2329"
  rack-deep: "#232930"
  rack-deep-dark: "#161b20"
  rack-line: "#3a424b"
  rack-line-dark: "#2e363e"
  on-rack: "#c5cdd4"
  on-rack-muted: "#9aa5af"
  on-rack-muted-dark: "#a3aeb8"
  rack-heading: "#eef1f3"
  agent: "#2f9bd0"
  agent-ink: "#176087"
  agent-ink-dark: "#6cc0ea"
  person: "#e07b2e"
  person-ink: "#8f4514"
  person-ink-dark: "#f0a56a"
  on-person: "#1a0f05"
  alert: "#b02f31"
  alert-dark: "#ff8a89"
  ok: "#1c6b40"
  field: "#7f8a95"
  field-dark: "#67737f"
  ok-dark: "#4cc38a"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1
  headline:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.375
  rack-label:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "0.08em"
  body:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  meta:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.375
  state-tag:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.12em"
  wordmark:
    fontFamily: "Barlow Semi Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    letterSpacing: "0.14em"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1
rounded:
  hairline: "1px"
  strip: "2px"
  chip: "3px"
  sm: "4px"
  md: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-secondary-hover:
    backgroundColor: "{colors.strip}"
  button-danger:
    backgroundColor: "{colors.card}"
    textColor: "{colors.alert}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  strip:
    backgroundColor: "{colors.strip}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.strip}"
    padding: "6px 10px 6px 14px"
  strip-done:
    backgroundColor: "{colors.strip-done}"
    textColor: "{colors.muted}"
    rounded: "{rounded.strip}"
  strip-waiting:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.strip}"
  rack-bay:
    backgroundColor: "{colors.rack}"
    textColor: "{colors.on-rack}"
    rounded: "{rounded.md}"
  top-bar:
    backgroundColor: "{colors.rack}"
    textColor: "{colors.on-rack}"
    height: "52px"
  waiting-counter:
    backgroundColor: "{colors.person}"
    textColor: "{colors.on-person}"
    rounded: "{rounded.sm}"
    typography: "{typography.title}"
  state-tag-waiting:
    backgroundColor: "{colors.person}"
    textColor: "{colors.on-person}"
    rounded: "{rounded.strip}"
    typography: "{typography.state-tag}"
  participant-mark-agent:
    backgroundColor: "{colors.agent}"
    rounded: "{rounded.hairline}"
    width: "4px"
    height: "12px"
  participant-mark-person:
    backgroundColor: "{colors.person}"
    rounded: "{rounded.hairline}"
    width: "4px"
    height: "12px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "16px"
  select:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "8px 32px 8px 12px"
---

# Design System: TAIA

## Overview

**Creative North Star: "Bahía de fajas" (the flight-strip bay)**

TAIA reads like an air-traffic control position. Every task is a flight strip: a slim, pale row with a coloured edge tab that says who holds it. Strips sit in graphite racks (the board's columns, the roster, the sessions and projects lists), and handing work to an agent or to a person is passing the strip. The rack is the shell; the strips are the work. Nothing else on the screen competes with them.

The density is operational: two or three lines per strip, tabular figures everywhere, cost always visible but quiet. Colour is reserved for meaning. Cyan and orange mark the two participant kinds at equal weight, orange alone also carries the single signal that a person has to act, red is spent only on real failures, and everything else is ink on grey. The world explicitly refuses the category default of soft rounded cards with avatar chips on a zinc ground.

Light is the default theme: a cool page under graphite racks. Dark keeps the same racks and drops the page to near-graphite, with strips a step lighter than the bay, like paper in a rack.

**Key Characteristics:**
- Graphite rack shell (top bar, bays, onboarding rail) over a cool grey page.
- Flight strips with a 5px participant edge tab; small radii (1-6px), hairline rack lines.
- Agent cyan and person orange at equal weight; orange as the one "waiting on you" signal.
- Strips that wait on a person are pulled 16px forward out of the rack line.
- Barlow Semi Condensed for all UI, IBM Plex Mono only for ids, commands and diff counts.
- Lucide icons, no emoji; the mate mark is the brand.

## Colors

A graphite-and-paper neutral system with two equal participant hues and one failure red; every colour that is not grey means something.

### Primary
- **Agent Cyan** (`agent`): the edge tab, participant mark and legend for an agent; the running dot; text selection tint (30%). Same value in both themes.
- **Agent Ink** (`agent-ink` / `agent-ink-dark`): agent names on strips and "running" text, where cyan itself would not reach text contrast. Doubles as the focus and selection accent (`accent`).

### Secondary
- **Person Orange** (`person`): the edge tab, participant mark and legend for a person; also the "waiting on you" counter, the TE ESPERA tag and the outline of a pulled-out strip. Same value in both themes.
- **Person Ink** (`person-ink` / `person-ink-dark`): person names on strips, waiting-count numbers on light grounds, the "polling" connection warning.
- **On Person** (`on-person`): near-black type on orange fills.

### Tertiary
- **Failure Red** (`alert` / `alert-dark`): failures only: blocked strips (1px inset outline plus the word), rejected or failed actions, exceeded WIP limit, disconnected runtime, destructive buttons.
- **Done Green** (`ok` / `ok-dark`): connected runtime, completed onboarding steps, success badges.

### Neutral
- **Cool Page** (`background` / `background-dark`): the page under the racks.
- **Card Paper** (`card` / `card-dark`): raised surfaces off the rack (cards, modals, menus) and the ground of a pulled-out strip.
- **Strip Paper** (`strip` / `strip-dark`): a resting strip; also the hover fill for secondary and ghost buttons.
- **Filed Strip** (`strip-done` / `strip-done-dark`): finished, offline or disabled strips.
- **Ink** (`foreground` / `foreground-dark`): body type and the fill of primary buttons.
- **Slate Muted** (`muted` / `muted-dark`): secondary text, ids, empty-state copy.
- **Hairline** (`border` / `border-dark`): borders on the page side.
- **Graphite Rack** (`rack`, `rack-deep`, `rack-line` and their `-dark` pairs): top bar, bays, rack sections, onboarding rail; `rack-deep` is the drop-target and unreached-step fill, `rack-line` the rack's hairline and hover fill.
- **On Rack** (`on-rack`, `on-rack-muted`): type on graphite. Rack headings use `rack-heading`; white is reserved for the wordmark, active nav and focus outlines on the rack.

### Named Rules
**The Equal Weight Rule.** Agent and person are peers: same tab width (5px), same mark size (4x12px), same text weight. Neither kind is ever drawn as secondary to the other.

**The One Orange Signal Rule.** Beyond marking a person, orange is the only "waiting on you" colour: the top-bar counter, the TE ESPERA tag, the pulled-out strip's outline and the board's waiting chip. Never use orange for decoration, brand emphasis or generic warnings.

**The Red Is Earned Rule.** Red appears only when something actually failed or is blocked. Never for emphasis, counts or deletion affordances at rest.

## Typography

**Display Font:** Barlow Semi Condensed (weights 400, 500, 600, 700; with ui-sans-serif, system-ui)
**Body Font:** Barlow Semi Condensed
**Label/Mono Font:** IBM Plex Mono (400, 500; with ui-monospace, SFMono-Regular, Menlo)

**Character:** A semi-condensed grotesque that fits two or three lines on a slim strip and reads like stencilled board labels when tracked out in uppercase; Plex Mono appears only where a value is machine text. `font-variant-numeric: tabular-nums` is set on the body, so every figure aligns.

### Hierarchy
- **Display** (600, 2.25rem, line-height 1): hero stat numbers; regular stats step down to 1.875rem.
- **Headline** (600, 1.5rem, 1.25): page titles ("Tablero" and every PageHeader).
- **Title** (600, 0.875rem, 1.375): strip titles (two-line clamp), modal and empty-state titles at 1rem.
- **Rack Label** (600, 0.875rem, 0.08em, uppercase): bay and rack-section headers; stat labels at 0.75rem with the same tracking.
- **Body** (400, 0.875rem, 1.625): dialog body, notices, descriptions (max-width 65ch in empty states).
- **Meta** (400, 0.8125rem): assignee line, cost, column totals, legend, top-bar runtime chip.
- **State Tag** (700, 0.6875rem, 0.12em, uppercase): the TE ESPERA tag only.
- **Wordmark** (700, 1.125rem, 0.14em): "TAIA" next to the mate mark; 1.5rem in the onboarding rail.
- **Mono** (400, 0.6875rem, line-height 1): task ids above the strip title; commands in approval strips at 0.75rem.

### Named Rules
**The Machine Text Rule.** Plex Mono is for ids, commands, branch names and diff counts only. Never for labels, headings, numbers that are prices, or decoration.

**The Tracked Label Rule.** Uppercase with tracking is for rack labels (0.08em), the waiting tag (0.12em) and the wordmark (0.14em). Running text is never uppercase.

## Layout

The app shell is a 52px graphite top bar over the page. The board is five bays side by side (each `flex: 1`, minimum 220px, 200px compact), a left roster rail of agents and people, and an optional activity panel at xl. Bays scroll internally; the page does not.

Strips inside a bay sit on a 6px gap with a 20px left gutter (12px right), so a waiting strip can be pulled 16px into the gutter and visibly break the rack line. Rack headers use the same 20px left inset. Other pages use the same racks laid flat (`RackSection`) inside content widths: data 72rem, medium 56rem, form 42rem, with 16px (mobile) / 24px (md+) side padding and a 20px top.

Spacing follows a 4px base: 4 (icon-label), 8 (related items), 12 (toolbar and column gaps), 16 (section gaps), 24 (page padding), 40 (region separation). Onboarding is a two-column grid: a graphite rail (18-26rem) holding the mark and steps as strips, the step itself on the page.

Responsive: nav tabs, theme switch and settings collapse below md; the runtime chip hides below sm; the agents rail becomes a toggle below lg. Icon buttons grow an invisible 44x44 hit area below md.

## Elevation & Depth

Depth is physical, not atmospheric: racks are darker than the page, strips are lighter than the rack, and a strip only lifts when it is pulled out or picked up.

### Shadow Vocabulary
- **Strip seat** (`box-shadow: 0 1px 0 rgba(0,0,0,0.25)`, 0.3 on board strips): a 1px hairline under a resting strip, as if seated in a rack slot.
- **Pulled out** (`box-shadow: 0 0 0 1px var(--person), 0 6px 14px rgba(0,0,0,0.3)`, 0.35 on the board and onboarding): strip waiting on a person, or the current onboarding step.
- **Picked up** (`box-shadow: 0 8px 18px rgba(0,0,0,0.4)` plus a 1deg rotation): a strip being dragged.
- **Menu** (`box-shadow: 0 6px 14px rgba(0,0,0,0.25)`): the assign popover.
- **Blocked** (`box-shadow: inset 0 0 0 1px var(--alert), 0 1px 0 rgba(0,0,0,0.3)`): a blocked strip, always with the word "bloqueada".

Modals sit on a 50% black backdrop with a border and no shadow.

### Named Rules
**The Pulled-Out Rule.** Lift is a state, not a style. Only a strip that waits on a person (or is being dragged) leaves the rack plane; no surface floats at rest.

## Shapes

Small, machined corners. Strips and their edge tabs are 2px; participant marks 1px; count pills 3px; buttons, inputs, selects and chips 4px; bays, rack sections and cards 6px. The edge tab is a 5px full-height bar on the strip's left edge, rounded only on its outer corners. Status dots are the one round shape (7-10px). The app icon is the graphite rack square (7/32 radius) with the mate mark in white, its rim in person orange.

## Components

### Buttons
Ink-solid and squared off; no brand colour on actions.
- **Shape:** gently squared (4px).
- **Primary:** ink fill and ink border, page-colour text, semibold; sizes xs (11px type, 4x8 padding) through lg (14px, 8x16). Hover drops opacity to 90%.
- **Secondary:** card fill with hairline border; hover fills with strip paper. The default variant.
- **Ghost:** transparent until hover (strip fill). Icon-only ghosts use muted ink.
- **Danger:** card fill, 50% red border, red text; hover tints 10% red. Used for Rechazar and destructive confirms.
- **Focus:** 2px accent ring offset 1px from the page. On the rack, controls use a 2px white outline instead.
- **Disabled:** 50% opacity, not-allowed cursor.

### Chips
- **View chips** (Todo / Te esperan): buttons toggled between primary (active, `aria-pressed`) and secondary. The waiting chip carries an orange count pill (3px radius, bold): solid orange when active, 20% orange with person ink otherwise.
- **Badges:** 4px radius, semibold 11px. Project badges are secondary (card, hairline). User tag colours tint the chip at 15% with a 6px dot; the text stays ink so any colour reads.

### Cards / Containers
- **Corner Style:** 6px.
- **Background:** card paper with a hairline border; interactive cards turn the border accent on hover; selected adds a 2px accent ring.
- **Shadow Strategy:** none at rest (see Elevation).
- **Internal Padding:** 8 / 16 / 24px.

### Inputs / Fields
- **Style:** card fill, `field` border (3:1 against its surface), 4px radius, 8x12 padding, 14px type; placeholders in muted ink. Native selects use the world's own 12px chevron (muted stroke) instead of the browser's.
- **Focus:** border turns accent plus a 2px 30% accent ring.
- **Error:** red border.

### Navigation
The graphite top bar (52px): mate mark and TAIA wordmark, workspace picker, nav tabs (14px medium, muted on-rack; active is white with a 2px white underline flush to the bar's bottom), then the waiting counter, today's cost (meta, figure in on-rack semibold), the runtime chip (hairline-bordered, a 7px state dot plus the provider name in words), theme switch, settings, user. Below md, the nav collapses into the app shell's mobile menu.

### The Flight Strip (signature)
One component grammar for board cards, roster rows, sessions, projects and onboarding steps.
- **Anatomy:** mono id line, title (two-line clamp), meta line with the assignee in its kind's ink, state words and the cost pushed right; optional badges and inline actions below.
- **Edge tab:** 5px, cyan for an agent, orange for a person, hairline grey when unassigned; green / orange / rack-line for done / current / ahead onboarding steps.
- **States:** resting (strip paper, seat shadow; hover lifts to card paper); done (filed strip, muted title with strikethrough); waiting (card paper, pulled 16px left, orange 1px outline, TE ESPERA tag with its reason and inline Aprobar / Rechazar, Revisar y mergear, or Responder); blocked (red inset outline plus the word); running (pulsing cyan dot plus "corriendo · desde …"); dragging (picked-up shadow, 1deg tilt).
- **Ordering:** waiting strips sort to the top of their bay.

### Rack Bay and Rack Section
Graphite (6px radius) with a header of rack label, count (with WIP limit as "n/limit") and the meta-sized cost total right-aligned, over a `rack-line` hairline. WIP at 80% outlines the bay orange and turns the count orange; at 100% both turn red. Empty bays say so in meta on-rack-muted. `RackSection` is the same rack laid flat for list pages, with an `aside` slot for totals or actions.

### Waiting Counter
The top bar's only coloured fill: an orange pill linking to the waiting view, an inset on-person number tile and "te espera / te esperan". Hidden at zero; never shown as a decorative badge.

### Participant Mark
The edge tab in miniature (4x12px, 1px radius), placed before every participant name and in the legend. It replaces avatars and emoji wherever a participant is named.

### State Vocabulary
States are named marks, never colour alone: TE ESPERA plus its reason, "bloqueada", "corriendo", "n bloqueos", runtime state words (Conectado, Conectando…, Desconectado), "en vivo" / "sin tiempo real". A status dot is always `aria-hidden` and always sits beside its word, or carries the word as `title` plus screen-reader text.

### Empty States and Notices
Left-aligned, a lucide icon in muted ink, a semibold title, a sentence that says why it is empty and what to do next, and one action. Runtime notices name the missing capability and link to the runtime settings.

### Motion
Short and functional: backdrop fade 150ms ease-out, toast slide-up 200ms (8px), drawer slide-in 200ms, colour transitions on hover, a 2s opacity pulse on live dots (`motion-safe` on strips). `prefers-reduced-motion` collapses all animation and transition durations to 0.01ms.

### Iconography and Brand
Lucide icons at 13-17px (stroke inherited, `aria-hidden` with a label on the control), plus two in-house glyphs (GitHub, blocker). No emoji anywhere; legacy `icon` props that accept emoji are ignored. The mate mark (gourd, metal rim, yerba, bombilla; 1.8 stroke, `currentColor`) is the brand: white on the rack with its rim in person orange, 22px in the top bar and 40px in onboarding. It must stay.

### Copy Voice
Spanish is Rioplatense with voseo ("Presioná", "te esperan", "Vos"); Portuguese is pt-BR ("espera você", "Quadro"). States are short lowercase phrases joined with a middle dot ("aprobación · hace 13 min", "corriendo · desde …"). Actions are verbs (Aprobar, Rechazar, Responder, Revisar y mergear, Asignar). Engineering loanwords stay where developers use them (workspace, runtime, merge, WIP).

## Do's and Don'ts

### Do:
- **Do** build every list of work as strips in a rack: 5px participant edge tab, 2px radius, seat shadow, 6px gap.
- **Do** give agents and people equal weight: cyan (`agent`) and orange (`person`) tabs and marks of the same size and text weight.
- **Do** pull a strip that waits on a person 16px out of the rack with an orange 1px outline, the TE ESPERA tag, its reason and its inline action.
- **Do** pair every state colour with a word; dots stay `aria-hidden`.
- **Do** keep costs visible but quiet: meta size, tabular figures, right-aligned on strips and in bay headers.
- **Do** use the ink-solid primary button for the main action and the danger variant only for destructive or reject actions.
- **Do** use the token pairs for both themes; light is the default.
- **Do** use lucide icons and the mate mark; write Spanish copy in voseo and Portuguese in pt-BR.

### Don't:
- **Don't** use soft rounded cards with avatar chips on a zinc ground; corners stay between 1px and 6px.
- **Don't** use orange for anything except a person or something that waits on a person.
- **Don't** use red for anything but failures and blocks.
- **Don't** use emoji, as icons, avatars or state markers.
- **Don't** set labels, prices or headings in Plex Mono, or running text in uppercase.
- **Don't** use Tailwind's default palette (green-600, red-500, yellow-500 and the like); use `ok`, `alert`, `person` and their inks.
- **Don't** float surfaces at rest; lift is reserved for waiting and dragged strips.
- **Don't** remove, recolour beyond white-and-orange-rim, or replace the mate mark.

## Contrast floor (measured)

Every text in every page, in both themes, clears WCAG AA 4.5:1 (3:1 for large type), checked with an automated sweep that also renders alerts and toasts. The rules that keep it there:

- **State text is ink-strength, never a pastel.** Alerts: state ink (`alert`, `ok`, `person-ink`, `agent-ink`) on an 8-10% tint of the same state, with a 5px edge tab. Toasts: foreground ink on card, the state carried only by the edge tab.
- **State badges are rings, not fills.** Text in state ink with a 1px inset ring, so they read on page, card or strip.
- **Disabled is a flat strip with muted ink,** not a 50% opacity ghost.
- **No opacity on text.** Quieter text uses `muted`, never `/alpha` or `opacity-*`.
- **Done strips** keep red off: alert ink on `strip-done` would fall below 4.5:1.
