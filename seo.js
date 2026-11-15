// SEO / AEO / GEO 렌더링
// - 공개 페이지(/, /products/:id)를 서버에서 미리 그려 크롤러·AI가 JS 없이도 내용을 읽게 한다.
// - 메타 태그, Open Graph, JSON-LD 구조화 데이터, robots.txt, sitemap.xml, llms.txt 생성.
const fs = require("fs");
const path = require("path");
const { PRODUCTS, FREE_SHIPPING_MIN, SHIPPING_FEE } = require("./shop/products.js");

const SITE_NAME = "LOOM";
const SITE_TAGLINE = "덜어낸 디자인, 오래 입는 옷";
const SITE_DESCRIPTION =
  "LOOM은 셔츠·니트·데님·코트·액세서리를 파는 미니멀 의류 쇼핑몰입니다. 5만원 이상 구매 시 무료배송, 시즌 아이템 최대 21% 할인. (수업 과제용 데모 사이트: 결제는 토스페이먼츠 테스트 모드이며 실제 출금·배송은 없습니다.)";

const CATEGORY_LABEL = { top: "상의", bottom: "하의", outer: "아우터", acc: "액세서리" };

// 화면에 보이는 FAQ와 FAQPage 구조화 데이터가 같은 내용을 쓴다 (구글 가이드라인: 보이는 내용과 일치해야 함).
const FAQ = [
  {
    q: "배송비는 얼마인가요?",
    a: `주문 금액이 ${FREE_SHIPPING_MIN.toLocaleString("ko-KR")}원 이상이면 무료배송이고, 그 미만이면 배송비 ${SHIPPING_FEE.toLocaleString("ko-KR")}원이 붙습니다.`,
  },
  {
    q: "어떤 결제 수단을 쓸 수 있나요?",
    a: "토스페이먼츠 결제창에서 카드, 계좌이체, 간편결제 등을 고를 수 있습니다. 이 사이트는 데모라 테스트 모드로만 동작하며 실제로 돈이 빠져나가지 않습니다.",
  },
  {
    q: "실제로 상품을 주문하고 받을 수 있나요?",
    a: "아니요. LOOM은 수업 과제용 데모 쇼핑몰이라 주문은 테스트로만 처리되고 실제 배송은 없습니다.",
  },
  {
    q: "사이즈는 어떻게 고르나요?",
    a: "의류는 S, M, L, XL 네 가지 사이즈가 있고, 가방·비니·벨트 같은 액세서리는 FREE 사이즈 하나입니다. 상품 상세 페이지에서 색상과 사이즈를 고른 뒤 장바구니에 담으면 됩니다.",
  },
  {
    q: "회원가입을 해야 주문할 수 있나요?",
    a: "아니요. 회원가입 없이 장바구니에 담고 주문자 정보만 입력하면 바로 결제할 수 있습니다.",
  },
];

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
      ${FAQ.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n      ")}
    </div>
  </section>`;
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
          {
            "@type": "FAQPage",
            mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ],
      },
    ],
  });
  return fill(TEMPLATE, { head, main: homeMainHTML(), homeInfo: homeInfoHTML() });
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

${FAQ.map((f) => `- **${f.q}** ${f.a}`).join("\n")}

## 기타

- [홈](${base}/)
- [사이트맵](${base}/sitemap.xml)
`;
}

module.exports = { renderHome, renderProduct, renderNotFound, robotsTxt, sitemapXml, llmsTxt };
