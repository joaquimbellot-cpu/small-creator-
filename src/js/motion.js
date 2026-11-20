/*
 * motion.js
 * Owner: Animation agent.
 *
 * Purpose: the scroll effects behind the hooks [data-reveal], [data-reveal="words"],
 * [data-reveal="lines"], [data-parallax] and the moving canvas for [data-threads].
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

  var stopped = false;
  var stops = [];        // what to call to stop every running effect
  var ticks = [];        // what to run in the frame after a scroll or a resize

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
    ticks.forEach(function (tick) { tick(); });
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

      var scale = 1;      // CSS pixels per drawing unit
      var visible = false;
      var running = false;
      var drawStart = null; // when the chosen thread began to draw itself
      var raf = 0;

      // Sizes the canvas to its box at the screen's pixel density.
      function resize() {
        var width = box.clientWidth;
        var dpr = Math.min(window.devicePixelRatio || 1, 3);
        scale = width / drawing.width;
        var w = Math.round(width * dpr);
        var h = Math.round(width * drawing.height / drawing.width * dpr);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.setTransform(w / drawing.width, 0, 0, w / drawing.width, 0, 0);
        if (!running) draw(performance.now());
      }

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
        var hair = 1 / scale; // the drawing's lines stay one screen pixel wide, as in the SVG
        ctx.clearRect(0, 0, drawing.width, drawing.height);
        ctx.lineCap = 'round';
        ctx.strokeStyle = fg;
        drawing.threads.forEach(function (thread) {
          ctx.beginPath();
          trace(thread, now, THREAD_SWAY);
          ctx.globalAlpha = thread.alpha;
          ctx.lineWidth = thread.width * hair;
          ctx.stroke();
        });

        var progress = drawStart === null ? 0 : ease(Math.min(1, (now - drawStart) / DRAW_MS));
        var chosen = drawing.chosen;
        if (chosen && progress > 0) {
          ctx.beginPath();
          trace(chosen, now, THREAD_SWAY / 2, progress);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = accent;
          ctx.lineWidth = chosen.width * hair;
          ctx.stroke();
        }

        // The chosen dots wait in cream; the first turns blue as the thread leaves, the second as it arrives.
        drawing.dots.forEach(function (dot) {
          var lit = dot.chosen && (dot.x < drawing.width / 2 ? progress > 0 : progress > 0.97);
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, dot.chosen && !lit ? 3 : dot.r, 0, Math.PI * 2);
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
      reveals();
      words();
      parallax();
      threads();
      window.addEventListener('scroll', request, { passive: true });
      window.addEventListener('resize', request, { passive: true });
      request();
    });
    // Reduced motion switched on while the page is open: everything stops and shows.
    if (media.addEventListener) media.addEventListener('change', function () { if (!media.matches) fail(); });
  } catch (e) {
    fail(e);
  }
})();
