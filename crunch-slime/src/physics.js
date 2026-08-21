/* 크런치 슬라임 — 반죽(kneading) 모델
 *
 * 스프링으로 눌렀다 되돌아오는 방식이 아닙니다. 누르는 동안 아주 작은 변형을
 * 매 프레임 텍스처에 "영구히" 쌓습니다. 손을 떼도 돌아오지 않고, 계속 주무르면
 * 점토처럼 색이 섞이며 원래 형태가 무너집니다. 되돌리려면 reset 뿐입니다.
 *
 * 변형은 두 성분입니다.
 *   누름  — 누른 지점에서 물질이 방사상으로 밀려 퍼집니다.
 *   끌기  — 손가락이 간 방향으로 물질이 끌려갑니다(문지르기).
 */
(function (global) {
  'use strict';

  var MAX_POKES = 6;
  var HOLD_TAU = 0.55;   // 가만히 누르고만 있으면 이만큼의 시간 상수로 힘이 빠집니다
  var HOLD_FLOOR = 0.22; // 다만 완전히 멈추지는 않습니다
  var MAX_STEP = 0.08;

  function Sim() {
    this.pokes = [];
    this.nextId = 1;
    this.jelly = 0.6;    // 말랑함 — 얼마나 빨리 뭉개지는지
    this.wobble = 0.45;  // 흔들림 — 가만히 있을 때의 숨쉬기 폭
    this.time = 0;
    this.motion = 0;     // 이번 프레임에 실제로 일어난 변형량(소리·파츠용)
    this.drag = 0;       // 그중 문지르기 성분
    this._A = new Float32Array(MAX_POKES * 4); // u, v, 반지름, 누름량
    this._B = new Float32Array(MAX_POKES * 4); // 끌기x, 끌기y, 파인 자국, 위상
  }

  Sim.prototype.pressRate = function () { return 0.13 + this.jelly * 0.20; };

  /* 파인 자국(음영)은 기하 변형과 따로 쌓입니다.
   * 형태가 뭉개지는 건 계속 억제하면서도, 꾹 누르고 있으면 자국은 점점 깊어져야
   * "안으로 들어간다"로 읽힙니다. */
  Sim.prototype.dentRate = function () { return 0.34 + this.jelly * 0.22; };

  /* 잡은 자리가 손가락을 따라가는 정도. 손가락이 멀어질수록 더 끌려오되,
   * 한 프레임에 움직일 수 있는 거리에는 상한을 둡니다. */
  var PULL_K = 0.16;
  var PULL_CAP = 0.0050;

  Sim.prototype.poke = function (u, v, radius) {
    if (this.pokes.length >= MAX_POKES) this.pokes.shift();
    var p = {
      id: this.nextId++,
      u: u, v: v,           // 지금 붙잡고 있는 반죽의 위치 — 처음 누른 자리에서 출발합니다
      tu: u, tv: v,         // 손가락 위치
      radius: radius,
      energy: 1,
      pressAmt: 0, dentAmt: 0, dragX: 0, dragY: 0,
      phase: Math.random() * 6.28318,
      held: true
    };
    this.pokes.push(p);
    return p.id;
  };

  Sim.prototype.find = function (id) {
    for (var i = 0; i < this.pokes.length; i++) if (this.pokes[i].id === id) return this.pokes[i];
    return null;
  };

  /** 손가락의 새 위치. 잡은 반죽이 여기로 끌려옵니다. */
  Sim.prototype.move = function (id, u, v) {
    var p = this.find(id);
    if (p) { p.tu = u; p.tv = v; }
  };

  Sim.prototype.release = function (id) {
    for (var i = 0; i < this.pokes.length; i++) {
      if (this.pokes[i].id === id) { this.pokes.splice(i, 1); return true; }
    }
    return false;
  };

  Sim.prototype.releaseAll = function () { this.pokes.length = 0; };
  Sim.prototype.active = function () { return this.pokes.length > 0; };

  Sim.prototype.step = function (dt) {
    dt = Math.min(dt, MAX_STEP);
    this.time += dt;
    this.motion = 0;
    this.drag = 0;

    var rate = this.pressRate();
    var drate = this.dentRate();
    var scale = Math.min(1, dt * 60);

    for (var i = 0; i < this.pokes.length; i++) {
      var p = this.pokes[i];

      // 손가락과 잡은 자리의 간격만큼 반죽을 끌고 옵니다.
      // 손가락 이동 속도가 아니라 "얼마나 멀어졌는지"가 기준이라, 잡고 당기면
      // 손을 멈춰도 반죽이 끝까지 따라옵니다.
      var offX = p.tu - p.u, offY = p.tv - p.v;
      var off = Math.sqrt(offX * offX + offY * offY);
      var pull = Math.min(off * PULL_K, PULL_CAP) * scale;
      if (off > 1e-6) {
        p.dragX = offX / off * pull;
        p.dragY = offY / off * pull;
        p.u += p.dragX; p.v += p.dragY;
      } else {
        p.dragX = p.dragY = 0;
      }

      // 가만히 눌러도 아주 느리게는 계속 눌립니다. 당기면 힘이 되살아납니다.
      p.energy = Math.max(HOLD_FLOOR, p.energy * Math.exp(-dt / HOLD_TAU));
      p.energy = Math.min(1, p.energy + Math.min(off * 14, 1) * 0.8);

      p.pressAmt = rate * dt * p.energy;
      // 음영은 힘이 빠져도 절반 이상 유지되어 계속 깊어집니다.
      p.dentAmt = drate * dt * (0.55 + 0.45 * p.energy);

      this.motion += p.pressAmt + pull * 1.6;
      this.drag += pull;
    }
    return this.motion;
  };

  /** 셰이더용 uniform 두 벌 */
  Sim.prototype.uniforms = function () {
    var A = this._A, B = this._B;
    for (var i = 0; i < MAX_POKES; i++) {
      var p = this.pokes[i], o = i * 4;
      if (p) {
        A[o] = p.u; A[o + 1] = p.v; A[o + 2] = Math.max(p.radius, 0.001); A[o + 3] = p.pressAmt;
        B[o] = p.dragX; B[o + 1] = p.dragY; B[o + 2] = p.dentAmt; B[o + 3] = p.phase;
      } else {
        A[o] = A[o + 1] = 0; A[o + 2] = 0.001; A[o + 3] = 0;
        B[o] = B[o + 1] = B[o + 2] = B[o + 3] = 0;
      }
    }
    return { A: A, B: B };
  };

  /**
   * 같은 변형장을 CPU 에서 계산합니다. 파츠(고체)는 이 값만큼 자리를 옮기고
   * 모양은 그대로 둡니다. 셰이더의 disp() 와 부호·스케일이 일치해야 합니다.
   */
  Sim.prototype.displaceAt = function (u, v, out) {
    var dx = 0, dy = 0;
    for (var i = 0; i < this.pokes.length; i++) {
      var p = this.pokes[i];
      var rx = u - p.u, ry = v - p.v, R = p.radius;
      var x2 = (rx * rx + ry * ry) / (R * R);
      if (x2 > 6.25) continue;
      var ang = Math.atan2(ry, rx);
      var w = Math.exp(-x2 * 1.5) * (0.86 + 0.14 * Math.sin(ang * 3 + p.phase));
      // 누른 자리로 딸려 들어옵니다(수축). 셰이더 disp() 와 부호가 같아야 합니다.
      dx += -rx / R * p.pressAmt * w + p.dragX * w * w;
      dy += -ry / R * p.pressAmt * w + p.dragY * w * w;
    }
    out[0] = dx; out[1] = dy;
    return out;
  };

  /** 아무도 안 만질 때의 아주 느린 숨쉬기 (전체 균일 스케일) */
  Sim.prototype.breath = function () {
    return (Math.sin(this.time * 1.05) * 0.6 + Math.sin(this.time * 0.63 + 1.7) * 0.4) * this.wobble;
  };

  global.CS = global.CS || {};
  global.CS.Physics = { MAX_POKES: MAX_POKES, create: function () { return new Sim(); } };
})(window);
