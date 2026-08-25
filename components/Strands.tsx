'use client';

import type { CSSProperties } from 'react';
import { Renderer, Program, Mesh, Color, Triangle, RenderTarget } from 'ogl';
import { useEffect, useRef } from 'react';

import './Strands.css';

const MAX_STRANDS = 12;
const MAX_COLORS = 8;

export interface StrandsProps {
  colors?: string[];
  count?: number;
  speed?: number;
  amplitude?: number;
  waviness?: number;
  thickness?: number;
  glow?: number;
  taper?: number;
  spread?: number;
  hueShift?: number;
  intensity?: number;
  saturation?: number;
  opacity?: number;
  scale?: number;
  glass?: boolean;
  refraction?: number;
  dispersion?: number;
  glassSize?: number;
  className?: string;
  style?: CSSProperties;
}

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform int uStrandCount;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaviness;
uniform float uThickness;
uniform float uGlow;
uniform float uTaper;
uniform float uSpread;
uniform float uHueShift;
uniform float uIntensity;
uniform float uOpacity;
uniform float uScale;
uniform float uSaturation;

out vec4 fragColor;

const float PI = 3.14159265;

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.00, 0.33, 0.67)));
}

vec3 samplePalette(float t) {
  t = fract(t);
  float scaled = t * float(uColorCount);
  int idx = int(floor(scaled));
  float blend = fract(scaled);
  int nextIdx = idx + 1;
  if (nextIdx >= uColorCount) nextIdx = 0;
  return mix(uColors[idx], uColors[nextIdx], blend);
}

vec3 strandColor(float t) {
  if (uColorCount > 0) return samplePalette(t);
  return spectrum(t);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  uv /= max(uScale, 0.0001);

  float e = 0.06 + uIntensity * 0.94;
  float env = pow(max(cos(uv.x * PI * 1.3), 0.0), uTaper);

  vec3 col = vec3(0.0);

  for (int i = 0; i < ${MAX_STRANDS}; i++) {
    if (i >= uStrandCount) break;

    float fi = float(i);
    float ph = fi * 1.7 * uSpread;
    float freq = (2.0 + fi * 0.35) * uWaviness;
    float spd = 1.4 + fi * 1.2;

    float tt = uTime * uSpeed;
    float w = sin(uv.x * freq + tt * spd + ph) * 0.60
            + sin(uv.x * freq * 1.1 - tt * spd * 0.7 + ph * 1.7) * 0.40;

    float amp = (0.1 + 0.02 * e) * env * uAmplitude;
    float y = w * amp;

    float d = abs(uv.y - y);
    float thick = (0.001 + 0.05 * e) * (0.35 + env) * uThickness;
    float g = thick / (d + thick * 0.45);
    g = g * g;

    float h = fi / float(uStrandCount) + uv.x * 0.30 + uTime * 0.04 + uHueShift;
    col += strandColor(h) * g * env;
  }

  col *= 0.45 + 0.7 * e;
  col = 1.0 - exp(-col * uGlow);

  float gray = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(gray), col, uSaturation), 0.0);

  float lum = max(max(col.r, col.g), col.b);
  float alpha = clamp(lum, 0.0, 1.0) * uOpacity;

  fragColor = vec4(col * uOpacity, alpha);
}
`;

const GLASS_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uRefraction;
uniform float uDispersion;

out vec4 fragColor;

vec2 toUv(vec2 p) {
  return p * (uResolution.y / uResolution) + 0.5;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float d = length(p);
  float r = uRadius;

  float edge = fwidth(d) * 1.5;
  float mask = 1.0 - smoothstep(r - edge, r + edge, d);
  if (mask <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  float z = sqrt(max(r * r - d * d, 0.0)) / r;
  float nd = d / r;

  vec2 dir = d > 0.0 ? p / d : vec2(0.0);
  float lens = smoothstep(0.85, 1.0, nd) * pow(nd, 6.0);
  vec2 offset = -dir * lens * uRefraction * 0.15;
  vec2 disp = -dir * lens * uDispersion * 0.012;

  vec3 light;
  light.r = texture(uScene, toUv(p + offset - disp)).r;
  light.g = texture(uScene, toUv(p + offset)).g;
  light.b = texture(uScene, toUv(p + offset + disp)).b;

  float fres = pow(1.0 - z, 3.0);
  vec3 rim = vec3(1.0) * fres * 0.18;

  vec2 lightDir = normalize(vec2(-0.55, 0.6));
  float spec = pow(max(dot(p / max(r, 1e-4), lightDir), 0.0), 6.0);
  spec *= smoothstep(r, r * 0.55, d);

  vec3 emissive = light + rim + vec3(spec) * 0.4;
  float emissiveA = clamp(max(max(emissive.r, emissive.g), emissive.b), 0.0, 1.0);

  float bodyA = 0.05 + fres * 0.05;

  float outA = emissiveA + bodyA * (1.0 - emissiveA);
  vec3 outRGB = emissive;

  outRGB *= mask;
  outA *= mask;

  fragColor = vec4(outRGB, outA);
}
`;

const buildPalette = (colors: string[]) => {
  const filled = colors.length > 0 ? colors : ['#ffffff'];
  const padded: [number, number, number][] = [];

  for (let i = 0; i < MAX_COLORS; i++) {
    const hex = filled[i] ?? filled[filled.length - 1];
    const color = new Color(hex);
    padded.push([color.r, color.g, color.b]);
  }

  return padded;
};

export default function Strands({
  colors = ['#FF4242', '#7C3AED', '#06B6D4', '#EAB308'],
  count = 3,
  speed = 0.5,
  amplitude = 1,
  waviness = 1,
  thickness = 0.7,
  glow = 2.6,
  taper = 3,
  spread = 1,
  hueShift = 0,
  intensity = 0.6,
  saturation = 1.5,
  opacity = 1,
  scale = 1.5,
  glass = false,
  refraction = 1,
  dispersion = 1,
  glassSize = 1,
  className = '',
  style,
}: StrandsProps) {
  const propsRef = useRef<StrandsProps>({});
  propsRef.current = {
    colors,
    count,
    speed,
    amplitude,
    waviness,
    thickness,
    glow,
    taper,
    spread,
    hueShift,
    intensity,
    saturation,
    opacity,
    scale,
    glass,
    refraction,
    dispersion,
    glassSize,
  };

  const ctnDom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ctn = ctnDom.current;
    if (!ctn) return;

    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    });

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.backgroundColor = 'transparent';

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) {
      delete geometry.attributes.uv;
    }

    const initial = propsRef.current;
    const initialColors = initial.colors ?? ['#ffffff'];

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [ctn.offsetWidth, ctn.offsetHeight] },
        uColors: { value: buildPalette(initialColors) },
        uColorCount: { value: Math.min(initialColors.length, MAX_COLORS) },
        uStrandCount: {
          value: Math.min(Math.max(Math.round(initial.count ?? 3), 1), MAX_STRANDS),
        },
        uSpeed: { value: initial.speed ?? 0.5 },
        uAmplitude: { value: initial.amplitude ?? 1 },
        uWaviness: { value: initial.waviness ?? 1 },
        uThickness: { value: initial.thickness ?? 0.7 },
        uGlow: { value: initial.glow ?? 2.6 },
        uTaper: { value: initial.taper ?? 3 },
        uSpread: { value: initial.spread ?? 1 },
        uHueShift: { value: initial.hueShift ?? 0 },
        uIntensity: { value: initial.intensity ?? 0.6 },
        uOpacity: { value: initial.opacity ?? 1 },
        uScale: { value: initial.scale ?? 1.5 },
        uSaturation: { value: initial.saturation ?? 1.5 },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    const renderTarget = new RenderTarget(gl, {
      width: Math.max(1, ctn.offsetWidth),
      height: Math.max(1, ctn.offsetHeight),
    });

    const glassProgram = new Program(gl, {
      vertex: VERT,
      fragment: GLASS_FRAG,
      uniforms: {
        uScene: { value: renderTarget.texture },
        uResolution: { value: [ctn.offsetWidth, ctn.offsetHeight] },
        uRadius: { value: 0.46 * (initial.glassSize ?? 1) },
        uRefraction: { value: initial.refraction ?? 1 },
        uDispersion: { value: initial.dispersion ?? 1 },
      },
    });

    const glassMesh = new Mesh(gl, {
      geometry,
      program: glassProgram,
    });

    ctn.appendChild(gl.canvas);

    const resize = () => {
      if (!ctn) return;

      const width = Math.max(1, ctn.offsetWidth);
      const height = Math.max(1, ctn.offsetHeight);

      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width, height];

      renderTarget.setSize(width, height);
      glassProgram.uniforms.uResolution.value = [width, height];
    };

    window.addEventListener('resize', resize);
    resize();

    let animateId = 0;

    const update = (time: number) => {
      animateId = requestAnimationFrame(update);

      const current = propsRef.current;
      const currentColors = current.colors ?? ['#ffffff'];

      program.uniforms.uTime.value = time * 0.001;
      program.uniforms.uColors.value = buildPalette(currentColors);
      program.uniforms.uColorCount.value = Math.min(currentColors.length, MAX_COLORS);
      program.uniforms.uStrandCount.value = Math.min(
        Math.max(Math.round(current.count ?? 3), 1),
        MAX_STRANDS,
      );
      program.uniforms.uSpeed.value = current.speed ?? 0.5;
      program.uniforms.uAmplitude.value = current.amplitude ?? 1;
      program.uniforms.uWaviness.value = current.waviness ?? 1;
      program.uniforms.uThickness.value = current.thickness ?? 0.7;
      program.uniforms.uGlow.value = current.glow ?? 2.6;
      program.uniforms.uTaper.value = current.taper ?? 3;
      program.uniforms.uSpread.value = current.spread ?? 1;
      program.uniforms.uHueShift.value = current.hueShift ?? 0;
      program.uniforms.uIntensity.value = current.intensity ?? 0.6;
      program.uniforms.uOpacity.value = current.opacity ?? 1;
      program.uniforms.uScale.value = current.scale ?? 1.5;
      program.uniforms.uSaturation.value = current.saturation ?? 1.5;

      if (current.glass) {
        renderer.render({ scene: mesh, target: renderTarget });

        glassProgram.uniforms.uScene.value = renderTarget.texture;
        glassProgram.uniforms.uRefraction.value = current.refraction ?? 1;
        glassProgram.uniforms.uDispersion.value = current.dispersion ?? 1;
        glassProgram.uniforms.uRadius.value = 0.46 * (current.glassSize ?? 1);

        renderer.render({ scene: glassMesh });
      } else {
        renderer.render({ scene: mesh });
      }
    };

    animateId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animateId);
      window.removeEventListener('resize', resize);

      if (ctn && gl.canvas.parentNode === ctn) {
        ctn.removeChild(gl.canvas);
      }

      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <div
      ref={ctnDom}
      className={`strands-container ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
}