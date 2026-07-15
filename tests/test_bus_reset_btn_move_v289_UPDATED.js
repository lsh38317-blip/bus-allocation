// [v289] 배정초기화(bus-teams-reset-btn) 버튼이 선탑자지정 패널의 "배정대수불러오기" 버튼 뒤로
// 이동했는지, 구역관리 패널에서는 제거됐는지, 기존 텍스트 전환 동작은 유지되는지 검증
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = process.argv[2] || 'retreat-site_v289.html';
const html0 = fs.readFileSync(targetFile, 'utf-8');
const dom = new JSDOM(html0);
const doc = dom.window.document;

console.log('▶ 테스트1: bus-teams-reset-btn이 bus-panel-leader 안에 위치함(구역관리 패널 안이 아님)');
const btn = doc.getElementById('bus-teams-reset-btn');
assert(!!btn, 'bus-teams-reset-btn 요소가 존재함');
const leaderPanel = doc.getElementById('bus-panel-leader');
const teamsPanel = doc.getElementById('bus-panel-teams');
assert(leaderPanel && leaderPanel.contains(btn), '버튼이 bus-panel-leader 내부에 위치함');
assert(!(teamsPanel && teamsPanel.contains(btn)), '버튼이 더 이상 bus-panel-teams 내부에는 없음');

console.log('▶ 테스트2: "배정유형별 대수 불러오기" 버튼 바로 다음에 위치(DOM 순서상 인접)');
// [v322] "전체배정대수불러오기" 버튼이 추가되어 "배정대수불러오기" 부분 문자열만으로는 두 버튼이 모두 걸리므로,
// 정확한 라벨("배정유형별 대수 불러오기")로 특정한다.
const generateBtn = Array.from(leaderPanel.querySelectorAll('button')).find((b) => b.textContent.indexOf('배정유형별 대수 불러오기') !== -1);
assert(!!generateBtn, '배정유형별 대수 불러오기 버튼을 찾음');
assert(generateBtn.nextElementSibling === btn, '배정유형별 대수 불러오기 버튼의 바로 다음 형제 요소가 배정초기화 버튼임');

console.log('▶ 테스트3: 버튼의 id/동작(onclick)이 그대로 유지됨(로직 회귀 없음)');
assert(btn.getAttribute('onclick') === 'busResetConfirm()', 'onclick=busResetConfirm() 그대로 유지됨');
// [v321] 버튼이 "참석배정 초기화" → "참석배정 전체 초기화"로 라벨 변경됨(배정유형별 초기화 버튼 신설에 따른 명확화)
assert(btn.textContent.indexOf('참석배정 전체 초기화') !== -1, '기본 텍스트(참석배정 전체 초기화) 유지됨(런타임에 참석/귀가로 토글되는 로직은 그대로)');

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
