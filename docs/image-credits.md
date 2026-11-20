# Image credits

Every picture on the Smallfold site, where it came from, and the terms it is used under.
The same facts are in `src/content/images.json` (`credit`, `creditUrl`, `licence`).

## The pictures in the photo slots

**These eight pictures are not photographs.** They were drawn by script for Smallfold as one series:
cream paper on a dim desk in window light, with one corner folded over in pen blue.
Nobody else holds rights in them, so there is no photographer to credit, no source page and no licence to follow.

| id | File | What it shows | Photographer | Source page | Licence |
|---|---|---|---|---|---|
| hero | `src/assets/img/hero.jpg` | Paper sheets on a desk in window light; a small folded sheet at the upper left, a pen at the lower right; the middle is left empty for the headline | None (drawn for Smallfold) | None | None needed |
| heroTall | `src/assets/img/hero-tall.jpg` | The same desk as the hero, composed upright for phones | None (drawn for Smallfold) | None | None needed |
| band | `src/assets/img/band.jpg` | Two fanned stacks of paper at the edges, window light across the desk between them | None (drawn for Smallfold) | None | None needed |
| difference1 | `src/assets/img/difference-1.jpg` | A grid of small cards with one picked out ("Matched by hand") | None (drawn for Smallfold) | None | None needed |
| difference2 | `src/assets/img/difference-2.jpg` | One small sheet in the light, a large one leaving the frame ("Only small channels") | None (drawn for Smallfold) | None | None needed |
| difference3 | `src/assets/img/difference-3.jpg` | A kept sheet, a sheet set aside and a pen ("You have the final say") | None (drawn for Smallfold) | None | None needed |
| brands | `src/assets/img/brands.jpg` | Plain objects set out on a table, seen from above | None (drawn for Smallfold) | None | None needed |
| about | `src/assets/img/about.jpg` | A notebook, a lens and a pen on a desk in window light | None (drawn for Smallfold) | None | None needed |

Each picture has a smaller copy beside it with `-small` in the name (1200px wide for hero, band, brands and about; 600px wide for hero-tall and the three difference pictures).

### Why there are no photographs

Royalty-free photographs were looked for first, on 20 November 2026.

- Unsplash refuses automated visitors, so nothing was taken from it.
- Openverse (a search of openly licensed pictures) was then searched for works marked CC0 or Public Domain Mark that could be downloaded from Wikimedia Commons. About 350 previews were looked at.
- No photograph was found that could carry the home page: a small creator's desk in warm low light, with no face, no brand name and a calm middle for the headline. Mixing a few photographs with drawn pictures looked worse than either alone, so the whole set is drawn in one style.

### Photographs that were good enough to keep in mind

All four are marked CC0 1.0 on Wikimedia Commons, which asks for no credit. None is used on the site. The first three were checked at full size; the fourth was seen only as a small preview.

| What it shows | Photographer | Source page | Would suit |
|---|---|---|---|
| Two hands on a laptop keyboard and trackpad, seen from above on a walnut table | Fabian Irsara | https://commons.wikimedia.org/w/index.php?curid=61684280 | difference3 |
| The corner of a linen-bound book on a weathered wooden table | Beatriz Pérez Moya | https://commons.wikimedia.org/w/index.php?curid=62122143 | band |
| A parcel wrapped in star-printed brown paper with a blank tag, on dark wood | Annie Spratt | https://commons.wikimedia.org/w/index.php?curid=62122924 | brands |
| Hands writing in a journal on a wooden desk, with coffee | Cathryn Lavery | https://commons.wikimedia.org/w/index.php?curid=61717182 | difference1 |

## Drawn for Smallfold

The logo (`src/assets/logo/`, `src/partials/logo.html`), the two threads illustrations (`src/assets/illustrations/`), the social sharing image (`src/assets/img/og.jpg`) and the icons (`src/partials/icons/`) were drawn for Smallfold. Nothing in them is taken from another source.

The wordmark is set in Newsreader, a typeface published under the SIL Open Font Licence, and converted to outlines, so the logo files need no font.

## Replacing a picture

1. Keep the file name and the pixel size listed in `src/content/images.json`.
2. Save a `-small` copy beside it, in the width given above.
3. Update the entry in `src/content/images.json` (`alt`, `credit`, `creditUrl`, `licence`) and the table in this file.

Use only pictures whose licence allows it. No recognisable faces, no visible brand names.
