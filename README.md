# GTS KOREA 홈페이지

## 열어보기

`index.html`을 Chrome 또는 Edge에서 열면 로컬 디자인을 확인할 수 있습니다. `admin/index.html`은 관리자 미리보기입니다. 로컬 관리자 데이터는 해당 브라우저에만 저장되고 홈페이지에는 반영되지 않습니다.

선택적으로 이 폴더에서 `python -m http.server 8080 --bind 127.0.0.1`을 실행한 뒤 `http://127.0.0.1:8080`을 열어도 됩니다. Python이 설치된 환경에서 사용하세요.

## 구성 및 기능

- 회사 소개 / 가공 서비스 / 제품·가공 사례 / 문의 안내 / 견적 문의
- PC, 태블릿, 모바일 반응형 레이아웃
- 모바일 메뉴, 소재별 사례 필터, 서비스 선택 시 문의 소재 자동 선택
- 필수 항목 검사, 문의 내용 미리보기, 확인 화면의 견적 문의 접수 버튼
- 키보드 탐색, 본문 바로가기, 모달, 움직임 최소화 설정 대응
- Cloudflare Pages·Resend·Turnstile 문의 연결을 완료했고 사용자가 실제 메일 수신을 확인했습니다. 문의 설정은 `DEPLOYMENT.md`에 있습니다.
- 제품·가공 사례 관리자 화면과 인증·저장 API를 제공합니다. 온라인 관리자 주소는 `https://gtskorea.co.kr/admin/`이며 허용된 관리자 이메일로 로그인합니다. 설정과 사용법은 `ADMIN_SETUP.md`에 있습니다.

## 수정할 파일

- `index.html`: 회사 소개, 메뉴, 서비스 및 사례 내용
- `styles.css`: 색상, 폰트, 반응형 레이아웃
- `theme-dark.css`: 현재 적용 중인 차콜·블랙 테마, 오렌지 포인트, 큰 메인 비주얼 및 직선형 카드. 기본 스타일 다음에 로드됩니다.
- `app.js`: 메뉴, 문의 미리보기
- `catalog.js`, `catalog.css`: 공개 제품·가공 사례 목록, 분류, 상세 보기
- `admin/`: 사진·설명 등록, 수정·삭제, 임시 저장·공개, 검색·정렬
- `lib/`: 관리자 인증 및 저장소 공통 코드. Functions에서 불러오므로 배포에 포함합니다.
- `migrations/0001_catalog.sql`: D1 제품 테이블 생성 SQL
- `inquiry-delivery.js`, `functions/api/`: 설정 완료 후 활성화되는 문의 발송 기능
- `build.py`: 공개 가능한 파일만 `dist`에 복사
- `assets/materials-studio.png`: 현재 메인 화면에 사용하는 AI 소재 콘셉트 렌더 (실제 제품 사진 아님)
- `assets/materials-studio.prompt.md`: 이미지 생성 방식과 사용한 프롬프트
- `assets/service-profile.png`, `assets/service-plastic.png`: PROFILE / PLASTIC 서비스 카드용 소재 콘셉트 렌더
- `assets/service-renders.prompt.md`: 서비스 이미지 생성 방식과 최종 프롬프트
- `assets/materials.svg`: 이전 버전 소재 그래픽, 현재 메인에서는 사용하지 않음

이 폴더는 자동매매 코드 및 실행 환경을 사용하지 않는 독립적인 웹 프로젝트입니다. 로컬 디자인은 폴더 전체를 다른 경로로 옮겨도 동작합니다. 온라인 문의 발송에는 별도 서버 설정이 필요합니다.

## 관리자 사용 범위

온라인 관리자는 D1 글 저장소, 비공개 R2 사진 저장소, Cloudflare Access 로그인을 사용합니다. 자세한 절차는 [관리자 연결 안내](ADMIN_SETUP.md)에 있습니다. 항목당 대표 사진 한 장을 관리하며 복수 사진 갤러리와 회사 전체 문구 편집은 포함하지 않습니다.

지금은 제품·가공 사례에 실제 데이터가 없으므로 등록 예정 카드만 표시합니다. 확인되지 않은 설비, 가공 정밀도, 인증, 고객사, 수치 또는 실적은 기재하지 않았습니다.

## 회사 연락 정보

- 주소: 경기도 화성시 팔탄면 푸른들판로 416-61
- 견적 이메일: GTS@gtskorea.co.kr (문의 영역 및 하단 mailto 링크 적용)
- 로고, 전화번호: 추후 제공 예정
- 이메일 링크는 사용자 메일 앱의 작성 화면을 엽니다. 홈페이지 견적 문의도 실제 수신됨을 사용자가 확인했습니다.
- 문의 보관은 접수 후 1년 보관 후 삭제입니다. 메일함에서 직접 관리하며 자동 삭제 기능은 없습니다.

## 도메인 정보

- 도메인: gtskorea.co.kr
- 등록 대행사: 가비아
- 네임서버: Cloudflare
- 만료일: 2027-12-10
- Cloudflare Pages 프로젝트 `gts-korea1`에서 운영 중

홈페이지 주소는 `https://gtskorea.co.kr`입니다. 홈페이지 전용 GitHub 저장소 `epaldks0877-design/home`의 `main` 변경을 Cloudflare Pages가 자동 배포합니다. 빌드 명령은 `python3 build.py`, 출력은 `dist`입니다. GitHub push 성공과 운영 배포 성공은 별도로 확인합니다.
