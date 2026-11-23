# Marketing folder

**Archived.** This is version 1 of the campaign (23 November 2026). The owner found it bland and asked that its ideas not be reused. Version 2 is in `marketing/v2/`.

This folder holds the Smallfold ad plans, scripts, built assets and tools. Nothing here has been published. The owner publishes.

## Index

- `brand-brief.md`: The only source of facts, the voice, the look, and what ads must never say. Section 11 lists four points the owner checks before publishing.
- `strategy.md`: Audience problems and angles from the Strategy Agent. This is reasoning, not fact.
- `scripts/`: The Concept A and Concept B scripts, with hooks, captions and hashtags.
- `ad-copy.md`: Static headlines, sub-lines, main texts and link descriptions.
- `creative-direction.md`: The look, the AI presenter's design, the shot lists and the review checklists.
- `generation-sheet.md`: The sheet to paste into Claude chat. It generates the presenter and voice-over videos with Higgsfield on the unlimited allowance.
- `compliance-report.md`: The honesty and quality check of every script, prompt and built asset.
- `assets/`: The built static ads (`static/`), the caption-led videos (`video/`), the end card and a PNG of the logo.
- `assets-log.md`: What is built, the Higgsfield job log, and what is not generated yet.
- `content-calendar.md`: The suggested 14-day test, tracking links and posting reminders.
- `tools/`: The scripts that build the statics and videos.

## Rebuild the assets

Run these from the project root:

```
FONT_DIR=<path to node_modules/@fontsource> node marketing/v1/tools/build-statics.cjs
FONT_DIR=<path to node_modules/@fontsource> node marketing/v1/tools/build-video.cjs
```

You need these:

- The npm packages `@fontsource/newsreader` and `@fontsource/instrument-sans`.
- Playwright.
- ffmpeg.
