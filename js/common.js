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
