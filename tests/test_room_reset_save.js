const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v401.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  const curYear = String(new Date().getFullYear());
  let lastOverwriteBody = null;
  window.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    if (opts && opts.method === 'POST') {
      lastOverwriteBody = JSON.parse(opts.body);
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ success: true })) });
    }
    if (u.indexOf('sheetName=숙소배정내역') >= 0) {
      // 기존 시트에 "다른 회차"(2차) 데이터 1건 + "현재 회차"(1차) 데이터 1건이 이미 있다고 가정
      return Promise.resolve({
        json: () => Promise.resolve({
          success: true,
          data: [
            {'NO':'1','년도':curYear,'수양회종류':'하계','행사명':'2차','접수ID':'','건물명':'믿음관','배정호':'101호','교구':'2교구','구역':'21구역','이름':'다른회차사람'},
            {'NO':'2','년도':curYear,'수양회종류':'하계','행사명':'1차','접수ID':'','건물명':'믿음관','배정호':'102호','교구':'1교구','구역':'11구역','이름':'기존1차사람'}
          ]
        })
      });
    }
    if (u.indexOf('sheetName=참석인원명단') >= 0) {
      // roomImportFromRetreat()용 — 1차 회차, 숙소1/숙소2 배정된 참석자 2명
      return Promise.resolve({
        json: () => Promise.resolve({
          success: true,
          data: [
            {'접수ID':'1001','성명':'신규1차A','연도':curYear,'수양회종류':'하계','행사명':'1차','교구':'1교구','구역':'11구역','숙소1':'믿음관','숙소2':'201호'},
            {'접수ID':'1002','성명':'신규1차B','연도':curYear,'수양회종류':'하계','행사명':'1차','교구':'1교구','구역':'12구역','숙소1':'믿음관','숙소2':'202호'}
          ]
        })
      });
    }
    if (u.indexOf('action=getAll') >= 0) {
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
    }
    return Promise.reject(new Error('네트워크 비활성(테스트 환경) - ' + u.slice(0,60)));
  };
  window.console.error = () => {};
  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve);
  });
  await new Promise(r => setTimeout(r, 300));
  const $ = (id) => window.document.getElementById(id);
  const results = [];
  function check(label, cond, extra) { results.push({label, pass: !!cond, extra}); }

  $('inp-id').value = 'admin';
  window.onLoginIdInput();
  await new Promise(r => setTimeout(r, 20));
  $('inp-pw').value = 'admin1234';
  window.doLogin();
  await new Promise(r => setTimeout(r, 300));

  window.switchPanel('room');
  await new Promise(r => setTimeout(r, 300));

  // ── 버튼 존재/순서 확인 ──
  const btns = Array.from(window.document.querySelectorAll('#panel-room button')).map(b=>b.textContent.trim());
  check('R1 입력항목초기화 버튼 존재', btns.some(t=>t.indexOf('입력항목초기화')>=0), btns);
  check('R2 숙소배정초기화 버튼 존재', btns.some(t=>t.indexOf('숙소배정초기화')>=0), btns);
  const idxInput = btns.findIndex(t=>t.indexOf('입력항목초기화')>=0);
  const idxSheet = btns.findIndex(t=>t.indexOf('숙소배정초기화')>=0);
  check('R3 입력항목초기화가 숙소배정초기화보다 앞에 위치', idxInput>=0 && idxSheet>=0 && idxInput < idxSheet, {idxInput, idxSheet});

  // ── 입력항목초기화: 로컬만 초기화(네트워크 호출 없음, 즉시 실행) ──
  window.roomInputReset();
  check('R4 roomInputReset 정상 실행(에러없음, 즉시)', true);

  // ── 저장(upsert) 시나리오: 참석인원명단에서 1차 회차 숙소배정 2건을 실제 코드 흐름으로 불러온 뒤 저장 ──
  $('room-sel-type').value = '하계';
  $('room-sel-event').value = '1차';
  window.roomImportFromRetreat();
  await new Promise(r => setTimeout(r, 400));
  window.roomSaveToSheet();
  await new Promise(r => setTimeout(r, 400));

  check('R5 저장(POST) 호출됨', lastOverwriteBody !== null);
  const savedRows = lastOverwriteBody ? lastOverwriteBody.rows : [];
  const names = savedRows.map(r=>r[9]);
  check('R6 다른 회차(2차) 데이터 보존됨', names.indexOf('다른회차사람')>=0, names);
  check('R7 기존 1차 데이터는 신규 데이터로 교체됨(기존1차사람 없음)', names.indexOf('기존1차사람')===-1, names);
  check('R8 신규 저장한 1차 데이터 2건 모두 포함', names.indexOf('신규1차A')>=0 && names.indexOf('신규1차B')>=0, names);
  check('R9 전체 행 개수 = 다른회차1 + 신규1차2 = 3', savedRows.length===3, savedRows.length);

  // ── 숙소배정초기화: 확인 지연 후 현재 회차만 삭제 ──
  lastOverwriteBody = null;
  window.roomSheetResetConfirm(); // 1차 클릭 → 확인 대기 상태
  await new Promise(r => setTimeout(r, 100));
  check('R10 첫 클릭 시 아직 저장 호출 안됨(확인 대기중)', lastOverwriteBody === null);
  await new Promise(r => setTimeout(r, 2200)); // 2초 대기 후 실제 실행
  check('R11 2초 후 자동 실행되어 삭제 요청 전송됨', lastOverwriteBody !== null);
  if (lastOverwriteBody) {
    const remainNames = lastOverwriteBody.rows.map(r=>r[9]);
    check('R12 다른 회차(2차) 데이터는 보존됨', remainNames.indexOf('다른회차사람')>=0, remainNames);
    check('R13 현재 회차(1차) 데이터는 삭제됨', remainNames.indexOf('신규1차A')===-1 && remainNames.indexOf('기존1차사람')===-1, remainNames);
  }

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
