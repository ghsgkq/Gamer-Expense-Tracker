// --- 공통 UI 및 유틸리티 기능 ---

/**
 * 업데이트 내역 모달창의 열기/닫기 이벤트를 바인딩합니다.
 */
function setupUpdateHistoryModal() {
    const modal = document.getElementById("updateModal");
    const btn = document.getElementById("updateHistoryBtn");
    const span = document.querySelector(".close-modal");

    if (btn && modal) {
        btn.onclick = function(e) {
            e.preventDefault();
            modal.style.display = "block";
            loadUpdateHistory();
        }
    }

    if (span && modal) {
        span.onclick = function() {
            modal.style.display = "none";
        }
    }

    window.addEventListener('click', function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    });
}

/**
 * updates.json에서 공지사항을 비동기로 로드하여 모달 영역에 렌더링합니다.
 */
async function loadUpdateHistory() {
    const container = document.getElementById("updateLogContainer");
    if (!container) return;

    try {
        const response = await fetch('updates.json');
        if (!response.ok) throw new Error('Network response was not ok');
        const updates = await response.json();

        let html = '';
        updates.forEach(update => {
            html += `
                <div class="update-item">
                    <span class="update-date">${update.date}</span>
                    <span class="update-title">${update.title}</span>
                    <ul class="update-list">
                        ${update.items.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (error) {
        console.error("업데이트 내역 로드 실패:", error);
        container.innerHTML = "<p>업데이트 내역을 불러오지 못했습니다.</p>";
    }
}

// --- 인라인 상태 메시지 ---

/**
 * 업로드 상태나 오류를 alert 대신 해당 요소에 인라인으로 표시합니다.
 */
function showFileStatus(element, message, isError) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', !!isError);
}

// --- 사용자 정의 키워드 영속화 (localStorage) ---
// 기본 사전(js/appKeywords.js)의 원본은 그대로 보존하고, 사용자가 추가/삭제한 차이분만
// 저장합니다. 이렇게 하면 기본 사전에 새 게임이 추가되어도 사용자 설정에 가려지지 않습니다.

const KEYWORD_STORAGE_KEY = 'gamerExpenseTracker.keywordOverrides.v1';
const DEFAULT_APP_KEYWORDS = JSON.parse(JSON.stringify(appKeywords));

function isStringArray(value) {
    return Array.isArray(value) && value.every(v => typeof v === 'string');
}

/**
 * 현재 appKeywords와 기본 사전을 비교해 추가/삭제 내역만 추출합니다.
 */
function computeKeywordOverrides() {
    const added = {};
    const removed = {};

    Object.keys(appKeywords).forEach(appName => {
        const base = DEFAULT_APP_KEYWORDS[appName] || [];
        const extra = appKeywords[appName].filter(keyword => !base.includes(keyword));
        if (extra.length > 0) added[appName] = extra;
    });

    Object.keys(DEFAULT_APP_KEYWORDS).forEach(appName => {
        const current = appKeywords[appName];
        if (!current) {
            removed[appName] = '*'; // 앱 전체 삭제
            return;
        }
        const gone = DEFAULT_APP_KEYWORDS[appName].filter(keyword => !current.includes(keyword));
        if (gone.length > 0) removed[appName] = gone;
    });

    return { added, removed };
}

/**
 * 현재 키워드 설정을 브라우저에 저장합니다. (저장 실패는 기능을 막지 않습니다)
 */
function saveKeywordOverrides() {
    try {
        localStorage.setItem(KEYWORD_STORAGE_KEY, JSON.stringify(computeKeywordOverrides()));
    } catch (error) {
        console.warn("키워드 설정을 저장하지 못했습니다:", error);
    }
}

/**
 * 저장된 설정을 기본 사전에 적용합니다. 손상되거나 형식이 다른 값은 무시합니다.
 */
function loadKeywordOverrides() {
    let raw = null;
    try {
        raw = localStorage.getItem(KEYWORD_STORAGE_KEY);
    } catch (error) {
        return false; // 시크릿 모드 등에서 접근이 차단될 수 있음
    }
    if (!raw) return false;

    let overrides = null;
    try {
        overrides = JSON.parse(raw);
    } catch (error) {
        console.warn("저장된 키워드 설정을 해석할 수 없어 무시합니다.");
        return false;
    }
    if (!overrides || typeof overrides !== 'object') return false;

    const next = JSON.parse(JSON.stringify(DEFAULT_APP_KEYWORDS));

    const removed = overrides.removed;
    if (removed && typeof removed === 'object') {
        Object.keys(removed).forEach(appName => {
            if (!next[appName]) return;
            if (removed[appName] === '*') {
                delete next[appName];
                return;
            }
            if (!isStringArray(removed[appName])) return;
            next[appName] = next[appName].filter(keyword => !removed[appName].includes(keyword));
            if (next[appName].length === 0) delete next[appName];
        });
    }

    const added = overrides.added;
    if (added && typeof added === 'object') {
        Object.keys(added).forEach(appName => {
            if (!isStringArray(added[appName])) return;
            if (!next[appName]) next[appName] = [];
            added[appName].forEach(keyword => {
                if (keyword && !next[appName].includes(keyword)) next[appName].push(keyword);
            });
        });
    }

    appKeywords = next;
    return true;
}

/**
 * 사용자 설정을 모두 지우고 기본 사전으로 되돌립니다.
 */
function resetKeywordOverrides() {
    try {
        localStorage.removeItem(KEYWORD_STORAGE_KEY);
    } catch (error) {
        console.warn("키워드 설정을 삭제하지 못했습니다:", error);
    }
    appKeywords = JSON.parse(JSON.stringify(DEFAULT_APP_KEYWORDS));
}

// 스크립트 로드 순서상 appKeywords.js 다음이므로 이 시점에 바로 적용합니다.
loadKeywordOverrides();

// --- 문자열 이스케이프 ---

/**
 * 업로드 파일에서 읽은 문자열(상품명 등)을 HTML에 넣기 전에 이스케이프합니다.
 * 텍스트/속성 양쪽 모두에 안전하도록 따옴표까지 변환합니다.
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- 업로드 파일 관리 (index.html / recap.html 공용) ---

const UPLOAD_INPUT_IDS = { google: 'googleFileInput', apple: 'appleFileInput', icium: 'iciumFileInput' };
const UPLOAD_STATUS_IDS = { google: 'googleFileStatus', apple: 'appleFileStatus', icium: 'iciumFileStatus' };

// 업로드된 원본 파일 데이터. 키워드를 바꿔도 다시 파싱할 수 있도록 보관합니다.
let rawFileData = { google: null, apple: null, icium: null };

/**
 * 페이지에 존재하는 업로드 입력칸에 변경 리스너를 연결합니다.
 * onDataChanged: 파일이 새로 적재된 뒤 호출할 콜백(각 페이지의 재처리 함수)
 */
function setupFileInputListeners(onDataChanged) {
    Object.keys(UPLOAD_INPUT_IDS).forEach(type => {
        const input = document.getElementById(UPLOAD_INPUT_IDS[type]);
        if (input) input.addEventListener('change', event => handleFileUpload(event, type, onDataChanged));
    });
}

function handleFileUpload(event, type, onDataChanged) {
    const file = event.target.files[0];
    if (!file) return;

    const statusElement = document.getElementById(UPLOAD_STATUS_IDS[type]);
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            if (type === 'google' && /\.json$/i.test(file.name)) {
                rawFileData.google = JSON.parse(e.target.result);
            } else if (type !== 'google' && /\.html?$/i.test(file.name)) {
                rawFileData[type] = new DOMParser().parseFromString(e.target.result, "text/html");
            } else {
                showFileStatus(statusElement, '⚠️ 지원하지 않는 형식입니다. (Google: .json / Apple·아이시움: .html)', true);
                event.target.value = '';
                return;
            }

            showFileStatus(statusElement, `✅ ${file.name} 로드됨`, false);
            if (typeof onDataChanged === 'function') onDataChanged();

        } catch (error) {
            showFileStatus(statusElement, `⚠️ 파일을 해석할 수 없습니다. 저장 가이드를 확인해주세요. (${error.message})`, true);
            console.error("파일 처리 오류:", error);
            event.target.value = '';
        }
    };

    reader.readAsText(file, 'UTF-8');
}

/**
 * 보관 중인 원본 파일을 모두 파싱·병합해 { 게임명: [결제내역] } 을 새로 만듭니다.
 */
function buildCombinedData() {
    const combined = {};
    if (rawFileData.google) mergePaymentData(combined, parseGoogleData(rawFileData.google));
    if (rawFileData.apple) mergePaymentData(combined, parseAppleData(rawFileData.apple));
    if (rawFileData.icium) mergePaymentData(combined, parseIciumData(rawFileData.icium));
    return combined;
}

/**
 * 업로드된 원본 데이터와 입력칸 상태를 모두 비웁니다.
 */
function clearRawFileData() {
    rawFileData = { google: null, apple: null, icium: null };
    Object.keys(UPLOAD_INPUT_IDS).forEach(type => {
        const input = document.getElementById(UPLOAD_INPUT_IDS[type]);
        if (input) input.value = '';
        showFileStatus(document.getElementById(UPLOAD_STATUS_IDS[type]), '', false);
    });
}
