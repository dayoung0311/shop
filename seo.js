// SEO / AEO / GEO 렌더링
// - 공개 페이지(/, /products/:id)를 서버에서 미리 그려 크롤러·AI가 JS 없이도 내용을 읽게 한다.
// - 메타 태그, Open Graph, JSON-LD 구조화 데이터, robots.txt, sitemap.xml, llms.txt 생성.
const fs = require("fs");
const path = require("path");
const { PRODUCTS, FREE_SHIPPING_MIN, SHIPPING_FEE, MAX_QTY } = require("./shop/products.js");

const SITE_NAME = "LOOM";
const SITE_TAGLINE = "덜어낸 디자인, 오래 입는 옷";
const SITE_DESCRIPTION =
  "LOOM은 셔츠·니트·데님·코트·액세서리를 파는 미니멀 의류 쇼핑몰입니다. 5만원 이상 구매 시 무료배송, 시즌 아이템 최대 21% 할인. (수업 과제용 데모 사이트: 결제는 토스페이먼츠 테스트 모드이며 실제 출금·배송은 없습니다.)";

const CATEGORY_LABEL = { top: "상의", bottom: "하의", outer: "아우터", acc: "액세서리" };

// FAQ 원천 데이터. /faq 페이지(전체)와 홈(home: true 항목 미리보기), FAQPage JSON-LD, llms.txt가 모두 이 배열을 쓴다.
// FAQPage 구조화 데이터는 /faq 한 곳에만 넣는다 (구글 가이드라인: 화면에 보이는 내용과 일치, 같은 FAQ를 여러 페이지에 마크업하지 않음).
const FAQ_GROUPS = [
  {
    id: "order",
    title: "주문·결제",
    items: [
      { home: true, q: "회원가입을 해야 주문할 수 있나요?", a: "아니요. 회원가입 없이 장바구니에 담고 주문자 정보만 입력하면 바로 결제할 수 있습니다." },
      { home: true, q: "어떤 결제 수단을 쓸 수 있나요?", a: "토스페이먼츠 결제창에서 카드, 계좌이체, 간편결제 등을 고를 수 있습니다. 이 사이트는 데모라 테스트 모드로만 동작하며 실제로 돈이 빠져나가지 않습니다." },
      { q: "결제 도중 창을 닫았거나 결제가 실패했어요.", a: "결제가 끝나지 않으면 장바구니는 그대로 남아 있습니다. 실패 안내 화면의 '다시 결제하기'를 누르거나 장바구니에서 다시 주문하면 됩니다." },
      { q: "주문 내역은 어디서 확인하나요?", a: "결제가 끝나면 완료 화면에 주문번호와 결제 금액이 표시됩니다. 회원 기능이 없어 따로 주문 조회 페이지는 없습니다." },
    ],
  },
  {
    id: "shipping",
    title: "배송",
    items: [
      { home: true, q: "배송비는 얼마인가요?", a: `주문 금액이 ${FREE_SHIPPING_MIN.toLocaleString("ko-KR")}원 이상이면 무료배송이고, 그 미만이면 배송비 ${SHIPPING_FEE.toLocaleString("ko-KR")}원이 붙습니다.` },
      { q: "무료배송 기준 금액은 할인 전 가격으로 계산하나요?", a: `아니요. 할인가가 적용된 상품 금액 합계가 ${FREE_SHIPPING_MIN.toLocaleString("ko-KR")}원 이상이어야 무료배송입니다. 장바구니 화면에서 무료배송까지 남은 금액을 알려 드립니다.` },
    ],
  },
  {
    id: "product",
    title: "상품·사이즈",
    items: [
      { home: true, q: "사이즈는 어떻게 고르나요?", a: "의류는 S, M, L, XL 네 가지 사이즈가 있고, 가방·비니·벨트 같은 액세서리는 FREE 사이즈 하나입니다. 상품 상세 페이지에서 색상과 사이즈를 고른 뒤 장바구니에 담으면 됩니다." },
      { q: "한 번에 몇 개까지 살 수 있나요?", a: `같은 상품의 같은 색상·사이즈 조합은 최대 ${MAX_QTY}개까지 담을 수 있습니다. 색상이나 사이즈가 다르면 따로 담을 수 있습니다.` },
      { q: "장바구니에 담은 상품은 언제까지 남아 있나요?", a: "장바구니는 지금 쓰는 브라우저에 저장되어 창을 닫아도 남아 있습니다. 다른 기기나 다른 브라우저와는 공유되지 않습니다." },
    ],
  },
  {
    id: "return",
    title: "교환·반품",
    items: [
      { q: "교환이나 반품을 할 수 있나요?", a: "LOOM은 실제 배송을 하지 않는 데모 쇼핑몰이라 교환·반품 절차가 없습니다. 결제도 테스트 모드라 환불할 금액이 생기지 않습니다." },
    ],
  },
  {
    id: "about",
    title: "사이트 안내",
    items: [
      { home: true, q: "실제로 상품을 주문하고 받을 수 있나요?", a: "아니요. LOOM은 수업 과제용 데모 쇼핑몰이라 주문은 테스트로만 처리되고 실제 배송은 없습니다." },
    ],
  },
];
const FAQ = FAQ_GROUPS.flatMap((g) => g.items);

const TEMPLATE = fs.readFileSync(path.join(__dirname, "shop", "index.html"), "utf8");

// ===== helpers =====
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const won = (n) => n.toLocaleString("ko-KR") + "원";
const priceOf = (p) => p.salePrice ?? p.price;
const discountRate = (p) => (p.salePrice ? Math.round((1 - p.salePrice / p.price) * 100) : 0);
const findProduct = (id) => PRODUCTS.find((p) => String(p.id) === String(id));
// </script> 같은 문자열이 JSON-LD 밖으로 새지 않게 막는다.
const jsonLd = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
const productUrl = (base, p) => `${base}/products/${p.id}`;
const productTitle = (p) => `${p.name} - ${CATEGORY_LABEL[p.category]} | ${SITE_NAME}`;
const productDescription = (p) =>
  `${p.description} ${p.salePrice ? `${discountRate(p)}% 할인 ${won(p.salePrice)} (정가 ${won(p.price)})` : won(p.price)}. ` +
  `색상 ${p.colors.join("·")}, 사이즈 ${p.sizes.join("·")}.`;
// 할인가 유효기간: 이번 달 말일까지 (구글이 priceValidUntil 이 있는 할인가를 선호)
function endOfMonth() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

// ===== <head> =====
function headTags({ base, title, description, canonical, image, type = "website", robots = "index, follow, max-image-preview:large", ld = [] }) {
  const v = [];
  if (process.env.GOOGLE_SITE_VERIFICATION)
    v.push(`<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}" />`);
  if (process.env.NAVER_SITE_VERIFICATION)
    v.push(`<meta name="naver-site-verification" content="${esc(process.env.NAVER_SITE_VERIFICATION)}" />`);

  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    canonical && `<link rel="canonical" href="${esc(canonical)}" />`,
    `<link rel="alternate" type="text/plain" title="LLM용 사이트 요약" href="${base}/llms.txt" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    canonical && `<meta property="og:url" content="${esc(canonical)}" />`,
    image && `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    image && `<meta name="twitter:image" content="${esc(image)}" />`,
    ...v,
    ...ld.map(jsonLd),
  ]
    .filter(Boolean)
    .join("\n  ");
}

function fill(template, { head, main = "", homeInfo = "" }) {
  return template
    .replace(/<title>[^<]*<\/title>\s*<!--SEO_HEAD-->/, head)
    .replace("<!--SSR_MAIN-->", main)
    .replace("<!--HOME_INFO-->", homeInfo);
}

// ===== 서버 렌더링 조각 (script.js 와 같은 마크업/클래스) =====
function thumbHTML(p, { eager = false } = {}) {
  const img = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" />`
    : `<span aria-hidden="true">${p.emoji}</span>`;
  const tag = p.salePrice ? `<span class="thumb__tag">SALE</span>` : "";
  return `<div class="thumb" style="background:linear-gradient(160deg, ${p.bg[0]}, ${p.bg[1]})">${img}${tag}</div>`;
}

function priceHTML(p) {
  if (!p.salePrice) return `<div class="price"><span class="price__now">${won(p.price)}</span></div>`;
  return `<div class="price"><span class="price__rate">${discountRate(p)}%</span><span class="price__now">${won(p.salePrice)}</span><span class="price__orig">${won(p.price)}</span></div>`;
}

function homeMainHTML() {
  const list = [...PRODUCTS].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `
    <section class="banner">
      <p class="banner__eyebrow">2026 WINTER</p>
      <h1 class="banner__title">덜어낸 디자인,<br />오래 입는 옷</h1>
      <p class="banner__text">5만원 이상 구매 시 무료배송 · 시즌 아이템 최대 21% 할인</p>
    </section>
    <section aria-label="상품 목록">
      <p class="result-count">상품 ${list.length}개</p>
      <ul class="grid" role="list">
        ${list
          .map(
            (p) => `<li><a class="card" href="/products/${p.id}">${thumbHTML(p)}<p class="card__name">${esc(p.name)}</p>${priceHTML(p)}</a></li>`
          )
          .join("")}
      </ul>
    </section>`;
}

function homeInfoHTML() {
  return `<section class="info" id="homeInfo" aria-labelledby="faqTitle">
    <h2 class="info__title" id="faqTitle">자주 묻는 질문</h2>
    <p class="info__lead">${esc(SITE_DESCRIPTION)}</p>
    <div class="faq">
      ${FAQ.filter((f) => f.home).map(faqItemHTML).join("\n      ")}
    </div>
    <a class="info__more" href="/faq">자주 묻는 질문 전체 보기 →</a>
  </section>`;
}

const faqItemHTML = (f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`;

function faqMainHTML() {
  return `
    <nav aria-label="breadcrumb" class="back"><a href="/#/">홈</a> › 자주 묻는 질문</nav>
    <h1 class="page-title">자주 묻는 질문</h1>
    <p class="info__lead">주문·배송·사이즈에 대해 자주 받는 질문을 모았습니다. LOOM은 수업 과제용 데모 쇼핑몰이라 결제는 토스페이먼츠 테스트 모드로만 처리되고 실제 배송은 없습니다.</p>
    <nav class="faq-nav" aria-label="질문 분류">
      ${FAQ_GROUPS.map((g) => `<a href="#${g.id}">${esc(g.title)}</a>`).join("")}
    </nav>
    ${FAQ_GROUPS.map(
      (g) => `<section class="faq-group" id="${g.id}" aria-labelledby="${g.id}-title">
      <h2 class="faq-group__title" id="${g.id}-title">${esc(g.title)}</h2>
      <div class="faq">
        ${g.items.map(faqItemHTML).join("\n        ")}
      </div>
    </section>`
    ).join("\n    ")}
    <div class="faq-cta">
      <p>원하는 답을 찾지 못했나요? 상품 상세 페이지에서 색상·사이즈·배송 정보를 확인할 수 있어요.</p>
      <a class="btn" href="/#/">상품 둘러보기</a>
    </div>`;
}

function productMainHTML(p) {
  return `
    <nav aria-label="breadcrumb" class="back"><a href="/#/">홈</a> › ${CATEGORY_LABEL[p.category]}</nav>
    <article class="detail">
      ${thumbHTML(p, { eager: true })}
      <div>
        <p class="detail__cat">${CATEGORY_LABEL[p.category]}</p>
        <h1 class="detail__name">${esc(p.name)}</h1>
        ${priceHTML(p)}
        <p class="detail__desc">${esc(p.description)}</p>
        <dl class="detail__desc">
          <dt>색상</dt><dd>${p.colors.map(esc).join(", ")}</dd>
          <dt>사이즈</dt><dd>${p.sizes.join(", ")}</dd>
          <dt>배송</dt><dd>${won(FREE_SHIPPING_MIN)} 이상 무료배송 (미만 ${won(SHIPPING_FEE)})</dd>
        </dl>
      </div>
    </article>`;
}

// ===== JSON-LD =====
function organizationLd(base) {
  return {
    "@type": "OnlineStore",
    "@id": `${base}/#organization`,
    name: SITE_NAME,
    url: `${base}/`,
    logo: `${base}/favicon.svg`,
    description: SITE_DESCRIPTION,
  };
}

function productLd(base, p) {
  const url = productUrl(base, p);
  const offer = {
    "@type": "Offer",
    url,
    priceCurrency: "KRW",
    price: priceOf(p),
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    seller: { "@id": `${base}/#organization` },
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "KR" },
      shippingRate: { "@type": "MonetaryAmount", currency: "KRW", value: priceOf(p) >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE },
    },
  };
  if (p.salePrice) offer.priceValidUntil = endOfMonth();

  return {
    "@type": "Product",
    "@id": `${url}#product`,
    name: p.name,
    description: p.description,
    sku: `LOOM-${String(p.id).padStart(3, "0")}`,
    category: CATEGORY_LABEL[p.category],
    image: p.image ? [p.image] : undefined,
    brand: { "@type": "Brand", name: SITE_NAME },
    color: p.colors.join(", "),
    size: p.sizes.join(", "),
    offers: offer,
  };
}

// ===== 페이지 =====
function renderHome(base) {
  const title = `${SITE_NAME} | ${SITE_TAGLINE} - 미니멀 의류 쇼핑몰`;
  const head = headTags({
    base,
    title,
    description: SITE_DESCRIPTION,
    canonical: `${base}/`,
    image: PRODUCTS.find((p) => p.id === 7)?.image,
    ld: [
      {
        "@context": "https://schema.org",
        "@graph": [
          organizationLd(base),
          { "@type": "WebSite", "@id": `${base}/#website`, name: SITE_NAME, url: `${base}/`, inLanguage: "ko-KR", publisher: { "@id": `${base}/#organization` } },
          {
            "@type": "ItemList",
            name: `${SITE_NAME} 전체 상품`,
            itemListElement: PRODUCTS.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: productUrl(base, p), name: p.name })),
          },
        ],
      },
    ],
  });
  return fill(TEMPLATE, { head, main: homeMainHTML(), homeInfo: homeInfoHTML() });
}

function renderFaq(base) {
  const url = `${base}/faq`;
  const head = headTags({
    base,
    title: `자주 묻는 질문 | ${SITE_NAME}`,
    description: `${SITE_NAME} 주문·결제, 배송비, 사이즈, 교환·반품에 대한 자주 묻는 질문과 답변. ${won(FREE_SHIPPING_MIN)} 이상 무료배송, 회원가입 없이 주문 가능.`,
    canonical: url,
    ld: [
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "FAQPage",
            "@id": `${url}#faq`,
            url,
            inLanguage: "ko-KR",
            isPartOf: { "@id": `${base}/#website` },
            mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "홈", item: `${base}/` },
              { "@type": "ListItem", position: 2, name: "자주 묻는 질문", item: url },
            ],
          },
        ],
      },
    ],
  });
  return fill(TEMPLATE, { head, main: faqMainHTML() });
}

function renderProduct(base, id) {
  const p = findProduct(id);
  if (!p) return null;
  const head = headTags({
    base,
    title: productTitle(p),
    description: productDescription(p),
    canonical: productUrl(base, p),
    image: p.image,
    type: "product",
    ld: [
      {
        "@context": "https://schema.org",
        "@graph": [
          productLd(base, p),
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "홈", item: `${base}/` },
              { "@type": "ListItem", position: 2, name: p.name, item: productUrl(base, p) },
            ],
          },
        ],
      },
    ],
  });
  return fill(TEMPLATE, { head, main: productMainHTML(p) });
}

function renderNotFound(base) {
  const head = headTags({ base, title: `페이지를 찾을 수 없습니다 | ${SITE_NAME}`, description: SITE_DESCRIPTION, robots: "noindex, follow" });
  const main = `<div class="empty"><div class="empty__icon" aria-hidden="true">🧭</div><h1 class="empty__title">페이지를 찾을 수 없습니다</h1><p class="empty__text">주소가 잘못되었거나 없는 페이지예요.</p><a class="btn" href="/#/">쇼핑 계속하기</a></div>`;
  return fill(TEMPLATE, { head, main });
}

// ===== robots.txt / sitemap.xml / llms.txt =====
function robotsTxt(base) {
  // AI 검색·답변 크롤러도 명시적으로 허용 (GEO). 같은 그룹이라 규칙이 동일하게 적용된다.
  const aiBots = ["Googlebot", "Bingbot", "Yeti", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Google-Extended", "Applebot-Extended"];
  return [
    ...aiBots.map((b) => `User-agent: ${b}`),
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

function sitemapXml(base) {
  const latest = PRODUCTS.map((p) => p.createdAt).sort().at(-1);
  const urls = [
    `<url><loc>${base}/</loc><lastmod>${latest}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${base}/faq</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
    ...PRODUCTS.map(
      (p) =>
        `<url><loc>${productUrl(base, p)}</loc><lastmod>${p.createdAt}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority>` +
        (p.image ? `<image:image><image:loc>${esc(p.image)}</image:loc></image:image>` : "") +
        `</url>`
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>
`;
}

// https://llmstxt.org — AI가 사이트를 빠르게 이해하도록 돕는 마크다운 요약
function llmsTxt(base) {
  const byCat = Object.keys(CATEGORY_LABEL).map((cat) => {
    const items = PRODUCTS.filter((p) => p.category === cat).map((p) => {
      const price = p.salePrice ? `${won(p.salePrice)} (정가 ${won(p.price)}, ${discountRate(p)}% 할인)` : won(p.price);
      return `- [${p.name}](${productUrl(base, p)}): ${price}. ${p.description} 색상: ${p.colors.join(", ")} / 사이즈: ${p.sizes.join(", ")}`;
    });
    return `### ${CATEGORY_LABEL[cat]}\n\n${items.join("\n")}`;
  });

  return `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

중요: 이 사이트는 수업 과제용 데모입니다. 실제 판매·배송을 하지 않으며 결제는 토스페이먼츠 테스트 모드로만 처리됩니다.

## 쇼핑 정보

- 배송비: ${won(FREE_SHIPPING_MIN)} 이상 무료, 미만 ${won(SHIPPING_FEE)}
- 결제: 토스페이먼츠 결제창 (테스트 모드)
- 회원가입: 필요 없음
- 사이즈: 의류 S/M/L/XL, 액세서리 FREE

## 상품

${byCat.join("\n\n")}

## 자주 묻는 질문

${FAQ_GROUPS.map((g) => `### ${g.title}\n\n${g.items.map((f) => `- **${f.q}** ${f.a}`).join("\n")}`).join("\n\n")}

## 기타

- [홈](${base}/)
- [자주 묻는 질문](${base}/faq)
- [사이트맵](${base}/sitemap.xml)
`;
}

module.exports = { renderHome, renderFaq, renderProduct, renderNotFound, robotsTxt, sitemapXml, llmsTxt };
