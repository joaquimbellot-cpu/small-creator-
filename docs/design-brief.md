# Smallfold: design brief

Written by the team leader after studying the inspiration site, https://www.vonder.ai/, on 20 November 2026.
Brand facts come from `docs/brand-info.md`, which always wins over this file.

**The inspiration is a mood, not a source.** No text, image, logo, icon, font file or code from it may be used.

## 1. What the inspiration does well

| Area | What we saw | What we take |
|---|---|---|
| Mood | Quiet luxury. Very little on each screen, a lot of empty space, warm photography. | One idea per screen. Space is the main design tool. |
| Layout | A full-bleed photo hero with one centred line and one button. Then narrow centred text columns, alternating with full-bleed photos, inset dark panels and hairline lists. | The same rhythm: photo, statement, panel, list. |
| Colour | Near-black, warm off-white and white only. The photographs carry the warmth. | Our cream and black, plus one accent used rarely. |
| Type | A light serif for nearly everything, at modest sizes. Tiny uppercase sans-serif labels for navigation, buttons and tags. | The same pairing, with our own fonts. |
| Buttons, cards | Small 8px corners. Flat fills, no shadows, no borders on tiles. Text links are uppercase and underlined. | Same vocabulary. |
| Navigation | Almost invisible: a small square menu button and a few tiny uppercase links. | Tiny uppercase links on desktop, a square menu button on phones. |
| Motion | A short dark intro, then the hero photo grows to fill the screen. Lines of text rise into place. A paragraph turns from grey to black word by word as you scroll. Thin generative line drawings. | All four ideas, in our own form (section 7). |
| Footer | Dark, with the brand name very large and barely visible, dark on dark. | Same idea with our wordmark. |

## 2. The Smallfold idea

**Chosen by hand.** Everything on the site should feel selected and placed by a person: few elements, set carefully, with the calm of a boutique agency. The one accent colour is the blue of a pen, and stands for the human choice. It appears where a choice is made: the chosen thread in the illustration, the mark in the logo, the current step, a focused field.

## 3. Colour tokens

| Token | Value | Use |
|---|---|---|
| `--cream` | `#F1EFEB` | Brand colour. The page ground. |
| `--ink` | `#0E0E0E` | Brand colour. Text on cream; the ground of dark panels, the menu and the footer. |
| `--paper` | `#FAF8F4` | Raised surfaces on cream: cards, form fields. |
| `--cream-deep` | `#E5E1D8` | Tiles, chips, image placeholders. |
| `--ink-soft` | `#1A1A19` | Raised surfaces on ink. |
| `--muted` | `#5C5A55` | Secondary text on cream (contrast 6:1). |
| `--muted-on-ink` | `#A9A59C` | Secondary text on ink (contrast 7:1). |
| `--faint` | `#B9B5AC` | Only for words not yet revealed by the scroll effect, and decorative marks. Never for text that must be read. |
| `--line` | `rgba(14,14,14,.14)` | Hairlines on cream. |
| `--line-on-ink` | `rgba(241,239,235,.18)` | Hairlines on ink. |
| `--accent` | `#2B44D6` | Pen blue, on cream or paper (contrast 6:1). |
| `--accent-on-ink` | `#A8B4FF` | The same accent on ink (contrast 9:1). |

Rules: the accent covers less than about 2% of any screen. No gradients except a dark veil over photos to keep text readable. No shadows.

Sections sit on one of three grounds, set by a class that redefines `--bg`, `--fg`, `--fg-muted`, `--rule`, `--surface` and `--accent-fg`: `.on-cream` (default), `.on-ink`, `.on-photo` (text on a photograph: cream text over a dark veil). Components read only those six variables, so every component works on every ground.

## 4. Type

| Role | Font (Google Fonts) | Details |
|---|---|---|
| Display and text | **Newsreader**, fallback `Georgia, "Times New Roman", serif` | Weight 300 for headings, 400 for text. Italic 300 for the hero line and for emphasis. Sentence case everywhere, never uppercase. |
| Labels | **Instrument Sans**, fallback `"Helvetica Neue", Arial, sans-serif` | Weight 500, uppercase, letter-spacing .07em. For navigation, buttons, tags, form labels, table heads. Never below 12px. |

| Token | Size | Line height | Use |
|---|---|---|---|
| `--t-hero` | `clamp(2.75rem, 6.2vw, 5.5rem)` | 1.02 | The hero line |
| `--t-h1` | `clamp(2.4rem, 4.6vw, 4rem)` | 1.06 | Page titles |
| `--t-h2` | `clamp(2rem, 3.6vw, 3.25rem)` | 1.1 | Section titles |
| `--t-h3` | `clamp(1.375rem, 1.8vw, 1.625rem)` | 1.25 | Item titles |
| `--t-statement` | `clamp(1.625rem, 2.9vw, 2.5rem)` | 1.22 | The centred statement paragraph |
| `--t-lead` | `clamp(1.1875rem, 1.5vw, 1.375rem)` | 1.45 | Lead paragraphs |
| `--t-body` | `1.125rem` | 1.55 | Running text |
| `--t-small` | `1rem` | 1.5 | Notes, hints |
| `--t-label` | `.75rem` | 1.4 | Uppercase labels |

Headings use `text-wrap: balance` and letter-spacing `-0.01em`. Running text stays under 34em wide. Numbers in tables use tabular figures.

## 5. Space, shape, grid

- Spacing scale (`--s-1` to `--s-10`): 4, 8, 12, 16, 24, 32, 48, 72, 112, 160px. Sections are separated by `--s-9` on desktop and `--s-8` on phones.
- Page gutter `--gutter`: `clamp(20px, 4vw, 56px)`, written with the safe-area `max()` so it clears a phone's side bar. Content width `--wrap`: 1320px. Narrow text column `--narrow`: 720px.
- Corners: `--r-sm` 4px (chips), `--r` 8px (buttons, fields, tiles), `--r-lg` 14px (inset panels, photos that are not full-bleed).
- Photos are either full-bleed or set in a fixed ratio (16:9, 3:2 or 4:5) with `--r-lg` corners. Nothing in between.
- Inset panel: a dark block with a `--gutter` margin on both sides and `--r-lg` corners, like a card laid on the page.

## 6. Components (the class contract)

Every builder uses these names. The Design System agent styles them; nobody else restyles them.

| Class | What it is |
|---|---|
| `.wrap`, `.wrap--narrow` | Centred content width with the gutter |
| `.section`, `.section--tight` | Vertical section spacing |
| `.on-cream`, `.on-ink`, `.on-photo` | Grounds (section 3) |
| `.label`, `.label--muted` | Uppercase sans label |
| `.h-hero`, `.h1`, `.h2`, `.h3`, `.statement`, `.lead`, `.body`, `.small`, `.muted` | Type styles, usable on any element |
| `.btn`, `.btn--ghost`, `.btn--small` | Button: 48px tall (40px small), `--r` corners, uppercase label. Default is filled with `--fg`; ghost is outlined. |
| `.link` | Uppercase underlined text link, with an optional trailing icon |
| `.text-link` | Underlined link inside running text |
| `.chip`, `.chip--accent` | Small tag, for example "Example" |
| `.tile` | Flat `--surface` block with `--r` corners, for cards |
| `.panel` | Inset dark panel (section 5) |
| `.rows`, `.row` | Hairline list: a title on the left, text on the right, a rule under each row |
| `.steps`, `.step` | Numbered sequence. Numbers are shown only where order matters. |
| `.media`, `.media--16x9`, `.media--3x2`, `.media--4x5` | Fixed-ratio image frame with `object-fit: cover` |
| `.band` | Full-bleed photo with one centred line |
| `.field`, `.field__label`, `.field__hint`, `.field__error`, `.input`, `.select`, `.textarea`, `.choice` | Form parts. Fields are 52px tall. |
| `.notice`, `.notice--draft` | Framed note, for "not connected yet" and "draft" messages |
| `.accordion`, `.accordion__item` | Questions list built on `<details>` |
| `.sr-only`, `.skip-link` | Accessibility helpers |

All tap targets are at least 44px. Focus is always visible: a 2px outline in `--accent-fg`, offset 3px.

## 7. Motion

Smooth and slow, never bouncy. Easing `--ease: cubic-bezier(.22, 1, .36, 1)`. Durations: 200ms for hovers, 900 to 1300ms for entrances.

| Hook in the markup | Effect | Owner |
|---|---|---|
| `[data-intro]` on the hero | On the first visit of a session: the symbol on ink for a moment, then the hero photo grows from a framed card to full-bleed and the hero text rises line by line. About 1.6s in total. Skipped on later pages and visits. | Hero agent (structure), Animation agent (timing polish) |
| `[data-reveal]` | The block fades and rises 28px when it enters the screen. `data-reveal-delay="1"` to `"4"` staggers siblings. | Animation agent |
| `[data-reveal="words"]` | The paragraph's words turn from `--faint` to `--fg` one by one, tied to scroll position. | Animation agent |
| `[data-reveal="lines"]` | A heading rises line by line from behind a mask. | Animation agent |
| `[data-parallax]` | A photo drifts a few percent slower than the page. | Animation agent |
| `[data-threads]` | The "chosen by hand" drawing: many thin threads, one of them picked out in the accent. Static SVG by default; a slowly moving canvas when motion is allowed. | Imagery agent (SVG), Animation agent (canvas) |

Rules: every page is complete and readable with JavaScript off and with reduced motion on. Hidden starting states apply only under `html.js` and `prefers-reduced-motion: no-preference`. No scroll hijacking, no smooth-scroll library, no autoplaying sound.

Hover states: buttons swap fill and text; `.link` underlines slide; tiles scale their image to 1.03; header links go from muted to full. All wrapped in `@media (hover: hover)`.

## 8. Header and footer

- **Header:** fixed. Left: the symbol and wordmark. Right on desktop: tiny uppercase links (How it works, For brands, About, Questions) and a small "Apply" button. Transparent with cream text over the home hero; a solid cream bar with a hairline after scrolling and on every other page. It slides away when scrolling down and returns when scrolling up.
- **Phones (860px and below):** the links collapse into a square "Menu" button with four dots. It opens a full-screen ink panel with large serif links, the Apply button and the contact email.
- **Footer:** on ink. A short line about Smallfold, the contact email, link groups (Smallfold: How it works, For brands, About, Questions. Get in touch: Apply, Contact. Legal: Privacy, Terms), then the wordmark set very large in `--ink-soft`, barely visible, and a copyright line.

## 9. Pages

Every page ends with the same closing section: one line, the Apply button, and "We reply within 2 working days."

| Page | File | Sections, in order |
|---|---|---|
| Home | `index.html` | Hero (photo, tagline, one sentence, Apply, range note). Statement paragraph (word reveal). Three differences (text beside a 4:5 photo). "How a match is made" inset ink panel with the threads drawing and the four steps. Example matches (three tiles, each tagged "Example", no amounts). Commission (hairline rows). Photo band with one line. Three questions with a link to all. Closing section. |
| How it works | `how-it-works.html` | Page head. The four steps in detail. What happens after you apply. Commission rows with notes. Closing section. |
| For brands | `brands.html` | Page head with photo. Three points for brands. How it works for a brand (three steps). "You pay the agreed fee and nothing more." The enquiry form. |
| About | `about.html` | Page head. The story. The three differences as beliefs. YouTube now, other platforms later. Closing section. |
| Questions | `questions.html` | Page head. Questions in groups, as an accordion. Closing section. |
| Contact | `contact.html` | Page head. Email (and phone when it exists). Two paths: creators to Apply, brands to the enquiry form. |
| Apply | `apply.html` | Page head. The application form beside "What happens next". |
| Privacy | `privacy.html` | Draft notice. Sections of text. |
| Terms | `terms.html` | Draft notice. Sections of text. |

Forms: labels above fields, one error message under each field, errors clear as they are fixed, and a plain message when the form is not connected to the form service.

## 10. Imagery

- **Photos (royalty-free, Unsplash licence):** warm, quiet, natural light, muted colour, in the spirit of the inspiration's photography. Subjects: a creator's desk, a camera, hands, a small home studio, products on a table. **No identifiable faces** (no model releases). No logos or brand names visible. No "Unsplash+" (paid) photos.
- **Illustrations (drawn for us):** thin 1.25px lines in `currentColor`, the accent used once. The threads drawing; a small set of icons on a 24px grid.
- **Logo:** the wordmark "Smallfold" in Newsreader, and a symbol: a small square sheet with one corner folded over, the fold filled with the accent. The symbol must work at 16px.
- Every image has alt text. Decorative images have empty alt text.

## 11. How the project is organised

Plain HTML, CSS and JavaScript with a small build script and no dependencies.

```
docs/              brand-info.md, design-brief.md, team notes
src/pages/         one .html file per page (page body only)
src/partials/      head, header, footer, hero, logo, closing section, icons
src/content/       all words and image descriptions as .json files
src/css/           tokens, base, components, header, footer, hero, sections, motion
src/js/            nav, hero, forms, motion
src/assets/        photos, illustrations, logo files
build.js           joins everything into the finished site
site/              the finished site (generated; do not edit by hand)
```

To change a sentence, edit the matching file in `src/content/` and run `node build.js`.

## 12. Who owns what

| Stage | Agent | Owns |
|---|---|---|
| Foundation | Foundation | `build.js`, the folder structure, first versions of everything below |
| 1. Materials | Design System | `src/css/tokens.css`, `base.css`, `components.css`, `src/pages/styleguide.html` |
| | Copywriter | `src/content/*.json` except `images.json` and `seo.json` |
| | Imagery | `src/assets/**`, `src/content/images.json`, `src/partials/logo.html`, `src/partials/icons/**`, `docs/image-credits.md` |
| 2. Build | Header and Footer | `src/partials/header.html`, `footer.html`, `src/css/header.css`, `footer.css`, `src/js/nav.js` |
| | Hero | `src/partials/hero.html`, `src/css/hero.css`, `src/js/hero.js` |
| | Content Sections | `src/pages/*.html` except the style guide, `src/partials/closing.html`, `src/css/sections.css`, `src/js/forms.js` |
| 3. Polish | Animation | `src/css/motion.css`, `src/js/motion.js` |
| | Responsive | Layout fixes in `header.css`, `footer.css`, `hero.css`, `sections.css`, `components.css` |
| | SEO and Accessibility | `src/content/seo.json`, `src/partials/head.html`, markup fixes in `src/pages/*.html` and `src/partials/*.html`, colour and focus fixes in `tokens.css` and `base.css`, `robots.txt` |
| Review | QA | Tests only; reports to the leader |

The nine specialists run in three stages of three, in parallel inside each stage, because the builders need finished words, images and components, and the polish agents need finished pages.

An agent that needs something from a file it does not own reports it to the leader instead of editing the file. An agent that finds a missing brand fact reports it; nobody invents one.
