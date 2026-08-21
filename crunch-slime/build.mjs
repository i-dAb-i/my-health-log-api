/* 단일 HTML 파일로 묶습니다.
 *   node build.mjs
 * → dist/crunch-slime.html  (이 파일 하나만 있으면 어디서든 열립니다)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const SCRIPTS = ['src/parts.js', 'src/audio.js', 'src/image.js', 'src/physics.js', 'src/gl.js', 'src/app.js'];

let html = read('index.html');
const css = read('style.css');

// </script> 같은 문자열이 섞여 있으면 파일이 조기 종료되므로 확인합니다.
for (const f of SCRIPTS) {
  if (/<\/script/i.test(read(f))) {
    throw new Error(`${f} 안에 </script 문자열이 있습니다. 이스케이프가 필요합니다.`);
  }
}

html = html.replace(
  '<link rel="stylesheet" href="style.css">',
  `<style>\n${css}\n</style>`
);

const bundle = SCRIPTS
  .map((f) => `/* ===== ${f} ===== */\n${read(f)}`)
  .join('\n');

html = html.replace(
  new RegExp(SCRIPTS.map((f) => `<script src="${f}"></script>\\s*`).join(''), 'i'),
  `<script>\n${bundle}\n</script>\n`
);

if (html.includes('<script src=')) throw new Error('일부 스크립트가 인라인되지 않았습니다.');
if (html.includes('href="style.css"')) throw new Error('CSS가 인라인되지 않았습니다.');

mkdirSync(resolve(root, 'dist'), { recursive: true });
const out = resolve(root, 'dist/crunch-slime.html');
writeFileSync(out, html, 'utf8');

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`완성: dist/crunch-slime.html (${kb} KB)`);

/* 본문만 받는 호스트(claude.ai Artifact 등)용 — 래퍼 태그를 벗긴 판본.
 * 그런 호스트는 파일을 <!doctype><head></head><body> 안에 감싸서 띄우므로
 * 문서 태그가 중복되면 안 됩니다. 일반 배포에는 위의 crunch-slime.html 을 쓰세요. */
const bodyOnly = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html lang="ko">\s*/i, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body>\s*/gi, '')
  .replace(/<\/html>\s*/i, '')
  .trim() + '\n';
writeFileSync(resolve(root, 'dist/artifact.html'), bodyOnly, 'utf8');
console.log('완성: dist/artifact.html (본문 전용)');
