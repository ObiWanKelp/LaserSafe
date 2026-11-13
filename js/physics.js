/* LaserSafe Lab — physics core (pure functions, SI units internally).
   Educational model. Part 1: light INCIDENT on the eye.
   Part 2: a simplified, illustrative model of light reaching and heating the retina.
   Not a safety calculator and not a prediction of real injury. */
(function (root) {
  'use strict';

  // Full sunlight at the ground is roughly 1000 W/m^2 = 0.1 W/cm^2 (all wavelengths).
  var SUN_W_CM2 = 0.1;

  /* ---------------- Part 1: beam and pupil ---------------- */

  // Beam diameter at distance z (metres in, metres out).
  // Gaussian: d(z) = sqrt(d0^2 + (theta*z)^2)   (1/e^2 diameter, theta = full-angle divergence)
  // Top-hat : d(z) = d0 + theta*z               (geometric spreading)
  function diameter(p, mode, z) {
    var d0 = p.d0 / 1e3, th = p.div / 1e3;
    return mode === 'gaussian' ? Math.hypot(d0, th * z) : d0 + th * z;
  }

  // Fraction of beam power passing through a centred circular aperture of diameter Dp (m).
  // Top-hat: min(1,(Dp/d)^2).  Gaussian: 1 - exp(-2 a^2 / w^2), a = Dp/2, w = d/2.
  function capture(mode, d, Dp) {
    var a = Dp / 2, w = d / 2;
    return mode === 'gaussian' ? 1 - Math.exp(-2 * a * a / (w * w)) : Math.min(1, a * a / (w * w));
  }

  /* ---------------- Part 2: inside the eye (illustrative) ---------------- */

  var F_EYE = 0.017;        // effective focal length of the relaxed eye, m
  var MIN_SPOT = 25e-6;     // smallest practical retinal image, m (about 1.5 mrad x 17 mm)
  var NEAR_POINT_D = 4;     // eye can focus down to 0.25 m = 4 dioptres
  var T_REF_S = 0.25;       // reference exposure time (blink reflex), s
  var P_REF_W = 10e-3;      // illustrative: 10 mW through the pupil at 532 nm, 0.25 s, 25 um spot = threshold

  // Simplified spectral tables: [wavelength nm, fraction]. Illustrative round numbers.
  var LENS  = [[400, 0.50], [450, 0.22], [500, 0.08], [550, 0.04], [900, 0.06], [1100, 0.12]];   // absorbed by the lens
  var WATER = [[400, 0.01], [900, 0.02], [940, 0.06], [980, 0.30], [1020, 0.10], [1064, 0.14], [1100, 0.20]]; // absorbed by water in the eye
  var LOSS  = [[400, 0.15], [700, 0.12], [1100, 0.20]];                                           // reflection + scatter
  var RPE   = [[400, 0.65], [500, 0.60], [550, 0.57], [600, 0.50], [700, 0.40], [800, 0.35], [900, 0.30], [1064, 0.22], [1100, 0.20]]; // absorbed at the pigment layer

  function interp(tbl, x) {
    if (x <= tbl[0][0]) return tbl[0][1];
    for (var i = 1; i < tbl.length; i++) {
      if (x <= tbl[i][0]) {
        var a = tbl[i - 1], b = tbl[i];
        return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
    }
    return tbl[tbl.length - 1][1];
  }

  // Share absorbed on the way in, share reaching the retina (T) and share of that absorbed at the retina (A).
  function ocular(w) {
    var aL = interp(LENS, w), aV = interp(WATER, w), s = interp(LOSS, w);
    return { aL: aL, aV: aV, s: s, T: (1 - aL) * (1 - aV) * (1 - s), A: interp(RPE, w) };
  }
  var REF = ocular(532);
  var P_ABS_REF = P_REF_W * REF.T * REF.A;   // absorbed power at the reference threshold

  // Illustrative injury levels from the injury index DI (1 = illustrative threshold).
  function level(DI) {
    if (!(DI > 0)) return 'low';
    var s = Math.log10(DI);
    return s < -1 ? 'low' : s < 0 ? 'risk' : s < 1 ? 'burn' : 'severe';
  }

  // r: result of the beam calculation (needs d, Pp, t)
  function eyeModel(p, r) {
    var oc = ocular(p.wave);
    var Din = Math.min(r.d, p.pupil / 1e3);                 // width of the beam that enters
    var lam = p.wave * 1e-9;
    var diff = 2.44 * lam * F_EYE / Din;                    // Airy disc diameter on the retina
    var apex = p.div > 0 ? (p.d0 / 1e3) / (p.div / 1e3) : 1e9;   // virtual source behind the laser, m
    var vergence = 1 / (p.dist + apex);                     // dioptres at the eye
    var defocus = Math.max(0, vergence - NEAR_POINT_D);     // dioptres the eye cannot fix
    var blur = Din * F_EYE * defocus;                       // blur circle on the retina
    var spot = Math.sqrt(diff * diff + blur * blur + MIN_SPOT * MIN_SPOT);

    var Pret = r.Pp * oc.T;                                 // power reaching the retina
    var Pabs = Pret * oc.A;                                 // power absorbed (becomes heat)
    var Er = Pret / (Math.PI * spot * spot / 4);            // retinal irradiance, W/m^2
    var x = spot / MIN_SPOT;
    var sizeF = x <= 24 ? x : 24 * Math.pow(x / 24, 2);     // bigger spot needs more power
    var timeF = Math.pow(r.t / T_REF_S, -0.25);             // longer exposure needs less power
    var Pth = P_ABS_REF * timeF * sizeF;                    // illustrative threshold for absorbed power
    var DI = Pabs / Pth;
    return {
      aL: oc.aL, aV: oc.aV, T: oc.T, A: oc.A,
      Din: Din, diff: diff, blur: blur, spot: spot, defocus: defocus,
      Pret: Pret, Pabs: Pabs, Er: Er, Hr: Er * r.t, Qabs: Pabs * r.t,
      gain: r.Ep > 0 ? Er / r.Ep : 0,
      Pth: Pth, DI: DI, sev: DI > 0 ? Math.log10(DI) : -9, level: level(DI)
    };
  }

  // p: {power mW, wave nm, d0 mm, div mrad, dist m, time s, pupil mm}
  function calc(p, mode) {
    var P = p.power / 1e3, t = p.time, Dp = p.pupil / 1e3;
    var d = diameter(p, mode, p.dist);
    var A = Math.PI * d * d / 4;
    var E = P / A;                       // average irradiance, W/m^2
    var a = Dp / 2;
    var fr = capture(mode, d, Dp);
    var Pp = fr * P;
    var r = {
      P: P, t: t, d: d, A: A,
      E: E,
      Epk: mode === 'gaussian' ? 2 * E : E,   // ideal TEM00 centre value = 2 x average (1/e^2 circle)
      H: E * t,                                // radiant exposure, J/m^2
      Q: P * t,                                // energy in whole beam, J
      fr: fr, Pp: Pp, Qp: Pp * t,
      Ep: Pp / (Math.PI * a * a),              // power through pupil / pupil area, W/m^2
      Dp: Dp
    };
    r.eye = eyeModel(p, r);
    return r;
  }

  var api = {
    SUN_W_CM2: SUN_W_CM2, F_EYE: F_EYE, MIN_SPOT: MIN_SPOT,
    diameter: diameter, capture: capture, ocular: ocular, level: level, calc: calc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaserPhysics = api;
})(typeof window !== 'undefined' ? window : this);
