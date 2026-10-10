import { onCleanup, onMount } from 'solid-js'

// A small, one-shot effect. No GPU resources or animation loop remain after it ends.
export default function CountdownRipple(props: { onDone: () => void }) {
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let gl: WebGLRenderingContext | null = null
    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    const shaders: WebGLShader[] = []
    let frame = 0
    let timeout: ReturnType<typeof setTimeout> | undefined
    let ended = false

    function dispose() {
      cancelAnimationFrame(frame)
      clearTimeout(timeout)
      motion.removeEventListener('change', finish)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', finish)
      if (gl) {
        gl.deleteBuffer(buffer)
        gl.deleteProgram(program)
        for (const shader of shaders) gl.deleteShader(shader)
        gl.getExtension('WEBGL_lose_context')?.loseContext()
        gl = null
      }
    }
    function finish() {
      if (ended) return
      ended = true
      dispose()
      props.onDone()
    }
    function onVisibility() { if (document.hidden) finish() }
    onCleanup(() => { ended = true; dispose() })

    if (motion.matches || document.hidden) { finish(); return }
    motion.addEventListener('change', finish)
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('webglcontextlost', finish)

    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
      if (!gl) { finish(); return }
      const context = gl
      function compile(type: number, source: string) {
        const shader = context.createShader(type)
        if (!shader) throw new Error('Shader unavailable')
        shaders.push(shader)
        context.shaderSource(shader, source)
        context.compileShader(shader)
        if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) throw new Error('Shader unavailable')
        return shader
      }
      const vertex = compile(gl.VERTEX_SHADER, `
        attribute vec2 position;
        varying vec2 uv;
        void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
      `)
      const fragment = compile(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying vec2 uv;
        uniform float progress;
        uniform vec3 tint;
        void main() {
          vec2 p = (uv - 0.5) * vec2(2.0, 1.0);
          float d = length(p);
          float radius = 0.10 + 0.42 * progress;
          float ring = exp(-pow((d - radius) / 0.045, 2.0));
          float glow = exp(-d * d * 16.0);
          float fade = sin(progress * 3.14159) * (1.0 - progress);
          float alpha = (ring * 0.24 + glow * 0.12) * fade;
          gl_FragColor = vec4(tint * alpha, alpha);
        }
      `)
      program = gl.createProgram()
      buffer = gl.createBuffer()
      if (!program || !buffer) { finish(); return }
      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { finish(); return }
      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      const progress = gl.getUniformLocation(program, 'progress')
      const tint = gl.getUniformLocation(program, 'tint')
      // Canvas colour inherits the current theme rather than introducing an accent.
      const rgb = getComputedStyle(canvas).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [128, 128, 128]
      gl.uniform3f(tint, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(240 * scale)
      canvas.height = Math.round(120 * scale)
      gl.viewport(0, 0, canvas.width, canvas.height)
      const start = performance.now()
      function draw(now: number) {
        if (ended) return
        const elapsed = (now - start) / 2200
        if (elapsed >= 1) { finish(); return }
        context.uniform1f(progress, elapsed)
        context.drawArrays(context.TRIANGLE_STRIP, 0, 4)
        frame = requestAnimationFrame(draw)
      }
      frame = requestAnimationFrame(draw)
      // Also release resources if frame callbacks are suspended.
      timeout = setTimeout(finish, 2300)
    } catch {
      // Countdown completion still works when graphics are unavailable.
      finish()
    }
  })

  return <canvas ref={canvas} class="countdown-ripple" aria-hidden="true" />
}
