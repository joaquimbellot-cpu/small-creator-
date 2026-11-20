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

    if (atTop || pinned()) {
      hidden = false;
    } else if (Math.abs(moved) >= JITTER) {
      hidden = moved > 0;
    }
    if (atTop || Math.abs(moved) >= JITTER) lastY = y;

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
      if (notice) notice.focus();
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
 * [data-reveal="lines"], [data-parallax] and the moving canvas for [data-threads].
 * Nothing runs when reduced motion is on. See docs/design-brief.md, section 7.
 *
 * Does nothing yet.
 */
(function () {
  'use strict';
})();
