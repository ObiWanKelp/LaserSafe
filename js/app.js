/* LaserSafe Lab — interface, animated eye, injury drawing and short explanations.
   Depends on js/physics.js (window.LaserPhysics). No network, no external libraries. */
(function () {
  "use strict";
  var LP = window.LaserPhysics;
  var $ = function (id) {
    return document.getElementById(id);
  };

  /* ------------------------------------------------------------------ */
  /* Formatting helpers                                                  */
  /* ------------------------------------------------------------------ */
  function num(v, sig) {
    sig = sig || 3;
    if (!isFinite(v)) return "—";
    if (v === 0) return "0";
    var a = Math.abs(v);
    if (a >= 1e7 || a < 1e-3) return v.toExponential(sig - 1);
    return String(+v.toPrecision(sig));
  }
  var PRE = [
    [1e-12, "p"],
    [1e-9, "n"],
    [1e-6, "µ"],
    [1e-3, "m"],
    [1, ""],
    [1e3, "k"],
  ];
  function si(v, u) {
    if (!isFinite(v)) return { n: "—", u: u };
    if (v === 0) return { n: "0", u: u };
    var a = Math.abs(v),
      i = PRE.length - 1;
    while (i > 0 && a < PRE[i][0]) i--;
    return { n: num(v / PRE[i][0]), u: PRE[i][1] + u };
  }
  function S(v, u) {
    var s = si(v, u);
    return s.n + " " + s.u;
  }
  function lenStr(d) {
    return d < 1 ? num(d * 1e3) + " mm" : num(d) + " m";
  }
  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }
  function ease(x) {
    x = clamp(x, 0, 1);
    return x * x * (3 - 2 * x);
  }
  function capitalise(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ------------------------------------------------------------------ */
  /* Configuration                                                       */
  /* ------------------------------------------------------------------ */
  var CTRL = [
    {
      k: "power",
      label: "Laser power",
      unit: "mW",
      min: 0.1,
      max: 1000,
      log: true,
      hint: "More power, more energy every second.",
    },
    {
      k: "wave",
      label: "Wavelength",
      unit: "nm",
      min: 400,
      max: 1100,
      step: 1,
      hint: "Sets the colour. Above 700 nm it is invisible.",
    },
    {
      k: "d0",
      label: "Beam diameter at the laser",
      unit: "mm",
      min: 0.5,
      max: 10,
      step: 0.1,
      hint: "A wider beam spreads the power out.",
    },
    {
      k: "div",
      label: "Beam divergence",
      unit: "mrad",
      min: 0.1,
      max: 20,
      log: true,
      hint: "How fast the beam widens. 1 mrad = 1 mm per metre.",
    },
    {
      k: "dist",
      label: "Distance to the eye",
      unit: "m",
      min: 0.1,
      max: 100,
      log: true,
      hint: "Farther away: wider beam, weaker light.",
    },
    {
      k: "time",
      label: "Exposure time",
      unit: "s",
      min: 0.01,
      max: 10,
      log: true,
      hint: "Longer exposure delivers more energy.",
    },
    {
      k: "amb",
      label: "Surrounding light",
      unit: "cd/m²",
      min: 0.001,
      max: 10000,
      log: true,
      hint: "Brighter light makes the pupil smaller.",
    },
    {
      k: "pupil",
      label: "Pupil diameter",
      unit: "mm",
      min: 2,
      max: 8,
      step: 0.1,
      hint: "About 2 mm in bright light, 7–8 mm in the dark.",
    },
  ];
  var PRESETS = [
    {
      n: "Weak pointer",
      p: { power: 0.5, wave: 532, d0: 1.5, div: 1.5, dist: 2, time: 0.25 },
    },
    {
      n: "Pointer",
      p: { power: 5, wave: 532, d0: 2, div: 1, dist: 2, time: 0.25 },
    },
    {
      n: "Lab laser",
      p: { power: 50, wave: 633, d0: 2.5, div: 1.5, dist: 5, time: 1 },
    },
    {
      n: "Infrared 1064",
      p: { power: 500, wave: 1064, d0: 4, div: 0.5, dist: 10, time: 2 },
    },
    {
      n: "Expanded beam",
      p: { power: 50, wave: 532, d0: 8, div: 0.3, dist: 3, time: 1 },
    },
    {
      n: "Strong, close",
      p: { power: 500, wave: 532, d0: 2, div: 0.5, dist: 2, time: 2 },
    },
    {
      n: "Far away",
      p: { power: 100, wave: 445, d0: 1, div: 10, dist: 50, time: 1 },
    },
  ];
  var WAVES = [405, 445, 532, 635, 808, 980, 1064];
  var PUPIL_SMALL = 2,
    PUPIL_LARGE = 7;
  var START_PRESET = 2;

  // Level wording and colours. Index 'healthy' is the laser-off state.
  var LV = {
    healthy: {
      name: "Healthy eye",
      text: "Laser off. The retina looks normal.",
      col: "#6fb7ff",
    },
    low: {
      name: "Low exposure",
      text: "The beam enters the eye. No visible injury.",
      col: "#5fd68a",
      call: ["Low exposure", "No visible injury in this model"],
    },
    risk: {
      name: "Potentially harmful",
      text: "Retinal tissue is at risk.",
      col: "#f0b955",
      call: ["Warning: Retina at risk", "Potentially harmful exposure"],
    },
    burn: {
      name: "Simulated thermal injury",
      text: "The retina heats enough to burn a spot.",
      col: "#ff7a3d",
      call: [" Retinal thermal injury", "Light is absorbed here as heat"],
    },
    severe: {
      name: "Severe  injury",
      text: "A large area of the retina is damaged.",
      col: "#ff3d5a",
      call: ["Severe retinal injury", "Large area of heat damage"],
    },
  };

  var state = {
    p: {},
    pupilAuto: true,
    dispPupil: null,
    mode: "gaussian",
    view: "exposed",
    last: null,
    pin: null,
    anim: { t: 0, run: false },
    disp: { sev: null },
    target: { sev: -3, level: "low" },
  };
  Object.keys(PRESETS[START_PRESET].p).forEach(function (k) {
    state.p[k] = PRESETS[START_PRESET].p[k];
  });
  state.p.amb = 2;
  state.p.pupil = 3.5;
  var reduced = !!(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  /* Eye geometry (mm; cornea vertex at x = 0, optical axis y = 0) */
  var K = 17,
    CY = 280,
    XV = 620; // px per mm, axis y, cornea vertex x
  var IRIS_X = 3.6,
    LENS_BACK = 7.2,
    FOVEA_X = 23.45;
  var ENTRANCE = 0.885; // physical pupil / apparent pupil
  var X = function (mm) {
    return XV + mm * K;
  };
  var Y = function (mm) {
    return CY + mm * K;
  };
  var cornea = function (y) {
    return 7.8 - Math.sqrt(7.8 * 7.8 - y * y);
  };
  var FOVEA_PX = X(FOVEA_X);
  var RET_R = 187,
    RET_CX = FOVEA_PX - RET_R; // retina arc (px)

  /* Pupil reflex (Moon-Spencer style fit): diameter in mm from field luminance in cd/m^2. */
  function pupilFromLum(L) {
    var d = 4.9 - 3 * Math.tanh(0.4 * (Math.log10(L) + 1));
    return +clamp(d, 2, 8).toFixed(1);
  }
  function ambName(L) {
    return L < 0.01
      ? "Very dark"
      : L < 0.3
        ? "Dark room"
        : L < 5
          ? "Dim room"
          : L < 100
            ? "Indoor light"
            : L < 3000
              ? "Bright"
              : "Sunlight";
  }

  /* ------------------------------------------------------------------ */
  /* Colour                                                              */
  /* ------------------------------------------------------------------ */
  function wl2rgb(w) {
    var r = 0,
      g = 0,
      b = 0;
    if (w < 440) {
      r = -(w - 440) / 60;
      b = 1;
    } else if (w < 490) {
      g = (w - 440) / 50;
      b = 1;
    } else if (w < 510) {
      g = 1;
      b = -(w - 510) / 20;
    } else if (w < 580) {
      r = (w - 510) / 70;
      g = 1;
    } else if (w < 645) {
      r = 1;
      g = -(w - 645) / 65;
    } else r = 1;
    var k =
      w < 420
        ? 0.3 + (0.7 * (w - 400)) / 20
        : w > 700
          ? Math.max(0.35, 0.3 + (0.7 * (780 - w)) / 80)
          : 1;
    return [r, g, b].map(function (x) {
      return Math.round(255 * Math.pow(Math.max(0, x) * k, 0.8));
    });
  }
  function colour(w) {
    if (w > 700) return "#c68cff"; // false colour for invisible near-infrared
    var c = wl2rgb(w);
    return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
  }
  function colourName(w) {
    if (w < 440) return "violet";
    if (w < 495) return "blue";
    if (w < 570) return "green";
    if (w < 590) return "yellow";
    if (w < 620) return "orange";
    if (w <= 700) return "red";
    return "near-infrared";
  }
  // Display brightness cue: log scale of power, 0.1 mW -> dim, 1000 mW -> full.
  function bright(mw, floor) {
    if (!(mw > 0)) return 0;
    return clamp(floor + ((1 - floor) * Math.log10(mw / 0.1)) / 4, floor, 1);
  }

  /* ------------------------------------------------------------------ */
  /* Controls                                                            */
  /* ------------------------------------------------------------------ */
  function fromS(c, s) {
    return c.log
      ? c.min * Math.pow(c.max / c.min, s / 1000)
      : c.min + ((c.max - c.min) * s) / 1000;
  }
  function toS(c, v) {
    return c.log
      ? (1000 * Math.log(v / c.min)) / Math.log(c.max / c.min)
      : (1000 * (v - c.min)) / (c.max - c.min);
  }
  function readSlider(c) {
    var v = fromS(c, +$("r_" + c.k).value);
    if (c.step) {
      v = Math.round(v / c.step) * c.step;
      v = +v.toFixed(3);
    } else v = +v.toPrecision(3);
    return clamp(v, c.min, c.max);
  }

  function buildControls() {
    CTRL.forEach(function (c) {
      var d = document.createElement("div");
      d.className = "ctl";
      var spec = "",
        chips = "";
      if (c.k === "wave") {
        spec =
          '<div class="spec" aria-hidden="true"><div class="vis" id="specVis"></div><div class="nir"></div><i id="specMark"></i></div>';
        chips =
          '<p class="wname" id="waveName"></p><div class="chips" id="waveChips" role="group" aria-label="Common laser wavelengths"></div>';
      }
      d.innerHTML =
        '<div class="ch"><label for="r_' +
        c.k +
        '">' +
        c.label +
        '</label><output id="v_' +
        c.k +
        '" for="r_' +
        c.k +
        '"></output></div>' +
        spec +
        '<input type="range" id="r_' +
        c.k +
        '" min="0" max="1000" step="1" aria-describedby="h_' +
        c.k +
        '">' +
        '<p class="hint" id="h_' +
        c.k +
        '">' +
        c.hint +
        "</p>" +
        chips;
      $(c.k === "pupil" ? "ctlEye" : "ctlLaser").appendChild(d);
      $("r_" + c.k).addEventListener("input", function () {
        state.p[c.k] = readSlider(c);
        state.last = c.k;
        showExposure(false);
        update();
      });
    });

    var stops = [];
    for (var w = 400; w <= 700; w += 20)
      stops.push(colour(w) + " " + ((w - 400) / 3).toFixed(1) + "%");
    $("specVis").style.background =
      "linear-gradient(to right," + stops.join(",") + ")";

    WAVES.forEach(function (w) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = w;
      b.setAttribute("data-w", w);
      b.setAttribute("aria-pressed", "false");
      b.title = w + " nm";
      b.addEventListener("click", function () {
        state.p.wave = w;
        state.last = null;
        showExposure(false);
        update();
      });
      $("waveChips").appendChild(b);
    });

    PRESETS.forEach(function (s, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = s.n;
      b.setAttribute("data-i", i);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        loadPreset(i);
      });
      $("presets").appendChild(b);
    });

    Array.prototype.forEach.call(
      document.querySelectorAll(".seg button[data-m]"),
      function (b) {
        b.addEventListener("click", function () {
          state.mode = b.getAttribute("data-m");
          state.last = null;
          showExposure(false);
          update();
        });
      },
    );

    Array.prototype.forEach.call(
      document.querySelectorAll("#pupSeg button"),
      function (b) {
        b.addEventListener("click", function () {
          state.pupilAuto = b.getAttribute("data-p") === "auto";
          state.last = null;
          showExposure(false);
          update();
        });
      },
    );

    // before / after, replay, reset
    Array.prototype.forEach.call(
      document.querySelectorAll("#viewSeg button"),
      function (b) {
        b.addEventListener("click", function () {
          if (b.getAttribute("data-v") === "healthy") {
            state.view = "healthy";
            state.anim.run = false;
            state.anim.t = 1;
          } else showExposure(true);
          update();
        });
      },
    );
    $("replayBtn").addEventListener("click", function () {
      showExposure(true);
      update();
    });
    $("resetBtn").addEventListener("click", resetEye);

    // compare
    $("pinBtn").addEventListener("click", function () {
      state.pin = { p: copy(state.p), mode: state.mode };
      update();
    });
    $("unpinBtn").addEventListener("click", function () {
      state.pin = null;
      update();
    });
    $("pupilCmpBtn").addEventListener("click", function () {
      state.pupilAuto = false;
      var a = copy(state.p);
      a.pupil = PUPIL_SMALL;
      state.pin = { p: a, mode: state.mode };
      state.p.pupil = PUPIL_LARGE;
      state.last = null;
      showExposure(false);
      update();
    });
  }

  function copy(o) {
    var c = {};
    Object.keys(o).forEach(function (k) {
      c[k] = o[k];
    });
    return c;
  }

  // Switch to the exposure view. replay = true restarts the beam animation.
  function showExposure(replay) {
    var was = state.view;
    state.view = "exposed";
    if (replay || was === "healthy") {
      state.anim.t = reduced ? 1 : 0;
      state.anim.run = !reduced;
      state.disp.sev = null;
    }
  }
  function resetEye() {
    state.view = "healthy";
    state.anim.run = false;
    state.anim.t = 1;
    state.disp.sev = null;
    update();
  }
  function loadPreset(i) {
    Object.keys(PRESETS[i].p).forEach(function (k) {
      state.p[k] = PRESETS[i].p[k];
    });
    state.last = null;
    showExposure(true);
    update();
  }

  function syncControls(p) {
    CTRL.forEach(function (c) {
      var el = $("r_" + c.k);
      if (state.last !== c.k) el.value = toS(c, p[c.k]);
      el.style.setProperty("--pct", +el.value / 10 + "%");
      $("v_" + c.k).textContent =
        c.k === "amb" ? ambName(p.amb) : num(p[c.k]) + " " + c.unit;
    });
    Array.prototype.forEach.call(
      document.querySelectorAll("#presets button"),
      function (b) {
        var s = PRESETS[+b.getAttribute("data-i")].p;
        var same = Object.keys(s).every(function (k) {
          return Math.abs(s[k] - p[k]) < 1e-9 * Math.max(1, Math.abs(p[k]));
        });
        b.setAttribute("aria-pressed", String(same));
      },
    );
    Array.prototype.forEach.call(
      document.querySelectorAll("#waveChips button"),
      function (b) {
        b.setAttribute(
          "aria-pressed",
          String(+b.getAttribute("data-w") === p.wave),
        );
      },
    );
    Array.prototype.forEach.call(
      document.querySelectorAll(".seg button[data-m]"),
      function (b) {
        b.setAttribute(
          "aria-pressed",
          String(b.getAttribute("data-m") === state.mode),
        );
      },
    );
    Array.prototype.forEach.call(
      document.querySelectorAll("#viewSeg button"),
      function (b) {
        b.setAttribute(
          "aria-pressed",
          String(b.getAttribute("data-v") === state.view),
        );
      },
    );
    Array.prototype.forEach.call(
      document.querySelectorAll("#pupSeg button"),
      function (b) {
        b.setAttribute(
          "aria-pressed",
          String((b.getAttribute("data-p") === "auto") === state.pupilAuto),
        );
      },
    );
    $("r_pupil").disabled = state.pupilAuto;
    $("r_amb").disabled = !state.pupilAuto;
    $("r_pupil").parentNode.style.opacity = state.pupilAuto ? "0.55" : "1";
    $("r_amb").parentNode.style.opacity = state.pupilAuto ? "1" : "0.55";
    $("h_pupil").textContent = state.pupilAuto
      ? "Set by the surrounding light. Switch to Manual to choose."
      : "About 2 mm in bright light, 7–8 mm in the dark.";
    $("h_amb").textContent = state.pupilAuto
      ? "Brighter light makes the pupil smaller (" + num(p.amb) + " cd/m²)."
      : "Not used in Manual mode.";
    $("specMark").style.left = (p.wave - 400) / 7 + "%";
    $("waveName").textContent =
      p.wave > 700
        ? "Near-infrared — invisible (shown in false colour)"
        : capitalise(colourName(p.wave)) + " — visible";
    document.documentElement.style.setProperty("--beam", colour(p.wave));
  }

  /* ------------------------------------------------------------------ */
  /* Scene: laser, beam, iris, rays                                      */
  /* ------------------------------------------------------------------ */
  function pts(a) {
    return a
      .map(function (q) {
        return q[0].toFixed(1) + "," + q[1].toFixed(1);
      })
      .join(" ");
  }
  function set(id, o) {
    var e = $(id);
    for (var k in o) e.setAttribute(k, o[k]);
  }
  function show(id, on) {
    $(id).setAttribute("display", on ? "inline" : "none");
  }

  function drawScene(p, r, m, on) {
    var col = colour(p.wave);
    var dmm = r.d * 1e3,
      rb = dmm / 2,
      rp = state.dispPupil / 2,
      rpPhys = rp * ENTRANCE;
    var bPow = bright(p.power, 0.12);
    var bIn = bright(r.Pp * 1e3, 0.08);

    // laser housing
    var h0 = Math.max(1.5, (p.d0 / 2) * K);
    var hh = Math.max(88, p.d0 * K + 36);
    set("housing", { y: CY - hh / 2, height: hh });
    set("hband", { y: CY - hh / 2 + 1, height: hh - 2 });
    set("lasLbl", { y: CY - hh / 2 - 9 });
    set("lasWave", { y: CY - 4, fill: on ? col : "#5d788c" });
    set("lasPow", { y: CY + 19 });
    $("lasWave").textContent = num(p.wave) + " nm";
    $("lasPow").textContent = on ? num(p.power) + " mW" : "OFF";
    set("aperture", {
      y: CY - h0 - 3,
      height: 2 * h0 + 6,
      fill: on ? col : "#33495a",
    });

    // iris opening follows the pupil slider (also in the healthy view)
    var irisOuter = 6.9;
    set("irisT", { y: -irisOuter, height: (irisOuter - rpPhys).toFixed(3) });
    set("irisB", {
      y: rpPhys.toFixed(3),
      height: (irisOuter - rpPhys).toFixed(3),
    });

    // beam in the air
    var hbRaw = rb * K,
      clip = hbRaw > 250;
    var hb = Math.max(h0, Math.min(250, hbRaw));
    var poly = [
      [156, CY - h0],
      [XV - 2, CY - hb],
      [XV - 2, CY + hb],
      [156, CY + h0],
    ];
    set("beamPoly", {
      points: pts(poly),
      opacity: (0.16 + 0.5 * bPow).toFixed(3),
    });
    set("beamGlow", {
      points: pts(poly),
      fill: col,
      opacity: (0.12 + 0.4 * bPow).toFixed(3),
    });
    $("fBeamBlur").setAttribute("stdDeviation", (2 + 10 * bPow).toFixed(1));
    var prof =
      m === "gaussian" ? [0.135, 0.607, 1, 0.607, 0.135] : [1, 1, 1, 1, 1];
    prof.forEach(function (o, i) {
      set("gs" + i, { "stop-color": col, "stop-opacity": o });
    });
    var edge = {
      stroke: col,
      opacity: (0.35 + 0.6 * bPow).toFixed(2),
      "stroke-width": (1.5 + 1.5 * bPow).toFixed(1),
    };
    set(
      "e1",
      Object.assign(
        {
          points: pts([
            [156, CY - h0],
            [XV - 2, CY - hb],
          ]),
        },
        edge,
      ),
    );
    set(
      "e2",
      Object.assign(
        {
          points: pts([
            [156, CY + h0],
            [XV - 2, CY + hb],
          ]),
        },
        edge,
      ),
    );
    set("axis", {
      stroke: col,
      opacity: (0.3 + 0.55 * bPow).toFixed(2),
      "stroke-width": (1.5 + 3.5 * bPow).toFixed(1),
    });
    $("clipnote").textContent =
      on && clip
        ? "The beam is wider than the drawing and is shown clipped."
        : "";
    show("beamLayer", on);

    // light blocked by the iris
    var yin = Math.min(rb, rp, 5.5),
      yb = Math.min(rb, 5.5);
    var blocked = on && yb - yin > 0.02;
    [-1, 1].forEach(function (sg) {
      var s = sg < 0 ? "T" : "B";
      if (blocked) {
        var wedge = pts([
          [X(cornea(yin)), Y(sg * yin)],
          [X(cornea(yb)), Y(sg * yb)],
          [X(IRIS_X), Y(sg * ENTRANCE * yb)],
          [X(IRIS_X), Y(sg * ENTRANCE * yin)],
        ]);
        set("wedge" + s, {
          points: wedge,
          fill: col,
          opacity: (0.1 + 0.3 * bPow).toFixed(2),
          display: "inline",
        });
        var top = ENTRANCE * yb;
        set("blk" + s, {
          y: sg < 0 ? -top : rpPhys.toFixed(3),
          height: Math.max(0, top - rpPhys).toFixed(3),
          fill: col,
          display: "inline",
        });
      } else {
        set("wedge" + s, { display: "none" });
        set("blk" + s, { display: "none" });
      }
    });

    // rays through the pupil, bent by cornea and lens onto the fovea
    var sigma = rb;
    for (var i = 0; i < 7; i++) {
      var y = (yin * (i - 3)) / 3;
      var w = m === "gaussian" ? Math.exp(-2 * (y / sigma) * (y / sigma)) : 1;
      set("ray" + i, {
        points: pts([
          [XV - 2, Y(y)],
          [X(cornea(y)), Y(y)],
          [X(IRIS_X), Y(ENTRANCE * y)],
          [X(LENS_BACK), Y(0.745 * y)],
          [X(FOVEA_X), Y(0)],
        ]),
        stroke: col,
        opacity: clamp(0.15 + 0.8 * bIn * w, 0.05, 1).toFixed(2),
      });
    }
    var top2 = [],
      bot = [];
    [-1, 1].forEach(function (sg) {
      var yy = sg * yin;
      var line = [
        [XV - 2, Y(yy)],
        [X(cornea(yy)), Y(yy)],
        [X(IRIS_X), Y(ENTRANCE * yy)],
        [X(LENS_BACK), Y(0.745 * yy)],
        [X(FOVEA_X), Y(0)],
      ];
      if (sg < 0) top2 = line;
      else bot = line.slice().reverse();
    });
    set("bundle", {
      points: pts(top2.concat(bot)),
      fill: col,
      opacity: (0.06 + 0.2 * bIn).toFixed(3),
    });
    set("spot", {
      cx: FOVEA_PX,
      cy: CY,
      r: (2.5 + 2 * bIn).toFixed(1),
      fill: col,
      opacity: (0.45 + 0.55 * bIn).toFixed(2),
    });
    set("spotGlow", {
      cx: FOVEA_PX,
      cy: CY,
      r: (6 + 6 * bIn).toFixed(1),
      fill: col,
      opacity: (0.25 + 0.5 * bIn).toFixed(2),
    });
    show("inEye", on);
    set("head", { fill: col });

    // absorption in the lens and in the water of the eye
    var e = r.eye;
    set("lensGlow", { opacity: on ? clamp(e.aL * 1.6, 0, 0.7).toFixed(2) : 0 });
    set("vitGlow", { opacity: on ? clamp(e.aV * 1.4, 0, 0.45).toFixed(2) : 0 });

    $("pupTxt").textContent =
      "Pupil " +
      num(state.dispPupil) +
      " mm" +
      (state.pupilAuto ? " (auto)" : "");
    var lt = clamp((Math.log10(p.amb) + 3) / 7, 0, 1);
    if (lt < 0.43)
      set("ambTint", {
        fill: "#000",
        opacity: (((0.43 - lt) / 0.43) * 0.35).toFixed(3),
      });
    else
      set("ambTint", {
        fill: "#fff",
        opacity: (((lt - 0.43) / 0.57) * 0.12).toFixed(3),
      });

    $("dimTxt").textContent =
      num(p.dist) + " m from laser to eye (length not to scale)";
  }

  /* ------------------------------------------------------------------ */
  /* Injury on the cross-section (retina arc)                            */
  /* ------------------------------------------------------------------ */
  function arc(a) {
    var x1 = RET_CX + RET_R * Math.cos(a),
      y1 = CY - RET_R * Math.sin(a),
      y2 = CY + RET_R * Math.sin(a);
    return (
      "M" +
      x1.toFixed(1) +
      " " +
      y1.toFixed(1) +
      " A" +
      RET_R +
      " " +
      RET_R +
      " 0 0 1 " +
      x1.toFixed(1) +
      " " +
      y2.toFixed(1)
    );
  }
  function levelOfSev(s) {
    return s < -1 ? "low" : s < 0 ? "risk" : s < 1 ? "burn" : "severe";
  }
  // Visual size multiplier: a bigger retinal spot gives a somewhat bigger drawn injury.
  function boost(spot) {
    return 1 + 0.25 * clamp(Math.log10(spot / LP.MIN_SPOT), 0, 2);
  }

  function paintLesion(sev, k, spot) {
    var on = state.view === "exposed";
    var lvl = on ? levelOfSev(sev) : "healthy";
    var hurt =
      on && (lvl === "risk" || lvl === "burn" || lvl === "severe") && k > 0.001;
    show("lesion", hurt);
    var callOn = on && k > 0.6;
    if (!callOn) show("callout", false);
    if (!hurt) {
      if (callOn) paintCallout(lvl);
      return;
    }

    var c = clamp(sev, -1, 2);
    var L = (9 + (c + 1) * 17) * boost(spot) * k; // half length along the retina, px
    var a = L / RET_R;
    var w = 11 + 4 * c; // core width, px
    var isInj = lvl === "burn" || lvl === "severe";
    var col = LV[lvl].col;

    set("lsRisk", {
      d: arc(a * 1.4),
      "stroke-width": 20,
      opacity: lvl === "risk" ? (0.55 * k).toFixed(2) : 0,
    });
    set("lsHalo", {
      d: arc(a * 1.9),
      "stroke-width": w + 22,
      opacity: isInj ? ((lvl === "severe" ? 0.5 : 0.35) * k).toFixed(2) : 0,
    });
    set("lsWhite", {
      d: arc(a * 1.45),
      "stroke-width": w + 10,
      opacity: isInj ? ((lvl === "severe" ? 0.8 : 0.6) * k).toFixed(2) : 0,
    });
    set("lsRim", {
      d: arc(a * 1.15),
      "stroke-width": w + 5,
      opacity: isInj ? (0.95 * k).toFixed(2) : 0,
    });
    set("lsCore", {
      d: arc(a),
      "stroke-width": w,
      opacity: isInj ? k.toFixed(2) : 0,
    });

    // bleeding into the vitreous for the severe state
    var hem = lvl === "severe" ? clamp((sev - 1) * 3, 0, 1) * k : 0;
    var hp = [
      [-11, -0.5, 3.2],
      [-15, 0.35, 4.2],
      [-9, 0.85, 2.6],
    ];
    hp.forEach(function (q, i) {
      set("hem" + i, {
        cx: (FOVEA_PX + q[0]).toFixed(1),
        cy: (CY + q[1] * L).toFixed(1),
        r: (q[2] + L * 0.05).toFixed(1),
        opacity: (0.85 * hem).toFixed(2),
      });
    });
    ["heat0", "heat1"].forEach(function (id) {
      set(id, { stroke: col });
    });
    if (callOn) paintCallout(lvl);
  }

  function paintCallout(lvl) {
    var lv = LV[lvl];
    if (!lv || !lv.call) {
      show("callout", false);
      return;
    }
    show("callout", true);
    var col = lv.col,
      warn = lvl !== "low";
    $("call1").textContent = lv.call[0];
    $("call2").textContent = lv.call[1];
    set("call1", { fill: col });
    set("leader", { stroke: col });
    set("warnIcon", { stroke: col, display: warn ? "inline" : "none" });
    set("warnMark", { fill: col, display: warn ? "inline" : "none" });
  }

  /* ------------------------------------------------------------------ */
  /* Retina close-up (front view of the back of the eye)                 */
  /* ------------------------------------------------------------------ */
  var fid = 0;
  function blob(cx, cy, r, seed) {
    var n = 24,
      d = "";
    for (var i = 0; i < n; i++) {
      var t = (i / n) * 2 * Math.PI;
      var rr =
        r *
        (1 +
          0.16 * Math.sin(3 * t + seed) +
          0.08 * Math.sin(5 * t + seed * 2.3));
      d +=
        (i ? "L" : "M") +
        (cx + rr * Math.cos(t)).toFixed(1) +
        " " +
        (cy + rr * Math.sin(t)).toFixed(1);
    }
    return d + "Z";
  }

  // sev: log10 of injury index, or null for a healthy retina. k: growth 0..1. col: beam colour.
  function fundus(sev, k, col, spot, alt) {
    var id = "f" + ++fid,
      MX = 132,
      MY = 100;
    var s =
      '<svg class="fundus" viewBox="0 0 200 200" role="img" aria-label="' +
      alt +
      '"><defs>' +
      '<radialGradient id="' +
      id +
      'g" cx="0.45" cy="0.5" r="0.65"><stop offset="0" stop-color="#f0764a"/><stop offset="0.55" stop-color="#d4502a"/><stop offset="1" stop-color="#8f2a18"/></radialGradient>' +
      '<radialGradient id="' +
      id +
      'd" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff6d2"/><stop offset="1" stop-color="#eebb62"/></radialGradient>' +
      '<filter id="' +
      id +
      'b"><feGaussianBlur stdDeviation="4"/></filter>' +
      '<filter id="' +
      id +
      's"><feGaussianBlur stdDeviation="1.6"/></filter>' +
      '<clipPath id="' +
      id +
      'c"><circle cx="100" cy="100" r="94"/></clipPath></defs>' +
      '<g clip-path="url(#' +
      id +
      'c)">' +
      '<circle cx="100" cy="100" r="96" fill="url(#' +
      id +
      'g)"/>' +
      '<ellipse cx="' +
      MX +
      '" cy="' +
      MY +
      '" rx="26" ry="24" fill="#a63a1c" opacity=".5" filter="url(#' +
      id +
      'b)"/>' +
      '<g fill="none" stroke="#7d1410" stroke-linecap="round" opacity=".85">' +
      '<path d="M52 100 C70 70 90 45 132 36 S178 40 190 60" stroke-width="2.6"/>' +
      '<path d="M52 100 C70 130 90 155 132 164 S178 160 190 140" stroke-width="2.6"/>' +
      '<path d="M60 98 C88 94 104 88 120 90" stroke-width="1.6"/>' +
      '<path d="M60 102 C88 108 104 112 120 110" stroke-width="1.6"/>' +
      '<path d="M96 64 C110 70 118 78 124 84" stroke-width="1.3"/>' +
      '<path d="M96 136 C110 130 118 122 124 116" stroke-width="1.3"/></g>' +
      '<circle cx="50" cy="100" r="16" fill="url(#' +
      id +
      'd)"/><circle cx="52" cy="100" r="7" fill="#fffbe6" opacity=".8"/>' +
      '<circle cx="' +
      MX +
      '" cy="' +
      MY +
      '" r="3" fill="#7a2514" opacity=".8"/>';

    if (sev !== null) {
      var lvl = levelOfSev(sev),
        c = clamp(sev, -1, 2);
      var R = (5 + ((c + 1) / 3) * 36) * boost(spot) * k;
      if (lvl === "low") {
        s +=
          '<circle cx="' +
          MX +
          '" cy="' +
          MY +
          '" r="6" fill="' +
          col +
          '" opacity=".5" filter="url(#' +
          id +
          's)"/>' +
          '<circle cx="' +
          MX +
          '" cy="' +
          MY +
          '" r="2.4" fill="' +
          col +
          '"/>';
      } else if (k > 0.001) {
        if (lvl === "risk") {
          s +=
            '<circle cx="' +
            MX +
            '" cy="' +
            MY +
            '" r="' +
            (R + 7).toFixed(1) +
            '" fill="#f0b955" opacity=".22" filter="url(#' +
            id +
            's)"/>' +
            '<circle cx="' +
            MX +
            '" cy="' +
            MY +
            '" r="' +
            (R + 5).toFixed(1) +
            '" fill="none" stroke="#f0b955" stroke-width="2.2" stroke-dasharray="5 4"/>' +
            '<circle cx="' +
            MX +
            '" cy="' +
            MY +
            '" r="2.6" fill="' +
            col +
            '"/>';
        } else {
          var sv = lvl === "severe";
          s +=
            '<circle cx="' +
            MX +
            '" cy="' +
            MY +
            '" r="' +
            (R * 1.7).toFixed(1) +
            '" fill="#fff0c8" opacity="' +
            (sv ? 0.42 : 0.32) +
            '" filter="url(#' +
            id +
            'b)"/>' +
            '<path d="' +
            blob(MX, MY, R * 1.3, 1.1) +
            '" fill="#e9dcc4" opacity="' +
            (sv ? 0.85 : 0.75) +
            '"/>' +
            '<path d="' +
            blob(MX, MY, R * 1.0, 2.4) +
            '" fill="' +
            (sv ? "#5a1a0c" : "#6b2412") +
            '" opacity=".95"/>' +
            '<path d="' +
            blob(MX, MY, R * (sv ? 0.74 : 0.58), 4.2) +
            '" fill="#0d0504"/>';
          if (sv) {
            s +=
              '<g fill="#8a0f1c" opacity=".9">' +
              '<path d="' +
              blob(MX + R * 0.95, MY - R * 0.5, R * 0.3, 0.5) +
              '"/>' +
              '<path d="' +
              blob(MX - R * 0.8, MY + R * 0.75, R * 0.26, 2.2) +
              '"/>' +
              '<path d="' +
              blob(MX + R * 0.3, MY + R * 1.1, R * 0.22, 3.7) +
              '"/></g>' +
              '<g stroke="#f4e6c8" stroke-width="1.3" opacity=".7">' +
              '<line x1="' +
              (MX - R * 1.5) +
              '" y1="' +
              MY +
              '" x2="' +
              (MX - R * 1.9) +
              '" y2="' +
              (MY - 4) +
              '"/>' +
              '<line x1="' +
              (MX + R * 1.5) +
              '" y1="' +
              (MY + 4) +
              '" x2="' +
              (MX + R * 1.9) +
              '" y2="' +
              (MY + 9) +
              '"/></g>';
          }
        }
      }
    }
    return (
      s +
      '</g><circle cx="100" cy="100" r="94" fill="none" stroke="#1a0a08" stroke-width="3"/></svg>'
    );
  }

  function dl(rows) {
    return (
      "<dl>" +
      rows
        .map(function (q) {
          return "<dt>" + q[0] + "</dt><dd>" + q[1] + "</dd>";
        })
        .join("") +
      "</dl>"
    );
  }
  function setLine(p) {
    return (
      num(p.power) +
      " mW · " +
      num(p.wave) +
      " nm · " +
      num(p.dist) +
      " m · " +
      num(p.time) +
      " s · " +
      num(p.pupil) +
      " mm pupil"
    );
  }
  function statRows(r) {
    var e = r.eye;
    return dl([
      ["Retinal spot", num(e.spot * 1e6) + " µm"],
      ["Retinal irradiance", S(e.Er / 1e4, "W/cm²")],
      ["Injury index", num(e.DI) + "×"],
    ]);
  }

  function renderHealthy() {
    var f = $("fcHealthy");
    f.style.setProperty("--lvl", LV.healthy.col);
    f.innerHTML =
      fundus(null, 0, "#fff", LP.MIN_SPOT, "Healthy retina") +
      '<figcaption><div class="ft"><span>Healthy retina</span><span class="chip">Normal</span></div>' +
      '<p class="set">Even colour. Clear macula and optic disc.</p></figcaption>';
  }

  function renderLive(r, p) {
    var f = $("fcLive"),
      on = state.view === "exposed";
    var sev = state.disp.sev === null ? state.target.sev : state.disp.sev;
    var lvl = on ? levelOfSev(sev) : "healthy";
    f.className = "fc live";
    f.style.setProperty("--lvl", LV[lvl].col);
    var k = state.anim.run ? ease((state.anim.t - 0.65) / 0.35) : 1;
    f.innerHTML =
      fundus(
        on ? sev : null,
        k,
        colour(p.wave),
        r.eye.spot,
        on ? "Retina after exposure: " + LV[lvl].name : "Retina, laser off",
      ) +
      '<figcaption><div class="ft"><span>' +
      (on ? "After exposure" : "Laser off") +
      '</span><span class="chip">' +
      LV[lvl].name +
      "</span></div>" +
      (on ? statRows(r) : '<p class="set">Press Replay or move a slider.</p>') +
      "</figcaption>";
  }

  function renderPin() {
    var f = $("fcPin");
    f.hidden = !state.pin;
    $("unpinBtn").hidden = !state.pin;
    $("pinHint").textContent = state.pin
      ? "Pinned on the right. Change a slider to see how the same laser behaves under new conditions."
      : "Pin a setup, then change a slider to compare the same laser under different conditions.";
    if (!state.pin) {
      f.innerHTML = "";
      return;
    }
    var r = LP.calc(state.pin.p, state.pin.mode),
      lvl = r.eye.level;
    f.className = "fc";
    f.style.setProperty("--lvl", LV[lvl].col);
    f.innerHTML =
      fundus(
        r.eye.sev,
        1,
        colour(state.pin.p.wave),
        r.eye.spot,
        "Pinned setup: " + LV[lvl].name,
      ) +
      '<figcaption><div class="ft"><span>Pinned</span><span class="chip">' +
      LV[lvl].name +
      "</span></div>" +
      statRows(r) +
      '<p class="set">' +
      setLine(state.pin.p) +
      "</p></figcaption>";
  }

  /* ------------------------------------------------------------------ */
  /* Status, meter, reach chips, numbers, explanations                   */
  /* ------------------------------------------------------------------ */
  function renderStatus(lvl) {
    var lv = LV[lvl];
    $("status").style.setProperty("--lvl", lv.col);
    $("stName").textContent = lv.name;
    $("stText").textContent = lv.text;
  }

  function renderMeter(e, on) {
    var pct = clamp(((clamp(e.sev, -2, 2) + 2) / 4) * 100, 0, 100);
    $("mmark").style.left = pct + "%";
    $("mval").textContent = num(e.DI) + "×";
    $("mval").style.color = on ? LV[e.level].col : LV.healthy.col;
  }

  function chip(name, st) {
    var cls = st === "main" ? "rc main" : st === "some" ? "rc some" : "rc";
    var txt =
      st === "main"
        ? "absorbs most"
        : st === "some"
          ? "absorbs some"
          : "passes";
    return '<span class="' + cls + '">' + name + ": " + txt + "</span>";
  }
  function renderReach(p, r) {
    var e = r.eye;
    var h =
      "<b>Where the light goes</b>" +
      chip("Cornea", "pass") +
      chip("Lens", e.aL > 0.15 ? "some" : "pass") +
      chip("Vitreous", e.aV > 0.1 ? "some" : "pass") +
      chip(p.wave > 800 ? "Retina & choroid" : "Retina", "main");
    $("reach").innerHTML = h;
  }

  function renderCards(p, r) {
    var e = r.eye;
    var dTxt =
      r.d < 1 ? { n: num(r.d * 1e3), u: "mm" } : { n: num(r.d), u: "m" };
    var Pp = si(r.Pp, "W"),
      Er = si(e.Er / 1e4, "W/cm²"),
      Pa = si(e.Pabs, "W");
    var cards = [
      ["Beam at the eye", dTxt.n, dTxt.u, "Started at " + num(p.d0) + " mm"],
      [
        "Through the pupil",
        Pp.n,
        Pp.u,
        num(r.fr * 100) +
          "% of the beam · " +
          S(r.Qp, "J") +
          " in " +
          num(p.time) +
          " s",
      ],
      [
        "Retinal spot",
        num(e.spot * 1e6),
        "µm",
        e.blur > 1e-5
          ? "Blurred: too close to focus"
          : "Focused (smallest is 25 µm)",
      ],
      [
        "Retinal irradiance",
        Er.n,
        Er.u,
        num(e.gain) + "× the level at the cornea",
      ],
      [
        "Heat absorbed",
        Pa.n,
        Pa.u,
        num(e.T * 100) +
          "% reaches the retina · " +
          num(e.A * 100) +
          "% of that absorbed",
      ],
      ["Injury index", num(e.DI), "×", LV[e.level].name],
    ];
    $("cards").innerHTML = cards
      .map(function (c) {
        return (
          '<div class="m"><div class="l">' +
          c[0] +
          '</div><div class="n">' +
          c[1] +
          "<small>" +
          c[2] +
          '</small></div><div class="d">' +
          c[3] +
          "</div></div>"
        );
      })
      .join("");
  }

  function waveText(w, e) {
    var t;
    if (w < 450)
      t =
        capitalise(colourName(w)) +
        " light. The lens absorbs " +
        num(e.aL * 100) +
        "% of it, so less reaches the retina. Blue and violet can also harm the retina by chemistry, which this model does not include.";
    else if (w <= 700)
      t =
        capitalise(colourName(w)) +
        " light passes through the front of the eye. The dark pigment layer behind the retina absorbs it and turns it into heat.";
    else if (w < 930)
      t =
        "Near-infrared is invisible, so there is no bright flash and blinking may not protect the eye. It still reaches the retina.";
    else if (w <= 1010)
      t =
        "Near-infrared is invisible. Water in the eye absorbs " +
        num(e.aV * 100) +
        "% of it here, so less reaches the retina.";
    else
      t =
        "Near-infrared is invisible. It reaches the retina and the layer beneath it; water in the eye absorbs " +
        num(e.aV * 100) +
        "%.";
    return t;
  }

  function explain(p, r, on) {
    var e = r.eye,
      items = [];
    items.push({
      keys: ["power", "d0", "div", "dist", "pupil"],
      h: "Into the eye",
      x:
        "The beam is " +
        lenStr(r.d) +
        " wide at the eye. The " +
        num(p.pupil) +
        " mm pupil" +
        (state.pupilAuto ? " (set by the light)" : "") +
        " lets in " +
        num(r.fr * 100) +
        "% of it (" +
        S(r.Pp, "W") +
        ").",
    });
    items.push({
      keys: ["dist", "pupil", "wave"],
      h: "Focus",
      x:
        "The cornea and lens focus it to a spot about " +
        num(e.spot * 1e6) +
        " µm wide" +
        (e.blur > 1e-5
          ? " (blurred, because the source is too close to focus sharply)"
          : "") +
        ". Light on the retina is " +
        num(e.gain) +
        "× stronger than at the cornea.",
    });
    items.push({
      keys: ["wave"],
      h: "Wavelength " + num(p.wave) + " nm",
      x: waveText(p.wave, e),
    });
    var res;
    if (!on)
      res =
        "The laser is off. Move a slider or press Replay to see the exposure.";
    else if (e.level === "low")
      res =
        "Injury index " +
        num(e.DI) +
        ". Well below the model’s threshold, so no injury is drawn.";
    else if (e.level === "risk")
      res =
        "Injury index " +
        num(e.DI) +
        ". Close to the model’s threshold. The tissue at risk is highlighted.";
    else if (e.level === "burn")
      res =
        "Injury index " +
        num(e.DI) +
        ". Over the threshold. " +
        S(e.Qabs, "J") +
        " is absorbed in a tiny spot over " +
        num(p.time) +
        " s, so a burn is drawn.";
    else
      res =
        "Injury index " +
        num(e.DI) +
        ". Far over the threshold. A large damaged area is drawn.";
    items.push({ keys: ["time", "power"], h: "Result", x: res });
    return items;
  }

  function renderExplain(p, r, on) {
    $("exList").innerHTML = explain(p, r, on)
      .map(function (it) {
        var hl =
          state.last && it.keys.indexOf(state.last) >= 0 ? ' class="hl"' : "";
        return "<li" + hl + "><b>" + it.h + "</b><p>" + it.x + "</p></li>";
      })
      .join("");
  }

  /* ------------------------------------------------------------------ */
  /* Animation loop                                                      */
  /* ------------------------------------------------------------------ */
  var ANIM_S = 2.2,
    BEAM_END = 0.65,
    raf = 0,
    lastTs = 0,
    cur = null;

  function paint() {
    if (!cur) return;
    var p = state.p,
      r = cur,
      on = state.view === "exposed";
    var A = state.anim,
      sev = state.disp.sev === null ? state.target.sev : state.disp.sev;
    var reach = ease(A.t / BEAM_END);
    var k = A.run || A.t < 1 ? ease((A.t - BEAM_END) / (1 - BEAM_END)) : 1;
    var running = on && A.t < 1;

    if (running) {
      var xr = 156 + (FOVEA_PX - 156) * reach;
      $("revealRect").setAttribute("width", (xr + 4).toFixed(1));
      show("head", reach < 1);
      set("head", { cx: xr.toFixed(1), cy: CY });
    } else {
      $("revealRect").setAttribute("width", 1100);
      show("head", false);
    }
    paintLesion(sev, on ? k : 0, r.eye.spot);
    if (running || state.disp.sev !== null) renderLive(r, p);
  }

  function frame(ts) {
    raf = 0;
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    var busy = false,
      A = state.anim;
    if (A.run) {
      A.t += dt / ANIM_S;
      if (A.t >= 1) {
        A.t = 1;
        A.run = false;
      } else busy = true;
    }
    var tgt = state.target.sev;
    if (state.disp.sev === null) state.disp.sev = tgt;
    var diff = tgt - state.disp.sev;
    if (Math.abs(diff) > 0.004) {
      state.disp.sev += diff * Math.min(1, dt * 9);
      busy = true;
    } else state.disp.sev = tgt;
    var pt = state.p.pupil,
      dp = pt - state.dispPupil;
    if (Math.abs(dp) > 0.01) {
      state.dispPupil += dp * Math.min(1, dt * 7);
      busy = true;
      drawScene(state.p, cur, state.mode, state.view === "exposed");
    } else if (state.dispPupil !== pt) {
      state.dispPupil = pt;
      drawScene(state.p, cur, state.mode, state.view === "exposed");
    }
    paint();
    if (busy) raf = requestAnimationFrame(frame);
    else renderLive(cur, state.p);
  }
  function kick() {
    if (reduced || !window.requestAnimationFrame) {
      state.anim.run = false;
      state.anim.t = 1;
      state.disp.sev = state.target.sev;
      paint();
      renderLive(cur, state.p);
      return;
    }
    if (!raf) {
      lastTs = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Main update                                                         */
  /* ------------------------------------------------------------------ */
  function update() {
    var p = state.p,
      m = state.mode;
    if (state.pupilAuto) p.pupil = pupilFromLum(p.amb);
    if (
      state.dispPupil === null ||
      reduced ||
      !state.pupilAuto ||
      !window.requestAnimationFrame
    )
      state.dispPupil = p.pupil;
    var r = LP.calc(p, m);
    cur = r;
    var on = state.view === "exposed";
    state.target.sev = clamp(r.eye.sev, -3, 2.6);
    state.target.level = r.eye.level;
    if (!on) state.disp.sev = null;
    else if (state.disp.sev === null && !state.anim.run)
      state.disp.sev = state.target.sev;

    syncControls(p);
    drawScene(p, r, m, on);
    renderStatus(on ? r.eye.level : "healthy");
    renderMeter(r.eye, on);
    renderReach(p, r);
    renderCards(p, r);
    renderExplain(p, r, on);
    renderPin();
    paint();
    renderLive(r, p);
    kick();
  }

  buildControls();
  renderHealthy();
  state.anim.t = reduced ? 1 : 0;
  state.anim.run = !reduced;
  update();
})();
