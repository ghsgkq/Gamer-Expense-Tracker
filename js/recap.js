// --- 연말결산 화면 상태 ---
// 업로드된 원본 파일은 js/common.js 의 rawFileData 가 보관합니다.
const recapState = {
    combinedData: {},   // { 게임명: [결제내역] }
    slides: [],         // 생성된 슬라이드 목록
    slideIndex: 0,      // 현재 슬라이드 위치
};

// 사복 패스 파일명 매핑
const knownSashikFiles = {
    '에르핀 사복 패스': '에르핀 사복 패스.png',
    '키디언 사복 패스': '키디언 사복패스.png',
    '슈로 사복 패스': '슈로 사복 패스.png',
    '아이시아 사복 패스': '아이시아 사복패스.png',
    '폴랑 사복 패스': '폴랑 사복 패스.png',
    '마요(멋짐) 사복 패스': '마요(멋짐) 사복 패스.png',
    '모모 사복 패스': '모모 사복 패스.gif',
    '로네(시장) 사복 패스': '로네(시장) 사복 패스.gif',
    '엘레나 사복 패스': '엘레나 사복 패스.gif',
    '림(혼돈) 사복 패스': '림(혼돈) 사복 패스.gif',
    '다야 사복 패스': '다야 사복 패스.gif',
    '시온 사복 패스': '시온 사복 패스.gif'
};

document.addEventListener('DOMContentLoaded', () => {
    setupFileInputListeners(processData); // js/common.js
    setupUpdateHistoryModal();
    
    const startBtn = document.getElementById('start-recap-btn');
    const closeBtn = document.getElementById('close-recap-btn');
    const overlay = document.getElementById('recap-overlay');

    if (startBtn) startBtn.addEventListener('click', startRecapSequence);
    if (closeBtn) closeBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
        document.getElementById('recap-content-area').innerHTML = '';
        recapState.slideIndex = 0;
    });
});

// --- 1. 업로드 데이터 처리 로직 ---

function processData() {
    // 업로드된 원본 파일을 모두 다시 파싱·병합합니다. (js/common.js)
    recapState.combinedData = buildCombinedData();

    // 결산 가능한 연도를 실제 업로드 데이터에서 채웁니다.
    const years = populateRecapYearOptions();
    const btn = document.getElementById('start-recap-btn');
    if (btn) {
        btn.disabled = years.length === 0;
        if (years.length > 0) {
            btn.classList.add('ready');
            btn.textContent = "🎬 연말결산 시작하기 (준비됨!)";
            showRecapStatus('', false);
        } else {
            btn.classList.remove('ready');
            btn.textContent = "🎬 연말결산 시작하기";
            if (Object.keys(recapState.combinedData).length > 0) {
                showRecapStatus("업로드한 파일에서 '트릭컬' 결제 내역을 찾지 못했습니다.", true);
            }
        }
    }
}

// 연말결산 대상 데이터. '트릭컬 리바이브'를 우선하고, 없으면 글로벌 서버를 사용합니다.
function getTrickcalData() {
    return recapState.combinedData['트릭컬 리바이브'] || recapState.combinedData['트릭컬 글로벌 서버'] || [];
}

/**
 * 업로드된 트릭컬 결제 내역에 존재하는 연도만 선택 목록에 채우고, 그 목록을 반환합니다.
 */
function populateRecapYearOptions() {
    const years = [...new Set(getTrickcalData().map(item => item.date.getFullYear()))].sort((a, b) => b - a);
    const select = document.getElementById('year-select');
    if (!select) return years;

    const prevValue = select.value;
    select.innerHTML = '';

    if (years.length === 0) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '파일 업로드 후 선택';
        select.appendChild(placeholder);
        return years;
    }

    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year}년`;
        select.appendChild(option);
    });
    select.value = years.includes(parseInt(prevValue)) ? prevValue : String(years[0]);

    return years;
}

// 연말결산 화면의 안내/오류 메시지를 인라인으로 표시합니다.
function showRecapStatus(message, isError) {
    const element = document.getElementById('recap-status');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', !!isError);
}

// --- 2. 연말결산(Recap) 핵심 로직 ---

// 상품명 정제 함수
function cleanTitle(title) {
    let cleaned = title.split(/\s*\(\s*트릭컬 리바이브/)[0].trim();
    if (cleaned === '사복 패스' || cleaned === '사복패스' || cleaned === '2월 사복 패스') {
        return '에르핀 사복 패스';
    }
    return cleaned;
}

function startRecapSequence() {
    const yearSelect = document.getElementById('year-select');
    const year = parseInt(yearSelect.value);
    
    const trickcalData = getTrickcalData();

    if (trickcalData.length === 0) {
        showRecapStatus("업로드한 파일에서 '트릭컬' 관련 결제 내역을 찾을 수 없습니다. 😭", true);
        return;
    }

    if (!year) {
        showRecapStatus('결산할 연도를 선택해주세요.', true);
        return;
    }

    const yearData = trickcalData
        .filter(item => item.date.getFullYear() === year)
        .sort((a, b) => a.date - b.date);

    if (yearData.length === 0) {
        showRecapStatus(`${year}년에는 트릭컬 결제 내역이 없습니다.`, true);
        return;
    }

    // 통계 계산
    const totalSpent = yearData.reduce((sum, item) => sum + item.price, 0);
    const currencySymbol = yearData[0]?.currency || '₩';
    
    const dailyItems = {
        '데일리 왕사탕 공물': { count: 0, sum: 0, keywords: ['데일리 왕사탕 공물', 'Daily Candy Offering'] },
        '데일리 별사탕 공물': { count: 0, sum: 0, keywords: ['데일리 별사탕 공물', 'Daily Star Candy Offering'] },
        '데일리 엘리프 공물': { count: 0, sum: 0, keywords: ['데일리 엘리프 공물', 'Daily Crystal Leaf Offering'] }
    };
    
    const basicPassMonthly = {};
    for (let i = 1; i <= 12; i++) basicPassMonthly[i] = { count: 0, sum: 0 };

    const sashikCollection = [];
    const sashikPassMonthly = {};
    for (let i = 1; i <= 12; i++) sashikPassMonthly[i] = [];

    const monthlyDetails = {}; 
    const monthlySpent = {};

    yearData.forEach(item => {
        const month = item.date.getMonth() + 1;
        const cleanedName = cleanTitle(item.title);

        let isDaily = false;
        for (const key in dailyItems) {
            if (dailyItems[key].keywords.some(k => cleanedName.includes(k) || cleanedName.includes(k.replace('데일리 ', '')))) {
                dailyItems[key].count++;
                dailyItems[key].sum += item.price;
                isDaily = true;
                break;
            }
        }

        if (!isDaily) {
            if (cleanedName.includes('트릭컬 패스') || cleanedName.includes('리바이브 패스') || cleanedName.includes('개쩜 패스') || cleanedName.includes('Trickcal Pass') || cleanedName.includes('Trickcal Revive Pass')) {
                basicPassMonthly[month].count++;
                basicPassMonthly[month].sum += item.price;
            } else if (cleanedName.includes('사복 패스') || cleanedName.includes('사복패스') || cleanedName.includes('Civvies Pass')) {
                const sashikItem = { ...item, title: cleanedName };
                sashikCollection.push(sashikItem);
                sashikPassMonthly[month].push(sashikItem);
            }
        }

        monthlySpent[month] = (monthlySpent[month] || 0) + item.price;
        if (!monthlyDetails[month]) monthlyDetails[month] = [];
        
        let displayTitle = cleanedName;
        if (displayTitle.length > 18) displayTitle = displayTitle.substring(0, 18) + '..';

        monthlyDetails[month].push({
            name: displayTitle,
            price: item.price
        });
    });

    let maxMonth = 0, maxMonthAmount = 0;
    for (const [m, amt] of Object.entries(monthlySpent)) {
        if (amt > maxMonthAmount) {
            maxMonthAmount = amt;
            maxMonth = m;
        }
    }
    const maxMonthItems = monthlyDetails[maxMonth] || [];


    // --- 슬라이드 데이터 구성 ---
    recapState.slides = [];

    // 1. 인트로
    const gameDisplayName = recapState.combinedData['트릭컬 글로벌 서버'] && !recapState.combinedData['트릭컬 리바이브'] ? '트릭컬 글로벌 서버' : '트릭컬 리바이브';
    recapState.slides.push({
        type: 'intro',
        content: `
            <div class="slide-content fade-in-up">
                <h2>${year}년 ${gameDisplayName}</h2>
                <h1 class="highlight-text">교주님의 헌신</h1>
                <p>대표님이 교주님의 지갑을 기억합니다.</p>
            </div>
        `
    });

    // 2. 총액
    recapState.slides.push({
        type: 'total',
        amount: totalSpent,
        content: `
            <div class="slide-content fade-in-up">
                <h2>이번년도 에피드에 바친 금액</h2>
                <div class="big-number odometer" id="total-amount">0</div>
                <p>${currencySymbol}</p>
            </div>
        `
    });

    // 3. 데일리 영수증
    if (Object.values(dailyItems).some(item => item.count > 0)) {
        recapState.slides.push({
            type: 'receipt',
            title: '📜 데일리 공물 영수증',
            data: dailyItems
        });
    }

    // 4. 일반 패스
    const hasBasicPass = Object.values(basicPassMonthly).some(m => m.count > 0);
    if (hasBasicPass) {
        recapState.slides.push({
            type: 'monthly_pass_receipt',
            title: '🎫 월간 패스 기록',
            data: basicPassMonthly,
            year: year
        });
    }

    // 5. 사복 패스 갤러리
    if (sashikCollection.length > 0) {
        recapState.slides.push({
            type: 'sashik_gallery',
            title: '👗 사복 컬렉션',
            items: sashikCollection
        });
    }

    // 6. 사복 패스 영수증
    if (sashikCollection.length > 0) {
        recapState.slides.push({
            type: 'monthly_sashik_receipt',
            title: '🧾 사복 패스 영수증',
            data: sashikPassMonthly
        });
    }

    // 7. 월별 상세 타임라인 (저장 버튼 기능 포함)
    recapState.slides.push({
        type: 'monthly_timeline',
        title: '🗓️ 월별 공물 납부 내역',
        data: monthlyDetails,
        year: year // 저장 시 파일명에 사용
    });

    // 8. 최고 지출 월
    recapState.slides.push({
        type: 'max_month_receipt',
        month: maxMonth,
        amount: maxMonthAmount,
        items: maxMonthItems,
        title: `🔥 가장 지갑이 얇아졌던 달: ${maxMonth}월`
    });

    // 9. 아웃트로
    recapState.slides.push({
        type: 'outro',
        year: year,
        content: `
            <div class="slide-content fade-in-up">
                <h2>감사합니다, 교주님!</h2>
                <p>내년에도 볼따구와 함께하시길...</p>
                <div class="button-group" style="margin-top: 20px; display:flex; flex-direction:column; gap:10px; align-items:center;">
                    <button class="save-img-btn" onclick="downloadLongReceipt()">📸 전체 영수증 이미지 저장</button>
                    <button class="restart-btn" onclick="location.reload()">처음으로</button>
                </div>
            </div>
        `
    });

    showRecapStatus('', false);
    document.getElementById('recap-overlay').classList.remove('hidden');
    recapState.slideIndex = 0;
    showSlide(0);
}

// 사복 패스 이미지 HTML
function getSashikImageHTML(title, isCard = false) {
    let cleanName = title.trim();
    if (cleanName === '사복 패스' || cleanName === '사복패스') {
        cleanName = '에르핀 사복 패스';
    }

    let imgSrc = `image/${cleanName}.png`;
    let fallbackSrc = `image/${cleanName}.gif`;

    if (knownSashikFiles[cleanName]) {
        imgSrc = `image/${knownSashikFiles[cleanName]}`;
        fallbackSrc = imgSrc.endsWith('.png') ? imgSrc.replace('.png', '.gif') : imgSrc.replace('.gif', '.png');
    }
    
    const className = isCard ? 'sashik-card-img' : 'sashik-char-img';
    const wrapperClass = isCard ? 'sashik-card-wrapper' : 'sashik-img-wrapper';

    return `
        <div class="${wrapperClass}">
            <img src="${escapeHtml(imgSrc)}" 
                 data-fallback="${escapeHtml(fallbackSrc)}" 
                 onerror="this.onerror=null; this.src=this.dataset.fallback;" 
                 alt="${escapeHtml(cleanName)}" 
                 class="${className}">
        </div>
    `;
}

// 고급 패스 뱃지 HTML
function getPremiumBadgeHTML(year, month) {
    const monthStr = String(month).padStart(2, '0');
    const gifMonths = [1, 9, 10, 11, 12];
    const isGif = gifMonths.includes(month);
    const ext = isGif ? 'gif' : 'mp4';
    const fileName = `${year}${monthStr}pass.${ext}`;
    const filePath = `image/${fileName}`;

    if (isGif) {
        return `<div class="premium-badge"><img src="${filePath}" alt="Premium"><span>✨ 고급 패스</span></div>`;
    } else {
        return `<div class="premium-badge"><video src="${filePath}" autoplay loop muted playsinline></video><span>✨ 고급 패스</span></div>`;
    }
}

function showSlide(index) {
    const container = document.getElementById('recap-content-area');
    const slide = recapState.slides[index];
    
    if (!slide) return;

    let html = '';

    if (slide.type === 'receipt') {
        let rows = '';
        let total = 0;
        for (const [name, info] of Object.entries(slide.data)) {
            if (info.count > 0) {
                rows += `
                    <div class="receipt-row">
                        <span class="name">${name}</span>
                        <span class="count">x${info.count}</span>
                        <span class="price">₩${info.sum.toLocaleString()}</span>
                    </div>`;
                total += info.sum;
            }
        }
        html = generateReceiptHTML(slide.title, rows, total);
    } 
    else if (slide.type === 'monthly_pass_receipt') {
        let rows = '';
        let total = 0;
        for (let m = 1; m <= 12; m++) {
            const info = slide.data[m];
            if (info.count > 0) {
                const isPremium = info.count >= 2 || info.sum > 12000;
                const badge = isPremium 
                    ? getPremiumBadgeHTML(slide.year, m)
                    : `<span class="normal-badge">일반 패스</span>`;

                rows += `
                    <div class="receipt-row pass-row ${isPremium ? 'premium-row' : ''}">
                        <div class="pass-info-left">
                            <span class="month-label">${m}월</span>
                            ${badge}
                        </div>
                        <span class="price">₩${info.sum.toLocaleString()}</span>
                    </div>`;
                total += info.sum;
            }
        }
        html = generateReceiptHTML(slide.title, rows, total);
    }
    else if (slide.type === 'sashik_gallery') {
        let cardsHtml = '';
        slide.items.forEach(item => {
            const month = item.date.getMonth() + 1;
            const imgHtml = getSashikImageHTML(item.title, true);
            cardsHtml += `
                <div class="sashik-card fade-in-up-stagger">
                    ${imgHtml}
                    <div class="sashik-card-info">
                        <span class="sashik-month">${month}월</span>
                        <span class="sashik-name">${escapeHtml(item.title)}</span>
                    </div>
                </div>
            `;
        });
        html = `
            <div class="slide-content">
                <h2 style="margin-bottom:20px;">${slide.title}</h2>
                <div class="sashik-gallery-grid scrollable-body">
                    ${cardsHtml}
                </div>
            </div>
        `;
    }
    else if (slide.type === 'monthly_sashik_receipt') {
        let rows = '';
        let total = 0;
        for (let m = 1; m <= 12; m++) {
            const items = slide.data[m];
            if (items.length > 0) {
                rows += `<div class="receipt-month-header" style="color:#e17055">- ${m}월 -</div>`;
                items.forEach(item => {
                    const imageHTML = getSashikImageHTML(item.title, false);
                    rows += `
                        <div class="receipt-row sashik-row">
                            <div class="sashik-info">
                                ${imageHTML}
                                <span class="name">${escapeHtml(item.title)}</span>
                            </div>
                            <span class="price">₩${item.price.toLocaleString()}</span>
                        </div>`;
                    total += item.price;
                });
            }
        }
        html = generateReceiptHTML(slide.title, rows, total, true);
    }
    else if (slide.type === 'monthly_timeline') {
        let rows = '';
        let total = 0;
        for (let m = 1; m <= 12; m++) {
            if (slide.data[m] && slide.data[m].length > 0) {
                let monthTotal = 0;
                slide.data[m].forEach(item => monthTotal += item.price);
                rows += `<div class="receipt-month-header">- ${m}월 (₩${monthTotal.toLocaleString()}) -</div>`;
                slide.data[m].forEach(item => {
                    rows += `
                        <div class="receipt-row">
                            <span class="name" style="font-size:0.85em;">${escapeHtml(item.name)}</span>
                            <span class="price">₩${item.price.toLocaleString()}</span>
                        </div>`;
                });
                total += monthTotal;
            }
        }
        html = generateReceiptHTML(slide.title, rows, total, true);
    }
    else if (slide.type === 'max_month_receipt') {
        let rows = '';
        slide.items.forEach(item => {
            rows += `
                <div class="receipt-row">
                    <span class="name" style="font-size:0.9em;">${escapeHtml(item.name)}</span>
                    <span class="price">₩${item.price.toLocaleString()}</span>
                </div>`;
        });
         html = `
            <div class="slide-content fade-in-up">
                <div class="receipt-paper long-receipt" style="border: 2px solid #ff7675;">
                    <h3 style="color:#d63031">${slide.title}</h3>
                    <p style="text-align:center; font-size:0.9em; color:#555; margin-bottom:10px;">지름신 강림의 현장</p>
                    <div class="receipt-line">----------------</div>
                    <div class="receipt-body scrollable-body" style="max-height: 250px;">${rows}</div>
                    <div class="receipt-line">----------------</div>
                    <div class="receipt-total" style="color:#d63031">
                        <span>총 지출</span>
                        <span>₩${slide.amount.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        `;
    }
    else {
        html = slide.content;
    }

    if (slide.type !== 'outro') {
        html += `<button class="next-btn" id="next-slide-btn">다음 ▶</button>`;
    }

    container.innerHTML = html;

    if (slide.type === 'total') {
        animateValue("total-amount", 0, slide.amount, 2000);
    }

    const nextBtn = document.getElementById('next-slide-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            recapState.slideIndex++;
            showSlide(recapState.slideIndex);
        });
    }
}

function generateReceiptHTML(title, rows, total, isScrollable = false) {
    const scrollClass = isScrollable ? 'long-receipt' : '';
    const bodyClass = isScrollable ? 'scrollable-body' : '';
    
    return `
        <div class="slide-content fade-in-up">
            <div class="receipt-paper ${scrollClass}">
                <h3>${title}</h3>
                <div class="receipt-line">----------------</div>
                <div class="receipt-body ${bodyClass}">${rows}</div>
                <div class="receipt-line">----------------</div>
                <div class="receipt-total">
                    <span>합계</span>
                    <span>₩${total.toLocaleString()}</span>
                </div>
                <div class="barcode">||| || ||| | ||||</div>
            </div>
        </div>
    `;
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const value = Math.floor(ease * (end - start) + start);
        obj.innerHTML = "₩" + value.toLocaleString();
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// 영수증 이미지 저장 
window.downloadLongReceipt = function() {
    // 1. 월별 내역 슬라이드 데이터 찾기
    const timelineSlide = recapState.slides.find(s => s.type === 'monthly_timeline');
    if (!timelineSlide) {
        alert("저장할 데이터가 없습니다.");
        return;
    }

    // 2. 전체 내용을 담은 임시 HTML 생성
    let rows = '';
    let total = 0;
    const data = timelineSlide.data;
    
    for (let m = 1; m <= 12; m++) {
        if (data[m] && data[m].length > 0) {
            let monthTotal = 0;
            data[m].forEach(item => monthTotal += item.price);
            rows += `<div class="receipt-month-header">- ${m}월 (₩${monthTotal.toLocaleString()}) -</div>`;
            data[m].forEach(item => {
                rows += `
                    <div class="receipt-row">
                        <span class="name" style="font-size:0.85em;">${escapeHtml(item.name)}</span>
                        <span class="price">₩${item.price.toLocaleString()}</span>
                    </div>`;
            });
            total += monthTotal;
        }
    }

    const receiptHTML = `
        <div id="temp-capture-area" style="position:fixed; top:-9999px; left:0; width: 400px; background-color:#2d3436; padding: 20px; font-family: 'Galmuri11', sans-serif;">
            <div class="receipt-paper" style="box-shadow:none; margin:0 auto; transform:none;">
                <h3 style="text-align:center; font-weight:bold; margin-bottom:10px; border-bottom:2px dashed #333; padding-bottom:10px;">
                    ${timelineSlide.year}년 트릭컬 결산
                </h3>
                <div class="receipt-body" style="overflow:visible; max-height:none;">
                    ${rows}
                </div>
                <div class="receipt-line" style="border-top:1px dashed #aaa; margin:10px 0;"></div>
                <div class="receipt-total" style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.1em;">
                    <span>1년 총계</span>
                    <span>₩${total.toLocaleString()}</span>
                </div>
                <div class="barcode" style="font-family:'Libre Barcode 39'; font-size:2em; text-align:center; margin-top:20px;">||| || ||| | ||||</div>
                
                <div style="text-align:center; margin-top:15px; border-top:1px dotted #ccc; padding-top:10px;">
                    <div style="font-size:0.8em; color:#555; font-weight:bold;">Gamer's Expense Tracker</div>
                </div>
            </div>
        </div>
    `;

    // 3. 임시 요소를 body에 추가
    document.body.insertAdjacentHTML('beforeend', receiptHTML);
    const elementToCapture = document.getElementById('temp-capture-area');

    // 4. html2canvas로 캡처 및 다운로드
    html2canvas(elementToCapture, {
        backgroundColor: "#2d3436",
        scale: 2 // 고해상도
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `trickcal_receipt_${timelineSlide.year}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        
        // 5. 청소
        document.body.removeChild(elementToCapture);
    }).catch(err => {
        console.error(err);
        alert("이미지 저장 중 오류가 발생했습니다.");
        document.body.removeChild(elementToCapture);
    });
};