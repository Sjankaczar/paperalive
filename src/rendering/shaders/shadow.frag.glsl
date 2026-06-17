#version 300 es
precision mediump float;

out vec4 fragColor;
uniform float u_shadowOpacity;  // default: 0.35

void main() {
    fragColor = vec4(0.0, 0.0, 0.0, u_shadowOpacity);
}
