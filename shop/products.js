// 상품 데이터 — 브라우저(script.js)와 서버(server.js)가 함께 사용.
// 서버는 이 데이터로 결제 금액을 다시 계산해 클라이언트 금액 조작을 막는다.
(function (root) {
  const CLOTH_SIZES = ["S", "M", "L", "XL"];

  const PRODUCTS = [
    { id: 1, name: "오버핏 코튼 셔츠", category: "top", price: 49000, salePrice: 39000, colors: ["화이트", "블랙", "스카이"], sizes: CLOTH_SIZES, image: "https://images.unsplash.com/photo-1603252109303-2751441dd157?w=800&q=80&auto=format&fit=crop", emoji: "👔", bg: ["#eef2f7", "#d9e2ee"], createdAt: "2026-11-10", description: "도톰한 코튼 원단으로 만든 오버핏 셔츠. 단독으로도, 레이어드로도 좋습니다." },
    { id: 2, name: "베이직 크루넥 티셔츠", category: "top", price: 19000, salePrice: null, colors: ["화이트", "그레이", "블랙"], sizes: CLOTH_SIZES, image: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&q=80&auto=format&fit=crop", emoji: "👕", bg: ["#f4f4f4", "#e2e2e2"], createdAt: "2026-10-02", description: "매일 입기 좋은 기본 반팔 티셔츠. 목 늘어남이 적은 립 넥 처리." },
    { id: 3, name: "울 블렌드 니트", category: "top", price: 69000, salePrice: 55000, colors: ["오트밀", "차콜"], sizes: CLOTH_SIZES, image: "https://images.unsplash.com/photo-1773747310819-ae0ca63f5385?w=800&q=80&auto=format&fit=crop", emoji: "🧶", bg: ["#f3ece2", "#e3d6c4"], createdAt: "2026-11-05", description: "울 30% 혼방으로 따뜻하고 가벼운 라운드 니트." },
    { id: 4, name: "와이드 데님 팬츠", category: "bottom", price: 59000, salePrice: null, colors: ["라이트블루", "인디고"], sizes: CLOTH_SIZES, image: "https://images.unsplash.com/photo-1714143136372-ddaf8b606da7?w=800&q=80&auto=format&fit=crop", emoji: "👖", bg: ["#e5ecf5", "#c7d5e8"], createdAt: "2026-10-20", description: "허리부터 밑단까지 일자로 떨어지는 와이드 핏 데님." },
    { id: 5, name: "코튼 치노 팬츠", category: "bottom", price: 45000, salePrice: 36000, colors: ["베이지", "카키", "블랙"], sizes: CLOTH_SIZES, image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80&auto=format&fit=crop", emoji: "🩳", bg: ["#f1ebdd", "#ddd1b6"], createdAt: "2026-09-15", description: "적당한 신축성으로 편한 테이퍼드 핏 치노." },
    { id: 6, name: "플리츠 롱 스커트", category: "bottom", price: 52000, salePrice: null, colors: ["블랙", "네이비"], sizes: CLOTH_SIZES, image: "https://images.unsplash.com/photo-1789110853398-539d78dd63bc?w=800&q=80&auto=format&fit=crop", emoji: "👗", bg: ["#ecebf3", "#d3d1e3"], createdAt: "2026-11-12", description: "움직일 때마다 자연스럽게 흐르는 플리츠 롱 스커트." },
    { id: 7, name: "싱글 울 코트", category: "outer", price: 189000, salePrice: 149000, colors: ["카멜", "차콜"], sizes: CLOTH_SIZES, image: "https://images.unsplash.com/photo-1539533113208-f6df8cc8b543?w=800&q=80&auto=format&fit=crop", emoji: "🧥", bg: ["#f2e6d8", "#dcc3a6"], createdAt: "2026-11-08", description: "깔끔한 싱글 버튼 디자인의 울 코트. 무릎 아래 기장." },
    { id: 8, name: "경량 패딩 점퍼", category: "outer", price: 89000, salePrice: null, colors: ["블랙", "아이보리", "올리브"], sizes: CLOTH_SIZES, image: "https://images.unsplash.com/photo-1706765779494-2705542ebe74?w=800&q=80&auto=format&fit=crop", emoji: "🧥", bg: ["#e8eee6", "#ccd9c7"], createdAt: "2026-10-28", description: "가볍고 따뜻한 경량 패딩. 파우치에 접어 휴대 가능." },
    { id: 9, name: "데님 트러커 재킷", category: "outer", price: 79000, salePrice: 63000, colors: ["미드블루", "블랙"], sizes: CLOTH_SIZES, image: "https://images.unsplash.com/photo-1543076447-215ad9ba6923?w=800&q=80&auto=format&fit=crop", emoji: "🧥", bg: ["#e2e9f2", "#bccbe0"], createdAt: "2026-09-30", description: "사계절 활용도 높은 클래식 트러커 재킷." },
    { id: 10, name: "캔버스 토트백", category: "acc", price: 29000, salePrice: null, colors: ["내추럴", "블랙"], sizes: ["FREE"], image: "https://images.unsplash.com/photo-1574365569389-a10d488ca3fb?w=800&q=80&auto=format&fit=crop", emoji: "👜", bg: ["#f5f0e6", "#e4dac4"], createdAt: "2026-10-10", description: "노트북도 들어가는 넉넉한 사이즈의 캔버스 토트백." },
    { id: 11, name: "울 비니", category: "acc", price: 19000, salePrice: 15000, colors: ["그레이", "블랙", "오렌지"], sizes: ["FREE"], image: "https://images.unsplash.com/photo-1618354691792-d1d42acfd860?w=800&q=80&auto=format&fit=crop", emoji: "🧢", bg: ["#f6e9e4", "#e8cbbf"], createdAt: "2026-11-03", description: "부드러운 울 혼방 비니. 접어서 길이 조절 가능." },
    { id: 12, name: "레더 벨트", category: "acc", price: 35000, salePrice: null, colors: ["브라운", "블랙"], sizes: ["FREE"], image: "https://images.unsplash.com/photo-1711443982852-b3df5c563448?w=800&q=80&auto=format&fit=crop", emoji: "🪢", bg: ["#efe6df", "#d5c0ae"], createdAt: "2026-08-25", description: "소가죽 100% 클래식 벨트. 길이 조절 가능." },
  ];

  const FREE_SHIPPING_MIN = 50000;
  const SHIPPING_FEE = 3000;
  const MAX_QTY = 10;

  const SHOP = { PRODUCTS, FREE_SHIPPING_MIN, SHIPPING_FEE, MAX_QTY };
  if (typeof module === "object" && module.exports) module.exports = SHOP;
  else root.LOOM_SHOP = SHOP;
})(typeof self !== "undefined" ? self : this);
