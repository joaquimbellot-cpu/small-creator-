/* ===== src/js/nav.js ===== */
/*
 * nav.js
 * Owner: Header and Footer agent.
 *
 * The behaviour of the header (src/partials/header.html, src/css/header.css):
 *   - on home, the bar is clear at the top of the page and solid once the page has left it;
 *   - the bar slides out of view on the way down and returns on the way up;
 *   - at 860px and below, the Menu button opens the full-screen menu.
 * See docs/design-brief.md, section 8. No words live here: every label is in the markup.
 *
 * Classes it sets: .is-solid and .is-hidden on .site-header, .menu-open on <html>.
 */
(function () {
  'use strict';

  // The parts. Without a header there is nothing to do.
  var root = document.documentElement;
  var header = document.querySelector('[data-header]');
  if (!header) return;
  var menu = header.querySelector('[data-menu]');
  var openButton = header.querySelector('[data-menu-open]');
  var closeButton = header.querySelector('[data-menu-close]');
  var hasMenu = !!(menu && openButton && closeButton && menu.showModal);

  // State: where the page was at the last look, and what the bar is doing.
  var JITTER = 4;            // px of movement that do not count as a change of direction
  var topZone = 0;           // px from the top in which the bar is clear (on home) and never hides
  var lastY = 0;
  var hidden = false;
  var solid = false;
  var queued = false;

  // Writes the state to the header as two classes.
  function render() {
    header.classList.toggle('is-hidden', hidden);
    header.classList.toggle('is-solid', solid);
  }

  // True while the bar must stay in view: the menu is open, or the keyboard is inside the bar.
  function pinned() {
    if (hasMenu && menu.open) return true;
    try {
      return !!header.querySelector(':focus-visible');
    } catch (error) {
      return header.contains(document.activeElement);
    }
  }

  // One look per frame: read the scroll position, then decide shown or hidden, solid or clear.
  function update() {
    queued = false;
    var y = Math.max(0, window.pageYOffset);
    var moved = y - lastY;
    var atTop = y <= topZone;
    // A move counts once it is more than jitter; the first step out of the top zone always counts.
    var counts = Math.abs(moved) >= JITTER || lastY <= topZone;

    if (atTop || pinned()) {
      hidden = false;
    } else if (counts) {
      hidden = moved > 0;
    }
    if (atTop || counts) lastY = y;

    // A bar that leaves the top stays clear while it slides away; see 'transitionend' below.
    if (atTop) {
      solid = false;
    } else if (!hidden) {
      solid = true;
    }
    render();
  }

  // Asks for one look at the next frame, however many scroll events arrive before it.
  function request() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  }

  // Measures the bar (on load and when the window changes size), then takes a look.
  function measure() {
    topZone = header.offsetHeight;
    request();
  }

  // Once the bar is out of view it turns solid, ready for its return.
  header.addEventListener('transitionend', function (event) {
    if (event.target !== header || event.propertyName !== 'transform' || !hidden) return;
    solid = true;
    render();
  });

  // Scrolling and resizing never wait for this script.
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', measure, { passive: true });

  // The keyboard entering the bar brings it back into view.
  header.addEventListener('focusin', request);

  lastY = Math.max(0, window.pageYOffset);
  measure();

  // Everything below is the phone menu.
  if (!hasMenu) return;

  // Opens the menu as a modal dialog and moves the keyboard to its Close button.
  function openMenu() {
    if (menu.open) return;
    menu.showModal();
    openButton.setAttribute('aria-expanded', 'true');
    root.classList.add('menu-open');
    closeButton.focus();
    request();
  }

  // Closes the menu; the tidying up happens in the 'close' listener below.
  function closeMenu() {
    if (menu.open) menu.close();
  }

  // However the menu was closed (button, Escape, a link): unlock the page and return the keyboard.
  menu.addEventListener('close', function () {
    openButton.setAttribute('aria-expanded', 'false');
    root.classList.remove('menu-open');
    openButton.focus();
    request();
  });

  // The Menu button opens.
  openButton.addEventListener('click', openMenu);

  // The Close button closes, and so does choosing any link in the menu.
  menu.addEventListener('click', function (event) {
    if (event.target.closest('a[href], [data-menu-close]')) closeMenu();
  });

  // Escape closes. Tab stays inside: from the last control on to the first, and back.
  menu.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key !== 'Tab') return;
    var controls = menu.querySelectorAll('a[href], button:not([disabled])');
    var first = controls[0];
    var last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // The menu belongs to small screens: growing the window past 860px closes it.
  var phone = window.matchMedia('(max-width: 860px)');
  var onWidth = function (event) {
    if (!event.matches) closeMenu();
  };
  if (phone.addEventListener) phone.addEventListener('change', onWidth);
  else if (phone.addListener) phone.addListener(onWidth);
})();

/* ===== src/js/hero.js ===== */
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

/* ===== src/js/forms.js ===== */
/*
 * forms.js
 * Owner: Content Sections agent.
 *
 * Purpose: the application form (apply.html) and the brand enquiry form
 * (brands.html). It checks the fields, shows one message under each field that
 * needs fixing and clears it once fixed, sends the form to the address in
 * site.forms.endpoint, and says plainly when the form is not connected yet
 * (the endpoint is empty). See docs/design-brief.md, section 9.
 *
 * This file holds no words. Every message comes from src/content, printed into
 * the page as data attributes and <template> elements:
 *
 *   form[data-form]                 a form this script looks after
 *     data-endpoint                 where to send it; empty means "not connected"
 *     data-errors-one, -many        the summary line above the fields
 *     data-sending                  the label of the button while sending
 *   [data-error]                    on a control: its message
 *   [data-validate]                 email, phone, channel or subscribers
 *   [data-min] [data-max]           the range of the subscriber count
 *   [data-error-range]              the message for a count outside that range
 *   [data-form-notice]              the "not connected" notice above the first field;
 *                                   in the page only while the endpoint is empty
 *   [data-form-summary]             live region for the summary line
 *   [data-form-status]              live region for "sent"
 *   [data-form-alert]               live region for "did not send"
 *   template[data-form-template]    summary, success, error
 *
 * While the endpoint is empty a form has method="dialog", which sends nothing
 * even without this script, and a <noscript> note beside the button says so.
 */
(function () {
  'use strict';

  const forms = document.querySelectorAll('form[data-form]');
  if (!forms.length) return;

  // The shapes a value must have.
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const HANDLE = /^@[\p{L}\p{N}_.\-]{3,30}$/u;
  const CHANNEL = /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/[^\s/?#][^\s]*$/i;
  const WHOLE = /^\d+$|^\d{1,3}(?:[ ,.\u00a0]\d{3})+$/;
  const PHONE = /^[\d\s()+.\-\/]+$/;
  const PHONE_DIGITS = 7;

  // Forms that are being sent.
  const busy = new WeakSet();

  // Keeps only the digits of a text.
  const digits = (text) => String(text || '').replace(/\D/g, '');

  // Reads a limit such as "1,000" from a data attribute.
  const limit = (text, fallback) => (digits(text) ? Number(digits(text)) : fallback);

  // The controls of a form that carry a message.
  const controlsOf = (form) => Array.from(form.querySelectorAll('[data-error]'));

  // Returns the message for a control that needs fixing, or an empty text.
  function check(control) {
    const value = control.value.trim();
    const data = control.dataset;
    const message = data.error || '';
    if (!value) return control.required ? message : '';
    if (data.validate === 'email') return EMAIL.test(value) ? '' : message;
    if (data.validate === 'channel') return HANDLE.test(value) || CHANNEL.test(value) ? '' : message;
    if (data.validate === 'phone') {
      return PHONE.test(value) && digits(value).length >= PHONE_DIGITS ? '' : message;
    }
    if (data.validate === 'subscribers') {
      if (!WHOLE.test(value)) return message;
      const count = Number(digits(value));
      const inRange = count >= limit(data.min, 0) && count <= limit(data.max, Infinity);
      return inRange ? '' : data.errorRange || message;
    }
    return '';
  }

  // Shows the message under a control, or clears it when the message is empty.
  function mark(control, message) {
    const field = control.closest('.field');
    const error = field && field.querySelector('.field__error');
    if (message) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
    if (error) error.textContent = message;
  }

  // Puts a copy of one of the form's message templates into one of its live regions.
  function say(form, region, name, text) {
    const box = form.querySelector('[data-form-' + region + ']');
    const template = form.querySelector('template[data-form-template="' + name + '"]');
    if (!box) return;
    box.textContent = '';
    if (!template) return;
    const copy = template.content.cloneNode(true);
    if (text && copy.firstElementChild) copy.firstElementChild.textContent = text;
    box.appendChild(copy);
  }

  // Empties a live region.
  function hush(form, region) {
    const box = form.querySelector('[data-form-' + region + ']');
    if (box) box.textContent = '';
  }

  // Writes the summary line: how many fields need fixing.
  function summarise(form, again) {
    const count = form.querySelectorAll('[aria-invalid="true"]').length;
    const box = form.querySelector('[data-form-summary]');
    if (!box) return;
    if (!count) {
      box.textContent = '';
      return;
    }
    const text = count === 1 ? form.dataset.errorsOne : count + ' ' + form.dataset.errorsMany;
    if (again || box.textContent !== text) say(form, 'summary', 'summary', text);
  }

  // Checks every control; returns the ones that need fixing.
  function checkAll(form) {
    return controlsOf(form).filter((control) => {
      const message = check(control);
      mark(control, message);
      return Boolean(message);
    });
  }

  // Sends the form and reports how it went.
  function send(form, endpoint) {
    const button = form.querySelector('[type="submit"]');
    const label = button ? button.textContent : '';
    busy.add(form);
    if (button) {
      button.setAttribute('aria-busy', 'true');
      button.textContent = form.dataset.sending || label;
    }
    fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        form.reset();
        say(form, 'status', 'success');
      })
      .catch(() => {
        say(form, 'alert', 'error');
      })
      .finally(() => {
        busy.delete(form);
        if (button) {
          button.removeAttribute('aria-busy');
          button.textContent = label;
        }
      });
  }

  // A press on the send button.
  function onSubmit(event) {
    const form = event.currentTarget;
    event.preventDefault();
    if (busy.has(form)) return;

    // A filled trap field means a robot: do nothing.
    const trap = form.querySelector('[name="_gotcha"]');
    if (trap && trap.value) return;

    hush(form, 'status');
    hush(form, 'alert');

    const wrong = checkAll(form);
    summarise(form, true);
    if (wrong.length) {
      wrong[0].focus();
      return;
    }

    // No endpoint: move to the notice that says the form is not connected, and keep what was typed.
    const endpoint = (form.dataset.endpoint || '').trim();
    if (!endpoint) {
      const notice = form.querySelector('[data-form-notice]');
      if (notice) {
        notice.classList.add('notice--alert'); // the frame thickens, so pressing the button visibly does something
        notice.scrollIntoView({ block: 'center' });
        notice.focus();
      }
      return;
    }
    send(form, endpoint);
  }

  // While typing: a field that needed fixing is cleared once it is right. New mistakes wait for the next press, so nothing moves under a click.
  function onInput(event) {
    const form = event.currentTarget;
    const control = event.target;
    if (!control.matches('[data-error][aria-invalid="true"]')) return;
    mark(control, check(control));
    summarise(form, false);
  }

  forms.forEach((form) => {
    // The checks of this script replace the browser's own bubbles.
    form.noValidate = true;
    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
  });
})();

/* ===== src/js/motion.js ===== */
/*
 * motion.js
 * Owner: Animation agent.
 *
 * Purpose: the scroll effects behind the hooks [data-reveal], [data-reveal="words"],
 * [data-reveal="lines"], [data-parallax] and the moving canvas for [data-threads],
 * and, for the home page, [data-showcase] (the pinned differences), [data-process]
 * (the pinned "how a match is made", whose chosen thread draws with the scroll)
 * and [data-count] (a number that counts up to its value).
 * The styles and hidden starting states are in motion.css.
 * Nothing runs when reduced motion is on. On the home page nothing starts before
 * the hero has settled (data-hero="done" on <html>). Any error shows the page
 * complete and still. See docs/design-brief.md, section 7.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var media = window.matchMedia && window.matchMedia('(prefers-reduced-motion: no-preference)');

  // Reduced motion, no matchMedia or no html.js: do nothing; the page is already complete.
  if (!media || !media.matches || !root.classList.contains('js')) return;

  var BLOCK_MS = 2200;   // longest a block entrance can take (1300ms + 4 steps of 90ms, with room)
  var LINES_MS = 3200;   // longest a heading entrance can take (several lines, with room)
  var FONT_MS = 1200;    // longest a heading waits for its font before it is measured
  var HERO_MS = 3200;    // longest the home page waits for the hero to settle
  var DRIFT = 0.08;      // the band picture moves 8% slower than the page
  var WORDS_FROM = 0.85; // the statement starts darkening when its top reaches 85% of the screen...
  var WORDS_TO = 0.5;    // ...and is fully dark when its bottom reaches the middle
  var THREAD_SWAY = 7;   // how far a thread sways, in units of the 1200 x 800 drawing
  var DRAW_MS = 2400;    // how long the chosen thread takes to draw itself
  var COUNT_MS = 1600;   // how long a number takes to count up
  var PICK_MS = 1400;    // how long a clicked difference holds while the page scrolls to it
  var THREAD_FROM = 0.04; // the pinned thread starts drawing at 4% of its track...
  var THREAD_TO = 0.8;   // ...and is complete at 80%
  var STEP_AT = 0.75;    // on a phone a step lights when its top passes 75% of the screen
  // Pinning happens only where it fits: the same query as in sections.css.
  var WIDE = '(min-width: 861px) and (min-height: 600px)';

  var stopped = false;
  var stops = [];        // what to call to stop every running effect
  var ticks = [];        // what to run in the frame after a scroll or a resize
  var resized = [];      // what to run in the frame after a resize only
  var wasResized = false;
  var threadScrub = null; // set by process(): the chosen thread's progress from the scroll, or null

  // Stop everything and show the page complete and still; an error is passed on so it can be seen.
  function fail(error) {
    if (!stopped) {
      stopped = true;
      root.classList.remove('mo-on');
      root.classList.add('mo-off');
      stops.forEach(function (stop) { try { stop(); } catch (e) {} });
    }
    if (error) setTimeout(function () { throw error; });
  }

  // Wraps a callback so that an error in it calls fail().
  function safe(fn) {
    return function () {
      if (stopped) return;
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        fail(e);
      }
    };
  }

  // Number of the data-reveal-delay step (0 to 4).
  function delayOf(el) {
    return Math.min(4, Math.max(0, parseInt(el.getAttribute('data-reveal-delay'), 10) || 0));
  }

  // Replaces an element's children (with a fallback for older browsers).
  function setChildren(el, nodes) {
    el.textContent = '';
    nodes.forEach(function (node) { el.appendChild(node); });
  }

  // A deep copy of nodes in which every word of text is wrapped by make(word); spaces stay plain text,
  // or, with glue, stay inside the word before them (inline spans then shape the text exactly as before).
  function splitWords(nodes, make, glue) {
    var out = [];
    nodes.forEach(function (node) {
      if (node.nodeType === 3) {
        node.nodeValue.split(glue ? /^(\s+)|(\S+\s*)/ : /(\s+)/).forEach(function (part) {
          if (!part) return;
          out.push(/^\s+$/.test(part) ? document.createTextNode(part) : make(part));
        });
      } else if (node.nodeType === 1) {
        var copy = node.cloneNode(false);
        setChildren(copy, splitWords(Array.prototype.slice.call(node.childNodes), make, glue));
        out.push(copy);
      } else {
        out.push(node.cloneNode(true));
      }
    });
    return out;
  }

  // Shared frame loop for the scroll and resize work: one rAF per frame at most.
  var queued = false;
  function frame() {
    queued = false;
    if (wasResized) {
      wasResized = false;
      resized.forEach(function (fn) { fn(); });
    }
    ticks.forEach(function (tick) { tick(); });
  }
  function onResize() {
    wasResized = true;
    request();
  }

  // An array of the elements that match a selector inside root.
  function all(rootEl, selector) {
    return Array.prototype.slice.call(rootEl.querySelectorAll(selector));
  }

  // How far the page has scrolled through a tall track: 0 when its top meets the top
  // of the screen, 1 when its bottom meets the bottom (its sticky content then lets go).
  function trackProgress(el) {
    var rect = el.getBoundingClientRect();
    var run = rect.height - window.innerHeight;
    if (run <= 0) return rect.top <= 0 ? 1 : 0;
    return Math.max(0, Math.min(1, -rect.top / run));
  }

  // The page position at which a track has reached progress p.
  function trackTop(el, p) {
    var rect = el.getBoundingClientRect();
    return window.pageYOffset + rect.top + Math.max(0, rect.height - window.innerHeight) * p;
  }
  function request() {
    if (!queued && !stopped) {
      queued = true;
      requestAnimationFrame(safe(frame));
    }
  }

  /* ---------- 1 and 2. Blocks and headings: [data-reveal], [data-reveal="lines"] ---------- */

  function reveals() {
    var all = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]:not([data-reveal="words"])'));
    var waiting = all.filter(function (el) { return !el.closest('.hero'); });
    var split = [];   // headings currently cut into words

    all.forEach(function (el) { if (el.closest('.hero')) el.classList.add('is-done'); });

    // Ends an entrance: a split heading gets its own text back, untouched.
    function settle(el) {
      if (el.classList.contains('is-done')) return;
      if (el._moNodes) {
        setChildren(el, el._moNodes);
        el._moNodes = null;
        if (split.indexOf(el) > -1) split.splice(split.indexOf(el), 1);
        el.classList.remove('is-split');
      }
      el.classList.remove('is-in');
      el.classList.add('is-done');
    }

    // Groups the masked words of a split heading into lines by their position (all reads, then all writes).
    function measure(el) {
      var line = -1;
      var top = null;
      var masks = Array.prototype.slice.call(el.querySelectorAll('.mo-m'));
      var lines = masks.map(function (mask) {
        var y = mask.offsetTop;
        if (top === null || Math.abs(y - top) > mask.offsetHeight / 2) {
          top = y;
          line += 1;
        }
        return line;
      });
      masks.forEach(function (mask, i) {
        if (mask._moLine !== lines[i]) mask.firstChild.style.setProperty('--mo-l', lines[i]);
        mask._moLine = lines[i];
      });
    }

    // Cuts a heading into masked words; gives up (block entrance instead) if that would move anything.
    function cut(el) {
      var before = el.getBoundingClientRect();
      var nodes = Array.prototype.slice.call(el.childNodes);
      setChildren(el, splitWords(nodes, function (word) {
        var mask = document.createElement('span');
        var inner = document.createElement('span');
        mask.className = 'mo-m';
        inner.textContent = word;
        mask.appendChild(inner);
        return mask;
      }));
      el._moNodes = nodes;
      el.classList.add('is-split');
      split.push(el);
      var after = el.getBoundingClientRect();
      if (Math.abs(after.height - before.height) > 0.5 || Math.abs(after.width - before.width) > 0.5) {
        setChildren(el, nodes);
        el._moNodes = null;
        split.pop();
        el.classList.remove('is-split');
        return false;
      }
      measure(el);
      return true;
    }

    // Starts the entrance of a block or a heading.
    function show(el, now) {
      if (el.classList.contains('is-in') || el.classList.contains('is-done')) return;
      if (io) io.unobserve(el);
      if (now) return settle(el);
      var isLines = el.getAttribute('data-reveal') === 'lines';
      var ended = 0;
      var total = 1;
      if (isLines && cut(el)) total = el.querySelectorAll('.mo-m').length;
      el.addEventListener('animationend', safe(function (event) {
        if (event.animationName !== 'mo-up' && event.animationName !== 'mo-rise') return; // not a hover inside
        ended += 1;
        if (ended >= total) settle(el);
      }));
      el.classList.add('is-in');
      setTimeout(safe(function () { settle(el); }), isLines ? LINES_MS : BLOCK_MS);
    }

    // Headings wait for their font before being measured (at most FONT_MS).
    function whenFont(fn) {
      if (!document.fonts || document.fonts.status === 'loaded') return fn();
      var go = safe(function () { if (fn) { var f = fn; fn = null; f(); } });
      document.fonts.ready.then(go, go);
      setTimeout(go, FONT_MS);
    }

    // Shows or settles every element that is still waiting.
    function showAll(now) {
      waiting.forEach(function (el) { show(el, now); });
    }

    // No IntersectionObserver: nothing waits.
    if (!('IntersectionObserver' in window)) {
      showAll(true);
      return;
    }

    var io = new IntersectionObserver(safe(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        var top = entry.rootBounds ? entry.rootBounds.top : 0;
        if (entry.isIntersecting) {
          if (el.getAttribute('data-reveal') === 'lines') whenFont(function () { show(el); });
          else show(el);
        } else if (entry.boundingClientRect.bottom <= top) {
          show(el, true); // already scrolled past (an anchor, a jump): shown at once, without motion
        }
      });
    }), { rootMargin: '0px 0px -6% 0px', threshold: 0 });

    waiting.forEach(function (el) { io.observe(el); });

    // At the very bottom of the page nothing may still wait (a block in the last strip of the screen).
    ticks.push(function () {
      if (window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 2) showAll(false);
      split.forEach(measure);
    });

    // Keyboard focus inside a waiting block shows it at once.
    document.addEventListener('focusin', safe(function (event) {
      var el = event.target.closest && event.target.closest('[data-reveal]:not(.is-done)');
      if (el && el.getAttribute('data-reveal') !== 'words') show(el, true);
    }));

    // Printing shows everything.
    window.addEventListener('beforeprint', safe(function () { showAll(true); }));

    // A late font changes where lines break: measure again.
    if (document.fonts) document.fonts.ready.then(safe(function () { split.forEach(measure); }));

    stops.push(function () {
      io.disconnect();
      split.slice().forEach(settle);
    });
  }

  /* ---------- 3. The statement: [data-reveal="words"] ---------- */

  function words() {
    var paragraphs = Array.prototype.slice.call(document.querySelectorAll('[data-reveal="words"]'));
    if (!paragraphs.length || !('IntersectionObserver' in window)) return;

    var items = paragraphs.map(function (p) {
      setChildren(p, splitWords(Array.prototype.slice.call(p.childNodes), function (word) {
        var span = document.createElement('span');
        span.className = 'mo-word';
        span.textContent = word;
        return span;
      }, true));
      return { el: p, words: Array.prototype.slice.call(p.querySelectorAll('.mo-word')), lit: -1, active: false };
    });

    // Lights the words that the paragraph's position on screen has reached.
    function update(item) {
      var rect = item.el.getBoundingClientRect();
      var vh = window.innerHeight;
      var progress = (vh * WORDS_FROM - rect.top) / (vh * (WORDS_FROM - WORDS_TO) + rect.height);
      var count = item.words.length;
      var lit = Math.max(0, Math.min(count, Math.round(progress * count)));
      if (lit === item.lit) return;
      item.words.forEach(function (word, i) {
        if ((i < lit) !== (i < item.lit)) word.classList.toggle('is-lit', i < lit);
      });
      item.lit = lit;
    }

    // Start: set the right words first, then turn the effect on (no flash).
    items.forEach(function (item) {
      update(item);
      item.el.classList.add('is-scrub');
    });

    var io = new IntersectionObserver(safe(function (entries) {
      entries.forEach(function (entry) {
        items.forEach(function (item) {
          if (item.el !== entry.target) return;
          item.active = entry.isIntersecting;
          update(item); // also when it leaves, so a fast scroll never leaves it half done
        });
      });
    }));
    items.forEach(function (item) { io.observe(item.el); });

    ticks.push(function () {
      items.forEach(function (item) { if (item.active) update(item); });
    });

    window.addEventListener('beforeprint', safe(function () {
      items.forEach(function (item) { item.words.forEach(function (w) { w.classList.add('is-lit'); }); });
    }));

    stops.push(function () { io.disconnect(); });
  }

  /* ---------- 4. The band picture: [data-parallax] ---------- */

  function parallax() {
    var pictures = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
    if (!pictures.length || !('IntersectionObserver' in window)) return;

    var items = pictures.map(function (img) {
      return { img: img, frame: img.parentElement, active: false, y: null, s: null };
    });

    // Offset from the frame's place on screen; the zoom is just enough to cover the largest offset.
    function update(item) {
      var rect = item.frame.getBoundingClientRect();
      var vh = window.innerHeight;
      var reach = DRIFT * (vh + rect.height) / 2;
      var progress = (rect.top + rect.height / 2 - vh / 2) / ((vh + rect.height) / 2);
      progress = Math.max(-1, Math.min(1, progress));
      var y = (-progress * reach).toFixed(1);
      var s = (1 + (2 * reach + 2) / Math.max(1, rect.height)).toFixed(4);
      if (y !== item.y) item.img.style.setProperty('--mo-y', y + 'px');
      if (s !== item.s) item.img.style.setProperty('--mo-s', s);
      item.y = y;
      item.s = s;
    }

    var io = new IntersectionObserver(safe(function (entries) {
      entries.forEach(function (entry) {
        items.forEach(function (item) {
          if (item.frame !== entry.target) return;
          item.active = entry.isIntersecting;
          item.img.classList.toggle('is-drift', item.active);
          update(item);
        });
      });
    }), { rootMargin: '10% 0px' });
    items.forEach(function (item) {
      update(item);
      io.observe(item.frame);
    });

    ticks.push(function () {
      items.forEach(function (item) { if (item.active) update(item); });
    });

    stops.push(function () { io.disconnect(); });
  }

  /* ---------- 5. The threads: [data-threads] ---------- */

  // Reads the drawing's threads and dots from the SVG text, in its own 1200 x 800 units.
  function readDrawing(text, accent) {
    var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    var svg = doc.documentElement;
    var box = (svg.getAttribute('viewBox') || '0 0 1200 800').split(/[\s,]+/).map(Number);
    var drawing = { width: box[2], height: box[3], threads: [], dots: [], chosen: null };

    // An attribute of the element or of the nearest group that has it.
    function attr(el, name, fallback) {
      for (var node = el; node && node.getAttribute; node = node.parentNode) {
        if (node.hasAttribute(name)) return node.getAttribute(name);
      }
      return fallback;
    }

    // Turns path data (M, C and S, absolute) into cubic segments; null for anything else.
    function segments(d) {
      var parts = d.match(/[MCS]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
      var out = [];
      var cmd = null;
      var cur = null;
      var prev = null;
      var i = 0;
      function num() { return parseFloat(parts[i++]); }
      while (i < parts.length) {
        if (/[A-Za-z]/.test(parts[i])) cmd = parts[i++];
        if (cmd === 'M') {
          cur = [num(), num()];
          prev = null;
        } else if (cmd === 'C') {
          var seg = [cur, [num(), num()], [num(), num()], [num(), num()]];
          out.push(seg);
          cur = seg[3];
          prev = seg[2];
        } else if (cmd === 'S') {
          var c1 = prev ? [2 * cur[0] - prev[0], 2 * cur[1] - prev[1]] : cur;
          var s = [cur, c1, [num(), num()], [num(), num()]];
          out.push(s);
          cur = s[3];
          prev = s[2];
        } else {
          return null;
        }
      }
      return out.length ? out : null;
    }

    Array.prototype.forEach.call(svg.querySelectorAll('path'), function (path) {
      var segs = segments(path.getAttribute('d') || '');
      if (!segs) return;
      var thread = {
        segs: segs,
        alpha: parseFloat(attr(path, 'stroke-opacity', '1')),
        width: parseFloat(attr(path, 'stroke-width', '1')),
        phase: Math.random() * Math.PI * 2,
        speed: (Math.PI * 2) / (9000 + Math.random() * 7000)
      };
      if (attr(path, 'stroke', '').toUpperCase() === accent) drawing.chosen = thread;
      else drawing.threads.push(thread);
    });
    Array.prototype.forEach.call(svg.querySelectorAll('circle'), function (c) {
      drawing.dots.push({
        x: parseFloat(c.getAttribute('cx')),
        y: parseFloat(c.getAttribute('cy')),
        r: parseFloat(c.getAttribute('r')),
        alpha: parseFloat(attr(c, 'fill-opacity', '1')),
        chosen: attr(c, 'fill', '').toUpperCase() === accent
      });
    });
    return drawing.threads.length ? drawing : null;
  }

  // The site's easing, cubic-bezier(.22, 1, .36, 1), closely matched by an ease-out quint.
  function ease(t) {
    return 1 - Math.pow(1 - t, 5);
  }

  // The point of a cubic segment at t (0 to 1).
  function pointAt(s, t) {
    var u = 1 - t;
    return [
      u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
      u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1]
    ];
  }

  // The first part of a cubic segment, up to t (de Casteljau).
  function cutAt(s, t) {
    function mix(a, b) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    var a = mix(s[0], s[1]);
    var b = mix(s[1], s[2]);
    var c = mix(s[2], s[3]);
    var ab = mix(a, b);
    var bc = mix(b, c);
    return [s[0], a, ab, mix(ab, bc)];
  }

  function threads() {
    var box = document.querySelector('[data-threads]');
    var img = box && box.querySelector('img');
    if (!box || !img || !window.fetch || !window.DOMParser || !('IntersectionObserver' in window)) return;

    var style = getComputedStyle(box);
    var fg = style.getPropertyValue('--fg').trim() || '#F1EFEB';
    var accent = style.getPropertyValue('--accent-fg').trim() || '#A8B4FF';

    fetch(img.src).then(function (response) {
      if (!response.ok) throw new Error('threads: ' + response.status);
      return response.text();
    }).then(safe(function (text) {
      var drawing = readDrawing(text, '#A8B4FF');
      if (drawing) start(drawing);
    }), function () {}); // no drawing to read (for example opened from a file): the picture stays

    function start(drawing) {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.setAttribute('aria-hidden', 'true');
      box.appendChild(canvas);

      var fill = box.getAttribute('data-threads') === 'fill'; // the drawing stretches to its box
      var sx = 1;         // CSS pixels per drawing unit, across...
      var sy = 1;         // ...and down
      var px = 1;         // canvas pixels per CSS pixel
      var visible = false;
      var running = false;
      var drawStart = null; // when the chosen thread began to draw itself
      var raf = 0;

      // Sizes the canvas to its box at the screen's pixel density. The drawing keeps its
      // shape, or, with data-threads="fill", stretches to the box (its lines stay as thin).
      function resize() {
        var width = box.clientWidth;
        var height = width * drawing.height / drawing.width;
        if (fill && box.clientHeight > 0) height = box.clientHeight;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = Math.max(1, Math.round(width * dpr));
        var h = Math.max(1, Math.round(height * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        px = w / Math.max(1, width);
        sx = width / drawing.width;
        sy = height / drawing.height;
        if (!running) draw(performance.now());
      }

      // Path coordinates in drawing units; strokes and dots in CSS pixels.
      function units() { ctx.setTransform(px * sx, 0, 0, px * sy, 0, 0); }
      function pixels() { ctx.setTransform(px, 0, 0, px, 0, 0); }

      // The sway of a point: zero at the two ends of its thread, largest in the middle.
      function sway(thread, p, x0, x1, t, amount) {
        var along = Math.max(0, Math.min(1, (p[0] - x0) / (x1 - x0)));
        return [p[0], p[1] + Math.sin(Math.PI * along) * amount * Math.sin(t * thread.speed + thread.phase + along * 2)];
      }

      // Adds one thread, swayed, to the current path.
      function trace(thread, t, amount, upTo) {
        var segs = thread.segs;
        var x0 = segs[0][0][0];
        var x1 = segs[segs.length - 1][3][0];
        var count = upTo === undefined ? segs.length : upTo * segs.length;
        for (var i = 0; i < segs.length && i < count; i++) {
          var s = segs[i].map(function (p) { return sway(thread, p, x0, x1, t, amount); });
          if (count - i < 1) s = cutAt(s, count - i);
          if (i === 0) ctx.moveTo(s[0][0], s[0][1]);
          ctx.bezierCurveTo(s[1][0], s[1][1], s[2][0], s[2][1], s[3][0], s[3][1]);
        }
        return segs;
      }

      // Draws one frame: the cream threads, the dots, then the chosen thread as far as it has come.
      function draw(now) {
        var dotScale = Math.min(sx, sy);
        pixels();
        ctx.clearRect(0, 0, canvas.width / px, canvas.height / px);
        ctx.lineCap = 'round';
        ctx.strokeStyle = fg;
        drawing.threads.forEach(function (thread) {
          ctx.beginPath();
          units();
          trace(thread, now, THREAD_SWAY);
          pixels(); // the drawing's lines stay one screen pixel wide, as in the SVG
          ctx.globalAlpha = thread.alpha;
          ctx.lineWidth = thread.width;
          ctx.stroke();
        });

        // Pinned, the scroll draws the thread; otherwise it draws itself once it is seen.
        var scrub = threadScrub ? threadScrub() : null;
        var progress = scrub !== null ? scrub
          : drawStart === null ? 0 : ease(Math.min(1, (now - drawStart) / DRAW_MS));
        var chosen = drawing.chosen;
        if (chosen && progress > 0) {
          ctx.beginPath();
          units();
          trace(chosen, now, THREAD_SWAY / 2, progress);
          pixels();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = accent;
          ctx.lineWidth = chosen.width;
          ctx.stroke();
        }

        // The chosen dots wait in cream; the first turns blue as the thread leaves, the second as it arrives.
        drawing.dots.forEach(function (dot) {
          var lit = dot.chosen && (dot.x < drawing.width / 2 ? progress > 0 : progress > 0.97);
          ctx.beginPath();
          ctx.arc(dot.x * sx, dot.y * sy, (dot.chosen && !lit ? 3 : dot.r) * dotScale, 0, Math.PI * 2);
          ctx.fillStyle = lit ? accent : fg;
          ctx.globalAlpha = lit ? 1 : (dot.chosen ? 0.5 : dot.alpha);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        return progress;
      }

      // The loop runs only while the drawing is on screen and the tab is shown.
      function loop(now) {
        raf = 0;
        if (!running) return;
        draw(now);
        raf = requestAnimationFrame(safe(loop));
      }
      function play() {
        var should = visible && !document.hidden && !stopped;
        if (should && !running) {
          running = true;
          raf = requestAnimationFrame(safe(loop));
        } else if (!should && running) {
          running = false;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        }
      }

      var io = new IntersectionObserver(safe(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (drawStart === null && entry.intersectionRatio >= 0.35) drawStart = performance.now();
          play();
        });
      }), { threshold: [0, 0.35] });
      io.observe(box);

      var onVisibility = safe(play);
      document.addEventListener('visibilitychange', onVisibility);

      var ro = window.ResizeObserver ? new ResizeObserver(safe(resize)) : null;
      if (ro) ro.observe(box);
      else ticks.push(resize);

      resize();
      draw(performance.now());
      box.classList.add('is-live');

      stops.push(function () {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        io.disconnect();
        if (ro) ro.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        box.classList.remove('is-live');
      });
    }
  }

  /* ---------- 6. The differences, pinned: [data-showcase] ---------- */

  // Wide screens: the section holds still while the scroll picks each item in turn; the
  // item's title becomes a button, so a click or keyboard focus picks it too. Elsewhere
  // nothing changes. Hooks inside: [data-showcase-item], -title, -copy, -picture, -bar.
  function showcase(wide) {
    var box = document.querySelector('[data-showcase]');
    if (!box) return;
    var items = all(box, '[data-showcase-item]');
    var pictures = all(box, '[data-showcase-picture]');
    var copies = all(box, '[data-showcase-copy]');
    var titles = all(box, '[data-showcase-title]');
    var bar = box.querySelector('[data-showcase-bar]');
    if (items.length < 2 || pictures.length !== items.length || titles.length !== items.length) return;

    var on = false;
    var current = -1;
    var hold = -1;      // the item picked by a click, held while the page scrolls to it
    var holdUntil = 0;
    var filled = null;
    var buttons = [];

    // Marks item i as the current one (its title, its text, its picture).
    function select(i) {
      if (i === current) return;
      items.forEach(function (item, n) { item.classList.toggle('is-current', n === i); });
      pictures.forEach(function (img, n) { img.classList.toggle('is-current', n === i); });
      buttons.forEach(function (button, n) { button.setAttribute('aria-current', n === i ? 'true' : 'false'); });
      current = i;
    }

    // The texts share one place under the titles: it is kept as tall as the tallest.
    function measure() {
      if (!on) return;
      var tallest = 0;
      copies.forEach(function (copy) { tallest = Math.max(tallest, copy.offsetHeight); });
      if (tallest) box.style.setProperty('--mo-slot', tallest + 'px');
    }

    function update() {
      if (!on) return;
      var p = trackProgress(box);
      var fillTo = p.toFixed(4);
      if (bar && fillTo !== filled) bar.style.transform = 'scaleY(' + fillTo + ')';
      filled = fillTo;
      var i = Math.min(items.length - 1, Math.floor(p * items.length));
      if (hold > -1) {
        if (i !== hold && performance.now() < holdUntil) return;
        hold = -1;
      }
      select(i);
    }

    // A click scrolls to the item's part of the track; keyboard focus does too, at once.
    function pick(i, smooth) {
      select(i);
      hold = i;
      holdUntil = performance.now() + (smooth ? PICK_MS : 0);
      var top = trackTop(box, (i + 0.5) / items.length);
      if (Math.abs(top - window.pageYOffset) > 2) {
        window.scrollTo({ top: top, behavior: smooth ? 'smooth' : 'auto' });
      }
    }

    function enable() {
      on = true;
      box.classList.add('is-pinned');
      buttons = titles.map(function (title, i) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'mo-pick';
        title._moNodes = Array.prototype.slice.call(title.childNodes);
        setChildren(button, title._moNodes);
        setChildren(title, [button]);
        button.addEventListener('click', safe(function () { pick(i, true); }));
        button.addEventListener('focus', safe(function () {
          var keyboard = !button.matches || button.matches(':focus-visible');
          if (keyboard) pick(i, false);
        }));
        return button;
      });
      current = -1;
      filled = null;
      measure();
      update();
    }

    function disable() {
      on = false;
      box.classList.remove('is-pinned');
      titles.forEach(function (title) {
        if (title._moNodes) setChildren(title, title._moNodes);
        title._moNodes = null;
      });
      buttons = [];
      select(-1);
      box.style.removeProperty('--mo-slot');
      if (bar) bar.style.transform = '';
    }

    function setMode() {
      if (wide.matches && !on) enable();
      else if (!wide.matches && on) disable();
    }

    setMode();
    var onChange = safe(function () { setMode(); request(); });
    if (wide.addEventListener) wide.addEventListener('change', onChange);
    ticks.push(update);
    resized.push(measure);
    if (document.fonts) document.fonts.ready.then(safe(measure));

    stops.push(function () {
      if (wide.removeEventListener) wide.removeEventListener('change', onChange);
      disable();
    });
  }

  /* ---------- 7. How a match is made, pinned: [data-process] ---------- */

  // Wide screens: the panel holds still while the scroll draws the chosen thread and
  // lights the steps one after another (the current one full, the others muted).
  // Phones: no pinning; each step lights as it comes up the screen and stays lit.
  function process(wide) {
    var box = document.querySelector('[data-process]');
    if (!box) return;
    var steps = all(box, '[data-process-step]');
    var on = false;
    var shown = null;

    function update() {
      var next = -1;
      var past = false;
      if (on) {
        var p = trackProgress(box);
        next = Math.min(steps.length - 1, Math.floor(p * steps.length));
        past = p >= 1;
      } else {
        var line = window.innerHeight * STEP_AT;
        steps.forEach(function (step, i) {
          if (step.getBoundingClientRect().top < line) next = i;
        });
      }
      var state = next + (past ? '+' : '');
      if (state === shown) return;
      steps.forEach(function (step, i) {
        step.classList.toggle('is-on', on ? past || i === next : i <= next);
        step.classList.toggle('step--current', i === next);
      });
      shown = state;
    }

    function setMode() {
      on = wide.matches;
      box.classList.toggle('is-pinned', on);
      shown = null;
      update();
    }

    threadScrub = function () {
      if (!on) return null;
      return Math.max(0, Math.min(1, (trackProgress(box) - THREAD_FROM) / (THREAD_TO - THREAD_FROM)));
    };
    box.classList.add('is-tracking');
    setMode();
    var onChange = safe(function () { setMode(); request(); });
    if (wide.addEventListener) wide.addEventListener('change', onChange);
    ticks.push(update);

    stops.push(function () {
      if (wide.removeEventListener) wide.removeEventListener('change', onChange);
      threadScrub = null;
      box.classList.remove('is-pinned', 'is-tracking');
      steps.forEach(function (step) { step.classList.remove('is-on', 'step--current'); });
    });
  }

  /* ---------- 8. Numbers that count up: [data-count] ---------- */

  // The real text stays in place (for screen readers and copying) and is only made
  // transparent; a copy over it, hidden from screen readers, counts from 0 to the value.
  function counts() {
    if (!('IntersectionObserver' in window)) return;
    var items = all(document, '[data-count]').map(function (el) {
      var m = /^(\D*)(\d+)(\D*)$/.exec(el.textContent.trim());
      return m && { el: el, before: m[1], value: parseInt(m[2], 10), after: m[3], layer: null, state: 0 };
    }).filter(Boolean);
    if (!items.length) return;

    // The visible layer, at 0 until the number comes into view.
    items.forEach(function (item) {
      var layer = document.createElement('span');
      layer.className = 'mo-count';
      layer.setAttribute('aria-hidden', 'true');
      layer.textContent = item.before + '0' + item.after;
      item.el.appendChild(layer);
      item.el.classList.add('is-counting');
      item.layer = layer;
    });

    // Gives the number back its own text.
    function end(item) {
      if (item.state === 2) return;
      item.state = 2;
      if (io) io.unobserve(item.el);
      if (item.layer && item.layer.parentNode) item.layer.parentNode.removeChild(item.layer);
      item.layer = null;
      item.el.classList.remove('is-counting');
    }

    function play(item) {
      if (item.state) return;
      item.state = 1;
      io.unobserve(item.el);
      var start = null;
      var step = safe(function (now) {
        if (item.state !== 1) return;
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / COUNT_MS);
        item.layer.textContent = item.before + Math.round(ease(t) * item.value) + item.after;
        if (t < 1) requestAnimationFrame(step);
        else end(item);
      });
      requestAnimationFrame(step);
      setTimeout(safe(function () { end(item); }), COUNT_MS + 600); // never left half-way
    }

    var io = new IntersectionObserver(safe(function (entries) {
      entries.forEach(function (entry) {
        items.forEach(function (item) {
          if (item.el !== entry.target) return;
          var top = entry.rootBounds ? entry.rootBounds.top : 0;
          if (entry.isIntersecting) play(item);
          else if (entry.boundingClientRect.bottom <= top) end(item); // already scrolled past
        });
      });
    }), { rootMargin: '0px 0px -12% 0px', threshold: 0 });
    items.forEach(function (item) { io.observe(item.el); });

    // At the very bottom of the page, and on paper, every number shows its value.
    ticks.push(function () {
      if (window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 2) {
        items.forEach(function (item) { if (!item.state) play(item); });
      }
    });
    window.addEventListener('beforeprint', safe(function () { items.forEach(end); }));

    stops.push(function () {
      io.disconnect();
      items.forEach(end);
    });
  }

  /* ---------- Start ---------- */

  // Runs fn once the home hero has settled (at once on other pages; HERO_MS at most).
  function afterHero(fn) {
    var hero = document.querySelector('.hero[data-intro]');
    if (!hero || root.getAttribute('data-hero') === 'done') return fn();
    var started = false;
    var observer = null;
    var go = safe(function () {
      if (started) return;
      started = true;
      if (observer) observer.disconnect();
      fn();
    });
    if (window.MutationObserver) {
      observer = new MutationObserver(function () {
        if (root.getAttribute('data-hero') === 'done') go();
      });
      observer.observe(root, { attributes: true, attributeFilter: ['data-hero'] });
    }
    setTimeout(go, HERO_MS);
  }

  try {
    root.classList.add('mo-on');
    afterHero(function () {
      var wide = window.matchMedia(WIDE);
      reveals();
      words();
      parallax();
      showcase(wide);
      process(wide);
      counts();
      threads();
      window.addEventListener('scroll', request, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
      request();
    });
    // Reduced motion switched on while the page is open: everything stops and shows.
    if (media.addEventListener) media.addEventListener('change', function () { if (!media.matches) fail(); });
  } catch (e) {
    fail(e);
  }
})();
