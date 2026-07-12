// [v285] 선탑자 지정 — 버스배정기초정보 배정대수 기준 입력칸 생성 + 교구/구역/이름 매칭 저장 회귀테스트
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v285.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const baseInfoRows = [
    { 'NO':'1', '등록ID':'BB1', '년도':'2026', '수양회종류':'하계', '행사명':'1차', '배정유형':'본대', '운행방향':'참석', '배정대수':'2' },
  ];
  const rosterRows = [
    { 'NO':'1', '접수ID':'R1', '성명':'홍길동', '교구':'3교구', '구역':'31구역', '참석교통수단':'버스', '참석배정유형':'본대', '연도':'2026', '수양회종류':'하계', '행사명':'1차' },
    { 'NO':'2', '접수ID':'R2', '성명':'김철수', '교구':'3교구', '구역':'32구역', '참석교통수단':'버스', '참석배정유형':'본대', '연도':'2026', '수양회종류':'하계', '행사명':'1차' },
  ];
  let summarySavedRows = null; // 저장 시 전송된 rows를 캡처

  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      // 선탑자 저장(overwrite) 요청
      const body = JSON.parse(opts.body);
      if (body.sheetName === '버스배정_참석요약') {
        summarySavedRows = body.rows;
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    }
    const decoded = decodeURIComponent(u);
    if (decoded.indexOf('sheetName=버스배정_기초정보') !== -1 || decoded.indexOf('버스배정_기초정보') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: baseInfoRows }) });
    }
    if (decoded.indexOf('참석인원명단') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows }) });
    }
    if (decoded.indexOf('버스배정_참석요약') !== -1 || decoded.indexOf('버스배정_귀가요약') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
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

  console.log('▶ 테스트1: 배정유형 미선택 시 안내 문구 표시');
  let listEl = $('bus-leader-list');
  assert(listEl.textContent.indexOf('배정유형을 선택') !== -1, '배정유형 미선택 안내 표시됨');

  console.log('▶ 테스트2: 배정유형 선택 시 배정대수(2)만큼 입력칸 생성');
  const curYear = $('bus-sel-year') ? $('bus-sel-year').value : '';
  baseInfoRows[0]['년도'] = curYear;
  rosterRows.forEach((r) => { r['연도'] = curYear; });
  $('bus-sel-assigntype').value = '본대';
  window.busLeaderRender();
  await new Promise((r) => setTimeout(r, 150));
  listEl = $('bus-leader-list');
  assert(!!$('leader-in-parish-1'), '1번째 입력칸(교구select) 생성됨');
  assert(!!$('leader-in-parish-2'), '2번째 입력칸(교구select) 생성됨');
  assert(!$('leader-in-parish-3'), '배정대수(2)를 초과하는 3번째 입력칸은 생성되지 않음');

  console.log('▶ 테스트3: 교구/구역/이름 입력 후 저장 시 접수ID를 찾아 시트에 upsert 요청됨');
  $('leader-in-parish-1').value = '3교구';
  window.busLeaderParishChange(1);
  await new Promise((r) => setTimeout(r, 20));
  $('leader-in-district-1').value = '31구역';
  $('leader-in-name-1').value = '홍길동';
  // 2번째 칸은 비워둠(부분 입력 없이 완전히 비어있으면 스킵되어야 함)
  window.busLeaderSave();
  await new Promise((r) => setTimeout(r, 200));

  assert(summarySavedRows !== null, '버스배정_참석요약 저장 요청이 실제로 전송됨');
  const savedRow1 = summarySavedRows.find((r) => r[4] === '1호'); // [년도,종류,행사명,배정유형,버스명,...]
  assert(!!savedRow1, '1호 버스에 대한 저장 행이 생성됨');
  assert(savedRow1 && savedRow1[3] === '본대', '저장된 행의 배정유형이 "본대"로 기록됨 (실제: ' + (savedRow1 && savedRow1[3]) + ')');
  assert(savedRow1 && savedRow1[savedRow1.length-1] === 'R1', '저장된 행의 선탑자ID가 교구/구역/이름으로 찾은 접수ID(R1)와 일치');

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
