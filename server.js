// LOOM 데모 쇼핑몰 서버
// - shop/ 정적 파일 제공
// - POST /api/orders  : 장바구니로 주문 생성 (금액은 서버가 상품 데이터로 다시 계산)
// - POST /api/confirm : 토스페이먼츠 결제 승인 API 호출 (시크릿 키는 서버에서만 사용)
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { PRODUCTS, FREE_SHIPPING_MIN, SHIPPING_FEE, MAX_QTY } = require("./shop/products.js");
const seo = require("./seo.js");

// 토스페이먼츠 문서에 공개된 주문서형 결제 테스트 키 (실제 돈이 나가지 않음).
// 내 상점 키를 쓰려면 환경변수로 덮어쓰기. 라이브 키(live_*)는 이 데모에서 쓰지 않는다.
const CLIENT_KEY = process.env.TOSS_CLIENT_KEY || "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";
const SECRET_KEY = process.env.TOSS_SECRET_KEY || "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6";
const PORT = Number(process.env.PORT) || 3000;
// 배포 주소 (canonical·sitemap 절대 URL용). 예: SITE_URL=https://loom.example.com
// 없으면 요청 주소로 추정한다 — 배포 시에는 반드시 지정할 것.
const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "");

if (!CLIENT_KEY.startsWith("test_") || !SECRET_KEY.startsWith("test_")) {
  console.error("이 데모는 테스트 키(test_*)만 허용합니다.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", true); // Render·Railway 등 프록시 뒤에서 https 주소를 올바르게 인식
app.use(express.json({ limit: "20kb" }));

const baseUrl = (req) => SITE_URL || `${req.protocol}://${req.get("host")}`;

// API 응답은 검색 결과에 노출하지 않는다.
app.use("/api", (req, res, next) => {
  res.set("X-Robots-Tag", "noindex");
  next();
});


// 주문 저장소 (데모용 메모리 저장 — 서버 재시작 시 사라짐)
const orders = new Map();

function newOrderId() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `LOOM-${ymd}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function fail(res, status, code, message) {
  return res.status(status).json({ code, message });
}

app.get("/api/config", (req, res) => {
  res.json({ clientKey: CLIENT_KEY });
});

app.post("/api/orders", (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return fail(res, 400, "INVALID_CART", "장바구니가 비어 있거나 올바르지 않습니다.");
  }

  let subtotal = 0;
  const lines = [];
  for (const it of items) {
    const p = PRODUCTS.find((x) => x.id === Number(it?.id));
    const qty = Number(it?.qty);
    if (!p || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY || !p.sizes.includes(it.size) || !p.colors.includes(it.color)) {
      return fail(res, 400, "INVALID_CART", "장바구니에 올바르지 않은 상품이 있습니다.");
    }
    subtotal += (p.salePrice ?? p.price) * qty;
    lines.push({ id: p.id, name: p.name, size: it.size, color: it.color, qty });
  }
  const shipping = subtotal >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE;
  const amount = subtotal + shipping;
  const orderName = lines.length > 1 ? `${lines[0].name} 외 ${lines.length - 1}건` : lines[0].name;

  const orderId = newOrderId();
  orders.set(orderId, { orderId, orderName, amount, lines, status: "READY", createdAt: Date.now() });
  res.json({ orderId, orderName, amount });
});

app.post("/api/confirm", async (req, res) => {
  const { paymentKey, orderId } = req.body || {};
  const amount = Number(req.body?.amount);
  if (typeof paymentKey !== "string" || !paymentKey || typeof orderId !== "string") {
    return fail(res, 400, "INVALID_REQUEST", "결제 정보가 올바르지 않습니다.");
  }

  const order = orders.get(orderId);
  if (!order) return fail(res, 404, "ORDER_NOT_FOUND", "주문을 찾을 수 없습니다. 다시 주문해 주세요.");

  // 새로고침 등으로 같은 결제를 다시 승인하려 하면 저장된 결과를 돌려준다.
  if (order.status === "DONE") {
    if (order.paymentKey === paymentKey) return res.json(order.result);
    return fail(res, 409, "ALREADY_PAID", "이미 결제가 완료된 주문입니다.");
  }

  // 금액 조작 방지: 서버가 계산한 금액과 다르면 승인하지 않는다.
  if (amount !== order.amount) {
    return fail(res, 400, "AMOUNT_MISMATCH", "결제 금액이 주문 금액과 일치하지 않습니다.");
  }

  try {
    const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(SECRET_KEY + ":").toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    const data = await tossRes.json();

    if (!tossRes.ok) {
      return fail(res, tossRes.status, data.code || "CONFIRM_FAILED", data.message || "결제 승인에 실패했습니다.");
    }

    const result = {
      orderId: data.orderId,
      orderName: data.orderName,
      amount: data.totalAmount,
      method: data.method,
      approvedAt: data.approvedAt,
      receiptUrl: data.receipt?.url ?? null,
    };
    Object.assign(order, { status: "DONE", paymentKey, result });
    console.log(`[결제 완료] ${orderId} ${data.totalAmount}원 (${data.method})`);
    res.json(result);
  } catch (err) {
    console.error("[결제 승인 오류]", err);
    fail(res, 502, "CONFIRM_ERROR", "결제 승인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  }
});

// ===== SEO / AEO / GEO =====
app.get("/", (req, res) => res.type("html").send(seo.renderHome(baseUrl(req))));
app.get("/index.html", (req, res) => res.redirect(301, "/"));
app.get("/products/:id", (req, res) => {
  const html = seo.renderProduct(baseUrl(req), req.params.id);
  if (!html) return res.status(404).type("html").send(seo.renderNotFound(baseUrl(req)));
  res.type("html").send(html);
});
app.get("/robots.txt", (req, res) => res.type("text/plain").send(seo.robotsTxt(baseUrl(req))));
app.get("/sitemap.xml", (req, res) => res.type("application/xml").send(seo.sitemapXml(baseUrl(req))));
app.get("/llms.txt", (req, res) => res.type("text/plain; charset=utf-8").send(seo.llmsTxt(baseUrl(req))));

app.use(express.static(path.join(__dirname, "shop"), { index: false }));

app.use((req, res) => res.status(404).type("html").send(seo.renderNotFound(baseUrl(req))));

app.listen(PORT, () => {
  console.log(`LOOM 쇼핑몰: http://localhost:${PORT}`);
});
