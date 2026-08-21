/* 크런치 슬라임 — 사운드 엔진
 * 모든 소리는 WebAudio로 실시간 합성합니다. 음원 파일을 쓰지 않으므로
 * 라이선스 걱정 없이 그대로 유료 배포할 수 있습니다.
 */
(function (global) {
  'use strict';

  var PRESETS = [
    { id: 'crunch', name: '크런치' },
    { id: 'squish', name: '스퀴시' },
    { id: 'clay',   name: '뽀득' },
    { id: 'bubble', name: '방울' },
    { id: 'glass',  name: '유리' }
  ];

  var ctx = null, master = null, dry = null, wet = null, verb = null, comp = null;
  var noiseBuf = null;
  var state = { volume: 0.75, reverb: 0.22, muted: false, preset: 'crunch', partTags: [], usePartTags: true };
  var voices = 0, lastRub = 0;
  var MAX_VOICES = 48;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function makeNoise(seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function makeImpulse(seconds, decay) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 22;
    comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;

    master = ctx.createGain();
    master.gain.value = state.muted ? 0 : state.volume;

    verb = ctx.createConvolver();
    verb.buffer = makeImpulse(1.7, 2.6);

    dry = ctx.createGain(); dry.gain.value = 1 - state.reverb * 0.5;
    wet = ctx.createGain(); wet.gain.value = state.reverb;

    master.connect(dry); dry.connect(comp);
    master.connect(wet); wet.connect(verb); verb.connect(comp);
    comp.connect(ctx.destination);

    noiseBuf = makeNoise(2);
    return true;
  }

  function noiseSource(rate) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = rate || 1;
    return src;
  }

  function track(node, stopAt) {
    voices++;
    node.onended = function () { voices--; };
    try { node.stop(stopAt); } catch (e) { voices--; }
  }

  /* ------------------------------------------------------------------ */
  /* 기본 음색 빌딩 블록                                                  */
  /* ------------------------------------------------------------------ */

  /** 알갱이 노이즈 폭발 — 바삭바삭한 크런치 */
  function grains(t0, o) {
    var n = o.count | 0;
    for (var i = 0; i < n; i++) {
      if (voices > MAX_VOICES) return;
      var t = t0 + Math.pow(Math.random(), 1.5) * o.spread;
      var src = noiseSource(rnd(0.8, 1.6));
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = rnd(o.fmin, o.fmax);
      bp.Q.value = o.q || rnd(3, 11);
      var g = ctx.createGain();
      var dur = rnd(o.dmin || 0.008, o.dmax || 0.03);
      var peak = o.gain * rnd(0.45, 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.0016);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t); track(src, t + dur + 0.02);
    }
  }

  /** 필터 스윕 노이즈 — 축축한 스퀴시 */
  function sweep(t0, o) {
    if (voices > MAX_VOICES) return;
    var src = noiseSource(rnd(0.9, 1.2));
    var f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.Q.value = o.q || 9;
    f.frequency.setValueAtTime(o.f0, t0);
    f.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur * 0.35);
    f.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); track(src, t0 + o.dur + 0.02);
  }

  /** 물방울 팝 — 사인파 급강하 */
  function pop(t0, o) {
    if (voices > MAX_VOICES) return;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); track(osc, t0 + o.dur + 0.02);
  }

  /** FM 핑 — 구슬·유리 */
  function ping(t0, o) {
    if (voices > MAX_VOICES) return;
    var car = ctx.createOscillator(); car.type = 'sine';
    car.frequency.value = o.freq;
    var mod = ctx.createOscillator(); mod.type = 'sine';
    mod.frequency.value = o.freq * (o.ratio || 2.7);
    var mg = ctx.createGain(); mg.gain.value = o.freq * (o.index || 1.6);
    mg.gain.setValueAtTime(o.freq * (o.index || 1.6), t0);
    mg.gain.exponentialRampToValueAtTime(1, t0 + o.dur * 0.5);
    mod.connect(mg); mg.connect(car.frequency);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    car.connect(g); g.connect(master);
    car.start(t0); mod.start(t0);
    track(car, t0 + o.dur + 0.02);
    try { mod.stop(t0 + o.dur + 0.02); } catch (e) {}
  }

  /** 낮은 "툭" — 사인파 대신 저역 노이즈라 훨씬 덜 인공적입니다. */
  function thud(t0, v) {
    if (voices > MAX_VOICES) return;
    var src = noiseSource(rnd(0.5, 0.9));
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(rnd(300, 420), t0);
    lp.frequency.exponentialRampToValueAtTime(rnd(90, 130), t0 + 0.09);
    lp.Q.value = 1.1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.30 * v, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.10);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t0); track(src, t0 + 0.12);
  }

  /* ------------------------------------------------------------------ */
  /* 슬라임 자체의 소리 — 끈적한 마찰. 음정이 있는 성분은 넣지 않습니다.   */
  /* ------------------------------------------------------------------ */
  var SLIME = {
    crunch: { f0: 620, f1: 2600, f2: 480, q: 6.5, dur: 0.25, wet: 0.85, pops: 0.40 },
    squish: { f0: 380, f1: 1500, f2: 260, q: 4.5, dur: 0.34, wet: 1.00, pops: 0.70 },
    clay:   { f0: 900, f1: 3000, f2: 700, q: 12.0, dur: 0.19, wet: 0.60, pops: 0.20 },
    bubble: { f0: 420, f1: 1300, f2: 300, q: 5.0, dur: 0.28, wet: 1.00, pops: 1.00 },
    glass:  { f0: 800, f1: 3800, f2: 600, q: 8.0, dur: 0.22, wet: 0.70, pops: 0.30 }
  };

  function slimePress(t, v) {
    var m = SLIME[state.preset] || SLIME.squish;
    var j = rnd(0.9, 1.14);   // 누를 때마다 조금씩 달라지게
    sweep(t, {
      type: 'bandpass', q: m.q * rnd(0.85, 1.2),
      f0: m.f0 * j, f1: m.f1 * j, f2: m.f2 * j,
      dur: m.dur * rnd(0.85, 1.2), gain: 0.30 * v
    });
    sweep(t + 0.012, {
      type: 'lowpass', q: 2.6,
      f0: 900 * j, f1: 340 * j, f2: 170 * j,
      dur: m.dur * 0.8, gain: 0.17 * v * m.wet
    });
    thud(t, v * 0.85);
    if (Math.random() < m.pops * 0.75) {
      pop(t + rnd(0.03, 0.11), { f0: rnd(420, 950), f1: rnd(90, 170), dur: rnd(0.05, 0.095), gain: 0.10 * v });
    }
  }

  /* ------------------------------------------------------------------ */
  /* 파츠끼리 부딪히는 와그작 — 파츠가 들어 있을 때만 납니다.              */
  /* ------------------------------------------------------------------ */
  var TAGS = {
    crunch: function (t, v) {
      grains(t, { count: Math.round(6 + v * 14), spread: 0.09, fmin: 1400, fmax: 7200, gain: 0.28 * v, dmin: 0.005, dmax: 0.026 });
    },
    squish: function (t, v) {
      sweep(t, { f0: 420, f1: 1500, f2: 260, q: 8, dur: 0.20, gain: 0.20 * v });
    },
    clay: function (t, v) {
      sweep(t, { f0: 1700, f1: 2900, f2: 1200, q: 17, dur: 0.15, gain: 0.18 * v, type: 'bandpass' });
    },
    bubble: function (t, v) {
      var n = Math.round(2 + v * 3);
      for (var i = 0; i < n; i++) pop(t + i * rnd(0.02, 0.06), { f0: rnd(600, 1400), f1: rnd(90, 200), dur: rnd(0.05, 0.11), gain: 0.22 * v });
    },
    bead: function (t, v) {
      var n = Math.round(2 + v * 4);
      for (var i = 0; i < n; i++) ping(t + i * rnd(0.012, 0.05), { freq: rnd(1100, 2600), ratio: rnd(2.1, 3.4), index: rnd(1, 2.4), dur: rnd(0.05, 0.12), gain: 0.14 * v });
    },
    glass: function (t, v) {
      var n = Math.round(3 + v * 5);
      for (var i = 0; i < n; i++) ping(t + i * rnd(0.01, 0.045), { freq: rnd(2600, 6200), ratio: rnd(3.1, 5.2), index: rnd(1.4, 3), dur: rnd(0.05, 0.11), gain: 0.10 * v });
    },
    pop: function (t, v) { TAGS.bubble(t, v); }
  };

  /**
   * load 0~1 — 슬라임에 든 파츠가 얼마나 많은지. 많을수록 알갱이가 촘촘하고 오래 갑니다.
   * 파츠가 하나도 없으면(load 0) 아무 소리도 내지 않습니다.
   */
  function partCrunch(t, v, load) {
    if (load <= 0.001 || !state.usePartTags) return;
    var amt = v * (0.35 + load * 0.65);
    grains(t + rnd(0, 0.012), {
      count: Math.round((3 + load * 20) * v),
      spread: 0.05 + load * 0.10,
      fmin: 1300, fmax: 7000, gain: 0.30 * amt, dmin: 0.005, dmax: 0.030
    });
    grains(t + rnd(0.015, 0.045), {
      count: Math.round((2 + load * 8) * v),
      spread: 0.09 + load * 0.09,
      fmin: 380, fmax: 1700, q: 2.4, gain: 0.19 * amt, dmin: 0.012, dmax: 0.055
    });
    // 넣은 파츠 종류의 색을 얹습니다(유리는 쨍하게, 구슬은 또르륵).
    var tags = state.partTags;
    for (var i = 0; i < tags.length; i++) {
      var fn = TAGS[tags[i]];
      if (fn && Math.random() < 0.55 + load * 0.4) fn(t + rnd(0, 0.04), amt * (0.5 / Math.sqrt(tags.length)));
    }
  }

  /* ------------------------------------------------------------------ */
  /* 공개 API                                                            */
  /* ------------------------------------------------------------------ */
  var API = {
    PRESETS: PRESETS,

    init: init,
    ready: function () { return !!ctx; },

    /** 꾹 누르기. load = 파츠가 든 정도 0~1 */
    press: function (intensity, load) {
      if (state.muted || !init()) return;
      var t = ctx.currentTime + 0.001;
      var v = Math.max(0.15, Math.min(1, intensity == null ? 0.8 : intensity));
      slimePress(t, v);
      partCrunch(t + 0.008, v, load || 0);
    },

    /** 문지르기 — 너무 자주 울리지 않도록 간격을 둡니다. */
    rub: function (intensity, load) {
      if (state.muted || !init()) return;
      var now = ctx.currentTime;
      if (now - lastRub < 0.055) return;
      lastRub = now;
      var v = Math.max(0.05, Math.min(0.6, intensity));
      var m = SLIME[state.preset] || SLIME.squish;
      sweep(now + 0.001, {
        type: 'bandpass', q: m.q * 0.8,
        f0: m.f0 * 1.15, f1: m.f1 * 0.9, f2: m.f2 * 1.1,
        dur: 0.14, gain: 0.19 * v
      });
      if (load > 0.001 && state.usePartTags) {
        grains(now + 0.001, {
          count: Math.round((1 + load * 9) * v * 2),
          spread: 0.055, fmin: 1800, fmax: 7600,
          gain: 0.22 * v * (0.4 + load * 0.6), dmin: 0.004, dmax: 0.020
        });
      }
    },

    /** 손을 뗄 때 — 붙었다 떨어지는 소리 */
    release: function (intensity) {
      if (state.muted || !init()) return;
      var t = ctx.currentTime + 0.001;
      var v = Math.max(0.08, Math.min(0.7, intensity));
      sweep(t, { type: 'bandpass', q: 7, f0: 300, f1: 1100, f2: 240, dur: 0.16, gain: 0.15 * v });
      if (Math.random() < 0.6) pop(t + 0.02, { f0: rnd(300, 560), f1: rnd(80, 140), dur: 0.08, gain: 0.09 * v });
    },

    setVolume: function (v) {
      state.volume = v;
      if (master) master.gain.setTargetAtTime(state.muted ? 0 : v, ctx.currentTime, 0.02);
    },
    setMuted: function (m) {
      state.muted = !!m;
      if (master) master.gain.setTargetAtTime(m ? 0 : state.volume, ctx.currentTime, 0.02);
    },
    setReverb: function (v) {
      state.reverb = v;
      if (wet) {
        wet.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
        dry.gain.setTargetAtTime(1 - v * 0.5, ctx.currentTime, 0.05);
      }
    },
    setPreset: function (id) { if (SLIME[id]) state.preset = id; },
    setPartTags: function (tags) {
      var seen = {}, out = [];
      (tags || []).forEach(function (t) { if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
      state.partTags = out.slice(0, 4);
    },
    setUsePartTags: function (b) { state.usePartTags = !!b; },
    isMuted: function () { return state.muted; },
    captureStream: function () {
      if (!init() || !ctx.createMediaStreamDestination) return null;
      var dest = ctx.createMediaStreamDestination();
      comp.connect(dest);
      return dest.stream;
    }
  };

  global.CS = global.CS || {};
  global.CS.Audio = API;
})(window);
