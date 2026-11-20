/*
 * hero.js
 * Owner: Hero agent. (The Animation agent polishes the timing.)
 *
 * Purpose: chooses the opening of the home hero ([data-intro]) and says so with
 * data-hero on <html>. Every movement of the opening is a CSS animation in hero.css.
 *   "intro"   first home view of a browser session: the symbol alone on ink
 *   "open"    the giant name and the card, then the full picture and the headline
 *   "return"  later views in the session: only a short rise of the text
 *   "done"    settled; motion.js waits for this before its scroll effects start
 * The first scroll, key or pointer press during the opening jumps to "done".
 * Once settled it gives the hero quiet life: the picture leans toward a fine
 * pointer, and folds back into a card as the screen scrolls away (the slow
 * drift itself is CSS; this script only pauses it while it cannot be seen).
 * With reduced motion it only writes "done": the hero is already complete.
 * See docs/design-brief.md, section 7.
 */
(function () {
  'use strict';

  var HOLD = 350;       // ms the symbol stands alone before the opening starts
  var PATIENCE = 600;   // ms at most that the symbol waits for the picture and the fonts
  var FAILSAFE = 3000;  // ms after which the hero is shown settled, whatever happened
  var LEAN = 12;        // px the picture leans toward the pointer (hero.css hides this much margin)
  var SHRINK = 0.14;    // how much smaller the card is once the hero has scrolled away (phones: half)
  var LIFT = 0.3;       // how much faster than the page the text lifts as it leaves

  var root = document.documentElement;
  var hero = document.querySelector('.hero[data-intro]');
  var motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  if (!hero) return;
  if (!motion) {
    root.setAttribute('data-hero', 'done');
    return;
  }

  var title = hero.querySelector('.hero__title');
  var brand = hero.querySelector('.hero__brand-word');
  var stage = hero.querySelector('.hero__stage');
  var picture = hero.querySelector('.hero__stage picture');
  var text = hero.querySelector('.hero__text');
  var photo = hero.querySelector('.hero__photo');
  var note = hero.querySelector('.hero__note');
  var words = title ? title.textContent : '';
  var name = brand ? brand.textContent : '';
  var skips = ['wheel', 'touchmove', 'keydown', 'pointerdown', 'scroll'];
  var done = false;

  // Settle: end every animation, put the words back as plain text, and start the settled life.
  function finish() {
    if (done) return;
    done = true;
    skips.forEach(function (type) { window.removeEventListener(type, finish, true); });
    root.setAttribute('data-hero', 'done');
    if (title && title.firstElementChild) title.textContent = words;
    if (brand && brand.firstElementChild) brand.textContent = name;
    try {
      settle();
    } catch (e) {
      // The settled life is a nicety: the hero is complete without it.
    }
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

  // The CSS font shorthand of an element, at 1em, for document.fonts.load.
  function fontOf(el) {
    var s = getComputedStyle(el);
    return s.fontStyle + ' ' + s.fontWeight + ' 1em ' + s.fontFamily;
  }

  // Resolves when the picture is decoded and both serif cuts are loaded (or cannot be).
  function ready() {
    var jobs = [];
    if (photo && photo.decode) jobs.push(photo.decode());
    if (document.fonts && document.fonts.load) {
      [title, brand].forEach(function (el) { if (el) jobs.push(document.fonts.load(fontOf(el))); });
    }
    return Promise.all(jobs).catch(function () {});
  }

  // Wrap each letter of the giant name in a span numbered --hero-i, so the letters rise in turn.
  function splitName() {
    brand.textContent = '';
    name.split('').forEach(function (letter, i) {
      var span = document.createElement('span');
      span.textContent = letter;
      span.style.setProperty('--hero-i', i);
      brand.appendChild(span);
    });
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

  // The settled life: pause the drift when unseen, fold the card on scroll, lean toward the pointer.
  function settle() {
    var height = hero.offsetHeight;
    var shrink = SHRINK;
    var lift = LIFT;
    var last = -1;
    var queued = false;
    var seen = true;
    var lean = null;
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // Paused while the hero is off screen or the tab is hidden.
    function still() {
      hero.classList.toggle('is-still', !seen || document.hidden);
    }

    // Measure the hero and choose the lighter fold on narrow screens.
    function measure() {
      height = hero.offsetHeight || 1;
      var narrow = window.matchMedia('(max-width: 860px)').matches;
      shrink = narrow ? SHRINK / 2 : SHRINK;
      lift = narrow ? LIFT * 0.66 : LIFT;
      last = -1;
      request();
    }

    // One frame: the card shrinks and the text lifts and fades with the scroll; the lean is applied.
    function frame() {
      queued = false;
      var y = Math.max(0, window.pageYOffset);
      var p = Math.min(1, y / height);
      if (p !== last && (p < 1 || last < 1)) {
        last = p;
        stage.style.transform = p ? 'scale(' + (1 - shrink * p).toFixed(4) + ')' : '';
        hero.classList.toggle('is-leaving', p > 0);
        text.style.transform = p ? 'translate3d(0,' + (-y * lift).toFixed(1) + 'px,0)' : '';
        text.style.opacity = p ? Math.max(0, 1 - p * 1.8).toFixed(3) : '';
      }
      if (lean && picture) {
        picture.style.transform = 'translate3d(' + lean[0].toFixed(1) + 'px,' + lean[1].toFixed(1) + 'px,0)';
        lean = null;
      }
    }

    // Asks for one frame, however many events arrive before it.
    function request() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(frame);
    }

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        seen = entries[entries.length - 1].isIntersecting;
        still();
      }).observe(hero);
    }
    document.addEventListener('visibilitychange', still);
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', measure, { passive: true });

    // Fine pointers only: the picture leans a few pixels toward the pointer, and back when it leaves.
    if (fine && picture) {
      window.addEventListener('pointermove', function (event) {
        if (!seen || event.pointerType !== 'mouse') return;
        lean = [(event.clientX / window.innerWidth - 0.5) * 2 * LEAN, (event.clientY / window.innerHeight - 0.5) * 2 * LEAN];
        request();
      }, { passive: true });
      document.documentElement.addEventListener('pointerleave', function () {
        lean = [0, 0];
        request();
      });
    }

    measure();
  }

  // Nothing is hidden (the CSS failsafe has already fired) or the page is not at its top: no opening.
  if (!note || getComputedStyle(note).opacity !== '0' || window.pageYOffset > 8) {
    finish();
    return;
  }

  // Settled as soon as nothing in the hero is moving any more; the timer is the failsafe.
  hero.addEventListener('animationend', function () {
    if (done || !hero.getAnimations) return;
    var moving = hero.getAnimations({ subtree: true }).some(function (a) { return a.playState === 'running'; });
    if (!moving) finish();
  });
  setTimeout(finish, FAILSAFE);

  // The opening never traps the visitor: the first scroll, key or pointer press settles it.
  skips.forEach(function (type) { window.addEventListener(type, finish, { capture: true, passive: true }); });

  // Later views in the session: only the short rise.
  if (!firstView()) {
    root.setAttribute('data-hero', 'return');
    return;
  }

  // First view: the symbol alone, until the hold is over and the picture is ready.
  root.setAttribute('data-hero', 'intro');
  Promise.race([Promise.all([wait(HOLD), ready()]), wait(PATIENCE)]).then(function () {
    if (done) return;
    if (brand) splitName();
    if (title) splitLines();
    root.setAttribute('data-hero', 'open');
  });
})();
