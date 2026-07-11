const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/home/claude/test_only_v272.html', 'utf-8');

async function run() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  const curYear = String(new Date().getFullYear());

  window.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    if (opts && opts.method === 'POST') return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({success:true})) });
    if (u.indexOf('sheetName=버스배정_참석요약') >= 0) {
      return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[
        {'년도':curYear,'수양회종류':'하계','행사명':'1차','버스명':'버스 1호','팀 목록':'1교구 11구역 5명'},
        {'년도':curYear,'수양회종류':'하계','행사명':'2차','버스명':'버스 2호','팀 목록':'2교구 21구역 3명'}
      ]})});
    }
    if (u.indexOf('sheetName=숙소배정내역') >= 0) {
      return Promise.resolve({ json: () => Promise.resolve({ success:true, data:[
        {'NO':'1','년도':curYear,'수양회종류':'하계','행사명':'1차','접수ID':'','건물명':'믿음관','배정호':'101호','교구':'1교구','구역':'11구역','이름':'일차사람'},
        {'NO':'2','년도':curYear,'수양회종류':'하계','행사명':'2차','접수ID':'','건물명':'믿음관','배정호':'102호','교구':'2교구','구역':'21구역','이름':'이차사람'}
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

  // ── 버스배정현황: 전체 옵션 존재 + 선택 시 두 회차 모두 반영 ──
  window.switchPanel('busview');
  await new Promise(r => setTimeout(r, 300));
  const bvOpts = Array.from($('busview-sel-event').options).map(o=>o.value);
  check('BV1 전체 옵션(빈값) 존재', bvOpts[0] === '', bvOpts);
  check('BV2 전체가 첫번째 옵션', bvOpts.indexOf('')===0);

  $('busview-sel-event').value = '';
  window.busviewReload();
  await new Promise(r => setTimeout(r, 500));
  const bvTeamNames = (window.document.getElementById('busview-content')||window.document.body).textContent;
  check('BV3 전체 선택 시 1차 팀(11구역) 표시', bvTeamNames.indexOf('11구역')>=0);
  check('BV4 전체 선택 시 2차 팀(21구역)도 함께 표시', bvTeamNames.indexOf('21구역')>=0);

  // ── 숙소배정현황: 전체 옵션 존재 + 선택 시 두 회차 모두 반영 ──
  window.switchPanel('roomview');
  await new Promise(r => setTimeout(r, 500));
  const rvOpts = Array.from($('roomview-sel-event').options).map(o=>o.value);
  check('RV1 전체 옵션(빈값) 존재', rvOpts[0] === '', rvOpts);

  $('roomview-sel-event').value = '';
  window.roomviewSearch();
  await new Promise(r => setTimeout(r, 500));
  const rvBody = window.document.body.textContent;
  check('RV2 전체 선택 시 1차 데이터(일차사람) 표시', rvBody.indexOf('일차사람')>=0 || rvBody.indexOf('1교구')>=0);
  check('RV3 전체 선택 시 2차 데이터(이차사람)도 함께 표시', rvBody.indexOf('이차사람')>=0 || rvBody.indexOf('2교구')>=0);

  results.forEach(r => console.log((r.pass?'PASS':'FAIL')+' - '+r.label+(r.extra!==undefined?' (got: '+JSON.stringify(r.extra)+')':'')));
  const fail = results.filter(r=>!r.pass).length;
  console.log('\n총 '+results.length+'건 중 '+(results.length-fail)+'건 통과, '+fail+'건 실패');
  process.exit(fail>0?1:0);
}
run().catch(e=>{console.error(e); process.exit(1);});
