# 서울강서교회 수양회 관리 시스템 — jsdom 회귀 테스트 스위트

23개 파일, 총 238개 테스트 케이스 (v272 기준). 새 세션에서 이 폴더를 다시 사용하려면 아래 절차를 따르세요.

## 1. 새 세션에서 불러오는 법

이 폴더(`test_suite_bundle/`) 전체를 대화창에 업로드하거나, Claude Project의 "프로젝트 지식(파일)"에 추가해두면
다음 세션에서 Claude가 `/mnt/user-data/uploads/` 또는 `/mnt/project/`에서 이 파일들을 찾아 `/home/claude/`로 복사해 재사용할 수 있습니다.

Claude에게 이렇게 요청하면 됩니다:
> "업로드한 test_suite_bundle 테스트들을 /home/claude로 복사하고, 최신 retreat-site 파일 기준으로 회귀 테스트 돌려줘"

## 2. 테스트 실행 전 준비 — `test_only_vNNN.html` 만들기

모든 테스트는 원본 `retreat-site_vNNN.html`이 아니라, 계정 시트를 오프라인으로 하드코딩한 **테스트 전용 사본**
(`test_only_vNNN.html`)을 대상으로 합니다. 아래 절차로 생성합니다(버전 번호만 바꿔서 재사용):

```bash
VER=vNNN   # 예: v272

sed \
  -e "s/parish:'1교구', district:'1구역'/parish:'1교구', district:'11구역'/" \
  -e "s/parish:'2교구', district:'2구역'/parish:'2교구', district:'21구역'/" \
  retreat-site_${VER}.html > test_only_${VER}.html

python3 -c "
content = open('test_only_${VER}.html', encoding='utf-8').read()
old = \"{id:'parish1', name:'김교구',  pw:'parish1234',role:'parish',   position:'장로',    parish:'1교구', district:'',     regDate:'20260601', regBy:'admin'},\"
new = old + \"\n  {id:'user3',   name:'테스트',  pw:'user3234',  role:'district', position:'집사',    parish:'',     district:'',      regDate:'20260601', regBy:'admin'},\"
assert old in content, '계정 시트 원본 문자열을 찾지 못했습니다 — ACCOUNTS 배열이 수정되었는지 확인하세요'
content = content.replace(old, new)
open('test_only_${VER}.html','w',encoding='utf-8').write(content)
"
```

그 다음, 모든 테스트 파일 안의 `test_only_v(이전버전).html` 문자열을 `test_only_${VER}.html`로 일괄 치환합니다:

```bash
for f in test_*.js; do
  sed -i "s/test_only_v[0-9]*\.html/test_only_${VER}.html/" "$f"
done
```

## 3. 전체 실행

```bash
for f in test_*.js; do
  echo "=== $f ==="
  node "$f" 2>/dev/null | tail -2
done
```

각 파일은 `총 N건 중 N건 통과, 0건 실패` 형식으로 결과를 출력합니다. 실패가 나오면 그 파일 이름으로
`node 파일명.js 2>/dev/null | grep FAIL`을 돌려 상세 내용을 확인하세요.

## 4. 새 기능 추가 시

새 화면/기능을 수정할 때마다 위 스위트를 전부 재실행(회귀 확인) 하고, 그 기능 전용 신규 테스트 파일을
`test_기능명_v신규버전.js` 이름으로 추가한 뒤 이 번들에도 함께 넣어 다음 세션으로 이어가면 됩니다.

## 5. 파일 목록 (v272 기준, 238건)

| 파일 | 건수 | 내용 |
|---|---|---|
| test_integration.js | 31 | 로그인/필터/패널 시나리오 |
| test_parish_fix.js | 9 | 교구장 구역 기본값 |
| test_v244_new.js | 24 | 메뉴/교구장 enroll/사이드바 |
| test_v246_new.js | 29 | 레이아웃/교회목표/상단바 |
| test_search_enroll_btn.js | 3 | 배정인원현황 등록버튼 |
| test_enroll_grid.js | 12 | 버스신청 그리드 컬럼/상태 |
| test_enroll_edit_flow.js | 7 | 그리드 클릭→수정→저장 |
| test_enroll_session_grid.js | 7 | 세션 기반 그리드 |
| test_room_reset_save.js | 13 | 숙소배정 upsert/초기화 |
| test_v255_new.js | 9 | 버스배정현황 관리자전용/메뉴명/버튼이동 |
| test_event_all_option.js | 7 | 버스·숙소배정현황 "전체" 회차 옵션 |
| test_busbase_v257.js | 7 | 버스배정기초정보 운행방향별 배정유형/회차매핑 |
| test_enroll_v258.js | 4 | 버스신청 폼 재배치/배정유형 옵션 |
| test_vw_v259.js | 10 | 참석인원관리 툴바 정리 |
| test_vw_v260.js | 3 | 참석인원관리 엑셀업로드시간 위치 |
| test_grid_reorder_v261.js | 2 | 그리드 컬럼 순서 재배치 |
| test_busbase_restructure_v262.js | 15 | 버스배정기초정보/인원관리 탭 통합 |
| test_bb_reset_v264.js | 9 | 버스배정기초정보 등록데이터 초기화 |
| test_vw_event_v265.js | 10 | 참석인원관리 행사명/차수 분리 |
| test_empty_banner_v268.js | 9 | 참석인원 0건 안내 배너 |
| test_header_only_v269.js | 8 | 0건일 때 그리드 헤더만 표시 |
| test_session_no_migration_v270.js | 6 | 참석인원명단 차수 우선 사용(읽기/쓰기) |
| test_bp_assign_types_v272.js | 4 | 참석/귀가 배정유형 옵션 분리 |
