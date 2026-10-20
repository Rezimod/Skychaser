// Air between the eye and the ground. Every material in the Tbilisi scene
// that can be far away takes this hook: the light it sends is dimmed by
// exp(−β·d) and replaced by the colour of the air (warmer toward the sun),
// with β thinning with height so snow on Kazbek can still show through a
// clear afternoon. β is Koschmieder's 3.912 / visibility, from the forecast.
//
// The same hook can fold distance for the far terrain: past FAR_START a
// vertex is pulled in along its own line of sight, so the Caucasus, a
// hundred kilometres off, fits inside the camera's far plane (30 km) at exactly the
// angle it really subtends. The drop by the Earth's curvature (with standard
// refraction, EARTH_R_REFRACTED) is the terrain's own `withCurvature`
// (surface-orbit), measured from the site, so it holds from orbit too.
//
// `uHazeLift` scales β as the camera climbs out of the air (surface-orbit
// `hazeLift`): the scenes' haze is a ground-level air, and from kilometres up
// it would lay a disc of fog on the planet under it. 1 on the ground.
//
// The world position rides a varying named vEarthPos, never a substring of
// three's own vWorldPosition.

import * as THREE from 'three';

export const FAR_START = 11000;
export const FAR_END = 29000;
/** Earth's radius stretched by refraction (k = 0.13): the drop at distance d is d² / 2R. */
export const EARTH_R_REFRACTED = 6371000 / (1 - 0.13);

export const haze = {
  uHazeColor: { value: new THREE.Color(0.6, 0.7, 0.85) },
  uHazeSunColor: { value: new THREE.Color(1, 0.9, 0.75) },
  uHazeSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uHazeBeta: { value: 1.3e-4 },
  uHazeBase: { value: 400 },
  uHazeLift: { value: 1 },
  uFarStart: { value: FAR_START },
  uFarEnd: { value: FAR_END },
};

const VERT_HEAD = 'varying vec3 vEarthPos;\nuniform float uFarStart;\nuniform float uFarEnd;\n';
const FRAG_HEAD = 'varying vec3 vEarthPos;\nuniform vec3 uHazeColor;\nuniform vec3 uHazeSunColor;\nuniform vec3 uHazeSunDir;\nuniform float uHazeBeta;\nuniform float uHazeBase;\nuniform float uHazeLift;\n';

const PROJECT = `
  vec4 eLocal = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    eLocal = instanceMatrix * eLocal;
  #endif
  vec4 eWorld = modelMatrix * eLocal;
  vEarthPos = eWorld.xyz;
  #ifdef EARTH_FAR
    vec3 eRel = eWorld.xyz - cameraPosition;
    float eLen = max( length( eRel ), 1e-3 );
    float eFold = eLen < uFarStart ? eLen : uFarStart + ( uFarEnd - uFarStart ) * ( 1.0 - exp( -( eLen - uFarStart ) / ( uFarEnd - uFarStart ) ) );
    eWorld.xyz = cameraPosition + eRel * ( eFold / eLen );
  #endif
  vec4 mvPosition = viewMatrix * eWorld;
  gl_Position = projectionMatrix * mvPosition;
`;

const FOG = `
  {
    vec3 eRay = vEarthPos - cameraPosition;
    float eDist = length( eRay );
    vec3 eDir = eRay / max( eDist, 1e-3 );
    float eThin = 0.3 + 0.7 * exp( -max( 0.0, vEarthPos.y - uHazeBase ) / 1500.0 );
    float eT = exp( -eDist * uHazeBeta * uHazeLift * eThin );
    float eSun = pow( max( dot( eDir, uHazeSunDir ), 0.0 ), 7.0 );
    vec3 eAir = mix( uHazeColor, uHazeSunColor, eSun );
    gl_FragColor.rgb = gl_FragColor.rgb * eT + eAir * ( 1.0 - eT );
  }
`;

/** Patch a shader (from onBeforeCompile) with the air, and optionally the fold. */
export function injectHaze(shader: THREE.WebGLProgramParametersWithUniforms, far = false) {
  Object.assign(shader.uniforms, haze);
  shader.vertexShader = (far ? '#define EARTH_FAR\n' : '') + VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', PROJECT);
  shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace('#include <fog_fragment>', FOG);
}

/** Give a material the air. `key` must name everything else its onBeforeCompile does. */
export function withHaze<M extends THREE.Material>(material: M, key: string, far = false, extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void): M {
  material.onBeforeCompile = (shader) => {
    injectHaze(shader, far);
    extra?.(shader);
  };
  material.customProgramCacheKey = () => `earth-haze|${far ? 'far' : 'near'}|${key}`;
  return material;
}
