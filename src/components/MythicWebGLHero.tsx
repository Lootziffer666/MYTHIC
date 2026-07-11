"use client";

import { useEffect, useRef } from "react";

const VERTEX = `#version 300 es
precision highp float;

in vec3 aPosition;
in float aSeed;
in float aRing;

uniform float uTime;
uniform vec2 uPointer;
uniform vec2 uResolution;
uniform float uPixelRatio;

out float vSeed;
out float vDepth;
out float vPulse;

mat2 rotate(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

void main() {
  vec3 p = aPosition;
  float time = uTime * 0.18;
  float ring = aRing;
  float seed = aSeed;

  float orbit = time * (0.42 + ring * 0.018) + seed * 6.2831853;
  p.xz *= rotate(orbit * 0.45);
  p.xy *= rotate(sin(time + ring) * 0.12);

  float wave = sin(length(p.xz) * 3.1 - uTime * 1.15 + seed * 9.0);
  p.y += wave * 0.19 + sin(uTime * 0.7 + seed * 19.0) * 0.05;

  vec2 pointer = (uPointer - 0.5) * vec2(2.4, -1.35);
  float pull = exp(-distance(p.xy, pointer) * 1.8);
  p.xy += normalize(p.xy - pointer + 0.0001) * pull * 0.18;
  p.z += pull * 0.34;

  float lens = 2.2 / (2.2 + p.z);
  vec2 projected = p.xy * lens;
  projected.x *= uResolution.y / uResolution.x;

  gl_Position = vec4(projected, 0.16 + p.z * 0.06, 1.0);
  gl_PointSize = (1.35 + hash(seed * 91.7) * 2.4 + pull * 4.4) * lens * uPixelRatio;

  vSeed = seed;
  vDepth = clamp(lens, 0.0, 1.4);
  vPulse = wave * 0.5 + 0.5;
}
`;

const FRAGMENT = `#version 300 es
precision highp float;

in float vSeed;
in float vDepth;
in float vPulse;

uniform float uTime;
out vec4 outColor;

vec3 palette(float t) {
  vec3 a = vec3(0.48, 0.26, 0.92);
  vec3 b = vec3(0.04, 0.84, 0.96);
  vec3 c = vec3(1.00, 0.72, 0.28);
  vec3 d = vec3(0.16, 1.00, 0.68);
  return mix(mix(a, b, smoothstep(0.05, 0.55, t)), mix(c, d, smoothstep(0.55, 1.0, t)), smoothstep(0.35, 0.9, t));
}

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = dot(uv, uv);
  float core = smoothstep(1.0, 0.0, r);
  float halo = exp(-r * 2.8);
  float shimmer = 0.72 + 0.28 * sin(uTime * 2.4 + vSeed * 37.0);
  vec3 color = palette(fract(vSeed * 1.37 + vPulse * 0.18));
  color += vec3(1.0, 0.76, 0.42) * pow(halo, 5.0) * 0.65;
  float alpha = (core * 0.62 + halo * 0.26) * shimmer * smoothstep(0.22, 1.05, vDepth);
  outColor = vec4(color, alpha);
}
`;

const BG_VERTEX = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const BG_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform vec2 uPointer;
uniform vec2 uResolution;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  vec2 pointer = (uPointer - 0.5) * vec2(1.4, -1.0);
  float t = uTime * 0.06;
  float n = noise(p * 3.2 + t) * 0.5 + noise(p * 7.0 - t * 1.7) * 0.25;
  float portal = smoothstep(0.82, 0.18, abs(length(p - pointer * 0.1) - 0.36));
  float horizon = smoothstep(-0.34, 0.52, p.y + n * 0.14);
  vec3 voidColor = vec3(0.010, 0.006, 0.025);
  vec3 nebula = vec3(0.28, 0.06, 0.55) * (0.45 + n) + vec3(0.02, 0.55, 0.72) * portal;
  vec3 gold = vec3(1.0, 0.56, 0.12) * pow(portal, 4.0) * 1.7;
  vec3 color = mix(voidColor, nebula, horizon * 0.55) + gold;
  float vignette = smoothstep(1.25, 0.22, length(uv - 0.5));
  outColor = vec4(color * vignette, 0.92);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function program(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const p = gl.createProgram();
  if (!p) throw new Error("Unable to create program");
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(p) ?? "Unknown program error";
    gl.deleteProgram(p);
    throw new Error(message);
  }
  return p;
}

function createParticleData(count: number) {
  const stride = 5;
  const data = new Float32Array(count * stride);
  for (let i = 0; i < count; i++) {
    const seed = (i * 16807 % 2147483647) / 2147483647;
    const ring = i % 97;
    const arm = (i % 7) / 7;
    const radius = Math.pow((i + 0.5) / count, 0.48) * 1.75;
    const angle = arm * Math.PI * 2 + radius * 3.45 + seed * 0.42;
    const height = (seed - 0.5) * 0.9 + Math.sin(radius * 5.0) * 0.1;
    const z = (Math.sin(seed * 31.0) * 0.5 + 0.5) * 1.35 - 0.62;
    const o = i * stride;
    data[o] = Math.cos(angle) * radius;
    data[o + 1] = height;
    data[o + 2] = Math.sin(angle) * radius * 0.62 + z;
    data[o + 3] = seed;
    data[o + 4] = ring / 97;
  }
  return data;
}

export default function MythicWebGLHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false, powerPreference: "high-performance" });
    if (!gl || reduceMotion) {
      canvas.dataset.fallback = "true";
      return;
    }

    let frame = 0;
    let width = 1;
    let height = 1;
    const pointer = { x: 0.5, y: 0.48, tx: 0.5, ty: 0.48 };

    const bgProgram = program(gl, BG_VERTEX, BG_FRAGMENT);
    const particleProgram = program(gl, VERTEX, FRAGMENT);
    const particleCount = Math.min(22000, window.innerWidth < 768 ? 11000 : 22000);
    const particleData = createParticleData(particleCount);
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.STATIC_DRAW);
    const stride = 5 * Float32Array.BYTES_PER_ELEMENT;
    const pos = gl.getAttribLocation(particleProgram, "aPosition");
    const seed = gl.getAttribLocation(particleProgram, "aSeed");
    const ring = gl.getAttribLocation(particleProgram, "aRing");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(seed);
    gl.vertexAttribPointer(seed, 1, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(ring);
    gl.vertexAttribPointer(ring, 1, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
    gl.bindVertexArray(null);

    const uniforms = {
      bgTime: gl.getUniformLocation(bgProgram, "uTime"),
      bgPointer: gl.getUniformLocation(bgProgram, "uPointer"),
      bgResolution: gl.getUniformLocation(bgProgram, "uResolution"),
      time: gl.getUniformLocation(particleProgram, "uTime"),
      pointer: gl.getUniformLocation(particleProgram, "uPointer"),
      resolution: gl.getUniformLocation(particleProgram, "uResolution"),
      pixelRatio: gl.getUniformLocation(particleProgram, "uPixelRatio"),
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width * dpr));
      height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    };

    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.tx = (event.clientX - rect.left) / rect.width;
      pointer.ty = (event.clientY - rect.top) / rect.height;
    };

    const render = (now: number) => {
      const time = now * 0.001;
      pointer.x += (pointer.tx - pointer.x) * 0.055;
      pointer.y += (pointer.ty - pointer.y) * 0.055;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(bgProgram);
      gl.uniform1f(uniforms.bgTime, time);
      gl.uniform2f(uniforms.bgPointer, pointer.x, pointer.y);
      gl.uniform2f(uniforms.bgResolution, width, height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(particleProgram);
      gl.uniform1f(uniforms.time, time);
      gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.pixelRatio, Math.min(window.devicePixelRatio || 1, 2));
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, particleCount);
      gl.bindVertexArray(null);

      frame = requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(bgProgram);
      gl.deleteProgram(particleProgram);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full opacity-90 [mask-image:radial-gradient(circle_at_50%_32%,black,transparent_78%)] data-[fallback=true]:bg-[radial-gradient(circle_at_50%_25%,rgba(168,85,247,0.34),transparent_32%),radial-gradient(circle_at_62%_42%,rgba(34,211,238,0.24),transparent_28%),radial-gradient(circle_at_45%_62%,rgba(251,191,36,0.18),transparent_24%)]"
    />
  );
}
