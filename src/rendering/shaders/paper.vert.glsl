#version 300 es
precision mediump float;

// Fullscreen quad: 2 triangles covering NDC [-1,1]
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;   // convert NDC to [0,1]
    gl_Position = vec4(a_position, 0.0, 1.0);
}
