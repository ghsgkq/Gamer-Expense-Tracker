// --- 공용 헬퍼 함수 ---

// 'YYYY년 MM월 DD일' 형식의 날짜 문자열을 Date 객체로 변환합니다.
function parseKoreanDate(dateStr) {
    const parts = dateStr.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일/);
    if (!parts) return null;
    // 시간 정보가 없으므로 현지 시간대 자정을 기준으로 Date 객체를 생성합니다.
    return new Date(parts[1], parts[2] - 1, parts[3]);
}

// 가격 문자열에서 숫자만 추출합니다.
function cleanPrice(priceStr) {
    if (typeof priceStr !== 'string') return 0;
    return parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0;
}

// 상품명과 퍼블리셔 정보를 바탕으로 표준화된 앱/게임 이름을 반환합니다.
function getAppName(title, publisher) {
    const combinedInfo = `${title} ${publisher}`;

    for (const appName in appKeywords) {
        for (const keyword of appKeywords[appName]) {
            if (combinedInfo.includes(keyword)) {
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
    const processedData = {};
    orders.forEach(item => {
        const order = item.orderHistory;
        if (!order || !order.lineItem || order.lineItem.length === 0) return;

        const priceText = order.totalPrice;
        if (priceText === '₩0') return;

        const price = cleanPrice(priceText);
        const refund = cleanPrice(order.refundAmount);
        const netPrice = price - refund;

        if (netPrice <= 0) return;
        
        const title = order.lineItem[0].doc.title || "";
        
        // 시간대 문제를 해결하기 위한 수정:
        // UTC 기준 시간(ISO String)으로 Date 객체를 먼저 생성합니다.
        const utcDate = new Date(order.creationTime);
        // 생성된 객체에서 현지 시간대 기준의 년/월/일을 추출하여, 
        // 시간 정보가 없는 새로운 Date 객체를 생성합니다.
        // 이렇게 하면 모든 날짜 계산이 현지 시간대 기준으로 통일됩니다.
        const date = new Date(utcDate.getFullYear(), utcDate.getMonth(), utcDate.getDate());

        const appName = getAppName(title, title);
        
        if (!processedData[appName]) {
            processedData[appName] = [];
        }
        processedData[appName].push({ date, title, price: netPrice });
    });
    return processedData;
}

/**
 * Apple 결제 내역(HTML)을 파싱하여 표준화된 데이터 객체를 반환합니다.
 *  doc - '문제 신고.html' 파일을 파싱한 HTML Document
 *  게임/앱별로 그룹화된 결제 데이터 객체
 */
function parseAppleData(doc) {
    const processedData = {};
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
                const title = titleEl.getAttribute('aria-label').trim();
                let priceText = priceEl.textContent.trim();
                
                if (priceText === '무료' || !priceText) return;

                const price = cleanPrice(priceText);
                const publisher = publisherEl ? publisherEl.textContent.trim() : "";
                
                const appName = getAppName(title, publisher);
                
                if (appName && price > 0) {
                    if (!processedData[appName]) {
                        processedData[appName] = [];
                    }
                    processedData[appName].push({ date, title, price });
                }
            }
        });
    });
    return processedData;
}
