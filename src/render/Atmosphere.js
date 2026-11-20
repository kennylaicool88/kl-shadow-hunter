// Atmosphere: replaces three's fog chunks with the scene's distance fog + an exponential ground haze
// integrated along each view ray + a warm in-scatter tint toward the sun. It runs inside every lit
// material's own fragment shader, so it needs no extra pass or depth texture.
// The extra uniforms are plain {x, y, z} objects shared by reference: UniformsUtils.clone copies
// Vector3s but passes plain objects through, so one update here reaches every material.
import * as THREE from 'three';

export const atmosphere = {
  sunDir: { x: 0.45, y: 0.75, z: 0.3 },
  sunColor: { x: 1.0, y: 0.84, z: 0.62 },
  // x: ground haze density (0 = off), y: haze height falloff (1/m), z: sun in-scatter strength
  params: { x: 0, y: 0.05, z: 0.5 },
};

for (const lib of Object.values(THREE.ShaderLib)) {
  if (!lib.uniforms || !lib.uniforms.fogColor) continue;
  lib.uniforms.fogSunDir = { value: atmosphere.sunDir };
  lib.uniforms.fogSunColor = { value: atmosphere.sunColor };
  lib.uniforms.fogAtmo = { value: atmosphere.params };
}

THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogRay;
#endif`;

// mvPosition * mat3(viewMatrix) == transpose(viewRotation) * mvPosition: camera -> fragment in world axes
THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogRay = mvPosition.xyz * mat3( viewMatrix );
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec3 fogSunDir;
	uniform vec3 fogSunColor;
	uniform vec3 fogAtmo;
	varying float vFogDepth;
	varying vec3 vFogRay;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	float rayLen = length( vFogRay );
	vec3 rd = vFogRay / max( rayLen, 1e-4 );
	if ( fogAtmo.x > 0.0 ) {
		// density(h) = a * exp(-b h), integrated from the camera along the ray (closed form)
		float b = fogAtmo.y;
		float camH = max( cameraPosition.y, 0.0 );
		float k = abs( rd.y ) > 1e-3 ? ( 1.0 - exp( - rayLen * rd.y * b ) ) / ( rd.y * b ) : rayLen;
		float haze = 1.0 - exp( - fogAtmo.x * exp( - camH * b ) * k );
		fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - haze );
	}
	float sunAmt = pow( max( dot( rd, fogSunDir ), 0.0 ), 8.0 ) * fogAtmo.z;
	gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, fogSunColor, sunAmt ), fogFactor );
#endif`;

// haze: ground haze density at sea level (per metre); falloff: per metre of height; scatter: 0–1.
export function setAtmosphere({ sunDir, sunColor, haze = 0, falloff = 0.05, scatter = 0.5 } = {}) {
  if (sunDir) Object.assign(atmosphere.sunDir, { x: sunDir.x, y: sunDir.y, z: sunDir.z });
  if (sunColor) Object.assign(atmosphere.sunColor, { x: sunColor.r, y: sunColor.g, z: sunColor.b });
  atmosphere.params.x = haze;
  atmosphere.params.y = falloff;
  atmosphere.params.z = scatter;
}
