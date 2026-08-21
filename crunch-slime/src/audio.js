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

  /** 낮은 몸통 울림 — 슬라임 덩어리감 */
  function body(t0, amount) {
    if (voices > MAX_VOICES) return;
    var osc = ctx.createOscillator(); osc.type = 'triangle';
    osc.frequency.setValueAtTime(rnd(110, 150), t0);
    osc.frequency.exponentialRampToValueAtTime(rnd(48, 70), t0 + 0.19);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.14 * amount, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(g); g.connect(master);
    osc.start(t0); track(osc, t0 + 0.24);
  }

  /* ------------------------------------------------------------------ */
  /* 태그 단위 음색 — 파츠 종류가 그대로 소리가 됩니다                     */
  /* ------------------------------------------------------------------ */
  var TAGS = {
    crunch: function (t, v) {
      grains(t, { count: Math.round(9 + v * 16), spread: 0.10, fmin: 1400, fmax: 7200, gain: 0.30 * v, dmin: 0.006, dmax: 0.026 });
      grains(t + 0.012, { count: Math.round(4 + v * 7), spread: 0.13, fmin: 500, fmax: 1800, q: 2.2, gain: 0.20 * v, dmin: 0.012, dmax: 0.05 });
    },
    squish: function (t, v) {
      sweep(t, { f0: 420, f1: 1500, f2: 260, q: 8, dur: 0.26, gain: 0.30 * v });
      sweep(t + 0.03, { f0: 900, f1: 380, f2: 180, q: 12, dur: 0.20, gain: 0.16 * v, type: 'bandpass' });
    },
    clay: function (t, v) {
      sweep(t, { f0: 1700, f1: 2900, f2: 1200, q: 17, dur: 0.16, gain: 0.24 * v, type: 'bandpass' });
      grains(t, { count: 5, spread: 0.05, fmin: 2400, fmax: 5200, q: 14, gain: 0.14 * v, dmin: 0.01, dmax: 0.03 });
    },
    bubble: function (t, v) {
      var n = Math.round(2 + v * 4);
      for (var i = 0; i < n; i++) {
        pop(t + i * rnd(0.02, 0.06), { f0: rnd(600, 1400), f1: rnd(90, 200), dur: rnd(0.05, 0.11), gain: 0.26 * v });
      }
    },
    bead: function (t, v) {
      var n = Math.round(2 + v * 4);
      for (var i = 0; i < n; i++) {
        ping(t + i * rnd(0.015, 0.05), { freq: rnd(1100, 2600), ratio: rnd(2.1, 3.4), index: rnd(1, 2.4), dur: rnd(0.06, 0.13), gain: 0.15 * v });
      }
    },
    glass: function (t, v) {
      var n = Math.round(3 + v * 5);
      for (var i = 0; i < n; i++) {
        ping(t + i * rnd(0.01, 0.045), { freq: rnd(2600, 6200), ratio: rnd(3.1, 5.2), index: rnd(1.4, 3), dur: rnd(0.05, 0.12), gain: 0.10 * v });
      }
      grains(t, { count: 6, spread: 0.06, fmin: 4000, fmax: 9000, q: 16, gain: 0.10 * v, dmin: 0.005, dmax: 0.02 });
    },
    pop: function (t, v) { TAGS.bubble(t, v); }
  };

  var PRESET_MIX = {
    crunch: [['crunch', 1], ['squish', 0.35], ['clay', 0.2]],
    squish: [['squish', 1], ['bubble', 0.3]],
    clay:   [['clay', 1], ['crunch', 0.25]],
    bubble: [['bubble', 1], ['squish', 0.45]],
    glass:  [['glass', 1], ['bead', 0.5], ['crunch', 0.25]]
  };

  function render(t, intensity) {
    var mix = PRESET_MIX[state.preset] || PRESET_MIX.crunch;
    for (var i = 0; i < mix.length; i++) {
      var fn = TAGS[mix[i][0]];
      if (fn) fn(t, Math.max(0.05, intensity * mix[i][1]));
    }
    if (state.usePartTags && state.partTags.length) {
      var share = 0.55 / Math.sqrt(state.partTags.length);
      for (var j = 0; j < state.partTags.length; j++) {
        var f = TAGS[state.partTags[j]];
        if (f) f(t + rnd(0, 0.03), Math.max(0.05, intensity * share));
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 공개 API                                                            */
  /* ------------------------------------------------------------------ */
  var API = {
    PRESETS: PRESETS,

    init: init,
    ready: function () { return !!ctx; },

    press: function (intensity) {
      if (state.muted || !init()) return;
      var t = ctx.currentTime + 0.001;
      var v = Math.max(0.15, Math.min(1, intensity == null ? 0.8 : intensity));
      body(t, v);
      render(t, v);
    },

    /** 문지를 때 — 너무 자주 울리지 않도록 간격을 둡니다 */
    rub: function (intensity) {
      if (state.muted || !init()) return;
      var now = ctx.currentTime;
      if (now - lastRub < 0.055) return;
      lastRub = now;
      var v = Math.max(0.05, Math.min(0.55, intensity));
      sweep(now + 0.001, { f0: 700, f1: 2000, f2: 500, q: 6, dur: 0.13, gain: 0.16 * v, type: 'bandpass' });
      if (state.preset === 'crunch' || state.preset === 'glass') {
        grains(now + 0.001, { count: Math.round(2 + v * 8), spread: 0.06, fmin: 2000, fmax: 8000, gain: 0.16 * v, dmin: 0.004, dmax: 0.018 });
      }
    },

    /** 손을 뗄 때 — 되돌아오는 젤리 소리 */
    release: function (intensity) {
      if (state.muted || !init()) return;
      var t = ctx.currentTime + 0.001;
      var v = Math.max(0.1, Math.min(0.8, intensity));
      sweep(t, { f0: 260, f1: 900, f2: 200, q: 10, dur: 0.22, gain: 0.16 * v });
      pop(t + 0.02, { f0: rnd(300, 520), f1: rnd(80, 130), dur: 0.1, gain: 0.1 * v });
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
    setPreset: function (id) { if (PRESET_MIX[id]) state.preset = id; },
    setPartTags: function (tags) {
      var seen = {}, out = [];
      (tags || []).forEach(function (t) { if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
      state.partTags = out.slice(0, 4);
    },
    setUsePartTags: function (b) { state.usePartTags = !!b; },
    isMuted: function () { return state.muted; },
    /** 캔버스 녹화에 오디오를 함께 담기 위한 출력 스트림 */
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
