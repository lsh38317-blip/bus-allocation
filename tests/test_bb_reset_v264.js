const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v401.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  const curYear = String(new Date().getFullYear());
  let lastOverwrites = [];

  window.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      lastOverwrites.push(body);
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({success:true})) });
    }
    if (u.indexOf('sheetName=버스배정_기초정보') >= 0) {
      return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[
        {'NO':'1','등록ID':'A1','년도':curYear,'수양회종류':'하계','행사명':'1차','배정유형':'선발대','운행방향':'참석','출발일자':'2026-07-11','출발시간':'08:00','배정대수':'2','등록일':'2026-01-01','등록자':'admin'},
        {'NO':'2','등록ID':'A2','년도':curYear,'수양회종류':'하계','행사명':'2차','배정유형':'본대','운행방향':'참석','출발일자':'2026-07-12','출발시간':'09:00','배정대수':'1','등록일':'2026-01-01','등록자':'admin'}
      ]})});
    }
    if (u.indexOf('sheetName=버스배정_운전자정보') >= 0) {
      return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[
        {'NO':'1','등록ID':'A1','배차':'1','이름':'기사1차','연락처':'010-1111-1111','승차위치':'','하차위치':''},
        {'NO':'2','등록ID':'A2','배차':'1','이름':'기사2차','연락처':'010-2222-2222','승차위치':'','하차위치':''}
      ]})});
    }
    if (u.indexOf('action=getAll') >= 0) return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[] }) });
    return Promise.reject(new Error('네트워크 비활성(테스트) - '+u.slice(0,60)));
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

  window.switchPanel('busbase');
  await new Promise(r => setTimeout(r, 600));

  // ── 버튼명/존재 확인 ──
  const leftCardBtns = Array.from(window.document.querySelector('#bbbase-panel-info .card').querySelectorAll('button')).map(b=>b.textContent.trim());
  check('B1 입력데이터 초기화 버튼 존재', leftCardBtns.some(t=>t.indexOf('입력데이터 초기화')>=0), leftCardBtns);
  check('B2 등록데이터 초기화 버튼 존재', leftCardBtns.some(t=>t.indexOf('등록데이터 초기화')>=0), leftCardBtns);
  check('B3 기존 "초기화" 단독 문구는 사라짐', !leftCardBtns.some(t=>t==='↺ 초기화'));

  // ── 실동작: 1차 선택 후 등록데이터 초기화 → 1차만 삭제, 2차는 보존 ──
  $('bb-year-sel').value = curYear;
  $('bb-season-sel').value = '하계';
  $('bb-event-sel').value = '1차';

  window.bbSheetResetConfirm(); // 1차 클릭(확인 대기)
  await new Promise(r => setTimeout(r, 100));
  check('B4 첫 클릭 시 아직 전송 안됨', lastOverwrites.length === 0);

  await new Promise(r => setTimeout(r, 2200));
  check('B5 2초 후 전송됨(기초정보+운전자정보 2건)', lastOverwrites.length === 2, lastOverwrites.length);

  const baseOverwrite = lastOverwrites.find(o => o.sheetName === '버스배정_기초정보');
  const drvOverwrite  = lastOverwrites.find(o => o.sheetName === '버스배정_운전자정보');
  const remainEvents = baseOverwrite ? baseOverwrite.data.rows.map(r=>r[4]) : [];
  check('B6 1차 데이터는 삭제됨', remainEvents.indexOf('1차')===-1, remainEvents);
  check('B7 2차 데이터는 보존됨', remainEvents.indexOf('2차')>=0, remainEvents);

  const remainDriverNames = drvOverwrite ? drvOverwrite.data.rows.map(r=>r[3]) : [];
  check('B8 1차 운전자(기사1차)는 삭제됨', remainDriverNames.indexOf('기사1차')===-1, remainDriverNames);
  check('B9 2차 운전자(기사2차)는 보존됨', remainDriverNames.indexOf('기사2차')>=0, remainDriverNames);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
