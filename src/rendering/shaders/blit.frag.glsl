#version 300 es
precision mediump float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_source;   // paper FBO texture

void main() {
    fragColor = texture(u_source, v_uv);
}
