/* LaserSafe Lab — "Laser vs Everyday Light" section.
   Self-contained: draws its own eye cross-sections (same anatomy as the simulator),
   source spectra, retinal image sizes and wave pictures. Uses window.LaserPhysics for the
   eye's focal length, minimum spot size and wavelength tables. No network, no libraries. */
(function () {
  'use strict';
  var LP = window.LaserPhysics;
  var $ = function (id) { return document.getElementById(id); };
  if (!$('tabCmp')) return;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function num(v) {
    if (!isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e4 || (a < 0.01 && a > 0)) return v.toExponential(1);
    return String(+v.toPrecision(3));
  }
  function um(v) { return v >= 1000 ? num(v / 1000) + ' mm' : num(v) + ' µm'; }
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function wl2rgb(w) {
    var r = 0, g = 0, b = 0;
    if (w < 440) { r = -(w - 440) / 60; b = 1; }
    else if (w < 490) { g = (w - 440) / 50; b = 1; }
    else if (w < 510) { g = 1; b = -(w - 510) / 20; }
    else if (w < 580) { r = (w - 510) / 70; g = 1; }
    else if (w < 645) { r = 1; g = -(w - 645) / 65; }
    else r = 1;
    var k = w < 420 ? 0.3 + 0.7 * (w - 400) / 20 : (w > 700 ? Math.max(0.35, 0.3 + 0.7 * (780 - w) / 80) : 1);
    return [r, g, b].map(function (x) { return Math.round(255 * Math.pow(Math.max(0, x) * k, 0.8)); });
  }
  function colour(w) {
    if (w > 700) return '#c68cff';                 // false colour for invisible infrared
    if (w < 400) return '#9b6bff';                 // false colour for ultraviolet
    var c = wl2rgb(w);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  /* ------------------------------------------------------------------ */
  /* The four sources                                                    */
  /* ------------------------------------------------------------------ */
  var KEYS = ['laser', 'led', 'sodium', 'sun'];
  var META = {
    laser:  { name: 'Laser', chip: 'Laser', kind: 'laser' },
    led:    { name: 'White LED bulb', chip: 'White LED', kind: 'lamp', size: 0.06, col: '#d6e6ff' },
    sodium: { name: 'Yellow sodium lamp', chip: 'Sodium lamp', kind: 'lamp', size: 0.05, col: colour(589) },
    sun:    { name: 'Sunlight', chip: 'Sunlight', kind: 'sun', ang: 0.00931, col: '#ffe08a' }
  };
  var TEXT = {
    laser:  { facts: ['Narrow beam', 'One colour', 'Waves in step (coherent)'],
              why: 'A narrow beam can put a large share of its power into a tiny retinal spot. Whether that is hazardous depends on the power, wavelength and time.',
              wall: 'Power in a small spot' },
    led:    { facts: ['Wide spread', 'Several colours (white)', 'Not coherent'],
              why: 'The eye forms an image of the bulb on a patch of retina, so the light is spread over a larger area. Very intense LEDs can still be hazardous.',
              wall: 'Spread over a wide area' },
    sodium: { facts: ['Wide spread', 'Yellow lines (about 589 nm)', 'Not coherent'],
              why: 'Strong yellow light from a wide source. The retina gets an image of the lamp, not one concentrated point.',
              wall: 'Spread in many directions' },
    sun:    { facts: ['Near-parallel rays, large disc', 'All colours, UV and infrared', 'Not coherent'],
              why: 'The eye focuses an image of the Sun about 0.15 mm wide. Looking at the Sun can still seriously injure the retina.',
              wall: 'Spread evenly over everything' }
  };

  var UI = { mode: 'two', a: 'laser', b: 'led', pupil: 3.5, dist: 2, laserW: 532, focus: 'all' };
  var LASER_BEAM_MM = 2.5;      // illustrative collimated beam width
  var VIS_BOOST = 8;            // drawn angles are enlarged by this factor

  /* ------------------------------------------------------------------ */
  /* Spectra (relative, illustrative) and what reaches the retina        */
  /* ------------------------------------------------------------------ */
  var W0 = 300, W1 = 1100;
  function g(w, c, s) { var d = (w - c) / s; return Math.exp(-0.5 * d * d); }
  function planck(wnm, T) { var l = wnm * 1e-9; return 1 / (Math.pow(l, 5) * (Math.exp(0.014388 / (l * T)) - 1)); }
  function sunAt(w) {
    var mu = w / 1000;
    var oz = 1 / (1 + Math.exp(-(w - 312) / 6));                 // ozone cuts the short UV
    var ray = Math.exp(-1.5 * 0.0088 * Math.pow(mu, -4.05));     // scattering, air mass 1.5
    var dips = (1 - 0.5 * g(w, 761, 3)) * (1 - 0.12 * g(w, 687, 2.5)) * (1 - 0.2 * g(w, 720, 10)) *
               (1 - 0.3 * g(w, 822, 14)) * (1 - 0.65 * g(w, 940, 20));   // oxygen and water vapour
    return planck(w, 5778) * oz * ray * dips;
  }
  function specAt(key, w, lw) {
    switch (key) {
      case 'laser': return g(w, lw, 0.7);
      case 'led': return 0.8 * g(w, 450, 10) + 0.95 * g(w, 555, 48) + 0.7 * g(w, 610, 55);
      case 'sodium': return g(w, 589.3, 0.7) + 0.03 * g(w, 568.8, 0.6) + 0.02 * g(w, 615.4, 0.6) + 0.015 * g(w, 819.5, 0.8);
      default: return sunAt(w);
    }
  }
  var specCache = {};
  function spectrum(key) {
    var ck = key + (key === 'laser' ? UI.laserW : '');
    if (specCache[ck]) return specCache[ck];
    var n = W1 - W0 + 1, a = new Array(n), mx = 0, i;
    for (i = 0; i < n; i++) { a[i] = specAt(key, W0 + i, UI.laserW); if (a[i] > mx) mx = a[i]; }
    for (i = 0; i < n; i++) a[i] /= mx;
    return (specCache[ck] = a);
  }

  // Share of light reaching the retina, by wavelength. Below 400 nm the cornea and lens block most light.
  var UVT = [[300, 0], [315, 0], [350, 0.01], [380, 0.15]];
  function lin(tbl, x, endX, endY) {
    if (x <= tbl[0][0]) return tbl[0][1];
    for (var i = 1; i < tbl.length; i++) if (x <= tbl[i][0]) { var a = tbl[i - 1], b = tbl[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    var l = tbl[tbl.length - 1];
    return l[1] + (endY - l[1]) * (x - l[0]) / (endX - l[0]);
  }
  function reachT(w) { return w >= 400 ? LP.ocular(w).T : lin(UVT, w, 400, LP.ocular(400).T); }
  function lensA(w) { return w >= 400 ? LP.ocular(w).aL : clamp(1 - lin(UVT, w, 400, LP.ocular(400).T) - 0.15, 0, 1); }
  function waterA(w) { return w >= 400 ? LP.ocular(w).aV : 0.01; }
  var fracCache = {};
  function fractions(key) {
    var ck = key + (key === 'laser' ? UI.laserW : '');
    if (fracCache[ck]) return fracCache[ck];
    var s = spectrum(key), tot = 0, reach = 0, lens = 0, water = 0, uv = 0, ir = 0;
    for (var i = 0; i < s.length; i++) {
      var w = W0 + i, v = s[i];
      tot += v; reach += v * reachT(w); lens += v * lensA(w); water += v * waterA(w);
      if (w < 400) uv += v; if (w > 700) ir += v;
    }
    return (fracCache[ck] = { reach: reach / tot, lens: lens / tot, water: water / tot, uv: uv / tot, ir: ir / tot });
  }

  /* ------------------------------------------------------------------ */
  /* Geometry of the source as seen by the eye                           */
  /* ------------------------------------------------------------------ */
  function angRad(key) {
    if (key === 'laser') return 0;
    if (key === 'sun') return META.sun.ang;
    return 2 * Math.atan(META[key].size / 2 / UI.dist);
  }
  function imageUm(key) {
    var F = LP.F_EYE, MIN = LP.MIN_SPOT;
    if (key === 'laser') {
      var diff = 2.44 * UI.laserW * 1e-9 * F / Math.min(LASER_BEAM_MM / 1e3, UI.pupil / 1e3);
      return Math.hypot(diff, MIN) * 1e6;
    }
    return Math.hypot(F * angRad(key), MIN) * 1e6;
  }

  /* ------------------------------------------------------------------ */
  /* Eye cross-section scene                                             */
  /* ------------------------------------------------------------------ */
  var K = 12, VX = 440, CY = 190, ENT = 0.885, IRIS_X = 3.6, LENS_BACK = 7.2, FOV = 23.45, XS = 76;
  var G_IRIS = 0.115, G_LB = 0.255;
  function X(mm) { return VX + mm * K; }
  function Y(mm) { return CY + mm * K; }
  function cornea(y) { return 7.8 - Math.sqrt(7.8 * 7.8 - y * y); }
  function retX(y) { return 12.45 + Math.sqrt(121 - y * y); }
  function f1(v) { return v.toFixed(1); }
  function pts(a) { return a.map(function (q) { return f1(q[0]) + ',' + f1(q[1]); }).join(' '); }
  function rayPts(y, yR) {
    return [[X(cornea(y)), Y(y)],
            [X(IRIS_X), Y(y + (yR - y) * G_IRIS)],
            [X(LENS_BACK), Y(y + (yR - y) * G_LB)],
            [X(retX(yR)), Y(yR)]];
  }
  function retArc(y1, y2) {          // band along the retina between two heights (mm)
    var cx = X(12.45), R = 11 * K;
    var a1 = Math.asin(clamp(y1 * K / R, -0.9, 0.9)), a2 = Math.asin(clamp(y2 * K / R, -0.9, 0.9));
    return 'M' + f1(cx + R * Math.cos(a1)) + ' ' + f1(CY + R * Math.sin(a1)) + ' A' + R + ' ' + R + ' 0 0 1 ' + f1(cx + R * Math.cos(a2)) + ' ' + f1(CY + R * Math.sin(a2));
  }

  function eyeAnatomy(pid, rpPhys, lensGlow, vitGlow) {
    var io = 6.9, w = 0.7;
    return '<g class="eyeg" transform="translate(' + VX + ' ' + CY + ') scale(' + K + ')" fill="none" stroke-linejoin="round">' +
      '<polygon points="23.48,3.70 26.44,4.90 25.92,6.19 22.95,4.99" fill="#b9a99a" fill-opacity=".85" stroke="#d9cdbf" stroke-width="' + 2 * w + '"/>' +
      '<path d="M2.25 -5.5 A11.6 11.6 0 1 1 2.25 5.5 Z" fill="url(#' + pid + 'v)" stroke="none"/>' +
      '<path d="M2.25 -5.5 A11.6 11.6 0 1 1 2.25 5.5 Z" fill="#ff9a40" stroke="none" opacity="' + vitGlow.toFixed(2) + '"/>' +
      '<path d="M2.25 -5.5 A7.8 7.8 0 0 0 2.25 5.5 Z" fill="#2b6283" fill-opacity=".42" stroke="none"/>' +
      '<path d="M2.25 -5.5 A11.6 11.6 0 1 1 2.25 5.5" stroke="#dfe8ef" stroke-width="' + 9 * w + '" stroke-linecap="round"/>' +
      '<path d="M14.43 -11.18 A11.35 11.35 0 0 1 14.43 11.18" stroke="#6b2233" stroke-width="' + 3 * w + '"/>' +
      '<path d="M14.37 -10.83 A11 11 0 0 1 14.37 10.83" stroke="#e0728a" stroke-width="' + 4.5 * w + '" stroke-linecap="round"/>' +
      '<path d="M2.25 -5.5 A7.8 7.8 0 0 0 2.25 5.5 L3.08 5.5 A7.25 7.25 0 0 1 3.08 -5.5 Z" fill="#9fdcf4" fill-opacity=".30" stroke="#a9e1f7" stroke-width="' + 2 * w + '"/>' +
      '<rect x="3.35" y="' + -io + '" width="0.5" height="' + (io - rpPhys).toFixed(3) + '" rx="0.15" fill="url(#' + pid + 'i)" stroke="none"/>' +
      '<rect x="3.35" y="' + rpPhys.toFixed(3) + '" width="0.5" height="' + (io - rpPhys).toFixed(3) + '" rx="0.15" fill="url(#' + pid + 'i)" stroke="none"/>' +
      '<ellipse cx="5.4" cy="0" rx="1.8" ry="4.6" fill="#bfe6f5" fill-opacity=".22" stroke="#aee0f2" stroke-width="' + 2.5 * w + '"/>' +
      '<ellipse cx="5.4" cy="0" rx="1.8" ry="4.6" fill="#ffb347" stroke="none" opacity="' + lensGlow.toFixed(2) + '"/>' +
      '</g>';
  }

  function sourceArt(key, hS, col) {
    var s = '', i, a;
    if (key === 'laser') {
      s += '<rect x="20" y="' + (CY - 30) + '" width="92" height="60" rx="9" fill="#14293b" stroke="#7fa3bd" stroke-width="2"/>' +
           '<rect x="84" y="' + (CY - 29) + '" width="27" height="58" fill="#0e2031"/>' +
           '<rect x="108" y="' + (CY - 6) + '" width="10" height="12" rx="3" fill="' + col + '"/>' +
           '<text x="52" y="' + (CY - 3) + '" font-size="15" font-weight="700" text-anchor="middle" fill="' + col + '">' + Math.round(UI.laserW) + ' nm</text>' +
           '<text x="52" y="' + (CY + 16) + '" font-size="13" text-anchor="middle" fill="#cfe0ec">LASER</text>';
      return s;
    }
    var r = Math.max(hS, key === 'sun' ? 11 : 13);
    if (key === 'led') {
      s += '<circle cx="' + XS + '" cy="' + CY + '" r="' + f1(r * 1.7) + '" fill="url(#gl-led)" opacity=".8"/>' +
           '<rect x="' + f1(XS - r * 0.45) + '" y="' + f1(CY + r * 0.8) + '" width="' + f1(r * 0.9) + '" height="' + f1(r * 0.55) + '" rx="2" fill="#7e8d99"/>' +
           '<circle cx="' + XS + '" cy="' + CY + '" r="' + f1(r) + '" fill="#f4f8ff" stroke="#cfe0ff" stroke-width="2"/>';
    } else if (key === 'sodium') {
      s += '<ellipse cx="' + XS + '" cy="' + CY + '" rx="' + f1(r * 1.3) + '" ry="' + f1(r * 1.7) + '" fill="url(#gl-na)" opacity=".8"/>' +
           '<rect x="' + f1(XS - r * 0.55) + '" y="' + f1(CY - r) + '" width="' + f1(r * 1.1) + '" height="' + f1(r * 2) + '" rx="' + f1(r * 0.55) + '" fill="' + col + '" stroke="#fff3b0" stroke-width="2"/>';
    } else {
      for (i = 0; i < 12; i++) {
        a = i / 12 * 2 * Math.PI;
        s += '<line x1="' + f1(XS + Math.cos(a) * (r + 4)) + '" y1="' + f1(CY + Math.sin(a) * (r + 4)) + '" x2="' + f1(XS + Math.cos(a) * (r + 12)) + '" y2="' + f1(CY + Math.sin(a) * (r + 12)) + '" stroke="' + col + '" stroke-width="2.5" stroke-linecap="round"/>';
      }
      s += '<circle cx="' + XS + '" cy="' + CY + '" r="' + f1(r * 2) + '" fill="url(#gl-sun)" opacity=".7"/>' +
           '<circle cx="' + XS + '" cy="' + CY + '" r="' + f1(r) + '" fill="#fff4c2" stroke="' + col + '" stroke-width="2"/>';
    }
    var ly = CY + Math.max(r * 1.8, 40) + 18;
    s += '<text x="' + XS + '" y="' + f1(Math.min(ly, 368)) + '" font-size="14" text-anchor="middle" fill="#b9cddc">' + (key === 'led' ? 'LED bulb' : key === 'sodium' ? 'Sodium lamp' : 'Sun') + '</text>';
    return s;
  }

  // Build the whole scene. Returns {svg, legend, highlight ids}.
  function buildScene(pid, key) {
    var col = key === 'laser' ? colour(UI.laserW) : META[key].col;
    var rp = UI.pupil / 2, rpPhys = rp * ENT;
    var fr = fractions(key);
    var Ds = VX - XS, ext = key !== 'laser';
    var alpha = angRad(key);
    var hS = ext ? Ds * Math.tan(Math.min(VIS_BOOST * alpha / 2, 0.26)) : 0;
    hS = ext ? Math.max(hS, 9) : 0;
    var focus = UI.focus;
    var parts = [], i, j;

    var defs = '<defs>' +
      '<radialGradient id="' + pid + 'v" cx="0.78" cy="0.5" r="0.75"><stop offset="0" stop-color="#2a566f"/><stop offset="1" stop-color="#0f2434"/></radialGradient>' +
      '<linearGradient id="' + pid + 'i" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#58a4b8"/><stop offset="1" stop-color="#2a6073"/></linearGradient>' +
      '<radialGradient id="gl-led"><stop offset="0" stop-color="#e6f0ff" stop-opacity=".9"/><stop offset="1" stop-color="#e6f0ff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="gl-na"><stop offset="0" stop-color="#ffcf2a" stop-opacity=".9"/><stop offset="1" stop-color="#ffcf2a" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="gl-sun"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".95"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + pid + 'f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>' +
      '<clipPath id="' + pid + 'c"><rect id="' + pid + 'rv" x="0" y="0" width="780" height="380"/></clipPath></defs>';

    parts.push('<rect width="780" height="380" fill="#040a11"/>');

    // emission spokes (shows spread in many directions) — laser has none
    var spokes = '';
    if (ext) {
      var angs = key === 'led' ? [-100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100] : [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
      var r0 = Math.max(hS, 13) + (key === 'sun' ? 14 : 4);
      angs.forEach(function (d) {
        var a = d * Math.PI / 180;
        spokes += '<line x1="' + f1(XS + Math.cos(a) * r0) + '" y1="' + f1(CY + Math.sin(a) * r0) + '" x2="' + f1(XS + Math.cos(a) * (r0 + 34)) + '" y2="' + f1(CY + Math.sin(a) * (r0 + 34)) + '" stroke="' + col + '" stroke-width="1.6" opacity=".35" class="pulse"/>';
      });
    }
    parts.push(spokes);
    parts.push(sourceArt(key, hS, col));

    // eye
    var lensGlow = clamp(fr.lens * 1.8, 0, 0.7), vitGlow = clamp(fr.water * 1.4, 0, 0.45);
    parts.push(eyeAnatomy(pid, rpPhys, lensGlow, vitGlow));

    // rays (revealed left to right)
    var rays = '', blocked = '', retina = '';
    var legend = [];
    var fracs = [-0.9, -0.45, 0, 0.45, 0.9];
    var yRs = [];
    if (key === 'laser') {
      var rb = LASER_BEAM_MM / 2;
      var y0 = CY - rb * K, y1 = CY + rb * K;
      rays += '<polygon points="' + pts([[118, y0], [X(cornea(rb)), y0], [X(cornea(rb)), y1], [118, y1]]) + '" fill="' + col + '" opacity=".22" filter="url(#' + pid + 'f)"/>' +
              '<polygon points="' + pts([[118, y0], [X(cornea(rb)), y0], [X(cornea(rb)), y1], [118, y1]]) + '" fill="' + col + '" opacity=".28"/>';
      for (i = 0; i < 7; i++) {
        var y = (i - 3) / 3 * rb, inside = Math.abs(y * ENT) <= rpPhys + 1e-6;
        if (inside) {
          rays += '<polyline class="flow" fill="none" stroke="' + col + '" stroke-width="' + (i === 3 ? 2.4 : 1.6) + '" points="' + pts([[118, Y(y)]].concat(rayPts(y, 0))) + '"/>';
        } else {
          blocked += '<polyline fill="none" stroke="' + col + '" stroke-width="1.4" opacity=".4" points="' + pts([[118, Y(y)], [X(cornea(y)), Y(y)], [X(IRIS_X), Y(y * ENT)]]) + '"/>';
        }
      }
      yRs = [0];
      retina = '<circle cx="' + f1(X(retX(0))) + '" cy="' + CY + '" r="9" fill="' + col + '" opacity=".55" filter="url(#' + pid + 'f)"/>' +
               '<circle cx="' + f1(X(retX(0))) + '" cy="' + CY + '" r="3.4" fill="#fff"/>' +
               '<circle cx="' + f1(X(retX(0))) + '" cy="' + CY + '" r="3.4" fill="' + col + '" opacity=".6"/>';
      legend = [[col, 'One narrow beam of one colour'], ['#fff', 'Focused to a tiny spot']];
    } else {
      var pointsS = [1, 0, -1];                       // top, middle, bottom of the source
      var names = { 1: 'top', 0: 'mid', '-1': 'bot' };
      var dots = '', allY = [];
      pointsS.forEach(function (s) {
        var dy = s * hS * 0.7, ySrc = CY - dy, xSrc = XS + Math.sqrt(Math.max(0, hS * hS - dy * dy)) * 0.95 + 2;
        var theta = (ySrc - CY) / (VX - xSrc);
        var yR = clamp(-theta * 17, -5, 5);
        allY.push(yR);
        var on = focus === 'all' || focus === names[s];
        var op = on ? 1 : 0.12;
        var grp = '', blk = '';
        fracs.forEach(function (fv) {
          var y = fv * rp, pts4 = rayPts(y, yR);
          var yIris = y + (yR - y) * G_IRIS;
          if (Math.abs(yIris) <= rpPhys + 1e-6) {
            grp += '<polyline class="flow" fill="none" stroke="' + col + '" stroke-width="' + (fv === 0 ? 2 : 1.4) + '" points="' + pts([[xSrc, ySrc], [X(cornea(y)), Y(y)]].concat(pts4.slice(1))) + '"/>';
          } else {
            blk += '<polyline fill="none" stroke="' + col + '" stroke-width="1.2" opacity=".5" points="' + pts([[xSrc, ySrc], [X(cornea(y)), Y(y)], [X(IRIS_X), Y(yIris)]]) + '"/>';
          }
        });
        [-1.5, 1.5].forEach(function (fv) {            // light that misses the pupil
          var y = fv * rp * 1.15, yi = y * ENT;
          blk += '<polyline fill="none" stroke="' + col + '" stroke-width="1.2" opacity=".45" points="' + pts([[xSrc, ySrc], [X(cornea(y)), Y(y)], [X(IRIS_X), Y(yi)]]) + '"/>';
        });
        rays += '<g opacity="' + op + '">' + grp + '</g>';
        blocked += '<g opacity="' + (on ? 1 : 0.1) + '">' + blk + '</g>';
        dots += '<circle cx="' + f1(X(retX(yR))) + '" cy="' + f1(Y(yR)) + '" r="3" fill="' + col + '" stroke="#fff" stroke-width="1" opacity="' + (on ? 1 : 0.25) + '"/>';
        yRs.push(yR);
      });

      // sunlight: UV stops in the front of the eye, infrared passes through
      if (key === 'sun') {
        var yUV = -0.55 * rp;
        rays += '<polyline fill="none" stroke="#9b6bff" stroke-width="1.8" stroke-dasharray="4 5" points="' + pts([[XS + 16, CY - 9], [X(cornea(yUV)), Y(yUV)], [X(3.9), Y(yUV * 0.98)]]) + '"/>' +
                '<circle cx="' + f1(X(3.9)) + '" cy="' + f1(Y(yUV * 0.98)) + '" r="6" fill="#9b6bff" opacity=".7" filter="url(#' + pid + 'f)"/>';
        var yIR = 0.6 * rp;
        rays += '<polyline class="flow" fill="none" stroke="#ff6a5a" stroke-width="1.8" stroke-dasharray="3 6" opacity=".9" points="' + pts([[XS + 16, CY + 9]].concat(rayPts(yIR, 0.5))) + '"/>';
        legend = [[col, 'Visible light: focused onto the retina'], ['#9b6bff', 'Ultraviolet: mostly absorbed by cornea and lens'], ['#ff6a5a', 'Infrared: passes through, water absorbs some']];
      } else if (key === 'led') {
        legend = [[col, 'White light: blue peak plus yellow-green'], ['#ffb347', 'Lens absorbs a little of the blue']];
      } else {
        legend = [[col, 'Yellow light, mostly one pair of lines'], ['#fff', 'Image of the lamp, not one point']];
      }

      // image of the source on the retina
      var ymax = Math.max(Math.abs(allY[0]), Math.abs(allY[2])) / 0.7 * 0.95, ymin = Math.max(ymax, 0.35);
      retina = '<path d="' + retArc(-ymin, ymin) + '" fill="none" stroke="' + col + '" stroke-width="7" stroke-linecap="round" opacity=".55" filter="url(#' + pid + 'f)"/>' +
               '<path d="' + retArc(-ymin, ymin) + '" fill="none" stroke="' + col + '" stroke-width="4" stroke-linecap="round" opacity=".9"/>' + dots;
    }

    // clipped reveal group
    parts.push('<g clip-path="url(#' + pid + 'c)">' + blocked + rays + '</g>');

    // retina highlight + label (fades in after the light arrives)
    var lab = key === 'laser' ? 'Tiny focused spot' : (key === 'sun' ? 'Image of the Sun' : key === 'led' ? 'Image of the bulb' : 'Image of the lamp');
    var lx = X(retX(0)) + 6;
    parts.push('<g id="' + pid + 'hl" opacity="0">' + retina +
      '<line x1="' + f1(lx) + '" y1="' + (CY - 14) + '" x2="' + f1(lx + 18) + '" y2="' + (CY - 56) + '" stroke="' + (key === 'laser' ? '#fff' : col) + '" stroke-width="1.4"/>' +
      '<text x="' + f1(Math.min(lx + 22, 772)) + '" y="' + (CY - 60) + '" font-size="15" font-weight="700" text-anchor="end" fill="' + (key === 'laser' ? '#fff' : col) + '" class="halo">' + lab + '</text></g>');

    // labels (kept outside the rays)
    parts.push('<g class="lbl" style="font-size:14px">' +
      '<text x="' + f1(X(-1.2)) + '" y="352" text-anchor="middle">Cornea</text>' +
      '<text x="498" y="74" text-anchor="end">Iris &amp; pupil: ' + num(UI.pupil) + ' mm</text>' +
      '<text x="' + f1(X(5.4)) + '" y="' + (CY + 76) + '" text-anchor="middle" style="fill:#aee0f2">Lens</text>' +
      '<text x="668" y="354" text-anchor="middle">Retina</text></g>' +
      '<g stroke="#5d788c" stroke-width="1.2"><line x1="490" y1="79" x2="484" y2="104"/><line x1="666" y1="340" x2="664" y2="304"/></g>');

    if (ext) parts.push('<text x="14" y="26" font-size="12.5" fill="#7f9bb0">Angles enlarged ×' + VIS_BOOST + ' so you can see them. Not to scale.</text>');
    else parts.push('<text x="14" y="26" font-size="12.5" fill="#7f9bb0">Beam drawn 2.5 mm wide. Not to scale.</text>');

    return { svg: '<svg viewBox="0 0 780 380" role="img" aria-label="' + META[key].name + ' entering the eye and focused on the retina">' + defs + parts.join('') + '</svg>', legend: legend, rvId: pid + 'rv', hlId: pid + 'hl', retX: X(retX(0)) };
  }

  /* ------------------------------------------------------------------ */
  /* Mini visuals                                                        */
  /* ------------------------------------------------------------------ */
  function spectrumSVG(pid, key) {
    var s = spectrum(key), col = key === 'laser' ? colour(UI.laserW) : META[key].col;
    var x0 = 12, x1 = 288, yb = 84, H = 66, n = s.length, i;
    var xp = function (w) { return x0 + (w - W0) / (W1 - W0) * (x1 - x0); };
    var out = '<svg viewBox="0 0 300 124" role="img" aria-label="Spectrum of ' + META[key].name + '"><defs><linearGradient id="' + pid + 'sg" x1="0" y1="0" x2="1" y2="0">';
    for (var w = 400; w <= 700; w += 20) out += '<stop offset="' + ((w - 400) / 300 * 100).toFixed(0) + '%" stop-color="' + colour(w) + '"/>';
    out += '</linearGradient><pattern id="' + pid + 'hp" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#1a1626"/><rect width="3" height="6" fill="#2a2240"/></pattern></defs>';
    out += '<rect x="' + x0 + '" y="' + (yb + 6) + '" width="' + (xp(400) - x0).toFixed(1) + '" height="9" fill="url(#' + pid + 'hp)"/>' +
           '<rect x="' + xp(400).toFixed(1) + '" y="' + (yb + 6) + '" width="' + (xp(700) - xp(400)).toFixed(1) + '" height="9" fill="url(#' + pid + 'sg)"/>' +
           '<rect x="' + xp(700).toFixed(1) + '" y="' + (yb + 6) + '" width="' + (x1 - xp(700)).toFixed(1) + '" height="9" fill="url(#' + pid + 'hp)"/>';
    var line = '', fill = 'M' + x0 + ' ' + yb;
    for (i = 0; i < n; i += (key === 'laser' || key === 'sodium' ? 1 : 2)) {
      var w2 = W0 + i, xx = xp(w2), yy = yb - s[i] * H;
      line += (line ? 'L' : 'M') + xx.toFixed(1) + ' ' + yy.toFixed(1);
    }
    var fillD = 'M' + x0 + ' ' + yb + ' ';
    for (i = 0; i < n; i += (key === 'laser' || key === 'sodium' ? 1 : 2)) {
      var w3 = W0 + i, y3 = yb - s[i] * reachT(w3) * H;
      fillD += 'L' + xp(w3).toFixed(1) + ' ' + y3.toFixed(1);
    }
    fillD += 'L' + x1 + ' ' + yb + 'Z';
    out += '<path d="' + fillD + '" fill="' + col + '" opacity=".6"/>' +
           '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-dasharray="' + (key === 'laser' ? '0' : '3 2') + '"/>';
    if (key === 'laser') out += '<line x1="' + xp(UI.laserW).toFixed(1) + '" y1="' + (yb - H) + '" x2="' + xp(UI.laserW).toFixed(1) + '" y2="' + yb + '" stroke="' + col + '" stroke-width="2.4"/>';
    out += '<line x1="' + x0 + '" y1="' + yb + '" x2="' + x1 + '" y2="' + yb + '" stroke="#5d788c"/>' +
           '<g fill="#8da6b9" font-size="10.5" text-anchor="middle"><text x="' + xp(350).toFixed(0) + '" y="' + (yb + 27) + '">UV</text><text x="' + xp(550).toFixed(0) + '" y="' + (yb + 27) + '">Visible</text><text x="' + xp(900).toFixed(0) + '" y="' + (yb + 27) + '">Infrared</text></g>' +
           '<g fill="#6d8497" font-size="9.5" text-anchor="middle"><text x="' + xp(300).toFixed(0) + '" y="' + (yb + 39) + '">300</text><text x="' + xp(700).toFixed(0) + '" y="' + (yb + 39) + '">700</text><text x="' + (x1 - 6) + '" y="' + (yb + 39) + '">1100 nm</text></g></svg>';
    return out;
  }

  function wallSVG(pid, key) {
    var col = key === 'laser' ? colour(UI.laserW) : META[key].col, o = '<svg viewBox="0 0 160 110" role="img" aria-label="How the light spreads over a wall"><defs>' +
      '<radialGradient id="' + pid + 'w" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="' + col + '" stop-opacity="' + (key === 'led' ? 0.85 : 0.6) + '"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></radialGradient></defs>' +
      '<rect x="4" y="4" width="152" height="102" rx="6" fill="#0c1722" stroke="#1b3145"/>';
    if (key === 'laser') o += '<circle cx="80" cy="55" r="12" fill="' + col + '" opacity=".35" filter="none"/><circle cx="80" cy="55" r="4" fill="#fff"/><circle cx="80" cy="55" r="4" fill="' + col + '" opacity=".6"/>';
    else if (key === 'led') o += '<ellipse cx="80" cy="55" rx="64" ry="50" fill="url(#' + pid + 'w)"/>';
    else if (key === 'sodium') o += '<ellipse cx="80" cy="55" rx="76" ry="56" fill="url(#' + pid + 'w)"/>';
    else o += '<rect x="4" y="4" width="152" height="102" rx="6" fill="' + col + '" opacity=".28"/>';
    return o + '</svg>';
  }

  function imageSVG(pid, key, maxUm) {
    var col = key === 'laser' ? colour(UI.laserW) : META[key].col, d = imageUm(key);
    var pxPerUm = 124 / (maxUm * 1.25), r = Math.max(2.6, d / 2 * pxPerUm);
    var bars = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000], bar = bars[0];
    bars.forEach(function (b) { if (b * pxPerUm <= 60) bar = b; });
    var o = '<svg viewBox="0 0 160 160" role="img" aria-label="Image on the retina, to scale"><defs>' +
      '<radialGradient id="' + pid + 'rg" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="#e5683a"/><stop offset="1" stop-color="#9a2e1a"/></radialGradient>' +
      '<radialGradient id="' + pid + 'im" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="' + col + '" stop-opacity="1"/><stop offset="0.8" stop-color="' + col + '" stop-opacity=".9"/><stop offset="1" stop-color="' + col + '" stop-opacity=".55"/></radialGradient>' +
      '<filter id="' + pid + 'bf" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3"/></filter></defs>' +
      '<rect x="4" y="4" width="152" height="152" rx="8" fill="url(#' + pid + 'rg)"/>' +
      '<circle cx="80" cy="76" r="' + f1(r) + '" fill="' + col + '" opacity=".5" filter="url(#' + pid + 'bf)"/>' +
      '<circle cx="80" cy="76" r="' + f1(r) + '" fill="url(#' + pid + 'im)" stroke="' + (key === 'laser' ? '#fff' : col) + '" stroke-width="1"/>';
    if (key === 'laser') o += '<circle cx="80" cy="76" r="' + f1(Math.max(1.2, r * 0.45)) + '" fill="#fff"/>';
    o += '<line x1="14" y1="144" x2="' + f1(14 + bar * pxPerUm) + '" y2="144" stroke="#fff" stroke-width="2"/>' +
         '<text x="14" y="137" font-size="11" fill="#fff">' + um(bar) + '</text></svg>';
    return o;
  }

  /* waves (coherence) */
  function waveSpec(key) {
    var L = function (w) { return Math.max(18, Math.min(46, w / 532 * 28)); };
    if (key === 'laser') return [{ col: colour(UI.laserW), per: L(UI.laserW), amp: 17, jump: 0, seed: 1 }];
    if (key === 'led') return [{ col: '#6fa8ff', per: L(450), amp: 11, jump: 38, seed: 2 }, { col: '#7be08a', per: L(550), amp: 11, jump: 52, seed: 3 }, { col: '#ff8a6a', per: L(620), amp: 11, jump: 44, seed: 4 }];
    if (key === 'sodium') return [{ col: colour(589), per: L(589), amp: 15, jump: 46, seed: 5 }];
    return [420, 480, 550, 620, 700].map(function (w, k) { return { col: colour(w), per: L(w), amp: 8, jump: 28 + k * 5, seed: 7 + k }; });
  }
  function hash(n) { var x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }
  function wavePaths(comps, t) {
    return comps.map(function (c) {
      var d = '', k = 2 * Math.PI / c.per, u0 = 70 * t;
      for (var x = 0; x <= 200; x += 2) {
        var u = x - u0, ph = c.jump ? hash(Math.floor(u / c.jump) + c.seed * 17) * 2 * Math.PI : 0;
        var y = 35 + c.amp * Math.sin(k * u + ph);
        d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1);
      }
      return d;
    });
  }
  function waveSVG(pid, comps) {
    var o = '<svg viewBox="0 0 200 70" role="img" aria-label="Wave pattern of the light">';
    comps.forEach(function (c, i) { o += '<path id="' + pid + 'w' + i + '" fill="none" stroke="' + c.col + '" stroke-width="' + (comps.length > 3 ? 1.5 : 2.2) + '" opacity="' + (comps.length > 3 ? 0.8 : 0.95) + '" stroke-linejoin="round"/>'; });
    return o + '</svg>';
  }

  /* ------------------------------------------------------------------ */
  /* Panels                                                              */
  /* ------------------------------------------------------------------ */
  var panels = [];
  function makePanel(id, sel) {
    var el = document.createElement('section');
    el.className = 'card panel';
    el.id = id;
    el.innerHTML = '<div class="pchips chips" role="group" aria-label="Choose a light source"></div>' +
      '<div class="scene"></div>' +
      '<ul class="legend"></ul>' +
      '<div class="facts"></div>' +
      '<div class="mini">' +
        '<div class="mcell"><h3>Spectrum</h3><div class="sp"></div><p class="cap spcap"></p></div>' +
        '<div class="mcell"><h3>Image on the retina</h3><div class="im"></div><p class="cap imcap"></p></div>' +
        '<div class="mcell"><h3>Light on a wall</h3><div class="wl"></div><p class="cap wlcap"></p></div>' +
        '<div class="mcell"><h3>Waves</h3><div class="wv"></div><p class="cap wvcap"></p></div>' +
      '</div>' +
      '<p class="why-line"></p>';
    var chipBox = el.querySelector('.pchips');
    KEYS.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-k', k); b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<i class="sw" style="background:' + (k === 'laser' ? 'linear-gradient(90deg,#5ff08a,#5ff08a)' : META[k].col) + '"></i>' + META[k].chip;
      b.addEventListener('click', function () { UI[sel] = k; renderAll(true); });
      chipBox.appendChild(b);
    });
    $('panels').appendChild(el);
    return { id: id, sel: sel, el: el, t: 0, run: true, comps: [], scene: null };
  }

  function renderPanel(p, maxUm, restart) {
    var key = UI[p.sel], pid = p.id, fr = fractions(key);
    Array.prototype.forEach.call(p.el.querySelectorAll('.pchips button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === key));
      if (b.getAttribute('data-k') === 'laser') b.querySelector('.sw').style.background = colour(UI.laserW);
    });
    var sc = buildScene(pid, key);
    p.scene = sc;
    p.el.querySelector('.scene').innerHTML = sc.svg;
    p.el.querySelector('.legend').innerHTML = sc.legend.map(function (l) { return '<li><i style="background:' + l[0] + '"></i>' + l[1] + '</li>'; }).join('');

    var ang = angRad(key), angTxt = key === 'laser' ? 'Beam under a few mrad' : num(ang * 180 / Math.PI) + '° wide in your view';
    var d = imageUm(key);
    p.el.querySelector('.facts').innerHTML = TEXT[key].facts.map(function (f) { return '<span class="fact">' + f + '</span>'; }).join('') +
      '<span class="fact num">' + angTxt + '</span><span class="fact num">Image on retina: ' + um(d) + '</span><span class="fact num">Reaches retina: ' + Math.round(fr.reach * 100) + '%</span>';

    p.el.querySelector('.sp').innerHTML = spectrumSVG(pid, key);
    var spcap = key === 'laser' ? 'One narrow line. Fill = part that reaches the retina.' :
      key === 'led' ? 'Blue peak plus a broad yellow-green band. Design varies.' :
      key === 'sodium' ? 'Almost all at about 589 nm. Fill = reaches the retina.' :
      'Broad. Atmosphere removes the short UV. Fill = reaches the retina.';
    p.el.querySelector('.spcap').textContent = spcap;
    p.el.querySelector('.im').innerHTML = imageSVG(pid, key, maxUm);
    var laserD = imageUm('laser'), ratio = Math.pow(d / laserD, 2);
    p.el.querySelector('.imcap').textContent = key === 'laser' ? 'Width ' + um(d) + '. Drawn to scale.' :
      'Width ' + um(d) + '. Same power would cover about ' + (ratio >= 10 ? Math.round(ratio) : num(ratio)) + '× the area of a laser spot.';
    p.el.querySelector('.wl').innerHTML = wallSVG(pid, key);
    p.el.querySelector('.wlcap').textContent = TEXT[key].wall + '.';
    p.comps = waveSpec(key);
    p.el.querySelector('.wv').innerHTML = waveSVG(pid, p.comps);
    p.el.querySelector('.wvcap').textContent = key === 'laser' ? 'One colour, all in step.' :
      key === 'sodium' ? 'One colour, but short bursts out of step.' :
      key === 'led' ? 'Mixed colours, out of step.' : 'Many colours, all out of step.';
    p.el.querySelector('.why-line').textContent = TEXT[key].why;

    if (restart) { p.t = reduced ? 1 : 0; p.run = !reduced; }
    applyReveal(p);
    paintWaves(p, 0);
  }

  function applyReveal(p) {
    var rv = $(p.scene.rvId), hl = $(p.scene.hlId);
    if (!rv || !hl) return;
    var reach = ease(p.t / 0.7);
    rv.setAttribute('width', (p.t >= 1 ? 780 : 118 + (p.scene.retX + 6 - 118) * reach).toFixed(1));
    hl.setAttribute('opacity', ease((p.t - 0.7) / 0.3).toFixed(2));
  }
  function paintWaves(p, tt) {
    var d = wavePaths(p.comps, tt);
    d.forEach(function (s, i) { var e = $(p.id + 'w' + i); if (e) e.setAttribute('d', s); });
  }

  /* ------------------------------------------------------------------ */
  /* Controls                                                            */
  /* ------------------------------------------------------------------ */
  function slider(wrap, id, label, min, max, step, key, unit) {
    wrap.innerHTML = '<div class="ch"><label for="' + id + '">' + label + '</label><output id="' + id + 'o"></output></div>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '">';
    var el = $(id);
    el.value = UI[key];
    function show() { $(id + 'o').textContent = num(+el.value) + ' ' + unit; el.style.setProperty('--pct', ((el.value - min) / (max - min) * 100) + '%'); }
    el.addEventListener('input', function () { UI[key] = +el.value; show(); renderAll(false); });
    show();
  }

  function buildControls() {
    slider($('cmpPupilWrap'), 'cmpPupil', 'Pupil diameter', 2, 8, 0.1, 'pupil', 'mm');
    slider($('cmpDistWrap'), 'cmpDist', 'Lamp distance', 0.5, 10, 0.1, 'dist', 'm');
    var hint = document.createElement('p'); hint.className = 'hint'; hint.id = 'cmpDistHint';
    hint.textContent = 'Closer lamp: bigger image on the retina, same brightness per area.';
    $('cmpDistWrap').appendChild(hint);

    [405, 532, 635, 1064].forEach(function (w) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = w; b.setAttribute('data-w', w); b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { UI.laserW = w; renderAll(true); });
      $('cmpLaserChips').appendChild(b);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#cmpMode button'), function (b) {
      b.addEventListener('click', function () { UI.mode = b.getAttribute('data-m'); renderAll(true); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#cmpFocus button'), function (b) {
      b.addEventListener('click', function () { UI.focus = b.getAttribute('data-f'); renderAll(false); });
    });
    $('cmpReplay').addEventListener('click', function () { renderAll(true); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-goto="sim"]'), function (b) {
      b.addEventListener('click', function () { showTab('sim'); });
    });
  }

  function syncControls() {
    Array.prototype.forEach.call(document.querySelectorAll('#cmpMode button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-m') === UI.mode)); });
    Array.prototype.forEach.call(document.querySelectorAll('#cmpFocus button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-f') === UI.focus)); });
    Array.prototype.forEach.call(document.querySelectorAll('#cmpLaserChips button'), function (b) {
      b.setAttribute('aria-pressed', String(+b.getAttribute('data-w') === UI.laserW));
      b.style.setProperty('--wc', colour(+b.getAttribute('data-w')));
    });
    var shown = UI.mode === 'two' ? [UI.a, UI.b] : [UI.a];
    var hasLaser = shown.indexOf('laser') >= 0, hasLamp = shown.some(function (k) { return k === 'led' || k === 'sodium'; });
    $('cmpLaserWrap').hidden = !hasLaser;
    $('cmpDist').disabled = !hasLamp;
    $('cmpDistWrap').style.opacity = hasLamp ? '1' : '0.55';
    $('cmpDistHint').textContent = hasLamp ? 'Closer lamp: bigger image on the retina, same brightness per area.' : 'Used by the LED and sodium lamp only.';
    var onlyLaser = shown.every(function (k) { return k === 'laser'; });
    Array.prototype.forEach.call(document.querySelectorAll('#cmpFocus button'), function (b) { b.disabled = onlyLaser && b.getAttribute('data-f') !== 'all'; });
    // table highlight
    Array.prototype.forEach.call(document.querySelectorAll('#cmpTbl [data-col]'), function (c) {
      c.classList.toggle('sel', shown.indexOf(c.getAttribute('data-col')) >= 0);
    });
  }

  function renderAll(restart) {
    syncControls();
    var shown = UI.mode === 'two' ? [panels[0], panels[1]] : [panels[0]];
    panels[1].el.hidden = UI.mode !== 'two';
    $('panels').className = 'panels ' + (UI.mode === 'two' ? 'two' : 'one');
    var maxUm = Math.max.apply(null, shown.map(function (p) { return imageUm(UI[p.sel]); }));
    shown.forEach(function (p) { renderPanel(p, maxUm, restart); });
    if (restart) startLoop();
  }

  /* ------------------------------------------------------------------ */
  /* Animation loop (runs only while the section is visible)             */
  /* ------------------------------------------------------------------ */
  var raf = 0, lastTs = 0, clock = 0;
  function visible() { return !$('tabCmp').hidden && !document.hidden; }
  function tick(ts) {
    raf = 0;
    if (!visible()) return;
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts; clock += dt;
    panels.forEach(function (p) {
      if (p.el.hidden) return;
      if (p.run) { p.t += dt / 2.2; if (p.t >= 1) { p.t = 1; p.run = false; } applyReveal(p); }
      if (!reduced) paintWaves(p, clock);
    });
    raf = requestAnimationFrame(tick);
  }
  function startLoop() {
    if (reduced || !window.requestAnimationFrame) { panels.forEach(function (p) { p.t = 1; p.run = false; applyReveal(p); }); return; }
    if (!raf && visible()) { lastTs = 0; raf = requestAnimationFrame(tick); }
  }
  document.addEventListener('visibilitychange', startLoop);

  /* ------------------------------------------------------------------ */
  /* Tabs                                                                */
  /* ------------------------------------------------------------------ */
  function showTab(which) {
    var cmp = which === 'cmp';
    $('tabSim').hidden = cmp;
    $('tabCmp').hidden = !cmp;
    $('tabBtnSim').setAttribute('aria-selected', String(!cmp));
    $('tabBtnCmp').setAttribute('aria-selected', String(cmp));
    $('tabBtnSim').tabIndex = cmp ? -1 : 0;
    $('tabBtnCmp').tabIndex = cmp ? 0 : -1;
    try { history.replaceState(null, '', cmp ? '#compare' : location.pathname + location.search); } catch (e) { /* file:// may refuse */ }
    if (cmp) { renderAll(true); }
    window.scrollTo(0, 0);
  }
  $('tabBtnSim').addEventListener('click', function () { showTab('sim'); });
  $('tabBtnCmp').addEventListener('click', function () { showTab('cmp'); });
  Array.prototype.forEach.call(document.querySelectorAll('.tabs [role=tab]'), function (b) {
    b.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        var toCmp = e.key === 'ArrowRight' || e.key === 'End' ? true : false;
        showTab(toCmp ? 'cmp' : 'sim');
        $(toCmp ? 'tabBtnCmp' : 'tabBtnSim').focus();
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */
  buildControls();
  panels.push(makePanel('pa', 'a'));
  panels.push(makePanel('pb', 'b'));
  renderAll(true);
  if (location.hash === '#compare') showTab('cmp');
})();
