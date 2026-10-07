# 제품·가공 사례 관리자 연결

관리자 주소는 `https://gtskorea.co.kr/admin/`입니다. Cloudflare Access에서 허용한 관리자 이메일로 로그인해 제품·가공 사례의 사진과 설명을 관리합니다. 기존 홈페이지와 견적 메일은 운영 중이며 사용자가 실제 수신을 확인했습니다.

운영 연결은 Pages 프로젝트 `gts-korea1`, D1 데이터베이스 `gts-catalog`, 비공개 R2 버킷 `gts-catalog-images`, Access 앱 `GTS KOREA Admin`을 사용합니다. 관리자 이메일과 인증 설정값은 Cloudflare에서 관리하며 저장소에 넣지 않습니다. 설정을 저장한 뒤 해당 GitHub 커밋의 배포 완료와 아래 실제 사용 점검을 확인합니다.

## 로컬 화면 확인

`admin/index.html`을 브라우저로 열면 로컬 미리보기입니다. 사진 등록·수정·삭제, 임시 저장·공개 상태를 확인할 수 있습니다. 데이터는 해당 브라우저에만 저장되며 실제 홈페이지에는 올라가지 않습니다. 브라우저 데이터를 지우면 사라질 수 있습니다.

로컬 HTTP 서버에서는 `http://127.0.0.1:8080/admin/?preview=1`로 엽니다. 온라인 도메인에서는 `preview=1`을 넣어도 로컬 미리보기가 활성화되지 않습니다.

## 1. 글 저장소 만들기 — D1

1. Cloudflare **스토리지 및 데이터베이스 → D1 SQL 데이터베이스 → 데이터베이스 만들기**를 엽니다.
2. 이름을 `gts-catalog`로 정합니다.
3. 만든 데이터베이스의 **Console / 콘솔**에 들어갑니다.
4. `migrations/0001_catalog.sql` 전체를 붙여 넣고 **Execute / 실행**을 누릅니다. `catalog_items` 테이블이 생기면 됩니다.

참고: [Cloudflare D1 시작 안내](https://developers.cloudflare.com/d1/get-started/).

## 2. 사진 저장소 만들기 — R2

1. Cloudflare **R2 Object Storage**에서 `gts-catalog-images` 버킷을 만듭니다.
2. **Public Development URL / r2.dev와 Custom Domain은 활성화하지 않습니다.** 사진 공개 여부는 홈페이지 서버가 확인합니다.
3. 결제 수단이나 요금 확인 화면이 나오면 Cloudflare에 표시되는 조건을 확인합니다. 무료 한도를 초과하면 사용량에 따라 과금됩니다. 운영 계정의 R2 활성화는 사용자가 승인하고 완료했습니다.

참고: [R2 버킷 생성 안내](https://developers.cloudflare.com/r2/buckets/create-buckets/).

## 3. 홈페이지에 저장소 연결

**Workers & Pages → gts-korea1 (Pages) → 설정 → 바인딩 → 추가**, Production에 연결합니다.

| 종류 | 변수 이름 — 정확히 입력 | 저장소 |
|---|---|---|
| D1 데이터베이스 | `CATALOG_DB` | `gts-catalog` |
| R2 버킷 | `CATALOG_IMAGES` | `gts-catalog-images` |

바인딩은 재배포해야 적용됩니다. 아래 로그인 설정과 파일 업로드까지 끝낸 후 재배포합니다. [Pages 바인딩 안내](https://developers.cloudflare.com/pages/functions/bindings/).

## 4. 관리자 로그인 — Cloudflare Access

1. **Zero Trust → Access controls → Applications → Create new application**을 엽니다.
2. **Self-hosted and private** 유형으로 `GTS 관리자`를 만듭니다.
3. **같은 애플리케이션 안에** public hostname 두 개를 등록합니다. Domain은 모두 `gtskorea.co.kr`, Path는 각각 **`admin`**, **`api/admin`**입니다. 해당 경로와 하위 경로를 보호합니다. 두 경로가 같은 Application Audience를 사용해야 합니다.
4. Allow 정책의 **Include → Emails**에 본인이 관리하는 관리자 이메일을 입력합니다. Everyone 정책은 사용하지 않습니다.
5. 로그인 방법으로 **One-time PIN**을 선택합니다. 허용된 이메일로 받은 일회용 코드로 로그인합니다.
6. **Additional settings → Application Audience (AUD) Tag** 값을 복사합니다.
7. Zero Trust 팀 도메인도 확인합니다. 형태는 `팀이름.cloudflareaccess.com`입니다.

시크릿 창에서 `/admin/`, `/admin/index.html`, `/api/admin/session`이 모두 로그인을 요구하는지 확인합니다. 일반 홈페이지와 견적 문의는 기존처럼 방문할 수 있어야 합니다.

참고: [Access 앱 생성](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [일회용 코드 로그인](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [서버의 토큰 검증](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## 5. Pages 환경 변수 추가

**Workers & Pages → gts-korea1 → 설정 → 변수 및 비밀**, Production에 추가합니다. 기존 문의 환경 변수와 이메일 DNS는 유지합니다.

| 이름 | 유형 | 값 |
|---|---|---|
| `ADMIN_ACCESS_TEAM_DOMAIN` | 텍스트 | 확인한 `팀이름.cloudflareaccess.com` |
| `ADMIN_ACCESS_AUD` | 텍스트 | 위 애플리케이션의 AUD 값 |
| `ADMIN_EMAILS` | 텍스트 | Access 정책에 허용한 관리자 이메일. 여러 명이면 쉼표로 구분 |
| `SITE_ORIGIN` | 기존 텍스트 유지 | `https://gtskorea.co.kr` |

서버가 서명, 유효 기간, 발급자, AUD와 이메일을 검증합니다. `pages.dev`에서는 관리자 API를 이용할 수 없습니다. Production 저장소를 Preview 환경에 연결하지 않습니다. 비밀번호나 관리자 API 키를 브라우저에 저장하지 않습니다.

## 6. GitHub 업데이트 및 배포

검토와 테스트를 마친 홈페이지 소스를 **폴더 구조를 유지해** `epaldks0877-design/home` 저장소 루트에 반영하고 `main`에 push합니다. 이 저장소는 홈페이지 전용이며 자동매매 프로젝트 전체를 올리지 않습니다. Cloudflare Pages의 Git 연동이 새 커밋을 자동 배포합니다.

새 폴더는 `admin/`, `lib/`, `migrations/`, `functions/api/admin/`, `functions/api/media/`입니다. `functions/api/catalog.js`, `catalog.js`, `catalog.css`와 수정된 `index.html`, `app.js`, `build.py` 등도 함께 올립니다. **`lib/` 누락 시 Functions 빌드가 실패합니다.**

빌드 설정은 기존처럼 **명령 `python3 build.py` / 출력 `dist` / 루트 빈칸**입니다. GitHub 최신 커밋으로 자동 배포하거나 해당 커밋을 확인하고 재배포합니다. `.qa`, `.preview-browser`, `.dev.vars`, `.env`, 자동매매 폴더는 올리지 않습니다.

## 7. 실제 사용 확인

1. `https://gtskorea.co.kr/admin/` 접속 → 관리자 이메일로 로그인합니다.
2. **새 항목 등록 → 사진 선택 → 제목·분류·설명 → 임시 저장**합니다.
3. 시크릿 창의 일반 홈페이지에서 임시 저장 항목이 안 보이는지 확인합니다.
4. 공개 상태를 **홈페이지 공개**로 바꾸고 저장합니다. 대표 사진과 상세 설명이 있어야 공개됩니다.
5. 홈페이지를 새로 고쳐 목록·상세 사진을 확인합니다. 다시 임시 저장하면 공개 목록과 공개 사진 주소에서 접근할 수 없어야 합니다.
6. 검토용 항목은 삭제합니다. 삭제는 확인 창이 나오며 되돌릴 수 없습니다.

관리자 등록·수정 후에는 GitHub 업로드나 재배포 없이 홈페이지를 새로 고치면 반영됩니다. 로고·전화번호는 자료가 준비되면 별도로 적용합니다.

## 범위와 운영 참고

- 항목당 대표 사진 한 장, 제목, PROFILE / PLASTIC, 제품 / 가공 사례, 짧은 소개, 상세 설명, 소재명, 사진 설명, 표시 순서, 공개 상태를 관리합니다.
- JPG / PNG / WebP 원본 15MB 이하를 선택하면 긴 변 1,800px 이하 JPEG로 다시 저장합니다. 투명 배경은 흰색이 됩니다. 서버는 4MB 제한과 파일 형식을 검사합니다. 원본은 별도로 보관하세요.
- 같은 표시 순서는 최근 등록 항목부터 표시합니다. 목록은 페이지 단위로 조회합니다.
- 동시 수정 시 먼저 저장한 내용을 보호합니다. 실패하면 편집 내용을 유지합니다. 신규 저장 응답이 끊겼다면 목록에서 저장 여부를 확인합니다.
- 글은 D1, 사진은 비공개 R2에 저장합니다. 사용자 텍스트를 HTML로 실행하지 않습니다. 비공개 사진은 관리자 인증이 필요하고 공개 사진도 요청마다 공개 상태를 확인합니다.
- 삭제·교체 시 이전 사진도 정리합니다. D1과 R2는 하나의 트랜잭션이 아니므로 장애로 정리에 실패하면 Functions 로그에 `Catalog image cleanup failed` 또는 `Catalog image cleanup deferred`가 남습니다. 고아 파일 정리 및 별도 백업·복원 화면은 포함하지 않습니다.
- 문의 내역 관리, 회사 전체 문구 편집, 복수 사진 갤러리, 계정 관리 화면은 이번 범위에 없습니다. 견적 문의는 기존 이메일 수신 방식입니다.
- 연결 전에는 홈페이지가 준비 중 상태로 표시되고 관리자 저장은 차단됩니다. 실제 Access/D1/R2 연결 후 위 절차로 다시 확인해야 합니다.
