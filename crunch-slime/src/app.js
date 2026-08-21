/* 크런치 슬라임 — 앱
 * UI · 파츠 배치 · 포인터 입력 · 저장을 담당합니다.
 */
(function (global) {
  'use strict';
  var Parts = global.CS.Parts, Audio = global.CS.Audio,
      Img = global.CS.ImageUtil, Physics = global.CS.Physics, GL = global.CS.Renderer;

  var $ = function (id) { return document.getElementById(id); };
  var STORE_KEY = 'crunch-slime.v2';

  /* ------------------------------------------------------------------ */
  /* 상태                                                                */
  /* ------------------------------------------------------------------ */
  var S = {
    gloss: 0.55, rim: 0.40, jelly: 0.60, wobble: 0.45, crust: 0.72,
    tintAmt: 0.18, tint: '#8be9ff',
    parts: ['strawberry', 'heart', 'bead', 'star'],
    tab: 'fruit',
    count: 18, size: 1.0, depth: 0.55, spread: 0.40, seed: 12345,
    skin: 'jelly', sound: 'crunch', volume: 0.75, reverb: 0.22, muted: false, partSound: true,
    bg: '#fdf3f7',
    removeBg: false, tolerance: 28, trim: true
  };

  var SKINS = [
    { id: 'jelly',  name: '젤리',   v: { gloss: 0.55, rim: 0.40, jelly: 0.60, wobble: 0.45, crust: 0.72, tintAmt: 0.18, tint: '#8be9ff' } },
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

  function anchorSave(blob, name) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return 'saved';
    } catch (e) { return 'blocked'; }
  }

  /**
   * 파일 저장. 보통은 링크로 내려받고, 다운로드가 막힌 미리보기 화면
   * (claude.ai Artifact 등)에서는 호스트의 저장 기능을 씁니다.
   * → 'saved' | 'declined' | 'blocked'
   */
  function saveFile(blob, name) {
    var C = global.claude;
    if (C && typeof C.use === 'function') {
      return C.use('downloads').then(function (dl) {
        if (!dl) return anchorSave(blob, name);
        return dl.save({ filename: name, data: blob })
          .then(function () { return 'saved'; })
          .catch(function (err) { return (err && err.code === 'declined') ? 'declined' : 'blocked'; });
      }).catch(function () { return anchorSave(blob, name); });
    }
    return Promise.resolve(anchorSave(blob, name));
  }

  function toastSave(what) {
    return function (status) {
      if (status === 'saved') toast(what + '을(를) 저장했어요');
      else if (status === 'declined') toast('저장을 취소했어요');
      else toast('이 화면에서는 다운로드가 막혀 있어요');
    };
  }

  /* ------------------------------------------------------------------ */
  /* 슬라임 본체                                                          */
  /* ------------------------------------------------------------------ */
  var renderer = null, sim = Physics.create();
  var body = null;        // { canvas, mask } — 원본 기준
  var alphaMap = null;    // 지금 뭉개진 상태의 알파(어디를 눌렀는지 판정용)
  var atlas = null;       // 파츠 스프라이트 시트
  var instances = [];     // 슬라임에 박힌 파츠들 — 고체라 위치·회전만 바뀝니다
  var geom = null;        // 파츠 정점 버퍼
  var pointers = {};      // pointerId → { pokeId, x, y }
  var hasImage = false;
  var kneaded = 0;        // 지금까지 얼마나 주물렀는지(0~1 대략)

  var QUAD_FILL = 0.68;   // 아틀라스 타일에서 파츠가 실제로 차지하는 비율

  function alphaAt(u, v) {
    if (!alphaMap || u < 0 || v < 0 || u > 1 || v > 1) return 0;
    var x = clamp(Math.floor(u * alphaMap.w), 0, alphaMap.w - 1);
    var y = clamp(Math.floor(v * alphaMap.h), 0, alphaMap.h - 1);
    return alphaMap.data[y * alphaMap.w + x];
  }

  function refreshMask() {
    var m = renderer.readMask();
    if (m) alphaMap = m;
  }

  /** 활성 파츠를 실루엣 안쪽에 흩뿌립니다. 위치는 여기서 한 번만 정해집니다. */
  function rebuildParts() {
    instances = [];
    if (!body) { renderer.setPartGeometry(new Float32Array(0), 0); return; }

    var ids = S.parts.filter(function (id) { return !!Parts.byId(id); });
    var pts = body.mask.points;
    if (!ids.length || S.count <= 0 || !pts.length) {
      renderer.setPartGeometry(new Float32Array(0), 0);
      updateGeometry();
      return;
    }

    var rand = rng(S.seed);
    var base = 0.042 * S.size;       // 텍스처 uv 단위 반지름
    var placed = [];

    for (var i = 0; i < S.count; i++) {
      var part = Parts.byId(ids[Math.floor(rand() * ids.length)]);
      var r = base * (0.72 + rand() * 0.66) * (part.ratio || 1);
      var spot = null, tries = 0;
      while (tries++ < 22) {
        var cand = pts[Math.floor(rand() * pts.length)];
        var room = cand.depth / body.mask.maxDepth;
        if (room < 0.12) continue;
        // 퍼짐이 낮으면 가장자리 쪽을 더 자주 고릅니다(가운데 얼굴을 덜 가리게).
        var dc = Math.sqrt(Math.pow(cand.u - 0.5, 2) + Math.pow(cand.v - 0.5, 2));
        if (rand() > S.spread + (1 - S.spread) * clamp(dc / 0.40, 0, 1)) continue;
        var ok = true;
        for (var j = 0; j < placed.length; j++) {
          var dx = placed[j].u - cand.u, dy = placed[j].v - cand.v;
          if (dx * dx + dy * dy < Math.pow((placed[j].rr + r) * 0.85, 2)) { ok = false; break; }
        }
        if (ok) { spot = cand; break; }
      }
      if (!spot) continue;

      var rr = Math.min(r, base * 1.5 * (0.4 + spot.depth / body.mask.maxDepth));
      placed.push({ u: spot.u, v: spot.v, rr: rr });
      instances.push({
        id: part.id,
        ci: Math.floor(rand() * part.colors.length),
        u: spot.u, v: spot.v,
        r: rr / QUAD_FILL,
        rot: (rand() - 0.5) * Math.PI * 2,
        spinA: (rand() - 0.5) * 2,
        spinB: (rand() - 0.5) * 2
      });
    }
    updateGeometry();
  }

  /** 파츠 쿼드를 정점 버퍼로 굽습니다. 파츠는 뭉개지지 않으므로 모양은 항상 그대로입니다. */
  function updateGeometry() {
    var n = instances.length;
    if (!atlas) return;
    if (!geom || geom.length < n * 24) geom = new Float32Array(Math.max(n, 8) * 24);
    var k = 0;
    for (var i = 0; i < n; i++) {
      var p = instances[i];
      var box = atlas.uv[p.id + '|' + p.ci];
      if (!box) continue;
      var c = Math.cos(p.rot) * p.r, s2 = Math.sin(p.rot) * p.r;
      // 회전한 네 모서리 (좌상, 우상, 우하, 좌하)
      var x0 = p.u - c + s2, y0 = p.v - s2 - c;
      var x1 = p.u + c + s2, y1 = p.v + s2 - c;
      var x2 = p.u + c - s2, y2 = p.v + s2 + c;
      var x3 = p.u - c - s2, y3 = p.v - s2 + c;
      var u0 = box[0], v0 = box[1], u1 = box[2], v1 = box[3];
      var v = [x0, y0, u0, v0,  x1, y1, u1, v0,  x2, y2, u1, v1,
               x0, y0, u0, v0,  x2, y2, u1, v1,  x3, y3, u0, v1];
      for (var m = 0; m < 24; m++) geom[k++] = v[m];
    }
    renderer.setPartGeometry(geom, k / 24);
  }

  /** 껍질 저항 — 셰이더의 coreAt() 과 같은 취지를 CPU 에서 근사합니다. */
  function crustFactor(u, v) {
    var e = 0.055;
    var a = (alphaAt(u, v) + alphaAt(u - e, v) + alphaAt(u + e, v) +
             alphaAt(u, v - e) + alphaAt(u, v + e)) / 5 / 255;
    var core = clamp((a - 0.22) / 0.72, 0, 1);
    return 1 - S.crust * 0.90 * (1 - core);
  }

  /** 변형장을 파츠 중심에 적용합니다. 밀려나되 형태는 유지됩니다. */
  var _d = [0, 0];
  function movePartsWith(sim) {
    if (!instances.length) return 0;
    var total = 0;
    for (var i = 0; i < instances.length; i++) {
      var p = instances[i];
      sim.displaceAt(p.u, p.v, _d);
      if (_d[0] === 0 && _d[1] === 0) continue;
      var sk = crustFactor(p.u, p.v);
      _d[0] *= sk; _d[1] *= sk;
      p.u += _d[0]; p.v += _d[1];
      p.rot += (_d[0] * p.spinA + _d[1] * p.spinB) * 16;
      total += Math.abs(_d[0]) + Math.abs(_d[1]);
    }
    return total;
  }

  /** 파츠가 얼마나 빽빽한지 0~1 — 와그작 소리의 밀도가 됩니다. */
  function partLoad() {
    if (!instances.length) return 0;
    return clamp(instances.length / 34, 0, 1) * clamp(0.55 + S.size * 0.45, 0, 1.3);
  }

  function applyImage(sourceCanvasOrImg) {
    body = Img.prepare(sourceCanvasOrImg, {
      removeBg: S.removeBg, tolerance: S.tolerance, trim: S.trim
    });
    renderer.setBody(body.canvas);
    refreshMask();
    rebuildParts();
    kneaded = 0;
    hasImage = true;
    $('dropzone').hidden = true;
    $('glcanvas').classList.remove('empty');
    $('stageHint').hidden = false;
    $('stageHint').textContent = '꾹 누르거나 문질러보세요';
    setTimeout(function () { $('stageHint').hidden = true; }, 6000);
    updateResetState();
  }

  /** 주무른 걸 전부 되돌립니다. */
  function resetSlime(quiet) {
    if (!hasImage) return;
    renderer.reset();
    refreshMask();
    rebuildParts();
    sim.releaseAll();
    pointers = {};
    kneaded = 0;
    updateResetState();
    if (!quiet) toast('처음 모습으로 되돌렸어요');
  }

  function updateResetState() {
    var btns = [$('btnReset'), $('btnReset2')];
    for (var i = 0; i < btns.length; i++) {
      if (btns[i]) btns[i].disabled = !hasImage || kneaded < 0.002;
    }
  }

  var rawSource = null;   // 원본(설정을 바꿔도 다시 처리할 수 있게 보관)
  function loadSource(src) { rawSource = src; applyImage(src); }
  function reprocess() { if (rawSource) applyImage(rawSource); }

  /* ------------------------------------------------------------------ */
  /* 입력                                                                */
  /* ------------------------------------------------------------------ */
  function canvasUV(ev) {
    var cv = $('glcanvas');
    var r = cv.getBoundingClientRect();
    return renderer.screenToTex((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
  }

  function pressRadius() { return 0.11 + S.jelly * 0.08; }

  function onDown(ev) {
    if (!hasImage) return;
    Audio.init();
    var p = canvasUV(ev);
    if (alphaAt(p.u, p.v) < 24) return;      // 슬라임 바깥은 무시
    $('glcanvas').setPointerCapture(ev.pointerId);
    var id = sim.poke(p.u, p.v, pressRadius());
    pointers[ev.pointerId] = { pokeId: id, x: ev.clientX, y: ev.clientY };
    var force = ev.pressure && ev.pressure > 0 && ev.pointerType !== 'mouse' ? (0.5 + ev.pressure) : 1;
    Audio.press(clamp(0.55 + force * 0.35, 0.2, 1), partLoad());
    $('stageHint').hidden = true;
    ev.preventDefault();
  }

  function onMove(ev) {
    var rec = pointers[ev.pointerId];
    if (!rec) return;
    var p = canvasUV(ev);
    sim.move(rec.pokeId, p.u, p.v);
    rec.x = ev.clientX; rec.y = ev.clientY;
    ev.preventDefault();
  }

  function onUp(ev) {
    var rec = pointers[ev.pointerId];
    if (!rec) return;
    delete pointers[ev.pointerId];
    sim.release(rec.pokeId);
    Audio.release(0.45);
    refreshMask();                            // 뭉개진 실루엣으로 판정 기준을 갱신
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

    sim.jelly = S.jelly;
    sim.wobble = S.wobble;
    sim.step(dt);

    if (sim.active() && sim.motion > 0.00002) {
      renderer.knead(sim);                    // 텍스처에 변형을 영구히 새깁니다
      if (movePartsWith(sim) > 0) updateGeometry();
      kneaded = Math.min(1, kneaded + sim.motion * 1.6);
      if (kneaded > 0.002) updateResetState();
      // 실제로 뭉개지는 양에 맞춰 마찰음이 이어집니다.
      if (sim.motion > 0.0005) Audio.rub(clamp(sim.motion * 75, 0.05, 0.6), partLoad());
    }

    renderer.render(sim);
  }

  /* ------------------------------------------------------------------ */
  /* UI 만들기                                                            */
  /* ------------------------------------------------------------------ */
  function syncRenderer() {
    var transparent = S.bg === 'transparent';
    var rgb = transparent ? [0, 0, 0] : hex2rgb(S.bg);
    renderer.setParams({
      gloss: S.gloss, rim: S.rim, crust: S.crust,
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
        rebuildParts(); syncAudio(); save();
      });
      grid.appendChild(b);
    });
  }

  function applySkin(v) {
    for (var k in v) S[k] = v[k];
    ['rngGloss', 'rngRim', 'rngJelly', 'rngWobble', 'rngTint', 'rngCrust'].forEach(function (id) {
      var key = id.replace('rng', '').toLowerCase();
      var map = { gloss: 'gloss', rim: 'rim', jelly: 'jelly', wobble: 'wobble', tint: 'tintAmt', crust: 'crust' };
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
    saveFile(blob, 'crunch-slime-preset.json').then(toastSave('설정'));
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
        buildPartUI(); rebuildParts(); syncRenderer(); syncAudio(); save();
        toast('설정을 불러왔어요');
      } catch (e) { toast('설정 파일을 읽지 못했어요'); }
    };
    r.readAsText(file);
  }

  function bindAllValues() {
    [['rngGloss', 'gloss'], ['rngRim', 'rim'], ['rngJelly', 'jelly'], ['rngWobble', 'wobble'],
     ['rngTint', 'tintAmt'], ['rngCrust', 'crust'], ['rngCount', 'count'], ['rngSize', 'size'], ['rngDepth', 'depth'],
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
      if (!blob) { toast('이미지를 만들지 못했어요'); return; }
      saveFile(blob, 'crunch-slime.png').then(toastSave('PNG'));
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
      saveFile(blob, 'crunch-slime.webm').then(toastSave('영상'));
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

    atlas = Parts.buildAtlas(128);
    renderer.setPartAtlas(atlas.canvas);

    bindAllValues();
    buildPartUI();
    syncRenderer();
    syncAudio();

    chipRow($('skinPresets'), SKINS,
      function (s) { return s.id === S.skin; },
      function (s) { S.skin = s.id; applySkin(s.v); });

    chipRow($('soundPresets'), Audio.PRESETS,
      function (p) { return p.id === S.sound; },
      function (p) { S.sound = p.id; syncAudio(); save(); Audio.press(0.7, partLoad()); });

    chipRow($('bgPresets'), BGS,
      function (b) { return b.c === S.bg; },
      function (b) { S.bg = b.c; if (/^#/.test(b.c)) $('colBg').value = b.c; syncRenderer(); save(); });

    bindRange('rngGloss', 'gloss');
    bindRange('rngRim', 'rim');
    bindRange('rngCrust', 'crust');
    bindRange('rngJelly', 'jelly');
    bindRange('rngWobble', 'wobble');
    bindRange('rngTint', 'tintAmt');
    bindRange('rngCount', 'count', asInt, rebuildParts);
    bindRange('rngSize', 'size', null, rebuildParts);
    bindRange('rngDepth', 'depth');
    bindRange('rngSpread', 'spread', null, rebuildParts);
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

    function shuffle() { S.seed = (Math.random() * 1e9) | 0; rebuildParts(); save(); toast('다시 섞었어요'); }
    $('btnShuffle').addEventListener('click', shuffle);
    $('btnReset').addEventListener('click', function () { resetSlime(false); });
    $('btnReset2').addEventListener('click', function () { resetSlime(false); });
    updateResetState();
    $('btnShuffle2').addEventListener('click', shuffle);
    $('btnClearParts').addEventListener('click', function () {
      S.parts = []; renderPartGrid(); rebuildParts(); syncAudio(); save();
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
      var id = sim.poke(0.5, 0.5, pressRadius());
      Audio.press(0.8, partLoad());
      setTimeout(function () { sim.release(id); Audio.release(0.4); refreshMask(); }, 260);
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

    $('exportNote').textContent = 'PNG·영상·설정 파일은 이 기기로 바로 저장됩니다. 미리보기 화면에서는 저장 확인창이 한 번 더 뜰 수 있어요.';

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
