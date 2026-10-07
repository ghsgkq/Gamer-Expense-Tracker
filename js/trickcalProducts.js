// 트릭컬 상품 목록과 아이콘만 읽습니다. 결제 원본은 이 모듈에서 저장하거나 전송하지 않습니다.
const TrickcalProducts = (() => {
    const basePath = 'product/trickcal-revive/';
    let status = 'idle';
    let pendingLoad = null;
    let compactIndex = new Map();
    let aliasIndex = new Map();
    let icons = new Map();
    const matchCache = new Map();
    // 사용자가 확인한 동일 상품명입니다. 결제 원본의 표기는 유지합니다.
    const productNameAliases = new Map([
        ['트릭컬패스1', '트릭컬 패스'],
        ['리바이브패스', '개쩜 패스'],
        ['리바이브패스[할인]', '개쩜 패스[할인]'],
    ]);
    let onCatalogChanged = () => {};

    function normalizeName(value) {
        return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    }

    function normalizeTitle(title) {
        // Google 상품명 뒤의 게임 이름에는 시기별 부제가 포함될 수 있습니다.
        // 패키지 자체의 괄호는 남기고 트릭컬로 시작하는 마지막 게임 접미사만 제거합니다.
        return normalizeName(title).replace(/\s*\(\s*트릭컬\s*리바이브[\s\S]*\)\s*$/u, '').trim();
    }

    function indexProduct(index, key, product) {
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(product);
    }

    function dateKey(date) {
        if (!date || typeof date.getTime !== 'function' || !Number.isFinite(date.getTime())) return '';
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function saleDate(value) {
        if (value == null) return null;
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || dateKey(new Date(`${value}T00:00:00`)) !== value) {
            throw new Error('Invalid sale date');
        }
        return value;
    }

    function salePeriodLabel(product) {
        if (!product.saleStart && !product.saleEnd) return '판매기간 미확인';
        return `${product.saleStart || '시작일 미확인'} ~ ${product.saleEnd || '종료일 미확인'}`;
    }

    function aggregateComponents(components) {
        const totals = new Map();
        components.forEach(component => {
            const name = normalizeName(component['이름']);
            const key = JSON.stringify([name, component['구성품UID'] ?? null, component['엘리프종류'] ?? null]);
            if (!totals.has(key)) totals.set(key, { name, quantity: 0 });
            totals.get(key).quantity += component['수량'];
        });
        return [...totals.values()];
    }

    function isComponentList(value) {
        return Array.isArray(value) && value.every(component => component && typeof component['이름'] === 'string' &&
            Number.isFinite(component['수량']) && component['수량'] >= 0);
    }

    function prepareGroups(product) {
        const rewards = product['패스보상'];
        if (!rewards) return [{ kind: 'contents', label: '', components: aggregateComponents(product['구성품']) }];
        const purchase = rewards['구매보상'];
        const paid = rewards['유료단계최대합계'] ?? rewards['유료단계보상'];
        if (!isComponentList(purchase) || !isComponentList(paid) || typeof rewards['구성품에유료단계포함'] !== 'boolean') {
            throw new Error('Invalid pass rewards');
        }
        const groups = [];
        if (purchase.length) groups.push({ kind: 'purchase', label: '구매 보상', components: aggregateComponents(purchase) });
        // 업그레이드에 참조된 기존 유료 트랙을 추가 지급으로 중복 표시하지 않습니다.
        if (rewards['구성품에유료단계포함'] && paid.length) {
            groups.push({ kind: 'paid', label: '유료 단계 보상 · 전체 단계 달성 기준', components: aggregateComponents(paid) });
        }
        return groups;
    }

    function prepareCatalog(products, iconMapping) {
        if (!Array.isArray(products) || !products.length || !iconMapping || typeof iconMapping !== 'object' || Array.isArray(iconMapping)) {
            throw new Error('Invalid product catalog');
        }
        const nextCompact = new Map();
        const nextAliases = new Map();
        products.forEach(product => {
            if (!product || typeof product['상품명'] !== 'string' || !normalizeName(product['상품명']) ||
                !(product['가격'] === null || Number.isFinite(product['가격'])) || !isComponentList(product['구성품'])) {
                throw new Error('Invalid product entry');
            }
            const name = normalizeName(product['상품명']);
            const metadata = product['매핑정보'] || {};
            const groups = prepareGroups(product);
            const components = groups.flatMap(group => group.components);
            const season = /^\d{4}-\d{2}$/.test(metadata['추정시즌']) ? metadata['추정시즌'] : null;
            const saleStart = saleDate(product['판매 시작일']);
            const saleEnd = saleDate(product['종료일']);
            if (saleStart && saleEnd && saleStart > saleEnd) throw new Error('Invalid sale period');
            const signature = JSON.stringify([groups.map(group => [group.label, group.components.map(component => [component.name, component.quantity])
                .sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1])]), season]);
            const entry = {
                name: product['상품명'], price: product['가격'], components, groups, signature, season, saleStart, saleEnd,
                metadata, passRewards: product['패스보상'] || null,
                cashPrice: !metadata['가격단위'] || metadata['가격단위'].startsWith('현금'),
            };
            indexProduct(nextCompact, name.replace(/\s/g, ''), entry);
            const aliases = metadata['영수증상품명후보'] || [];
            aliases.forEach(alias => {
                const aliasName = normalizeName(typeof alias === 'string' ? alias : alias['상품명']);
                if (aliasName) indexProduct(nextAliases, aliasName.replace(/\s/g, ''), entry);
            });
        });
        compactIndex = nextCompact;
        aliasIndex = nextAliases;
        icons = new Map(Object.entries(iconMapping)
            .filter(([, filename]) => typeof filename === 'string' && /^[a-f0-9]{64}\.png$/i.test(filename))
            .map(([name, filename]) => [normalizeName(name), filename]));
        matchCache.clear();
    }

    function loadFileCatalog() {
        if (globalThis.TRICKCAL_PRODUCT_CATALOG) return Promise.resolve(globalThis.TRICKCAL_PRODUCT_CATALOG);
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = basePath + 'catalog.js';
            script.onload = () => {
                script.remove();
                if (globalThis.TRICKCAL_PRODUCT_CATALOG) resolve(globalThis.TRICKCAL_PRODUCT_CATALOG);
                else reject(new Error('Product catalog unavailable'));
            };
            script.onerror = () => {
                script.remove();
                reject(new Error('Product catalog unavailable'));
            };
            document.head.appendChild(script);
        });
    }

    async function readCatalog() {
        // file://에서는 JSON fetch가 차단되므로 공개 JSON으로 생성한 일반 스크립트를 읽습니다.
        if (globalThis.location?.protocol === 'file:') {
            const catalog = await loadFileCatalog();
            return [catalog.products, catalog.icons];
        }
        return Promise.all(['products.json', 'component-icons/icon-mapping.json'].map(async path => {
            const response = await fetch(basePath + path, { cache: 'no-cache' });
            if (!response.ok) throw new Error('Product catalog unavailable');
            return response.json();
        }));
    }

    function load() {
        if (status === 'ready') return Promise.resolve(true);
        if (pendingLoad) return pendingLoad;
        status = 'loading';
        refresh();
        pendingLoad = readCatalog().then(([products, iconMapping]) => {
            prepareCatalog(products, iconMapping);
            status = 'ready';
            refresh();
            return true;
        }).catch(() => {
            status = 'error';
            refresh();
            return false;
        }).finally(() => { pendingLoad = null; });
        return pendingLoad;
    }

    function getMatch(item) {
        if (status !== 'ready') return { status };
        const name = normalizeTitle(item.title);
        const paymentDate = dateKey(item.date);
        const cacheKey = JSON.stringify([name, item.price, item.currency, paymentDate]);
        if (matchCache.has(cacheKey)) return matchCache.get(cacheKey);

        const lookupName = productNameAliases.get(name.replace(/\s/g, '')) || name;
        // 띄어쓰기만 다른 상품도 같은 이름의 판매기간 후보로 함께 비교합니다.
        const direct = compactIndex.get(lookupName.replace(/\s/g, ''));
        const viaAlias = lookupName !== name || !direct;
        let entries = direct || aliasIndex.get(lookupName.replace(/\s/g, '')) || [];
        let inferredSeason = null;
        let matchedBySalePeriod = false;
        let outsideSalePeriod = false;
        if (entries.length > 1 && paymentDate) {
            const dated = entries.filter(entry => entry.saleStart || entry.saleEnd);
            const inPeriod = dated.filter(entry => (!entry.saleStart || entry.saleStart <= paymentDate) &&
                (!entry.saleEnd || paymentDate <= entry.saleEnd));
            if (inPeriod.length) {
                entries = inPeriod;
                matchedBySalePeriod = true;
            } else if (dated.length) {
                // 기간이 확인된 다른 시즌을 대신 적용하지 않습니다.
                entries = entries.filter(entry => !entry.saleStart && !entry.saleEnd);
                outsideSalePeriod = !entries.length;
            }
        }
        // 카탈로그의 시즌은 추정값입니다. 결제월로 좁힌 경우에도 확정으로 표시하지 않습니다.
        const sameSeason = !matchedBySalePeriod && paymentDate && entries.filter(entry => entry.season === paymentDate.slice(0, 7));
        if (sameSeason?.length) {
            entries = sameSeason;
            inferredSeason = paymentDate.slice(0, 7);
        }
        const cashEntries = entries.filter(entry => entry.cashPrice && entry.components.length);
        if (cashEntries.length) entries = cashEntries;
        // 카탈로그 가격은 원화입니다. 할인·부분 환불로 가격이 달라도 이름 매칭은 유지합니다.
        if (item.currency === '₩') {
            const samePrice = entries.filter(entry => entry.cashPrice && entry.price === item.price);
            if (samePrice.length) entries = samePrice;
        }
        const unique = new Map();
        entries.forEach(entry => {
            if (!unique.has(entry.signature)) unique.set(entry.signature, { ...entry, prices: [] });
            const prices = unique.get(entry.signature).prices;
            if (Number.isFinite(entry.price) && !prices.includes(entry.price)) prices.push(entry.price);
        });
        const candidates = [...unique.values()];
        const hasComposition = candidates.some(candidate => candidate.components.length);
        const result = {
            status: outsideSalePeriod ? 'out-of-period' : !candidates.length ? 'unmatched' : !hasComposition ? 'incomplete' : candidates.length === 1 ? 'matched' : 'ambiguous',
            candidates, viaAlias: viaAlias && candidates.length > 0, inferredSeason, matchedBySalePeriod,
        };
        matchCache.set(cacheKey, result);
        return result;
    }

    function renderComponents(components) {
        return `<ul class="product-components">${components.map(component => {
            const filename = icons.get(normalizeName(component.name));
            const icon = filename
                ? `<img class="product-component-image" src="${basePath}component-icons/${filename}" alt="" width="36" height="36" loading="lazy">`
                : '';
            return `<li class="product-component">
                <span class="product-component-icon" aria-hidden="true">${icon}<span class="product-icon-fallback${filename ? ' hidden' : ''}">🧩</span></span>
                <span class="product-component-name">${escapeHtml(component.name)}</span>
                <span class="product-component-quantity">×${component.quantity.toLocaleString('ko-KR')}</span>
            </li>`;
        }).join('')}</ul>`;
    }

    function renderProduct(product) {
        let html = '';
        if (!product.components.length) return '<p class="product-mapping-note">상품명은 확인됐지만 구성품 정보는 아직 확보되지 않았습니다.</p>';
        if (product.metadata['과거구성검증'] === false) {
            html += '<p class="product-mapping-note">현재 상품 목록 기준의 구성품 후보입니다. 결제 당시 구성은 확인되지 않았습니다.</p>';
        }
        if (product.passRewards) {
            html += product.passRewards['구성품에유료단계포함']
                ? '<p class="product-mapping-note">단계 보상은 전체 단계 달성 시 최대 수량입니다. 실제 수령량과 다를 수 있으며, 무료 단계·지급 조건 미확인 보상은 제외했습니다.</p>'
                : '<p class="product-mapping-note">업그레이드 구매 보상만 표시합니다. 기존 패스의 단계 보상은 추가 지급에 포함하지 않습니다.</p>';
        }
        return html + product.groups.map(group => `${group.label ? `<p class="product-reward-label">${escapeHtml(group.label)}</p>` : ''}${renderComponents(group.components)}`).join('');
    }

    function priceLabel(product) {
        if (!product.prices.length) return '가격 미확인';
        const unit = product.metadata['가격단위'];
        const values = product.prices.map(price => price.toLocaleString('ko-KR')).join(' / ');
        if (!unit) return `등록 가격 ₩${values}`;
        return `등록 가격 ${values} (${escapeHtml(unit)})`;
    }

    function renderContent(item) {
        const match = getMatch(item);
        if (match.status === 'idle' || match.status === 'loading') {
            return '<span class="product-mapping-note">구성품을 불러오는 중…</span>';
        }
        if (match.status === 'error') {
            return '<span class="product-mapping-note">구성품 정보를 불러오지 못했습니다.</span> <button type="button" class="product-retry-button">다시 불러오기</button>';
        }
        if (match.status === 'unmatched') {
            return '<span class="product-mapping-note">상품 목록에 구성품 정보가 없습니다.</span>';
        }
        if (match.status === 'out-of-period') {
            return '<span class="product-mapping-note">결제일에 해당하는 판매기간의 상품이 없습니다.</span>';
        }
        if (match.status === 'incomplete') {
            return '<span class="product-mapping-note">상품명 확인 · 구성품 정보 미확보</span>';
        }
        const matchNote = `${match.matchedBySalePeriod ? '<p class="product-mapping-note">결제일이 포함된 판매기간으로 연결했습니다. 시작일·종료일을 모두 포함합니다.</p>' : ''}${match.viaAlias ? '<p class="product-mapping-note">영수증 상품명 별칭으로 연결한 후보입니다.</p>' : ''}${match.inferredSeason
            ? `<p class="product-mapping-note">결제월 기준 ${match.inferredSeason} 시즌 추정입니다. 실제 판매기간은 확인되지 않았습니다.</p>` : ''}`;
        if (match.status === 'matched') {
            const product = match.candidates[0];
            const label = product.passRewards ? '패스 보상 구성 보기' : `구성품 ${product.components.length}종 보기`;
            const period = product.saleStart || product.saleEnd ? `<p class="product-mapping-note">판매기간: ${salePeriodLabel(product)}</p>` : '';
            return `<details class="product-composition"><summary>${label}${match.inferredSeason ? ' · 시즌 추정' : ''}${match.matchedBySalePeriod ? ' · 판매기간 매칭' : ''}</summary>${matchNote}${period}${renderProduct(product)}</details>`;
        }
        return `<details class="product-composition product-composition-ambiguous">
            <summary>구성품 후보 ${match.candidates.length}개 보기</summary>
            ${matchNote}<p class="product-mapping-note">여러 구성품 후보가 있습니다. 실제 구매 구성과 비교해주세요.</p>
            ${match.candidates.map((product, index) => `<section class="product-candidate">
                <p class="product-candidate-label">구성 ${index + 1} · ${escapeHtml(product.name)}${product.season ? ` · ${product.season} 시즌 추정` : ''} · ${priceLabel(product)}</p>
                <p class="product-mapping-note">판매기간: ${salePeriodLabel(product)}</p>
                ${renderProduct(product)}
            </section>`).join('')}
        </details>`;
    }

    function render(item) {
        return `<div class="trickcal-product-info" data-product-title="${escapeHtml(item.title)}" data-product-price="${item.price}" data-product-currency="${escapeHtml(item.currency)}" data-product-date="${dateKey(item.date)}">${renderContent(item)}</div>`;
    }

    function refresh() {
        document.querySelectorAll('.trickcal-product-info').forEach(element => {
            element.innerHTML = renderContent({ title: element.dataset.productTitle, price: Number(element.dataset.productPrice), currency: element.dataset.productCurrency,
                date: element.dataset.productDate ? new Date(`${element.dataset.productDate}T00:00:00`) : null });
        });
        onCatalogChanged();
    }

    function setup(onChange) {
        if (typeof onChange === 'function') onCatalogChanged = onChange;
        document.addEventListener('click', event => {
            if (event.target.closest('.product-retry-button')) load();
        });
        document.addEventListener('error', event => {
            if (event.target.classList?.contains('product-component-image')) {
                event.target.classList.add('hidden');
                event.target.parentElement.querySelector('.product-icon-fallback').classList.remove('hidden');
            }
        }, true);
    }

    return { load, getMatch, render, renderComponents, setup, get status() { return status; } };
})();
