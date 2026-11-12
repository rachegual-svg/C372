# Task: Add an interactive 3D Shiba Inu to the home page

Add an animated 3D dog to the home page of my PetCareApp (Express 5 + EJS, static files served from `public/`). The dog sits and loops an idle animation. Each time a visitor taps or clicks the dog, it does the next trick in order. This is front-end only: **no backend, database or route changes.**

Before changing anything, read `views/index.ejs`, `views/partials/navbar.ejs` and `public/css/style.css`. Match the existing look (colours, fonts, spacing, Bootstrap usage).

## The model

- File: `public/models/dog.glb`. I'll copy it there myself. If the `public/models/` folder doesn't exist, create it.
- I checked the file. It has exactly these 5 animation clips (the names include `0|`):

| Clip name | Length | Use |
|---|---|---|
| `0\|sitting_0` | 12 s | **Idle loop** |
| `0\|play_dead_0` | 8.5 s | Trick 1 |
| `0\|rollover_0` | 8 s | Trick 2 |
| `0\|shake_0` | 6.5 s | Trick 3 |
| `0\|standing_0` | 12 s | Not used |

- It's one skinned mesh exported in big units (about 83 tall and 115 long), and the body runs along its depth (Z) axis. **Scale and centre it in code from its bounding box. Don't hard-code a size.**
- The file is about 15 MB (two large PNG textures), so it needs a loading state (see below).

## Behaviour

1. On page load, show the dog looping `0|sitting_0` forever.
2. **Tricks in order, one per tap:** first tap plays `play_dead`, second `rollover`, third `shake`, fourth back to `play_dead`, and so on.
3. Each trick plays **once** (`THREE.LoopOnce`, `clampWhenFinished = true`), crossfading in from sitting (about 0.3 s).
4. When a trick finishes, hold the last pose for a set time, then crossfade back to sitting (about 0.5 s). Hold times: play_dead **1500 ms**, rollover **0**, shake **0**. Keep these in one config array at the top of the script, so I can reorder tricks or change hold times easily:
   ```js
   const IDLE_NAME = '0|sitting_0';
   const TRICKS = [
     { name: '0|play_dead_0', hold: 1500, label: 'Play dead!' },
     { name: '0|rollover_0',  hold: 0,    label: 'Roll over!' },
     { name: '0|shake_0',     hold: 0,    label: 'Shake!' },
   ];
   ```
5. **Only taps on the dog count.** Use a raycaster against the model, so taps on empty space do nothing. Use `pointerdown`, which covers mouse and touch.
6. **Ignore taps while a trick is playing** (including the hold and the fade back), so tapping fast doesn't skip tricks or break the animation.
7. If a clip name isn't found, skip that trick quietly and log a warning listing the clip names that *are* in the file. Never crash.
8. Show the cursor as a pointer only while hovering over the dog.

## Text under the dog

- Below the model, show a small caption: **"Tap the dog! 🐾"**.
- When a trick starts, change it to that trick's `label` (e.g. "Play dead!"). When the dog is back to sitting, change it to "Good boy! Tap again 🐾".
- Use `aria-live="polite"` on the caption so screen readers announce it.

## Technical requirements

- Use **Three.js r160** from a CDN with an import map (`three` and `three/addons/` from unpkg, pinned to `0.160.0`), loaded with `GLTFLoader`. No npm packages and no build step.
- Put the code in a new file, `public/js/dogScene.js` (`type="module"`), not inline. `index.ejs` gets only the container, the caption, the import map and the script tag.
- Container: `<div id="dog-stage">` with a responsive height (about 420 px on desktop, about 300 px on phones, via CSS in `style.css`). Use a transparent renderer background (`alpha: true`) so it blends with the page.
- Lighting: a hemisphere light plus a directional light, with output colour space set to sRGB so the textures don't look washed out. Point the camera at the dog from a slight 3/4 front angle (rotate the model or move the camera), not straight side-on.
- Cap pixel ratio at 2. Resize correctly when the window or container size changes (`ResizeObserver` on the container).
- **Loading state:** show "Fetching the dog… 🐕" with a progress percentage from the loader's `onProgress` until the model is ready. If loading fails, show a friendly message such as "The dog is napping right now." instead of a blank box, and log the error.
- **Performance:** pause rendering when the dog isn't on screen (`IntersectionObserver`) or when the tab is hidden (`visibilitychange`). Reset the clock when it resumes, so the animation doesn't jump.
- **Accessibility:** respect `prefers-reduced-motion`. If it's set, don't auto-play the idle loop (show a still pose), but still let taps play tricks. Make the stage keyboard-focusable (`tabindex="0"`, an `aria-label` like "Animated dog, press Enter to see a trick"), and let Enter or Space trigger the next trick too.
- Put the dog on the home page in a sensible spot (e.g. the hero section next to or replacing the current hero image). Explain where you placed it and why. Don't remove other existing content.

## Don't

- Don't change routes, controllers, models or the database.
- Don't add OrbitControls or let users drag-rotate (it would fight with tapping).
- Don't commit or modify the `.glb` file.

## When done, give me

1. A list of new and changed files.
2. Where exactly to put `dog.glb`.
3. A test checklist: loop on load, tricks cycle in order through 4+ taps, fast taps are ignored mid-trick, taps beside the dog do nothing, keyboard Enter works, phone-size layout, reduced-motion behaviour, the loading text appears (throttle the network in devtools), and the friendly error appears if the file is renamed.
4. A short note on shrinking the 15 MB file before going live (e.g. gltf.report or `gltf-transform` with WebP textures and Draco/meshopt), and what code change is needed if Draco is used (`DRACOLoader` setup).