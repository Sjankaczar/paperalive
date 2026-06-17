#version 300 es
precision mediump float;

in vec2 v_uv;
out vec4 fragColor;

// NOTE: This shader is executed ONLY during baking (startup + settings change).
// It is NOT executed per-frame. Per-frame uses blit.frag.glsl for paper FBO blit.

uniform float u_noiseScale;     // default: 4.0
uniform float u_noiseStrength;  // default: 0.04 (4% brightness variation)
uniform vec3  u_paperColor;     // default: (0.96, 0.93, 0.87) warm off-white

// === Simple value noise (no texture lookup) ===
float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);  // smoothstep

    float a = hash(i + vec2(0.0, 0.0));
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// === Vignette ===
float vignette(vec2 uv) {
    vec2 centered = uv - 0.5;
    float dist = dot(centered, centered);
    return 1.0 - dist * 1.2;
}

void main() {
    // Paper grain (static — no time dependency)
    float grain = noise(v_uv * u_noiseScale * 100.0);
    vec3 paperColor = u_paperColor + (grain - 0.5) * u_noiseStrength;

    // Vignette darkening at edges
    paperColor *= vignette(v_uv);

    // Subtle horizontal "paper fiber" lines (baked together with noise)
    float fiber = noise(vec2(v_uv.y * 300.0, 0.0)) * 0.015;
    paperColor -= fiber;

    fragColor = vec4(clamp(paperColor, 0.0, 1.0), 1.0);
}
