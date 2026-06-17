#version 300 es
precision mediump float;

layout(location = 0) in vec2 a_position;   // deformed vertex position (pixel space)
layout(location = 1) in vec2 a_uv;         // UV coordinate

uniform vec2 u_canvasSize;

out vec2 v_uv;

void main() {
    v_uv = a_uv;
    vec2 ndc = (a_position / u_canvasSize) * 2.0 - 1.0;
    ndc.y = -ndc.y;
    gl_Position = vec4(ndc, 0.0, 1.0);
}
