// [v401] 버스신청 - "탑승자 명단"(sr) 신규 탭 회귀테스트
// 검증 범위: _expose/_self 등록(특히 v392부터 누락돼 있던 spStageBus 포함),
// srRosterRender()의 간결 카드 렌더링(팀 배지 없음, 탑승자보기 버튼 포함, 정렬 적용)
//
// 실행: node test_sr_roster_tab_v401.js [retreat-site 파일 경로]  (생략 시 최신 버전 자동 탐지)
const { resolveLatestHtml, readHtmlScript, extractFunctionSource } = require('./test-helpers.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

const targetFile = resolveLatestHtml(2);
console.log('대상 파일:', targetFile);
const fullSrc = readHtmlScript(targetFile);

console.log('▶ 테스트1: _expose/_self에 sr- 신규 함수 및 이전부터 누락돼 있던 spStageBus가 모두 등록됨');
{
  const exposeMatch = fullSrc.match(/var _expose = \[([\s\S]*?)\];/);
  const selfMatch = fullSrc.match(/var _self = \{([\s\S]*?)\};/);
  ['spStageBus', 'srParishChange', 'srSetType', 'srRosterReload', 'srExportBusSchedule'].forEach((fnName) => {
    const inExpose = exposeMatch[1].indexOf("'" + fnName + "'") >= 0;
    const inSelf = new RegExp('\\b' + fnName + ':' + fnName + '\\b').test(selfMatch[1]);
    assert(inExpose, fnName + '이 _expose 배열에 등록됨');
    assert(inSelf, fnName + '이 _self 객체에 등록됨');
  });
}

console.log('▶ 테스트2: switchPanel()이 busroster를 서브탭 표시/타이틀 매핑에 포함함');
{
  const switchPanelSrc = extractFunctionSource(fullSrc, 'switchPanel');
  assert(/name==='enroll'\|\|name==='search'\|\|name==='busroster'/.test(switchPanelSrc), '서브탭바 표시 조건에 busroster 포함');
  assert(/srInit\(\)/.test(switchPanelSrc), "'busroster' 진입 시 srInit() 호출됨");
}

function extractVarSource(src, varName) {
  const mm = src.match(new RegExp('var\\s+' + varName + '\\s*='));
  const startIdx = mm.index;
  const endIdx = src.indexOf(';', startIdx);
  return src.slice(startIdx, endIdx + 1);
}

console.log('▶ 테스트3: srRosterRender() 렌더링 — 헤더정보+인원배지+탑승자보기 버튼만 있는 간결 카드(팀 배지 없음)');
{
  const fnsSrc = ['_bvwSortKey', '_bvwAssignTypeRank', '_bvwBusSortCompare', '_bvwWeekdayKR', '_bvwFormatMD', 'srRosterRender']
    .map((n) => extractFunctionSource(fullSrc, n)).join('\n');
  const varsSrc = extractVarSource(fullSrc, '_BUS_ASSIGN_TYPE_ORDER');

  const busArriveBuses = [
    { id: 'b1', name: '본대(참석자) 버스 1호', boardLoc: '교회당앞', alightLoc: '믿음관앞', departDate: '2026-07-24', departTime: '09:00', driverName: '김성호', leaderId: '', slots: [{ teamId: 't1', count: 21 }] },
  ];
  const busArriveTeams = [{ id: 't1', name: '1교구 11구역', count: 21, parish: '1교구' }];
  const busLeaveBuses = []; const busLeaveTeams = [];
  let statsHtml = ''; let listHtml = '';
  const elements = {
    'sr-empty': { style: {} },
    'sr-content': { style: {} },
    'sr-stats': { set innerHTML(v) { statsHtml = v; } },
    'sr-list': { set innerHTML(v) { listHtml = v; } },
    'sr-s-parish': { value: '' },
    'sr-s-district': { value: '' },
  };
  function $id(id) { return elements[id]; }
  function esc(s) { return String(s == null ? '' : s); }
  function busGetCap() { return 44; }
  function busTeamAssigned() { return 21; }
  const retreat = [];

  const ctx = { $id, esc, busGetCap, busTeamAssigned, retreat, busArriveBuses, busArriveTeams, busLeaveBuses, busLeaveTeams };
  const fn = new Function(...Object.keys(ctx), varsSrc + '\nvar srType = "arrive";\n' + fnsSrc + '\nreturn srRosterRender;');
  const srRosterRender = fn(...Object.values(ctx));
  srRosterRender();

  assert(listHtml.includes('🚌 탑승자 보기'), '"탑승자 보기" 버튼이 카드에 렌더링됨');
  assert(/busRosterOpenForBus\(&quot;b1&quot;,&quot;arrive&quot;\)/.test(listHtml), 'busRosterOpenForBus(busId, type) 호출이 onclick에 올바르게 포함됨');
  assert(listHtml.includes('21 / 44명'), '인원 배지(21 / 44명)가 표시됨');
  assert(listHtml.includes('출발일자:') && listHtml.includes('7/24(금)'), '출발일자가 M/D(요일) 형식으로 표시됨');
  assert(!listHtml.includes('1교구 11구역'), '팀별 배지(구역 pill)는 간결 카드에서 표시되지 않음(요청사항 반영)');
  assert(statsHtml.includes('배정 팀'), '통계 카드(배정 팀 등)가 렌더링됨');
}

console.log('▶ 테스트4: srRosterReload()가 busviewReload()의 완료 콜백(onDone)을 통해 srRosterRender를 호출하도록 구성됨');
{
  const srRosterReloadSrc = extractFunctionSource(fullSrc, 'srRosterReload');
  assert(/busviewReload\(function\(\)\{/.test(srRosterReloadSrc), 'busviewReload에 콜백 함수를 전달함');
  assert(/srRosterRender\(\)/.test(srRosterReloadSrc), '콜백 내부에서 srRosterRender()를 호출함');
  const busviewReloadSrc = extractFunctionSource(fullSrc, 'busviewReload');
  assert(/function busviewReload\(onDone\)/.test(busviewReloadSrc), 'busviewReload가 onDone 콜백 파라미터를 받도록 확장됨(하위호환)');
  assert(/typeof onDone==='function'\) onDone\(\)/.test(busviewReloadSrc), 'busviewReload가 데이터 로드 완료 시 onDone을 호출함');
}

console.log('\n──────────────────────');
console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
