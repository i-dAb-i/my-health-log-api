/* 크런치 슬라임 — 말랑말랑 물리
 * 누른 자리마다 감쇠 스프링을 하나씩 붙여서, 손을 떼면 출렁이며 되돌아옵니다.
 */
(function (global) {
  'use strict';

  var MAX_POKES = 6;

  function Sim() {
    this.pokes = [];
    this.nextId = 1;
    this.jelly = 0.6;     // 말랑함 0~1 (클수록 물렁하고 느리게 돌아옴)
    this.wobble = 0.45;   // 흔들림 0~1 (클수록 오래 출렁임)
    this.squash = { value: 0, vel: 0, target: 0 };
    this.time = 0;
    this._buf = new Float32Array(MAX_POKES * 4);
  }

  Sim.prototype.stiffness = function () { return 320 - 220 * this.jelly; };

  Sim.prototype.poke = function (u, v, strength, radius) {
    if (this.pokes.length >= MAX_POKES) {
      // 가장 약해진 것부터 밀어냅니다.
      var weakest = 0;
      for (var i = 1; i < this.pokes.length; i++) {
        if (Math.abs(this.pokes[i].value) < Math.abs(this.pokes[weakest].value)) weakest = i;
      }
      this.pokes.splice(weakest, 1);
    }
    var p = {
      id: this.nextId++,
      u: u, v: v,
      target: strength,
      value: strength * 0.35,   // 첫 프레임부터 눌린 느낌이 나도록 살짝 밀어줍니다.
      vel: strength * 6,
      radius: radius,
      press: 1,
      held: true
    };
    this.pokes.push(p);
    return p.id;
  };

  Sim.prototype.find = function (id) {
    for (var i = 0; i < this.pokes.length; i++) if (this.pokes[i].id === id) return this.pokes[i];
    return null;
  };

  Sim.prototype.move = function (id, u, v, strength) {
    var p = this.find(id);
    if (!p) return;
    // 손가락을 따라가되 약간 끌리게 — 늘어나는 느낌
    p.u += (u - p.u) * 0.42;
    p.v += (v - p.v) * 0.42;
    if (strength != null) p.target = strength;
  };

  Sim.prototype.release = function (id) {
    var p = this.find(id);
    if (!p) return 0;
    p.held = false;
    p.target = 0;
    var e = Math.abs(p.value);
    // 손을 떼는 순간 반대로 튕겨 나가게 해서 되돌아오는 출렁임을 만듭니다.
    p.vel += p.value * -9 * (0.5 + this.wobble);
    return e;
  };

  Sim.prototype.releaseAll = function () {
    for (var i = 0; i < this.pokes.length; i++) if (this.pokes[i].held) this.release(this.pokes[i].id);
  };

  Sim.prototype.heldCount = function () {
    var n = 0;
    for (var i = 0; i < this.pokes.length; i++) if (this.pokes[i].held) n++;
    return n;
  };

  function integrate(o, k, c, dt) {
    // 세미-임플리시트 오일러. dt 를 잘게 나눠 큰 프레임 드랍에도 터지지 않게 합니다.
    var steps = Math.min(8, Math.max(1, Math.ceil(dt / 0.008)));
    var h = dt / steps;
    for (var i = 0; i < steps; i++) {
      var a = k * (o.target - o.value) - c * o.vel;
      o.vel += a * h;
      o.value += o.vel * h;
    }
  }

  Sim.prototype.step = function (dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;

    var k = this.stiffness();
    var critical = 2 * Math.sqrt(k);
    var heldDamp = critical * 1.05;                        // 누르는 동안엔 출렁이지 않게
    var freeDamp = critical * (0.36 - 0.24 * this.wobble); // 뗀 뒤엔 오래 출렁이게

    var held = 0;
    for (var i = this.pokes.length - 1; i >= 0; i--) {
      var p = this.pokes[i];
      integrate(p, k, p.held ? heldDamp : freeDamp, dt);
      if (p.held) held += p.press;
      else if (Math.abs(p.value) < 0.0006 && Math.abs(p.vel) < 0.012) {
        this.pokes.splice(i, 1);
      }
    }

    this.squash.target = Math.min(1, held) * 0.55;
    integrate(this.squash, k * 0.6, this.squash.target > 0 ? critical * 0.9 : critical * (0.30 - 0.2 * this.wobble), dt);
  };

  /** 셰이더로 넘길 vec4 배열 (u, v, 세기, 반지름) */
  Sim.prototype.uniforms = function () {
    var b = this._buf;
    for (var i = 0; i < MAX_POKES; i++) {
      var p = this.pokes[i];
      var o = i * 4;
      if (p) { b[o] = p.u; b[o + 1] = p.v; b[o + 2] = p.value; b[o + 3] = p.radius; }
      else { b[o] = b[o + 1] = b[o + 2] = 0; b[o + 3] = 0.001; }
    }
    return b;
  };

  Sim.prototype.count = function () { return Math.min(this.pokes.length, MAX_POKES); };

  /** 아무도 안 만질 때의 아주 느린 숨쉬기 */
  Sim.prototype.idle = function () {
    return Math.sin(this.time * 1.15) * 0.5 + Math.sin(this.time * 0.61 + 1.7) * 0.5;
  };

  Sim.prototype.isResting = function () {
    if (this.pokes.length) return false;
    return Math.abs(this.squash.value) < 0.0008 && Math.abs(this.squash.vel) < 0.01;
  };

  global.CS = global.CS || {};
  global.CS.Physics = { MAX_POKES: MAX_POKES, create: function () { return new Sim(); } };
})(window);
