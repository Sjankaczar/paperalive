#version 300 es
precision mediump float;

layout(location = 0) in vec2 a_position;

uniform vec2 u_shadowOffset;   // e.g., (5.0, -30.0) pixels
uniform float u_shadowScaleY;  // flatten shadow vertically, e.g., 0.15
uniform vec2 u_canvasSize;

void main() {
    vec2 pos = a_position + u_shadowOffset;
    pos.y = pos.y * u_shadowScaleY + (1.0 - u_shadowScaleY) * u_canvasSize.y;

    vec2 ndc = (pos / u_canvasSize) * 2.0 - 1.0;
    ndc.y = -ndc.y;

    gl_Position = vec4(ndc, 0.5, 1.0);
}
