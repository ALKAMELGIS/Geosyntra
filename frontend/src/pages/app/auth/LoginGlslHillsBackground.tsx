import { useEffect, useRef } from 'react'

const VERT = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
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
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p *= 2.08;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  float asp = u_resolution.x / max(u_resolution.y, 1.0);
  uv.x *= asp;

  float t = u_time * 0.11;

  float h = 0.0;
  h += sin(uv.x * 1.6 + t * 1.05) * 0.09;
  h += sin(uv.x * 2.9 - t * 0.75 + 1.3) * 0.045;
  h += sin(uv.x * 5.1 + t * 0.4) * 0.018;
  h += fbm(vec2(uv.x * 2.8 + t * 0.35, 2.7)) * 0.11;
  h += fbm(vec2(uv.x * 7.2 - t * 0.22, 1.4)) * 0.055;

  float horizon = 0.26 + h;
  float d = uv.y - horizon;

  vec3 skyLo = vec3(0.008, 0.012, 0.022);
  vec3 skyHi = vec3(0.018, 0.04, 0.055);
  vec3 sky = mix(skyLo, skyHi, smoothstep(0.0, 1.0, uv.y));

  float band = sin(uv.y * 14.0 - t * 1.8 + uv.x * 2.6) * 0.5 + 0.5;
  sky += vec3(0.012, 0.08, 0.05) * band * smoothstep(0.32, 0.72, uv.y) * 0.12;

  vec3 hill = vec3(0.012, 0.028, 0.02);
  vec3 hill2 = vec3(0.028, 0.09, 0.055);
  float blendH = smoothstep(-0.04, 0.12, d);
  vec3 col = mix(hill, hill2, smoothstep(-0.02, 0.08, d));
  col = mix(col, sky, blendH);

  float ridge = exp(-pow(d * 72.0, 2.0)) * smoothstep(0.03, -0.02, -d);
  col += vec3(0.08, 0.22, 0.14) * ridge * 0.55;

  vec2 q = v_uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.85;

  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

function createProgram(gl: WebGLRenderingContext) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog)
    return null
  }
  return prog
}

/**
 * Full-viewport WebGL rolling hills (GLSL), inspired by shader-terrain / hills hero backgrounds.
 * Sits behind the login glass UI; pauses when tab hidden or prefers-reduced-motion.
 */
export default function LoginGlslHillsBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) return

    const program = createProgram(gl)
    if (!program) return

    const aPos = gl.getAttribLocation(program, 'a_position')
    const uRes = gl.getUniformLocation(program, 'u_resolution')
    const uTime = gl.getUniformLocation(program, 'u_time')

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)

    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let reduced = prefersReduced
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const onMq = () => {
      reduced = mq.matches
    }
    mq?.addEventListener('change', onMq)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.floor(window.innerWidth * dpr)
      const h = Math.floor(window.innerHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }

    resize()
    window.addEventListener('resize', resize)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(document.documentElement)

    let running = true
    const onVis = () => {
      running = document.visibilityState === 'visible'
    }
    document.addEventListener('visibilitychange', onVis)

    startRef.current = performance.now()
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick)
      if (!running) return

      const t = reduced ? 0 : (now - startRef.current) * 0.001

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(program)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, t)

      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      document.removeEventListener('visibilitychange', onVis)
      mq?.removeEventListener('change', onMq)
      ro?.disconnect()
      window.removeEventListener('resize', resize)
      gl.deleteProgram(program)
      gl.deleteBuffer(buf)
    }
  }, [])

  return <canvas ref={canvasRef} className="login-bg-webgl-canvas" aria-hidden />
}
