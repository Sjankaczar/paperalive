#version 300 es
precision mediump float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_scene;          // FBO texture containing character+outline
uniform float     u_time;           // time in seconds
uniform float     u_amplitude;      // default: 0.003
uniform float     u_frequency;      // default: 3.0
uniform float     u_spatialFreq;    // default: 8.0

void main() {
    float offsetX = sin(v_uv.y * u_spatialFreq + u_time * u_frequency)
                    * u_amplitude;
    float offsetY = sin(v_uv.x * (u_spatialFreq * 1.3) + u_time * (u_frequency * 1.1) + 1.57)
                    * u_amplitude * 0.7;

    vec2 distortedUV = v_uv + vec2(offsetX, offsetY);

    fragColor = texture(u_scene, distortedUV);
}
