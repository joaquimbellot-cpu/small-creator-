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

## Things to fill in before the site goes public

All of these are empty or marked today, and the site says so honestly until you fill them in.

### The phone number

In `src/content/site.json`, under `"contact"`, fill in two lines:

- `"phone"`: the number as people should read it, for example `"+1 555 010 0000"`.
- `"phoneHref"`: the same number with no spaces or brackets, for example `"+15550100000"`.
  This is what a phone dials when the number is tapped.

The number then appears in the menu, the footer and on the Contact page.

### The forms (applications and brand inquiries)

The two forms (the application on Apply and the brand inquiry on For brands) are handled by
the back office, which lives in `admin/`. They need no outside form service. An application
creates a new creator in the back office with status New. A brand inquiry appears on the
back office's Inbox page.

Nothing needs filling in here. The Privacy page may still have a blank for the name of the
service that handles the forms. Check that page's wording, and have the owner or a lawyer approve it.

### The site's address

When you know the address the site will live at, open `src/content/seo.json` and fill in
`"siteUrl"` with the full address ending in a slash, for example `"https://www.example.com/"`.
After the next build, search engines get the correct page addresses and a sitemap, and
links shared on social media show the Smallfold picture.

### The legal pages

`src/content/privacy.json` and `src/content/terms.json` are drafts. Every blank is written
like `<mark class="blank">(legal name to be added)</mark>` and shows on the page in a dashed
frame. Replace the whole thing, from `<mark` to `</mark>`, with the real text. Have the
owner or a lawyer check both pages, then remove the draft notice by deleting the
`draftNotice` text. In these two files only, a paragraph may contain HTML, so write `&amp;`
for an ampersand.

## Change an image

Each picture exists twice in `src/assets/img/`: the full one (for example `about.jpg`)
and a smaller copy for phones (`about-small.jpg`).

1. Save the new picture under the same file name as the old one, in the same pixel size.
   `src/content/images.json` lists the size of every picture (`width`, `height`).
2. Save a smaller copy under the `-small` name, at the width given by `widthSmall`.
3. In `src/content/images.json`, update the entry: `alt` (a short description for people
   who cannot see the picture), and `credit`, `creditUrl` and `licence` if the picture
   came from someone else. If a size changed, update `width`, `height` and `widthSmall`.
4. Add the picture to the table in `docs/image-credits.md`.
5. Run `node build.js`.

The home page's first picture has two shapes: `hero.jpg` (wide, for desktops) and
`hero-tall.jpg` (upright, for phones). Replace both, and both `-small` copies. Keep the
middle of the picture calm and dark enough for the headline that sits on it.

## Where everything lives

```
docs/              brand-info.md (every brand fact), design-brief.md (the design rules),
                   open-questions.md (what the owner still has to decide), image-credits.md
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
                              (another port: node build.js --serve 8080)
node build.js --styleguide    also build styleguide.html, the reference page for every component
node build.js --self-test     run the tests of the template engine
```

### What the build does

- Every `src/pages/<name>.html` is a page **body**. It is placed in
  `src/partials/layout.html` at `{{{body}}}` and written to `site/<name>.html`.
- The `PAGES` list at the top of `build.js` gives every page file an id
  (`index.html` is `home`, `how-it-works.html` is `how`, and so on).
- The stylesheets in `src/css/` are joined, in the order listed above, into
  `site/assets/site.css`, without their comments. The scripts in `src/js/` are joined into
  `site/assets/site.js`. Nothing else is minified.
- The style guide page is left out unless you ask for it with `--styleguide`.
- When `seo.siteUrl` is filled in, the build also writes `sitemap.xml` and adds it to `robots.txt`.
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

## The back office

The website and the back office launch together. They are one app in the `admin/` folder,
and Netlify deploys that folder. When the app is built, it also builds this website into
`admin/public/`, so the website is at the main address and the back office is at `/login` and
the pages after it. The back office runs the company side of Smallfold: finding creators,
sending emails, and tracking deals. It is private. Its own guide, with a test run on your
computer and the steps to put it online, is in `admin/README.md`.
