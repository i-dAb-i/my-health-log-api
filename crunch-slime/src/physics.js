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
  var MAX_STEP = 0.05;

  function Sim() {
    this.pokes = [];
    this.nextId = 1;
    this.jelly = 0.6;    // 말랑함 — 얼마나 빨리 뭉개지는지
    this.wobble = 0.45;  // 흔들림 — 가만히 있을 때의 숨쉬기 폭
    this.time = 0;
    this.motion = 0;     // 이번 프레임에 실제로 일어난 변형량(소리·파츠용)
    this.drag = 0;       // 그중 문지르기 성분
    this._A = new Float32Array(MAX_POKES * 4); // u, v, 반지름, 누름량
    this._B = new Float32Array(MAX_POKES * 4); // 끌기x, 끌기y, 소용돌이, 위상
  }

  Sim.prototype.pressRate = function () { return 0.30 + this.jelly * 0.50; };

  /* 방사 성분은 아주 약하게만 씁니다.
   * 순수 방사 변형은 발산이 0이 아니라서, 같은 자리를 계속 누르면 그 지점의 색이
   * 원판처럼 부풀어 화면을 덮어버립니다. 실제 반죽에서 색이 섞이는 건 소용돌이와
   * 밀어내기(전단) 때문이므로 그쪽을 주력으로 씁니다. */
  var RADIAL = 0.16;

  Sim.prototype.poke = function (u, v, radius) {
    if (this.pokes.length >= MAX_POKES) this.pokes.shift();
    var p = {
      id: this.nextId++,
      u: u, v: v, tu: u, tv: v,
      radius: radius,
      energy: 1,
      pressAmt: 0, dragX: 0, dragY: 0,
      swirl: (Math.random() < 0.5 ? -1 : 1) * (0.72 + Math.random() * 0.5),
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

  /** 손가락의 새 목표 위치. 실제 이동은 step 에서 프레임 단위로 처리합니다. */
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

    for (var i = 0; i < this.pokes.length; i++) {
      var p = this.pokes[i];

      // 손가락 이동 — 조금 끌리게 따라갑니다.
      var mx = (p.tu - p.u) * 0.55;
      var my = (p.tv - p.v) * 0.55;
      p.u += mx; p.v += my;

      var speed = Math.sqrt(mx * mx + my * my);

      // 움직이면 힘이 되살아나고, 가만히 있으면 서서히 빠집니다.
      // 가만히 누르고만 있어도 아주 느리게는 계속 뭉개집니다.
      // 문지르면 힘이 되살아나므로, 주무를수록 훨씬 빨리 무너집니다.
      p.energy = Math.max(HOLD_FLOOR, p.energy * Math.exp(-dt / HOLD_TAU));
      p.energy = Math.min(1, p.energy + Math.min(speed * 22, 1) * 0.85);

      p.pressAmt = rate * dt * p.energy;

      // 끌기 성분 — 한 프레임에 너무 많이 밀리지 않게 잘라냅니다.
      // 문지를 때 한 프레임에 끌려가는 양. 크면 획 하나에 형태가 통째로 뭉개집니다.
      var cap = 0.030;
      var s = Math.min(speed, cap);
      var k = speed > 1e-6 ? (s / speed) * 0.55 : 0;
      p.dragX = mx * k; p.dragY = my * k;

      this.motion += p.pressAmt + s * 1.9;
      this.drag += s;
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
        B[o] = p.dragX; B[o + 1] = p.dragY; B[o + 2] = p.swirl; B[o + 3] = p.phase;
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
      var w = Math.exp(-x2 * 1.5) * (0.78 + 0.22 * Math.sin(ang * 3 + p.phase));
      // 소용돌이(발산 0) — 부풀리지 않고 섞기만 합니다. 셰이더 disp() 와 부호가 같아야 합니다.
      dx += -ry / R * p.pressAmt * w * p.swirl;
      dy += rx / R * p.pressAmt * w * p.swirl;
      dx += rx / R * p.pressAmt * w * RADIAL + p.dragX * w;
      dy += ry / R * p.pressAmt * w * RADIAL + p.dragY * w;
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
