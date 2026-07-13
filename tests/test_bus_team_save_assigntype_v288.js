// [v288] busSaveTeamsToSheet — 배정유형이 저장 행에 포함되고, 배정유형이 다르면 같은 교구/구역도
// 별개 팀으로 저장(중복 skip 되지 않음)되는지 검증(전체 페이지 로드)
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v288.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const rosterRows = [
    { 'NO':'1','접수ID':'R1','성명':'홍길동','교구':'3교구','구역':'31구역','참석교통수단':'버스','참석배정유형':'본대(참석자)' },
    { 'NO':'2','접수ID':'R2','성명':'김철수','교구':'3교구','구역':'31구역','참석교통수단':'버스','참석배정유형':'본대(참석자)' },
  ];
  // 시트에 이미 "3교구 31구역" 팀이 다른 배정유형(직장조)으로 저장되어 있는 상황을 재현
  let existingSheetRows = [
    { 'NO':'1','년도':'2026','수양회종류':'하계','행사명':'1차','배정유형':'직장조(참석자)','교구':'3교구','구역/팀명':'31구역','인원수':'5','배정상태':'미배정','버스':'','분산배정':'','비고':'' },
  ];
  let appendedRows = null;

  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      if (body.sheetName === '버스배정_참석팀내역' && body.mode === 'append') {
        appendedRows = body.rows;
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    }
    const decoded = decodeURIComponent(u);
    if (decoded.indexOf('참석인원명단') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows }) });
    }
    if (decoded.indexOf('버스배정_참석팀내역') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: existingSheetRows }) });
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
  await new Promise((r) => setTimeout(r, 400));

  const curYear = $('bus-sel-year') ? $('bus-sel-year').value : '';
  rosterRows.forEach((r) => { r['연도'] = curYear; });
  existingSheetRows[0]['년도'] = curYear;

  $('bus-sel-assigntype').value = '본대(참석자)';
  window.busTab('teams');
  await new Promise((r) => setTimeout(r, 200));
  window.busImportFromRetreat();
  await new Promise((r) => setTimeout(r, 200));

  console.log('▶ 테스트1: 내역저장 시 저장 행에 배정유형("본대")이 포함됨');
  window.busSaveTeamsToSheet();
  await new Promise((r) => setTimeout(r, 200));
  assert(appendedRows !== null, '내역저장 append 요청이 실제로 전송됨');
  const row = appendedRows && appendedRows.find((r) => r[6] === '31구역'); // [NO,년도,종류,행사명,배정유형,교구,구역/팀명,...]
  assert(!!row, '3교구 31구역 팀 행이 저장 요청에 포함됨');
  assert(row && row[4] === '본대(참석자)', '저장된 행의 배정유형이 "본대(참석자)"로 기록됨 (실제: ' + (row && row[4]) + ')');

  console.log('▶ 테스트2: 같은 교구/구역이라도 배정유형이 다르면(기존 시트=직장조, 이번=본대) 중복으로 skip되지 않고 저장됨');
  assert(appendedRows.length === 1, '기존 "직장조" 팀과 별개로 "본대" 팀 1건이 신규 저장됨(중복 오판 없음) — 실제 저장건수: ' + (appendedRows ? appendedRows.length : 0));

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
