#version 300 es
precision mediump float;

// No-op fragment shader for stencil write pass.
// Used with gl.colorMask(false, false, false, false) — no color output.
// Only purpose: fill stencil buffer with 1 for character interior pixels.

void main() {
    // Intentionally empty — stencil pass writes no color
}
