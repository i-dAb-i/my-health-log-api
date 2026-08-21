# 크런치 슬라임 메이커

배경이 투명한 PNG를 올리면 **누르면 말랑거리고 소리가 나는 크런치 슬라임**이 됩니다.
안에 과일·동물·하트·크런치 파츠를 넣을 수 있고, PNG 한 장이나 영상(webm)으로 저장할 수 있습니다.

* 서버가 없습니다. 올린 이미지는 브라우저 밖으로 나가지 않습니다.
* 외부 라이브러리·폰트·이미지·음원을 하나도 쓰지 않습니다. 파일 하나만 있으면 오프라인에서도 열립니다.
* 파츠는 전부 Canvas 패스로, 소리는 전부 WebAudio 합성으로 그 자리에서 만듭니다.

---

## 바로 써보기

```
dist/crunch-slime.html
```

이 파일 하나를 더블클릭하면 끝입니다. 설치도, 인터넷도 필요 없습니다.

## 개발

```bash
# 아무 정적 서버나 됩니다
python3 -m http.server 8899      # 또는  npm run dev
# → http://localhost:8899
```

`index.html` 을 직접 열어도(file://) 동작합니다. 스크립트를 ES module 이 아니라
클래식 스크립트로 둔 이유가 이것입니다.

## 빌드 (단일 HTML 만들기)

```bash
node build.mjs                   # 또는  npm run build
# → dist/crunch-slime.html  (약 105 KB, 의존성 0)
```

`index.html` + `style.css` + `src/*.js` 를 한 파일로 인라인합니다. 빌드 도구는 쓰지 않습니다.

---

## 구조

| 파일 | 하는 일 |
|---|---|
| `src/gl.js` | WebGL 렌더러. 캐릭터와 파츠 레이어를 **같은 변형 필드**로 밀고 당겨서 한 덩어리처럼 보이게 합니다. 젤리 광택·두께 음영·그림자도 여기 프래그먼트 셰이더에 있습니다. |
| `src/physics.js` | 누른 자리마다 감쇠 스프링 하나. 누르는 동안엔 임계 감쇠(안 흔들림), 떼면 감쇠를 낮춰 출렁이게 합니다. 최대 6점 동시 터치. |
| `src/audio.js` | WebAudio 합성 엔진. `grains`(바삭), `sweep`(축축), `pop`(방울), `ping`(구슬·유리) 네 가지 빌딩 블록을 프리셋별로 섞습니다. |
| `src/parts.js` | 파츠 32종 카탈로그. 각 파츠는 `draw(ctx, s, color)` 하나로 정의됩니다. |
| `src/image.js` | 흰 배경 제거(테두리 flood fill + 헤일로 제거), 여백 잘라내기, 정사각형 맞춤, 파츠를 박을 **안쪽 영역** 계산(반복 침식). |
| `src/app.js` | UI 배선, 파츠 배치, 포인터 입력, 저장/내보내기. |

### 눌리는 원리

프래그먼트 셰이더가 각 픽셀의 텍스처 좌표를 옮겨서 그립니다.

```glsl
d += dir * 세기 * w * x * 2.35;   // 누른 자리를 둘러싼 찌그러짐
d += rel * 세기 * w * 0.70;       // 안쪽으로 빨려드는 느낌
```

파츠 레이어는 같은 변형에 배율만 살짝 다르게 먹여서, 슬라임 안쪽에 떠 있는 것처럼 보이게 합니다.
`uDepth` 를 올리면 파츠가 더 깊이 잠기고 색이 슬라임 쪽으로 물듭니다.

---

## 파츠 추가하기

`src/parts.js` 의 `PARTS` 배열에 하나 밀어 넣으면 끝입니다. 탭·썸네일·소리 연결은 자동입니다.

```js
{ id:'donut', name:'도넛', cat:'crunch', sound:'crunch', ratio:0.9,
  colors:['#ffb9d2','#ffd9a8','#c9b0ff'],      // 인스턴스마다 돌아가며 쓰입니다
  draw:function(ctx, s, c){
    ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI*2);
    ctx.fillStyle = '#f3c98b'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, s*0.85, 0, Math.PI*2);
    ctx.fillStyle = c; ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(0, 0, s*0.34, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }}
```

* `cat` — `fruit` / `animal` / `cute` / `crunch` 중 하나 (카테고리를 늘리려면 `CATEGORIES` 에도 추가)
* `sound` — `crunch` / `squish` / `clay` / `bubble` / `bead` / `glass` / `pop`.
  "파츠 소리 섞기"가 켜져 있으면 이 태그가 클릭음에 섞입니다.
* `ratio` — 다른 파츠 대비 기본 크기 배율
* `draw` — 원점을 중심으로 반지름 `s` 안에 그립니다

## 사운드 프리셋 추가하기

`src/audio.js` 의 `PRESET_MIX` 에 `[태그, 비중]` 목록을 추가하고, `PRESETS` 에 이름을 넣으면 칩이 생깁니다.

```js
PRESET_MIX.snow = [['glass', 1], ['crunch', 0.4], ['squish', 0.2]];
```

---

## 배포

### A. 단일 파일로 판매 (권장)

`node build.mjs` 로 만든 `dist/crunch-slime.html` 하나를 그대로 올려서 팔면 됩니다.
구매자는 다운로드해서 더블클릭하면 됩니다. 인터넷 없이도 동작하고, 링크 유출 걱정이 없습니다.

### B. 링크로 배포

정적 파일만 있으면 되므로 아무 데나 올라갑니다.

* **Netlify / Vercel** — 이 폴더를 드래그해서 올리면 끝입니다. 비공개 리포여도 무료로 됩니다.
* **GitHub Pages** — `.github/workflows/pages.yml` 이 들어 있습니다.
  Settings → Pages → Source 를 **GitHub Actions** 로 바꾸면 푸시할 때마다 자동 배포됩니다.
  ⚠️ 비공개 리포의 Pages 는 유료 플랜이 필요합니다. 무료 플랜이면 Netlify 쪽이 편합니다.

`dist/crunch-slime.html` 만 올려도 되고, 폴더 전체(`index.html` 기준)를 올려도 됩니다.

---

## 포스타입에 올릴 때 참고

**무엇을 파는가** — 링크만 팔면 링크가 퍼지는 순간 통제가 안 됩니다.
파일(`crunch-slime.html`) 배포를 기본으로 하고, 체험용으로 링크를 함께 거는 구성이 안전합니다.

**저작권** — 이 앱이 만들어내는 파츠 그림과 소리는 전부 코드가 그 자리에서 생성합니다.
외부 이미지·폰트·음원·라이브러리를 하나도 포함하지 않으므로, 제3자 소재 라이선스 문제가 없습니다.

**구매자가 올리는 이미지** — 구매자는 대개 자기가 좋아하는 캐릭터의 SD 토큰을 올립니다.
그 이미지의 권리는 이 프로그램과 무관하며 구매자 책임입니다. 판매글에 한 줄 적어 두면 좋습니다.

> 업로드한 이미지는 이용자의 브라우저 안에서만 처리되며 어디에도 저장·전송되지 않습니다.
> 사용하는 이미지의 저작권은 이용자 본인이 확인해 주세요.

**재배포 조건** — 기본 `LICENSE` 는 "구매자 개인 사용 허용, 재배포·재판매 금지"로 되어 있습니다.
오픈소스로 풀고 싶으면 MIT 로 바꾸면 됩니다. 다만 그 순간부터 재판매를 막을 수 없습니다.

**결제·환불** — 포스타입 정책을 따릅니다. 다운로드형 디지털 상품은 환불 규정이 따로 있으니
판매 전에 포스타입 크리에이터 가이드를 확인해 주세요.

---

## 브라우저 지원

WebGL 1.0 과 WebAudio 를 쓰는 최신 브라우저면 됩니다.
Chrome / Edge / Safari / Firefox 최신 버전, iOS Safari, Android Chrome 에서 동작합니다.

* 소리는 브라우저 정책상 **첫 터치 이후**에 나옵니다. (첫 클릭에서 오디오가 깨어납니다)
* 영상 녹화(`MediaRecorder` + `captureStream`)는 iOS Safari 에서 지원이 들쭉날쭉합니다.
  PNG 저장은 어디서나 됩니다.
* 미리보기 샌드박스(예: 임베드된 뷰어)에서는 다운로드가 막힐 수 있습니다. 이때는 파일을 직접 열어 주세요.

## 라이선스

`LICENSE` 참고.
