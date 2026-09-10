# RoleFit Design System — Master

> **Source of truth:** `app/globals.css`. This file explains the system and the
> reasoning behind it; the CSS is what actually ships. If the two disagree, the
> CSS is right and this file is stale — fix it.
>
> Page-specific overrides, if any, live in `design-system/rolefit/pages/[page].md`
> and take precedence over this file.

**Project:** RoleFit — evidence-based, job-specific resume optimization
**Design dials:** Variance 4/10 (balanced, structural) · Motion 3/10 (subtle) ·
Density 8/10 (dense product)

---

## The direction

**An instrument, not a brochure.**

RoleFit measures one document against another and reports a verdict on
somebody's job application. The interface is built like a measuring device:
hairlines instead of shadows, a canvas one shade off the card instead of
elevation, tabular figures everywhere, and colour spent only where it states
something.

Three consequences that explain most of the decisions below:

1. **Colour is information.** Blue is the identity — the mark, links, focus,
   selection. White and near-black carry everything structural. Nothing else
   appears except the three verdict hues, and only where they *are* the
   verdict: green for met, amber for partial, red for missing.

2. **The primary action is near-black, not blue.** This looks like a mistake
   until you use the product. The only thing on these screens worth the eye's
   first stop is the verdict on someone's resume; a blue button on every panel
   competes with that and wins, which is the wrong way round.

3. **A bordered box is not free.** Every container costs a border, a shadow and
   24px of padding to state a grouping that a heading and a hairline already
   state — and once every section is a card, the page has no emphasis left to
   spend on the one thing that matters.

---

## Colour

Three layers. Never hard-code a colour in a component; use a semantic token.

| Layer | Where | Example |
| --- | --- | --- |
| 1 — primitive | `@theme` in globals.css | `--color-signal-600`, `--color-ink-950` |
| 2 — semantic | `:root` / `.dark` | `--surface-base`, `--content-primary` |
| 3 — utility | `@theme inline` | `bg-surface`, `text-fg`, `border-line` |

Two ramps and three verdict hues:

- **signal** — brand blue (`#2457e6` at 600). Identity, links, focus, selection.
- **ink** — cool neutral. Text, surfaces, borders, and the primary action.
  Cool rather than warm: against this blue a warm grey reads as a second,
  muddier hue rather than as a neutral.
- **verdant / caution / crimson** — met, partial, missing.

### Surfaces

`canvas` (page ground) → `surface` (panel) → `raised` (menu, dialog) →
`sunken` (a well or track) → `hover` / `selected` (interaction responses).

`hover` and `selected` are held apart from `sunken` deliberately. One token was
doing both jobs and it broke outright in dark mode, where `sunken` and `canvas`
resolved to the same value — so every row hover on the canvas highlighted to
exactly the colour it already was.

### Rules

- Colour never carries meaning alone. Every status pairs a hue with an icon
  **and** a text label. This is a WCAG requirement and it is also what makes
  the diff view legible to the roughly one in twelve men with a colour vision
  deficiency who will use this product to apply for a job.
- Text meets 4.5:1 against its own background. Never dim a whole panel with
  `opacity` to signal unavailability — it dims the text too, and takes it under
  the threshold.
- The CTA blue fill (`bg-cta`) is for the single highest-intent action on a
  marketing page. Using it twice on one screen is a bug, not a style choice.

---

## Typography

Three faces, each with one job and a boundary it does not cross.

| Face | Scope |
| --- | --- |
| **Instrument Sans** (`font-sans`) | Every interface surface, all body copy |
| **Instrument Serif** (`font-display`) | Marketing and auth headlines **only** |
| **IBM Plex Mono** (`font-mono`) | Text quoted from a document; machine identifiers |

The serif is absent from the authenticated product on purpose. A serif on a
data panel heading reads boutique-editorial where this product needs to read as
an instrument. Instrument Sans and Instrument Serif are one design programme
rather than two faces that happen to sit together, which is what stops the
pairing reading as two arbitrary picks off a font host.

The monospace is not decoration: evidence is shown verbatim, and the face is
what tells the reader they are looking at the document rather than at our prose
about it.

### The scale

Named by role, never by size, so a call site says what it is setting and two
places needing the same thing cannot drift a sixteenth of a rem apart.

| Token | Size | Use |
| --- | --- | --- |
| `text-3xs` | 10px | Micro-labels |
| `text-2xs` | 11px | Dense secondary detail, captions |
| `eyebrow` | 11px caps | The uppercase label above a section or figure |
| `text-meta` | 13px | Table cells, metadata rows — the product's workhorse |
| `text-sm` | 14px | Body |
| `text-body-lg` | 15px | A control or paragraph carrying weight |
| `text-title` | 17px | Panel and section headings |
| `text-display-xs/sm/md/lg/xl` | 20–56px | Grotesque display steps |
| `text-serif-xs/sm/md/lg` | 28–56px | **Serif** display steps |

The serif has its own steps because a serif needs looser tracking than a
grotesque at the same size — the serifs already close the gaps between letters,
so the −0.024em that makes Instrument Sans look precise at 56px makes
Instrument Serif look jammed. Separate steps rather than a `tracking-*`
override, because both would be utilities setting `letter-spacing` and their
emitted order is not something Tailwind promises.

`eyebrow` sets type only, never colour, for the same reason: seven call sites
need a tone other than the default.

Figures are tabular by default (`table`, `time`, `[data-numeric]` in the base
layer). A column of scores where 1 is narrower than 8 does not line up, and a
count that changes width as it increments makes the row twitch.

---

## Shape, spacing, layout

**Radius** — `xs` 2px through `2xl` 12px. Tight. Generous corner radius is the
single strongest period marker in an interface; an instrument has edges.

**Spacing** — 4px base (`--spacing: 0.25rem`), dense product density.

**Shadows** — nearly gone, and cool-tinted where they remain. Separation is
carried by a hairline border and by the canvas being a shade darker than the
card. Reserved for surfaces that genuinely float: menus, popovers, dialogs, a
sticky bar — and the print-preview sheet, which is standing in for a physical
object.

**Containers** — page width is a token, not a per-page guess:

| Utility | Width | Use |
| --- | --- | --- |
| `container-app` | 78rem | App screens |
| `container-page` | 84rem | Marketing sections |
| `container-prose` | 42rem | Policy pages and running text |

**Measures** — `measure-tight` 34ch, `measure` 62ch, `measure-wide` 72ch. Copy
set wider than ~72 characters loses the reader's place on the return sweep.

**Z-index** — a named stack (`--z-base` … `--z-toast`). Layering is a global
property and belongs in one list, not chosen independently per component.

---

## Components

Layer 3 lives in `components/ui/`. Reach for these before writing a container.

| Component | Purpose |
| --- | --- |
| `layout.tsx` | `PageHeader`, `PageBody`, `Section`, `Panel`, `PanelHeader`, `Stack`, `Toolbar`, `DescriptionList` |
| `table.tsx` | `Table` + `TableCards` + `ResponsiveTable` — a real table ≥md, stacked records below |
| `tabs.tsx` | Radix tabs, underline style |
| `dialog.tsx` | `AlertDialog` only — a decision that must be answered |
| `menu.tsx` | Radix dropdown menu, tooltip, `InfoTip` |
| `button.tsx` | `primary` (near-black), `cta`, `secondary`, `ghost`, `danger`, `link` |
| `field.tsx` | The form accessibility contract, handled once |
| `feedback.tsx` | `Badge`, `MatchBadge`, `ChangeBadge`, `Alert`, `Callout`, `EmptyState`, `Skeleton` |
| `score.tsx` | `ScoreRing`, `ScoreBar`, `ScoreBreakdown`, `ScoreDelta`, `ScoreDisclaimer` |
| `stat.tsx` | `Stat`, `StatRow`, `StatDelta` |

### Panel, not card

`Panel` is the default discrete surface: a hairline, no shadow, no hover lift.
A `flush` panel wraps a table or list and gets a `PanelHeader`. A *padded*
panel should not have an internal heading — use `Section` outside it, because a
heading inside a bordered box inside a page that already has a heading is the
nested-container problem in miniature.

There is no `Card`. It was removed once every screen had been rebuilt on
`Panel` and `Section` and it had no call sites left.

### Tables

A list of records is a table. Flex rows with the label pushed left and metadata
pushed right reflow nicely and cost the one thing a list of records is for: on
a wide screen nothing lines up, so you cannot compare the fourth row's score
against the first's without reading both.

Two renders of the same data, switched at `md` by `ResponsiveTable` — a real
`<table>` with `scope`-carrying headers above, stacked records below. Not one
grid pretending to be both: a `<td>` that becomes a block loses its association
with its header, and a screen reader then reads six unlabelled values.

### Status and repetition

State the status **once**, at the level that owns it. A list of gaps under a
heading that says these are the gaps does not need "Missing / not verified"
stamped twenty times.

---

## Navigation

Three states, not two:

| Width | Navigation |
| --- | --- |
| `< md` | Mobile header + focus-trapping slide-over drawer |
| `md … lg` | Icon rail, 3.75rem, labels stacked under the glyphs |
| `≥ lg` | Full sidebar, 15.5rem |

One DOM tree switched by CSS, never by measuring the viewport in JavaScript —
the server render and the first client render must agree about which navigation
exists. Labels stay in the accessibility tree at every width; only their
presentation changes.

The active marker is a 2px rail, not a filled pill. A pill spends a saturated
block of colour on a label the user already knows they are looking at; weight
carries the state as well as colour does, so the cue survives being
desaturated.

The full sidebar returns at `lg` rather than `xl`: a 1280px laptop reports a
layout viewport of ~1265px once a classic scrollbar is subtracted, so an `xl`
threshold hands the most common laptop width the tablet rail.

---

## Motion

Motion clarifies state; it never entertains. **The test for any animation is
whether removing it would lose information** — which direction a panel came
from, that a press registered, that a value changed. If not, it does not
belong.

Three durations and only three: `instant` 90ms, `fast` 160ms, `settle` 280ms.
A system with nine of these ends up with each component picking one at random.
Easing is `--ease-standard` unless there is a reason.

- Animate `transform` and `opacity`. Never `width` or `height` — a meter or a
  progress track uses `scaleX`, so the compositor handles it instead of layout
  re-running every frame.
- Exits are faster than entrances: the user has already decided.
- Progress is reported by **stage**, never by a fake percentage. A bar that
  fills to 90% and waits is a lie the user catches every time.
- One entrance per page, on the container — not a stagger across every child.
  Staggered lists look considered in a demo and feel slow on the fourth visit.
- `prefers-reduced-motion` shortens durations globally rather than removing
  animations, which keeps `both` fill modes landing on their end state instead
  of stranding content at `opacity: 0`.

---

## Accessibility

Targets WCAG 2.2 AA, enforced by `tests/e2e/accessibility.spec.ts`, which runs
axe over every page in both themes and checks eight breakpoints for horizontal
overflow.

- Visible label on every control. Never placeholder-only.
- Errors tied to their field by `aria-describedby`, announced live, with
  `aria-invalid` and the focus ring agreeing about validity.
- One focus treatment everywhere: the `focus-ring` utility. A keyboard user
  learns its shape once.
- Icon-only controls carry an `aria-label`.
- Skip link is the first tab stop on every page, above every other layer.
- Scroll containers are focusable — one that only responds to a mouse wheel
  strands anyone on a keyboard or a switch device.
- Radix for anything with a focus contract: dialogs, menus, tabs, tooltips.

---

## Anti-patterns

Not aesthetic preferences — each of these was in the product and was removed.

- ❌ **A card around every grouping.** Use a heading and a hairline.
- ❌ **Nested bordered boxes.** Panel → bordered list item → dashed inner box
  was three border levels to state one list.
- ❌ **Placeholder-line mocks.** Grey rounded bars standing in for a document
  say nothing and work equally well for a CRM or an invoice tool. Show the
  real output with real text.
- ❌ **A tally as a headline metric.** "You have uploaded six resumes" is not
  something anyone acts on. Lead with a verdict or a next action.
- ❌ **A record with no identity.** "8 strong, 23 missing" without the role it
  was measured against is a history of job applications with the applications
  left out.
- ❌ **Flooding a region with a status colour.** Twenty-three rows on an amber
  background to deliver a message whose own text says nothing is wrong. Use an
  accent edge.
- ❌ **`opacity` to signal unavailability.** It dims the text below 4.5:1.
- ❌ **Repeating a status per row** when the section heading already states it.
- ❌ **Two copies of one action on one screen.**
- ❌ **Emoji as icons.** SVG only, one set (Lucide).
- ❌ **Centred prose in a narrow column.** The reader hunts for every line.
- ❌ **Gradients, glassmorphism, floating blurred blobs, violet, orange.**
- ❌ **Dark mode forced.** It is opt-in and follows the system by default.
- ❌ **A component with no call site.** Nobody has checked it against a screen.

---

## Pre-delivery checklist

- [ ] No raw hex, radius, shadow, z-index or page width in a component
- [ ] Every status carries an icon **and** a text label
- [ ] Text ≥ 4.5:1 in both themes; no `opacity` on a text container
- [ ] `focus-ring` on every interactive element; visible and consistent
- [ ] Only `transform` / `opacity` animated; `prefers-reduced-motion` honoured
- [ ] Numeric columns are tabular and right-aligned
- [ ] Tables have a stacked equivalent below `md`, each value still labelled
- [ ] No horizontal scroll at 320 / 375 / 768 / 1024 / 1280 / 1440 / 1920
- [ ] Serif confined to marketing and auth; product chrome is grotesque
- [ ] `npm run verify` clean, and `npx playwright test` green
