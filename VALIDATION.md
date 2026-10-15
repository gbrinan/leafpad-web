# 검증 결과 · 2026-10-13

- 핵심 테스트 9개 통과: 파일 이름, OKF 예약 이름, 본문 보존, 데스크톱 저장 기록 호환, 충돌 사본, 삭제된 원본 보호, OKF 실패 후 재시도, 외부 OKF 수정 보호, ZIP 중복 이름 처리.
- Python zipfile로 ZIP 파일의 CRC와 한글 파일 이름 검증.
- 실제 Chrome: 한글·이모지 입력, 자동 저장, 새로고침 후 메모/탭 복원, 제목 변경, 여러 파일 가져오기, MD/OKF/ZIP 다운로드.
- 실제 Chrome 폴더 API: 임시 브라우저 프로필의 OPFS 디렉터리 핸들로 원본 및 OKF 저장, 외부 변경 충돌 보존 확인. 개인 Drive 폴더는 테스트에 사용하지 않음.
- 메모 안의 HTML 문자열이 실행되지 않음을 확인.
- 두 번째 창의 편집을 잠그는 동작 검증.
- 서비스 워커 캐시를 통한 오프라인 재접속 검증.
- 1440×960 PC 화면 및 390×844 모바일 화면 확인, 모바일 가로 넘침 없음, 모바일 입력·저장 확인.
- 실제 Firefox의 초기 로드, 한글 입력, 자동 저장, 새로고침 후 내용 복원 검증.
- Firefox는 독립 기본 시나리오는 통과했지만 전체 연속 자동화에서는 재접속 대기가 시간 초과되는 경우가 있어 추가 확인이 필요합니다. 폴더 자동 저장의 권장 환경은 PC Chrome·Edge입니다.
- Chrome 테스트 중 페이지 JavaScript 오류 0개.

- 공개 GitHub Pages 주소에서 HTTP 200, 메모 작성·자동 저장·새로고침 후 복원, OKF 다운로드, JavaScript 오류 0개 확인.

실제 Drive 클라우드 업로드, Safari 실기기, 장시간 사용, 여러 기기의 동시 편집은 이번 웹 검증 범위에 포함하지 않았습니다. Drive 업로드는 각 PC의 Drive 데스크톱 앱이 담당하며, 다른 앱에서 동시에 파일을 편집하는 방식은 피하는 것이 좋습니다.


## Loading performance fix (2026-10-16)

- Public HTML returned HTTP 200 in 622 ms in a single local request; this is not an end-to-end browser measurement. The current in-app browser inspection timed out, so its specific bottleneck remains unconfirmed.
- Folder restoration previously queued every note for dual-save, including unchanged notes, with repeated whole-state IndexedDB writes and list rendering. Polling read every file body every ten seconds.
- Restoration now saves only pending changes. Last-modified time and byte size allow unchanged file bodies to be skipped during restoration and polling. Actual saves still read the source body for conflict protection. File listing/metadata checks and the first migration scan remain necessary; same-size edits preserving the timestamp are not detected by metadata polling.
- Preview generation is bounded to 512 characters; redundant pre-IndexedDB structured cloning and background-save list rendering were removed. Service worker cache advanced to v4.
- Ten core tests passed. Chrome browser scenarios passed: unchanged connected-folder reload produced zero file body reads and zero file writes, autosave, MD/OKF, conflicts, downloads, second-window read-only behavior, mobile layout and offline reload. Firefox was unavailable in the installed test runtime. No personal notes used.
