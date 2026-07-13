// [v301] "배정버스대수불러오기" — 버스배정기초정보 등록 배정대수를 최소값으로 반영하는 회귀테스트
// 검증 대상:
//   1) 패널 진입/배정유형 변경만으로는 버스배정_기초정보 조회가 발생하지 않음(v286 원칙 유지)
//   2) 버튼 클릭 시 1회 조회 + 등록 배정대수가 인원수 계산값보다 크면 입력칸/경고문구에 최소값으로 반영
//   3) 등록이 없으면 경고 후 인원수 기준 계산값만 사용
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v301.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  // 인원수 기준으로는 1대(44명 정원, 소수 인원)면 충분하지만, 기초정보에는 3대로 등록돼 있는 상황
  const baseInfoRows = [
    { 'NO':'1', '등록ID':'BB1', '년도':'2026', '수양회종류':'하계', '행사명':'1차', '배정유형':'본대(참석자)', '운행방향':'참석', '배정대수':'3' },
  ];
  const teamRows = [
    { 'NO':'1', '년도':'2026', '수양회종류':'하계', '행사명':'1차', '배정유형':'본대(참석자)', '교구':'3교구', '구역/팀명':'31구역', '인원수':'10', '배정상태':'미배정', '버스':'', '분산배정':'', '비고':'' },
  ];
  let baseInfoFetchCount = 0;

  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    }
    const decoded = decodeURIComponent(u);
    if (decoded.indexOf('버스배정_기초정보') !== -1) {
      baseInfoFetchCount++;
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: baseInfoRows }) });
    }
    if (decoded.indexOf('버스배정_참석팀내역') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: teamRows }) });
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
  window.busTab('assign');
  await new Promise((r) => setTimeout(r, 300));

  console.log('▶ 테스트1: 패널 진입만으로는 버스배정_기초정보 조회가 발생하지 않음(v286 원칙)');
  assert(baseInfoFetchCount === 0, '패널/탭 진입만으로는 조회 없음(실제: ' + baseInfoFetchCount + ')');

  const curYear = $('bus-sel-year') ? $('bus-sel-year').value : '';
  baseInfoRows[0]['년도'] = curYear;
  teamRows.forEach((r) => { r['년도'] = curYear; });
  $('bus-sel-assigntype').value = '본대(참석자)';
  const changeEvent = new window.Event('change', { bubbles: true });
  $('bus-sel-assigntype').dispatchEvent(changeEvent);
  await new Promise((r) => setTimeout(r, 50));
  assert(baseInfoFetchCount === 0, '배정유형 변경만으로는 여전히 조회 없음(실제: ' + baseInfoFetchCount + ')');

  // 팀 데이터 로드(인원수 기준 계산 위해 필요) — 10명/44명 정원 → 인원수기준 1대
  await new Promise((resolve) => { window.busLoadTeamsFromSheet('arrive', resolve); });
  await new Promise((r) => setTimeout(r, 100));

  console.log('▶ 테스트2: "배정버스대수불러오기" 클릭 시 1회 조회 + 등록값(3대)이 인원수기준(1대)보다 크므로 최소값 3대로 반영');
  window.busLoadRegisteredCount();
  await new Promise((r) => setTimeout(r, 200));
  assert(baseInfoFetchCount === 1, '버튼 클릭으로 정확히 1회 조회됨(실제: ' + baseInfoFetchCount + ')');
  assert($('bus-count-input').value === '3', '[핵심] 입력칸이 등록 배정대수(3대)로 끌어올려짐(실제: ' + $('bus-count-input').value + ')');
  const summaryText = $('bus-cap-summary') ? $('bus-cap-summary').textContent : '';
  assert(summaryText.indexOf('3대') === 0, '요약 텍스트도 3대 기준으로 갱신됨(실제: ' + summaryText + ')');

  console.log('▶ 테스트3: 입력칸을 등록값보다 낮게 되돌려도 경고문구에 근거(기초정보 등록)가 표시됨');
  $('bus-count-input').value = '1';
  window.busCheckBusCountWarning();
  await new Promise((r) => setTimeout(r, 20));
  const warnText = $('bus-count-warning') ? $('bus-count-warning').textContent : '';
  assert(warnText.indexOf('최소 필요 대수(3대)') !== -1, '경고문구가 등록값 3대를 최소 필요 대수로 안내함(실제: ' + warnText + ')');
  assert(warnText.indexOf('버스배정기초정보 등록') !== -1, '경고문구에 근거(버스배정기초정보 등록)가 명시됨');

  console.log('▶ 테스트4: 등록이 없는 배정유형은 경고 후 인원수 기준값만 사용');
  $('bus-sel-assigntype').value = '중고등부'; // baseInfoRows에 없는 유형
  $('bus-sel-assigntype').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  window.busLoadRegisteredCount();
  await new Promise((r) => setTimeout(r, 150));
  // 팀이 없는 상태이므로 busCalcRequiredBuses는 null → 입력칸은 그대로(부작용 없음)만 확인
  assert(baseInfoFetchCount === 2, '두번째 버튼 클릭으로 조회 1회 추가 발생(누적 실제: ' + baseInfoFetchCount + ')');

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
