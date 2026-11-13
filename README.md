# LaserSafe Lab — See What a Laser Can Do Inside the Eye

An interactive, offline educational simulation. Change a laser's settings and watch the
beam enter an animated cross-section of the eye, focus on the retina and, when the
exposure is high enough, produce a visible (illustrative) injury.

> Educational model only. It is **not** a laser safety calculator, it does not predict real
> injury and it is not medical advice. Do not use it to decide whether a real laser is safe.

## Run it

1. Unzip the folder.
2. Double-click `index.html` (Chrome, Edge, Firefox or Safari).

No server, installation, build step, internet connection, account or API key is needed.

Optional local server:

```
cd lasersafe-lab
python3 -m http.server 8000     # then open http://localhost:8000
```

## What is in the folder

```
index.html          page: both tabs and the SVG eye
css/style.css       styles (dark theme)
js/physics.js       calculations (pure functions, SI units)
js/app.js           laser simulator: controls, animation, injury drawing, text
js/compare.js       Laser vs everyday light: scenes, spectra, retinal images, tabs
assets/favicon.svg  icon
PROJECT_NOTES.md    physics and simulation assumptions
```

## Two tabs

- **Laser simulator** — the original simulator (all controls, injury drawing, compare pin).
- **Laser vs everyday light** — a new, separate comparison. Nothing in the simulator changed.

## Laser vs everyday light

Compare a **laser**, a **white LED bulb**, a **yellow sodium lamp** and **sunlight**, one at
a time or two side by side.

- **Eye scene:** an animated cross-section for each source. Light travels from the source,
  enters the cornea and pupil, bends through the lens and lands on the retina. Rays that miss
  the pupil stop at the iris. Ordinary light is focused onto the retina too.
- **Follow light from** (All / Top / Middle / Bottom): lights up one point of a lamp to show it
  lands on its own spot of the retina. Together the spots form an upside-down *image* of the lamp.
- **Pupil** and **Lamp distance** sliders: a closer lamp makes a bigger retinal image, not a
  brighter one per area. **Laser wavelength** chips: 405, 532, 635 and 1064 nm.
- **Mini panels:** spectrum (outline = light arriving, fill = light that reaches the retina),
  retinal image drawn to scale, how the light spreads on a wall, and a wave picture showing
  coherence.
- **Comparison table** of typical properties, and a note that ordinary light is not
  automatically harmless. Never look directly at the Sun.

This tab compares *geometry and spectrum*. It does not set a power for each source, rank
sources as safe or unsafe, or predict injury.

## Using the simulator tab

- **Try a laser** loads a preset. Every slider can then be changed.
- **Pupil: Auto (light) or Manual.** In Auto, the **Surrounding light** slider sets the
  pupil (dark room: large, sunlight: small) and the iris opens or closes smoothly. In
  Manual, you set the pupil diameter yourself. The pupil changes how much of the beam gets in.
- **Sliders** — power, wavelength, beam diameter, divergence, distance, exposure time,
  surrounding light and pupil diameter. The beam, iris opening, rays, injury and numbers all update live.
- **Before / After** switches between the healthy eye and the exposed eye.
- **Replay** runs the beam and injury animation again.
- **Reset eye** returns to the healthy-eye illustration (laser off).
- **Pin this setup** keeps the current result so you can change a slider and compare.
  **Small vs large pupil** does this for 2 mm against 7 mm in one click.
- **Retina close-up** shows the back of the eye, healthy next to the current result.

### Injury levels

| Level | What you see |
|---|---|
| Healthy eye | Laser off, normal retina |
| Low exposure | Beam enters, no visible injury |
| Potentially harmful | Amber highlighted tissue and a warning |
| Simulated thermal injury | Dark burn spot with pale swelling around it |
| Severe illustrative injury | Large damaged area with bleeding |

The injury drawn on the eye is **enlarged** so it can be seen. The real focus spot size is
shown in the numbers.

See `PROJECT_NOTES.md` for the equations and the limits of the model.
