/* 크런치 슬라임 — WebGL 렌더러
 * 캐릭터 텍스처와 파츠 레이어를 같은 변형 필드로 밀고 당겨서
 * 하나의 젤리 덩어리처럼 보이게 만듭니다.
 */
(function (global) {
  'use strict';

  var VERT = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uBody;',
    'uniform sampler2D uMix;',
    'uniform vec4  uPokes[6];',    // xy = 위치, z = 세기, w = 반지름
    'uniform vec2  uFit;',
    'uniform float uSquash;',
    'uniform float uTime;',
    'uniform float uWobble;',
    'uniform float uGloss;',
    'uniform float uRim;',
    'uniform vec3  uTint;',
    'uniform float uTintAmt;',
    'uniform float uDepth;',
    'uniform float uHasMix;',
    'uniform float uTexel;',
    'uniform float uShadow;',
    '',
    'float bodyA(vec2 p){',
    '  if(p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0;',
    '  return texture2D(uBody, p).a;',
    '}',
    '',
    // 링 모양으로 알파를 훑어서 "이 지점이 덩어리 안쪽 얼마나 깊은가"를 구합니다.
    'float thickAt(vec2 p, float r){',
    '  float s = 0.0;',
    '  for(int i = 0; i < 10; i++){',
    '    float a = float(i) * 0.62831853;',
    '    float rr = (mod(float(i), 2.0) < 0.5) ? r : r * 0.52;',
    '    s += bodyA(p + vec2(cos(a), sin(a)) * rr);',
    '  }',
    '  return s * 0.1;',
    '}',
    '',
    'vec2 displace(vec2 uv){',
    '  vec2 d = vec2(0.0);',
    '  for(int i = 0; i < 6; i++){',
    '    vec4 pk = uPokes[i];',
    '    if(abs(pk.z) < 0.0004) continue;',
    '    vec2 rel = uv - pk.xy;',
    '    float r = length(rel);',
    '    float R = max(pk.w, 0.001);',
    '    float x = r / R;',
    '    if(x > 2.6) continue;',
    '    float w = exp(-x * x * 1.45);',
    '    vec2 dir = r > 0.00001 ? rel / r : vec2(0.0);',
    '    d += dir * pk.z * w * x * 2.35;',   // 눌린 자리를 둘러싼 찌그러짐
    '    d += rel * pk.z * w * 0.70;',       // 안쪽으로 빨려드는 느낌
    '  }',
    '  return d;',
    '}',
    '',
    'vec2 warp(vec2 uv){',
    '  vec2 p = uv;',
    '  vec2 sq = vec2(1.0 / (1.0 + uSquash * 0.34), 1.0 / max(0.25, 1.0 - uSquash * 0.28));',
    '  p = 0.5 + (p - 0.5) * sq;',
    '  float amp = uWobble * 0.0075;',
    '  p += vec2(sin(p.y * 13.0 + uTime * 4.9), cos(p.x * 11.0 + uTime * 3.7)) * amp;',
    '  p += displace(p);',
    '  return p;',
    '}',
    '',
    'void main(){',
    '  vec2 base = (vUv - 0.5) * uFit + 0.5;',
    '  base.y = 1.0 - base.y;',
    '  vec2 uv = warp(base);',
    '',
    '  float a = bodyA(uv);',
    '',
    // 그림자를 먼저 — 본체가 없는 곳에서도 필요합니다.
    '  float sh = 0.0;',
    '  if(uShadow > 0.001){',
    '    vec2 back = uv - vec2(0.016, 0.024);',   // 오른쪽 아래로 드리웁니다
    '    sh = smoothstep(0.06, 0.72, thickAt(back, uTexel * 30.0)) * uShadow;',
    '  }',
    '  if(a < 0.004 && sh < 0.004){ gl_FragColor = vec4(0.0); return; }',
    '',
    // 덩어리의 두께감 — 젤리 볼륨의 핵심
    '  float tkRaw = thickAt(uv, uTexel * 24.0) * 0.62 + thickAt(uv, uTexel * 9.0) * 0.38;',
    '  float tk = smoothstep(0.06, 0.86, tkRaw * 0.72 + a * 0.28);',
    '',
    // 실루엣 기울기로 만든 가짜 법선 — 넓게 + 좁게 두 번 보고 섞습니다.
    '  float e1 = uTexel * 15.0, e2 = uTexel * 5.0;',
    '  float gx = (bodyA(uv - vec2(e1, 0.0)) - bodyA(uv + vec2(e1, 0.0))) * 0.62',
    '           + (bodyA(uv - vec2(e2, 0.0)) - bodyA(uv + vec2(e2, 0.0))) * 0.38;',
    '  float gy = (bodyA(uv - vec2(0.0, e1)) - bodyA(uv + vec2(0.0, e1))) * 0.62',
    '           + (bodyA(uv - vec2(0.0, e2)) - bodyA(uv + vec2(0.0, e2))) * 0.38;',
    '  vec3 N = normalize(vec3(gx * 3.1, -gy * 3.1, 0.72));',
    '',
    '  vec4 bodyC = texture2D(uBody, clamp(uv, 0.0, 1.0));',
    '  vec3 col = bodyC.a > 0.001 ? bodyC.rgb / max(bodyC.a, 0.001) : bodyC.rgb;',
    '',
    // 파츠 레이어 — 살짝 다르게 흘러서 "슬라임 속에 떠 있는" 느낌
    '  if(uHasMix > 0.5){',
    '    vec2 muv = 0.5 + (uv - 0.5) * (1.0 + uDepth * 0.05) + displace(uv) * uDepth * 0.45;',
    '    vec4 mc = texture2D(uMix, clamp(muv, 0.0, 1.0));',
    '    vec3 mrgb = mc.a > 0.001 ? mc.rgb / max(mc.a, 0.001) : mc.rgb;',
    '    float sink = uDepth * 0.55;',                   // 깊을수록 슬라임 색에 잠깁니다
    '    mrgb = mix(mrgb, uTint * 0.94, sink * 0.30 + uTintAmt * 0.45);',
    '    mrgb = mix(mrgb, vec3(dot(mrgb, vec3(0.33))), sink * 0.10);',
    '    col = mix(col, mrgb, mc.a * (0.95 - sink * 0.30) * step(0.02, a));',
    '  }',
    '',
    '  col = mix(col, uTint, uTintAmt);',
    '',
    // 두께 음영: 가장자리는 진하고 어둡게, 안쪽은 환하게
    '  col *= mix(0.70, 1.07, tk);',
    '  col = mix(col, uTint * 0.90, (1.0 - tk) * uRim * 0.80);',
    '',
    // 아래쪽에서 올라오는 반사광
    '  col += uTint * smoothstep(0.42, 0.98, uv.y) * tk * uGloss * 0.13;',
    '',
    // 젤리 하이라이트
    '  vec3 L = normalize(vec3(-0.44, 0.60, 0.67));',
    '  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));',
    '  float spec = pow(max(dot(N, H), 0.0), mix(9.0, 62.0, uGloss)) * uGloss * 1.75;',
    '  col += vec3(spec);',
    '',
    // 위쪽에 넓게 앉는 광택 한 덩어리
    '  float sheen = smoothstep(0.58, 0.02, uv.y) * tk * uGloss * 0.22;',
    '  col += vec3(sheen);',
    '',
    '  float outA = a + sh * (1.0 - a);',
    '  vec3 shadowCol = vec3(0.30, 0.24, 0.30);',
    '  vec3 outRgb = col * a + shadowCol * (sh * (1.0 - a));',
    '  gl_FragColor = vec4(outRgb, outA);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('셰이더 컴파일 실패: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  function Renderer(canvas, opts) {
    opts = opts || {};
    var attrs = { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' };
    var gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('이 브라우저에서는 WebGL을 쓸 수 없어요.');

    this.canvas = canvas;
    this.gl = gl;
    this.dprCap = opts.dprCap || 2;

    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('셰이더 링크 실패: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    ['uBody', 'uMix', 'uPokes', 'uFit', 'uSquash', 'uTime', 'uWobble', 'uGloss',
     'uRim', 'uTint', 'uTintAmt', 'uDepth', 'uHasMix', 'uTexel', 'uShadow'
    ].forEach(function (n) { this.u[n] = gl.getUniformLocation(prog, n); }, this);

    this.texBody = this._makeTex();
    this.texMix = this._makeTex();
    this.texSize = 512;
    this.hasMix = 0;

    gl.uniform1i(this.u.uBody, 0);
    gl.uniform1i(this.u.uMix, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texBody);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texMix);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.params = {
      gloss: 0.55, rim: 0.4, tint: [0.55, 0.91, 1.0], tintAmt: 0.18,
      depth: 0.55, wobble: 0.45, zoom: 0.88, shadow: 0.2,
      bg: [0.99, 0.95, 0.97, 1]
    };
    this.resize();
  }

  Renderer.prototype._makeTex = function () {
    var gl = this.gl;
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return t;
  };

  Renderer.prototype._upload = function (tex, source) {
    var gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  };

  Renderer.prototype.setBody = function (source) {
    this.gl.activeTexture(this.gl.TEXTURE0);
    this._upload(this.texBody, source);
    this.texSize = source.width || 512;
  };

  Renderer.prototype.setMix = function (source) {
    this.gl.activeTexture(this.gl.TEXTURE1);
    if (source) { this._upload(this.texMix, source); this.hasMix = 1; }
    else { this.hasMix = 0; }
  };

  Renderer.prototype.setParams = function (p) {
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) this.params[k] = p[k];
  };

  Renderer.prototype.resize = function () {
    var cv = this.canvas;
    var dpr = Math.min(global.devicePixelRatio || 1, this.dprCap);
    var w = Math.max(1, Math.round((cv.clientWidth || 400) * dpr));
    var h = Math.max(1, Math.round((cv.clientHeight || 400) * dpr));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w; cv.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    return { w: w, h: h };
  };

  /** 화면 좌표(0~1) → 이미지 텍스처 좌표(0~1). 어디를 눌렀는지 알아내는 데 씁니다. */
  Renderer.prototype.screenToTex = function (nx, ny) {
    var f = this._fit();
    return { u: (nx - 0.5) * f[0] + 0.5, v: (ny - 0.5) * f[1] + 0.5 };
  };

  Renderer.prototype._fit = function () {
    var cv = this.canvas;
    var ar = (cv.width || 1) / (cv.height || 1);
    var z = this.params.zoom;
    return ar >= 1 ? [ar / z, 1 / z] : [1 / z, (1 / ar) / z];
  };

  Renderer.prototype.render = function (sim) {
    var gl = this.gl, u = this.u, p = this.params;
    var bg = p.bg;
    gl.clearColor(bg[0] * bg[3], bg[1] * bg[3], bg[2] * bg[3], bg[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    var f = this._fit();
    gl.uniform2f(u.uFit, f[0], f[1]);
    gl.uniform4fv(u.uPokes, sim.uniforms());
    gl.uniform1f(u.uSquash, sim.squash.value);
    gl.uniform1f(u.uTime, sim.time);
    gl.uniform1f(u.uWobble, p.wobble * (0.35 + 0.65 * Math.abs(sim.idle())));
    gl.uniform1f(u.uGloss, p.gloss);
    gl.uniform1f(u.uRim, p.rim);
    gl.uniform3f(u.uTint, p.tint[0], p.tint[1], p.tint[2]);
    gl.uniform1f(u.uTintAmt, p.tintAmt);
    gl.uniform1f(u.uDepth, p.depth);
    gl.uniform1f(u.uHasMix, this.hasMix);
    gl.uniform1f(u.uTexel, 1 / this.texSize);
    gl.uniform1f(u.uShadow, p.shadow);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  global.CS = global.CS || {};
  global.CS.Renderer = {
    create: function (canvas, opts) { return new Renderer(canvas, opts); }
  };
})(window);
