/* 크런치 슬라임 — 앱
 * UI · 파츠 배치 · 포인터 입력 · 저장을 담당합니다.
 */
(function (global) {
  'use strict';
  var Parts = global.CS.Parts, Audio = global.CS.Audio,
      Img = global.CS.ImageUtil, Physics = global.CS.Physics, GL = global.CS.Renderer;

  var $ = function (id) { return document.getElementById(id); };
  var STORE_KEY = 'crunch-slime.v1';

  /* ------------------------------------------------------------------ */
  /* 상태                                                                */
  /* ------------------------------------------------------------------ */
  var S = {
    gloss: 0.55, rim: 0.40, jelly: 0.60, wobble: 0.45,
    tintAmt: 0.18, tint: '#8be9ff',
    parts: ['strawberry', 'heart', 'bead', 'star'],
    tab: 'fruit',
    count: 18, size: 1.0, depth: 0.55, spread: 0.40, seed: 12345,
    skin: 'jelly', sound: 'crunch', volume: 0.75, reverb: 0.22, muted: false, partSound: true,
    bg: '#fdf3f7',
    removeBg: false, tolerance: 28, trim: true
  };

  var SKINS = [
    { id: 'jelly',  name: '젤리',   v: { gloss: 0.55, rim: 0.40, jelly: 0.60, wobble: 0.45, tintAmt: 0.18, tint: '#8be9ff' } },
    { id: 'clear',  name: '클리어', v: { gloss: 0.88, rim: 0.62, jelly: 0.50, wobble: 0.55, tintAmt: 0.10, tint: '#bfefff' } },
    { id: 'butter', name: '버터',   v: { gloss: 0.28, rim: 0.20, jelly: 0.82, wobble: 0.24, tintAmt: 0.30, tint: '#ffe6a8' } },
    { id: 'crunch', name: '크런치', v: { gloss: 0.66, rim: 0.34, jelly: 0.34, wobble: 0.30, tintAmt: 0.12, tint: '#ffd9ec' } },
    { id: 'cloud',  name: '구름',   v: { gloss: 0.16, rim: 0.52, jelly: 0.92, wobble: 0.62, tintAmt: 0.34, tint: '#e7ddff' } }
  ];

  var BGS = [
    { name: '크림',   c: '#fdf3f7' }, { name: '라벤더', c: '#efeaff' },
    { name: '민트',   c: '#e6f7f1' }, { name: '피치',   c: '#fff0e6' },
    { name: '하늘',   c: '#e8f3ff' }, { name: '밤',     c: '#241d2e' },
    { name: '투명',   c: 'transparent' }
  ];

  /* ------------------------------------------------------------------ */
  /* 유틸                                                                */
  /* ------------------------------------------------------------------ */
  function rng(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hex2rgb(h) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
    return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1];
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function download(blob, name) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return true;
    } catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ */
  /* 슬라임 본체                                                          */
  /* ------------------------------------------------------------------ */
  var renderer = null, sim = Physics.create();
  var body = null;        // { canvas, mask }
  var alphaMap = null;    // { data:Uint8Array, w, h } — 어디를 눌렀는지 판정용
  var mixCanvas = null;
  var pointers = {};      // pointerId → { pokeId, lastX, lastY, t }
  var hasImage = false;

  function buildAlphaMap(cv) {
    var w = 128, h = 128;
    var t = document.createElement('canvas');
    t.width = w; t.height = h;
    var c = t.getContext('2d', { willReadFrequently: true });
    c.drawImage(cv, 0, 0, w, h);
    var d = c.getImageData(0, 0, w, h).data;
    var out = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) out[i] = d[i * 4 + 3];
    return { data: out, w: w, h: h };
  }

  function alphaAt(u, v) {
    if (!alphaMap || u < 0 || v < 0 || u > 1 || v > 1) return 0;
    var x = clamp(Math.floor(u * alphaMap.w), 0, alphaMap.w - 1);
    var y = clamp(Math.floor(v * alphaMap.h), 0, alphaMap.h - 1);
    return alphaMap.data[y * alphaMap.w + x];
  }

  /** 활성 파츠를 마스크 안쪽에 흩뿌려 파츠 레이어를 만듭니다. */
  function buildMixLayer() {
    if (!body) return;
    var side = body.canvas.width;
    if (!mixCanvas) mixCanvas = document.createElement('canvas');
    mixCanvas.width = mixCanvas.height = side;
    var ctx = mixCanvas.getContext('2d');
    ctx.clearRect(0, 0, side, side);

    var ids = S.parts.filter(function (id) { return !!Parts.byId(id); });
    if (!ids.length || S.count <= 0) { renderer.setMix(null); return; }

    var pts = body.mask.points;
    if (!pts.length) { renderer.setMix(null); return; }

    var rand = rng(S.seed);
    var base = side * 0.042 * S.size;
    var placed = [];

    for (var i = 0; i < S.count; i++) {
      var id = ids[Math.floor(rand() * ids.length)];
      var tries = 0, pt = null, r = base * (0.72 + rand() * 0.66);
      // 서로 심하게 겹치지 않도록 몇 번 다시 뽑습니다.
      while (tries++ < 22) {
        var cand = pts[Math.floor(rand() * pts.length)];
        // 깊은 곳일수록 큰 파츠가 들어갈 수 있습니다.
        var room = (cand.depth / body.mask.maxDepth);
        if (room < 0.12) continue;
        // 퍼짐이 낮으면 가장자리 쪽을 더 자주 고릅니다(가운데 얼굴을 덜 가리게).
        var dc = Math.sqrt(Math.pow(cand.u - 0.5, 2) + Math.pow(cand.v - 0.5, 2));
        var accept = S.spread + (1 - S.spread) * clamp(dc / 0.40, 0, 1);
        if (rand() > accept) continue;
        var cx = cand.u * side, cy = cand.v * side;
        var ok = true;
        for (var j = 0; j < placed.length; j++) {
          var dx = placed[j].x - cx, dy = placed[j].y - cy;
          if (dx * dx + dy * dy < Math.pow((placed[j].r + r) * 0.82, 2)) { ok = false; break; }
        }
        if (ok) { pt = { x: cx, y: cy, r: Math.min(r, base * 1.5 * (0.4 + room)) }; break; }
      }
      if (!pt) continue;
      placed.push(pt);

      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.globalAlpha = 0.88 + rand() * 0.12;
      Parts.draw(ctx, id, pt.r, Math.floor(rand() * 8), (rand() - 0.5) * Math.PI * 2);
      ctx.restore();
    }

    // 실루엣 밖으로 삐져나온 부분을 잘라냅니다.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(body.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    renderer.setMix(mixCanvas);
  }

  function applyImage(sourceCanvasOrImg) {
    var prepared = Img.prepare(sourceCanvasOrImg, {
      removeBg: S.removeBg, tolerance: S.tolerance, trim: S.trim
    });
    body = prepared;
    alphaMap = buildAlphaMap(body.canvas);
    renderer.setBody(body.canvas);
    buildMixLayer();
    hasImage = true;
    $('dropzone').hidden = true;
    $('stageHint').hidden = false;
    $('glcanvas').classList.remove('empty');
    setTimeout(function () { $('stageHint').hidden = true; }, 6000);
  }

  var rawSource = null;   // 원본(설정을 바꿔도 다시 처리할 수 있게 보관)
  function loadSource(src) {
    rawSource = src;
    applyImage(src);
  }
  function reprocess() { if (rawSource) applyImage(rawSource); }

  /* ------------------------------------------------------------------ */
  /* 입력                                                                */
  /* ------------------------------------------------------------------ */
  function canvasUV(ev) {
    var cv = $('glcanvas');
    var r = cv.getBoundingClientRect();
    var nx = (ev.clientX - r.left) / r.width;
    var ny = (ev.clientY - r.top) / r.height;
    return renderer.screenToTex(nx, ny);
  }

  function pressStrength() { return 0.040 + S.jelly * 0.055; }
  function pressRadius() { return 0.13 + S.jelly * 0.07; }

  function onDown(ev) {
    if (!hasImage) return;
    Audio.init();
    var p = canvasUV(ev);
    if (alphaAt(p.u, p.v) < 24) return;      // 슬라임 바깥은 무시
    $('glcanvas').setPointerCapture(ev.pointerId);
    var force = ev.pressure && ev.pressure > 0 && ev.pointerType !== 'mouse' ? (0.5 + ev.pressure) : 1;
    var id = sim.poke(p.u, p.v, pressStrength() * force, pressRadius());
    pointers[ev.pointerId] = { pokeId: id, x: ev.clientX, y: ev.clientY, t: performance.now() };
    Audio.press(clamp(0.55 + force * 0.35, 0.2, 1));
    $('stageHint').hidden = true;
    ev.preventDefault();
  }

  function onMove(ev) {
    var rec = pointers[ev.pointerId];
    if (!rec) return;
    var p = canvasUV(ev);
    sim.move(rec.pokeId, p.u, p.v);
    var dx = ev.clientX - rec.x, dy = ev.clientY - rec.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    rec.x = ev.clientX; rec.y = ev.clientY;
    if (dist > 2) Audio.rub(clamp(dist / 26, 0.06, 0.5));
    ev.preventDefault();
  }

  function onUp(ev) {
    var rec = pointers[ev.pointerId];
    if (!rec) return;
    delete pointers[ev.pointerId];
    var e = sim.release(rec.pokeId);
    Audio.release(clamp(e * 14, 0.15, 0.8));
    try { $('glcanvas').releasePointerCapture(ev.pointerId); } catch (err) {}
  }

  /* ------------------------------------------------------------------ */
  /* 루프                                                                */
  /* ------------------------------------------------------------------ */
  var lastT = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastT = t; return; }
    var dt = lastT ? (t - lastT) / 1000 : 0.016;
    lastT = t;
    sim.jelly = S.jelly; sim.wobble = S.wobble;
    sim.step(dt);
    renderer.render(sim);
  }

  /* ------------------------------------------------------------------ */
  /* UI 만들기                                                            */
  /* ------------------------------------------------------------------ */
  function syncRenderer() {
    var transparent = S.bg === 'transparent';
    var rgb = transparent ? [0, 0, 0] : hex2rgb(S.bg);
    renderer.setParams({
      gloss: S.gloss, rim: S.rim, wobble: S.wobble,
      tint: hex2rgb(S.tint), tintAmt: S.tintAmt, depth: S.depth,
      bg: [rgb[0], rgb[1], rgb[2], transparent ? 0 : 1],
      shadow: transparent ? 0 : 0.2
    });
    var stage = $('stage');
    stage.style.background = transparent
      ? 'repeating-conic-gradient(#e9e2ec 0% 25%, #f8f4f9 0% 50%) 0 0/18px 18px'
      : S.bg;
  }

  function syncAudio() {
    Audio.setPreset(S.sound);
    Audio.setVolume(S.volume);
    Audio.setReverb(S.reverb);
    Audio.setMuted(S.muted);
    Audio.setUsePartTags(S.partSound);
    var tags = S.parts.map(function (id) {
      var p = Parts.byId(id); return p && p.sound;
    }).filter(Boolean);
    Audio.setPartTags(tags);
  }

  function bindRange(id, key, fmt, after) {
    var el = $(id), out = $(id.replace('rng', 'out'));
    el.value = S[key];
    if (out) out.textContent = (fmt || function (v) { return (+v).toFixed(2); })(S[key]);
    el.addEventListener('input', function () {
      S[key] = parseFloat(el.value);
      if (out) out.textContent = (fmt || function (v) { return (+v).toFixed(2); })(S[key]);
      syncRenderer(); save();
      if (after) after();
    });
  }
  var asInt = function (v) { return String(Math.round(v)); };

  function chipRow(host, items, isActive, onPick) {
    host.innerHTML = '';
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = it.name;
      b.setAttribute('aria-pressed', isActive(it) ? 'true' : 'false');
      b.addEventListener('click', function () {
        onPick(it);
        Array.prototype.forEach.call(host.children, function (c, i) {
          c.setAttribute('aria-pressed', isActive(items[i]) ? 'true' : 'false');
        });
      });
      host.appendChild(b);
    });
  }

  function buildPartUI() {
    var tabs = $('partTabs');
    tabs.innerHTML = '';
    Parts.CATEGORIES.forEach(function (cat) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tab'; b.textContent = cat.name;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', S.tab === cat.id ? 'true' : 'false');
      b.addEventListener('click', function () {
        S.tab = cat.id;
        Array.prototype.forEach.call(tabs.children, function (c, i) {
          c.setAttribute('aria-selected', Parts.CATEGORIES[i].id === S.tab ? 'true' : 'false');
        });
        renderPartGrid(); save();
      });
      tabs.appendChild(b);
    });
    renderPartGrid();
  }

  function renderPartGrid() {
    var grid = $('partGrid');
    grid.innerHTML = '';
    Parts.LIST.filter(function (p) { return p.cat === S.tab; }).forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'part'; b.title = p.name;
      b.setAttribute('aria-label', p.name);
      b.setAttribute('aria-pressed', S.parts.indexOf(p.id) >= 0 ? 'true' : 'false');
      b.appendChild(Parts.thumbnail(p.id, 44));
      b.addEventListener('click', function () {
        var i = S.parts.indexOf(p.id);
        if (i >= 0) S.parts.splice(i, 1); else S.parts.push(p.id);
        b.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true');
        buildMixLayer(); syncAudio(); save();
      });
      grid.appendChild(b);
    });
  }

  function applySkin(v) {
    for (var k in v) S[k] = v[k];
    ['rngGloss', 'rngRim', 'rngJelly', 'rngWobble', 'rngTint'].forEach(function (id) {
      var key = id.replace('rng', '').toLowerCase();
      var map = { gloss: 'gloss', rim: 'rim', jelly: 'jelly', wobble: 'wobble', tint: 'tintAmt' };
      var el = $(id), out = $(id.replace('rng', 'out'));
      el.value = S[map[key]];
      if (out) out.textContent = (+S[map[key]]).toFixed(2);
    });
    $('colTint').value = S.tint;
    syncRenderer(); save();
  }

  /* ------------------------------------------------------------------ */
  /* 저장 / 불러오기                                                      */
  /* ------------------------------------------------------------------ */
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {}
  }
  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      for (var k in S) if (Object.prototype.hasOwnProperty.call(o, k)) S[k] = o[k];
      if (!Array.isArray(S.parts)) S.parts = [];
    } catch (e) {}
  }

  function exportPreset() {
    var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    if (download(blob, 'crunch-slime-preset.json')) toast('설정을 내보냈어요');
    else toast('이 화면에서는 다운로드가 막혀 있어요');
  }

  function importPreset(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var o = JSON.parse(r.result);
        for (var k in S) if (Object.prototype.hasOwnProperty.call(o, k)) S[k] = o[k];
        applySkin({});
        $('colBg').value = /^#/.test(S.bg) ? S.bg : '#fdf3f7';
        bindAllValues();
        buildPartUI(); buildMixLayer(); syncRenderer(); syncAudio(); save();
        toast('설정을 불러왔어요');
      } catch (e) { toast('설정 파일을 읽지 못했어요'); }
    };
    r.readAsText(file);
  }

  function bindAllValues() {
    [['rngGloss', 'gloss'], ['rngRim', 'rim'], ['rngJelly', 'jelly'], ['rngWobble', 'wobble'],
     ['rngTint', 'tintAmt'], ['rngCount', 'count'], ['rngSize', 'size'], ['rngDepth', 'depth'],
     ['rngSpread', 'spread'],
     ['rngVol', 'volume'], ['rngVerb', 'reverb'], ['rngBgTol', 'tolerance']].forEach(function (pair) {
      var el = $(pair[0]); if (!el) return;
      el.value = S[pair[1]];
      var out = $(pair[0].replace('rng', 'out'));
      if (out) out.textContent = (pair[1] === 'count' || pair[1] === 'tolerance')
        ? String(Math.round(S[pair[1]])) : (+S[pair[1]]).toFixed(2);
    });
    $('colTint').value = S.tint;
    $('chkBgRemove').checked = S.removeBg;
    $('bgTolField').hidden = !S.removeBg;
    $('chkTrim').checked = S.trim;
    $('chkPartSound').checked = S.partSound;
    $('btnMute').setAttribute('aria-pressed', S.muted ? 'true' : 'false');
  }

  /* ------------------------------------------------------------------ */
  /* 내보내기                                                             */
  /* ------------------------------------------------------------------ */
  function savePng() {
    if (!hasImage) { toast('먼저 이미지를 올려주세요'); return; }
    renderer.render(sim);
    $('glcanvas').toBlob(function (blob) {
      if (blob && download(blob, 'crunch-slime.png')) toast('PNG로 저장했어요');
      else toast('이 화면에서는 다운로드가 막혀 있어요');
    }, 'image/png');
  }

  var recorder = null;
  function toggleRecord() {
    var btn = $('btnRec');
    if (recorder) { recorder.stop(); return; }
    if (!hasImage) { toast('먼저 이미지를 올려주세요'); return; }
    var cv = $('glcanvas');
    if (!cv.captureStream || typeof MediaRecorder === 'undefined') { toast('이 브라우저는 녹화를 지원하지 않아요'); return; }
    var stream = cv.captureStream(30);
    var as = Audio.captureStream();
    if (as) as.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
    var types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    var mime = types.filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0];
    try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : undefined); }
    catch (e) { toast('녹화를 시작할 수 없어요'); return; }
    var chunks = [];
    recorder.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = function () {
      var blob = new Blob(chunks, { type: 'video/webm' });
      recorder = null;
      btn.textContent = '영상 녹화';
      if (download(blob, 'crunch-slime.webm')) toast('영상을 저장했어요');
      else toast('이 화면에서는 다운로드가 막혀 있어요');
    };
    recorder.start();
    btn.textContent = '■ 녹화 중지';
    toast('녹화 중 — 슬라임을 눌러보세요');
  }

  /* ------------------------------------------------------------------ */
  /* 시작                                                                */
  /* ------------------------------------------------------------------ */
  function init() {
    restore();

    try {
      renderer = GL.create($('glcanvas'));
    } catch (e) {
      $('dropzone').innerHTML = '<div class="dz-inner"><h2>WebGL을 쓸 수 없어요</h2><p>' +
        String(e.message || e) + '</p></div>';
      return;
    }

    bindAllValues();
    buildPartUI();
    syncRenderer();
    syncAudio();

    chipRow($('skinPresets'), SKINS,
      function (s) { return s.id === S.skin; },
      function (s) { S.skin = s.id; applySkin(s.v); });

    chipRow($('soundPresets'), Audio.PRESETS,
      function (p) { return p.id === S.sound; },
      function (p) { S.sound = p.id; syncAudio(); save(); Audio.press(0.7); });

    chipRow($('bgPresets'), BGS,
      function (b) { return b.c === S.bg; },
      function (b) { S.bg = b.c; if (/^#/.test(b.c)) $('colBg').value = b.c; syncRenderer(); save(); });

    bindRange('rngGloss', 'gloss');
    bindRange('rngRim', 'rim');
    bindRange('rngJelly', 'jelly');
    bindRange('rngWobble', 'wobble');
    bindRange('rngTint', 'tintAmt');
    bindRange('rngCount', 'count', asInt, buildMixLayer);
    bindRange('rngSize', 'size', null, buildMixLayer);
    bindRange('rngDepth', 'depth');
    bindRange('rngSpread', 'spread', null, buildMixLayer);
    bindRange('rngBgTol', 'tolerance', asInt, reprocess);
    bindRange('rngVol', 'volume', null, syncAudio);
    bindRange('rngVerb', 'reverb', null, syncAudio);

    $('colTint').addEventListener('input', function () { S.tint = this.value; syncRenderer(); save(); });
    $('colBg').addEventListener('input', function () {
      S.bg = this.value; syncRenderer(); save();
      Array.prototype.forEach.call($('bgPresets').children, function (c) { c.setAttribute('aria-pressed', 'false'); });
    });

    $('chkBgRemove').addEventListener('change', function () {
      S.removeBg = this.checked; $('bgTolField').hidden = !this.checked; save(); reprocess();
    });
    $('chkTrim').addEventListener('change', function () { S.trim = this.checked; save(); reprocess(); });
    $('chkPartSound').addEventListener('change', function () { S.partSound = this.checked; syncAudio(); save(); });

    function shuffle() { S.seed = (Math.random() * 1e9) | 0; buildMixLayer(); save(); toast('다시 섞었어요'); }
    $('btnShuffle').addEventListener('click', shuffle);
    $('btnShuffle2').addEventListener('click', shuffle);
    $('btnClearParts').addEventListener('click', function () {
      S.parts = []; renderPartGrid(); buildMixLayer(); syncAudio(); save();
    });

    $('btnMute').addEventListener('click', function () {
      S.muted = !S.muted;
      this.setAttribute('aria-pressed', S.muted ? 'true' : 'false');
      Audio.setMuted(S.muted); save();
      toast(S.muted ? '소리를 껐어요' : '소리를 켰어요');
    });

    $('btnSnap').addEventListener('click', savePng);
    $('btnPng').addEventListener('click', savePng);
    $('btnRec').addEventListener('click', toggleRecord);
    $('btnExport').addEventListener('click', exportPreset);
    $('btnImport').addEventListener('click', function () { $('presetInput').click(); });
    $('presetInput').addEventListener('change', function () { if (this.files[0]) importPreset(this.files[0]); this.value = ''; });

    // 이미지 입력
    function pick() { $('fileInput').click(); }
    $('btnPick').addEventListener('click', pick);
    $('btnPickHero').addEventListener('click', pick);
    $('fileInput').addEventListener('change', function () {
      var f = this.files[0]; this.value = '';
      if (!f) return;
      Img.loadFile(f).then(loadSource).catch(function (e) { toast(e.message || '이미지를 읽지 못했어요'); });
    });
    $('btnDemo').addEventListener('click', function () { loadSource(Img.demoCanvas(640)); toast('샘플이에요. 꾹 눌러보세요!'); });

    var dz = $('dropzone'), stage = $('stage');
    ['dragenter', 'dragover'].forEach(function (t) {
      stage.addEventListener(t, function (e) { e.preventDefault(); dz.hidden = false; dz.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      stage.addEventListener(t, function (e) { e.preventDefault(); dz.classList.remove('over'); if (t === 'dragleave' && hasImage) dz.hidden = true; });
    });
    stage.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) Img.loadFile(f).then(loadSource).catch(function (err) { toast(err.message || '이미지를 읽지 못했어요'); });
      else if (hasImage) dz.hidden = true;
    });

    // 포인터
    var cv = $('glcanvas');
    cv.classList.add('empty');
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('lostpointercapture', onUp);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.setAttribute('tabindex', '0');
    cv.addEventListener('keydown', function (e) {
      if (!hasImage || (e.key !== ' ' && e.key !== 'Enter')) return;
      e.preventDefault();
      Audio.init();
      var id = sim.poke(0.5, 0.5, pressStrength(), pressRadius());
      Audio.press(0.8);
      setTimeout(function () { sim.release(id); Audio.release(0.4); }, 220);
    });

    // 패널 접기
    $('btnPanelToggle').addEventListener('click', function () {
      var p = $('panel');
      p.hidden = !p.hidden;
      this.setAttribute('aria-expanded', p.hidden ? 'false' : 'true');
      setTimeout(function () { renderer.resize(); }, 30);
    });

    var help = $('helpModal');
    $('btnHelp').addEventListener('click', function () { help.showModal ? help.showModal() : (help.open = true); });
    $('btnHelpClose').addEventListener('click', function () { help.close ? help.close() : (help.open = false); });

    global.addEventListener('resize', function () { renderer.resize(); });
    global.addEventListener('blur', function () { sim.releaseAll(); pointers = {}; });

    $('exportNote').textContent = 'PNG·영상·설정 파일은 이 브라우저에서 바로 내려받습니다. 미리보기 화면에서는 다운로드가 막힐 수 있어요.';

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
