// 전역 변수
let combinedData = {};
let currentGameData = [];
let overallChartInstance = null;
let distributionChartInstance = null;
let rawGoogleData = null;
let rawAppleData = null;
let rawIciumData = null;
let selectedYear = 'all'; // 추가된 전역 변수
let appMode = 'all'; // 'all', 'google', 'apple'

// 날짜를 'YYYY-MM-DD' 형식의 문자열로 변환 (현지 시간대 기준)
function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 파일 입력 이벤트 리스너 설정
function setupFileInputListeners() {
    const googleFileInput = document.getElementById('googleFileInput');
    const appleFileInput = document.getElementById('appleFileInput');
    const iciumFileInput = document.getElementById('iciumFileInput');

    if (googleFileInput) {
        googleFileInput.addEventListener('change', (event) => handleFileUpload(event, 'google'));
    }
    if (appleFileInput) {
        appleFileInput.addEventListener('change', (event) => handleFileUpload(event, 'apple'));
    }
    if (iciumFileInput) {
        iciumFileInput.addEventListener('change', (event) => handleFileUpload(event, 'icium'));
    }
}

function handleFileUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const fileContent = e.target.result;
            let newData;
            let statusElementId = type === 'google' ? 'googleFileStatus' : (type === 'apple' ? 'appleFileStatus' : 'iciumFileStatus');
            let statusElement = document.getElementById(statusElementId);

            if (type === 'google' && file.name.endsWith('.json')) {
                rawGoogleData = JSON.parse(fileContent);
                if (statusElement) statusElement.textContent = `✅ ${file.name} 로드됨`;
            } else if (type === 'apple' && (file.name.endsWith('.html') || file.name.endsWith('.htm'))) {
                const parser = new DOMParser();
                rawAppleData = parser.parseFromString(fileContent, "text/html");
                if (statusElement) statusElement.textContent = `✅ ${file.name} 로드됨`;
            } else if (type === 'icium' && (file.name.endsWith('.html') || file.name.endsWith('.htm'))) {
                const parser = new DOMParser();
                rawIciumData = parser.parseFromString(fileContent, "text/html");
                if (statusElement) statusElement.textContent = `✅ ${file.name} 로드됨`;
            } else {
                alert('잘못된 파일 형식입니다. .json 또는 .html 파일을 업로드해주세요.');
                event.target.value = ''; // 파일 선택 초기화
                return;
            }
            
            reprocessAllData();

        } catch (error) {
            alert('파일을 처리하는 중 오류가 발생했습니다. 파일 형식이 올바른지 확인해주세요.');
            console.error("파일 처리 오류:", error);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

function reprocessAllData() {
    combinedData = {}; // 데이터 초기화
    if (rawGoogleData) {
        const googleData = parseGoogleData(rawGoogleData);
        mergeData(googleData);
    }
    if (rawAppleData) {
        const appleData = parseAppleData(rawAppleData);
        mergeData(appleData);
    }
    if (rawIciumData) {
        const iciumData = parseIciumData(rawIciumData);
        mergeData(iciumData);
    }
    
    if (Object.keys(combinedData).length > 0) {
        document.getElementById('keyword-manager')?.classList.remove('hidden');
        document.getElementById('exportAllExcelButton')?.classList.remove('hidden');
    }
    
    updateUI();
    displayCurrentKeywords();
}

function mergeData(newData) {
    mergePaymentData(combinedData, newData);
}

function updateUI() {
    const filteredData = getFilteredCombinedData();
    displayCurrencyOptions();
    displayOverallSummaries(filteredData);
    populateYearDetailSelector();
    populateGameSelector();
    displayOverallStatsChart(filteredData);
    displayDistributionChart(filteredData);
}

// 현재 appMode와 selectedYear에 따라 필터링된 데이터를 반환하는 헬퍼 함수
function getFilteredCombinedData() {
    const filtered = {};
    Object.keys(combinedData).forEach(gameName => {
        const items = combinedData[gameName].filter(item => {
            const modeMatch = appMode === 'all' || item.source === appMode;
            // 여기서 selectedYear는 displayOverallStatsChart 등에서 자체적으로 처리하므로
            // appMode 필터링만 우선 수행한 전체 맵을 반환합니다.
            return modeMatch;
        });
        if (items.length > 0) {
            filtered[gameName] = items;
        }
    });
    return filtered;
}

function populateYearDetailSelector() {
    const selector = document.getElementById('year-detail-select');
    const section = document.getElementById('yearly-detail-section');
    if (!selector) return;

    const currentFilteredData = getFilteredCombinedData();
    const allItems = Object.values(currentFilteredData).flat();
    const uniqueYears = [...new Set(allItems.map(item => item.date.getFullYear()))].sort((a, b) => b - a);

    if (uniqueYears.length === 0) {
        section.classList.add('hidden');
        return;
    }

    const currentSelected = selector.value;
    selector.innerHTML = '';

    // '전체' 옵션 추가
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '전체';
    selector.appendChild(allOption);

    uniqueYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year}년`;
        selector.appendChild(option);
    });

    section.classList.remove('hidden');
    
    if (currentSelected && (currentSelected === 'all' || uniqueYears.includes(parseInt(currentSelected)))) {
        selector.value = currentSelected;
    } else {
        selector.value = 'all'; // 기본값 전체
    }
    
    selectedYear = selector.value;
    displayYearlyDetailSummary(selector.value);
    populateGameSelector(); // 추가됨: 년도 변경 시 게임 리스트 및 상세 데이터 갱신
}

function displayYearlyDetailSummary(year) {
    const summaryDiv = document.getElementById('yearly-detail-summary');
    const currency = document.getElementById('currency-select').value;
    if (!summaryDiv || !year) return;

    let itemsToAnalyze = [];
    let titlePrefix = '';

    const currentFilteredData = getFilteredCombinedData();

    if (year === 'all') {
        itemsToAnalyze = Object.values(currentFilteredData).flat();
        titlePrefix = '전체 기간';
    } else {
        const yearInt = parseInt(year);
        itemsToAnalyze = Object.values(currentFilteredData).flat().filter(item => item.date.getFullYear() === yearInt);
        titlePrefix = `${year}년`;
    }
    
    const totals = calculateTotals(itemsToAnalyze);
    
    let topGame = { name: 'N/A', totals: {} };
    let maxKrwEquivalent = 0;

    Object.keys(currentFilteredData).forEach(gameName => {
        let gameItems = [];
        if (year === 'all') {
            gameItems = currentFilteredData[gameName];
        } else {
            const yearInt = parseInt(year);
            gameItems = currentFilteredData[gameName].filter(item => item.date.getFullYear() === yearInt);
        }

        const gameTotals = calculateTotals(gameItems);
        const krwTotal = gameTotals[currency] || 0;
        if (krwTotal > maxKrwEquivalent) {
            maxKrwEquivalent = krwTotal;
            topGame = { name: gameName, totals: gameTotals };
        }
    });

    if (Object.keys(totals).length > 0) {
        summaryDiv.innerHTML = `
            <div>📊 <strong>${titlePrefix}</strong> 총 결제액: ${formatTotals(totals, currency)}</div>
            <div style="margin-top: 10px;">👑 해당 기간 가장 많이 결제한 앱/게임: <strong>${topGame.name}</strong> (${formatTotals(topGame.totals, currency)})</div>
        `;
    } else {
        summaryDiv.innerHTML = `정보가 없습니다.`;
    }
}

function calculateTotals(data){
    const totals = {}; // e.g., { '₩': 10000, '$': 50 }
    data.forEach(item => {
        if (!totals[item.currency]) {
            totals[item.currency] = 0;
        }
        totals[item.currency] += parseFloat(item.price);
    });
    return totals;
}

function formatTotals(totals, currencyFilter) {
    // totals 객체가 비어있을 경우
    if (Object.keys(totals).length === 0) {
        return `<strong>${currencyFilter || '₩'}0</strong>`;
    }

    // currencyFilter가 있고, 해당하는 데이터가 있을 경우
    if (currencyFilter && totals[currencyFilter] !== undefined) {
        const amount = totals[currencyFilter];

        // toLocaleString()은 소수점이 있으면 알아서 포함하고, 없으면 정수로 표시합니다.
        // 또한 세 자리마다 콤마(,)도 자동으로 추가해 줍니다.
        const formattedAmount = amount.toLocaleString();

        return `<strong>${currencyFilter}${formattedAmount}</strong>`;
    }

    // 해당하는 통화 데이터가 없으면 빈 문자열 반환
    return '';
}

// --- UI 표시 함수들 ---

function displayOverallSummaries(data = combinedData) {
    const overallSummarySection = document.getElementById('overall-summary-section');
    const overallSummaryDiv = document.getElementById('overall-summary');
    const topSpenderDiv = document.getElementById('top-spender-summary');
    // 선택한 화폐 단위
    const currency = document.getElementById('currency-select').value;

    const allItems = Object.values(data).flat();
    const grandTotals = calculateTotals(allItems);
    
    let topGame = { name: 'N/A', totals: {} };
    let maxKrwEquivalent = 0;

    Object.keys(data).forEach(gameName => {
        const gameTotals = calculateTotals(data[gameName]);
        const krwTotal = gameTotals[currency] || 0;
        if (krwTotal > maxKrwEquivalent) {
            maxKrwEquivalent = krwTotal;
            topGame = { name: gameName, totals: gameTotals };
        }
    });

    if (Object.keys(grandTotals).length > 0) {
        const titleSuffix = appMode === 'google' ? ' (Google Play)' : (appMode === 'apple' ? ' (Apple Store)' : ' (모든 스토어)');
        overallSummaryDiv.innerHTML = `💸 ${titleSuffix} 총 결제액: ${formatTotals(grandTotals, currency)}`;
        topSpenderDiv.innerHTML = `👑 가장 많이 결제한 앱/게임: <strong>${topGame.name}</strong> (${formatTotals(topGame.totals, currency)})`;
        overallSummarySection.classList.remove('hidden');
    } else {
        overallSummarySection.classList.add('hidden');
    }
}

function populateGameSelector() {
    const selector = document.getElementById('game-selector');
    const selectorSection = document.getElementById('game-selector-section');
    const currency = document.getElementById('currency-select').value;

    if (!selector) return; // 페이지에 selector가 없으면 종료

    selector.innerHTML = '';

    // 모드 및 년도 필터 적용
    const currentFilteredData = getFilteredCombinedData();
    const finalFilteredData = {};
    Object.keys(currentFilteredData).forEach(gameName => {
        const items = currentFilteredData[gameName].filter(item => {
            const yearMatch = selectedYear === 'all' || item.date.getFullYear() === parseInt(selectedYear);
            const currencyMatch = item.currency === currency;
            return yearMatch && currencyMatch;
        });
        if (items.length > 0) {
            finalFilteredData[gameName] = items;
        }
    });

    const sortedGames = Object.keys(finalFilteredData).sort((a, b) => {
        const totalA = finalFilteredData[a].reduce((sum, item) => sum + item.price, 0);
        const totalB = finalFilteredData[b].reduce((sum, item) => sum + item.price, 0);
        return totalB - totalA;
    });

    if (sortedGames.length === 0) {
        selectorSection.classList.add('hidden');
        // 전체 요약 및 통계는 연도 필터와 별개로 유지하거나 필요시 숨김 처리 가능
        // 여기서는 앱/게임 상세 분석이 없으므로 하단 섹션들을 숨김
        document.getElementById('summary').classList.add('hidden');
        document.getElementById('trickcal-specific-summary').classList.add('hidden');
        document.getElementById('monthly-report').classList.add('hidden');
        document.getElementById('full-history').classList.add('hidden');
        return;
    }

    sortedGames.forEach(gameName => {
        const option = document.createElement('option');
        option.value = gameName;
        option.textContent = gameName;
        selector.appendChild(option);
    });

    selectorSection.classList.remove('hidden');
    const currentSelectedGame = selector.value;
    if (!sortedGames.includes(currentSelectedGame)) {
        updateDisplayForGame(sortedGames[0]);
    } else {
        updateDisplayForGame(currentSelectedGame);
    }
}

function updateDisplayForGame(gameName) {
    const currency = document.getElementById('currency-select').value;
    // 모드 및 년도 필터 적용된 데이터 추출
    let gameData = combinedData[gameName] || [];
    
    gameData = gameData.filter(item => {
        const modeMatch = appMode === 'all' || item.source === appMode;
        const yearMatch = selectedYear === 'all' || item.date.getFullYear() === parseInt(selectedYear);
        return modeMatch && yearMatch;
    });
    
    currentGameData = gameData;
    
    displaySummary(currentGameData, currency);
    
    const trickcalSummary = document.getElementById('trickcal-specific-summary');
    const trickcalFilters = document.getElementById('trickcal-filter-buttons');

    if (gameName === '트릭컬 리바이브' || gameName === '트릭컬 글로벌 서버') {
        trickcalSummary.classList.remove('hidden');
        trickcalFilters.classList.remove('hidden');
        displayDailyReport(currentGameData, currency);
        displayPassReport(currentGameData, currency);
        displaySashikPassReport(currentGameData, currency);
        displayIciumReport(currentGameData, currency);
    } else {
        trickcalSummary.classList.add('hidden');
        trickcalFilters.classList.add('hidden');
    }

    document.getElementById('summary').classList.remove('hidden');
    document.getElementById('monthly-report').classList.remove('hidden');
    document.getElementById('full-history').classList.remove('hidden');

    displayMonthlyReport(currentGameData , currency);
    displayFullHistory(currentGameData, currency);
    
    document.getElementById('search-input').value = '';
    const allButton = document.querySelector('#trickcal-filter-buttons .filter-btn[data-filter="all"]');
    if(allButton) {
        document.querySelectorAll('#trickcal-filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
        allButton.classList.add('active');
    }
}

function displaySummary(data, currency) {
    const summaryDiv = document.getElementById('summary');
    if (!summaryDiv) return;
    
    if (data && data.length > 0) {
        const totalSpent = data
        .filter(item => item.currency === currency)
        .reduce((sum, item) => sum + item.price, 0);
        
        const yearLabel = selectedYear === 'all' ? '전체 기간' : `${selectedYear}년`;
        summaryDiv.innerHTML = `<strong>선택된 앱/게임 (${yearLabel})</strong> 총 결제액: <strong>${currency}${totalSpent.toLocaleString()}</strong>`;
        summaryDiv.classList.remove('hidden');
    } else {
        summaryDiv.classList.add('hidden');
    }
}

function displayDailyReport(data, currency) {
    const dailyKeywords = [
        "데일리 왕사탕 공물", "데일리 엘리프 공물", "데일리 별사탕 공물",
        "Daily Crystal Leaf Offering", "Daily Candy Offering", "Daily Star Candy Offering"
    ];
    const dailyTotal = data
        .filter(item => dailyKeywords.some(keyword => item.title.includes(keyword)))
        .reduce((sum, item) => sum + item.price, 0);
    document.getElementById('daily-summary').innerHTML = `데일리 3종 총 결제액: <strong>${currency}${dailyTotal.toLocaleString()}</strong>`;
}

function displayPassReport(data, currency) {
    const passKeywords = ["리바이브 패스", "트릭컬 패스", "개쩜 패스", "Trickcal Pass", "Trickcal Revive Pass"];
    const passTotal = data
        .filter(item => passKeywords.some(keyword => item.title.includes(keyword)))
        .reduce((sum, item) => sum + item.price, 0);
    document.getElementById('pass-summary').innerHTML = `리바이브/트릭컬/개쩜 패스 총 결제액: <strong>${currency}${passTotal.toLocaleString()}</strong>`;
}

function displaySashikPassReport(data, currency) {
    const sashikKeywords = ["사복 패스", "사복패스", "Civvies Pass"];
    const sashikTotal = data
        .filter(item => sashikKeywords.some(keyword => item.title.includes(keyword)))
        .reduce((sum, item) => sum + item.price, 0);
    document.getElementById('sashik-pass-summary').innerHTML = `사복 패스 총 결제액: <strong>${currency}${sashikTotal.toLocaleString()}</strong>`;
}

function displayIciumReport(data, currency) {
    const iciumTotal = data
        .filter(item => item.source === 'icium')
        .reduce((sum, item) => sum + item.price, 0);
    document.getElementById('icium-summary').innerHTML = `아이시움 라운지 총 결제액: <strong>${currency}${iciumTotal.toLocaleString()}</strong>`;
}

function displayMonthlyReport(data, currency) {
    const monthlyTotals = {};
    data.filter(item => item.currency === currency)
        .forEach(item => {
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

        let detailsHTML = '<table><tbody>';
        items.sort((a,b) => a.date - b.date).forEach(item => {
            detailsHTML += `
                <tr>
                    <td data-label="날짜">${getLocalDateString(item.date)}</td>
                    <td data-label="상품명">${item.title}</td>
                    <td data-label="금액">${currency}${item.price.toLocaleString()}</td>
                </tr>
            `;
        });
        detailsHTML += '</tbody></table>';

        const monthItem = document.createElement('div');
        monthItem.className = 'month-item';
        monthItem.innerHTML = `
            <div class="month-summary">
                <span>${month}</span>
                <span>${currency}${totalAmount.toLocaleString()}</span>
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
                <div class="chart-amount">₩${amount.toLocaleString()}</div>
                <div class="chart-bar" style="height: ${barHeight}%;" title="${month}: ₩${amount.toLocaleString()}"></div>
                <div class="chart-label">${label}</div>
            </div>
        `;
    });
    chartContainer.innerHTML = chartHTML;
}

function displayFullHistory(data, currency) {
    const table = document.getElementById('details-table');
    let tableHTML = `<thead><tr><th>날짜</th><th>상품명</th><th>결제 금액</th></tr></thead><tbody>`;
    if (data.length === 0) {
        tableHTML += `<tr><td colspan="3" style="text-align:center;">표시할 내역이 없습니다.</td></tr>`;
    } else {
        [...data].reverse()
                 .filter(item => item.currency === currency)
                 .forEach(item => {
                    tableHTML += `
                        <tr>
                            <td data-label="날짜">${getLocalDateString(item.date)}</td>
                            <td data-label="상품명">${item.title}</td>
                            <td data-label="결제 금액">${currency}${item.price.toLocaleString()}</td>
                        </tr>
                    `;
        });
    }
    table.innerHTML = tableHTML + `</tbody>`;
}

// 화폐 단위 선택 옵션 표시
function displayCurrencyOptions() {
    const currencySelect = document.getElementById('currency-section');
    if (!currencySelect) return;

    const currentFilteredData = getFilteredCombinedData();
    const allItems = Object.values(currentFilteredData).flat();
    const uniqueCurrencies = [...new Set(allItems.map(item => item.currency))];
    const select = document.getElementById('currency-select');
    const prevValue = select.value;
    select.innerHTML = '';

    uniqueCurrencies.forEach(currency => {
        const option = document.createElement('option');
        option.value = currency;
        option.textContent = currency;
        select.appendChild(option);
    });
    if (uniqueCurrencies.length === 0) {
        currencySelect.classList.add('hidden');
        return;
    }

    currencySelect.classList.remove('hidden');
}

function displayOverallStatsChart(data) {
    const overallStatsSection = document.getElementById('overall-stats-section');
    const canvas = document.getElementById('overall-spending-chart');
    const currency = document.getElementById('currency-select').value;
    const chartType = document.getElementById('overall-chart-type').value;

    if (!canvas) return; // 해당 캔버스가 없는 페이지일 수 있음

    const ctx = canvas.getContext('2d');

    if (Object.keys(data).length === 0) {
        overallStatsSection.classList.add('hidden');
        return;
    }
    overallStatsSection.classList.remove('hidden');

    const allItems = Object.values(data).flat().filter(item => item.currency === currency);
     
    if(allItems.length === 0) {
        if (overallChartInstance) overallChartInstance.destroy();
         overallStatsSection.classList.add('hidden');
        return;
    }

    let minDate = new Date();
    let maxDate = new Date(1970, 0, 1);
    allItems.forEach(item => {
        if (item.date < minDate) minDate = item.date;
        if (item.date > maxDate) maxDate = item.date;
    });

    const gameTotals = Object.keys(data).map(gameName => ({
        name: gameName,
        total: data[gameName].filter(d => d.currency === currency).reduce((sum, item) => sum + item.price, 0)
    })).filter(g => g.total > 0);

    const topGames = gameTotals.sort((a, b) => b.total - a.total).slice(0, 7);
    const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#34495e', '#1abc9c'];

    let chartLabels = [];
    let datasets = [];
    let chartBaseType = 'line';

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: true,
                text: ''
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
                        if (context.parsed.y !== null) {
                            label += currency + context.parsed.y.toLocaleString();
                        }
                        return label;
                    }
                }
            },
        },
        scales: {
            x: {
                title: { display: true, text: '' }
            },
            y: {
                title: { display: true, text: '' },
                ticks: {
                    callback: function(value) {
                        return currency + value.toLocaleString();
                    }
                }
            }
        }
    };

    if (chartType === 'cumulative') {
        const periodKeys = [];
        let currentDate = new Date(minDate.getFullYear(), minDate.getMonth() < 6 ? 0 : 6, 1);

        while (currentDate <= maxDate) {
            const year = currentDate.getFullYear();
            const isFirstHalf = currentDate.getMonth() < 6;
            chartLabels.push(`${year} ${isFirstHalf ? '상반기' : '하반기'}`);
            periodKeys.push(`${year}-${isFirstHalf ? 'H1' : 'H2'}`);
            currentDate.setMonth(currentDate.getMonth() + 6);
        }

        datasets = topGames.map((game, index) => {
            const periodTotals = {};
            periodKeys.forEach(key => periodTotals[key] = 0);

            data[game.name].filter(d => d.currency === currency).forEach(item => {
                const year = item.date.getFullYear();
                const isFirstHalf = item.date.getMonth() < 6;
                const key = `${year}-${isFirstHalf ? 'H1' : 'H2'}`;
                if (periodTotals.hasOwnProperty(key)) {
                    periodTotals[key] += item.price;
                }
            });

            const cumulativeData = [];
            let cumulativeTotal = 0;
            periodKeys.forEach(key => {
                cumulativeTotal += periodTotals[key];
                cumulativeData.push(cumulativeTotal);
            });

            const color = colors[index % colors.length];

            return {
                label: game.name,
                data: cumulativeData,
                borderColor: color,
                backgroundColor: color + '33',
                fill: false,
                tension: 0.1
            };
        });

        options.plugins.title.text = '누적 결제액 상위 게임 추이 (' + currency + ' 기준, 6개월 단위)';
        options.scales.x.title.text = '기간';
        options.scales.y.title.text = '누적 결제액 (' + currency + ')';
        chartBaseType = 'line';
    } else {
        // Yearly mode
        const years = [];
        for (let y = minDate.getFullYear(); y <= maxDate.getFullYear(); y++) {
            years.push(y);
        }
        chartLabels = years.map(y => `${y}년`);

        datasets = topGames.map((game, index) => {
            const yearlyTotals = years.map(year => {
                return data[game.name]
                    .filter(d => d.currency === currency && d.date.getFullYear() === year)
                    .reduce((sum, item) => sum + item.price, 0);
            });

            const color = colors[index % colors.length];

            return {
                label: game.name,
                data: yearlyTotals,
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1
            };
        });

        options.plugins.title.text = '년도별 결제 금액 (' + currency + ' 기준)';
        options.scales.x.title.text = '년도';
        options.scales.y.title.text = '연간 결제액 (' + currency + ')';
        options.scales.x.stacked = true;
        options.scales.y.stacked = true;
        chartBaseType = 'bar';
    }

    if (overallChartInstance) {
        overallChartInstance.destroy();
    }
    overallChartInstance = new Chart(ctx, {
        type: chartBaseType,
        data: {
            labels: chartLabels,
            datasets: datasets
        },
        options: options
    });
}

function displayDistributionChart(data) {
    const overallStatsSection = document.getElementById('overall-stats-section');
    const canvas = document.getElementById('distribution-chart');
    const currency = document.getElementById('currency-select').value;

    if (!canvas) return; // 해당 캔버스가 없는 페이지일 수 있음

    const ctx = canvas.getContext('2d');

    if (Object.keys(data).length === 0) {
        if (distributionChartInstance) {
            distributionChartInstance.destroy();
            distributionChartInstance = null;
        }
        return;
    }

    const gameTotals = Object.keys(data).map(gameName => {
        const total = data[gameName]
            .filter(d => d.currency === currency)
            .reduce((sum, item) => sum + item.price, 0);
        return { name: gameName, total };
    }).filter(g => g.total > 0);

    if (gameTotals.length === 0) {
        if (distributionChartInstance) {
            distributionChartInstance.destroy();
            distributionChartInstance = null;
        }
        return;
    }

    // 지출 금액 기준 내림차순 정렬
    gameTotals.sort((a, b) => b.total - a.total);

    let chartData = [];
    let chartLabels = [];
    const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#34495e', '#1abc9c', '#95a5a6'];

    if (gameTotals.length > 7) {
        const topGames = gameTotals.slice(0, 6);
        const othersTotal = gameTotals.slice(6).reduce((sum, g) => sum + g.total, 0);
        chartLabels = topGames.map(g => g.name).concat('기타');
        chartData = topGames.map(g => g.total).concat(othersTotal);
    } else {
        chartLabels = gameTotals.map(g => g.name);
        chartData = gameTotals.map(g => g.total);
    }

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: true,
                text: '게임별 소비 분포 (' + currency + ' 기준)'
            },
            legend: {
                position: window.innerWidth < 768 ? 'bottom' : 'right',
                labels: {
                    boxWidth: 12,
                    padding: 8
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed;
                        const sum = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = ((value / sum) * 100).toFixed(1);
                        return `${label}: ${currency}${value.toLocaleString()} (${percentage}%)`;
                    }
                }
            }
        }
    };

    if (distributionChartInstance) {
        distributionChartInstance.destroy();
    }

    distributionChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: chartLabels,
            datasets: [{
                data: chartData,
                backgroundColor: colors.slice(0, chartLabels.length),
                borderWidth: 1
            }]
        },
        options: options
    });
}

function setupEventListeners() {
    const gameSelector = document.getElementById('game-selector');
    const currencySelect = document.getElementById('currency-select');
    const chartTypeSelect = document.getElementById('overall-chart-type');

    if(gameSelector){
        gameSelector.addEventListener('change', (e) => {
            updateDisplayForGame(e.target.value);
        });
    }
    if(currencySelect){
        currencySelect.addEventListener('change', () => {
            if (gameSelector) {
                const filteredData = getFilteredCombinedData();
                displayOverallSummaries(filteredData);
                populateYearDetailSelector();
                displayOverallStatsChart(filteredData);
                displayDistributionChart(filteredData);
                populateGameSelector();
                updateDisplayForGame(gameSelector.value);
            }
        });
    }

    if (chartTypeSelect) {
        chartTypeSelect.addEventListener('change', () => {
            const filteredData = getFilteredCombinedData();
            displayOverallStatsChart(filteredData);
        });
    }

    const yearDetailSelect = document.getElementById('year-detail-select');
    if (yearDetailSelect) {
        yearDetailSelect.addEventListener('change', (e) => {
            selectedYear = e.target.value; // 전역 변수 업데이트
            displayYearlyDetailSummary(selectedYear);
            populateGameSelector(); // 하위 섹션들(게임 선택, 월별 보고서, 상세 내역 등) 갱신
        });
    }


    const searchInput = document.getElementById('search-input');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredData = currentGameData.filter(item => 
                item.title.toLowerCase().includes(searchTerm)
            );
            const currency = document.getElementById('currency-select').value;
            displayFullHistory(filteredData, currency);
        });
    }

    // SPA 모드 전환 이벤트 리스너
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const mode = link.dataset.mode;
            switchAppMode(mode);
        });
    });

    const accordionContainer = document.getElementById('monthly-accordion');
    if(accordionContainer) {
        accordionContainer.addEventListener('click', function(e) {
            const summary = e.target.closest('.month-summary');
            if (summary) {
                summary.parentElement.classList.toggle('active');
            }
        });
    }

    const buttons = document.querySelectorAll('#trickcal-filter-buttons .filter-btn');
    if(buttons) {
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                if (document.getElementById('game-selector').value !== '트릭컬 리바이브') return;
                
                buttons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                searchInput.value = "";
    
                const filter = button.dataset.filter;
                let filteredData;
    
                if (filter === 'all') {
                    filteredData = currentGameData;
                } else if (filter === 'pass_basic') {
                    const passKeywords = ["리바이브 패스", "트릭컬 패스", "개쩜 패스"];
                    filteredData = currentGameData.filter(item => passKeywords.some(keyword => item.title.includes(keyword)));
                } else if (filter === 'pass_sashik') {
                    filteredData = currentGameData.filter(item => item.title.includes("사복 패스") || item.title.includes("사복패스"));
                } else {
                    filteredData = currentGameData.filter(item => item.title.includes(filter));
                }
                displayFullHistory(filteredData, document.getElementById('currency-select').value);
            });
        });
    }
    
    const exportAllExcelButton = document.getElementById('exportAllExcelButton');
    if (exportAllExcelButton) {
        exportAllExcelButton.addEventListener('click', () => {
            const currentFilteredData = getFilteredCombinedData();
            const allItems = [];
            Object.keys(currentFilteredData).forEach(gameName => {
                currentFilteredData[gameName].forEach(item => {
                    allItems.push({
                        ...item,
                        gameName: gameName
                    });
                });
            });
            allItems.sort((a, b) => a.date - b.date);

            const todayStr = getLocalDateString(new Date()).replace(/-/g, '');
            downloadDataToExcel(allItems, `모든_결제_내역_${todayStr}.xlsx`, true);
        });
    }

    const exportGameExcelButton = document.getElementById('exportGameExcelButton');
    if (exportGameExcelButton) {
        exportGameExcelButton.addEventListener('click', () => {
            const selectedGame = document.getElementById('game-selector').value;
            if (!selectedGame) {
                alert("선택된 게임이 없습니다.");
                return;
            }
            if (!currentGameData || currentGameData.length === 0) {
                alert("내보낼 거래 내역이 없습니다.");
                return;
            }
            
            const todayStr = getLocalDateString(new Date()).replace(/-/g, '');
            const cleanGameName = selectedGame.replace(/[\s\/:*?"<>|]/g, '_');
            downloadDataToExcel(currentGameData, `${cleanGameName}_결제_내역_${todayStr}.xlsx`, false);
        });
    }

    const resetButton = document.getElementById('resetButton');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            resetAllData();
        });
    }
}

function resetAllData() {
    // 전역 데이터 초기화
    combinedData = {};
    currentGameData = [];
    rawGoogleData = null;
    rawAppleData = null;
    rawIciumData = null;
    selectedYear = 'all'; // 년도 필터 초기화
    
    if (overallChartInstance) {
        overallChartInstance.destroy();
        overallChartInstance = null;
    }
    if (distributionChartInstance) {
        distributionChartInstance.destroy();
        distributionChartInstance = null;
    }

    // UI 초기화
    ['overall-summary-section', 'overall-stats-section', 'yearly-detail-section', 'game-selector-section', 'summary', 'trickcal-specific-summary', 'monthly-report', 'full-history','currency-section', 'keyword-manager', 'exportAllExcelButton'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    // 파일 입력 필드 및 상태 초기화
    const googleInput = document.getElementById('googleFileInput');
    const appleInput = document.getElementById('appleFileInput');
    const iciumInput = document.getElementById('iciumFileInput');
    const googleStatus = document.getElementById('googleFileStatus');
    const appleStatus = document.getElementById('appleFileStatus');
    const iciumStatus = document.getElementById('iciumFileStatus');

    if(googleInput) googleInput.value = '';
    if(appleInput) appleInput.value = '';
    if(iciumInput) iciumInput.value = '';
    if(googleStatus) googleStatus.textContent = '';
    if(appleStatus) appleStatus.textContent = '';
    if(iciumStatus) iciumStatus.textContent = '';
}

function switchAppMode(mode) {
    // 탭 변경 시 데이터 초기화 (사용자 요청 사항)
    resetAllData();

    appMode = mode;
    
    // URL 해시 업데이트 (페이지 새로고침 없이 상태 유지)
    if (window.location.hash.substring(1) !== mode) {
        window.location.hash = mode;
    }

    const googleBox = document.getElementById('google-upload-box');
    const appleBox = document.getElementById('apple-upload-box');
    const iciumBox = document.getElementById('icium-upload-box');
    const mainTitle = document.getElementById('main-title');
    const navLinks = document.querySelectorAll('.nav-link');
    const descriptions = document.querySelectorAll('.page-description');

    // UI 초기화
    navLinks.forEach(link => {
        if (link.dataset.mode === mode) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    descriptions.forEach(desc => desc.classList.add('hidden'));
    document.getElementById(`description-${mode}`).classList.remove('hidden');

    if (mode === 'google') {
        if (googleBox) googleBox.classList.remove('hidden');
        if (appleBox) appleBox.classList.add('hidden');
        if (iciumBox) iciumBox.classList.add('hidden');
        mainTitle.innerHTML = '🎮 Google Play 가계부';
    } else if (mode === 'apple') {
        if (googleBox) googleBox.classList.add('hidden');
        if (appleBox) appleBox.classList.remove('hidden');
        if (iciumBox) iciumBox.classList.add('hidden');
        mainTitle.innerHTML = '🍎 Apple Store 가계부';
    } else {
        if (googleBox) googleBox.classList.remove('hidden');
        if (appleBox) appleBox.classList.remove('hidden');
        if (iciumBox) iciumBox.classList.remove('hidden');
        mainTitle.innerHTML = '🎮 게이머 가계부 🍎 (통합)';
    }

    // 데이터 재처리 (이미 데이터가 있는 경우 현재 모드에 맞춰 UI 갱신)
    if (Object.keys(combinedData).length > 0) {
        updateUI();
    }
}

function setupKeywordManagement() {
    const addKeywordBtn = document.getElementById('add-keyword-btn');
    const appNameInput = document.getElementById('new-app-name');
    const keywordsInput = document.getElementById('new-keywords');
    const keywordsList = document.getElementById('keywords-list');
    const keywordSearchInput = document.getElementById('keyword-search-input');

    if (!addKeywordBtn) return;

    addKeywordBtn.addEventListener('click', () => {
        const appName = appNameInput.value.trim();
        const keywords = keywordsInput.value.trim();

        if (!appName || !keywords) {
            alert('앱 이름과 키워드를 모두 입력해주세요.');
            return;
        }

        const keywordArray = keywords.split(',').map(k => k.trim()).filter(k => k);

        if (!appKeywords[appName]) {
            appKeywords[appName] = [];
        }

        keywordArray.forEach(keyword => {
            if (!appKeywords[appName].includes(keyword)) {
                appKeywords[appName].push(keyword);
            }
        });

        appNameInput.value = '';
        keywordsInput.value = '';

        reprocessAllData();
    });

    keywordsList.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('delete-keyword-btn')) {
            const appName = target.dataset.appName;
            const keyword = target.dataset.keyword;

            if (keyword) { // 개별 키워드 삭제
                const keywords = appKeywords[appName];
                const index = keywords.indexOf(keyword);
                if (index > -1) {
                    keywords.splice(index, 1);
                }
                if (keywords.length === 0) {
                    delete appKeywords[appName];
                }
            } else { // 앱 이름 전체 삭제
                delete appKeywords[appName];
            }
            
            reprocessAllData();
        }
    });

    keywordSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        displayCurrentKeywords(searchTerm);
    });
}

function displayCurrentKeywords(searchTerm = '') {
    const listElement = document.getElementById('keywords-list');
    if (!listElement) return;

    listElement.innerHTML = '';
    
    const filteredKeywords = Object.keys(appKeywords).filter(appName => {
        if (searchTerm === '') return true;
        const keywords = appKeywords[appName].join(', ').toLowerCase();
        return appName.toLowerCase().includes(searchTerm) || keywords.includes(searchTerm);
    });

    filteredKeywords.forEach(appName => {
        const appLi = document.createElement('li');
        appLi.innerHTML = `<strong>${appName}</strong>`;
        
        const appDeleteBtn = document.createElement('button');
        appDeleteBtn.textContent = '앱 전체 삭제';
        appDeleteBtn.className = 'delete-keyword-btn app-delete';
        appDeleteBtn.dataset.appName = appName;
        appLi.appendChild(appDeleteBtn);
        listElement.appendChild(appLi);

        const keywordsLi = document.createElement('li');
        const keywordsSpan = document.createElement('span');
        keywordsSpan.style.wordBreak = 'break-all';

        appKeywords[appName].forEach(keyword => {
            const keywordContainer = document.createElement('span');
            keywordContainer.className = 'keyword-tag';
            
            const keywordSpan = document.createElement('span');
            keywordSpan.textContent = keyword;
            
            const keywordDeleteBtn = document.createElement('button');
            keywordDeleteBtn.textContent = 'x';
            keywordDeleteBtn.className = 'delete-keyword-btn';
            keywordDeleteBtn.dataset.appName = appName;
            keywordDeleteBtn.dataset.keyword = keyword;
            keywordDeleteBtn.title = `'${keyword}' 키워드 삭제`;
            
            keywordContainer.appendChild(keywordSpan);
            keywordContainer.appendChild(keywordDeleteBtn);
            keywordsSpan.appendChild(keywordContainer);
        });
        keywordsLi.appendChild(keywordsSpan);
        listElement.appendChild(keywordsLi);
    });
}


// 초기 로드 시 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', () => {
    setupFileInputListeners();
    setupEventListeners();
    setupKeywordManagement();
    displayCurrentKeywords();
    setupUpdateHistoryModal();

    // 초기 모드 설정 (URL 해시값 확인 또는 기본값 'all')
    const hash = window.location.hash.substring(1);
    const validModes = ['all', 'google', 'apple'];
    if (validModes.includes(hash)) {
        switchAppMode(hash);
    } else {
        switchAppMode('all');
    }
});

// 해시 변경 감지 (뒤로 가기/앞으로 가기 대응)
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1);
    const validModes = ['all', 'google', 'apple'];
    if (validModes.includes(hash)) {
        switchAppMode(hash);
    }
});

/**
 * 결제 내역 데이터를 가공하고 통화별 합계 정보를 추가하여 엑셀 파일로 다운로드합니다.
 * @param {Array} data 결제 아이템 객체들의 배열
 * @param {string} filename 저장할 파일명
 * @param {boolean} isAll 전체 결제 내역 여부 (플랫폼 및 앱 이름 포함 여부 결정)
 */
function downloadDataToExcel(data, filename, isAll) {
    if (!data || data.length === 0) {
        alert("내보낼 데이터가 없습니다.");
        return;
    }

    // 1. JSON 데이터 가공
    const mappedData = data.map(item => {
        const platformName = item.source === 'google' ? '구글 플레이스토어' : (item.source === 'apple' ? '애플 앱스토어' : (item.source === 'icium' ? '아이시움 라운지' : '기타'));
        
        if (isAll) {
            return {
                "날짜": getLocalDateString(item.date),
                "플랫폼": platformName,
                "앱/게임명": item.gameName || '기타',
                "상품명": item.title,
                "결제 금액": item.price,
                "통화": item.currency
            };
        } else {
            return {
                "날짜": getLocalDateString(item.date),
                "플랫폼": platformName,
                "상품명": item.title,
                "결제 금액": item.price,
                "통화": item.currency
            };
        }
    });

    // 2. 통화별 총액(Sum) 계산
    const totals = {};
    data.forEach(item => {
        if (!totals[item.currency]) {
            totals[item.currency] = 0;
        }
        totals[item.currency] += parseFloat(item.price);
    });

    // 3. 합계 행 생성 및 추가
    mappedData.push({});

    Object.keys(totals).forEach(currency => {
        if (isAll) {
            mappedData.push({
                "날짜": `총 결제액 (${currency})`,
                "플랫폼": "",
                "앱/게임명": "",
                "상품명": "",
                "결제 금액": totals[currency],
                "통화": currency
            });
        } else {
            mappedData.push({
                "날짜": `총 결제액 (${currency})`,
                "플랫폼": "",
                "상품명": "",
                "결제 금액": totals[currency],
                "통화": currency
            });
        }
    });

    // 4. SheetJS 워크시트 생성
    const worksheet = XLSX.utils.json_to_sheet(mappedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "결제 내역");

    // 5. 열 너비 자동 최적화 (Auto-fit Columns)
    const cols = Object.keys(mappedData[0] || {}).map(key => {
        let maxLen = key.length * 2;
        mappedData.forEach(row => {
            const val = row[key];
            if (val !== undefined && val !== null) {
                const len = val.toString().length;
                if (len > maxLen) {
                    maxLen = len;
                }
            }
        });
        return { wch: Math.max(10, maxLen + 3) };
    });
    worksheet["!cols"] = cols;

    // 6. 파일 쓰기 및 다운로드
    XLSX.writeFile(workbook, filename);
}

