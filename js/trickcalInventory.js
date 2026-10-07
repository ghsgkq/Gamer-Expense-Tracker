// 결제 내역에서 단일 구성으로 연결된 아이템의 누적 합계입니다. 실제 수령 기록은 아닙니다.
const TrickcalInventory = (() => {
    let currentItems = null;
    let currentTotals = null;
    const featuredNames = ['골드', '유료 엘리프', '무료 엘리프', '왕사탕', '별사탕', '모카롱'];
    const reasonLabels = { ambiguous: '복수 후보', incomplete: '구성품 미확보', unmatched: '미등록 상품', 'out-of-period': '결제일에 맞는 판매기간 없음' };

    function calculate(items) {
        const components = new Map();
        const tracks = new Map();
        const result = { included: 0, inferredSeason: 0, omitted: [], sharedDeduplicated: 0, sharedConflicts: 0, components: [] };
        function addComponents(list) {
            list.forEach(component => {
                const name = component.name.normalize('NFKC').replace(/\s+/g, ' ').trim();
                if (!components.has(name)) components.set(name, { name, quantity: 0 });
                components.get(name).quantity += component.quantity;
            });
        }
        items.forEach(item => {
            const match = TrickcalProducts.getMatch(item);
            if (match.status !== 'matched') {
                result.omitted.push({ title: item.title, reason: match.status });
                return;
            }
            result.included++;
            if (match.inferredSeason) result.inferredSeason++;
            const product = match.candidates[0];
            product.groups.forEach(group => {
                const sharedKey = product.metadata['공유보상키'];
                if (group.kind !== 'paid' || !sharedKey) {
                    addComponents(group.components);
                    return;
                }
                // 일반/프리미엄 패스의 같은 시즌 유료 트랙은 한 번만 포함합니다.
                const key = JSON.stringify([sharedKey, product.season]);
                if (!tracks.has(key)) tracks.set(key, { variants: new Map(), count: 0 });
                const track = tracks.get(key);
                track.count++;
                const signature = JSON.stringify(group.components.map(component => [component.name, component.quantity])
                    .sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]));
                track.variants.set(signature, group.components);
            });
        });
        tracks.forEach(track => {
            if (track.variants.size > 1) {
                result.sharedConflicts++;
            } else {
                addComponents(track.variants.values().next().value);
                result.sharedDeduplicated += track.count - 1;
            }
        });
        result.components = [...components.values()].filter(component => component.quantity > 0)
            .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'ko'));
        return result;
    }

    function element(id) { return document.getElementById(id); }

    function renderList() {
        if (!currentTotals) return;
        const query = element('inventory-search').value.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
        const list = currentTotals.components.filter(component => component.name.toLocaleLowerCase('ko-KR').includes(query));
        if (element('inventory-sort').value === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        element('inventory-items').innerHTML = list.length
            ? TrickcalProducts.renderComponents(list)
            : '<p class="product-mapping-note">조건에 맞는 구성품이 없습니다.</p>';
        element('inventory-search-count').textContent = `${list.length.toLocaleString('ko-KR')}종 표시`;
    }

    function refresh() {
        if (!currentItems) return;
        const summary = element('inventory-summary');
        const ready = TrickcalProducts.status === 'ready';
        ['inventory-featured', 'inventory-all', 'inventory-notes'].forEach(id => element(id).classList.toggle('hidden', !ready));
        element('inventory-omitted').classList.add('hidden');
        if (!ready) {
            summary.innerHTML = TrickcalProducts.status === 'error'
                ? '<p class="product-mapping-note">구성품 정보를 불러오지 못했습니다. <button type="button" class="product-retry-button">다시 불러오기</button></p>'
                : '<p class="product-mapping-note" role="status">보물창고를 채우는 중…</p>';
            return;
        }
        currentTotals = calculate(currentItems);
        const totals = currentTotals;
        summary.innerHTML = `<div class="inventory-stats">
            <div><strong data-inventory-stat="types">${totals.components.length.toLocaleString('ko-KR')}</strong><span>아이템 종류</span></div>
            <div><strong data-inventory-stat="included">${totals.included.toLocaleString('ko-KR')}</strong><span>합산한 결제</span></div>
            <div><strong data-inventory-stat="omitted">${totals.omitted.length.toLocaleString('ko-KR')}</strong><span>별도 확인할 결제</span></div>
        </div>`;
        const ranked = [...totals.components].sort((a, b) => {
            const rank = name => featuredNames.includes(name) ? featuredNames.indexOf(name) : featuredNames.length;
            return rank(a.name) - rank(b.name) || b.quantity - a.quantity || a.name.localeCompare(b.name, 'ko');
        });
        element('inventory-featured').innerHTML = ranked.length
            ? TrickcalProducts.renderComponents(ranked.slice(0, 6))
            : '<p class="product-mapping-note">아직 합산할 수 있는 구성품이 없습니다.</p>';
        element('inventory-all-title').textContent = `전체 구성품 ${totals.components.length.toLocaleString('ko-KR')}종 보기`;
        const notes = [];
        if (totals.inferredSeason) notes.push(`시즌 추정 ${totals.inferredSeason}건 포함`);
        if (totals.sharedDeduplicated) notes.push(`같은 패스 단계 보상 ${totals.sharedDeduplicated}건 중복 제외`);
        if (totals.sharedConflicts) notes.push(`구성이 서로 다른 공유 단계 보상 ${totals.sharedConflicts}묶음 합산 보류`);
        element('inventory-notes').textContent = notes.join(' · ');
        element('inventory-notes').classList.toggle('hidden', !notes.length);
        if (totals.omitted.length) {
            const groups = new Map();
            totals.omitted.forEach(item => {
                const key = JSON.stringify([item.title, item.reason]);
                if (!groups.has(key)) groups.set(key, { ...item, count: 0 });
                groups.get(key).count++;
            });
            element('inventory-omitted').classList.remove('hidden');
            element('inventory-omitted-title').textContent = `합산에서 제외한 결제 ${totals.omitted.length}건 확인`;
            element('inventory-omitted-list').innerHTML = [...groups.values()].map(item =>
                `<li>${escapeHtml(item.title)} <span>${escapeHtml(reasonLabels[item.reason] || '확인 필요')} · ${item.count}건</span></li>`).join('');
        }
        renderList();
    }

    function show(items, context) {
        currentItems = items;
        element('trickcal-inventory-section').classList.remove('hidden');
        element('inventory-context').textContent = context;
        refresh();
    }

    function hide() {
        currentItems = null;
        currentTotals = null;
        element('trickcal-inventory-section').classList.add('hidden');
        ['inventory-summary', 'inventory-featured', 'inventory-items', 'inventory-omitted-list', 'inventory-notes'].forEach(id => { element(id).innerHTML = ''; });
    }

    function setup() {
        element('inventory-search').addEventListener('input', renderList);
        element('inventory-sort').addEventListener('change', renderList);
    }

    return { calculate, show, hide, refresh, setup };
})();
