import * as THREE from 'three';

/**
 * Photosphere shader for the Sun: the NASA equirectangular map is warped by
 * a slowly flowing domain-warped fbm (red / orange / yellow convection swirl)
 * with fine granulation on top and physical limb darkening at the edge.
 * Output is HDR (>1.0) so the bloom pass picks the disc up naturally.
 */
export interface SunSurfaceHandle {
  material: THREE.ShaderMaterial;
  setMap: (tex: THREE.Texture | null) => void;
  setTime: (t: number) => void;
  /** 0 = at rest, 1 = selected in the explorer. */
  setBoost: (b: number) => void;
  dispose: () => void;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  void main() {
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uTime;
  uniform float uBoost;
  varying vec2 vUv;
  varying vec3 vNormalView;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < OCTAVES; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Stretch the noise horizontally near the poles so the equirectangular
    // seam and pole pinching stay hidden.
    float lat = (vUv.y - 0.5) * 3.14159265;
    vec2 p = vec2(vUv.x * max(0.25, cos(lat)), vUv.y);
    float t = uTime;
    vec2 q = vec2(fbm(p * 6.0 + t * 0.020), fbm(p * 6.0 - t * 0.017 + 3.1));
    float n = fbm(p * 10.0 + q * 1.6 + t * 0.03);
    float gran = vnoise(p * 90.0 + t * 0.45) * 0.6 + vnoise(p * 170.0 - t * 0.3) * 0.4;

    vec3 base = uHasMap > 0.5
      ? texture2D(uMap, vUv + (q - 0.5) * 0.012).rgb
      : vec3(1.0, 0.62, 0.22);
    vec3 red = vec3(0.95, 0.20, 0.05);
    vec3 orange = vec3(1.0, 0.55, 0.12);
    vec3 yellow = vec3(1.0, 0.92, 0.58);
    vec3 swirl = mix(red, orange, smoothstep(0.28, 0.6, n));
    swirl = mix(swirl, yellow, smoothstep(0.55, 0.88, n + gran * 0.25));

    vec3 col = base * (0.5 + 0.75 * swirl) + swirl * 0.28 * gran;
    // Limb darkening — the photosphere is cooler and dimmer toward the edge.
    float mu = max(vNormalView.z, 0.0);
    col *= 0.42 + 0.58 * pow(mu, 0.55);
    col *= 1.75 + 0.45 * uBoost;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function makeSunSurface(lite: boolean): SunSurfaceHandle {
  const material = new THREE.ShaderMaterial({
    defines: { OCTAVES: lite ? 3 : 5 },
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uTime: { value: 0 },
      uBoost: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  return {
    material,
    setMap(tex) {
      material.uniforms.uMap.value = tex;
      material.uniforms.uHasMap.value = tex ? 1 : 0;
    },
    setTime(t) {
      material.uniforms.uTime.value = t;
    },
    setBoost(b) {
      material.uniforms.uBoost.value = b;
    },
    dispose() {
      material.dispose();
    },
  };
}
