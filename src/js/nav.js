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
