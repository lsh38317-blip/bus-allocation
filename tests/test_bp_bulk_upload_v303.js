// [v303] "일괄업로드" — 버스 탑승자 명단(다단 헤더 CSV)을 파싱해 참석/귀가 교통수단·배정유형을
// 일괄 반영하는 기능의 회귀테스트.
// 검증 대상:
//   1) 다단 헤더(구분/NO/날짜/배정유형행)+병합셀 서식 CSV에서 하행/상행 열을 정확히 자동 탐지
//   2) 구역/이름 파싱 + 교구 자동 유추(구역 앞자리 숫자 기준)
//   3) 명단없음/동명이인 건은 건너뛰고 별도 목록으로 수집
//   4) 매칭된 건에 대해 기존 bpApplyTransportChange/bpApplyAssignTypeChange를 통해 실제 반영(POST 전송)
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const SAMPLE_CSV = fs.readFileSync(path.join(__dirname, 'sample_bus_roster.csv'), 'utf-8');

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v303.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  // 22명 중 2명만 참석인원현황에 존재하는 것으로 설정(나머지 20명은 notFound로 걸려야 함)
  const rosterRows = [
    { 'NO':'1','접수ID':'R1','성명':'나태수','연도':'2026','수양회종류':'하계','행사명':'3차','교구':'2교구','구역':'23구역','참석교통수단':'','참석배정유형':'','귀가교통수단':'','귀가배정유형':'' },
    { 'NO':'2','접수ID':'R2','성명':'김유신','연도':'2026','수양회종류':'하계','행사명':'3차','교구':'2교구','구역':'23구역','참석교통수단':'','참석배정유형':'','귀가교통수단':'','귀가배정유형':'' },
  ];
  let postedBodies = [];

  window.fetch = (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      postedBodies.push(JSON.parse(opts.body));
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    }
    const decoded = decodeURIComponent(u);
    if (decoded.indexOf('참석인원명단') !== -1) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows }) });
    }
    return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
  };
  window.console.error = () => {};
  window.console.warn = () => {};
  window.confirm = () => true; // 확인 다이얼로그 자동 승인
  window.alert = () => {};     // 스킵 목록 alert 무시

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
  await new Promise((r) => setTimeout(r, 400));

  console.log('▶ 테스트1: 다단 헤더 CSV 구조 파싱 (하행/상행 열 자동탐지 + 구역/이름 분리)');
  const parsed = window.bpBulkUploadParseCSV(SAMPLE_CSV);
  assert(!parsed.error, '파싱 에러 없음(실제: ' + parsed.error + ')');
  assert(parsed.matched.length === 2, '2명(나태수/김유신)만 매칭됨(실제: ' + parsed.matched.length + ')');
  assert(parsed.notFound.length === 20, '나머지 20명은 명단없음으로 수집됨(실제: ' + parsed.notFound.length + ')');
  assert(parsed.ambiguous.length === 0, '동명이인 없음');

  console.log('▶ 테스트2: 배정유형 라벨이 원문 그대로 반영됨(선발대 1대/본대/직장조 1대)');
  const nts = parsed.matched.find((m) => m.r.name === '나태수');
  const kys = parsed.matched.find((m) => m.r.name === '김유신');
  assert(nts && nts.arriveType === '직장조 1대', '나태수 하행분류=직장조 1대(원문 그대로) 실제: ' + (nts && nts.arriveType));
  assert(nts && nts.leaveType === '본대', '나태수 상행분류=본대 실제: ' + (nts && nts.leaveType));
  assert(kys && kys.arriveType === '본대', '김유신 하행분류=본대 실제: ' + (kys && kys.arriveType));

  console.log('▶ 테스트3: "일괄업로드" 버튼 및 파일 처리 경로로 실제 반영');
  const fileInput = $('bp-bulk-upload-input');
  assert(!!fileInput, '숨김 file input이 마크업에 존재함');
  assert(fileInput.getAttribute('accept') === '.csv', 'file input이 .csv만 허용함');

  // FileReader 기반 handleFile 대신, 파싱→반영 파이프라인(bpBulkUploadProcess)을 직접 호출해 검증
  window.bpBulkUploadProcess(SAMPLE_CSV);
  await new Promise((r) => setTimeout(r, 500));

  const rosterPosts = postedBodies.filter((b) => b.sheetName === '참석인원명단');
  assert(rosterPosts.length >= 4, '참석인원명단 업데이트 요청이 전송됨(교통수단+배정유형 x 2명, 실제: ' + rosterPosts.length + ')');
  assert(rosterPosts.every((b) => b.action === 'update'), '모든 요청이 update 액션으로 전송됨');

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
