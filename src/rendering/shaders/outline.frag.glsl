#version 300 es
precision mediump float;

out vec4 fragColor;

uniform vec3  u_outlineColor;   // default: (0.1, 0.08, 0.05) dark warm brown
uniform float u_outlineOpacity; // default: 0.9

void main() {
    fragColor = vec4(u_outlineColor, u_outlineOpacity);
}
