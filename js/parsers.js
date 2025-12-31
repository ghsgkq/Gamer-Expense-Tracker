// --- 공용 헬퍼 함수 ---
// 'YYYY년 MM월 DD일' 형식의 날짜 문자열을 Date 객체로 변환합니다.
function parseKoreanDate(dateStr) {
    const parts = dateStr.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일/);
    if (!parts) return null;
    return new Date(parts[1], parts[2] - 1, parts[3]);
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

function parsePrice(priceStr){
    if (typeof priceStr !== 'string' || priceStr.trim() === ''){
        return { amount: 0, currency: '₩' }; 
    }

    const currencySymbolMatch = priceStr.match(/[₩$¥€]/);
    const currency = currencySymbolMatch ? currencySymbolMatch[0] : '₩'; 

    const amount = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;

    return { amount, currency };
}

// --- 플랫폼별 파서 ---

/**
 * Google 결제 내역(JSON)을 파싱하여 표준화된 데이터 객체를 반환합니다.
 */
function parseGoogleData(orders) {
    const processedData = {};
    orders.forEach(item => {
        const order = item.orderHistory;
        if (!order || !order.lineItem || order.lineItem.length === 0) return;
        
        const priceInfo = parsePrice(order.totalPrice);
        const refundInfo = parsePrice(order.refundAmount);

        // 환불 금액이 있으면 순 가격에서 차감
        const netPrice = priceInfo.amount - refundInfo.amount;

        if (netPrice <= 0) return;
        
        const title = order.lineItem[0].doc.title || "";
        
        // [수정됨] UTC 시간을 한국 시간(KST, UTC+9) 기준으로 명확하게 변환
        // 브라우저의 로컬 시간대에 상관없이 한국 날짜로 고정합니다.
        const utcDate = new Date(order.creationTime);
        const kstOffset = 9 * 60 * 60 * 1000; // 9시간 (밀리초)
        const kstDate = new Date(utcDate.getTime() + kstOffset);
        
        // KST 기준의 년, 월, 일을 사용하여 Date 객체 생성 (시간은 00:00:00)
        // getUTCFullYear() 등을 사용하여 변환된 타임스탬프의 UTC 값을 가져오면 KST 날짜가 됨
        const date = new Date(kstDate.getUTCFullYear(), kstDate.getUTCMonth(), kstDate.getUTCDate());

        const appName = getAppName(title, title);
        
        if (!processedData[appName]) {
            processedData[appName] = [];
        }
        processedData[appName].push({ date, title, price: netPrice, currency: priceInfo.currency });
    });
    return processedData;
}

/**
 * Apple 결제 내역(HTML)을 파싱하여 표준화된 데이터 객체를 반환합니다.
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

                const priceInfo = parsePrice(priceText);
                const publisher = publisherEl ? publisherEl.textContent.trim() : "";
                
                const appName = getAppName(title, publisher);
                
                if (appName && priceInfo.amount > 0) {
                    if (!processedData[appName]) {
                        processedData[appName] = [];
                    }
                    processedData[appName].push({ date, title, price: priceInfo.amount, currency: priceInfo.currency });
                }
            }
        });
    });
    return processedData;
}