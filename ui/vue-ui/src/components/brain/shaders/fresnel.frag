uniform vec3 uColor;
uniform float uBaseOpacity;
uniform float uEdgeOpacity;
uniform float fresnelPower;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;

void main() {
  // Fresnel factor: edges facing away from camera are brighter
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), fresnelPower);

  // Subtle breathing pulse on the edge glow
  float pulse = 1.0 + 0.15 * sin(uTime * 0.8 + vWorldPosition.y * 0.05);
  float edgeAlpha = uEdgeOpacity * pulse;

  // Mix between base opacity (center) and pulsing edge opacity (rim)
  float alpha = mix(uBaseOpacity, edgeAlpha, fresnel);

  // Slight color shift at edges — warmer/cooler variation
  vec3 edgeColor = uColor + vec3(0.05, -0.02, 0.1) * fresnel;

  gl_FragColor = vec4(edgeColor, alpha);
}
