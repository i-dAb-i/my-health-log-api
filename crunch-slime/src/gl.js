/* 크런치 슬라임 — WebGL 렌더러
 *
 * 두 가지를 나눠서 그립니다.
 *
 *  본체(슬라임)  ping-pong 프레임버퍼에 담긴 텍스처를 매 프레임 조금씩 warp 해서
 *                덮어씁니다. 변형이 텍스처 자체에 쌓이므로 손을 떼도 돌아오지 않고,
 *                계속 주무르면 색이 이웃 픽셀로 끌려가 점토처럼 섞입니다.
 *
 *  파츠          고체라서 뭉개지면 안 되므로 본체 텍스처에 섞지 않습니다.
 *                스프라이트 아틀라스에서 쿼드로 따로 그리고, 위치와 회전만 옮깁니다.
 */
(function (global) {
  'use strict';

  var MAX_POKES = 6;

  /* ------------------------------------------------------------------ */
  /* 셰이더                                                              */
  /* ------------------------------------------------------------------ */

  var VERT_FULL = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG_COPY = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uSrc;',
    'void main(){ gl_FragColor = texture2D(uSrc, vUv); }'
  ].join('\n');

  // 반죽 패스 — 이전 상태를 조금 밀어서 새 상태로 덮어씁니다.
  var FRAG_KNEAD = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uSrc;',
    'uniform vec4 uA[6];',   // u, v, 반지름, 누름량
    'uniform vec4 uB[6];',   // 끌기x, 끌기y, 소용돌이, 위상
    'uniform float uFirm;',  // 실루엣을 다시 세우는 정도
    'uniform float uSkin;',  // 테두리(껍질)가 버티는 정도
    'uniform float uTexel;',
    '',
    // 이 지점이 덩어리 안쪽 얼마나 깊은지 — 껍질 판정에 씁니다.
    'float coreAt(vec2 p, float r){',
    '  float s = 0.0;',
    '  for(int i = 0; i < 8; i++){',
    '    float a = float(i) * 0.78539816;',
    '    s += texture2D(uSrc, clamp(p + vec2(cos(a), sin(a)) * r, 0.0, 1.0)).a;',
    '  }',
    '  return s * 0.125;',
    '}',
    '',
    'vec2 disp(vec2 uv){',
    '  vec2 d = vec2(0.0);',
    '  for(int i = 0; i < 6; i++){',
    '    if(uA[i].z < 0.002) continue;',
    '    vec2 rel = uv - uA[i].xy;',
    '    float R = uA[i].z;',
    '    float x2 = dot(rel, rel) / (R * R);',
    '    if(x2 > 6.25) continue;',
    '    float ang = atan(rel.y, rel.x);',
    // 완벽한 동심원이 되지 않도록 각도로 세기를 흔들어 줍니다.
    '    float w = exp(-x2 * 1.5) * (0.78 + 0.22 * sin(ang * 3.0 + uB[i].w));',
    '    vec2 nrel = rel / R;',
    // 소용돌이 — 발산이 0이라 색을 부풀리지 않고 섞기만 합니다(반죽의 핵심).
    '    d -= vec2(-nrel.y, nrel.x) * uA[i].w * w * uB[i].z;',
    '    d -= nrel * uA[i].w * w * 0.16;',    // 아주 약한 퍼짐 — 누르는 촉감
    '    d -= uB[i].xy * w;',                 // 끌기 — 손가락 간 방향으로 끌려갑니다
    '  }',
    '  return d;',
    '}',
    '',
    'void main(){',
    // 그림 테두리는 슬라임의 껍질입니다. 가장자리에 가까운 픽셀일수록 붙들려서
    // 잘 밀리지 않으므로, 안쪽만 뭉개지고 실루엣은 오래 버팁니다.
    '  float core = smoothstep(0.22, 0.94, coreAt(vUv, uTexel * 17.0));',
    '  vec2 d = disp(vUv) * mix(1.0 - uSkin * 0.90, 1.0, core);',
    '  vec4 c = texture2D(uSrc, clamp(vUv + d, 0.0, 1.0));',
    // 알파까지 계속 번지면 실루엣이 안개처럼 사라지므로 아주 약하게 다시 세웁니다.
    '  float a = clamp((c.a - 0.5) * uFirm + 0.5, 0.0, 1.0);',
    '  vec3 rgb = c.a > 0.002 ? c.rgb * (a / c.a) : vec3(0.0);',
    '  gl_FragColor = vec4(rgb, a);',
    '}'
  ].join('\n');

  var FRAG_BODY = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uBody;',
    'uniform vec2  uFit;',
    'uniform float uBreath;',
    'uniform float uGloss;',
    'uniform float uRim;',
    'uniform vec3  uTint;',
    'uniform float uTintAmt;',
    'uniform float uTexel;',
    'uniform float uShadow;',
    '',
    'float bodyA(vec2 p){',
    '  if(p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0;',
    '  return texture2D(uBody, p).a;',
    '}',
    '',
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
    'void main(){',
    '  vec2 base = (vUv - 0.5) * uFit + 0.5;',
    '  base.y = 1.0 - base.y;',
    '  vec2 uv = 0.5 + (base - 0.5) * (1.0 - uBreath * 0.012);',
    '',
    '  float a = bodyA(uv);',
    '',
    '  float sh = 0.0;',
    '  if(uShadow > 0.001){',
    '    sh = smoothstep(0.06, 0.72, thickAt(uv - vec2(0.016, 0.024), uTexel * 30.0)) * uShadow;',
    '  }',
    '  if(a < 0.004 && sh < 0.004){ gl_FragColor = vec4(0.0); return; }',
    '',
    '  float tkRaw = thickAt(uv, uTexel * 24.0) * 0.62 + thickAt(uv, uTexel * 9.0) * 0.38;',
    '  float tk = smoothstep(0.06, 0.86, tkRaw * 0.72 + a * 0.28);',
    '',
    '  float e1 = uTexel * 15.0, e2 = uTexel * 5.0;',
    '  float gx = (bodyA(uv - vec2(e1, 0.0)) - bodyA(uv + vec2(e1, 0.0))) * 0.62',
    '           + (bodyA(uv - vec2(e2, 0.0)) - bodyA(uv + vec2(e2, 0.0))) * 0.38;',
    '  float gy = (bodyA(uv - vec2(0.0, e1)) - bodyA(uv + vec2(0.0, e1))) * 0.62',
    '           + (bodyA(uv - vec2(0.0, e2)) - bodyA(uv + vec2(0.0, e2))) * 0.38;',
    '  vec3 N = normalize(vec3(gx * 3.1, -gy * 3.1, 0.72));',
    '',
    '  vec4 bodyC = texture2D(uBody, clamp(uv, 0.0, 1.0));',
    '  vec3 col = bodyC.a > 0.002 ? bodyC.rgb / bodyC.a : bodyC.rgb;',
    '  col = mix(col, uTint, uTintAmt);',
    '',
    '  col *= mix(0.70, 1.07, tk);',
    '  col = mix(col, uTint * 0.90, (1.0 - tk) * uRim * 0.80);',
    '  col += uTint * smoothstep(0.42, 0.98, uv.y) * tk * uGloss * 0.13;',
    '',
    '  vec3 L = normalize(vec3(-0.44, 0.60, 0.67));',
    '  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));',
    '  col += vec3(pow(max(dot(N, H), 0.0), mix(9.0, 62.0, uGloss)) * uGloss * 1.75);',
    '  col += vec3(smoothstep(0.58, 0.02, uv.y) * tk * uGloss * 0.22);',
    '',
    '  float outA = a + sh * (1.0 - a);',
    '  gl_FragColor = vec4(col * a + vec3(0.30, 0.24, 0.30) * (sh * (1.0 - a)), outA);',
    '}'
  ].join('\n');

  var VERT_PARTS = [
    'attribute vec2 aTex;',   // 본체 텍스처 좌표 (v 는 위 → 아래)
    'attribute vec2 aAtlas;',
    'uniform vec2 uFit;',
    'uniform float uBreath;',
    'varying vec2 vAtlas;',
    'varying vec2 vTex;',
    'void main(){',
    '  vAtlas = aAtlas;',
    '  vTex = aTex;',
    '  vec2 t = 0.5 + (aTex - 0.5) / (1.0 - uBreath * 0.012);',
    '  gl_Position = vec4((t.x - 0.5) * 2.0 / uFit.x, (0.5 - t.y) * 2.0 / uFit.y, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG_PARTS = [
    'precision highp float;',
    'varying vec2 vAtlas;',
    'varying vec2 vTex;',
    'uniform sampler2D uAtlas;',
    'uniform sampler2D uBody;',
    'uniform vec3  uTint;',
    'uniform float uTintAmt;',
    'uniform float uDepth;',
    'uniform float uGloss;',
    'uniform float uTexel;',
    'void main(){',
    '  vec4 c = texture2D(uAtlas, vAtlas);',
    '  if(c.a < 0.004) discard;',
    '  float m = texture2D(uBody, clamp(vTex, 0.0, 1.0)).a;',
    '  float vis = smoothstep(0.04, 0.30, m);',    // 슬라임이 남아 있는 곳에서만 보입니다
    '  if(vis < 0.004) discard;',
    '  vec3 rgb = c.rgb / max(c.a, 0.002);',
    '  rgb = mix(rgb, uTint * 0.94, uDepth * 0.30 + uTintAmt * 0.45);',
    '  rgb = mix(rgb, vec3(dot(rgb, vec3(0.3333))), uDepth * 0.10);',
    // 본체와 같은 광택을 얹어 표면 아래에 잠긴 것처럼 보이게 합니다.
    '  float e = uTexel * 13.0;',
    '  float gx = texture2D(uBody, clamp(vTex - vec2(e, 0.0), 0.0, 1.0)).a',
    '           - texture2D(uBody, clamp(vTex + vec2(e, 0.0), 0.0, 1.0)).a;',
    '  float gy = texture2D(uBody, clamp(vTex - vec2(0.0, e), 0.0, 1.0)).a',
    '           - texture2D(uBody, clamp(vTex + vec2(0.0, e), 0.0, 1.0)).a;',
    '  vec3 N = normalize(vec3(gx * 3.0, -gy * 3.0, 0.72));',
    '  vec3 H = normalize(normalize(vec3(-0.44, 0.60, 0.67)) + vec3(0.0, 0.0, 1.0));',
    '  rgb += vec3(pow(max(dot(N, H), 0.0), mix(9.0, 62.0, uGloss)) * uGloss * 0.85);',
    '  float a = c.a * vis * (0.96 - uDepth * 0.26);',
    '  gl_FragColor = vec4(rgb * a, a);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ */

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('셰이더 컴파일 실패: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  function link(gl, vs, fs, attribs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    attribs.forEach(function (name, i) { gl.bindAttribLocation(p, i, name); });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('셰이더 링크 실패: ' + gl.getProgramInfoLog(p));
    }
    p.u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      var nm = info.name.replace(/\[0\]$/, '');
      p.u[nm] = gl.getUniformLocation(p, info.name);
    }
    return p;
  }

  function Renderer(canvas, opts) {
    opts = opts || {};
    var attrs = {
      alpha: true, premultipliedAlpha: true, antialias: true,
      preserveDrawingBuffer: true, powerPreference: 'high-performance'
    };
    var gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs) ||
             canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('이 브라우저에서는 WebGL을 쓸 수 없어요.');

    this.canvas = canvas;
    this.gl = gl;
    this.dprCap = opts.dprCap || 2;
    this.simCap = opts.simCap || 1024;

    this.pCopy  = link(gl, VERT_FULL, FRAG_COPY,  ['aPos']);
    this.pKnead = link(gl, VERT_FULL, FRAG_KNEAD, ['aPos']);
    this.pBody  = link(gl, VERT_FULL, FRAG_BODY,  ['aPos']);
    this.pParts = link(gl, VERT_PARTS, FRAG_PARTS, ['aTex', 'aAtlas']);

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.partBuf = gl.createBuffer();
    this.partCount = 0;

    this.texOrig = this._tex();
    this.texAtlas = this._tex();
    this.hasAtlas = false;
    this.simSize = 0;
    this.fb = [null, null];
    this.tex = [null, null];
    this.cur = 0;
    this.hasBody = false;

    this.maskSize = 96;
    this.maskFb = null; this.maskTex = null;
    this.maskPixels = new Uint8Array(this.maskSize * this.maskSize * 4);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.params = {
      gloss: 0.55, rim: 0.4, tint: [0.55, 0.91, 1.0], tintAmt: 0.18,
      depth: 0.55, zoom: 0.88, shadow: 0.2, firm: 1.032, crust: 0.72,
      bg: [0.99, 0.95, 0.97, 1]
    };
    this.resize();
  }

  Renderer.prototype._tex = function (w, h) {
    var gl = this.gl;
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return t;
  };

  Renderer.prototype._target = function (size) {
    var gl = this.gl;
    var t = this._tex(size, size);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('프레임버퍼를 만들지 못했어요.');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb: f, tex: t };
  };

  Renderer.prototype._fullscreen = function (prog) {
    var gl = this.gl;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /** 원본 이미지를 올리고 반죽 버퍼를 새로 만듭니다. */
  Renderer.prototype.setBody = function (source) {
    var gl = this.gl;
    var size = Math.min(source.width || 512, this.simCap);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texOrig);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    if (this.simSize !== size) {
      for (var i = 0; i < 2; i++) {
        if (this.fb[i]) { gl.deleteFramebuffer(this.fb[i]); gl.deleteTexture(this.tex[i]); }
        var t = this._target(size);
        this.fb[i] = t.fb; this.tex[i] = t.tex;
      }
      if (!this.maskFb) {
        var m = this._target(this.maskSize);
        this.maskFb = m.fb; this.maskTex = m.tex;
      }
      this.simSize = size;
    }
    this.hasBody = true;
    this.reset();
  };

  /** 반죽을 원래 모습으로 되돌립니다. */
  Renderer.prototype.reset = function () {
    if (!this.hasBody) return;
    var gl = this.gl;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb[0]);
    gl.viewport(0, 0, this.simSize, this.simSize);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.pCopy);
    gl.uniform1i(this.pCopy.u.uSrc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texOrig);
    this._fullscreen(this.pCopy);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.BLEND);
    this.cur = 0;
    this._restoreViewport();
  };

  /** 한 프레임 분량의 변형을 텍스처에 영구히 새깁니다. */
  Renderer.prototype.knead = function (sim) {
    if (!this.hasBody || !sim.active()) return false;
    var gl = this.gl;
    var u = sim.uniforms();
    var next = 1 - this.cur;

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb[next]);
    gl.viewport(0, 0, this.simSize, this.simSize);
    gl.useProgram(this.pKnead);
    gl.uniform1i(this.pKnead.u.uSrc, 0);
    gl.uniform4fv(this.pKnead.u.uA, u.A);
    gl.uniform4fv(this.pKnead.u.uB, u.B);
    gl.uniform1f(this.pKnead.u.uFirm, this.params.firm);
    // 값 하나라도 NaN 이면 텍스처 전체가 날아가므로 여기서 막습니다.
    var crust = +this.params.crust;
    gl.uniform1f(this.pKnead.u.uSkin, isFinite(crust) ? crust : 0.7);
    gl.uniform1f(this.pKnead.u.uTexel, 1 / this.simSize);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
    this._fullscreen(this.pKnead);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.BLEND);

    this.cur = next;
    this._restoreViewport();
    return true;
  };

  /** 지금 상태의 알파를 작게 읽어옵니다(어디를 눌렀는지 판정용). */
  Renderer.prototype.readMask = function () {
    if (!this.hasBody || !this.maskFb) return null;
    var gl = this.gl, n = this.maskSize;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFb);
    gl.viewport(0, 0, n, n);
    gl.useProgram(this.pCopy);
    gl.uniform1i(this.pCopy.u.uSrc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
    this._fullscreen(this.pCopy);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, this.maskPixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.BLEND);
    this._restoreViewport();

    var out = new Uint8Array(n * n);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        // readPixels 는 아래에서 위로 읽으므로 뒤집습니다.
        out[y * n + x] = this.maskPixels[((n - 1 - y) * n + x) * 4 + 3];
      }
    }
    return { data: out, w: n, h: n };
  };

  Renderer.prototype.setPartAtlas = function (canvas) {
    var gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texAtlas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.hasAtlas = true;
  };

  /** [tx, ty, ax, ay] × 6정점 × 파츠수 */
  Renderer.prototype.setPartGeometry = function (data, count) {
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.partCount = count;
  };

  Renderer.prototype.setParams = function (p) {
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) this.params[k] = p[k];
  };

  Renderer.prototype._restoreViewport = function () {
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  Renderer.prototype.resize = function () {
    var cv = this.canvas;
    var dpr = Math.min(global.devicePixelRatio || 1, this.dprCap);
    var w = Math.max(1, Math.round((cv.clientWidth || 400) * dpr));
    var h = Math.max(1, Math.round((cv.clientHeight || 400) * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    this.gl.viewport(0, 0, w, h);
    return { w: w, h: h };
  };

  Renderer.prototype._fit = function () {
    var cv = this.canvas;
    var ar = (cv.width || 1) / (cv.height || 1);
    var z = this.params.zoom;
    return ar >= 1 ? [ar / z, 1 / z] : [1 / z, (1 / ar) / z];
  };

  Renderer.prototype.screenToTex = function (nx, ny) {
    var f = this._fit();
    return { u: (nx - 0.5) * f[0] + 0.5, v: (ny - 0.5) * f[1] + 0.5 };
  };

  Renderer.prototype.render = function (sim) {
    var gl = this.gl, p = this.params, bg = p.bg;
    gl.clearColor(bg[0] * bg[3], bg[1] * bg[3], bg[2] * bg[3], bg[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.hasBody) return;

    var f = this._fit();
    var breath = sim.breath();
    var texel = 1 / this.simSize;

    // 본체
    var b = this.pBody;
    gl.useProgram(b);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
    gl.uniform1i(b.u.uBody, 0);
    gl.uniform2f(b.u.uFit, f[0], f[1]);
    gl.uniform1f(b.u.uBreath, breath);
    gl.uniform1f(b.u.uGloss, p.gloss);
    gl.uniform1f(b.u.uRim, p.rim);
    gl.uniform3f(b.u.uTint, p.tint[0], p.tint[1], p.tint[2]);
    gl.uniform1f(b.u.uTintAmt, p.tintAmt);
    gl.uniform1f(b.u.uTexel, texel);
    gl.uniform1f(b.u.uShadow, p.shadow);
    this._fullscreen(b);

    // 파츠
    if (this.partCount > 0 && this.hasAtlas) {
      var q = this.pParts;
      gl.useProgram(q);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texAtlas);
      gl.uniform1i(q.u.uAtlas, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
      gl.uniform1i(q.u.uBody, 0);
      gl.uniform2f(q.u.uFit, f[0], f[1]);
      gl.uniform1f(q.u.uBreath, breath);
      gl.uniform3f(q.u.uTint, p.tint[0], p.tint[1], p.tint[2]);
      gl.uniform1f(q.u.uTintAmt, p.tintAmt);
      gl.uniform1f(q.u.uDepth, p.depth);
      gl.uniform1f(q.u.uGloss, p.gloss);
      gl.uniform1f(q.u.uTexel, texel);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
      gl.enableVertexAttribArray(0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.drawArrays(gl.TRIANGLES, 0, this.partCount * 6);
      gl.disableVertexAttribArray(1);
    }
  };

  global.CS = global.CS || {};
  global.CS.Renderer = {
    MAX_POKES: MAX_POKES,
    create: function (canvas, opts) { return new Renderer(canvas, opts); }
  };
})(window);
