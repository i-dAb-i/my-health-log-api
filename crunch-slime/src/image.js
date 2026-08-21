/* 크런치 슬라임 — 이미지 처리
 * 업로드된 그림을 다듬고, 파츠를 박아 넣을 "안쪽 영역"을 계산합니다.
 * 모든 처리는 브라우저 안에서만 일어나고 서버로 전송되지 않습니다.
 */
(function (global) {
  'use strict';

  var MAX_SIDE = 1024;

  function loadFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('이미지 파일이 아닙니다.')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했습니다.')); };
      img.src = url;
    });
  }

  function toCanvas(img, maxSide) {
    var m = maxSide || MAX_SIDE;
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var sc = Math.min(1, m / Math.max(w, h));
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * sc));
    cv.height = Math.max(1, Math.round(h * sc));
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }

  /** 테두리에서 번져 들어가며 배경색과 비슷한 픽셀을 지웁니다. */
  function removeBackground(cv, tolerance) {
    var w = cv.width, h = cv.height;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    var id = ctx.getImageData(0, 0, w, h);
    var d = id.data;
    var tol = (tolerance == null ? 28 : tolerance);
    var tol2 = tol * tol * 3;

    // 테두리 픽셀의 평균색을 배경색으로 봅니다.
    var sr = 0, sg = 0, sb = 0, n = 0, x, y, i;
    function sample(px, py) {
      var k = (py * w + px) * 4;
      if (d[k + 3] < 8) return;
      sr += d[k]; sg += d[k + 1]; sb += d[k + 2]; n++;
    }
    for (x = 0; x < w; x++) { sample(x, 0); sample(x, h - 1); }
    for (y = 0; y < h; y++) { sample(0, y); sample(w - 1, y); }
    if (!n) return cv;
    var br = sr / n, bg = sg / n, bb = sb / n;

    var visited = new Uint8Array(w * h);
    var stack = new Int32Array(w * h);
    var top = 0;

    function push(px, py) {
      if (px < 0 || py < 0 || px >= w || py >= h) return;
      var p = py * w + px;
      if (visited[p]) return;
      visited[p] = 1;
      var k = p * 4;
      if (d[k + 3] < 8) { stack[top++] = p; return; }      // 이미 투명 → 계속 번짐
      var dr = d[k] - br, dg = d[k + 1] - bg, db = d[k + 2] - bb;
      if (dr * dr + dg * dg + db * db > tol2) return;       // 배경색과 다름 → 여기서 멈춤
      d[k + 3] = 0;
      stack[top++] = p;
    }

    for (x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

    while (top > 0) {
      var p = stack[--top];
      var px = p % w, py = (p - px) / w;
      push(px + 1, py); push(px - 1, py); push(px, py + 1); push(px, py - 1);
    }

    // 경계에 남는 배경색 테두리(헤일로)를 부드럽게 깎아냅니다.
    var alphaCopy = new Uint8ClampedArray(w * h);
    for (i = 0; i < w * h; i++) alphaCopy[i] = d[i * 4 + 3];
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        var q = y * w + x;
        if (alphaCopy[q] < 250) continue;
        var empty = 0;
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
          if (alphaCopy[q + oy * w + ox] < 20) empty++;
        }
        if (empty) d[q * 4 + 3] = Math.round(255 * (1 - empty / 9 * 0.75));
      }
    }

    ctx.putImageData(id, 0, 0);
    return cv;
  }

  /** 투명한 여백을 잘라냅니다. */
  function trim(cv, padRatio) {
    var w = cv.width, h = cv.height;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    var d = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 10) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return cv;
    var pad = Math.round(Math.max(w, h) * (padRatio == null ? 0.03 : padRatio));
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    var nw = maxX - minX + 1, nh = maxY - minY + 1;
    if (nw === w && nh === h) return cv;
    var out = document.createElement('canvas');
    out.width = nw; out.height = nh;
    out.getContext('2d').drawImage(cv, minX, minY, nw, nh, 0, 0, nw, nh);
    return out;
  }

  /** 정사각형 캔버스 가운데에 맞춰 넣습니다(WebGL 텍스처 좌표를 단순하게 유지). */
  function square(cv, fill) {
    var side = Math.max(cv.width, cv.height);
    var out = document.createElement('canvas');
    out.width = out.height = side;
    var ctx = out.getContext('2d', { willReadFrequently: true });
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, side, side); }
    ctx.drawImage(cv, (side - cv.width) / 2, (side - cv.height) / 2);
    return out;
  }

  /**
   * 파츠를 박을 수 있는 "안쪽" 지점 목록을 만듭니다.
   * 가장자리에서 멀수록 depth 가 큽니다 → 깊은 곳에 큰 파츠를 넣을 수 있습니다.
   */
  function buildMask(cv, gridMax) {
    var gm = gridMax || 150;
    var sc = Math.min(1, gm / Math.max(cv.width, cv.height));
    var gw = Math.max(8, Math.round(cv.width * sc));
    var gh = Math.max(8, Math.round(cv.height * sc));

    var tmp = document.createElement('canvas');
    tmp.width = gw; tmp.height = gh;
    var tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(cv, 0, 0, gw, gh);
    var d = tctx.getImageData(0, 0, gw, gh).data;

    var cur = new Uint8Array(gw * gh);
    var depth = new Uint8Array(gw * gh);
    var i;
    for (i = 0; i < gw * gh; i++) cur[i] = d[i * 4 + 3] > 140 ? 1 : 0;

    var next = new Uint8Array(gw * gh);
    var maxPass = 24, pass;
    for (pass = 0; pass < maxPass; pass++) {
      var alive = 0;
      for (var y = 0; y < gh; y++) {
        for (var x = 0; x < gw; x++) {
          var p = y * gw + x;
          if (!cur[p]) { next[p] = 0; continue; }
          var keep = (x > 0 && y > 0 && x < gw - 1 && y < gh - 1) &&
            cur[p - 1] && cur[p + 1] && cur[p - gw] && cur[p + gw];
          next[p] = keep ? 1 : 0;
          if (keep) { depth[p] = pass + 1; alive++; }
        }
      }
      cur.set(next);
      if (!alive) break;
    }

    var pts = [];
    for (i = 0; i < gw * gh; i++) {
      if (depth[i] >= 2) {
        var px = i % gw, py = (i - px) / gw;
        pts.push({ u: (px + 0.5) / gw, v: (py + 0.5) / gh, depth: depth[i] });
      }
    }
    // 얕은 곳도 조금은 쓸 수 있도록, 완전히 비면 기준을 낮춥니다.
    if (!pts.length) {
      for (i = 0; i < gw * gh; i++) {
        if (d[i * 4 + 3] > 140) {
          var qx = i % gw, qy = (i - qx) / gw;
          pts.push({ u: (qx + 0.5) / gw, v: (qy + 0.5) / gh, depth: 1 });
        }
      }
    }
    var maxDepth = 1;
    for (i = 0; i < pts.length; i++) if (pts[i].depth > maxDepth) maxDepth = pts[i].depth;
    return { points: pts, maxDepth: maxDepth, gw: gw, gh: gh, cellPx: cv.width / gw };
  }

  /** 처음 열었을 때 바로 만져볼 수 있는 샘플 캐릭터 */
  function demoCanvas(size) {
    var s = size || 560;
    var cv = document.createElement('canvas');
    cv.width = cv.height = s;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    var u = s / 100;
    ctx.translate(s / 2, s / 2);

    function c(x, y, r, fill) { ctx.beginPath(); ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
    function e(x, y, rx, ry, rot, fill) { ctx.beginPath(); ctx.ellipse(x * u, y * u, rx * u, ry * u, rot, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }

    e(0, 28, 24, 20, 0, '#ffd9e8');                    // 몸통
    c(-19, 26, 8, '#ffd9e8'); c(19, 26, 8, '#ffd9e8'); // 팔
    c(-24, -26, 12, '#ffe9b8'); c(24, -26, 12, '#ffe9b8'); // 귀
    c(-24, -26, 6, '#ffb9c9'); c(24, -26, 6, '#ffb9c9');
    c(0, -8, 33, '#ffe9b8');                            // 머리
    e(-12, -6, 5.2, 6.6, 0, '#3b2b34'); e(12, -6, 5.2, 6.6, 0, '#3b2b34');
    c(-13.6, -8.4, 2, '#fff'); c(10.4, -8.4, 2, '#fff');
    ctx.save(); ctx.globalAlpha = .55;
    e(-21, 4, 6, 3.4, 0, '#ff9dbb'); e(21, 4, 6, 3.4, 0, '#ff9dbb');
    ctx.restore();
    ctx.strokeStyle = '#3b2b34'; ctx.lineWidth = 2 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 4 * u, 5 * u, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke();
    e(0, -36, 9, 6, -0.4, '#ff8fb4');                   // 머리 리본
    e(9, -38, 7, 5, 0.5, '#ff8fb4');
    c(4, -37, 3.4, '#ff6f9e');
    return cv;
  }

  /** 업로드 → 정리 → 마스크까지 한 번에 */
  function prepare(source, opts) {
    opts = opts || {};
    var cv = source instanceof HTMLCanvasElement ? source : toCanvas(source, opts.maxSide);
    if (!(source instanceof HTMLCanvasElement)) {
      // 원본 훼손을 막기 위해 항상 복사본으로 작업합니다.
    } else {
      var copy = document.createElement('canvas');
      copy.width = cv.width; copy.height = cv.height;
      copy.getContext('2d').drawImage(cv, 0, 0);
      cv = copy;
    }
    if (opts.removeBg) cv = removeBackground(cv, opts.tolerance);
    if (opts.trim !== false) cv = trim(cv, 0.04);
    cv = square(cv);
    return { canvas: cv, mask: buildMask(cv) };
  }

  global.CS = global.CS || {};
  global.CS.ImageUtil = {
    loadFile: loadFile,
    toCanvas: toCanvas,
    removeBackground: removeBackground,
    trim: trim,
    square: square,
    buildMask: buildMask,
    demoCanvas: demoCanvas,
    prepare: prepare
  };
})(window);
