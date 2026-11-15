# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 저장소 구성

한 저장소에 서로 무관한 두 프로젝트가 있다. 둘 다 빌드 도구·린터·테스트가 없는 순수 HTML/CSS/JS다.

- **LOOM 쇼핑몰** (주 프로젝트): `server.js`, `seo.js`, `shop/`. 명세는 `PRD-shop.md`.
- **Splash Arena 게임**: 루트의 `index.html` + `game.js`. 명세는 `PRD.md`. 서버와 연결돼 있지 않다 (`server.js`는 `shop/`만 제공). 브라우저에서 `index.html`을 직접 연다. 기존 게임의 이름·캐릭터·아트를 쓰지 않는 오리지널 게임이라는 제약이 PRD에 있다.

## 명령어

```bash
npm install
npm start                 # http://localhost:3000 (PORT 환경변수로 변경)
node --check server.js seo.js shop/script.js   # 문법 검사 (테스트 대신)
```

환경변수 (모두 선택):
- `SITE_URL`: canonical·sitemap 절대 주소. 없으면 요청 Host로 추정.
- `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY`: 없으면 토스 문서 공개 테스트 키 사용. `test_` 로 시작하지 않으면 서버가 종료된다 (라이브 키 금지).
- `GOOGLE_SITE_VERIFICATION`, `NAVER_SITE_VERIFICATION`: 메타 태그로 주입.

## 배포

Vercel이 GitHub `main` 브랜치에 연결돼 있어 푸시하면 자동 배포된다 (`vercel.json` 없이 Express를 감지). 운영 주소: https://shop-indol-five-14.vercel.app . `shop/googlefa46cb821e052c3c.html`은 Google Search Console 소유 확인 파일이라 지우면 안 된다.

## 쇼핑몰 아키텍처

**`shop/products.js`가 단일 데이터 원천.** UMD 형태라 브라우저(`window.LOOM_SHOP`)와 서버(`require`)가 같은 파일을 쓴다. 상품·배송비·최대 수량을 바꾸면 결제 금액 검증, 서버 렌더링, sitemap, llms.txt가 모두 따라 바뀐다.

**라우팅이 두 종류로 섞여 있다.**
- 공개 페이지(색인 대상): `/`, `/products/:id`, `/faq`는 실제 경로. `seo.js`가 `shop/index.html`을 템플릿으로 읽어 `<title>…<!--SEO_HEAD-->`, `<!--SSR_MAIN-->`, `<!--HOME_INFO-->` 자리표시자를 채워 서버 렌더링한다.
- 비공개 화면: 장바구니·주문·완료는 해시 라우팅(`/#/cart`, `/#/checkout`, `/#/complete/:orderNo`).
- `shop/script.js`의 `router()`가 `location.pathname`을 먼저 보고, 그다음 해시를 본다. 클라이언트가 로드되면 서버가 그린 `#app` 내용을 덮어쓰므로, **서버(`seo.js`)와 클라이언트(`script.js`)의 마크업을 같은 CSS 클래스로 맞춰야 한다.**
- 해시 링크는 항상 절대 경로(`/#/cart`)로 쓴다. `/products/3`에서 상대 `#/cart`를 쓰면 상품 페이지에 머문다.
- 예전 `#/product/:id` 주소는 클라이언트가 `/products/:id`로 옮긴다.
- FAQ 문구는 `seo.js`의 `FAQ_GROUPS` 하나가 원천이다. `/faq` 페이지(전체, 분류별 앵커), 홈 미리보기(`home: true` 항목만), llms.txt, `FAQPage` JSON-LD를 모두 여기서 만든다. `FAQPage` 마크업은 `/faq`에만 넣는다 (구글 가이드라인: 보이는 내용과 일치, 같은 FAQ를 여러 페이지에 마크업하지 않음).
- `/faq`는 클라이언트가 다시 그리지 않는다. `router()`가 이 경로에서 바로 반환해 서버가 그린 내용을 유지하고, `#shipping` 같은 해시는 분류 앵커로만 쓴다.
- 홈의 FAQ 미리보기(`#homeInfo`)는 `#app` 밖에 있어 홈 해시 라우트가 아닐 때 `router()`가 숨긴다.

**결제 흐름 (토스페이먼츠 결제위젯, 테스트 모드)**
1. `GET /api/config`로 클라이언트 키를 받는다.
2. `POST /api/orders`: 서버가 `products.js`로 금액을 다시 계산하고 주문번호를 발급한다 (클라이언트 금액은 믿지 않음).
3. 토스 결제창 → `success.html` / `fail.html`로 돌아온다.
4. `success.html`이 `POST /api/confirm`을 호출한다. 서버가 저장된 금액과 비교한 뒤 토스 승인 API를 부른다. 같은 결제를 다시 승인하려 하면(새로고침 등) 저장된 결과를 돌려준다.
- 주문은 서버 메모리(`Map`)에만 있다. Vercel 서버리스에서는 인스턴스가 바뀌면 사라질 수 있다.
- 시크릿 키와 `api.tosspayments.com` 호출은 서버에서만 한다.

**SEO 엔드포인트** (`seo.js`에서 동적 생성, 실제 파일 없음): `/robots.txt`, `/sitemap.xml`(`/faq` 포함), `/llms.txt`. `success.html`·`fail.html`·`/api`는 noindex. 없는 경로는 서버가 404 상태로 응답한다.

**클라이언트 상태**: 장바구니는 `localStorage`의 `loom-cart` 키에 저장하고, 저장소를 못 쓰면 메모리로 동작한다. `loom-pending-order`, `loom-last-order` 키는 결제 리다이렉트 사이에서 주문 정보를 넘기는 데 쓴다.
