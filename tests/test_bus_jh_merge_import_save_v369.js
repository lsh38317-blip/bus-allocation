// [v369] "시각선교부 본대 포함여부" 체크박스(버스신청자 배정 탭 이동) — 병합모드에서
// 내역조회/내역저장이 본대+시각선교부를 함께 처리하는지, 체크 해제 시 기존(본대만) 동작이
// 그대로 유지되는지, 최소버스대수 계산에서 중복 합산이 발생하지 않는지 검증한다.
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

async function run() {
  const targetFile = process.argv[2] || 'retreat-site_v379.html';
  const html0 = fs.readFileSync(targetFile, 'utf-8');
  const dom = new JSDOM(html0, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const rosterRows = [
    { 'NO':'1','접수ID':'R1','성명':'홍길동','교구':'1교구','구역':'11구역','참석교통수단':'버스','참석배정유형':'본대' },
    { 'NO':'2','접수ID':'R2','성명':'김철수','교구':'1교구','구역':'11구역','참석교통수단':'버스','참석배정유형':'본대' },
    { 'NO':'3','접수ID':'R3','성명':'박서윤','교구':'2교구','구역':'21구역','참석교통수단':'버스','참석배정유형':'시각선교부' },
    { 'NO':'4','접수ID':'R4','성명':'이영희','교구':'2교구','구역':'21구역','참석교통수단':'버스','참석배정유형':'시각선교부' },
    { 'NO':'5','접수ID':'R5','성명':'최민수','교구':'2교구','구역':'21구역','참석교통수단':'버스','참석배정유형':'시각선교부' },
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
  await new Promise((r) => setTimeout(r, 400));

  const curYear = $('bus-sel-year') ? $('bus-sel-year').value : '';
  const curSeason = $('bus-sel-season') ? $('bus-sel-season').value : '';
  const curEvent = $('bus-sel-event') ? $('bus-sel-event').value : '';
  rosterRows.forEach((r) => { r['연도'] = curYear; r['수양회종류'] = curSeason; r['차수'] = curEvent; r['행사명'] = curEvent; });

  // 배정유형 select에 '본대' 옵션이 없을 수 있으므로 직접 주입 후 선택
  const sel = $('bus-sel-assigntype');
  if (sel && ![...sel.options].some((o) => o.value === '본대')) {
    const opt = window.document.createElement('option');
    opt.value = '본대'; opt.textContent = '본대';
    sel.appendChild(opt);
  }
  sel.value = '본대';
  window.busAssignTypeChanged();
  window.busTab('teams');
  await new Promise((r) => setTimeout(r, 300));

  console.log('▶ 테스트1: 체크박스 미체크(기본) — 내역조회 시 본대만 집계됨(기존 동작 유지)');
  window.busImportFromRetreat();
  await new Promise((r) => setTimeout(r, 300));
  let totalText1 = $('bus-arrive-total') ? $('bus-arrive-total').textContent : '';
  let tbodyText1 = $('bus-arrive-tbody') ? $('bus-arrive-tbody').textContent : '';
  assert(totalText1.indexOf('총 2명') !== -1 && totalText1.indexOf('1개 팀') !== -1, '미체크 시 총 2명/1개 팀만 집계됨 (실제: "' + totalText1 + '")');
  assert(tbodyText1.indexOf('11구역') !== -1, '미체크 시 "11구역"(본대)이 목록에 표시됨');
  assert(tbodyText1.indexOf('21구역') === -1, '미체크 시 시각선교부(21구역)는 목록에 포함되지 않음');

  console.log('▶ 테스트2: 체크박스 체크(병합모드) — 내역조회 시 본대+시각선교부 함께 집계됨');
  const chk = $('bus-jh-include-main-toggle');
  const wrapEl = $('bus-jh-include-main-wrap');
  assert(!!wrapEl && wrapEl.style.display !== 'none', '배정유형=본대 상태에서 체크박스가 노출됨');
  chk.checked = true;
  chk.dispatchEvent(new window.Event('change'));
  window.busImportFromRetreat();
  await new Promise((r) => setTimeout(r, 300));
  let totalText2 = $('bus-arrive-total') ? $('bus-arrive-total').textContent : '';
  let tbodyText2 = $('bus-arrive-tbody') ? $('bus-arrive-tbody').textContent : '';
  assert(totalText2.indexOf('총 5명') !== -1 && totalText2.indexOf('2개 팀') !== -1, '병합모드에서 총 5명(2+3)/2개 팀으로 집계됨 (실제: "' + totalText2 + '")');
  assert(tbodyText2.indexOf('11구역') !== -1 && tbodyText2.indexOf('21구역') !== -1, '병합모드 목록에 본대(11구역)+시각선교부(21구역) 모두 표시됨(구분 배지 없이 하나의 목록)');

  console.log('▶ 테스트3: 최소버스대수 계산 — teams에 이미 포함되어 있으므로 중복 합산되지 않음(정확히 5명치만)');
  {
    const { extractFunctionSource, readHtmlScript } = require('./test-helpers');
    const src = readHtmlScript(targetFile);
    const fnSrc = extractFunctionSource(src, 'busCalcRequiredBuses');
    const teamsArrive = [
      { id: 't1', name: '1교구 11구역', count: 2, assignType: '본대' },
      { id: 't2', name: '2교구 21구역', count: 3, assignType: '시각선교부' },
    ];
    const $id = (id) => (id === 'bus-sel-assigntype' ? { value: '본대' } : null);
    const busGetCap = () => 44;
    const _busRegisteredCountCache = {};
    const fn2 = new Function('$id', 'busGetCap', '_busRegisteredCountCache', 'busArriveTeams', 'busLeaveTeams',
      fnSrc + '\nreturn busCalcRequiredBuses("arrive");')($id, busGetCap, _busRegisteredCountCache, teamsArrive, []);
    assert(fn2.normalNeeded === 1, '5명(본대2+시각선교부3, 중복없이) / 정원44 → 최소 1대로 계산됨 (실제 normalNeeded=' + fn2.normalNeeded + ')');
    assert(fn2.headcountCalculated === 1, '헤드카운트 기준 계산값도 1대로 일치(별도 시각선교부 합산 로직 제거 확인) — 실제: ' + fn2.headcountCalculated);
  }

  console.log('▶ 테스트4: 내역저장 — 병합모드에서 각 팀이 실제 배정유형(본대/시각선교부)으로 각각 저장됨');
  window.busSaveTeamsToSheet();
  await new Promise((r) => setTimeout(r, 300));
  assert(appendedRows !== null, '내역저장 append 요청이 전송됨');
  const savedMain = appendedRows && appendedRows.find((r) => r[6] === '11구역');
  const savedJh = appendedRows && appendedRows.find((r) => r[6] === '21구역');
  assert(!!savedMain && savedMain[4] === '본대', '저장된 "11구역" 행의 배정유형이 "본대"로 정확히 기록됨 (실제: ' + (savedMain && savedMain[4]) + ')');
  assert(!!savedJh && savedJh[4] === '시각선교부', '저장된 "21구역" 행의 배정유형이 "시각선교부"로 정확히 기록됨(일괄 "본대"로 오저장되지 않음) (실제: ' + (savedJh && savedJh[4]) + ')');

  console.log('▶ 테스트5: 체크 해제 시 체크박스 자동 해제 + wrap 숨김(배정유형 이탈 시)');
  sel.value = '';
  window.busAssignTypeChanged();
  await new Promise((r) => setTimeout(r, 100));
  const wrap = $('bus-jh-include-main-wrap');
  assert(wrap && wrap.style.display === 'none', '배정유형이 본대가 아니면 체크박스 wrap이 숨겨짐');
  assert(chk && chk.checked === false, '배정유형 이탈 시 체크 상태도 자동 해제됨(잔류 체크로 인한 가드 오작동 방지)');

  console.log('▶ 테스트6: 같은 구역에 본대+시각선교부가 공존하면(예: 1교구 15구역) 화면은 합산된 한 줄로, 저장은 분리되어 기록됨');
  {
    // 배정유형을 다시 '본대'로 놓고 새 시나리오로 재조회
    sel.value = '본대';
    window.busAssignTypeChanged();
    window.busTab('teams');
    await new Promise((r) => setTimeout(r, 200));
    const rosterRows2 = [];
    for (let i = 1; i <= 11; i++) rosterRows2.push({ 'NO': String(i), '접수ID': 'S' + i, '성명': '본대인원' + i, '교구': '1교구', '구역': '15구역', '참석교통수단': '버스', '참석배정유형': '본대' });
    rosterRows2.push({ 'NO': '12', '접수ID': 'S12', '성명': '박서윤', '교구': '1교구', '구역': '15구역', '참석교통수단': '버스', '참석배정유형': '시각선교부' });
    const y2 = $('bus-sel-year') ? $('bus-sel-year').value : '', s2 = $('bus-sel-season') ? $('bus-sel-season').value : '', e2 = $('bus-sel-event') ? $('bus-sel-event').value : '';
    rosterRows2.forEach((r) => { r['연도'] = y2; r['수양회종류'] = s2; r['차수'] = e2; r['행사명'] = e2; });
    window.fetch = (url, opts) => {
      const u = String(url);
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body);
        if (body.sheetName === '버스배정_참석팀내역' && body.mode === 'append') appendedRows = body.rows;
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
      }
      const decoded = decodeURIComponent(u);
      if (decoded.indexOf('참석인원명단') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows2 }) });
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
    };
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change'));
    window.busImportFromRetreat();
    await new Promise((r) => setTimeout(r, 300));
    const totalText6 = $('bus-arrive-total') ? $('bus-arrive-total').textContent : '';
    const tbodyText6 = $('bus-arrive-tbody') ? $('bus-arrive-tbody').textContent.replace(/\s+/g, ' ').trim() : '';
    assert(totalText6.indexOf('총 12명') !== -1 && totalText6.indexOf('1개 팀') !== -1, '같은 구역 병합 시 총 12명(11+1)/1개 팀으로 집계됨 (실제: "' + totalText6 + '")');
    const occurrences = (tbodyText6.match(/15구역/g) || []).length;
    assert(occurrences === 1, '"15구역"이 테이블에 중복 행 없이 정확히 1번만 표시됨(합산 한 줄) — 실제 등장횟수: ' + occurrences);
    assert(tbodyText6.indexOf('12명') !== -1, '합산된 한 줄에 12명으로 표시됨');

    appendedRows = null;
    window.busSaveTeamsToSheet();
    await new Promise((r) => setTimeout(r, 300));
    const rows15 = (appendedRows || []).filter((r) => r[6] === '15구역');
    assert(rows15.length === 2, '내역저장 시에는 화면 합산과 무관하게 본대/시각선교부 2건으로 분리 저장됨 (실제 건수: ' + rows15.length + ')');
    const main15 = rows15.find((r) => r[4] === '본대');
    const jh15 = rows15.find((r) => r[4] === '시각선교부');
    assert(!!main15 && main15[7] === 11, '분리 저장된 본대 행의 인원수가 11명으로 정확함 (실제: ' + (main15 && main15[7]) + ')');
    assert(!!jh15 && jh15[7] === 1, '분리 저장된 시각선교부 행의 인원수가 1명으로 정확함 (실제: ' + (jh15 && jh15[7]) + ')');
  }

  console.log('▶ 테스트7: [v372] 병합모드 전체 플로우 — 내역조회→내역저장→버스기초정보 불러오기→자동배정→저장까지 시각선교부 인원이 유실 없이 본대와 함께 배치됨');
  {
    const rosterRows3 = [];
    for (let i = 1; i <= 5; i++) rosterRows3.push({ 'NO': String(i), '접수ID': 'AM' + i, '성명': '본대인원' + i, '교구': '1교구', '구역': '11구역', '참석교통수단': '버스', '참석배정유형': '본대' });
    for (let i = 1; i <= 2; i++) rosterRows3.push({ 'NO': String(5 + i), '접수ID': 'AJ' + i, '성명': '시각선교부' + i, '교구': '2교구', '구역': '21구역', '참석교통수단': '버스', '참석배정유형': '시각선교부' });
    const y3 = $('bus-sel-year') ? $('bus-sel-year').value : '', s3 = $('bus-sel-season') ? $('bus-sel-season').value : '', e3 = $('bus-sel-event') ? $('bus-sel-event').value : '';
    rosterRows3.forEach((r) => { r['연도'] = y3; r['수양회종류'] = s3; r['차수'] = e3; r['행사명'] = e3; });
    const baseRows3 = [{ '년도': y3, '수양회종류': s3, '행사명': e3, '운행방향': '참석', '배정유형': '본대', '배정대수': '1', '버스정원': '44' }];
    let teamSheetRows3 = [];
    let savedSummary3 = null, savedRoster3 = null;
    window.alert = (m) => console.log('  (alert 발생: ' + m + ')');
    window.fetch = (url, opts) => {
      const u = String(url);
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body);
        if (body.sheetName === '버스배정_참석요약') savedSummary3 = body.rows;
        if (body.sheetName === '탑승자_참석') savedRoster3 = body.rows;
        if (body.sheetName === '버스배정_참석팀내역' && body.mode === 'append') {
          const hdr = ['NO', '년도', '수양회종류', '행사명', '배정유형', '교구', '구역/팀명', '인원수', '배정상태', '버스', '분산배정', '비고'];
          body.rows.forEach((r) => { const o = {}; hdr.forEach((h, i) => (o[h] = r[i])); teamSheetRows3.push(o); });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
      }
      const decoded = decodeURIComponent(u);
      if (decoded.indexOf('참석인원명단') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows3 }) });
      if (decoded.indexOf('버스배정_기초정보') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: baseRows3 }) });
      if (decoded.indexOf('버스배정_참석팀내역') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: teamSheetRows3 }) });
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
    };
    sel.value = '본대';
    window.busAssignTypeChanged();
    window.busTab('teams');
    await new Promise((r) => setTimeout(r, 200));
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change'));
    window.busImportFromRetreat();
    await new Promise((r) => setTimeout(r, 300));
    window.busSaveTeamsToSheet();
    await new Promise((r) => setTimeout(r, 300));
    window.busTab('assign');
    await new Promise((r) => setTimeout(r, 600));
    window.busLoadRegisteredCount();
    await new Promise((r) => setTimeout(r, 300));
    window.busAutoAssign('arrive');
    await new Promise((r) => setTimeout(r, 300));
    window.busSaveToSheet('arrive');
    await new Promise((r) => setTimeout(r, 300));
    assert(!!savedSummary3 && savedSummary3.length === 1, '버스기초정보 불러오기 이후에도 자동배정이 차단되지 않고 정상 실행됨(요약 1건 저장)');
    assert(!!savedSummary3 && savedSummary3[0][6] === 7, '한 버스에 본대5+시각선교부2=총 7명이 함께 탑승 배치됨 (실제: ' + (savedSummary3 && savedSummary3[0][6]) + ')');
    const names = (savedRoster3 || []).map((r) => r[11]);
    assert(names.indexOf('시각선교부1') !== -1 && names.indexOf('시각선교부2') !== -1, '탑승자 명단에 시각선교부 인원이 유실 없이 포함됨');
    const allMain = (savedRoster3 || []).every((r) => r[4] === '본대');
    assert(allMain, '탑승자 명단 저장 시 전원 배정유형=본대로 일관되게 기록됨(기존 시각선교부 합류 로직과 동일 관례)');
  }

  console.log('▶ 테스트8: [v373] 자동배정 후 "버스배정_참석팀내역" 시트에서 시각선교부 행도 배정상태/버스가 정확히 갱신되고, 중복 행 없이 본대/시각선교부 각 1건씩 유지됨');
  {
    const rosterRows4 = [];
    for (let i = 1; i <= 11; i++) rosterRows4.push({ 'NO': String(i), '접수ID': 'DM' + i, '성명': '본대인원' + i, '교구': '1교구', '구역': '15구역', '참석교통수단': '버스', '참석배정유형': '본대' });
    rosterRows4.push({ 'NO': '12', '접수ID': 'DJ1', '성명': '박서윤', '교구': '1교구', '구역': '15구역', '참석교통수단': '버스', '참석배정유형': '시각선교부' });
    const y4 = $('bus-sel-year') ? $('bus-sel-year').value : '', s4 = $('bus-sel-season') ? $('bus-sel-season').value : '', e4 = $('bus-sel-event') ? $('bus-sel-event').value : '';
    rosterRows4.forEach((r) => { r['연도'] = y4; r['수양회종류'] = s4; r['차수'] = e4; r['행사명'] = e4; });
    const baseRows4 = [{ '년도': y4, '수양회종류': s4, '행사명': e4, '운행방향': '참석', '배정유형': '본대', '배정대수': '1', '버스정원': '44' }];
    let teamSheetRows4 = [];
    window.alert = (m) => console.log('  (alert 발생: ' + m + ')');
    window.fetch = (url, opts) => {
      const u = String(url);
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body);
        if (body.sheetName === '버스배정_참석팀내역') {
          const hdr = ['NO', '년도', '수양회종류', '행사명', '배정유형', '교구', '구역/팀명', '인원수', '배정상태', '버스', '분산배정', '비고'];
          if (body.mode === 'append') {
            body.rows.forEach((r) => { const o = {}; hdr.forEach((h, i) => (o[h] = r[i])); teamSheetRows4.push(o); });
          } else if (body.mode === 'overwrite') {
            teamSheetRows4 = body.rows.map((r) => { const o = {}; hdr.forEach((h, i) => (o[h] = r[i])); return o; });
          }
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
      }
      const decoded = decodeURIComponent(u);
      if (decoded.indexOf('참석인원명단') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows4 }) });
      if (decoded.indexOf('버스배정_기초정보') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: baseRows4 }) });
      if (decoded.indexOf('버스배정_참석팀내역') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: teamSheetRows4 }) });
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
    };
    sel.value = '본대';
    window.busAssignTypeChanged();
    window.busTab('teams');
    await new Promise((r) => setTimeout(r, 200));
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change'));
    window.busImportFromRetreat();
    await new Promise((r) => setTimeout(r, 300));
    window.busSaveTeamsToSheet();
    await new Promise((r) => setTimeout(r, 300));
    const before = teamSheetRows4.map((r) => [r['구역/팀명'], r['배정유형'], r['배정상태']]);
    window.busTab('assign');
    await new Promise((r) => setTimeout(r, 600));
    window.busLoadRegisteredCount();
    await new Promise((r) => setTimeout(r, 300));
    window.busAutoAssign('arrive');
    await new Promise((r) => setTimeout(r, 400));
    assert(before.length === 2 && before.every((r) => r[2] === '미배정'), '자동배정 전: 본대/시각선교부 각 1건, 둘 다 미배정 상태로 저장됨');
    assert(teamSheetRows4.length === 2, '자동배정 후에도 중복 행 없이 정확히 2건(본대/시각선교부) 유지됨 (실제: ' + teamSheetRows4.length + '건)');
    const mainRow = teamSheetRows4.find((r) => r['배정유형'] === '본대');
    const jhRow = teamSheetRows4.find((r) => r['배정유형'] === '시각선교부');
    assert(!!mainRow && mainRow['배정상태'] === '배정' && !!mainRow['버스'], '본대 행이 자동배정 후 "배정" 상태로 갱신됨');
    assert(!!jhRow && jhRow['배정상태'] === '배정' && !!jhRow['버스'], '시각선교부 행도 자동배정 후 "배정" 상태로 갱신됨(기존 버그: 미배정으로 남아있던 부분)');
    assert(!!mainRow && !!jhRow && mainRow['버스'] === jhRow['버스'], '본대/시각선교부 인원이 동일한 버스에 함께 배치됨 (실제: ' + (mainRow && mainRow['버스']) + ' / ' + (jhRow && jhRow['버스']) + ')');
  }

  console.log('▶ 테스트9: [v374] "버스배정 초기화" 클릭 시 병합모드면 본대+시각선교부 팀내역 행이 둘 다 미배정으로 초기화됨');
  {
    const rosterRows5 = [];
    for (let i = 1; i <= 11; i++) rosterRows5.push({ 'NO': String(i), '접수ID': 'RM' + i, '성명': '본대인원' + i, '교구': '1교구', '구역': '15구역', '참석교통수단': '버스', '참석배정유형': '본대' });
    rosterRows5.push({ 'NO': '12', '접수ID': 'RJ1', '성명': '박서윤', '교구': '1교구', '구역': '15구역', '참석교통수단': '버스', '참석배정유형': '시각선교부' });
    const y5 = $('bus-sel-year') ? $('bus-sel-year').value : '', s5 = $('bus-sel-season') ? $('bus-sel-season').value : '', e5 = $('bus-sel-event') ? $('bus-sel-event').value : '';
    rosterRows5.forEach((r) => { r['연도'] = y5; r['수양회종류'] = s5; r['차수'] = e5; r['행사명'] = e5; });
    const baseRows5 = [{ '년도': y5, '수양회종류': s5, '행사명': e5, '운행방향': '참석', '배정유형': '본대', '배정대수': '1', '버스정원': '44' }];
    let teamSheetRows5 = [], summaryRows5 = [], rosterSheetRows5 = [];
    window.alert = (m) => console.log('  (alert 발생: ' + m + ')');
    window.fetch = (url, opts) => {
      const u = String(url);
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body);
        if (body.sheetName === '버스배정_참석팀내역') {
          const hdr = ['NO', '년도', '수양회종류', '행사명', '배정유형', '교구', '구역/팀명', '인원수', '배정상태', '버스', '분산배정', '비고'];
          if (body.mode === 'append') body.rows.forEach((r) => { const o = {}; hdr.forEach((h, i) => (o[h] = r[i])); teamSheetRows5.push(o); });
          else if (body.mode === 'overwrite') teamSheetRows5 = body.rows.map((r) => { const o = {}; hdr.forEach((h, i) => (o[h] = r[i])); return o; });
        }
        if (body.sheetName === '버스배정_참석요약') summaryRows5 = body.mode === 'overwrite' ? body.rows : summaryRows5.concat(body.rows);
        if (body.sheetName === '탑승자_참석') rosterSheetRows5 = body.mode === 'overwrite' ? body.rows : rosterSheetRows5.concat(body.rows);
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
      }
      const decoded = decodeURIComponent(u);
      if (decoded.indexOf('참석인원명단') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows5 }) });
      if (decoded.indexOf('버스배정_기초정보') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: baseRows5 }) });
      if (decoded.indexOf('버스배정_참석팀내역') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: teamSheetRows5 }) });
      if (decoded.indexOf('버스배정_참석요약') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: summaryRows5 }) });
      if (decoded.indexOf('탑승자_참석') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterSheetRows5 }) });
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
    };
    sel.value = '본대';
    window.busAssignTypeChanged();
    window.busTab('teams');
    await new Promise((r) => setTimeout(r, 200));
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change'));
    window.busImportFromRetreat();
    await new Promise((r) => setTimeout(r, 300));
    window.busSaveTeamsToSheet();
    await new Promise((r) => setTimeout(r, 300));
    window.busTab('assign');
    await new Promise((r) => setTimeout(r, 600));
    window.busLoadRegisteredCount();
    await new Promise((r) => setTimeout(r, 300));
    window.busAutoAssign('arrive');
    await new Promise((r) => setTimeout(r, 400));
    window.busSaveToSheet('arrive');
    await new Promise((r) => setTimeout(r, 400));
    const beforeReset = teamSheetRows5.map((r) => [r['배정유형'], r['배정상태']]);
    assert(beforeReset.every((r) => r[1] === '배정'), '초기화 전: 본대/시각선교부 모두 배정 상태');
    window.busTabResetConfirm();
    await new Promise((r) => setTimeout(r, 2500));
    const mainAfter = teamSheetRows5.find((r) => r['배정유형'] === '본대');
    const jhAfter = teamSheetRows5.find((r) => r['배정유형'] === '시각선교부');
    assert(!!mainAfter && mainAfter['배정상태'] === '미배정' && !mainAfter['버스'], '초기화 후 본대 행이 미배정으로 초기화됨');
    assert(!!jhAfter && jhAfter['배정상태'] === '미배정' && !jhAfter['버스'], '초기화 후 시각선교부 행도 함께 미배정으로 초기화됨(기존 버그: 이전 배정상태가 그대로 남아있던 부분)');
  }

  console.log('▶ 테스트10: [v375] 자동배정 시 시각선교부 여러 구역이 가나다순으로 흩어지지 않고, 본대 배정 후 가장 인원 적은 버스 하나에 몰려서 배정됨');
  {
    const rosterRows6 = [];
    let no6 = 1;
    for (let p = 1; p <= 4; p++) {
      for (let d = 1; d <= 10; d++) {
        for (let k = 0; k < 4; k++) {
          rosterRows6.push({ 'NO': String(no6), '접수ID': 'LM' + (no6++), '성명': '인원' + no6, '교구': p + '교구', '구역': (10 + d) + '구역', '참석교통수단': '버스', '참석배정유형': '본대' });
        }
      }
    }
    ['5교구 51구역', '6교구 61구역', '7교구 71구역'].forEach((pd) => {
      const [p, d] = pd.split(' ');
      for (let k = 0; k < 2; k++) rosterRows6.push({ 'NO': String(no6), '접수ID': 'LJ' + (no6++), '성명': '시각인원' + no6, '교구': p, '구역': d, '참석교통수단': '버스', '참석배정유형': '시각선교부' });
    });
    const y6 = $('bus-sel-year') ? $('bus-sel-year').value : '', s6 = $('bus-sel-season') ? $('bus-sel-season').value : '', e6 = $('bus-sel-event') ? $('bus-sel-event').value : '';
    rosterRows6.forEach((r) => { r['연도'] = y6; r['수양회종류'] = s6; r['차수'] = e6; r['행사명'] = e6; });
    const baseRows6 = [{ '년도': y6, '수양회종류': s6, '행사명': e6, '운행방향': '참석', '배정유형': '본대', '배정대수': '4', '버스정원': '44' }];
    let teamSheetRows6 = [];
    window.alert = (m) => console.log('  (alert 발생: ' + m + ')');
    window.fetch = (url, opts) => {
      const u = String(url);
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body);
        if (body.sheetName === '버스배정_참석팀내역') {
          const hdr = ['NO', '년도', '수양회종류', '행사명', '배정유형', '교구', '구역/팀명', '인원수', '배정상태', '버스', '분산배정', '비고'];
          if (body.mode === 'append') body.rows.forEach((r) => { const o = {}; hdr.forEach((h, i) => (o[h] = r[i])); teamSheetRows6.push(o); });
          else if (body.mode === 'overwrite') teamSheetRows6 = body.rows.map((r) => { const o = {}; hdr.forEach((h, i) => (o[h] = r[i])); return o; });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
      }
      const decoded = decodeURIComponent(u);
      if (decoded.indexOf('참석인원명단') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows6 }) });
      if (decoded.indexOf('버스배정_기초정보') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: baseRows6 }) });
      if (decoded.indexOf('버스배정_참석팀내역') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: teamSheetRows6 }) });
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
    };
    sel.value = '본대';
    window.busAssignTypeChanged();
    window.busTab('teams');
    await new Promise((r) => setTimeout(r, 200));
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change'));
    window.busImportFromRetreat();
    await new Promise((r) => setTimeout(r, 300));
    window.busSaveTeamsToSheet();
    await new Promise((r) => setTimeout(r, 300));
    window.busTab('assign');
    await new Promise((r) => setTimeout(r, 600));
    window.busLoadRegisteredCount();
    await new Promise((r) => setTimeout(r, 300));
    window.busAutoAssign('arrive');
    await new Promise((r) => setTimeout(r, 400));
    const jhRows = teamSheetRows6.filter((r) => r['배정유형'] === '시각선교부');
    const jhBuses = [...new Set(jhRows.map((r) => r['버스']))];
    assert(jhRows.length === 3, '시각선교부 3개 구역이 모두 팀내역에 존재함');
    assert(jhBuses.length === 1, '시각선교부 3개 구역이 여러 버스로 흩어지지 않고 단 하나의 버스로 몰려서 배정됨 (실제 사용 버스 수: ' + jhBuses.length + ', 버스: ' + jhBuses.join(',') + ')');
    const busTotals = {};
    teamSheetRows6.filter((r) => r['배정유형'] === '본대').forEach((r) => { const b = r['버스'] || '(미배정)'; busTotals[b] = (busTotals[b] || 0) + parseInt(r['인원수'], 10); });
    const minLoadBus = Object.keys(busTotals).reduce((a, b) => (busTotals[a] <= busTotals[b] ? a : b));
    assert(jhBuses[0] === minLoadBus, '시각선교부가 배치된 버스가 실제로 본대 인원이 가장 적은 버스와 일치함 (기대: ' + minLoadBus + ', 실제: ' + jhBuses[0] + ')');
  }

  console.log('▶ 테스트11: [v376] 자동배정+저장 후 탑승자명단에 시각선교부 인원이 정확히 1회 포함되고(중복/누락 없음), 재배정·미배정 카운트가 0으로 정상 수렴함(팀 id 충돌 재발 방지)');
  {
    const rosterRows7 = [];
    for (let i = 1; i <= 11; i++) rosterRows7.push({ 'NO': String(i), '접수ID': 'IM' + i, '성명': '본대인원' + i, '교구': '1교구', '구역': '15구역', '참석교통수단': '버스', '참석배정유형': '본대' });
    rosterRows7.push({ 'NO': '12', '접수ID': 'IJ1', '성명': '박서윤', '교구': '1교구', '구역': '15구역', '참석교통수단': '버스', '참석배정유형': '시각선교부' });
    const y7 = $('bus-sel-year') ? $('bus-sel-year').value : '', s7 = $('bus-sel-season') ? $('bus-sel-season').value : '', e7 = $('bus-sel-event') ? $('bus-sel-event').value : '';
    rosterRows7.forEach((r) => { r['연도'] = y7; r['수양회종류'] = s7; r['차수'] = e7; r['행사명'] = e7; });
    const baseRows7 = [{ '년도': y7, '수양회종류': s7, '행사명': e7, '운행방향': '참석', '배정유형': '본대', '배정대수': '1', '버스정원': '44' }];
    let teamSheetRows7 = [], summaryRows7 = [], rosterSheetRows7 = [];
    window.alert = (m) => console.log('  (alert 발생: ' + m + ')');
    window.fetch = (url, opts) => {
      const u = String(url);
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body);
        if (body.sheetName === '버스배정_참석팀내역') {
          const hdr = ['NO', '년도', '수양회종류', '행사명', '배정유형', '교구', '구역/팀명', '인원수', '배정상태', '버스', '분산배정', '비고'];
          if (body.mode === 'append') body.rows.forEach((r) => { const o = {}; hdr.forEach((h, i) => (o[h] = r[i])); teamSheetRows7.push(o); });
          else if (body.mode === 'overwrite') teamSheetRows7 = body.rows.map((r) => { const o = {}; hdr.forEach((h, i) => (o[h] = r[i])); return o; });
        }
        if (body.sheetName === '버스배정_참석요약') summaryRows7 = body.mode === 'overwrite' ? body.rows : summaryRows7.concat(body.rows);
        if (body.sheetName === '탑승자_참석') rosterSheetRows7 = body.mode === 'overwrite' ? body.rows : rosterSheetRows7.concat(body.rows);
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
      }
      const decoded = decodeURIComponent(u);
      if (decoded.indexOf('참석인원명단') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterRows7 }) });
      if (decoded.indexOf('버스배정_기초정보') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: baseRows7 }) });
      if (decoded.indexOf('버스배정_참석팀내역') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: teamSheetRows7 }) });
      if (decoded.indexOf('버스배정_참석요약') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: summaryRows7 }) });
      if (decoded.indexOf('탑승자_참석') !== -1) return Promise.resolve({ json: () => Promise.resolve({ success: true, data: rosterSheetRows7 }) });
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
    };
    sel.value = '본대';
    window.busAssignTypeChanged();
    window.busTab('teams');
    await new Promise((r) => setTimeout(r, 200));
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change'));
    window.busImportFromRetreat();
    await new Promise((r) => setTimeout(r, 300));
    window.busSaveTeamsToSheet();
    await new Promise((r) => setTimeout(r, 300));
    window.busTab('assign');
    await new Promise((r) => setTimeout(r, 600));
    window.busLoadRegisteredCount();
    await new Promise((r) => setTimeout(r, 300));
    window.busAutoAssign('arrive');
    await new Promise((r) => setTimeout(r, 400));
    window.busSaveToSheet('arrive');
    await new Promise((r) => setTimeout(r, 500));
    const names7 = rosterSheetRows7.map((r) => r[11]).filter(Boolean);
    assert(names7.length === 12, '탑승자 총원이 정확히 12명(중복 없음) — 실제: ' + names7.length);
    assert(names7.filter((n) => n === '박서윤').length === 1, '박서윤이 정확히 1회만 포함됨(중복 없음)');
    assert(names7.filter((n) => n.indexOf('본대인원') === 0).length === 11, '본대인원 11명이 중복 없이 포함됨');
    const reassign7 = window._busCalcReassignGroups('arrive');
    assert(Object.keys(reassign7).length === 0, '자동배정+저장 후 재배정 대상이 남지 않음(빈 객체) — 실제: ' + JSON.stringify(reassign7));
    const unassigned7 = window.calcBusUnassignedCounts();
    assert(unassigned7.arrive === 0, '참석 미배정 카운트가 0으로 정상 수렴함 — 실제: ' + unassigned7.arrive);
  }

  console.log('\n──────────────────────');
  console.log(`총 ${pass + fail}건 중 성공 ${pass}건 / 실패 ${fail}건`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('테스트 실행 중 예외:', e); process.exit(1); });
