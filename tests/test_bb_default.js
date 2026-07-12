// [v274] 버스배정기초정보 등록폼 — 페이지 최초 진입 시 운행방향=참석 / 배정유형=1번째 항목 기본값 검증
//
// 실행: node test_bb_default.js [retreat-site 파일 경로]  (생략 시 폴더 내 최신 버전 자동 탐지)
const { JSDOM } = require('jsdom');
const { resolveLatestHtml, readHtmlScript, extractVarSource, extractFunctionSource } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);
const src = [
  extractVarSource(fullSrc, 'ASSIGN_TYPES_ARRIVE'),
  extractVarSource(fullSrc, 'ASSIGN_TYPES_LEAVE'),
  extractFunctionSource(fullSrc, 'bbFormReset'),
  extractFunctionSource(fullSrc, 'bbTypeOptionsRefresh'),
].join('\n');

const dom = new JSDOM(`<!doctype html><html><body>
  <select id="bb-direction">
    <option value="참석">참석</option>
    <option value="귀가">귀가</option>
  </select>
  <select id="bb-type"></select>
  <input id="bb-date"><input id="bb-time"><input id="bb-count">
  <table><tbody id="bb-driver-table-body"></tbody></table>
</body></html>`);
const document = dom.window.document;

const ctx = {
  document,
  $id: (id) => document.getElementById(id),
  $set: (id, v) => { const e = document.getElementById(id); if (e) e.value = v; },
  _bbEditingId: null,
};

const fn = new Function(...Object.keys(ctx), src + '\nreturn { bbFormReset: bbFormReset, bbTypeOptionsRefresh: bbTypeOptionsRefresh };');
const mod = fn(...Object.values(ctx));

console.log('▶ 테스트: bbFormReset() 최초 실행 시 기본값');
mod.bbFormReset();
const dirSel = document.getElementById('bb-direction');
const typeSel = document.getElementById('bb-type');
assert(dirSel.value === '참석', '운행방향 기본값 = 참석 (실제: ' + dirSel.value + ')');
assert(typeSel.value === '선발대(총괄,팀장,TFT)', '배정유형 기본값 = 목록 1번째 항목 (실제: "' + typeSel.value + '")');
assert(typeSel.selectedIndex === 0, '배정유형 select의 selectedIndex가 0(빈값 아님)');

console.log('▶ 테스트: 운행방향을 귀가로 바꾸면 귀가용 목록의 1번째 항목으로 갱신');
dirSel.value = '귀가';
mod.bbTypeOptionsRefresh();
assert(typeSel.value === '본대', '귀가 선택 시 배정유형 = 귀가목록 1번째 항목(본대) (실제: "' + typeSel.value + '")');

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
