(function () {
  // the ribbon: thin lines that twist and drift like a folded cloth, drawn in from the left on load.
  // It follows the pointer a little, stops when the first screen is out of view, and is one still frame under reduced motion.
  var cv = document.querySelector('.hero__flow');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d'), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var w = 0, h = 0, n = 0, t0 = 0, seen = true, running = false, px = .5, py = .5, tx = .5, ty = .5;
  function ease(x) { return 1 - Math.pow(1 - x, 4); }
  function size() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); n = w < 700 ? 22 : 34;
    if (still || !running) draw(still ? 40000 : performance.now() - t0);
  }
  function draw(ms) {
    var t = ms / 1000, grow = still ? 1 : ease(Math.min(1, t / 3.2));
    var small = w < 700, mid = h * (small ? .825 : .775) + (py - .5) * 26, spread = Math.min(h * .16, small ? 100 : 150), amp = Math.min(h * .05, small ? 30 : 46);
    var step = small ? 9 : 13, tail = Math.max(160, w * .22);
    ctx.clearRect(0, 0, w, h); ctx.lineWidth = 1;
    for (var i = 0; i < n; i++) {
      var u = i / (n - 1), s = u - .5, first = true;
      var reach = still ? 1 : ease(Math.max(0, Math.min(1, (t - u * .55) / 2.3))), end = (w + 30 + tail) * reach;
      var a = .05 + .2 * Math.pow(Math.sin(u * Math.PI), 1.4);
      if (reach < 1) {
        var g = ctx.createLinearGradient(Math.max(0, end - tail), 0, Math.max(1, end), 0);
        g.addColorStop(0, 'rgba(241,239,235,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(241,239,235,0)');
        ctx.strokeStyle = g;
      } else ctx.strokeStyle = 'rgba(241,239,235,' + a.toFixed(3) + ')';
      ctx.beginPath();
      for (var x = -20; x <= Math.min(end, w + 30); x += step) {
        var k = x / Math.max(w, 900);
        var y = mid + s * spread * (.3 + .7 * grow) * Math.sin(k * 4.4 + t * .2 + (px - .5) * 1.2)
          + amp * grow * Math.sin(k * 5.2 - t * .31 + u * 1.9)
          + amp * .42 * grow * Math.sin(k * 10.6 + t * .17 + u * 4.3 + px * 1.6);
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  function loop(now) {
    if (!seen) { running = false; return; }
    px += (tx - px) * .035; py += (ty - py) * .035;
    draw(now - t0); requestAnimationFrame(loop);
  }
  function start() { if (still || running) return; running = true; requestAnimationFrame(loop); }
  t0 = performance.now(); size(); start();
  addEventListener('resize', size);
  addEventListener('pointermove', function (e) { tx = e.clientX / innerWidth; ty = e.clientY / innerHeight; }, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { seen = en[0].isIntersecting; if (seen) start(); }).observe(cv);
})();
(function () {
  // the header is clear over the first screen and takes its ground once the page moves
  var nav = document.querySelector('.nav');
  var hero = document.querySelector('.hero');
  function top() { nav.classList.toggle('is-top', !!hero && scrollY < 12); }
  top(); addEventListener('scroll', top, { passive: true });

  // each block below the first screen rises as it comes into view; without this script nothing is hidden
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var seenIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-seen'); seenIO.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -7% 0px', threshold: .08 });
    [].forEach.call(document.querySelectorAll('.chapter, .split > *, .steps > li, .faq__item, .join > *, .footer__row, .footer__word'), function (el) {
      var i = [].indexOf.call(el.parentNode.children, el);
      el.style.setProperty('--d', el.matches('.steps > li, .split > *, .join > *') ? Math.min(i, 3) : 0);
      el.classList.add('rv'); seenIO.observe(el);
    });
  }
})();
(function () {
  // the phone menu: opens under the bar, closes on any link in the bar, Escape returns to its button
  var toggle = document.querySelector('.nav__toggle'), menu = document.getElementById('menu'), bar = document.querySelector('.nav__bar');
  function setMenu(open) { menu.classList.toggle('is-open', open); document.querySelector('.nav').classList.toggle('is-menu', open); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Menu'); document.body.style.overflow = open ? 'hidden' : ''; }
  toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
  bar.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); } });

  // the form: the label follows the role; each error sits under its field and clears as it is fixed;
  // nothing is sent from this page yet, and the page says so
  var form = document.getElementById('join-form'), status = document.getElementById('form-status');
  if (!form) return;
  var phone = document.getElementById('f-phone');
  var nameEl = document.getElementById('f-name'), email = document.getElementById('f-email'), channel = document.getElementById('f-channel');
  var channelLabel = document.getElementById('channel-label'), channelErr = document.getElementById('channel-err');
  var radios = [].slice.call(form.querySelectorAll('input[name="role"]')), tried = false;
  function role() { var r = form.querySelector('input[name="role"]:checked'); return r ? r.value : ''; }
  var rules = [
    { el: radios[0], err: 'role-err', ok: function () { return !!role(); }, mark: radios },
    { el: nameEl, err: 'name-err', ok: function () { return nameEl.value.trim().length > 0; } },
    { el: email, err: 'email-err', ok: function () { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()); } },
    { el: phone, err: 'phone-err', ok: function () { var v = phone.value.trim(); return !v || (/^[+()\d\s.-]+$/.test(v) && v.replace(/\D/g, '').length >= 7); } },
    { el: channel, err: 'channel-err', ok: function () { var v = channel.value.trim(); return role() === 'creator' ? /(youtube\.com|youtu\.be)\/\S+|^@\S{2,}/i.test(v) : v.length > 1; } }
  ];
  function validate(show) {
    var bad = [];
    rules.forEach(function (r) {
      var ok = r.ok(); if (!ok) bad.push(r);
      if (show) { document.getElementById(r.err).hidden = ok; (r.mark || [r.el]).forEach(function (i) { i.setAttribute('aria-invalid', String(!ok)); }); }
    });
    return bad;
  }
  function say(bad) { status.classList.remove('is-done'); status.textContent = !bad.length ? '' : bad.length === 1 ? 'One field needs fixing.' : bad.length + ' fields need fixing.'; }
  form.addEventListener('change', function (e) {
    if (e.target.name !== 'role') return;
    var creator = e.target.value === 'creator';
    channelLabel.textContent = creator ? 'Link to your YouTube channel' : 'Company name';
    channelErr.textContent = creator ? 'Paste the link to your YouTube channel, like youtube.com/@yourchannel.' : "Write your company's name.";
    channel.setAttribute('autocomplete', creator ? 'url' : 'organization');
    if (tried) say(validate(true));
  });
  form.addEventListener('input', function () { if (tried) say(validate(true)); });
  form.addEventListener('submit', function (e) {
    e.preventDefault(); tried = true;
    var bad = validate(true);
    if (bad.length) { say(bad); bad[0].el.focus(); return; }
    status.classList.add('is-done');
    status.textContent = 'Thanks. This preview is not connected to sign-up yet, so nothing was sent.';
    status.scrollIntoView({ block: 'nearest' });
  });
  // a link from the brand page arrives with the brand side already chosen
  var want = location.hash === '#brand' ? 'brand' : location.hash === '#creator' ? 'creator' : '';
  if (want) { var pick = form.querySelector('input[value="' + want + '"]'); pick.checked = true; pick.dispatchEvent(new Event('change', { bubbles: true })); }
})();
