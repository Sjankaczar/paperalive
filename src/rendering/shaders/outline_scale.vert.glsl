#version 300 es
precision mediump float;

layout(location = 0) in vec2 a_position;   // deformed vertex position (pixel space)

uniform vec2  u_canvasSize;
uniform vec2  u_meshCenter;    // centroid mesh (pixel space), from preprocessing
uniform float u_outlineScale;  // default: 1.02 (2% larger than character)

void main() {
    // Scale from centroid (uniform expansion)
    vec2 expanded = u_meshCenter + (a_position - u_meshCenter) * u_outlineScale;

    // Pixel to NDC
    vec2 ndc = (expanded / u_canvasSize) * 2.0 - 1.0;
    ndc.y = -ndc.y;

    gl_Position = vec4(ndc, 0.0, 1.0);
}
