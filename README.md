# Smallfold website

The website for Smallfold, which finds sponsors for small YouTube channels.

It is made of plain HTML, CSS and JavaScript. One small script, `build.js`, joins the
pieces in `src/` into the finished site in `site/`. Nothing needs to be installed
except [Node.js](https://nodejs.org) (version 18 or newer).

## See the site

Open a terminal in this folder and run:

```
node build.js --serve
```

Then open http://localhost:8000/ in a browser. While this is running, the site is
rebuilt every time you save a file in `src/`; reload the page to see the change.
Press Ctrl+C to stop.

To build the site once, without the preview, run `node build.js`.
The finished site is the folder `site/`. That folder is what goes online.

**Never edit files in `site/` by hand.** It is emptied and written again on every build.
Always change the files in `src/`.

## Change a sentence

All the words of the site are in `src/content/`, one file per page:

| To change words on | Open |
|---|---|
| Home | `src/content/home.json` |
| How it works | `src/content/how.json` |
| For brands | `src/content/brands.json` |
| About | `src/content/about.json` |
| Questions | `src/content/questions.json` |
| Contact | `src/content/contact.json` |
| Apply | `src/content/apply.json` |
| Privacy, Terms | `src/content/privacy.json`, `src/content/terms.json` |
| Menu, footer, email, phone, commission table, closing section, form messages | `src/content/site.json` |
| The title and description shown by search engines | `src/content/seo.json` |

1. Open the file in a text editor and find the sentence.
2. Change the text between the quotation marks, and nothing else: keep the quotation
   marks, the commas and the name before the colon.
3. Save, then run `node build.js` (or keep `node build.js --serve` running).

If the build says a file "is not valid JSON", a quotation mark or a comma went
missing in that file. A text in square brackets, such as `[lead: one sentence, max 22 words]`,
is a placeholder that still has to be written.

To add the phone number later, type it between the quotation marks of `"phone": ""`
in `src/content/site.json`. It appears on the site once it is filled in.

## Change an image

1. Put the new picture in `src/assets/img/` under the same file name as the old one
   (for example `hero.jpg`), in the same pixel size.
2. Open `src/content/images.json` and update the entry: `alt` (a short description
   for people who cannot see the picture), `credit` and `creditUrl`. If the size
   changed, update `width` and `height` too.
3. Run `node build.js`.

## Where everything lives

```
docs/              brand-info.md (every brand fact) and design-brief.md (the design rules)
src/content/       all words and image descriptions, as .json files
src/pages/         one .html file per page (only the part between header and footer)
src/partials/      pieces shared by pages: layout, head, header, footer, hero, closing, logo
src/partials/icons the icons, one .svg file each
src/css/           the styles: tokens, base, components, header, footer, hero, sections, motion
src/js/            the scripts: nav, hero, forms, motion
src/assets/        photos (img/), illustrations (illustrations/), logo files (logo/)
src/static/        files copied to the site as they are (robots.txt)
build.js           joins everything into the finished site
site/              the finished site (generated; do not edit by hand)
```

## For the people who build the site

### Commands

```
node build.js                 build src/ into site/
node build.js --out <dir>     build into another folder
node build.js --strict        exit with code 1 if a template asks for a key that does not exist
node build.js --serve [port]  build, serve (default port 8000) and rebuild when src/ changes
node build.js --self-test     run the tests of the template engine
```

### What the build does

- Every `src/pages/<name>.html` is a page **body**. It is placed in
  `src/partials/layout.html` at `{{{body}}}` and written to `site/<name>.html`.
- The `PAGES` list at the top of `build.js` gives every page file an id
  (`index.html` is `home`, `how-it-works.html` is `how`, and so on).
- The stylesheets in `src/css/` are joined, in the order listed above, into
  `site/assets/site.css`. The scripts in `src/js/` are joined into `site/assets/site.js`.
  Nothing is minified.
- `src/assets/` is copied to `site/assets/`, and `src/static/` to the top of `site/`.
- Every link and file path is relative, with no leading slash (`assets/img/hero.jpg`,
  `apply.html`), so the site works from any folder.

### Data in templates

Each file `src/content/<name>.json` is available under its name: `site`, `home`, `how`,
`brands`, `about`, `questions`, `contact`, `apply`, `privacy`, `terms`, `images`, `seo`.

The build adds:

- `page.id`, `page.file`, `page.isHome`, and `page.title` and `page.description`
  (from `seo.pages.<id>`).
- `page.is.<id>`: true only on that page, for example `{{#if page.is.apply}}`.
- `current` on every item of `site.nav`: true when the item's `id` is the id of the
  page being built. Used for `aria-current="page"` in the header.
- `<body data-page="<id>">` in the layout, as a hook for page-specific styles.

### Template syntax

| Write | To get |
|---|---|
| `{{home.hero.title}}` | The value, safe for HTML (`<` becomes `&lt;`, and so on) |
| `{{{body}}}` | The value exactly as it is, HTML included |
| `{{> closing}}` | The file `src/partials/closing.html` |
| `{{> icons/arrow-right}}` | The file `src/partials/icons/arrow-right.svg` |
| `{{#each home.process.steps}} ... {{/each}}` | The inside once per item of a list |
| `{{#if site.contact.phone}} ... {{else}} ... {{/if}}` | The first part if the value exists and is not empty, otherwise the second. `{{else}}` is optional. |
| `{{#unless @last}} ... {{/unless}}` | The inside only if the value is empty or missing |

Inside `{{#each}}`:

- `{{this}}` is the item itself, for lists of plain texts.
- `{{title}}` or `{{this.title}}` reads a key of the item. If the item has no such key,
  the key is looked up in the surrounding list item, and then in the page data. So
  `{{site.labels.example}}` works anywhere.
- `{{@index}}` counts from 0, `{{@number}}` counts from 1. `{{@first}}` and `{{@last}}`
  are true for the first and the last item: `{{#if @first}} ... {{/if}}`.
- Lists can be nested.

Good to know:

- Empty text, an empty list, `false` and a missing key count as "no" in `{{#if}}` and
  `{{#unless}}`.
- Partials can include other partials and see the same data, including the current
  list item.
- A `{{#each}}`, `{{#if}}`, `{{else}}` or closing tag that stands alone on a line
  leaves no empty line in the page.
- A key that does not exist shows on the page as `⟦key⟧`, and the build prints
  `MISSING {{key}} in <file>` at the end. With `--strict` the build then fails.
  (Inside `{{#if}}` and `{{#unless}}` a missing key is not an error; it just counts as "no".)
- There is nothing else: no helpers, no comparisons, no partial arguments.
- Two opening braces always start a template tag, so do not write `{{` in a page for anything else.

### Who owns which file

See `docs/design-brief.md`, section 12. Each stylesheet and script starts with a
comment that names its owner and what belongs in it.
