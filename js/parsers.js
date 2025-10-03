// --- 공용 헬퍼 함수 ---

// 가격 문자열에서 숫자만 추출
function cleanPrice(priceStr) {
    if (typeof priceStr !== 'string') return 0;
    // '₩', ',', '$', '.' 등 모든 비숫자 문자를 제거
    return parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0;
}

// 'YYYY년 MM월 DD일' 형식의 날짜 문자열을 Date 객체로 변환
function parseKoreanDate(dateStr) {
    const parts = dateStr.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일/);
    if (!parts) return null;
    return new Date(parts[1], parts[2] - 1, parts[3]);
}

// 상품명 또는 퍼블리셔에서 앱 이름을 식별
function getAppName(title, publisher = '') {
    const searchString = `${title} ${publisher}`;
    for (const appName in appKeywords) {
        for (const keyword of appKeywords[appName]) {
            if (searchString.includes(keyword)) {
                return appName;
            }
        }
    }
    return '기타';
}

// --- 플랫폼별 파서 ---

/**
 * Google 결제 내역(JSON)을 파싱하여 표준화된 데이터 객체를 반환합니다.
 * Order History.json 파일의 내용
 * 게임/앱별로 그룹화된 결제 데이터 객체
 */
function parseGoogleData(orders) {
    const dataByGame = {};
    orders.forEach(item => {
        const order = item.orderHistory;
        if (!order || !order.lineItem || order.lineItem.length === 0) return;

        const title = order.lineItem[0].doc.title || "";
        const price = cleanPrice(order.totalPrice);
        const refund = cleanPrice(order.refundAmount);
        const netPrice = price - refund;
        
        if (netPrice > 0) {
            const date = new Date(order.creationTime);
            const appName = getAppName(title);

            if (!dataByGame[appName]) {
                dataByGame[appName] = [];
            }
            dataByGame[appName].push({ date, title, price: netPrice });
        }
    });
    return dataByGame;
}

/**
 * Apple 결제 내역(HTML)을 파싱하여 표준화된 데이터 객체를 반환합니다.
 *  doc - '문제 신고.html' 파일을 파싱한 HTML Document
 *  게임/앱별로 그룹화된 결제 데이터 객체
 */
function parseAppleData(doc) {
    const dataByGame = {};
    const purchaseElements = doc.querySelectorAll('.purchase');

    purchaseElements.forEach(purchase => {
        const dateEl = purchase.querySelector('.invoice-date');
        if (!dateEl) return;

        const date = parseKoreanDate(dateEl.textContent.trim());
        if (!date) return;

        const itemElements = purchase.querySelectorAll('li.pli');
        itemElements.forEach(item => {
            const titleEl = item.querySelector('.pli-title div');
            const priceEl = item.querySelector('.pli-price');
            const publisherEl = item.querySelector('.pli-publisher');

            if (titleEl && priceEl) {
                const title = titleEl.getAttribute('aria-label')?.trim() || titleEl.textContent.trim();
                let priceText = priceEl.textContent.trim();
                
                if (priceText === '무료') return;

                const price = cleanPrice(priceText);
                const publisher = publisherEl ? publisherEl.textContent.trim() : "";
                
                const appName = getAppName(title, publisher);
                
                if (appName && price > 0) {
                    if (!dataByGame[appName]) {
                        dataByGame[appName] = [];
                    }
                    dataByGame[appName].push({ date, title, price });
                }
            }
        });
    });
    return dataByGame;
}
