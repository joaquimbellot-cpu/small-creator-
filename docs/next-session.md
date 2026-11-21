# Notes for the next session: making and placing the pictures

The site is finished except for its pictures. Every picture on it is a soft blurred stand-in
(marked `"placeholder": true` in `src/content/images.json`). The owner disliked the earlier
drawn pictures and wants photographic ones, generated with the Higgsfield connector.

## What to do

1. Read `docs/brand-info.md`, `docs/design-brief.md` (section 10) and `docs/image-prompts.md`.
2. Generate the eleven pictures from the prompts in `docs/image-prompts.md`, each in the
   shape given there. Look at every result. Regenerate any with a clear face, readable text,
   a logo, a brand name or malformed hands. The two hero pictures and the band need a calm,
   dark middle, because a headline sits on them.
3. Place each one at the path and exact pixel size listed in `src/content/images.json`
   (crop to the ratio, resize, save as a progressive JPEG at about quality 72 to 80), and
   save the smaller copy beside it under the `-small` name at the `widthSmall` width.
   Python with PIL is installed.
4. In `src/content/images.json`, for each replaced picture: write a short plain `alt`
   (the three `example` pictures and the two contact tiles may stay empty, as they are
   decorative), remove `"placeholder": true`, and fill `credit` with "Generated for Smallfold".
5. Update `docs/image-credits.md`: the pictures are generated, not photographed.
6. Run `node build.js --strict`, look at the home page at 1440 and 390 wide (the opening,
   the pinned "three differences" section, the band), and check the headline is readable
   on the hero.
7. Commit and push to the branch `claude/awesome-lamport-rlk8gy`.
8. Publish to the owner's existing page, https://claude.ai/artifact/QK1ZF6BdTsfG42ufJKLpPG
   (pass it as `url`). The page is the built `site/index.html` without its document tags,
   with every other file in `site/` published beside it; the `<html>` and `<body>` attributes
   (`lang`, `class="on-cream"`, `data-page="home"`) must be restored by a first inline script.

## Rules that still apply

- No real company names, no logos, no readable text in any picture.
- Do not invent brand facts. `docs/brand-info.md` is the only source.
- The owner asked for sub-agents to run on Opus.
