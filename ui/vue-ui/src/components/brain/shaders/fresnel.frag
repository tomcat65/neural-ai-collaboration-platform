uniform vec3 uColor;
uniform float uBaseOpacity;
uniform float uEdgeOpacity;
uniform float fresnelPower;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;

void main() {
  // Fresnel factor: edges facing away from camera are brighter
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), fresnelPower);

  // Mix between base opacity (center) and edge opacity (rim)
  float alpha = mix(uBaseOpacity, uEdgeOpacity, fresnel);

  gl_FragColor = vec4(uColor, alpha);
}
