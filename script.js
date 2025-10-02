// 결제 데이터를 저장하기 위한 전역 변수
let processedDataByGame = {};
let currentGameData = [];

// 파일 입력에 대한 이벤트 리스너
document.getElementById('jsonFile').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const orders = JSON.parse(e.target.result);
            processData(orders);
        } catch (error) {
            alert('잘못된 JSON 파일입니다. (Invalid JSON file.)');
            console.error("JSON 파싱 오류:", error);
        }
    };
    reader.readAsText(file);
});

// 가격 문자열을 숫자로 변환하는 도우미 함수
function cleanPrice(priceStr) {
    if (typeof priceStr !== 'string') return 0;
    // '₩5,500' 및 'US$9.26' 형식 모두 처리
    return parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
}

// 상품명에서 표준화된 앱 이름을 찾는 함수
function getAppName(title) {
    if (!title) return null;

    // 앱 이름과 관련 키워드 매핑
    const appKeywords = {
        '트릭컬 리바이브': ['트릭컬 리바이브', '트릭컬'],
        '명조:워더링 웨이브': ['명조:워더링 웨이브', '명조'],
        '가디언 테일즈': ['가디언 테일즈'],
        '쿠키런: 오븐브레이크': ['쿠키런: 오븐브레이크'],
        '블루 아카이브': ['블루 아카이브'],
        '원신': ['원신'],
        '마비노기 모바일' : ['마비노기 모바일', '마비노기M'],
        '붕괴: 스타레일': ['붕괴: 스타레일', '붕괴스타레일','붕괴:스타레일'],
        '승리의 여신: 니케': ['승리의 여신: 니케', '니케', '승리의 여신:니케'],
        '쿠키런: 킹덤': ['쿠키런: 킹덤', '쿠키런 킹덤', '쿠키런킹덤', '쿠키런:킹덤'],
        '명일방주': ['명일방주'],
        'Limbus Company': ['Limbus Company', '림버스 컴퍼니', '림버스컴퍼니'],
        '페이트/그랜드 오더': ['페이트/그랜드 오더', '페그오', 'Fate/Grand Order'],
        '에픽세븐': ['에픽세븐', '에픽 세븐'],
        '우마 무스메 프리티 더비': ['우마무스메', '우마무스메 프리티 더비', '우마무스메: 프리티 더비', '우마무스메프리티더비'],
        '브라운더스트2': ['브라운더스트2', '브라운더스트 2', '브라운더스트II', '브라운더스트 II'],
        '소녀전선2: 망명': ['소녀전선2', '소녀전선 2', '소녀전선2: 망명', '소녀전선2 망명', '소녀전선 망명'],
        '로스트 소드' : ['로스트 소드', 'Lost Sword'],
        '프린세스 커넥트! Re:Dive': ['프린세스 커넥트', '프린세스 커넥트! Re:Dive', '프린세스커넥트', '프린세스커넥트!Re:Dive'],

    };

    // 키워드 매핑을 통해 앱 이름 찾기
    for (const appName in appKeywords) {
        for (const keyword of appKeywords[appName]) {
            if (title.includes(keyword)) {
                return appName;
            }
        }
    }

    // 결제 내역과 관련 없는 항목 필터링
    const filterOutKeywords = ['Google Play 잔액 충전', '상당 쿠폰'];
    for (const keyword of filterOutKeywords) {
        if (title.includes(keyword)) {
            return null;
        }
    }

    // 알려진 키워드에 없는 경우 '기타'로 분류
    return '기타';
}


// 전체 JSON 데이터를 처리하고 게임별로 그룹화
function processData(orders) {
    processedDataByGame = {};
    const validDocTypes = ['In App Item', 'Subscription', 'Android Apps', 'Movie', 'Book'];

    orders.forEach(item => {
        const order = item.orderHistory;
        if (!order || !order.lineItem || order.lineItem.length === 0) return;

        const doc = order.lineItem[0].doc;
        if (!doc || !doc.title) return; // 제목이 없는 항목은 건너뜁니다.
        
        const appName = getAppName(doc.title);
        if (!appName) return; // 필터링된 항목은 건너뜁니다.
        
        const price = cleanPrice(order.totalPrice);
        const refund = cleanPrice(order.refundAmount);
        const netPrice = price - refund;

        if (netPrice > 0) {
            const date = new Date(order.creationTime);
            if (!processedDataByGame[appName]) {
                processedDataByGame[appName] = [];
            }
            processedDataByGame[appName].push({ date, title: doc.title, price: netPrice });
        }
    });
    
    // 각 게임의 데이터를 날짜순으로 정렬
    for (const game in processedDataByGame) {
        processedDataByGame[game].sort((a, b) => a.date - b.date);
    }
    
    populateGameSelector();
    setupEventListeners();
}

// 게임 선택 드롭다운 채우기
function populateGameSelector() {
    const selector = document.getElementById('game-selector');
    const selectorSection = document.getElementById('game-selector-section');
    selector.innerHTML = '';

    // processData 함수를 통해 생성된, '실제 결제 내역이 있는' 게임들의 목록만 가져옵니다.
    // 따라서, json 파일에 내역이 없는 게임은 이 목록에 포함되지 않습니다.
    const availableGames = Object.keys(processedDataByGame);

    // 총 결제액 순으로 게임 정렬
    const sortedGames = availableGames.sort((a, b) => {
        const totalA = processedDataByGame[a].reduce((sum, item) => sum + item.price, 0);
        const totalB = processedDataByGame[b].reduce((sum, item) => sum + item.price, 0);
        return totalB - totalA;
    });

    if (sortedGames.length === 0) {
        alert('분석할 결제 내역이 없습니다.');
        return;
    }

    sortedGames.forEach(gameName => {
        const option = document.createElement('option');
        option.value = gameName;
        option.textContent = gameName;
        selector.appendChild(option);
    });

    selectorSection.classList.remove('hidden');
    
    // 첫 번째 게임에 대한 초기 표시
    updateDisplayForGame(sortedGames[0]);
}

// 선택된 게임에 대한 모든 UI 구성 요소 업데이트
function updateDisplayForGame(gameName) {
    currentGameData = processedDataByGame[gameName] || [];
    
    displaySummary(currentGameData);
    
    const trickcalSummary = document.getElementById('trickcal-specific-summary');
    if (gameName === '트릭컬 리바이브') {
        trickcalSummary.classList.remove('hidden');
        displayDailyReport(currentGameData);
        displayPassReport(currentGameData);
        displaySashikPassReport(currentGameData);
    } else {
        trickcalSummary.classList.add('hidden');
    }

    document.getElementById('monthly-report').classList.remove('hidden');
    document.getElementById('full-history').classList.remove('hidden');

    displayMonthlyReport(currentGameData);
    displayFullHistory(currentGameData);
}

// --- 표시 함수 ---

function displaySummary(data) {
    const totalSpent = data.reduce((sum, item) => sum + item.price, 0);
    document.getElementById('summary').innerHTML = `선택된 앱/게임 총 결제 금액: <strong>₩${Math.round(totalSpent).toLocaleString()}</strong>`;
}

// 트릭컬 리바이브 관련 특별 보고서
function displayDailyReport(data) {
    const dailyItems = ["데일리 왕사탕 공물", "데일리 엘리프 공물", "데일리 별사탕 공물"];
    const dailyTotal = data
        .filter(item => dailyItems.some(daily => item.title.includes(daily)))
        .reduce((sum, item) => sum + item.price, 0);
    document.getElementById('daily-summary').innerHTML = `데일리 3종 총 결제액: <strong>₩${dailyTotal.toLocaleString()}</strong>`;
}

function displayPassReport(data) {
    const passKeywords = ["리바이브 패스", "트릭컬 패스"];
    const passTotal = data
        .filter(item => passKeywords.some(keyword => item.title.includes(keyword)))
        .reduce((sum, item) => sum + item.price, 0);
    document.getElementById('pass-summary').innerHTML = `리바이브/트릭컬 패스 총 결제액: <strong>₩${passTotal.toLocaleString()}</strong>`;
}

function displaySashikPassReport(data) {
    const sashikTotal = data
        .filter(item => item.title.includes("사복 패스") || item.title.includes("사복패스"))
        .reduce((sum, item) => sum + item.price, 0);
    document.getElementById('sashik-pass-summary').innerHTML = `사복 패스 총 결제액: <strong>₩${sashikTotal.toLocaleString()}</strong>`;
}

// 월별 보고서 및 차트
function displayMonthlyReport(data) {
    const monthlyTotals = {};
    data.forEach(item => {
        const month = item.date.getFullYear() + '-' + String(item.date.getMonth() + 1).padStart(2, '0');
        if (!monthlyTotals[month]) {
            monthlyTotals[month] = [];
        }
        monthlyTotals[month].push(item);
    });

    const accordionContainer = document.getElementById('monthly-accordion');
    accordionContainer.innerHTML = '';
    
    const sortedMonths = Object.keys(monthlyTotals).sort();
    
    sortedMonths.forEach(month => {
        const items = monthlyTotals[month];
        const totalAmount = items.reduce((sum, item) => sum + item.price, 0);

        let detailsHTML = '<table>';
        items.forEach(item => {
            detailsHTML += `
                <tr>
                    <td>${item.date.toISOString().split('T')[0]}</td>
                    <td>${item.title}</td>
                    <td>₩${item.price.toLocaleString()}</td>
                </tr>
            `;
        });
        detailsHTML += '</table>';

        const monthItem = document.createElement('div');
        monthItem.className = 'month-item';
        monthItem.innerHTML = `
            <div class="month-summary">
                <span>${month}</span>
                <span>₩${Math.round(totalAmount).toLocaleString()}</span>
            </div>
            <div class="month-details">${detailsHTML}</div>
        `;
        accordionContainer.appendChild(monthItem);
    });

    displayMonthlyChart(Object.keys(monthlyTotals).reduce((acc, month) => {
        acc[month] = monthlyTotals[month].reduce((sum, item) => sum + item.price, 0);
        return acc;
    }, {}));
}

function displayMonthlyChart(monthlyData) {
    const chartContainer = document.getElementById('monthly-chart-container');
    const sortedMonths = Object.keys(monthlyData).sort();
    
    if(sortedMonths.length === 0) {
        chartContainer.innerHTML = '차트를 표시할 데이터가 없습니다.';
        return;
    }

    const amounts = sortedMonths.map(month => monthlyData[month]);
    const maxAmount = Math.max(...amounts, 1);

    let chartHTML = '';
    let lastYear = '';

    sortedMonths.forEach(month => {
        const amount = monthlyData[month];
        const barHeight = (amount / maxAmount) * 90; 
        
        const currentYear = month.substring(2, 4);
        const currentMonth = month.substring(5);
        
        let label = (currentYear !== lastYear) ? `${currentYear}년\n${currentMonth}월` : `${currentMonth}월`;
        lastYear = currentYear;

        chartHTML += `
            <div class="chart-bar-wrapper"> 
                <div class="chart-amount">₩${Math.round(amount).toLocaleString()}</div>
                <div class="chart-bar" style="height: ${barHeight}%;" title="${month}: ₩${Math.round(amount).toLocaleString()}"></div>
                <div class="chart-label">${label}</div>
            </div>
        `;
    });
    chartContainer.innerHTML = chartHTML;
}

// 전체 내역 테이블
function displayFullHistory(data) {
    const table = document.getElementById('details-table');
    let tableHTML = `<thead><tr><th>날짜</th><th>상품명</th><th>결제 금액</th></tr></thead><tbody>`;
    if (data.length === 0) {
        tableHTML += `<tr><td colspan="3" style="text-align:center;">표시할 내역이 없습니다.</td></tr>`;
    } else {
        [...data].reverse().forEach(item => { // 최신 항목을 먼저 표시
            tableHTML += `
                <tr>
                    <td>${item.date.toISOString().split('T')[0]}</td>
                    <td>${item.title}</td>
                    <td>₩${item.price.toLocaleString()}</td>
                </tr>
            `;
        });
    }
    table.innerHTML = tableHTML + `</tbody>`;
}

// UI 상호작용을 위한 이벤트 리스너 설정
function setupEventListeners() {
    // 게임 선택기
    const gameSelector = document.getElementById('game-selector');
    gameSelector.addEventListener('change', (e) => {
        updateDisplayForGame(e.target.value);
    });

    // 검색 입력
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredData = currentGameData.filter(item => 
            item.title.toLowerCase().includes(searchTerm)
        );
        displayFullHistory(filteredData);
    });

    // 월별 아코디언
    const accordionContainer = document.getElementById('monthly-accordion');
    accordionContainer.addEventListener('click', function(e) {
        const summary = e.target.closest('.month-summary');
        if (summary) {
            summary.parentElement.classList.toggle('active');
        }
    });
}

