// ===== Data =====
const CATEGORIES = [
  { id: "all", label: "전체" },
  { id: "top", label: "상의" },
  { id: "bottom", label: "하의" },
  { id: "outer", label: "아우터" },
  { id: "acc", label: "액세서리" },
];

const { PRODUCTS, FREE_SHIPPING_MIN, SHIPPING_FEE, MAX_QTY } = window.LOOM_SHOP;
const CART_KEY = "loom-cart";
const ORDER_KEY = "loom-last-order";
const PENDING_KEY = "loom-pending-order";

// ===== Utils =====
const $app = document.getElementById("app");
const $badge = document.getElementById("cartBadge");
const $toast = document.getElementById("toast");

const won = (n) => n.toLocaleString("ko-KR") + "원";
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const findProduct = (id) => PRODUCTS.find((p) => p.id === Number(id));
const salePrice = (p) => p.salePrice ?? p.price;
const discountRate = (p) => (p.salePrice ? Math.round((1 - p.salePrice / p.price) * 100) : 0);
const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? "";

function thumbHTML(p, withTag = false) {
  const inner = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async"
         onerror="this.replaceWith(Object.assign(document.createElement('span'), { textContent: '${p.emoji}' }))" />`
    : `<span aria-hidden="true">${p.emoji}</span>`;
  const tag = withTag && p.salePrice ? `<span class="thumb__tag">SALE</span>` : "";
  return `<div class="thumb" style="background:linear-gradient(160deg, ${p.bg[0]}, ${p.bg[1]})">${inner}${tag}</div>`;
}

function priceHTML(p) {
  if (!p.salePrice) return `<div class="price"><span class="price__now">${won(p.price)}</span></div>`;
  return `<div class="price">
    <span class="price__rate">${discountRate(p)}%</span>
    <span class="price__now">${won(p.salePrice)}</span>
    <span class="price__orig">${won(p.price)}</span>
  </div>`;
}

function emptyHTML(icon, title, text, extra = "") {
  return `<div class="empty">
    <div class="empty__icon" aria-hidden="true">${icon}</div>
    <h2 class="empty__title">${title}</h2>
    <p class="empty__text">${text}</p>
    ${extra || `<a class="btn" href="/#/">쇼핑 계속하기</a>`}
  </div>`;
}

let toastTimer;
function showToast(html) {
  $toast.innerHTML = html;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.hidden = true), 2500);
}

// ===== Cart store =====
let memoryCart = [];

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // 데이터에 없는 상품이 남아있으면 제거
    return Array.isArray(parsed) ? parsed.filter((i) => findProduct(i.id)) : [];
  } catch {
    return memoryCart;
  }
}

function saveCart(cart) {
  memoryCart = cart;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    /* 저장소 사용 불가: 메모리로만 유지 */
  }
  updateBadge();
}

function addToCart(id, size, color, qty) {
  const cart = loadCart();
  const key = `${id}|${size}|${color}`;
  const existing = cart.find((i) => i.key === key);
  let capped = false;
  if (existing) {
    const next = existing.qty + qty;
    capped = next > MAX_QTY;
    existing.qty = Math.min(next, MAX_QTY);
  } else {
    cart.push({ key, id, size, color, qty });
  }
  saveCart(cart);
  return capped;
}

function updateQty(key, qty) {
  const cart = loadCart();
  const item = cart.find((i) => i.key === key);
  if (!item) return;
  item.qty = Math.max(1, Math.min(MAX_QTY, qty));
  saveCart(cart);
}

function removeItem(key) {
  saveCart(loadCart().filter((i) => i.key !== key));
}

function clearCart() {
  saveCart([]);
}

function cartTotals(cart) {
  const subtotal = cart.reduce((sum, i) => sum + salePrice(findProduct(i.id)) * i.qty, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE;
  return { subtotal, shipping, total: subtotal + shipping };
}

function updateBadge() {
  const count = loadCart().reduce((sum, i) => sum + i.qty, 0);
  $badge.textContent = count;
  $badge.hidden = count === 0;
  $badge.parentElement.setAttribute("aria-label", `장바구니 ${count}개`);
}

// ===== Home =====
const homeState = { category: "all", query: "", sort: "new" };

function filteredProducts() {
  const q = homeState.query.trim().toLowerCase();
  const list = PRODUCTS.filter(
    (p) => (homeState.category === "all" || p.category === homeState.category) && p.name.toLowerCase().includes(q)
  );
  const sorters = {
    new: (a, b) => b.createdAt.localeCompare(a.createdAt),
    low: (a, b) => salePrice(a) - salePrice(b),
    high: (a, b) => salePrice(b) - salePrice(a),
  };
  return list.sort(sorters[homeState.sort]);
}

function renderHome() {
  $app.innerHTML = `
    <section class="banner">
      <p class="banner__eyebrow">2026 WINTER</p>
      <h1 class="banner__title">덜어낸 디자인,<br />오래 입는 옷</h1>
      <p class="banner__text">5만원 이상 구매 시 무료배송 · 시즌 아이템 최대 21% 할인</p>
    </section>

    <section class="toolbar" aria-label="상품 필터">
      <div class="tabs" role="group" aria-label="카테고리">
        ${CATEGORIES.map(
          (c) => `<button class="tab" data-cat="${c.id}" aria-pressed="${homeState.category === c.id}">${c.label}</button>`
        ).join("")}
      </div>
      <div class="toolbar__row">
        <input class="search" id="search" type="search" placeholder="상품명 검색" aria-label="상품명 검색" value="${esc(homeState.query)}" />
        <select class="sort" id="sort" aria-label="정렬">
          <option value="new">신상품순</option>
          <option value="low">낮은가격순</option>
          <option value="high">높은가격순</option>
        </select>
      </div>
    </section>

    <section id="productArea" aria-live="polite"></section>
  `;

  document.getElementById("sort").value = homeState.sort;

  $app.querySelectorAll(".tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      homeState.category = btn.dataset.cat;
      $app.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-pressed", b === btn));
      renderProductArea();
    })
  );
  document.getElementById("search").addEventListener("input", (e) => {
    homeState.query = e.target.value;
    renderProductArea();
  });
  document.getElementById("sort").addEventListener("change", (e) => {
    homeState.sort = e.target.value;
    renderProductArea();
  });

  renderProductArea();
}

function renderProductArea() {
  const area = document.getElementById("productArea");
  const list = filteredProducts();

  if (list.length === 0) {
    area.innerHTML = emptyHTML(
      "🔍",
      "검색 결과가 없습니다",
      homeState.query ? `"${esc(homeState.query)}"에 맞는 상품이 없어요.` : "이 카테고리에 상품이 없어요.",
      `<button class="btn" id="resetFilter">필터 초기화</button>`
    );
    document.getElementById("resetFilter").addEventListener("click", () => {
      homeState.category = "all";
      homeState.query = "";
      homeState.sort = "new";
      renderHome();
    });
    return;
  }

  area.innerHTML = `
    <p class="result-count">상품 ${list.length}개</p>
    <ul class="grid" role="list">
      ${list
        .map(
          (p) => `<li>
            <a class="card" href="/products/${p.id}">
              ${thumbHTML(p, true)}
              <p class="card__name">${esc(p.name)}</p>
              ${priceHTML(p)}
            </a>
          </li>`
        )
        .join("")}
    </ul>
  `;
}

// ===== Detail =====
function renderDetail(id) {
  const p = findProduct(id);
  if (!p) {
    $app.innerHTML = emptyHTML("🧺", "상품을 찾을 수 없습니다", "삭제되었거나 존재하지 않는 상품이에요.");
    return;
  }

  const sel = { color: null, size: p.sizes.length === 1 ? p.sizes[0] : null, qty: 1 };

  $app.innerHTML = `
    <a class="back" href="/#/">← 목록으로</a>
    <article class="detail">
      ${thumbHTML(p, true)}
      <div>
        <p class="detail__cat">${categoryLabel(p.category)}</p>
        <h1 class="detail__name">${esc(p.name)}</h1>
        ${priceHTML(p)}
        <p class="detail__desc">${esc(p.description)}</p>

        <div class="opt">
          <p class="opt__label" id="colorLabel">색상 <span id="colorVal"></span></p>
          <div class="chips" role="group" aria-labelledby="colorLabel">
            ${p.colors.map((c) => `<button class="chip" data-color="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join("")}
          </div>
        </div>

        <div class="opt">
          <p class="opt__label" id="sizeLabel">사이즈 <span id="sizeVal"></span></p>
          <div class="chips" role="group" aria-labelledby="sizeLabel">
            ${p.sizes.map((s) => `<button class="chip" data-size="${s}" aria-pressed="${sel.size === s}">${s}</button>`).join("")}
          </div>
        </div>

        <div class="opt">
          <p class="opt__label">수량</p>
          <div class="qty">
            <button type="button" id="qtyMinus" aria-label="수량 줄이기">−</button>
            <span id="qtyVal" aria-live="polite">1</span>
            <button type="button" id="qtyPlus" aria-label="수량 늘리기">+</button>
          </div>
        </div>

        <div class="detail__total">
          <span>총 상품 금액</span>
          <strong id="lineTotal"></strong>
        </div>
        <button class="btn btn--block" id="addBtn" disabled>장바구니 담기</button>
        <p class="hint" id="addHint"></p>
      </div>
    </article>
  `;

  const addBtn = document.getElementById("addBtn");
  const hint = document.getElementById("addHint");

  function sync() {
    document.getElementById("colorVal").textContent = sel.color ? `· ${sel.color}` : "";
    document.getElementById("sizeVal").textContent = sel.size ? `· ${sel.size}` : "";
    document.getElementById("qtyVal").textContent = sel.qty;
    document.getElementById("qtyMinus").disabled = sel.qty <= 1;
    document.getElementById("qtyPlus").disabled = sel.qty >= MAX_QTY;
    document.getElementById("lineTotal").textContent = won(salePrice(p) * sel.qty);
    const ready = sel.color && sel.size;
    addBtn.disabled = !ready;
    hint.textContent = ready ? "" : !sel.color && !sel.size ? "색상과 사이즈를 선택해 주세요." : !sel.color ? "색상을 선택해 주세요." : "사이즈를 선택해 주세요.";
  }

  $app.querySelectorAll("[data-color]").forEach((btn) =>
    btn.addEventListener("click", () => {
      sel.color = btn.dataset.color;
      $app.querySelectorAll("[data-color]").forEach((b) => b.setAttribute("aria-pressed", b === btn));
      sync();
    })
  );
  $app.querySelectorAll("[data-size]").forEach((btn) =>
    btn.addEventListener("click", () => {
      sel.size = btn.dataset.size;
      $app.querySelectorAll("[data-size]").forEach((b) => b.setAttribute("aria-pressed", b === btn));
      sync();
    })
  );
  document.getElementById("qtyMinus").addEventListener("click", () => { sel.qty = Math.max(1, sel.qty - 1); sync(); });
  document.getElementById("qtyPlus").addEventListener("click", () => { sel.qty = Math.min(MAX_QTY, sel.qty + 1); sync(); });

  addBtn.addEventListener("click", () => {
    const capped = addToCart(p.id, sel.size, sel.color, sel.qty);
    const msg = capped ? `한 옵션당 최대 ${MAX_QTY}개까지 담을 수 있어요.` : "장바구니에 담았습니다.";
    showToast(`<span>${msg}</span><a href="/#/cart">장바구니 보기</a>`);
  });

  sync();
}

// ===== Cart =====
function renderCart() {
  const cart = loadCart();
  if (cart.length === 0) {
    $app.innerHTML = `<h1 class="page-title">장바구니</h1>` + emptyHTML("🛒", "장바구니가 비었습니다", "마음에 드는 상품을 담아보세요.");
    return;
  }

  const { subtotal, shipping, total } = cartTotals(cart);
  const remain = FREE_SHIPPING_MIN - subtotal;

  $app.innerHTML = `
    <h1 class="page-title">장바구니</h1>
    <div class="cart-layout">
      <section aria-label="담은 상품">
        <div class="cart-head">
          <span>상품 ${cart.length}종</span>
          <button class="link-btn" id="clearAll">전체 삭제</button>
        </div>
        <ul role="list">
          ${cart
            .map((i) => {
              const p = findProduct(i.id);
              return `<li class="cart-item">
                <a href="/products/${p.id}">${thumbHTML(p)}</a>
                <div>
                  <div class="cart-item__top">
                    <div>
                      <a class="cart-item__name" href="/products/${p.id}">${esc(p.name)}</a>
                      <p class="cart-item__opt">${esc(i.color)} / ${esc(i.size)}</p>
                    </div>
                    <button class="remove" data-remove="${esc(i.key)}" aria-label="${esc(p.name)} 삭제">×</button>
                  </div>
                  <div class="cart-item__bottom">
                    <div class="qty">
                      <button type="button" data-dec="${esc(i.key)}" aria-label="수량 줄이기" ${i.qty <= 1 ? "disabled" : ""}>−</button>
                      <span>${i.qty}</span>
                      <button type="button" data-inc="${esc(i.key)}" aria-label="수량 늘리기" ${i.qty >= MAX_QTY ? "disabled" : ""}>+</button>
                    </div>
                    <span class="cart-item__price">${won(salePrice(p) * i.qty)}</span>
                  </div>
                </div>
              </li>`;
            })
            .join("")}
        </ul>
      </section>

      <aside class="summary" aria-label="결제 금액">
        <div class="summary__row"><span>상품 금액</span><span>${won(subtotal)}</span></div>
        <div class="summary__row"><span>배송비</span><span>${shipping ? won(shipping) : "무료"}</span></div>
        <div class="summary__row summary__row--total"><span>결제 예정 금액</span><span>${won(total)}</span></div>
        <p class="summary__note">${remain > 0 ? `${won(remain)} 더 담으면 무료배송!` : "무료배송 적용되었습니다."}</p>
        <a class="btn btn--block" href="/#/checkout">주문하기</a>
      </aside>
    </div>
  `;

  const qtyOf = (key) => loadCart().find((i) => i.key === key)?.qty ?? 1;
  $app.querySelectorAll("[data-dec]").forEach((b) =>
    b.addEventListener("click", () => { updateQty(b.dataset.dec, qtyOf(b.dataset.dec) - 1); renderCart(); })
  );
  $app.querySelectorAll("[data-inc]").forEach((b) =>
    b.addEventListener("click", () => { updateQty(b.dataset.inc, qtyOf(b.dataset.inc) + 1); renderCart(); })
  );
  $app.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => { removeItem(b.dataset.remove); renderCart(); })
  );
  document.getElementById("clearAll").addEventListener("click", () => { clearCart(); renderCart(); });
}

// ===== Checkout =====
function renderCheckout() {
  const cart = loadCart();
  if (cart.length === 0) {
    location.replace("#/cart");
    return;
  }
  const { subtotal, shipping, total } = cartTotals(cart);

  $app.innerHTML = `
    <a class="back" href="/#/cart">← 장바구니로</a>
    <h1 class="page-title">주문/결제</h1>
    <div class="cart-layout">
      <form class="form" id="orderForm" novalidate>
        <div class="field">
          <label for="name">받는 사람 <span class="req">*</span></label>
          <input type="text" id="name" name="name" autocomplete="name" aria-describedby="nameErr" />
          <p class="error" id="nameErr"></p>
        </div>
        <div class="field">
          <label for="phone">연락처 <span class="req">*</span></label>
          <input type="tel" id="phone" name="phone" autocomplete="tel" placeholder="010-1234-5678" aria-describedby="phoneErr" />
          <p class="error" id="phoneErr"></p>
        </div>
        <div class="field">
          <label for="address">주소 <span class="req">*</span></label>
          <input type="text" id="address" name="address" autocomplete="street-address" aria-describedby="addressErr" />
          <p class="error" id="addressErr"></p>
        </div>
        <div class="field">
          <label for="memo">배송 메모</label>
          <textarea id="memo" name="memo" maxlength="100" placeholder="예) 문 앞에 놓아주세요"></textarea>
        </div>
        <div class="field">
          <p class="field__label">결제수단 <span class="req">*</span></p>
          <div class="pay-widget" id="payment-method"><p class="hint">결제수단을 불러오는 중…</p></div>
          <div class="pay-widget" id="agreement"></div>
          <p class="error" id="payErr" role="alert"></p>
        </div>
        <button class="btn btn--block" type="submit" id="payBtn" disabled>${won(total)} 결제하기</button>
        <p class="hint">토스페이먼츠 테스트 모드입니다. 실제로 돈이 나가지 않습니다.</p>
      </form>

      <aside class="summary" aria-label="주문 요약">
        ${cart
          .map((i) => {
            const p = findProduct(i.id);
            return `<div class="summary__item"><span>${esc(p.name)} (${esc(i.color)}/${esc(i.size)}) × ${i.qty}</span><span>${won(salePrice(p) * i.qty)}</span></div>`;
          })
          .join("")}
        <div class="summary__row summary__row--total" style="font-size:14px;font-weight:400"><span>상품 금액</span><span style="color:inherit">${won(subtotal)}</span></div>
        <div class="summary__row"><span>배송비</span><span>${shipping ? won(shipping) : "무료"}</span></div>
        <div class="summary__row summary__row--total"><span>최종 결제 금액</span><span>${won(total)}</span></div>
      </aside>
    </div>
  `;

  const form = document.getElementById("orderForm");
  const payBtn = document.getElementById("payBtn");
  const payErr = document.getElementById("payErr");
  let widgets = null;

  // ----- 토스페이먼츠 주문서형 결제 UI -----
  (async () => {
    try {
      if (typeof TossPayments !== "function") throw new Error("SDK_NOT_LOADED");
      const config = await fetch("/api/config").then((r) => {
        if (!r.ok) throw new Error("NO_SERVER");
        return r.json();
      });
      const w = TossPayments(config.clientKey).widgets({ customerKey: TossPayments.ANONYMOUS });
      await w.setAmount({ currency: "KRW", value: total });
      if (!form.isConnected) return; // 로딩 중 다른 화면으로 이동함
      document.getElementById("payment-method").innerHTML = "";
      await Promise.all([
        w.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
        w.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
      ]);
      widgets = w;
      payBtn.disabled = false;
    } catch (err) {
      console.error("[결제 UI]", err);
      if (!form.isConnected) return;
      document.getElementById("payment-method").innerHTML = "";
      payErr.textContent =
        err.message === "SDK_NOT_LOADED" || err.message === "NO_SERVER" || err instanceof TypeError
          ? "결제 모듈을 불러오지 못했습니다. 터미널에서 `npm start`로 서버를 켜고 http://localhost:3000 으로 접속해 주세요."
          : `결제 모듈 오류: ${err.message}`;
    }
  })();

  function setError(field, msg) {
    const err = document.getElementById(field + "Err");
    err.textContent = msg;
    const input = document.getElementById(field);
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
    return !msg;
  }

  function validate() {
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const address = form.elements.address.value.trim();
    const digits = phone.replace(/-/g, "");

    const results = [
      setError("name", name ? "" : "받는 사람 이름을 입력해 주세요."),
      setError(
        "phone",
        !phone ? "연락처를 입력해 주세요." : !/^[0-9-]+$/.test(phone) || !/^\d{10,11}$/.test(digits) ? "연락처는 숫자 10~11자리로 입력해 주세요." : ""
      ),
      setError("address", address ? "" : "주소를 입력해 주세요."),
    ];
    return results.every(Boolean);
  }

  // 입력하면 해당 필드 에러 지우기
  ["name", "phone", "address"].forEach((f) =>
    form.elements[f].addEventListener("input", () => {
      if (document.getElementById(f + "Err").textContent) setError(f, "");
    })
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    if (!widgets) return;

    payBtn.disabled = true;
    payErr.textContent = "";
    try {
      // 1) 서버에 주문 생성 — 결제 금액은 서버가 계산
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map(({ id, size, color, qty }) => ({ id, size, color, qty })) }),
      });
      const order = await res.json();
      if (!res.ok) throw order;
      if (order.amount !== total) await widgets.setAmount({ currency: "KRW", value: order.amount });

      // 2) 완료 화면에서 쓸 정보 저장 (승인 성공 시 success.html이 사용)
      const name = form.elements.name.value.trim();
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ orderId: order.orderId, name }));
      } catch {
        /* 무시 */
      }

      // 3) 결제 요청 → 인증 후 success.html / fail.html 로 이동
      await widgets.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: location.origin + "/success.html",
        failUrl: location.origin + "/fail.html",
        customerName: name,
        customerMobilePhone: form.elements.phone.value.replace(/-/g, "").trim(),
      });
    } catch (err) {
      // 구매자가 결제창을 닫은 경우 등 (Redirect 방식에서는 실패 시에만 여기로 옴)
      console.error("[결제 요청]", err);
      payErr.textContent = err?.code === "USER_CANCEL" ? "결제를 취소했습니다." : err?.message || "결제 요청에 실패했습니다.";
      payBtn.disabled = false;
    }
  });
}

// ===== Complete =====
function renderComplete(orderNo) {
  let order = null;
  try {
    order = JSON.parse(sessionStorage.getItem(ORDER_KEY) || "null");
  } catch {
    /* 무시 */
  }
  const matched = order && order.orderNo === orderNo;

  $app.innerHTML = `
    <section class="complete">
      <div class="complete__check" aria-hidden="true">✓</div>
      <h1 class="page-title">주문이 완료되었습니다</h1>
      <p class="empty__text">${matched ? `${esc(order.name)}님, 주문해 주셔서 감사합니다.` : "주문해 주셔서 감사합니다."}</p>
      <div class="complete__box">
        <div class="summary__row"><span>주문번호</span><strong>${esc(orderNo)}</strong></div>
        ${matched ? `<div class="summary__row"><span>결제 금액</span><strong>${won(order.total)}</strong></div>` : ""}
        ${matched && order.method ? `<div class="summary__row"><span>결제수단</span><strong>${esc(order.method)}</strong></div>` : ""}
        ${matched && order.receiptUrl ? `<div class="summary__row"><span>영수증</span><a href="${esc(order.receiptUrl)}" target="_blank" rel="noopener">보기</a></div>` : ""}
      </div>
      <a class="btn btn--block" href="/#/">쇼핑 계속하기</a>
    </section>
  `;
}

// ===== Router =====
// 상품 상세는 검색엔진이 색인할 수 있도록 실제 경로(/products/:id)를 쓰고,
// 장바구니·주문 같은 비공개 화면은 기존처럼 해시 라우팅을 쓴다.
function router() {
  const productPath = location.pathname.match(/^\/products\/(\d+)\/?$/);
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);

  // 예전 해시 주소(#/product/3)는 정식 주소로 옮긴다.
  if (!productPath && parts[0] === "product" && parts.length === 2) {
    location.replace(`/products/${encodeURIComponent(parts[1])}`);
    return;
  }

  const homeInfo = document.getElementById("homeInfo");
  if (homeInfo) homeInfo.hidden = Boolean(productPath) || parts.length > 0;

  const isRoot = location.pathname === "/" || location.pathname.endsWith("/index.html");
  if (productPath) renderDetail(productPath[1]);
  else if (!isRoot) $app.innerHTML = emptyHTML("🧭", "페이지를 찾을 수 없습니다", "주소가 잘못되었거나 없는 페이지예요.");
  else if (parts.length === 0) renderHome();
  else if (parts[0] === "cart" && parts.length === 1) renderCart();
  else if (parts[0] === "checkout" && parts.length === 1) renderCheckout();
  else if (parts[0] === "complete" && parts.length === 2) renderComplete(decodeURIComponent(parts[1]));
  else $app.innerHTML = emptyHTML("🧭", "페이지를 찾을 수 없습니다", "주소가 잘못되었거나 없는 페이지예요.");

  $toast.hidden = true;
  window.scrollTo(0, 0);
  $app.focus({ preventScroll: true });
}

// 다른 탭에서 장바구니가 바뀌면 배지 갱신
window.addEventListener("storage", (e) => {
  if (e.key === CART_KEY) {
    updateBadge();
    if (location.hash === "#/cart") renderCart();
  }
});

window.addEventListener("hashchange", router);
updateBadge();
router();
