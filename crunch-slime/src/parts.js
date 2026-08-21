/* 크런치 슬라임 — 파츠 카탈로그
 * 모든 파츠는 Canvas 2D 패스로 직접 그립니다. 외부 이미지/폰트/이모지를 쓰지 않으므로
 * 상업적 재배포에 저작권 문제가 없습니다.
 * 각 draw(ctx, s, c)는 원점(0,0)을 중심으로 반지름 s 안쪽에 그립니다.
 */
(function (global) {
  'use strict';
  var TAU = Math.PI * 2;

  function circ(ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function ell(ctx, x, y, rx, ry, rot, fill) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function poly(ctx, pts, fill) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function star(ctx, s, n, inner, fill, rot) {
    ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = (i / (n * 2)) * TAU - Math.PI / 2 + (rot || 0);
      var r = i % 2 ? s * inner : s;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function gloss(ctx, s, x, y, r, a) {
    ctx.save(); ctx.globalAlpha = a == null ? 0.72 : a;
    ell(ctx, s * x, s * y, s * r, s * r * 0.68, -0.5, '#ffffff');
    ctx.restore();
  }
  function citrus(ctx, s, rind, flesh, seg, pith) {
    circ(ctx, 0, 0, s, rind);
    circ(ctx, 0, 0, s * 0.86, pith || '#fffdf6');
    for (var i = 0; i < seg; i++) {
      var a = (i / seg) * TAU, w = (TAU / seg) * 0.40;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, s * 0.76, a - w, a + w); ctx.closePath();
      ctx.fillStyle = flesh; ctx.fill();
    }
    circ(ctx, 0, 0, s * 0.09, pith || '#fffdf6');
  }
  function face(ctx, s, eyeY, eyeX, eyeR) {
    ctx.fillStyle = 'rgba(40,24,34,.82)';
    circ(ctx, -s * eyeX, s * eyeY, s * eyeR, 'rgba(40,24,34,.82)');
    circ(ctx, s * eyeX, s * eyeY, s * eyeR, 'rgba(40,24,34,.82)');
  }
  function blush(ctx, s, y, x, c) {
    ctx.save(); ctx.globalAlpha = 0.5;
    ell(ctx, -s * x, s * y, s * 0.15, s * 0.09, 0, c || '#ff9dbb');
    ell(ctx, s * x, s * y, s * 0.15, s * 0.09, 0, c || '#ff9dbb');
    ctx.restore();
  }
  function heartPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.86);
    ctx.bezierCurveTo(-s * 1.32, s * 0.06, -s * 0.68, -s * 0.98, 0, -s * 0.28);
    ctx.bezierCurveTo(s * 0.68, -s * 0.98, s * 1.32, s * 0.06, 0, s * 0.86);
    ctx.closePath();
  }

  var CATEGORIES = [
    { id: 'fruit',  name: '과일' },
    { id: 'animal', name: '동물' },
    { id: 'cute',   name: '하트·별' },
    { id: 'crunch', name: '크런치' }
  ];

  var PARTS = [
    /* ---------------- 과일 ---------------- */
    { id:'strawberry', name:'딸기', cat:'fruit', sound:'squish', ratio:1,
      colors:['#ff4d6d','#ff7a95','#e5334f'],
      draw:function(ctx,s,c){
        ctx.beginPath();
        ctx.moveTo(0,s); ctx.bezierCurveTo(-s*1.05,s*0.28,-s*0.86,-s*0.72,0,-s*0.62);
        ctx.bezierCurveTo(s*0.86,-s*0.72,s*1.05,s*0.28,0,s);
        ctx.closePath(); ctx.fillStyle=c; ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.85)';
        for(var i=0;i<7;i++){ var a=i*1.9, rr=s*(0.22+((i*37)%50)/100*0.42);
          ell(ctx,Math.cos(a)*rr*0.8,Math.sin(a)*rr+s*0.1,s*0.055,s*0.085,a,'rgba(255,250,230,.9)'); }
        poly(ctx,[[0,-s*0.9],[-s*0.5,-s*0.5],[-s*0.2,-s*0.52],[-s*0.36,-s*0.14],[0,-s*0.42],
                  [s*0.36,-s*0.14],[s*0.2,-s*0.52],[s*0.5,-s*0.5]],'#4fb96b');
        gloss(ctx,s,-0.3,-0.1,0.17,0.5);
      }},
    { id:'lemon', name:'레몬', cat:'fruit', sound:'squish', ratio:1,
      colors:['#ffd93d','#ffc61a'],
      draw:function(ctx,s,c){ citrus(ctx,s,c,'#fff17a',8); gloss(ctx,s,-0.32,-0.34,0.16,0.55); }},
    { id:'orange', name:'오렌지', cat:'fruit', sound:'squish', ratio:1,
      colors:['#ff9a3c','#ff7f1f'],
      draw:function(ctx,s,c){ citrus(ctx,s,c,'#ffc06b',9); gloss(ctx,s,-0.32,-0.34,0.16,0.5); }},
    { id:'kiwi', name:'키위', cat:'fruit', sound:'squish', ratio:1,
      colors:['#8a6a3a','#a07c46'],
      draw:function(ctx,s,c){
        circ(ctx,0,0,s,c); circ(ctx,0,0,s*0.88,'#a8d84f'); circ(ctx,0,0,s*0.3,'#f4ffd8');
        for(var i=0;i<10;i++){ var a=i/10*TAU;
          ell(ctx,Math.cos(a)*s*0.55,Math.sin(a)*s*0.55,s*0.05,s*0.09,a+Math.PI/2,'#2f2a20'); }
        gloss(ctx,s,-0.3,-0.36,0.15,0.4);
      }},
    { id:'watermelon', name:'수박', cat:'fruit', sound:'squish', ratio:1,
      colors:['#ff5e6c','#ff8189'],
      draw:function(ctx,s,c){
        ctx.beginPath(); ctx.moveTo(0,s*0.78); ctx.arc(0,s*0.78,s*1.34,-Math.PI*0.78,-Math.PI*0.22);
        ctx.closePath(); ctx.fillStyle='#3fae5a'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(0,s*0.78); ctx.arc(0,s*0.78,s*1.21,-Math.PI*0.765,-Math.PI*0.235);
        ctx.closePath(); ctx.fillStyle='#eafbe4'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(0,s*0.78); ctx.arc(0,s*0.78,s*1.09,-Math.PI*0.755,-Math.PI*0.245);
        ctx.closePath(); ctx.fillStyle=c; ctx.fill();
        ell(ctx,-s*0.34,-s*0.05,s*0.06,s*0.1,0.3,'#2f2a20');
        ell(ctx,s*0.34,-s*0.05,s*0.06,s*0.1,-0.3,'#2f2a20');
        ell(ctx,0,s*0.3,s*0.06,s*0.1,0,'#2f2a20');
      }},
    { id:'cherry', name:'체리', cat:'fruit', sound:'pop', ratio:1,
      colors:['#e0294a','#ff4364'],
      draw:function(ctx,s,c){
        ctx.strokeStyle='#4fb96b'; ctx.lineWidth=s*0.11; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(-s*0.42,s*0.28); ctx.quadraticCurveTo(-s*0.1,-s*0.75,s*0.06,-s*0.9);
        ctx.moveTo(s*0.46,s*0.3); ctx.quadraticCurveTo(s*0.34,-s*0.6,s*0.06,-s*0.9); ctx.stroke();
        circ(ctx,-s*0.42,s*0.46,s*0.48,c); circ(ctx,s*0.46,s*0.48,s*0.46,c);
        gloss(ctx,s,-0.55,0.3,0.12,0.6); gloss(ctx,s,0.33,0.32,0.11,0.6);
      }},
    { id:'blueberry', name:'블루베리', cat:'fruit', sound:'pop', ratio:0.72,
      colors:['#5865c9','#7a6fd8','#4450a8'],
      draw:function(ctx,s,c){
        circ(ctx,0,0,s,c);
        ctx.save(); ctx.globalAlpha=.55; star(ctx,s*0.36,5,0.42,'#2c3170',0.4); ctx.restore();
        gloss(ctx,s,-0.34,-0.36,0.2,0.45);
      }},
    { id:'peach', name:'복숭아', cat:'fruit', sound:'squish', ratio:1,
      colors:['#ffb3c6','#ff9db4'],
      draw:function(ctx,s,c){
        circ(ctx,-s*0.2,0,s*0.82,c); circ(ctx,s*0.2,0,s*0.82,c);
        ctx.save(); ctx.globalAlpha=.35; ell(ctx,0,s*0.1,s*0.1,s*0.7,0,'#e77a99'); ctx.restore();
        poly(ctx,[[s*0.1,-s*0.78],[s*0.66,-s*1.06],[s*0.3,-s*0.6]],'#5cbb70');
        gloss(ctx,s,-0.45,-0.35,0.16,0.5);
      }},

    /* ---------------- 동물 ---------------- */
    { id:'bear', name:'곰', cat:'animal', sound:'squish', ratio:1,
      colors:['#c79465','#e0b184','#a97548'],
      draw:function(ctx,s,c){
        circ(ctx,-s*0.66,-s*0.62,s*0.34,c); circ(ctx,s*0.66,-s*0.62,s*0.34,c);
        circ(ctx,-s*0.66,-s*0.62,s*0.18,'rgba(255,190,190,.75)');
        circ(ctx,s*0.66,-s*0.62,s*0.18,'rgba(255,190,190,.75)');
        circ(ctx,0,0,s*0.9,c);
        ell(ctx,0,s*0.3,s*0.42,s*0.3,0,'rgba(255,248,238,.9)');
        face(ctx,s,-0.12,0.34,0.12);
        ell(ctx,0,s*0.18,s*0.11,s*0.085,0,'#3a2620');
        blush(ctx,s,0.12,0.62);
      }},
    { id:'cat', name:'고양이', cat:'animal', sound:'squish', ratio:1,
      colors:['#f6f1ea','#ffc98a','#8d8f9c'],
      draw:function(ctx,s,c){
        poly(ctx,[[-s*0.85,-s*0.42],[-s*0.72,-s*1.08],[-s*0.16,-s*0.66]],c);
        poly(ctx,[[s*0.85,-s*0.42],[s*0.72,-s*1.08],[s*0.16,-s*0.66]],c);
        circ(ctx,0,0,s*0.9,c);
        face(ctx,s,-0.1,0.36,0.115);
        poly(ctx,[[-s*0.1,s*0.14],[s*0.1,s*0.14],[0,s*0.28]],'#f08aa4');
        ctx.strokeStyle='rgba(60,44,50,.4)'; ctx.lineWidth=s*0.045; ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(-s*0.3,s*0.24); ctx.lineTo(-s*0.78,s*0.16);
        ctx.moveTo(-s*0.3,s*0.32); ctx.lineTo(-s*0.76,s*0.42);
        ctx.moveTo(s*0.3,s*0.24); ctx.lineTo(s*0.78,s*0.16);
        ctx.moveTo(s*0.3,s*0.32); ctx.lineTo(s*0.76,s*0.42); ctx.stroke();
        blush(ctx,s,0.14,0.6);
      }},
    { id:'bunny', name:'토끼', cat:'animal', sound:'squish', ratio:1,
      colors:['#fdf6f2','#ffd9e4','#e8e4f5'],
      draw:function(ctx,s,c){
        ell(ctx,-s*0.34,-s*0.92,s*0.22,s*0.56,0.14,c);
        ell(ctx,s*0.34,-s*0.92,s*0.22,s*0.56,-0.14,c);
        ell(ctx,-s*0.34,-s*0.92,s*0.11,s*0.36,0.14,'rgba(255,168,190,.8)');
        ell(ctx,s*0.34,-s*0.92,s*0.11,s*0.36,-0.14,'rgba(255,168,190,.8)');
        circ(ctx,0,s*0.1,s*0.86,c);
        face(ctx,s,0.0,0.34,0.115);
        poly(ctx,[[-s*0.09,s*0.24],[s*0.09,s*0.24],[0,s*0.36]],'#f08aa4');
        blush(ctx,s,0.24,0.58);
      }},
    { id:'chick', name:'병아리', cat:'animal', sound:'pop', ratio:1,
      colors:['#ffdf5e','#ffd12e'],
      draw:function(ctx,s,c){
        circ(ctx,0,0,s*0.92,c);
        poly(ctx,[[0,-s*1.02],[-s*0.14,-s*0.84],[s*0.14,-s*0.84]],'#ffcf3a');
        face(ctx,s,-0.12,0.32,0.115);
        poly(ctx,[[-s*0.16,s*0.12],[s*0.16,s*0.12],[0,s*0.36]],'#ff9c2e');
        blush(ctx,s,0.1,0.6,'#ff8fa8');
      }},
    { id:'frog', name:'개구리', cat:'animal', sound:'squish', ratio:1,
      colors:['#7fd160','#5cbf4d','#a5e07f'],
      draw:function(ctx,s,c){
        circ(ctx,-s*0.55,-s*0.62,s*0.36,c); circ(ctx,s*0.55,-s*0.62,s*0.36,c);
        circ(ctx,-s*0.55,-s*0.66,s*0.2,'#fffdf2'); circ(ctx,s*0.55,-s*0.66,s*0.2,'#fffdf2');
        circ(ctx,-s*0.55,-s*0.64,s*0.1,'#2a2a24'); circ(ctx,s*0.55,-s*0.64,s*0.1,'#2a2a24');
        circ(ctx,0,s*0.05,s*0.88,c);
        ctx.strokeStyle='rgba(30,60,26,.55)'; ctx.lineWidth=s*0.07; ctx.lineCap='round';
        ctx.beginPath(); ctx.arc(0,s*0.06,s*0.46,0.28*Math.PI,0.72*Math.PI); ctx.stroke();
        blush(ctx,s,0.2,0.56,'#ff9db4');
      }},
    { id:'paw', name:'발바닥', cat:'animal', sound:'squish', ratio:1,
      colors:['#ffb0c4','#ffc9a6','#d9c3f0'],
      draw:function(ctx,s,c){
        ell(ctx,0,s*0.34,s*0.62,s*0.5,0,c);
        ell(ctx,-s*0.62,-s*0.24,s*0.23,s*0.3,-0.35,c);
        ell(ctx,-s*0.22,-s*0.6,s*0.23,s*0.31,-0.13,c);
        ell(ctx,s*0.22,-s*0.6,s*0.23,s*0.31,0.13,c);
        ell(ctx,s*0.62,-s*0.24,s*0.23,s*0.3,0.35,c);
      }},
    { id:'panda', name:'판다', cat:'animal', sound:'squish', ratio:1,
      colors:['#fbfbfb','#f2f0ee'],
      draw:function(ctx,s,c){
        circ(ctx,-s*0.66,-s*0.6,s*0.32,'#2f2b2e'); circ(ctx,s*0.66,-s*0.6,s*0.32,'#2f2b2e');
        circ(ctx,0,0,s*0.9,c);
        ell(ctx,-s*0.36,-s*0.1,s*0.24,s*0.29,-0.3,'#2f2b2e');
        ell(ctx,s*0.36,-s*0.1,s*0.24,s*0.29,0.3,'#2f2b2e');
        circ(ctx,-s*0.34,-s*0.1,s*0.1,'#fff'); circ(ctx,s*0.34,-s*0.1,s*0.1,'#fff');
        ell(ctx,0,s*0.24,s*0.12,s*0.09,0,'#2f2b2e');
      }},
    { id:'fish', name:'물고기', cat:'animal', sound:'pop', ratio:1,
      colors:['#7ec8ff','#ffa9c9','#ffd06b'],
      draw:function(ctx,s,c){
        poly(ctx,[[s*0.34,0],[s*1.0,-s*0.5],[s*1.0,s*0.5]],c);
        ell(ctx,-s*0.14,0,s*0.76,s*0.54,0,c);
        circ(ctx,-s*0.42,-s*0.1,s*0.13,'#fffdf6'); circ(ctx,-s*0.44,-s*0.1,s*0.07,'#2f2a2a');
        ctx.save(); ctx.globalAlpha=.3;
        ctx.beginPath(); ctx.arc(s*0.1,0,s*0.34,-1.1,1.1); ctx.strokeStyle='#fff'; ctx.lineWidth=s*0.08; ctx.stroke();
        ctx.restore();
      }},
    { id:'duck', name:'오리', cat:'animal', sound:'pop', ratio:1,
      colors:['#ffe27a','#ffd44f'],
      draw:function(ctx,s,c){
        ell(ctx,-s*0.1,s*0.36,s*0.8,s*0.52,0,c);
        circ(ctx,s*0.3,-s*0.36,s*0.5,c);
        poly(ctx,[[s*0.7,-s*0.4],[s*1.12,-s*0.28],[s*0.7,-s*0.14]],'#ff9c2e');
        circ(ctx,s*0.3,-s*0.46,s*0.09,'#2f2a2a');
      }},

    /* ---------------- 하트·별 ---------------- */
    { id:'heart', name:'하트', cat:'cute', sound:'pop', ratio:1,
      colors:['#ff5f8d','#ff8fb0','#ff3f6e','#ffc2d4'],
      draw:function(ctx,s,c){ heartPath(ctx,s*0.86); ctx.fillStyle=c; ctx.fill(); gloss(ctx,s,-0.3,-0.18,0.16,0.55); }},
    { id:'star', name:'별', cat:'cute', sound:'bead', ratio:1,
      colors:['#ffd93d','#ffe98a','#ffb443'],
      draw:function(ctx,s,c){ star(ctx,s,5,0.46,c); gloss(ctx,s,-0.22,-0.28,0.13,0.5); }},
    { id:'flower', name:'꽃', cat:'cute', sound:'squish', ratio:1,
      colors:['#ffb8d2','#fff0f5','#c7b6ff','#ffd9a8'],
      draw:function(ctx,s,c){
        for(var i=0;i<5;i++){ var a=i/5*TAU-Math.PI/2;
          ell(ctx,Math.cos(a)*s*0.52,Math.sin(a)*s*0.52,s*0.44,s*0.32,a,c); }
        circ(ctx,0,0,s*0.28,'#ffd94f');
      }},
    { id:'ribbon', name:'리본', cat:'cute', sound:'squish', ratio:1,
      colors:['#ff87ab','#ffd166','#a5c8ff'],
      draw:function(ctx,s,c){
        poly(ctx,[[-s*0.12,0],[-s*0.96,-s*0.56],[-s*0.86,s*0.5],[-s*0.12,s*0.1]],c);
        poly(ctx,[[s*0.12,0],[s*0.96,-s*0.56],[s*0.86,s*0.5],[s*0.12,s*0.1]],c);
        circ(ctx,0,s*0.02,s*0.24,c);
        gloss(ctx,s,-0.5,-0.2,0.12,0.4);
      }},
    { id:'butterfly', name:'나비', cat:'cute', sound:'bead', ratio:1,
      colors:['#c9a7ff','#ffb0d0','#9adcff'],
      draw:function(ctx,s,c){
        ell(ctx,-s*0.48,-s*0.3,s*0.44,s*0.32,-0.5,c);
        ell(ctx,s*0.48,-s*0.3,s*0.44,s*0.32,0.5,c);
        ell(ctx,-s*0.38,s*0.4,s*0.32,s*0.26,0.4,c);
        ell(ctx,s*0.38,s*0.4,s*0.32,s*0.26,-0.4,c);
        ell(ctx,0,s*0.05,s*0.08,s*0.46,0,'rgba(60,44,60,.8)');
      }},
    { id:'cloud', name:'구름', cat:'cute', sound:'squish', ratio:1,
      colors:['#ffffff','#e8f2ff','#ffeaf3'],
      draw:function(ctx,s,c){
        circ(ctx,-s*0.42,s*0.1,s*0.42,c); circ(ctx,s*0.42,s*0.12,s*0.38,c);
        circ(ctx,0,-s*0.18,s*0.54,c);
        ctx.beginPath(); ctx.rect(-s*0.44,s*0.06,s*0.88,s*0.42); ctx.fillStyle=c; ctx.fill();
      }},
    { id:'moon', name:'달', cat:'cute', sound:'bead', ratio:1,
      colors:['#ffe07a','#fff3c4'],
      draw:function(ctx,s,c){
        ctx.save();
        ctx.beginPath(); ctx.arc(0,0,s,0,TAU);
        ctx.arc(s*0.44,-s*0.16,s*0.82,0,TAU,true);
        ctx.fillStyle=c; ctx.fill('evenodd');
        ctx.restore();
      }},
    { id:'sparkle', name:'반짝이', cat:'cute', sound:'glass', ratio:0.85,
      colors:['#ffffff','#fff3a8','#c9f0ff'],
      draw:function(ctx,s,c){ star(ctx,s,4,0.22,c); ctx.save(); ctx.globalAlpha=.6; star(ctx,s*0.5,4,0.24,'#fff',Math.PI/4); ctx.restore(); }},

    /* ---------------- 크런치 ---------------- */
    { id:'bead', name:'구슬', cat:'crunch', sound:'bead', ratio:0.7,
      colors:['#ff9ec4','#9fd8ff','#c3b0ff','#ffd98a','#a8ecc7'],
      draw:function(ctx,s,c){ circ(ctx,0,0,s,c); gloss(ctx,s,-0.34,-0.36,0.26,0.7); }},
    { id:'pearl', name:'진주', cat:'crunch', sound:'bead', ratio:0.68,
      colors:['#fdf6ff','#f3e9ff','#fff0f6'],
      draw:function(ctx,s,c){
        var g=ctx.createRadialGradient(-s*0.3,-s*0.32,s*0.05,0,0,s*1.05);
        g.addColorStop(0,'#ffffff'); g.addColorStop(0.55,c); g.addColorStop(1,'#d8c9e6');
        circ(ctx,0,0,s,null); ctx.fillStyle=g; ctx.fill();
      }},
    { id:'foam', name:'폼볼', cat:'crunch', sound:'squish', ratio:0.62,
      colors:['#fff2b8','#c9f7d8','#ffd4e6','#cfe4ff'],
      draw:function(ctx,s,c){ circ(ctx,0,0,s,c);
        ctx.save(); ctx.globalAlpha=.28; circ(ctx,s*0.24,s*0.2,s*0.4,'#8d8a9a'); ctx.restore();
        gloss(ctx,s,-0.32,-0.34,0.22,0.55); }},
    { id:'hex', name:'육각 스프링클', cat:'crunch', sound:'crunch', ratio:0.62,
      colors:['#ff8fb0','#8fd9ff','#ffe07a','#b6f0b0','#d0b8ff'],
      draw:function(ctx,s,c){
        ctx.beginPath();
        for(var i=0;i<6;i++){ var a=i/6*TAU; ctx[i?'lineTo':'moveTo'](Math.cos(a)*s,Math.sin(a)*s); }
        ctx.closePath(); ctx.fillStyle=c; ctx.fill(); gloss(ctx,s,-0.2,-0.24,0.2,0.4);
      }},
    { id:'shard', name:'유리 조각', cat:'crunch', sound:'glass', ratio:0.9,
      colors:['#dff4ff','#ffe9f4','#e9e2ff'],
      draw:function(ctx,s,c){
        ctx.save(); ctx.globalAlpha=.82;
        poly(ctx,[[-s*0.9,-s*0.3],[-s*0.1,-s*0.95],[s*0.85,-s*0.2],[s*0.3,s*0.9],[-s*0.5,s*0.62]],c);
        ctx.globalAlpha=.9; ctx.strokeStyle='rgba(255,255,255,.95)'; ctx.lineWidth=s*0.09;
        ctx.beginPath(); ctx.moveTo(-s*0.1,-s*0.95); ctx.lineTo(s*0.05,s*0.2); ctx.lineTo(s*0.3,s*0.9); ctx.stroke();
        ctx.restore();
      }},
    { id:'ice', name:'얼음', cat:'crunch', sound:'glass', ratio:0.8,
      colors:['#e6f7ff','#f0fbff'],
      draw:function(ctx,s,c){
        ctx.save(); ctx.globalAlpha=.8;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(-s*0.8,-s*0.8,s*1.6,s*1.6,s*0.28);
        else ctx.rect(-s*0.8,-s*0.8,s*1.6,s*1.6);
        ctx.fillStyle=c; ctx.fill();
        ctx.globalAlpha=.85; ell(ctx,-s*0.3,-s*0.32,s*0.26,s*0.14,-0.6,'#ffffff');
        ctx.restore();
      }},
    { id:'snow', name:'눈꽃', cat:'crunch', sound:'glass', ratio:0.9,
      colors:['#ffffff','#dff1ff'],
      draw:function(ctx,s,c){
        ctx.strokeStyle=c; ctx.lineWidth=s*0.14; ctx.lineCap='round';
        ctx.beginPath();
        for(var i=0;i<3;i++){ var a=i/3*Math.PI;
          ctx.moveTo(-Math.cos(a)*s,-Math.sin(a)*s); ctx.lineTo(Math.cos(a)*s,Math.sin(a)*s); }
        ctx.stroke();
        ctx.lineWidth=s*0.1;
        ctx.beginPath();
        for(var j=0;j<6;j++){ var b=j/6*TAU, px=Math.cos(b)*s*0.6, py=Math.sin(b)*s*0.6;
          ctx.moveTo(px,py); ctx.lineTo(px+Math.cos(b+0.9)*s*0.3,py+Math.sin(b+0.9)*s*0.3);
          ctx.moveTo(px,py); ctx.lineTo(px+Math.cos(b-0.9)*s*0.3,py+Math.sin(b-0.9)*s*0.3); }
        ctx.stroke();
      }},
    { id:'stick', name:'막대 스프링클', cat:'crunch', sound:'crunch', ratio:0.55,
      colors:['#ff8fb0','#8fd9ff','#ffe07a','#b6f0b0','#ffffff'],
      draw:function(ctx,s,c){
        ctx.save(); ctx.rotate(0.5); ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(-s*1.25,-s*0.34,s*2.5,s*0.68,s*0.34);
        else ctx.rect(-s*1.25,-s*0.34,s*2.5,s*0.68);
        ctx.fillStyle=c; ctx.fill(); ctx.restore();
      }},
    { id:'popcorn', name:'뻥이오', cat:'crunch', sound:'crunch', ratio:0.85,
      colors:['#fff6dd','#ffeec2'],
      draw:function(ctx,s,c){
        circ(ctx,-s*0.4,s*0.2,s*0.5,c); circ(ctx,s*0.34,s*0.3,s*0.46,c);
        circ(ctx,0,-s*0.34,s*0.54,c); circ(ctx,s*0.42,-s*0.3,s*0.36,c);
        circ(ctx,-s*0.3,-s*0.4,s*0.32,c);
      }},
    { id:'cereal', name:'시리얼', cat:'crunch', sound:'crunch', ratio:0.78,
      colors:['#ffb45e','#e79a4a'],
      draw:function(ctx,s,c){
        circ(ctx,0,0,s,c);
        ctx.save(); ctx.globalCompositeOperation='destination-out'; circ(ctx,0,0,s*0.36,'#000'); ctx.restore();
        ctx.save(); ctx.globalAlpha=.3; circ(ctx,s*0.16,s*0.18,s*0.9,'#8a5a26'); ctx.restore();
      }}
  ];

  var BY_ID = {};
  PARTS.forEach(function (p) { BY_ID[p.id] = p; });

  /** 파츠 하나를 지정한 캔버스 컨텍스트에 그립니다. */
  function drawPart(ctx, id, size, colorIndex, rotation) {
    var p = BY_ID[id]; if (!p) return;
    var c = p.colors[(colorIndex | 0) % p.colors.length];
    ctx.save();
    if (rotation) ctx.rotate(rotation);
    p.draw(ctx, size * (p.ratio || 1), c);
    ctx.restore();
  }

  /** 파츠 미리보기 썸네일 캔버스를 만듭니다. */
  function thumbnail(id, px) {
    px = px || 44;
    var cv = document.createElement('canvas');
    var dpr = Math.min(global.devicePixelRatio || 1, 3);
    cv.width = px * dpr; cv.height = px * dpr;
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.translate(px / 2, px / 2);
    drawPart(ctx, id, px * 0.36, 0, 0);
    return cv;
  }

  /**
   * (파츠 × 색상) 조합을 한 장의 스프라이트 시트로 굽습니다.
   * 파츠는 슬라임과 달리 뭉개지지 않는 고체라서, 본체 텍스처에 섞어 그리지 않고
   * 이 아틀라스에서 쿼드로 따로 그립니다. 위치와 회전만 밀리고 모양은 그대로입니다.
   */
  function buildAtlas(tilePx) {
    var tile = tilePx || 128;
    var cells = [];
    PARTS.forEach(function (p) {
      for (var i = 0; i < p.colors.length; i++) cells.push({ id: p.id, ci: i });
    });
    var cols = Math.ceil(Math.sqrt(cells.length));
    var rows = Math.ceil(cells.length / cols);

    var cv = document.createElement('canvas');
    cv.width = cols * tile;
    cv.height = rows * tile;
    var ctx = cv.getContext('2d');

    var uv = {};
    var inset = 0.5 / Math.max(cv.width, cv.height); // 이웃 타일 번짐 방지
    cells.forEach(function (cell, n) {
      var cx = (n % cols), cy = Math.floor(n / cols);
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx * tile, cy * tile, tile, tile);
      ctx.clip();
      ctx.translate((cx + 0.5) * tile, (cy + 0.5) * tile);
      drawPart(ctx, cell.id, tile * 0.34, cell.ci, 0);
      ctx.restore();
      uv[cell.id + '|' + cell.ci] = [
        (cx * tile) / cv.width + inset,
        (cy * tile) / cv.height + inset,
        ((cx + 1) * tile) / cv.width - inset,
        ((cy + 1) * tile) / cv.height - inset
      ];
    });

    return { canvas: cv, uv: uv, tile: tile, cols: cols, rows: rows, count: cells.length };
  }

  global.CS = global.CS || {};
  global.CS.Parts = {
    CATEGORIES: CATEGORIES,
    LIST: PARTS,
    byId: function (id) { return BY_ID[id]; },
    draw: drawPart,
    thumbnail: thumbnail,
    buildAtlas: buildAtlas
  };
})(window);
