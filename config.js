  // Tunables (adjust to rebalance gameplay and visuals)
  export const CONFIG = {
    // World scroll
    baseSpeedPxPerSec: 220,        // initial world scroll speed (px/s)
    speedAccelPxPerSec2: 4,       // how fast the scroll speed grows (px/s^2)

    // Steering feel
    steering: {
      baseSteerStrength: 2,        // target angle change speed at base speed (rad/s)
      steerStrengthPer100Px: 0.4,  // extra steer strength per +100 px/s scroll
      baseResponse: 2,           // how quickly the body turns toward target angle
      responsePer100Px: 0.1,      // extra response per +100 px/s scroll
      maxSteerStrength: 6,       // cap for steer strength
      maxResponse: 15.0,           // cap for response
      maxSteerAngleRad: 1.6,       // clamp for target steering angle (± radians)
    },

    // Drift/grip
    drift: {
      longFrictionPerSec: 0.5,     // longitudinal damping (along heading)
      latFrictionPerSec: 0.5,      // lateral damping (kills side slip)
      alignGripPerSec: 0,         // rate velocity aligns to nose (s^-1)
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
      minIntersection: 90,         // min vertical separation between consecutive floes (px)
      intersectionJitter: 0.4      // +0..jitter of extra separation (fraction)
    },

    // Forward progress modulation (reduce scroll when turning)
    forwardMod: {
      curveExponent: 1,    // curvature of 1→0 drop with angle (1=linear, >1 slower near 0, <1 faster)
      smoothTimeSec: 0.6     // smoothing time constant for forward slowdown/speedup (sec)
    }
  };