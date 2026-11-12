// Interactive 3D Shiba Inu for the home page.
// The dog sits on an idle loop; each tap (or Enter/Space) plays the next trick in order.
// Front-end only: Three.js r160 from the import map in views/index.ejs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// Config: reorder tricks or change hold times here
// ---------------------------------------------------------------------------
const MODEL_URL = '/models/dog.glb';

const IDLE_NAME = '0|sitting_0';
const TRICKS = [
  { name: '0|play_dead_0', hold: 1500, label: 'Play dead!' },
  { name: '0|rollover_0',  hold: 0,    label: 'Roll over!' },
  { name: '0|shake_0',     hold: 0,    label: 'Shake!' },
];

const FADE_IN_SECONDS = 0.3;   // sitting -> trick
const FADE_OUT_SECONDS = 0.5;  // trick -> sitting

// ----- Size and framing (tweak these) -----
// MODEL_SIZE: the model is scaled so its largest side is this many world units.
// The camera fits itself to the dog, so this does NOT change how big the dog
// looks on the page. Use FRAME_MARGIN for that.
const MODEL_SIZE = 2;
// FRAME_MARGIN: room around the SITTING dog (its real outline over the whole
// idle loop). 1.0 = it just touches the stage edges; 1.1 = 10% spare room.
// Smaller = bigger dog.
const FRAME_MARGIN = 1.08;
// TRICK_MARGIN: room around the dog during a trick. Tricks take up to ~2-2.6x
// the space of sitting (play dead lies on its side), so when a trick starts the
// camera eases back just far enough to fit that trick (measured at load), and
// eases in again once the dog is sitting.
const TRICK_MARGIN = 1.05;
// CAMERA_EASE_SECONDS: how quickly the camera glides back IN once the dog is
// sitting again (bigger = slower, smoother). Pulling back OUT for a trick always
// takes FADE_IN_SECONDS, so the camera keeps up with the dog (roll over starts
// lying down straight away).
const CAMERA_EASE_SECONDS = 0.35;
// The body runs along Z. Turning it by this angle gives a 3/4 front view.
// If you ever see the dog's back instead of its face, add 180 to this value.
const MODEL_YAW_DEGREES = 35;
// Camera lens angle (degrees) and how far above the dog it looks from (0 = level).
const CAMERA_FOV = 35;
const CAMERA_ELEVATION = 0.32;
// How the clips are sampled at load to measure the outlines. Tricks have quick
// leg kicks between frames, so they need many poses; fewer vertices per pose is
// fine. Measured on this model: 96 poses comes within ~3.5% of the true extremes,
// which TRICK_MARGIN (1.05) covers. Fewer poses = faster load but may crop a kick.
const IDLE_SAMPLES = 8;          // poses taken across the sitting loop
const IDLE_VERTEX_STEP = 4;      // use every Nth vertex for sitting (1 = all)
const TRICK_SAMPLES = 96;        // poses taken across each trick
const TRICK_VERTEX_STEP = 8;     // use every Nth vertex for tricks

const CAPTION_READY = 'Tap the dog! 🐾';
const CAPTION_DONE = 'Good boy! Tap again 🐾';
const MSG_LOADING = 'Fetching the dog… 🐕';
const MSG_ERROR = 'The dog is napping right now.';

// ---------------------------------------------------------------------------

function initDogScene() {
  const stage = document.getElementById('dog-stage');
  const statusEl = document.getElementById('dog-status');
  const captionEl = document.getElementById('dog-caption');
  if (!stage || !statusEl || !captionEl) return;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;

  // Caption stays empty until the dog can actually be tapped
  captionEl.textContent = '';
  showStatus(MSG_LOADING);

  function showStatus(text) {
    statusEl.textContent = text;
    statusEl.hidden = false;
  }

  function hideStatus() {
    statusEl.hidden = true;
  }

  function showError(err) {
    console.error('[dogScene] Could not show the 3D dog:', err);
    showStatus(MSG_ERROR);
    captionEl.textContent = '';
    stage.setAttribute('aria-label', MSG_ERROR);
    stage.setAttribute('tabindex', '-1');
    stage.removeAttribute('role');
  }

  // ----- Renderer, scene, camera, lights -----
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (err) {
    // No WebGL (old browser, disabled GPU): friendly message instead of a blank box
    showError(err);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);              // transparent: blends with the page
  renderer.outputColorSpace = THREE.SRGBColorSpace; // textures not washed out
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.05, 100);

  const hemiLight = new THREE.HemisphereLight(0xfff7e8, 0x8a6a50, 2.2);
  scene.add(hemiLight);

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(2, 4, 3);
  scene.add(sun);

  // pivot (turned for the 3/4 view) -> fitter (scale + centring) -> gltf.scene
  // (the yaw is applied after measuring, so the bounding box is in the model's own axes)
  const pivot = new THREE.Group();
  const fitter = new THREE.Group();
  pivot.add(fitter);
  scene.add(pivot);

  // ----- Animation state -----
  const clock = new THREE.Clock();
  let mixer = null;
  let idleAction = null;
  let tricks = [];          // TRICKS that exist in the file: { name, hold, label, action, outline, frame }
  let nextTrickIndex = 0;
  let currentTrick = null;
  let phase = 'loading';    // 'loading' | 'idle' | 'trick' | 'hold' | 'fading'
  let holdTimer = null;
  let ready = false;

  let meshes = [];          // for raycasting and measuring

  // ----- Hit testing (raycast against the model itself) -----
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let boundsFrame = -1;
  let frameCount = 0;

  // Skinned meshes cache a bounding sphere from one pose. The raycaster skips
  // the mesh if a tap misses that sphere, so refresh it (at most once per frame)
  // to match the current pose (e.g. lying down after play dead).
  function refreshSkinnedBounds() {
    if (boundsFrame === frameCount) return;
    boundsFrame = frameCount;
    for (const mesh of meshes) {
      if (mesh.isSkinnedMesh) mesh.computeBoundingSphere();
    }
  }

  function isOverDog(clientX, clientY) {
    if (!ready || !meshes.length) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    refreshSkinnedBounds();
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.intersectObjects(meshes, false).length > 0;
  }

  // ----- Measuring outlines -----
  // Camera axes for the fixed viewing direction (from the dog towards the camera).
  // Outline points are stored in these axes: { x: right, y: up, z: towards camera }.
  const viewBack = new THREE.Vector3(0, CAMERA_ELEVATION, 1).normalize();
  const viewRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), viewBack).normalize();
  const viewUp = new THREE.Vector3().crossVectors(viewBack, viewRight);

  let sittingOutline = [];

  // Records the dog's current posed (skinned) vertices into `out`
  function addCurrentPose(out, vertexStep) {
    scene.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (const mesh of meshes) {
      const count = mesh.geometry.attributes.position.count;
      for (let i = 0; i < count; i += vertexStep) {
        mesh.getVertexPosition(i, v);   // includes the skinned pose
        v.applyMatrix4(mesh.matrixWorld);
        out.push({ x: v.dot(viewRight), y: v.dot(viewUp), z: v.dot(viewBack) });
      }
    }
  }

  // Samples a clip across its length (or the current pose if there is no action)
  function measureClip(action, samples, vertexStep) {
    const out = [];
    if (!action) {
      addCurrentPose(out, vertexStep);
      return out;
    }
    const duration = action.getClip().duration;
    mixer.stopAllAction();
    action.reset();
    action.play();
    for (let s = 0; s < samples; s++) {
      // Spread samples from the first to the last frame
      action.time = Math.min(duration - 1e-4, (duration * s) / Math.max(samples - 1, 1));
      mixer.update(0);
      addCurrentPose(out, vertexStep);
    }
    action.stop();
    return out;
  }

  function measureOutlines() {
    sittingOutline = measureClip(idleAction, IDLE_SAMPLES, IDLE_VERTEX_STEP);
    for (const trick of tricks) {
      // Include the sitting outline, so the trick view also covers the
      // fade in/out between sitting and the trick
      trick.outline = sittingOutline.concat(measureClip(trick.action, TRICK_SAMPLES, TRICK_VERTEX_STEP));
    }

    // Back to the start of the idle loop
    mixer.stopAllAction();
    if (idleAction) {
      idleAction.reset();
      idleAction.play();
      idleAction.paused = reducedMotion;
    }
    mixer.update(0);
  }

  // ----- Camera framing -----
  // Exact perspective fit: the closest camera distance at which every outline
  // point is inside the view (with `margin` spare room), panned so the outline
  // is centred on screen. Returns { tx, ty, tz, distance } in view axes.
  function fitOutline(points, margin, aspect) {
    const fill = 1 / Math.max(margin, 0.01);
    const tanV = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV) / 2) * fill;
    const tanH = tanV * aspect;

    let cx = 0, cy = 0, cz = 0;
    for (const p of points) { cx += p.x; cy += p.y; cz += p.z; }
    cx /= points.length; cy /= points.length; cz /= points.length;

    let offsetX = 0;
    let offsetY = 0;

    // Closest distance at which every point fits, for the current pan
    function distanceNeeded() {
      let d = 0;
      for (const p of points) {
        const z = p.z - cz;
        const needX = z + Math.abs(p.x - cx - offsetX) / tanH;
        const needY = z + Math.abs(p.y - cy - offsetY) / tanV;
        if (needX > d) d = needX;
        if (needY > d) d = needY;
      }
      return d;
    }

    let distance = 0;
    // A few rounds settle the pan (centring) and distance together
    for (let round = 0; round < 6; round++) {
      distance = distanceNeeded();

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of points) {
        const depth = distance - (p.z - cz);
        const sx = (p.x - cx - offsetX) / (depth * tanH);
        const sy = (p.y - cy - offsetY) / (depth * tanV);
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
      offsetX += ((minX + maxX) / 2) * distance * tanH;
      offsetY += ((minY + maxY) / 2) * distance * tanV;
    }
    // Final distance for the final pan, so every point is guaranteed to fit
    distance = distanceNeeded();

    return { tx: cx + offsetX, ty: cy + offsetY, tz: cz, distance };
  }

  let sittingFrame = null;
  // The camera's current view (eases towards the goal frame every tick)
  const view = { tx: 0, ty: 1, tz: 0, distance: 6 };

  function computeFrames() {
    const aspect = (stage.clientWidth || 1) / (stage.clientHeight || 1);
    camera.aspect = aspect;
    if (!sittingOutline.length) return;
    sittingFrame = fitOutline(sittingOutline, FRAME_MARGIN, aspect);
    for (const trick of tricks) {
      trick.frame = fitOutline(trick.outline, TRICK_MARGIN, aspect);
    }
  }

  function goalFrame() {
    // Stay pulled back until the dog is fully sitting again
    if (currentTrick && currentTrick.frame && phase !== 'idle') return currentTrick.frame;
    return sittingFrame;
  }

  function applyView() {
    const target = new THREE.Vector3()
      .addScaledVector(viewRight, view.tx)
      .addScaledVector(viewUp, view.ty)
      .addScaledVector(viewBack, view.tz);
    camera.position.copy(target).addScaledVector(viewBack, view.distance);
    camera.near = view.distance / 50;
    camera.far = view.distance * 10;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function snapView() {
    const goal = goalFrame();
    if (goal) Object.assign(view, goal);
    applyView();
  }

  // Pull-back for a trick: a timed move from `from` to the trick view that
  // finishes with the fade-in. Starts fast (ease-out), so the camera is always a
  // little ahead of the dog stretching out.
  let pullBack = null;      // { from: {tx,ty,tz,distance}, elapsed }

  function easeView(delta) {
    const goal = goalFrame();
    if (!goal) return;

    // Reduced motion: cut straight to the new view instead of gliding
    if (reducedMotion) {
      pullBack = null;
      Object.assign(view, goal);
      applyView();
      return;
    }

    if (pullBack) {
      pullBack.elapsed += delta;
      const u = Math.min(1, pullBack.elapsed / FADE_IN_SECONDS);
      const k = 1 - Math.pow(1 - u, 3);
      for (const key of ['tx', 'ty', 'tz', 'distance']) {
        view[key] = pullBack.from[key] + (goal[key] - pullBack.from[key]) * k;
      }
      if (u >= 1) pullBack = null;
    } else {
      // Gentle glide (used to zoom back in to the sitting view)
      const t = 1 - Math.exp(-delta / CAMERA_EASE_SECONDS);
      view.tx += (goal.tx - view.tx) * t;
      view.ty += (goal.ty - view.ty) * t;
      view.tz += (goal.tz - view.tz) * t;
      view.distance += (goal.distance - view.distance) * t;
    }
    applyView();
  }

  // ----- Tricks -----
  function playNextTrick() {
    // Ignore taps while loading or while a trick, hold or fade-back is running
    if (!ready || phase !== 'idle' || tricks.length === 0) return;

    const trick = tricks[nextTrickIndex];
    nextTrickIndex = (nextTrickIndex + 1) % tricks.length;
    currentTrick = trick;
    phase = 'trick';

    const action = trick.action;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    if (idleAction) {
      idleAction.crossFadeTo(action, FADE_IN_SECONDS, false);
    } else {
      action.fadeIn(FADE_IN_SECONDS);
    }

    // Start pulling the camera back in step with the fade-in
    pullBack = { from: { ...view }, elapsed: 0 };

    captionEl.textContent = trick.label;
    updateRunning();
  }

  function onClipFinished(event) {
    if (!currentTrick || event.action !== currentTrick.action || phase !== 'trick') return;
    phase = 'hold';
    // Hold the last pose, then fade back to sitting
    holdTimer = setTimeout(returnToIdle, currentTrick.hold);
  }

  function returnToIdle() {
    holdTimer = null;
    if (!currentTrick) return;
    phase = 'fading';

    if (idleAction) {
      idleAction.reset();                 // re-enables it (it was faded out)
      idleAction.paused = reducedMotion;  // reduced motion: still sitting pose
      idleAction.play();
      currentTrick.action.crossFadeTo(idleAction, FADE_OUT_SECONDS, false);
    } else {
      currentTrick.action.fadeOut(FADE_OUT_SECONDS);
    }
    // Finished in checkFadeComplete(), driven by the render loop, so it stays in
    // step with the animation even if rendering is paused mid-fade.
  }

  function checkFadeComplete() {
    if (phase !== 'fading' || !currentTrick) return;
    // getEffectiveWeight() is 0 once the trick has fully faded out
    if (currentTrick.action.getEffectiveWeight() > 0) return;

    currentTrick.action.stop();
    currentTrick = null;
    phase = 'idle';           // camera now eases back in to the sitting view
    captionEl.textContent = CAPTION_DONE;
  }

  // ----- Resize -----
  function resize() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    computeFrames();
    // When nothing is animating, jump straight to the right view and redraw
    if (!rafId) {
      snapView();
      if (ready) renderer.render(scene, camera);
    }
  }

  // ----- Render loop with pausing -----
  let rafId = null;
  let stageOnScreen = true;
  let tabVisible = !document.hidden;
  let hoverPending = null;  // last pointer position to hit-test for the cursor

  function tick() {
    rafId = requestAnimationFrame(tick);
    frameCount++;

    // Cap the step so a slow frame doesn't make the animation jump
    const delta = Math.min(clock.getDelta(), 0.1);
    if (mixer) mixer.update(delta);
    checkFadeComplete();
    easeView(delta);

    if (hoverPending) {
      const over = isOverDog(hoverPending.x, hoverPending.y);
      stage.classList.toggle('is-hovering-dog', over);
      hoverPending = null;
    }

    renderer.render(scene, camera);
  }

  function updateRunning() {
    const shouldRun = ready && stageOnScreen && tabVisible;
    if (shouldRun && !rafId) {
      clock.getDelta();  // throw away the time spent paused, so nothing jumps
      rafId = requestAnimationFrame(tick);
    } else if (!shouldRun && rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  new ResizeObserver(resize).observe(stage);
  resize();

  new IntersectionObserver((entries) => {
    stageOnScreen = entries[entries.length - 1].isIntersecting;
    updateRunning();
  }).observe(stage);

  document.addEventListener('visibilitychange', () => {
    tabVisible = !document.hidden;
    updateRunning();
  });

  motionQuery.addEventListener('change', (event) => {
    reducedMotion = event.matches;
    if (idleAction && phase === 'idle') idleAction.paused = reducedMotion;
  });

  // ----- Input -----
  // pointerdown covers mouse, touch and pen. Only taps that hit the dog count.
  stage.addEventListener('pointerdown', (event) => {
    if (isOverDog(event.clientX, event.clientY)) playNextTrick();
  });

  stage.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') hoverPending = { x: event.clientX, y: event.clientY };
  });

  stage.addEventListener('pointerleave', () => {
    hoverPending = null;
    stage.classList.remove('is-hovering-dog');
  });

  stage.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();  // Space would otherwise scroll the page
      playNextTrick();
    }
  });

  // ----- Load the model -----
  function onProgress(event) {
    if (event.lengthComputable && event.total > 0) {
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      showStatus(`${MSG_LOADING} ${percent}%`);
    } else if (event.loaded) {
      showStatus(`${MSG_LOADING} ${(event.loaded / 1048576).toFixed(1)} MB`);
    }
  }

  function onLoad(gltf) {
    try {
      setupModel(gltf);
    } catch (err) {
      showError(err);
    }
  }

  function setupModel(gltf) {
    const model = gltf.scene;
    fitter.add(model);

    model.traverse((obj) => {
      if (obj.isMesh) {
        meshes.push(obj);
        // Animated skinned meshes can be wrongly culled using their rest-pose bounds
        if (obj.isSkinnedMesh) obj.frustumCulled = false;
      }
    });

    // Find the clips we need; warn (never crash) about any that are missing
    const clips = gltf.animations || [];
    const availableNames = clips.map(c => c.name);
    const missing = [];

    mixer = new THREE.AnimationMixer(model);
    mixer.addEventListener('finished', onClipFinished);

    const idleClip = THREE.AnimationClip.findByName(clips, IDLE_NAME);
    if (idleClip) {
      idleAction = mixer.clipAction(idleClip);
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.play();
      idleAction.paused = reducedMotion;  // reduced motion: show a still sitting pose
    } else {
      missing.push(IDLE_NAME);
    }

    tricks = [];
    for (const trick of TRICKS) {
      const clip = THREE.AnimationClip.findByName(clips, trick.name);
      if (clip) {
        tricks.push({ ...trick, action: mixer.clipAction(clip), outline: [], frame: null });
      } else {
        missing.push(trick.name);
      }
    }

    if (missing.length) {
      console.warn(
        `[dogScene] Animation clip(s) not found and skipped: ${missing.join(', ')}. ` +
        `Clips in ${MODEL_URL}: ${availableNames.length ? availableNames.join(', ') : '(none)'}`
      );
    }

    // Pose the dog in its idle pose, then measure the posed (skinned) shape.
    // Scale and centre it from its bounding box instead of hard-coding a size.
    mixer.update(0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const largestSide = Math.max(size.x, size.y, size.z) || 1;
    const scale = MODEL_SIZE / largestSide;

    fitter.scale.setScalar(scale);
    // Centre on X/Z and stand the paws on y = 0
    fitter.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    // Now turn the centred dog for the 3/4 front view
    pivot.rotation.y = THREE.MathUtils.degToRad(MODEL_YAW_DEGREES);

    // Measure sitting and each trick, then fit the camera views to them
    measureOutlines();
    computeFrames();
    snapView();
    hideStatus();

    ready = true;
    phase = 'idle';

    if (tricks.length) {
      captionEl.textContent = CAPTION_READY;
    } else {
      stage.setAttribute('aria-label', 'Animated dog');
    }

    renderer.render(scene, camera);
    updateRunning();
  }

  new GLTFLoader().load(MODEL_URL, onLoad, onProgress, showError);
}

initDogScene();
