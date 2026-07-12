// [v286] 선탑자 지정 — "배정대수불러오기" 버튼 명시적 트리거 회귀테스트
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v286.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const baseInfoRows = [
    { 'NO':'1', '등록ID':'BB1', '년도':'2026', '수양회종류':'하계', '행사명':'1차', '배정유형':'본대', '운행방향':'참석', '배정대수':'2' },
  ];
  let fetchCount = { baseInfo: 0 };

  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    }
    const decoded = decodeURIComponent(u);
    if (decoded.indexOf('버스배정_기초정보') !== -1) {
      fetchCount.baseInfo++;
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: baseInfoRows }) });
    }
    return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
  };
  window.console.error = () => {};
  window.console.warn = () => {};

  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve);
  });
  await new Promise((r) => setTimeout(r, 300));

  const $ = (id) => window.document.getElementById(id);

  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise((r) => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise((r) => setTimeout(r, 300));

  window.switchPanel('bus');
  await new Promise((r) => setTimeout(r, 500));

  console.log('▶ 테스트1: 패널 진입만으로는 입력칸이 생성되지 않고 대기 안내문구만 표시됨(자동조회 없음)');
  let listEl = $('bus-leader-list');
  assert(listEl.textContent.indexOf('배정대수불러오기') !== -1, '"배정대수불러오기" 버튼 클릭 안내가 표시됨(실제: ' + listEl.textContent.slice(0,80) + ')');
  assert(!$('leader-in-parish-1'), '진입만으로는 입력칸이 생성되지 않음(자동조회 제거 확인)');
  assert(fetchCount.baseInfo === 0, '패널 진입만으로는 버스배정_기초정보 조회가 발생하지 않음(실제 호출횟수: ' + fetchCount.baseInfo + ')');

  console.log('▶ 테스트2: 배정유형 변경만으로는 자동 조회되지 않고 안내상태로 리셋됨');
  const curYear = $('bus-sel-year') ? $('bus-sel-year').value : '';
  baseInfoRows[0]['년도'] = curYear;
  $('bus-sel-assigntype').value = '본대';
  // onchange 이벤트를 발생시켜 실제 브라우저 동작 재현
  const changeEvent = new window.Event('change', { bubbles: true });
  $('bus-sel-assigntype').dispatchEvent(changeEvent);
  await new Promise((r) => setTimeout(r, 50));
  assert(!$('leader-in-parish-1'), '배정유형 변경만으로는 여전히 입력칸이 생성되지 않음');
  assert(fetchCount.baseInfo === 0, '배정유형 변경만으로는 조회가 발생하지 않음(실제: ' + fetchCount.baseInfo + ')');

  console.log('▶ 테스트3: "배정대수불러오기" 버튼 클릭 시에만 조회+입력칸 생성이 실행됨');
  window.busLeaderRender();
  await new Promise((r) => setTimeout(r, 150));
  assert(fetchCount.baseInfo === 1, '버튼 클릭으로 버스배정_기초정보 조회가 정확히 1회 발생함(실제: ' + fetchCount.baseInfo + ')');
  assert(!!$('leader-in-parish-1'), '버튼 클릭 후 1번째 입력칸이 생성됨');
  assert(!!$('leader-in-parish-2'), '버튼 클릭 후 2번째 입력칸이 생성됨(배정대수=2)');

  console.log('▶ 테스트4: HTML 마크업 - 배정대수불러오기 버튼이 안내문구보다 앞(DOM 순서상 이전)에 위치');
  const dom2 = new JSDOM(html0);
  const doc2 = dom2.window.document;
  const panel = doc2.getElementById('bus-panel-leader');
  const html = panel.innerHTML;
  const btnIdx = html.indexOf('배정대수불러오기');
  const bannerIdx = html.indexOf('배정대수만큼 선탑자');
  assert(btnIdx !== -1 && bannerIdx !== -1, '버튼과 안내문구 텍스트 모두 마크업에 존재함');
  assert(btnIdx < bannerIdx, '배정대수불러오기 버튼이 안내문구보다 DOM상 먼저 위치함');

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
