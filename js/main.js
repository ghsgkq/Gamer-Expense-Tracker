// 전역 변수
let combinedData = {};
let currentGameData = [];
let overallChartInstance = null;

// 파일 입력 이벤트 리스너 설정
function setupFileInputListeners() {
    const googleFileInput = document.getElementById('googleFileInput');
    const appleFileInput = document.getElementById('appleFileInput');

    if (googleFileInput) {
        googleFileInput.addEventListener('change', (event) => handleFileUpload(event, 'google'));
    }
    if (appleFileInput) {
        appleFileInput.addEventListener('change', (event) => handleFileUpload(event, 'apple'));
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
            let statusElementId = type === 'google' ? 'googleFileStatus' : 'appleFileStatus';
            let statusElement = document.getElementById(statusElementId);

            if (type === 'google' && file.name.endsWith('.json')) {
                const orders = JSON.parse(fileContent);
                newData = parseGoogleData(orders);
                if (statusElement) statusElement.textContent = `✅ ${file.name} 로드됨`;
            } else if (type === 'apple' && (file.name.endsWith('.html') || file.name.endsWith('.htm'))) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(fileContent, "text/html");
                newData = parseAppleData(doc);
                if (statusElement) statusElement.textContent = `✅ ${file.name} 로드됨`;
            } else {
                alert('잘못된 파일 형식입니다. .json 또는 .html 파일을 업로드해주세요.');
                event.target.value = ''; // 파일 선택 초기화
                return;
            }
            
            mergeData(newData);
            updateUI();

        } catch (error) {
            alert('파일을 처리하는 중 오류가 발생했습니다. 파일 형식이 올바른지 확인해주세요.');
            console.error("파일 처리 오류:", error);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

function mergeData(newData) {
    for (const gameName in newData) {
        if (combinedData[gameName]) {
            // 중복 데이터 방지를 위해 간단한 ID 생성 및 확인
            newData[gameName].forEach(newItem => {
                const newItemId = `${newItem.date.toISOString()}-${newItem.title}-${newItem.price}`;
                const isDuplicate = combinedData[gameName].some(existingItem => {
                    const existingItemId = `${existingItem.date.toISOString()}-${existingItem.title}-${existingItem.price}`;
                    return existingItemId === newItemId;
                });
                if (!isDuplicate) {
                    combinedData[gameName].push(newItem);
                }
            });
        } else {
            combinedData[gameName] = newData[gameName];
        }
        // 날짜순으로 정렬하여 병합된 데이터의 순서 유지
        combinedData[gameName].sort((a, b) => a.date - b.date);
    }
}

function updateUI() {
    let grandTotal = 0;
    let topGame = { name: 'N/A', total: 0 };
    Object.keys(combinedData).forEach(gameName => {
        const total = combinedData[gameName].reduce((sum, item) => sum + item.price, 0);
        grandTotal += total;
        if (total > topGame.total) {
            topGame = { name: gameName, total: total };
        }
    });

    displayOverallSummaries(grandTotal, topGame);
    populateGameSelector();
    displayOverallStatsChart(combinedData);
}


// --- UI 표시 함수들 ---

function displayOverallSummaries(grandTotal, topGame) {
    const overallSummarySection = document.getElementById('overall-summary-section');
    const overallSummaryDiv = document.getElementById('overall-summary');
    const topSpenderDiv = document.getElementById('top-spender-summary');

    if (grandTotal > 0) {
        overallSummaryDiv.innerHTML = `💸 모든 앱/게임 총 결제액: <strong>₩${Math.round(grandTotal).toLocaleString()}</strong>`;
        topSpenderDiv.innerHTML = `👑 가장 많이 결제한 앱/게임: <strong>${topGame.name}</strong> (₩${Math.round(topGame.total).toLocaleString()})`;
        overallSummarySection.classList.remove('hidden');
    } else {
        overallSummarySection.classList.add('hidden');
    }
}

function populateGameSelector() {
    const selector = document.getElementById('game-selector');
    const selectorSection = document.getElementById('game-selector-section');
    if (!selector) return; // 페이지에 selector가 없으면 종료

    selector.innerHTML = '';

    const sortedGames = Object.keys(combinedData).sort((a, b) => {
        const totalA = combinedData[a].reduce((sum, item) => sum + item.price, 0);
        const totalB = combinedData[b].reduce((sum, item) => sum + item.price, 0);
        return totalB - totalA;
    });

    if (sortedGames.length === 0) {
        selectorSection.classList.add('hidden');
        document.getElementById('overall-summary-section').classList.add('hidden');
        document.getElementById('overall-stats-section').classList.add('hidden');
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
    currentGameData = combinedData[gameName] || [];
    
    displaySummary(currentGameData);
    
    const trickcalSummary = document.getElementById('trickcal-specific-summary');
    const trickcalFilters = document.getElementById('trickcal-filter-buttons');

    if (gameName === '트릭컬 리바이브') {
        trickcalSummary.classList.remove('hidden');
        trickcalFilters.classList.remove('hidden');
        displayDailyReport(currentGameData);
        displayPassReport(currentGameData);
        displaySashikPassReport(currentGameData);
    } else {
        trickcalSummary.classList.add('hidden');
        trickcalFilters.classList.add('hidden');
    }

    document.getElementById('summary').classList.remove('hidden');
    document.getElementById('monthly-report').classList.remove('hidden');
    document.getElementById('full-history').classList.remove('hidden');

    displayMonthlyReport(currentGameData);
    displayFullHistory(currentGameData);
    
    document.getElementById('search-input').value = '';
    const allButton = document.querySelector('#trickcal-filter-buttons .filter-btn[data-filter="all"]');
    if(allButton) {
        document.querySelectorAll('#trickcal-filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
        allButton.classList.add('active');
    }
}

function displaySummary(data) {
    const summaryDiv = document.getElementById('summary');
    if (!summaryDiv) return;
    
    if (data && data.length > 0) {
        const totalSpent = data.reduce((sum, item) => sum + item.price, 0);
        summaryDiv.innerHTML = `<strong>선택된 앱/게임</strong> 총 결제액: <strong>₩${Math.round(totalSpent).toLocaleString()}</strong>`;
        summaryDiv.classList.remove('hidden');
    } else {
        summaryDiv.classList.add('hidden');
    }
}

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

        let detailsHTML = '<table><tbody>';
        items.sort((a,b) => a.date - b.date).forEach(item => {
            detailsHTML += `
                <tr>
                    <td data-label="날짜">${item.date.toISOString().split('T')[0]}</td>
                    <td data-label="상품명">${item.title}</td>
                    <td data-label="금액">₩${item.price.toLocaleString()}</td>
                </tr>
            `;
        });
        detailsHTML += '</tbody></table>';

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

function displayFullHistory(data) {
    const table = document.getElementById('details-table');
    let tableHTML = `<thead><tr><th>날짜</th><th>상품명</th><th>결제 금액</th></tr></thead><tbody>`;
    if (data.length === 0) {
        tableHTML += `<tr><td colspan="3" style="text-align:center;">표시할 내역이 없습니다.</td></tr>`;
    } else {
        [...data].reverse().forEach(item => {
            tableHTML += `
                <tr>
                    <td data-label="날짜">${item.date.toISOString().split('T')[0]}</td>
                    <td data-label="상품명">${item.title}</td>
                    <td data-label="결제 금액">₩${item.price.toLocaleString()}</td>
                </tr>
            `;
        });
    }
    table.innerHTML = tableHTML + `</tbody>`;
}

function displayOverallStatsChart(data) {
    const overallStatsSection = document.getElementById('overall-stats-section');
    const canvas = document.getElementById('overall-spending-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (Object.keys(data).length === 0) {
        overallStatsSection.classList.add('hidden');
        return;
    }
    overallStatsSection.classList.remove('hidden');

    let minDate = new Date();
    let maxDate = new Date(1970, 0, 1);
    Object.values(data).flat().forEach(item => {
        if (item.date < minDate) minDate = item.date;
        if (item.date > maxDate) maxDate = item.date;
    });

    const chartLabels = [];
    const periodKeys = [];
    let currentDate = new Date(minDate.getFullYear(), minDate.getMonth() < 6 ? 0 : 6, 1);

    while (currentDate <= maxDate) {
        const year = currentDate.getFullYear();
        const isFirstHalf = currentDate.getMonth() < 6;
        chartLabels.push(`${year} ${isFirstHalf ? '상반기' : '하반기'}`);
        periodKeys.push(`${year}-${isFirstHalf ? 'H1' : 'H2'}`);
        currentDate.setMonth(currentDate.getMonth() + 6);
    }

    const gameTotals = Object.keys(data).map(gameName => ({
        name: gameName,
        total: data[gameName].reduce((sum, item) => sum + item.price, 0)
    }));
    const topGames = gameTotals.sort((a, b) => b.total - a.total).slice(0, 7);

    const datasets = topGames.map((game, index) => {
        const periodTotals = {};
        periodKeys.forEach(key => periodTotals[key] = 0);

        data[game.name].forEach(item => {
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

        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#34495e', '#1abc9c'];
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

    if (overallChartInstance) {
        overallChartInstance.destroy();
    }
    overallChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '누적 결제액 상위 게임 추이 (6개월 단위)'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += '₩' + Math.round(context.parsed.y).toLocaleString();
                            }
                            return label;
                        }
                    }
                },
            },
            scales: {
                x: {
                    title: { display: true, text: '기간' }
                },
                y: {
                    title: { display: true, text: '누적 결제액 (₩)' },
                    ticks: {
                        callback: function(value) {
                            return '₩' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function setupEventListeners() {
    const gameSelector = document.getElementById('game-selector');
    if(gameSelector){
        gameSelector.addEventListener('change', (e) => {
            updateDisplayForGame(e.target.value);
        });
    }

    const searchInput = document.getElementById('search-input');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredData = currentGameData.filter(item => 
                item.title.toLowerCase().includes(searchTerm)
            );
            displayFullHistory(filteredData);
        });
    }

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
                    const passKeywords = ["리바이브 패스", "트릭컬 패스"];
                    filteredData = currentGameData.filter(item => passKeywords.some(keyword => item.title.includes(keyword)));
                } else if (filter === 'pass_sashik') {
                    filteredData = currentGameData.filter(item => item.title.includes("사복 패스") || item.title.includes("사복패스"));
                } else {
                    filteredData = currentGameData.filter(item => item.title.includes(filter));
                }
                displayFullHistory(filteredData);
            });
        });
    }
    
    const resetButton = document.getElementById('resetButton');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            // 전역 데이터 초기화
            combinedData = {};
            currentGameData = [];
            if (overallChartInstance) {
                overallChartInstance.destroy();
                overallChartInstance = null;
            }
    
            // UI 초기화
            document.querySelectorAll('.hidden').forEach(el => el.classList.remove('hidden'));
            ['overall-summary-section', 'overall-stats-section', 'game-selector-section', 'summary', 'trickcal-specific-summary', 'monthly-report', 'full-history'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            
            // 파일 입력 필드 및 상태 초기화
            const googleInput = document.getElementById('googleFileInput');
            const appleInput = document.getElementById('appleFileInput');
            const googleStatus = document.getElementById('googleFileStatus');
            const appleStatus = document.getElementById('appleFileStatus');

            if(googleInput) googleInput.value = '';
            if(appleInput) appleInput.value = '';
            if(googleStatus) googleStatus.textContent = '';
            if(appleStatus) appleStatus.textContent = '';
        });
    }
}

// 초기 로드 시 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', () => {
    // 페이지 경로에 따라 어떤 파일 입력을 활성화할지 결정
    const path = window.location.pathname.split("/").pop();

    const googleInput = document.getElementById('googleFileInput');
    const appleInput = document.getElementById('appleFileInput');

    if (path === 'google.html' && appleInput) {
        appleInput.parentElement.style.display = 'none';
    } else if (path === 'apple.html' && googleInput) {
        googleInput.parentElement.style.display = 'none';
    }

    setupFileInputListeners();
    setupEventListeners();
});

