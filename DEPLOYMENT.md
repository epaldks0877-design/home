# 홈페이지 공개 및 견적 메일 연결

## 현재 상태

- Cloudflare Pages 프로젝트 `gts-korea1`에 배포했고 `https://gtskorea.co.kr` 도메인을 연결했습니다.
- Resend 발신 도메인 `notify.gtskorea.co.kr` 인증과 Turnstile 설정을 완료했습니다.
- 사용자가 홈페이지 견적 문의를 보내 `GTS@gtskorea.co.kr`에 실제 도착했음을 확인했습니다.
- 문의 보관 기준은 **접수 후 1년 보관 후 삭제**입니다. 현재 메일함에서 직접 관리하며 자동 삭제 기능은 없습니다.
- 로고와 전화번호는 추후 제공 예정입니다.
- 제품·가공 사례 관리자는 `/admin/`에서 사용합니다. Access 로그인, D1 `CATALOG_DB`, R2 `CATALOG_IMAGES` 연결과 배포 후 점검은 [ADMIN_SETUP.md](ADMIN_SETUP.md)를 참고합니다. 환경 변수·바인딩 변경은 재배포 후 적용됩니다.

아래 내용은 기존 견적 문의 설정을 유지·재설정할 때 참고하는 안내입니다. 관리자 설정 중에 정상 작동하는 문의 환경 변수나 이메일 DNS를 삭제하지 않습니다.

## 필요한 연결 정보

1. Cloudflare 계정의 Workers & Pages 프로젝트 접근 권한.
2. Resend 계정, 발신 도메인 인증, 해당 발신 도메인으로 제한한 발송 API 키.
3. Cloudflare Turnstile 사이트 키와 비밀 키. 허용 호스트에 실제 홈페이지 도메인을 등록합니다.
4. 회사가 확인한 개인정보 수집·이용 안내 문구. 목적·항목·보유기간·동의 거부 안내와 사용 서비스 관련 처리 내용을 확정한 뒤 설정합니다. 보유기간을 임의로 기재하지 않았습니다.

비밀번호나 API 비밀 키를 채팅에 올리지 않고 Cloudflare 환경 변수의 Secret으로 직접 입력합니다. 현재 수신 메일의 비밀번호는 이 방식에서 필요하지 않습니다.

## 기존 이메일을 유지하는 DNS 구성

Resend에서 발신 전용 하위 도메인(예: notify.gtskorea.co.kr)을 인증하고 그 서비스가 제공하는 정확한 DNS 레코드를 Cloudflare에 추가합니다. 기존 GTS@gtskorea.co.kr 수신용 MX, SPF, DKIM 레코드를 삭제하거나 대체하지 않습니다. 실제 계정 화면에서 지정된 레코드를 확인한 후 적용합니다. 발신자는 인증된 하위 도메인 주소, 수신자는 기존 회사 이메일입니다.

## Cloudflare Pages 환경 변수

| 변수 | 값 / 용도 |
|---|---|
| `INQUIRY_ENABLED` | 처음에는 `false`, 연결 점검 후 `true` |
| `SITE_ORIGIN` | `https://gtskorea.co.kr` (끝 슬래시 없음, 실제 서비스 주소와 일치) |
| `INQUIRY_FROM` | 인증된 발신 주소. 예: `GTS KOREA <website@notify.gtskorea.co.kr>` |
| `RESEND_API_KEY` | Secret. Resend 발송 전용 키 |
| `TURNSTILE_SITE_KEY` | 공개 사이트 키 |
| `TURNSTILE_SECRET_KEY` | Secret. Turnstile 서버 검증 키 |
| `PRIVACY_NOTICE` | 회사가 확정한 개인정보 수집·이용 안내 전문 |

Production과 Preview 환경을 구분합니다. 공개 주소 하나에서만 접수하도록 구현되어 있으므로 www를 사용할 경우 대표 주소로 리디렉션하거나 SITE_ORIGIN을 그 주소로 정합니다. 프리뷰에서 시험하려면 그 프리뷰 주소용 환경 변수와 Turnstile 허용 호스트를 별도로 설정합니다.

## 배포 파일 만들기

이 프로젝트 폴더에서 Python으로 실행합니다.

```powershell
python build.py
```

`dist`에는 공개 파일만 들어갑니다. 프로젝트 폴더 전체를 웹 루트로 업로드하지 않습니다. 이미지 생성 프롬프트, 검증용 파일, 브라우저 프로필, 설정 비밀은 포함하지 않습니다.

Cloudflare Pages Functions는 `functions` 폴더에 있습니다. Node.js와 Wrangler를 사용할 수 있는 환경에서 이 프로젝트 폴더를 기준으로 실행합니다.

```powershell
npx wrangler@4 pages dev dist
```

로컬 비밀 변수는 `.dev.vars`에 작성할 수 있으며 Git 제외 대상입니다. 테스트용 Turnstile 키는 실제 공개 환경에 사용하지 않습니다.

계정 연결, 발신 인증, 변수 설정 후 **실제 배포 시에만** 다음을 실행합니다.

```powershell
npx wrangler@4 pages deploy dist --project-name gts-korea1
```

프로젝트가 없으면 먼저 Pages 프로젝트를 생성합니다. Functions가 있으므로 대시보드에 정적 파일만 드래그해서 올리는 방식 대신 Wrangler 또는 Git 연동으로 배포합니다. Pages 프로젝트의 Custom domains에서 도메인을 추가한 후 Cloudflare에서 요구하는 웹사이트 DNS를 연결합니다.

## 공개 전 실제 점검

- 접수 완료는 발송 서비스 접수를 뜻합니다. GTS@gtskorea.co.kr 받은편지함과 스팸함에서 실제 도착을 확인합니다.
- 정상 접수, 잘못된 항목, 미동의, 만료된 보안 토큰, 통신 실패를 확인합니다.
- API 키 미설정 시 접수 기능이 활성화되지 않는지 확인합니다.
- 기존 회사 이메일 송수신을 재확인합니다.
- 실패 후 재시도는 동일 작성 내용에 같은 접수번호를 사용해 중복 발송을 줄입니다. Resend의 idempotency 보장 기간을 넘어선 재시도까지 영구적으로 중복 방지하지는 않습니다.
- 제품 사진 업로드와 관리자 화면은 `ADMIN_SETUP.md`를 참고합니다. 견적 문의 데이터베이스는 별도로 만들지 않으며 문의는 이메일로 전달됩니다.

## 공식 문서

- https://developers.cloudflare.com/pages/functions/
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://resend.com/docs/api-reference/emails/send-email
