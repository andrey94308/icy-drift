/* Icy Drift: Flappy-like with car drifting between ice seams */

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Assets
  const floeImg = new Image();
  floeImg.src = 'floe.png';
  let floeImgReady = false;
  floeImg.onload = () => { floeImgReady = true; };

  const carImg = new Image();
  carImg.src = 'car.png';
  let carImgReady = false;
  carImg.onload = () => { carImgReady = true; };

  const shoreImg = new Image();
  shoreImg.src = 'shore.png';
  let shoreImgReady = false;
  shoreImg.onload = () => { shoreImgReady = true; };

  // Procedural shore pattern (CSS-like look via canvas pattern)
  let shoreTile = null; // {canvas, size}
  function getShoreTile() {
    if (shoreTile) return shoreTile;
    const t = document.createElement('canvas');
    const s = 128;
    t.width = s; t.height = s;
    const c = t.getContext('2d');
    // base gradient
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#f6fbff');
    g.addColorStop(1, '#eaf6ff');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    // soft veins/cracks
    c.strokeStyle = 'rgba(115,155,190,0.15)';
    c.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const x0 = Math.random()*s, y0 = Math.random()*s;
      c.beginPath();
      c.moveTo(x0, y0);
      for (let k = 0; k < 3; k++) {
        const x = Math.random()*s, y = Math.random()*s;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    // grain
    const dots = 220;
    for (let i = 0; i < dots; i++) {
      c.fillStyle = `rgba(160,200,230,${0.05 + Math.random()*0.05})`;
      const x = Math.random()*s, y = Math.random()*s;
      c.fillRect(x, y, 1, 1);
    }
    shoreTile = { canvas: t, size: s };
    return shoreTile;
  }

  function fillShorePattern(ctx, x, y, w, h) {
    const { canvas: tile, size: s } = getShoreTile();
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern && pattern.setTransform && typeof DOMMatrix === 'function') {
      // Anchor pattern to world scroll so it moves with the world, not the screen
      const dx = - (track.scrollX % s);
      const dy = 0;
      pattern.setTransform(new DOMMatrix().translate(dx, dy));
      ctx.fillStyle = pattern;
      ctx.fillRect(x, y, w, h);
    } else {
      // Fallback: clip and translate to align pattern
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      const baseX = - (track.scrollX % s);
      const baseY = 0;
      const pattern2 = ctx.createPattern(tile, 'repeat');
      ctx.fillStyle = pattern2;
      ctx.translate(baseX, baseY);
      ctx.fillRect(x - baseX, y - baseY, w + s*2, h + s*2);
      ctx.restore();
    }
  }

  // Tunables (adjust to rebalance gameplay and visuals)
  const CONFIG = {
    // World scroll
    baseSpeedPxPerSec: 220,        // initial world scroll speed (px/s)
    speedAccelPxPerSec2: 12,       // how fast the scroll speed grows (px/s^2)

    // Steering feel
    steering: {
      baseSteerStrength: 2,        // target angle change speed at base speed (rad/s)
      steerStrengthPer100Px: 0.2,  // extra steer strength per +100 px/s scroll
      baseResponse: 6.0,           // how quickly the body turns toward target angle
      responsePer100Px: 0.35,      // extra response per +100 px/s scroll
      maxSteerStrength: 4.0,       // cap for steer strength
      maxResponse: 10.0,           // cap for response
      maxSteerAngleRad: 1.2,       // clamp for target steering angle (± radians)
    },

    // Drift/grip
    drift: {
      longFrictionPerSec: 0.5,     // longitudinal damping (along heading)
      latFrictionPerSec: 5,      // lateral damping (kills side slip)
      forwardGlide: 50,            // constant forward glide (px/s) for smoothness
      alignGripPerSec: 50,         // rate velocity aligns to nose (s^-1)
      alignGripPer100Px: 1.1,      // extra alignment per +100 px/s
      extraGripWhenSteering: 0.6,  // additional grip while steering held
      maxAlignGrip: 10.0,          // cap for alignment grip
    },

    // Sprite cropping
    floeSpritePaddingRatio: -0.01, // trim empty borders on floe/shore sprites per side

    // Shore (starting slab)
    shoreCoverRatio: 0.6,          // fraction of screen width covered by shore (0..1)
    shoreVisualFadePx: 2,          // visual water stripe width at shore edge (px)

    // Floe spawning after shore
    floe: {
      floatHeightMain: 175,        // base floe height (px)
      floeHeightJitter: 0.25,      // ±% randomization of height
      floatWidthMain: 175,         // base floe width along X (px)
      floeWidthJitter: 0.25,       // ±% randomization of width
      minIntersection: 60,         // min vertical separation between consecutive floes (px)
      intersectionJitter: 0.4      // +0..jitter of extra separation (fraction)
    }
  };

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let vw = 0, vh = 0;
  function resize() {
    vw = Math.floor(window.innerWidth);
    vh = Math.floor(window.innerHeight);
    canvas.width = Math.floor(vw * DPR);
    canvas.height = Math.floor(vh * DPR);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // Game state
  const state = {
    running: false,
    time: 0,
    meters: 0,
    best: 0,
    // Inputs
    steerDir: 0, // -1 up (left half), +1 down (right half)
  };

  const hudScore = document.getElementById('score');
  const hudMessage = document.getElementById('message');
  const hudGameOver = document.getElementById('gameover');
  const hudGoScore = document.getElementById('go-score');
  const hudGoRestart = document.getElementById('go-restart');
  const hudStartHint = document.getElementById('start-hint');

  // Track definition: two ice lines creating a narrow seam to pass through
  // We'll procedurally generate two noisy sine-like curves offset in Y, scrolling right-to-left
  const track = {
    segments: [], // array of points x,yTop,yBot
    scrollX: 0,
    speed: 220, // px/s horizontal movement to the left
    gap: 200,  // nominal gap between top and bottom ice at car X (wider lane)
    variance: 80, // amplitude variance
    freq: 0.0022, // x→time scale for band noise
    roughness: 0.25, // noise blend
    // Rectangular floes tiling along X with long lengths
    floes: [], // { startX, endX, yTopRect, yBotRect, isShore? }
    nextFloeX: 0,
    floeHeightFactor: 0.7, // target fraction of band height/gap
    floeHeightJitter: 0.25, // ± jitter (25%)
    shoreEdgeX: null,
  };

  // Car physics: drifting on ice. We'll simulate heading vs velocity angle with lateral slip.
  const car = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0, // 0 rad points to the right (forward)
    targetAngle: 0,
    width: 46,
    length: 78,
    color: '#9fe3ff',
  };

  function reset() {
    state.running = false;
    state.time = 0;
    state.meters = 0;
    state.steerDir = 0;

    track.scrollX = 0;
    track.segments = [];
    track.speed = 220; // reset to base speed
    seedTrack();

    // Place car first so we can spawn initial floe under it
    car.x = vw * 0.35;
    car.y = vh * 0.5;
    car.vx = 120;
    car.vy = 0;
    car.angle = 0;
    car.targetAngle = car.angle;

    // reset floes and pre-generate so they are visible before first click
    track.floes = [];
    track.nextFloeX = 0;
    extendFloes();

    hudMessage.style.opacity = 1;
    hideGameOver();
    if (hudStartHint) hudStartHint.setAttribute('aria-hidden','false');
    updateMeters();
  }

  function updateMeters() {
    hudScore.textContent = `${Math.floor(state.meters)} m`;
  }

  // Simple 1D value noise
  function makeNoise1D(seed) {
    let s = seed >>> 0;
    function rand() {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    }
    const gradients = new Array(2048).fill(0).map(() => rand()*2-1);
    return function noise(x) {
      const xi = Math.floor(x);
      const xf = x - xi;
      const g0 = gradients[(xi) & 2047];
      const g1 = gradients[(xi+1) & 2047];
      const u = xf*xf*(3-2*xf);
      return (1-u)*g0*xf + u*g1*(xf-1);
    }
  }
  const noise = makeNoise1D(1337);
  function makeRng(seed) {
    let s = seed >>> 0;
    return {
      next() { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; },
      float() { return (this.next()) / 4294967296; },
      range(a,b){ return a + (b-a)*this.float(); }
    }
  }
  const rng = makeRng(424242);

  function seedTrack() {
    const step = 18;
    const buffer = vw + 300;
    for (let x = 0; x <= buffer; x += step) {
      const t = x * track.freq;
      // Use noise-only band so no visible sine centerline
      const base = noise(t*2.7) * track.variance;
      const centerY = vh*0.5 + base;
      const gap = track.gap + noise(t*1.7+200)*40;
      track.segments.push({ x, yTop: centerY - gap*0.5, yBot: centerY + gap*0.5 });
    }
  }

  function extendTrack() {
    // ensure we have world points up to scrollX + vw + 300
    const step = 18;
    const needUntil = track.scrollX + vw + 300;
    const last = track.segments.length ? track.segments[track.segments.length-1].x : 0;
    for (let x = last + step; x <= needUntil; x += step) {
      const t = x * track.freq;
      const base = noise(t*2.7) * track.variance;
      const centerY = vh*0.5 + base;
      const gap = track.gap + noise(t*1.7+200)*40;
      track.segments.push({ x, yTop: centerY - gap*0.5, yBot: centerY + gap*0.5 });
    }
    // drop off-screen left (when drawn x = worldX - scrollX < -60)
    while (track.segments.length && track.segments[1] && track.segments[1].x - track.scrollX < -60) {
      track.segments.shift();
    }
    extendFloes();
  }

  function extendFloes() {
    // New spawning: constant-ish size with jitter and controlled vertical intersections
    const viewEnd = track.scrollX + vw + 300;
    if (track.floes.length === 0) {
      // 1) Shore floe: cover left ~60% of the screen (full height)
      const shoreStartX = track.scrollX - vw * 3; // extend far left to avoid seams
      const shoreEndX = track.scrollX + vw * CONFIG.shoreCoverRatio; // exact 60%
      track.floes.push({ startX: shoreStartX, endX: shoreEndX, yTopRect: 0, yBotRect: vh, isShore: true });
      track.shoreEdgeX = shoreEndX; // store world x of shore edge for rendering fade

      // 2) First discrete floe: start at mid-screen, vertically centered
      const width = jitterAround(CONFIG.floe.floatWidthMain, CONFIG.floe.floeWidthJitter);
      const height = jitterAround(CONFIG.floe.floatHeightMain, CONFIG.floe.floeHeightJitter);
      const startX = shoreEndX; // physically contiguous; we will draw a visual fade
      const endX = startX + width;
      const center = vh * 0.5;
      const yTopRect = center - height * 0.5;
      const yBotRect = center + height * 0.5;
      track.floes.push({ startX, endX, yTopRect, yBotRect });
      track.nextFloeX = endX;
    }
    while (track.nextFloeX < viewEnd) {
      const prev = track.floes[track.floes.length - 1];
      const width = jitterAround(CONFIG.floe.floatWidthMain, CONFIG.floe.floeWidthJitter);
      const height = jitterAround(CONFIG.floe.floatHeightMain, CONFIG.floe.floeHeightJitter);
      const startX = track.nextFloeX;
      const endX = startX + width;

      const jitterMul = 1 + Math.max(0, (rng.float() * CONFIG.floe.intersectionJitter));
      const minI = CONFIG.floe.minIntersection * jitterMul;

      let yTopRect, yBotRect;
      // Decide direction: up (-1) or down (+1)
      let dir = (rng.float() < 0.5) ? -1 : 1;
      if (dir < 0) {
        // up: set bottom of new = top of prev - minIntersection*
        yBotRect = prev.yTopRect + minI;
        yTopRect = yBotRect - height;
      } else {
        // down: set top of new = bottom of prev + minIntersection*
        yTopRect = prev.yBotRect - minI;
        yBotRect = yTopRect + height;
      }
      // If goes outside screen, flip direction
      if (yTopRect < -20 || yBotRect > vh + 20) {
        dir *= -1;
        if (dir < 0) {
          yBotRect = prev.yTopRect + minI;
          yTopRect = yBotRect - height;
        } else {
          yTopRect = prev.yBotRect - minI;
          yBotRect = yTopRect + height;
        }
      }
      track.floes.push({ startX, endX, yTopRect, yBotRect });
      track.nextFloeX = endX;
    }
    // Drop floes left of view
    while (track.floes.length && track.floes[0].endX < track.scrollX - 200) {
      track.floes.shift();
    }
  }

  function jitterAround(main, jitterRatio){
    const j = (rng.float()*2 - 1) * jitterRatio;
    return Math.max(4, main * (1 + j));
  }

  function sampleBandEnvelope(startX, endX) {
    // Sample the band top/bot across [startX, endX] and return minTop and maxBot
    const samples = Math.max(4, Math.ceil((endX - startX) / 90));
    let minTop = Infinity;
    let maxBot = -Infinity;
    for (let i = 0; i <= samples; i++) {
      const x = startX + (i / samples) * (endX - startX);
      const [yT, yB] = sampleTrackYWorld(x);
      if (yT < minTop) minTop = yT;
      if (yB > maxBot) maxBot = yB;
    }
    return { yTop: minTop, yBot: maxBot };
  }

  function sampleTrackYWorld(xWorld) {
    const segs = track.segments;
    for (let i = 0; i < segs.length - 1; i++) {
      const s0 = segs[i], s1 = segs[i + 1];
      if (xWorld >= s0.x && xWorld <= s1.x) {
        const t = (xWorld - s0.x) / (s1.x - s0.x);
        return [lerp(s0.yTop, s1.yTop, t), lerp(s0.yBot, s1.yBot, t)];
      }
    }
    const sLast = segs[segs.length - 1];
    return [sLast.yTop, sLast.yBot];
  }

  // Controls: touch/mouse left/right halves set steerDir
  function setInputHandlers() {
    let active = false;
    function start(x) {
      active = true;
      state.running = true;
      hudMessage.style.opacity = 0;
      if (hudStartHint) hudStartHint.setAttribute('aria-hidden','true');
      state.steerDir = (x < vw/2) ? -1 : 1;
    }
    function move(x) { if (active) state.steerDir = (x < vw/2) ? -1 : 1; }
    function end() { active = false; state.steerDir = 0; }

    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      if (!state.running && state.meters === 0) {
        // first start
        start(e.clientX);
      } else if (!state.running && state.meters > 0) {
        // restart after crash
        reset(); hideGameOver();
        // immediately start steering on this side
        start(e.clientX);
      } else {
        start(e.clientX);
      }
    });
    canvas.addEventListener('pointermove', e => move(e.clientX));
    canvas.addEventListener('pointerup', () => end());
    canvas.addEventListener('pointercancel', () => end());

    // Keyboard fallback: Up/Down arrows or W/S
    window.addEventListener('keydown', e => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ArrowLeft') {
        if (!state.running && state.meters > 0) { reset(); hideGameOver(); }
        state.steerDir = -1; state.running = true; hudMessage.style.opacity = 0; if (hudStartHint) hudStartHint.setAttribute('aria-hidden','true');
      }
      if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ArrowRight') {
        if (!state.running && state.meters > 0) { reset(); hideGameOver(); }
        state.steerDir = 1; state.running = true; hudMessage.style.opacity = 0; if (hudStartHint) hudStartHint.setAttribute('aria-hidden','true');
      }
    });
    window.addEventListener('keyup', e => {
      if (['ArrowUp','KeyW','ArrowDown','KeyS','ArrowLeft','ArrowRight'].includes(e.code)) state.steerDir = 0;
    });
    if (hudGoRestart) {
      hudGoRestart.addEventListener('click', () => {
        reset(); hideGameOver();
        state.running = false; // wait for input
      });
    }
  }
  setInputHandlers();

  function lerp(a,b,t){return a+(b-a)*t}
  function clamp(v, a, b){return Math.max(a, Math.min(b, v));}

  function sampleTrackY(xScreen) {
    return sampleTrackYWorld(xScreen + track.scrollX);
  }

  function update(dt) {
    // Scroll
    if (state.running) {
      // Increase scrolling speed gradually
      track.speed += CONFIG.speedAccelPxPerSec2 * dt;
      track.scrollX += track.speed * dt;
      extendTrack();
    }

    // Car control → steer strength scales with speed (more speed = snappier)
    const speedExcess = Math.max(0, track.speed - CONFIG.baseSpeedPxPerSec);
    const speedUnits = speedExcess / 100; // per +100 px/s
    const steerStrength = clamp(
      CONFIG.steering.baseSteerStrength + CONFIG.steering.steerStrengthPer100Px * speedUnits,
      0,
      CONFIG.steering.maxSteerStrength
    );
    car.targetAngle = clamp(
      car.targetAngle + state.steerDir * steerStrength * dt,
      -CONFIG.steering.maxSteerAngleRad,
      CONFIG.steering.maxSteerAngleRad
    );

    // Drift model: velocity realigns toward the car's nose with grip
    const speed = Math.hypot(car.vx, car.vy);
    const headingVx = Math.cos(car.angle);
    const headingVy = Math.sin(car.angle);

    // Car tries to align its heading to targetAngle (steer feel)
    const steerResponse = Math.min(
      CONFIG.steering.baseResponse + CONFIG.steering.responsePer100Px * speedUnits,
      CONFIG.steering.maxResponse
    );
    car.angle += (car.targetAngle - car.angle) * (1 - Math.exp(-steerResponse * dt));

    // Propulsion keeps forward movement
    const accelForward = 120; // px/s^2
    car.vx += headingVx * accelForward * dt;
    car.vy += headingVy * accelForward * dt;

    // Compute components in car frame
    const velAngle = Math.atan2(car.vy, car.vx);
    let rel = velAngle - car.angle; // relative slip angle
    rel = Math.atan2(Math.sin(rel), Math.cos(rel)); // wrap

    let long = Math.cos(rel) * speed;
    let lat = Math.sin(rel) * speed;

    // Friction: stronger laterally than longitudinally
    const longDamp = Math.exp(-CONFIG.drift.longFrictionPerSec * dt);
    const latDamp = Math.exp(-CONFIG.drift.latFrictionPerSec * dt);
    long = long * longDamp + CONFIG.drift.forwardGlide * dt; // slight glide
    lat = lat * latDamp;

    // Alignment grip: bleed lateral into longitudinal in direction of nose
    let grip = CONFIG.drift.alignGripPerSec + CONFIG.drift.alignGripPer100Px * speedUnits;
    if (state.steerDir !== 0) grip *= (1 + CONFIG.drift.extraGripWhenSteering);
    grip = Math.min(grip, CONFIG.drift.maxAlignGrip);
    const transfer = lat * (1 - Math.exp(-grip * dt));
    long += Math.sign(long || 1) * Math.abs(transfer) * 0.6; // convert some sideways into forward
    lat -= transfer;

    // Rebuild velocity from components
    const newSpeed = Math.hypot(long, lat);
    const newRel = Math.atan2(lat, long);
    const newVelAngle = car.angle + newRel;
    car.vx = Math.cos(newVelAngle) * newSpeed;
    car.vy = Math.sin(newVelAngle) * newSpeed;

    // Integrate position
    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // Keep car approximately around one third width; world scroll simulates forward motion
    // If car drifts too far right, apply soft constraint
    const desiredX = vw * 0.35;
    car.x += (desiredX - car.x) * (1 - Math.exp(-8 * dt));

    // Collision: determine current region (floe or seam window) and stay within bounds
    const worldX = car.x + track.scrollX;
    const region = findCurrentRegion(worldX);
    const tolerance = 10;
    if (!region) {
      if (state.running) {
        state.best = Math.max(state.best, state.meters);
        state.running = false;
        flashLose();
      }
      return;
    }
    const gapHeightForScore = region.data.yBotRect - region.data.yTopRect;
    if (car.y < region.data.yTopRect - tolerance || car.y > region.data.yBotRect + tolerance) {
      if (state.running) {
        state.best = Math.max(state.best, state.meters);
        state.running = false;
        flashLose();
      }
      return;
    }

    // Update meters only while running: 100 px ~= 1 m
    if (state.running) {
      const metersPerPx = 1/100;
      state.meters += (track.speed * metersPerPx) * dt;
      updateMeters();
    }
  }

  function findCurrentRegion(worldX) {
    for (let i = 0; i < track.floes.length; i++) {
      const f = track.floes[i];
      if (worldX >= f.startX && worldX <= f.endX) return { type: 'floe', data: f };
      if (f.startX > worldX) break;
    }
    return null;
  }

  function flashLose() { showGameOver(); }

  function showGameOver() {
    if (!hudGameOver) return;
    hudGoScore.textContent = `Score: ${Math.floor(state.meters)} m`;
    hudGameOver.setAttribute('aria-hidden', 'false');
    if (hudStartHint) hudStartHint.setAttribute('aria-hidden','true');
  }
  function hideGameOver() {
    if (!hudGameOver) return;
    hudGameOver.setAttribute('aria-hidden', 'true');
  }

  function render() {
    ctx.clearRect(0, 0, vw, vh);

    // Sky/sea gradient
    const grd = ctx.createLinearGradient(0, 0, 0, vh);
    grd.addColorStop(0, '#072746');
    grd.addColorStop(1, '#0a4e74');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, vw, vh);

    // Draw water as layered wavy lines
    const drawWaves = (spacing, amp, freqX, speed, alpha, color) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      for (let y0 = -20; y0 <= vh + 20; y0 += spacing) {
        ctx.beginPath();
        for (let x = -40; x <= vw + 40; x += 16) {
          const t = x * freqX + state.time * speed + y0 * 0.025;
          const off = Math.sin(t * 2.1) * amp * 0.45 + Math.cos(t * 1.3) * amp * 0.25 + noise(t * 3.1) * amp * 0.3;
          const y = y0 + off;
          if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    drawWaves(34, 29, 0.010, 0.35, 0.08, '#b7eaff');
    drawWaves(52, 37, 0.007, 0.22, 0.06, '#9fdaf7');

    // Draw long rectangular floes with rounded corners (textured if available)
    for (let i = 0; i < track.floes.length; i++) {
      const f = track.floes[i];
      const x0 = f.startX - track.scrollX;
      const x1 = f.endX - track.scrollX;
      if (x1 < -2 || x0 > vw + 2) continue;
      const w = x1 - x0;
      const h = f.yBotRect - f.yTopRect;
      const r = 12;
      if (f.isShore) {
        // Shore: procedural pattern anchored to world, so it does not slide
        fillShorePattern(ctx, x0, f.yTopRect, w, h);
      } else if (floeImgReady) {
        ctx.save();
        // clip to rounded rect, then draw image stretched
        const rr = Math.min(r, w*0.5, h*0.5);
        ctx.beginPath();
        ctx.moveTo(x0+rr, f.yTopRect);
        ctx.arcTo(x0+w, f.yTopRect, x0+w, f.yTopRect+h, rr);
        ctx.arcTo(x0+w, f.yTopRect+h, x0, f.yTopRect+h, rr);
        ctx.arcTo(x0, f.yTopRect+h, x0, f.yTopRect, rr);
        ctx.arcTo(x0, f.yTopRect, x0+w, f.yTopRect, rr);
        ctx.closePath();
        ctx.clip();
        // Crop padding area from the source to avoid visual shrink
        const srcW = floeImg.naturalWidth || 1;
        const srcH = floeImg.naturalHeight || 1;
        const pad = CONFIG.floeSpritePaddingRatio;
        const sx = Math.floor(srcW * pad);
        const sy = Math.floor(srcH * pad);
        const sw = Math.max(1, Math.floor(srcW * (1 - 2*pad)));
        const sh = Math.max(1, Math.floor(srcH * (1 - 2*pad)));
        ctx.drawImage(floeImg, sx, sy, sw, sh, x0, f.yTopRect, w, h);
        ctx.restore();
      } else {
        roundedRect(ctx, x0, f.yTopRect, w, h, r, '#f7fdff');
      }
    }
    // No extra connectors between floes; only back-to-back rectangles

    // Draw a visual water gap on top (purely cosmetic; physics remains continuous)
    if (track.shoreEdgeX !== null && CONFIG.shoreVisualFadePx > 0) {
      const gapX1 = track.shoreEdgeX - track.scrollX; // shore end (screen X)
      const gapW = CONFIG.shoreVisualFadePx;
      const gapX0 = gapX1 - gapW;
      if (!(gapX1 < -2 || gapX0 > vw + 2)) {
        const sea = ctx.createLinearGradient(0, 0, 0, vh);
        sea.addColorStop(0, '#072746');
        sea.addColorStop(1, '#0a4e74');
        ctx.fillStyle = sea;
        ctx.fillRect(gapX0, 0, gapW, vh);
        // Optional thin edge highlight for readability
        ctx.strokeStyle = 'rgba(190,220,255,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gapX0 + 0.5, 0); ctx.lineTo(gapX0 + 0.5, vh); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gapX1 + 0.5, 0); ctx.lineTo(gapX1 + 0.5, vh); ctx.stroke();
      }
    }

    // Draw car (sprite if available), with a slip shadow
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Slip shadow based on lateral velocity
    const lateralSlip = Math.sin(Math.atan2(car.vy, car.vx) - car.angle);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12 + Math.abs(lateralSlip)*14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;
    if (carImgReady) {
      // The car sprite is oriented top-down (long side vertical). Rotate +90° so forward points right.
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(
        carImg,
        0,
        0,
        carImg.naturalWidth || 1,
        carImg.naturalHeight || 1,
        -car.width/2,
        -car.length/2,
        car.width,
        car.length
      );
    } else {
      // Fallback: vector car
      roundedRect(ctx, -car.length/2, -car.width/2, car.length, car.width, 12, '#9fe3ff');
      // wheels
      ctx.fillStyle = 'rgba(20,30,40,0.9)';
      const wheelW = car.length*0.16;
      const wheelH = car.width*0.22;
      const wheelOffsetX = car.length*0.28;
      const wheelOffsetY = car.width*0.5 - wheelH*0.5;
      ctx.fillRect(-wheelOffsetX - wheelW*0.5, -wheelOffsetY, wheelW, wheelH);
      ctx.fillRect(-wheelOffsetX - wheelW*0.5, +wheelOffsetY - wheelH, wheelW, wheelH);
      ctx.fillRect(+wheelOffsetX - wheelW*0.5, -wheelOffsetY, wheelW, wheelH);
      ctx.fillRect(+wheelOffsetX - wheelW*0.5, +wheelOffsetY - wheelH, wheelW, wheelH);
      // windshield
      roundedRect(ctx, -car.length*0.35, -car.width*0.35, car.length*0.22, car.width*0.7, 6, 'rgba(0,0,0,0.25)');
    }
    ctx.restore();

    // Hud subtle split hint
    // Uncomment to show halves helper: document.body.classList.add('halves')
  }

  function roundedRect(ctx, x, y, w, h, r, fill) {
    const rr = Math.min(r, w*0.5, h*0.5);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1/30, (now - last) / 1000);
    last = now;
    state.time += dt;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  reset();
  requestAnimationFrame(frame);
})();


