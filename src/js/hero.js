/*
 * hero.js
 * Owner: Hero agent. (The Animation agent polishes the timing.)
 *
 * Purpose: chooses the opening of the home hero ([data-intro]) and says so with
 * data-hero on <html>. Every movement itself is a CSS animation in hero.css.
 *   "intro"   first home view of a browser session: the symbol alone on ink
 *   "open"    then the picture grows from a card and the headline rises line by line
 *   "return"  later views in the session: only a short rise of the text
 *   "done"    settled: nothing is hidden or moving
 * With reduced motion it does nothing: the hero is already complete.
 * See docs/design-brief.md, section 7.
 */
(function () {
  'use strict';

  var HOLD = 400;      // ms the symbol stands alone before the picture opens
  var PATIENCE = 900;  // ms at most that the symbol waits for the picture and the font
  var FAILSAFE = 2500; // ms after which the hero is shown settled, whatever happened

  var root = document.documentElement;
  var hero = document.querySelector('.hero[data-intro]');
  var motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  if (!hero || !motion) return;

  var title = hero.querySelector('.hero__title');
  var photo = hero.querySelector('.hero__photo');
  var note = hero.querySelector('.hero__note');
  var words = title ? title.textContent : '';
  var done = false;

  // Settle: end every animation and put the headline back as plain text.
  function finish() {
    if (done) return;
    done = true;
    root.setAttribute('data-hero', 'done');
    if (title && title.firstElementChild) title.textContent = words;
  }

  // True only on the first home view of this browser session. Without storage: never.
  function firstView() {
    try {
      if (sessionStorage.getItem('sf-intro')) return false;
      sessionStorage.setItem('sf-intro', '1');
      return true;
    } catch (e) {
      return false;
    }
  }

  // A promise that resolves after ms milliseconds.
  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Resolves when the picture is decoded and the headline font is loaded (or cannot be).
  function ready() {
    var jobs = [];
    var font = title && getComputedStyle(title);
    if (photo && photo.decode) jobs.push(photo.decode());
    if (font && document.fonts && document.fonts.load) {
      jobs.push(document.fonts.load(font.fontStyle + ' ' + font.fontWeight + ' 1em ' + font.fontFamily));
    }
    return Promise.all(jobs).catch(function () {});
  }

  // Wrap each word of the headline in a mask and number its line, so that the lines rise in turn.
  function splitLines() {
    var line = -1;
    var top = null;
    title.textContent = '';
    words.trim().split(/\s+/).forEach(function (word, i) {
      var mask = document.createElement('span');
      var inner = document.createElement('span');
      mask.className = 'hero__w';
      inner.textContent = word;
      mask.appendChild(inner);
      if (i) title.appendChild(document.createTextNode(' '));
      title.appendChild(mask);
    });
    Array.prototype.forEach.call(title.children, function (mask) {
      if (top === null || Math.abs(mask.offsetTop - top) > 4) {
        top = mask.offsetTop;
        line += 1;
      }
      mask.style.setProperty('--hero-line', line);
    });
  }

  // Nothing is hidden (the CSS failsafe has already fired) or the page is not at its top: no opening.
  if (!note || getComputedStyle(note).opacity !== '0' || window.pageYOffset > 8) {
    finish();
    return;
  }

  // Settled as soon as nothing in the hero is moving any more; the timer is the failsafe.
  hero.addEventListener('animationend', function () {
    if (!hero.getAnimations) return;
    var moving = hero.getAnimations({ subtree: true }).some(function (a) { return a.playState === 'running'; });
    if (!moving) finish();
  });
  setTimeout(finish, FAILSAFE);

  // Later views in the session: only the short rise.
  if (!firstView()) {
    root.setAttribute('data-hero', 'return');
    return;
  }

  // First view: the symbol alone, until the hold is over and the picture is ready.
  root.setAttribute('data-hero', 'intro');
  Promise.race([Promise.all([wait(HOLD), ready()]), wait(PATIENCE)]).then(function () {
    if (done) return;
    if (title) splitLines();
    root.setAttribute('data-hero', 'open');
  });
})();
