#version 300 es
precision mediump float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_brightness;    // default: 1.0
uniform float u_saturation;    // default: 1.0

vec3 adjustSaturation(vec3 color, float sat) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(gray), color, sat);
}

void main() {
    vec4 texColor = texture(u_texture, v_uv);

    if (texColor.a < 0.05) discard;

    vec3 color = texColor.rgb * u_brightness;
    color = adjustSaturation(color, u_saturation);

    // Slight warm tint to match paper aesthetic
    color *= vec3(1.02, 1.00, 0.97);

    fragColor = vec4(color, texColor.a);
}
