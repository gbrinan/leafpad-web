# LeafPad Web

브라우저에서 사용하는 가벼운 Markdown 탭 메모장입니다. GitHub Pages에서 서버 없이 실행하며, 일반 MD와 Open Knowledge Format v0.2 사본을 함께 보관할 수 있습니다.

## 기능

- 탭 편집과 탭 복원
- 입력을 멈추면 약 0.6초 뒤 브라우저 자동 저장
- 제목·본문 검색, 여러 Markdown 파일 가져오기
- MD / OKF 개별 다운로드
- 원본과 OKF 사본을 포함하는 전체 ZIP 백업
- PC Chrome·Edge에서 폴더 연결 및 실제 파일 자동 저장
- 외부 변경 감지, 충돌 사본, OKF 저장 실패 후 재시도
- 모바일 화면, 오프라인 앱 화면, 한 창에서 편집하도록 보호

## Google Drive와 함께 쓰기

1. PC의 Chrome 또는 Edge에서 앱을 엽니다.
2. **폴더 연결**을 눌러 Google Drive 데스크톱의 LeafPad 폴더를 선택하고 파일 편집 권한을 허용합니다.
3. 폴더에 있는 `.md`가 목록에 나타납니다. 메모를 누르면 탭으로 엽니다.
4. 원본과 `OKF/notes` 사본을 함께 저장합니다. 클라우드 업로드 완료는 Google Drive 앱에서 확인합니다.

웹사이트가 Google Drive에 직접 로그인하는 방식은 아닙니다. 다른 PC에서는 해당 PC의 Drive 폴더를 다시 연결해야 합니다. 모바일·Firefox·Safari처럼 폴더 연결을 지원하지 않는 환경에서는 브라우저 저장과 다운로드를 사용하세요. [브라우저 지원과 권한 조건](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)

브라우저 저장은 이 기기·브라우저·사이트 주소별로 관리됩니다. 사이트 데이터 삭제, 시크릿 모드 종료, 저장 공간 정리 전에 **전체 백업**을 다운로드하세요. 새로고침 후 폴더 권한이 해제되었다면 폴더 연결을 다시 눌러 복원합니다. 탭 닫기는 메모 자체를 삭제하지 않습니다.

## 두 가지 저장 형태

```text
LeafPad/
  내 메모.md
  OKF/
    index.md
    notes/
      내 메모.md
    .leafpad/
      ...json
```

OKF도 확장자는 `.md`입니다. YAML에 문서 유형, 제목, 상태, 출처, 생성 시각을 추가하고 본문은 그대로 유지합니다. `.leafpad` 저장 기록은 Windows LeafPad와 호환됩니다. OKF의 `index.md`와 `log.md` 예약 이름은 별도 파일 이름으로 매핑합니다. ZIP에는 사람이 읽을 원본, OKF 사본과 목록이 들어 있습니다. 자동 갱신에 필요한 `.leafpad` 기록은 연결된 폴더에서 유지합니다.

편집은 일반 MD에서 하세요. 외부에서 변경된 OKF 사본은 덮어쓰지 않고 저장 대기로 알립니다. 두 파일은 순서대로 저장하므로 동시에 하나의 트랜잭션으로 저장되는 것은 아닙니다. 제목 변경은 표시 제목과 OKF 제목을 갱신하며, 이미 연결된 원본 파일의 이름은 유지합니다. 링크 대상 파일의 이름 변경이나 파일 이동은 탐색기에서 관리하세요. 동시에 여러 기기·앱에서 같은 원본을 편집하는 방식은 피하세요. 충돌 확인 직후의 아주 짧은 경쟁 구간까지 잠그는 분산 협업 시스템은 아닙니다.

UTF-8 Markdown, 파일당 8MB 이하를 지원합니다. 레거시 인코딩 문서는 UTF-8로 변환한 뒤 여세요. 폴더 연결 시 최상위 Markdown만 불러오며 OKF 사본을 중복 가져오지 않습니다. 가져온 파일은 탭 대신 목록에 추가하고 선택한 메모만 탭으로 엽니다.

## 로컬 실행

Node.js 22 이상:

```sh
npm run serve
```

`http://127.0.0.1:4197`을 엽니다. 프로덕션에서는 HTTPS로 제공해야 폴더 연결과 오프라인 캐시를 사용할 수 있습니다. 앱 실행에는 패키지 설치나 빌드 단계가 필요하지 않습니다.

## 검증

```sh
npm test
```

핵심 저장 로직 테스트는 추가 의존성이 없습니다. 브라우저 검증은 Playwright가 필요합니다.

```sh
npm install --no-save playwright
BROWSER_CHANNEL=chrome node tests/browser.mjs
```

브라우저 테스트는 개인 메모를 사용하지 않고 임시 브라우저 프로필 및 브라우저 내부의 테스트 폴더(OPFS)를 사용합니다. 실제 Drive 연결 상태는 각 PC와 Drive 앱에서 확인해야 합니다. ZIP 검증에는 Python 표준 라이브러리 `zipfile`을 사용했습니다.

## 배포와 개인정보

GitHub Pages는 저장소의 HTML/CSS/JavaScript를 제공합니다. 메모는 GitHub 저장소에 자동 업로드되지 않으며, 앱은 분석 도구·외부 CDN·원격 폰트를 사용하지 않습니다. GitHub Pages 호스팅 자체의 접근 로그는 [GitHub 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)를 참고하세요.

기존 Windows 앱을 그대로 실행하는 페이지가 아니라, 같은 파일 저장 규칙을 지원하는 별도 웹 구현입니다. Windows LeafPad의 메모는 연결한 로컬 폴더에서 이어서 사용할 수 있습니다.

OKF 정의: [Google Cloud Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md).
