// Single render path for the world: HDR scene → (GTAO) → (bloom) → (cinematic DOF) → ACES tone map
// → colour grade + vignette → (SMAA). The first-person weapon is drawn afterwards straight to the
// canvas (renderer tone-maps it), so it stays sharp and is never blurred or bloomed.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// Graphics presets. pixelRatio is capped by the device ratio.
export const QUALITY = {
  low: { label: 'Low', pixelRatio: 1, shadows: false, shadowSize: 1024, shadowType: THREE.PCFShadowMap, post: false, ao: false, bloom: false, msaa: 0, smaa: false, aniso: 2, propDistance: 45, detail: 0 },
  medium: { label: 'Medium', pixelRatio: 1, shadows: true, shadowSize: 2048, shadowType: THREE.PCFShadowMap, post: true, ao: false, bloom: true, msaa: 0, smaa: true, aniso: 4, propDistance: 75, detail: 1 },
  high: { label: 'High', pixelRatio: 1.25, shadows: true, shadowSize: 2048, shadowType: THREE.PCFSoftShadowMap, post: true, ao: true, aoSamples: 8, bloom: true, msaa: 0, smaa: true, aniso: 8, propDistance: 110, detail: 2 },
  ultra: { label: 'Ultra', pixelRatio: 1.5, shadows: true, shadowSize: 4096, shadowType: THREE.PCFSoftShadowMap, post: true, ao: true, aoSamples: 16, bloom: true, msaa: 4, smaa: false, aniso: 16, propDistance: 170, detail: 3 },
};

// 'auto' resolves from the GPU: integrated / mobile GPUs get Medium, everything else High.
export function detectQuality(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    if (/SwiftShader|llvmpipe|Software/i.test(name)) return { preset: 'low', gpu: name };
    if (/Intel|Mali|Adreno|PowerVR|Apple GPU|UHD|Iris/i.test(name)) return { preset: 'medium', gpu: name };
    return { preset: 'high', gpu: name };
  } catch {
    return { preset: 'medium', gpu: 'unknown' };
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.05 },
    contrast: { value: 1.04 },
    lift: { value: new THREE.Vector3(0.0, 0.004, 0.012) }, // slightly cool shadows
    gain: { value: new THREE.Vector3(1.02, 1.0, 0.97) }, // slightly warm highlights
    vignette: { value: 0.22 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float saturation; uniform float contrast; uniform vec3 lift; uniform vec3 gain; uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * gain + lift * (1.0 - c.rgb);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

// Night vision (mode 1: light amplification, green phosphor, grain, tube vignette) and thermal
// (mode 2: compressed grey world, hostiles marked magenta by Enemy.setThermal render white-hot).
const VisionShader = {
  uniforms: { tDiffuse: { value: null }, mode: { value: 0 }, time: { value: 0 }, aspect: { value: 1.7 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform int mode; uniform float time; uniform float aspect;
    varying vec2 vUv;
    float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec2 d = vUv - 0.5; d.x *= aspect;
      float r = length(d);
      float n = rand(vUv * 731.0 + fract(time) * 17.0) - 0.5;
      if (mode == 1) {
        float a = 1.0 - exp(-l * 3.2);
        a = a * 1.1 + n * 0.13;
        vec3 col = vec3(0.2, 1.0, 0.36) * a + vec3(0.0, 0.025, 0.005);
        col *= smoothstep(0.78, 0.62, r);
        gl_FragColor = vec4(col, 1.0);
      } else {
        float hot = clamp((min(c.r, c.b) - c.g) * 3.0, 0.0, 1.0);
        float v = 0.08 + l * 0.36 + hot * 0.92 + n * 0.035;
        v *= 1.0 - 0.35 * smoothstep(0.45, 0.9, r);
        gl_FragColor = vec4(vec3(v), 1.0);
      }
    }`,
};

export class RenderPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = null;
    this.cinematic = null; // { focus } when DOF is active
    this.vision = 'none'; // none | nvg | thermal
    this.width = 1;
    this.height = 1;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.qName = QUALITY[name] ? name : 'high';
    this.quality = q;
    const r = this.renderer;
    r.shadowMap.enabled = q.shadows;
    r.shadowMap.type = q.shadowType;
    this._buildComposer();
    return q;
  }

  _buildComposer() {
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      for (const p of this.composer.passes) p.dispose && p.dispose();
    }
    this.composer = null;
    const q = this.quality;
    const lite = !q.post; // Low preset: composer only exists while a vision mode is active
    if (lite && this.vision === 'none') return;
    const rt = new THREE.WebGLRenderTarget(this.width, this.height, { type: THREE.HalfFloatType, samples: q.msaa });
    const c = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    c.addPass(this.renderPass);
    if (q.ao && !lite) {
      this.aoPass = new GTAOPass(this.scene, this.camera, this.width, this.height);
      this.aoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1, samples: q.aoSamples });
      this.aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      this.aoPass.blendIntensity = 0.85;
      c.addPass(this.aoPass);
    } else this.aoPass = null;
    if (q.bloom && !lite) {
      // Restrained: only genuinely bright pixels (emissive lights, muzzle flashes, sun glints) bloom.
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.32, 0.45, 0.92);
      c.addPass(this.bloomPass);
    } else this.bloomPass = null;
    this.bokehPass = new BokehPass(this.scene, this.camera, { focus: 60, aperture: 0.00012, maxblur: 0.006 });
    this.bokehPass.enabled = false;
    c.addPass(this.bokehPass);
    c.addPass(new OutputPass());
    this.gradePass = new ShaderPass(GradeShader);
    c.addPass(this.gradePass);
    this.visionPass = new ShaderPass(VisionShader);
    c.addPass(this.visionPass);
    this._syncVision();
    if (q.smaa && !lite) c.addPass(new SMAAPass(this.width * this.renderer.getPixelRatio(), this.height * this.renderer.getPixelRatio()));
    this.composer = c;
    c.setPixelRatio(this.renderer.getPixelRatio());
    c.setSize(this.width, this.height);
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  // Depth of field for scripted cinematics only (never in normal FPS view).
  setCinematic(focusDistance) {
    if (!this.bokehPass) return;
    if (focusDistance == null) { this.bokehPass.enabled = false; return; }
    this.bokehPass.enabled = true;
    this.bokehPass.uniforms.focus.value = focusDistance;
    this.bokehPass.uniforms.aperture.value = 0.00003; // restrained: background softens, subject stays sharp
  }

  setGrade({ saturation, contrast, vignette, exposure } = {}) {
    if (exposure !== undefined) this.renderer.toneMappingExposure = exposure;
    if (!this.gradePass) return;
    const u = this.gradePass.uniforms;
    if (saturation !== undefined) u.saturation.value = saturation;
    if (contrast !== undefined) u.contrast.value = contrast;
    if (vignette !== undefined) u.vignette.value = vignette;
  }

  setVision(mode) {
    const was = this.vision;
    this.vision = mode || 'none';
    if (!this.quality.post && (was === 'none') !== (this.vision === 'none')) this._buildComposer();
    this._syncVision();
  }

  _syncVision() {
    if (!this.visionPass) return;
    this.visionPass.enabled = this.vision !== 'none';
    this.visionPass.uniforms.mode.value = this.vision === 'nvg' ? 1 : 2;
  }

  render() {
    if (this.visionPass) { this.visionPass.uniforms.time.value = performance.now() / 1000; this.visionPass.uniforms.aspect.value = this.width / Math.max(1, this.height); }
    if (this.composer) {
      this.renderPass.camera = this.camera;
      if (this.aoPass) this.aoPass.camera = this.camera;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
