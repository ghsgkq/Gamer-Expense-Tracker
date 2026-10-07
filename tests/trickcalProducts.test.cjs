const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const icon = `${'a'.repeat(64)}.png`;
const product = (name, price, quantity = 10) => ({
    상품명: name, 가격: price, 구성품: [{ 이름: '골드', 수량: quantity }],
});

function createContext(products, iconMapping = { 골드: icon }, fetchOverride) {
    const requests = [];
    const context = vm.createContext({
        document: { querySelectorAll: () => [] },
        localStorage: { getItem: () => null },
        fetch: async url => {
            requests.push(url);
            if (fetchOverride) return fetchOverride(url);
            return { ok: true, json: async () => url.endsWith('products.json') ? products : iconMapping };
        },
    });
    for (const file of ['appKeywords.js', 'parsers.js', 'common.js', 'trickcalProducts.js', 'trickcalInventory.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context);
    }
    const api = vm.runInContext('TrickcalProducts', context);
    const inventory = vm.runInContext('TrickcalInventory', context);
    return { context, api, requests, inventory };
}

function useFileCatalog(context, onScript) {
    context.location = { protocol: 'file:' };
    context.document.createElement = () => ({ remove() {} });
    context.document.head = { appendChild(script) { queueMicrotask(() => onScript(script)); } };
}

test('HTML 직접 열기에서는 JSON fetch 없이 로컬 상품 스크립트를 읽는다', async () => {
    const { context, api, requests } = createContext([]);
    const scriptPaths = [];
    useFileCatalog(context, script => {
        scriptPaths.push(script.src);
        context.TRICKCAL_PRODUCT_CATALOG = { products: [product('패키지', 9900)], icons: { 골드: icon } };
        script.onload();
    });
    const pending = api.load();
    assert.equal(api.load(), pending);
    assert.equal(await pending, true);
    assert.equal(api.getMatch({ title: '패키지', price: 9900, currency: '₩' }).status, 'matched');
    assert.deepEqual(requests, []);
    assert.deepEqual(scriptPaths, ['product/trickcal-revive/catalog.js']);
    await api.load();
    assert.equal(scriptPaths.length, 1);
});

test('직접 열기용 스크립트 로딩 실패 후 재시도할 수 있다', async () => {
    const { context, api, requests } = createContext([]);
    let fail = true;
    useFileCatalog(context, script => {
        if (fail) return script.onerror();
        context.TRICKCAL_PRODUCT_CATALOG = { products: [product('패키지', 9900)], icons: {} };
        script.onload();
    });
    assert.equal(await api.load(), false);
    assert.equal(api.status, 'error');
    fail = false;
    assert.equal(await api.load(), true);
    assert.deepEqual(requests, []);
});

test('직접 열기용 생성 데이터가 원본과 일치하고 같은 매칭 결과를 제공한다', async () => {
    const { buildCatalogSource } = require('../scripts/build-trickcal-catalog.cjs');
    const generatedSource = fs.readFileSync(path.join(root, 'product/trickcal-revive/catalog.js'), 'utf8');
    assert.ok(generatedSource === buildCatalogSource(), '원본 변경 후 상품 스크립트를 다시 생성해야 합니다.');
    const products = JSON.parse(fs.readFileSync(path.join(root, 'product/trickcal-revive/products.json'), 'utf8'));
    const iconMapping = JSON.parse(fs.readFileSync(path.join(root, 'product/trickcal-revive/component-icons/icon-mapping.json'), 'utf8'));
    const original = createContext(products, iconMapping);
    const local = createContext([]);
    useFileCatalog(local.context, script => {
        vm.runInContext(generatedSource, local.context);
        script.onload();
    });
    assert.equal(await original.api.load(), true);
    assert.equal(await local.api.load(), true);
    assert.deepEqual(local.requests, []);
    const signature = match => JSON.stringify([match.status, match.viaAlias, match.inferredSeason, match.matchedBySalePeriod,
        match.candidates.map(candidate => [candidate.name, candidate.groups, candidate.season, candidate.prices, candidate.saleStart, candidate.saleEnd, candidate.metadata['과거구성검증'], candidate.metadata['가격단위'], candidate.metadata['공유보상키']])]);
    for (const entry of products) {
        const season = entry['매핑정보']?.['추정시즌'];
        const date = entry['판매 시작일'] ? new Date(`${entry['판매 시작일']}T00:00:00`) : season ? new Date(`${season}-01T00:00:00`) : new Date(2025, 0, 1);
        const names = [entry['상품명'], ...(entry['매핑정보']?.['영수증상품명후보'] || []).map(alias => alias['상품명'])];
        if (['개쩜 패스', '개쩜 패스[할인]'].includes(entry['상품명'])) names.push(entry['상품명'].replace('개쩜', '리바이브'));
        if (entry['상품명'] === '트릭컬 패스') names.push('트릭컬 패스1');
        for (const title of names) {
            const item = { title, price: entry['가격'], currency: '₩', date };
            assert.ok(signature(original.api.getMatch(item)) === signature(local.api.getMatch(item)), '원본과 생성 데이터의 매칭 결과가 같아야 합니다.');
        }
    }
});

test('게임 접미사·시기별 부제·유니코드·띄어쓰기 차이를 처리한다', async () => {
    const { api, requests } = createContext([product('성장 패키지 1', 9900)]);
    assert.equal(await api.load(), true);
    for (const title of ['성장 패키지 1 (트릭컬 리바이브)', '성장 패키지 1 (트릭컬 리바이브 - 볼따구)', '성장패키지１ (트릭컬 리바이브)']) {
        assert.equal(api.getMatch({ title, price: 9900, currency: '₩' }).status, 'matched');
    }
    assert.deepEqual(requests, ['product/trickcal-revive/products.json', 'product/trickcal-revive/component-icons/icon-mapping.json']);
});

test('패키지 자체의 괄호를 보존하고 부분 이름으로 추측하지 않는다', async () => {
    const { api } = createContext([product('특별 (주말) 패키지', 9900), product('스텝업 패키지10', 9900)]);
    await api.load();
    assert.equal(api.getMatch({ title: '특별 (주말) 패키지 (트릭컬 리바이브)', price: 9900, currency: '₩' }).status, 'matched');
    assert.equal(api.getMatch({ title: '스텝업 패키지1', price: 9900, currency: '₩' }).status, 'unmatched');
});

test('카탈로그의 중복 행과 구성품 순서 차이로 후보를 늘리지 않는다', async () => {
    const first = product('패키지', 9900);
    first.구성품.push({ 이름: '왕사탕', 수량: 100 });
    const second = { ...first, 구성품: [...first.구성품].reverse() };
    const { api } = createContext([first, second, first]);
    await api.load();
    assert.equal(api.getMatch({ title: '패키지', price: 9900, currency: '₩' }).candidates.length, 1);
});

test('원화 가격으로 구분하고 같은 이름·가격의 다른 구성은 후보로 남긴다', async () => {
    const { api } = createContext([product('패키지', 9900, 10), product('패키지', 19800, 20), product('패키지', 19800, 30)]);
    await api.load();
    assert.equal(api.getMatch({ title: '패키지', price: 9900, currency: '₩' }).candidates[0].components[0].quantity, 10);
    assert.equal(api.getMatch({ title: '패키지', price: 19800, currency: '₩' }).status, 'ambiguous');
    assert.equal(api.getMatch({ title: '패키지', price: 19800, currency: '₩' }).candidates.length, 2);
    assert.equal(api.getMatch({ title: '패키지', price: 9900, currency: '$' }).candidates.length, 3);
});

test('할인·부분 환불 가격도 이름 매칭을 유지한다', async () => {
    const { api } = createContext([product('패키지', 9900)]);
    await api.load();
    assert.equal(api.getMatch({ title: '패키지', price: 8000, currency: '₩' }).status, 'matched');
});

const datedProduct = (name, quantity, start, end) => ({
    ...product(name, 9900, quantity), '판매 시작일': start, 종료일: end,
});
const datedItem = (date, title = '스텝업 패키지3') => ({ title, price: 9900, currency: '₩', date: date ? new Date(`${date}T00:00:00`) : null });

test('같은 이름·띄어쓰기 변형을 함께 비교하고 결제일이 포함된 판매기간을 우선한다', async () => {
    const { api, inventory } = createContext([
        product('스텝업 패키지3', 9900, 999),
        datedProduct('스텝업 패키지 3', 10, '2025-01-01', '2025-01-31'),
        datedProduct('스텝업 패키지 3', 20, '2025-02-01', '2025-02-28'),
    ]);
    await api.load();
    for (const [date, quantity] of [['2025-01-01', 10], ['2025-01-31', 10], ['2025-02-01', 20], ['2025-02-28', 20]]) {
        const match = api.getMatch(datedItem(date));
        assert.equal(match.status, 'matched');
        assert.equal(match.matchedBySalePeriod, true);
        assert.equal(match.inferredSeason, null);
        assert.equal(match.candidates[0].components[0].quantity, quantity);
    }
    assert.equal(inventory.calculate([datedItem('2025-01-31'), datedItem('2025-02-01')]).components[0].quantity, 30);
    const html = api.render(datedItem('2025-02-28'));
    assert.ok(html.includes('판매기간 매칭'));
    assert.ok(html.includes('2025-02-01 ~ 2025-02-28'));
});

test('판매기간은 가격·추정시즌보다 우선하고 할인 결제에도 유지한다', async () => {
    const first = { ...datedProduct('패키지', 10, '2025-01-01', '2025-02-03'), 매핑정보: { 추정시즌: '2025-01' } };
    const second = { ...datedProduct('패키지', 20, '2025-02-04', '2025-03-03'), 가격: 19800, 매핑정보: { 추정시즌: '2025-02' } };
    const { api } = createContext([first, second]);
    await api.load();
    const match = api.getMatch({ ...datedItem('2025-02-02', '패키지'), price: 19800 });
    assert.equal(match.candidates[0].components[0].quantity, 10);
    assert.equal(match.inferredSeason, null);
});

test('서로 다른 구성의 판매기간이 겹치거나 결제일을 모르면 후보를 유지한다', async () => {
    const { api, inventory } = createContext([
        datedProduct('패키지', 10, '2025-01-01', '2025-02-01'),
        datedProduct('패키지', 20, '2025-02-01', '2025-02-28'),
    ]);
    await api.load();
    assert.equal(api.getMatch(datedItem('2025-02-01', '패키지')).status, 'ambiguous');
    assert.equal(api.getMatch(datedItem(null, '패키지')).status, 'ambiguous');
    assert.equal(api.getMatch({ ...datedItem(null, '패키지'), date: new Date('invalid') }).status, 'ambiguous');
    assert.equal(inventory.calculate([datedItem('2025-02-01', '패키지')]).included, 0);
});

test('모든 판매기간 밖의 결제는 다른 시즌으로 대체하거나 합산하지 않는다', async () => {
    const { api, inventory } = createContext([
        datedProduct('패키지', 10, '2025-01-01', '2025-01-31'),
        datedProduct('패키지', 20, '2025-02-01', '2025-02-28'),
    ]);
    await api.load();
    for (const date of ['2024-12-31', '2025-03-01']) {
        const item = datedItem(date, '패키지');
        assert.equal(api.getMatch(item).status, 'out-of-period');
        assert.ok(api.render(item).includes('결제일에 해당하는 판매기간의 상품이 없습니다'));
        const totals = inventory.calculate([item]);
        assert.equal(totals.included, 0);
        assert.equal(totals.components.length, 0);
        assert.equal(totals.omitted[0].reason, 'out-of-period');
    }
});

test('판매기간에 맞는 항목이 없으면 날짜 미확인 후보만 남기고 단일 상품은 이름으로 연결한다', async () => {
    const { api } = createContext([
        product('패키지', 9900, 10),
        datedProduct('패키지', 20, '2025-01-01', '2025-01-31'),
        datedProduct('유일한 상품', 30, '2025-01-01', '2025-01-31'),
    ]);
    await api.load();
    assert.equal(api.getMatch(datedItem('2025-02-01', '패키지')).candidates[0].components[0].quantity, 10);
    assert.equal(api.getMatch(datedItem('2025-02-01', '유일한 상품')).status, 'matched');
});

test('한쪽만 있는 판매기간도 비교하고 잘못된 날짜는 적재를 거부한다', async () => {
    const { api } = createContext([
        datedProduct('패키지', 10, null, '2025-01-31'),
        datedProduct('패키지', 20, '2025-02-01', null),
    ]);
    await api.load();
    assert.equal(api.getMatch(datedItem('2024-01-01', '패키지')).candidates[0].components[0].quantity, 10);
    assert.equal(api.getMatch(datedItem('2026-01-01', '패키지')).candidates[0].components[0].quantity, 20);
    for (const [start, end] of [['2025-02-30', null], ['2025-02-02', '2025-02-01']]) {
        const invalid = createContext([datedProduct('패키지', 10, start, end)]);
        assert.equal(await invalid.api.load(), false);
    }
});

test('새 공개 카탈로그의 스텝업 패키지를 판매기간으로 구분하고 새 아이콘을 표시한다', async () => {
    const products = JSON.parse(fs.readFileSync(path.join(root, 'product/trickcal-revive/products.json'), 'utf8'));
    const icons = JSON.parse(fs.readFileSync(path.join(root, 'product/trickcal-revive/component-icons/icon-mapping.json'), 'utf8'));
    const { api } = createContext(products, icons);
    await api.load();
    const steps = products.filter(entry => entry.상품명 === '스텝업 패키지 3' && entry['판매 시작일']);
    assert.ok(steps.length > 1);
    for (const step of steps) {
        const item = { ...datedItem(step['판매 시작일']), price: step.가격 };
        const match = api.getMatch(item);
        assert.equal(match.status, 'matched');
        assert.equal(match.matchedBySalePeriod, true);
        assert.equal(match.candidates[0].saleStart, step['판매 시작일']);
        for (const component of match.candidates[0].components) {
            if (icons[component.name]) assert.ok(api.render(item).includes(icons[component.name]));
        }
    }
});

test('이름만 확인된 상품도 적재하고 구성품 미확보를 구분한다', async () => {
    const { api } = createContext([
        product('일반 패키지', 9900),
        { 상품명: '옛날 패키지', 가격: null, 구성품: [], 매핑정보: { 상태: '이름만 확인' } },
    ]);
    assert.equal(await api.load(), true);
    assert.equal(api.getMatch({ title: '일반 패키지', price: 9900, currency: '₩' }).status, 'matched');
    assert.equal(api.getMatch({ title: '옛날 패키지', price: 9900, currency: '₩' }).status, 'incomplete');
    assert.ok(api.render({ title: '옛날 패키지', price: 9900, currency: '₩' }).includes('구성품 정보 미확보'));
});

test('영수증 별칭을 연결하되 정확한 상품명을 우선한다', async () => {
    const alias = { ...product('새 상품명', 9900), 매핑정보: { 영수증상품명후보: [{ 상품명: '옛 상품명', 상태: '후보' }] } };
    const { api } = createContext([alias, product('정확한 상품명', 9900, 20), {
        ...product('다른 상품', 9900, 30), 매핑정보: { 영수증상품명후보: [{ 상품명: '정확한 상품명' }] },
    }]);
    await api.load();
    const match = api.getMatch({ title: '옛상품명 (트릭컬 리바이브)', price: 9900, currency: '₩' });
    assert.equal(match.status, 'matched');
    assert.equal(match.viaAlias, true);
    assert.equal(match.candidates[0].name, '새 상품명');
    assert.equal(api.getMatch({ title: '정확한 상품명', price: 9900, currency: '₩' }).candidates[0].components[0].quantity, 20);
});

test('리바이브 패스를 개쩜 패스로 연결하고 판매기간·할인 구분·누적 합산을 유지한다', async () => {
    const { api, inventory } = createContext([
        datedProduct('개쩜 패스', 10, '2025-01-01', '2025-01-31'),
        datedProduct('개쩜 패스', 20, '2025-02-01', '2025-02-28'),
        datedProduct('개쩜 패스[할인]', 3, '2025-01-01', '2025-01-31'),
        datedProduct('개쩜 패스[할인]', 4, '2025-02-01', '2025-02-28'),
    ]);
    await api.load();
    const items = [datedItem('2025-01-31', '리바이브 패스 (트릭컬 리바이브)'),
        datedItem('2025-02-01', '리바이브패스'), datedItem('2025-02-01', '리바이브 패스 [할인]')];
    for (const [index, quantity] of [10, 20, 4].entries()) {
        const match = api.getMatch(items[index]);
        assert.equal(match.status, 'matched');
        assert.equal(match.viaAlias, true);
        assert.equal(match.matchedBySalePeriod, true);
        assert.equal(match.candidates[0].name, index === 2 ? '개쩜 패스[할인]' : '개쩜 패스');
        assert.equal(match.candidates[0].components[0].quantity, quantity);
    }
    const totals = inventory.calculate(items);
    assert.equal(totals.included, 3);
    assert.equal(totals.components[0].quantity, 34);
    assert.ok(api.render(items[0]).includes(`component-icons/${icon}`));
    assert.ok(api.render(items[0]).includes('data-product-title="리바이브 패스 (트릭컬 리바이브)"'));
    assert.equal(api.getMatch(datedItem('2025-02-01', '리바이브 패스 기념 패키지')).status, 'unmatched');
});

test('트릭컬 패스1을 트릭컬 패스로 연결하고 날짜별 구성과 누적 합산을 유지한다', async () => {
    const { api, inventory } = createContext([
        datedProduct('트릭컬 패스', 10, '2025-01-01', '2025-01-31'),
        datedProduct('트릭컬 패스', 20, '2025-02-01', '2025-02-28'),
    ]);
    await api.load();
    const first = datedItem('2025-01-31', '트릭컬 패스1 (트릭컬 리바이브)');
    const second = datedItem('2025-02-01', '트릭컬패스１');
    for (const [item, quantity] of [[first, 10], [second, 20]]) {
        const match = api.getMatch(item);
        assert.equal(match.status, 'matched');
        assert.equal(match.viaAlias, true);
        assert.equal(match.matchedBySalePeriod, true);
        assert.equal(match.candidates[0].name, '트릭컬 패스');
        assert.equal(match.candidates[0].components[0].quantity, quantity);
    }
    assert.equal(inventory.calculate([first, second]).components[0].quantity, 30);
    assert.ok(api.render(first).includes(`component-icons/${icon}`));
    assert.ok(api.render(first).includes('data-product-title="트릭컬 패스1 (트릭컬 리바이브)"'));
    assert.equal(api.getMatch(datedItem('2025-01-01', '트릭컬 패스10')).status, 'unmatched');
});

test('실제 공개 카탈로그에서 패스 별칭의 구성과 날짜 매핑 결과가 같다', async () => {
    const products = JSON.parse(fs.readFileSync(path.join(root, 'product/trickcal-revive/products.json'), 'utf8'));
    const { api } = createContext(products);
    await api.load();
    const aliases = { '트릭컬 패스': '트릭컬 패스1', '개쩜 패스': '리바이브 패스', '개쩜 패스[할인]': '리바이브 패스[할인]' };
    const passes = products.filter(entry => aliases[entry.상품명] && entry['판매 시작일']);
    assert.ok(passes.length > 1);
    for (const pass of passes) {
        const original = datedItem(pass['판매 시작일'], pass.상품명);
        original.price = pass.가격;
        const alias = { ...original, title: aliases[pass.상품명] };
        const originalMatch = api.getMatch(original);
        const aliasMatch = api.getMatch(alias);
        assert.equal(aliasMatch.status, originalMatch.status);
        assert.equal(aliasMatch.matchedBySalePeriod, originalMatch.matchedBySalePeriod);
        assert.equal(aliasMatch.viaAlias, true);
        assert.equal(JSON.stringify(aliasMatch.candidates), JSON.stringify(originalMatch.candidates));
    }
});

test('결제월로 패스 시즌을 추정하고 다른 결제월의 캐시를 섞지 않는다', async () => {
    const seasonProduct = (season, quantity) => ({ ...product('트릭컬 패스', 11000, quantity), 매핑정보: {
        추정시즌: season, 과거구성검증: false, 가격단위: '현금 (통화코드 미기재)',
        영수증상품명후보: [{ 상품명: '트릭컬 패스1' }],
    } });
    const { api } = createContext([seasonProduct('2025-01', 10), seasonProduct('2025-02', 20)]);
    await api.load();
    const first = { title: '트릭컬 패스1', price: 11000, currency: '₩', date: new Date(2025, 0, 1) };
    const second = { ...first, date: new Date(2025, 1, 1) };
    assert.equal(api.getMatch(first).candidates[0].components[0].quantity, 10);
    assert.equal(api.getMatch(second).candidates[0].components[0].quantity, 20);
    assert.equal(api.getMatch(first).inferredSeason, '2025-01');
    assert.ok(api.render(first).includes('시즌 추정'));
    assert.ok(api.render(first).includes('결제 당시 구성은 확인되지 않았습니다.'));
    assert.ok(api.render(first).includes('data-product-date="2025-01-01"'));
    assert.equal(api.getMatch({ ...first, date: new Date(2025, 2, 1) }).status, 'ambiguous');
    assert.equal(api.getMatch({ ...first, date: null }).status, 'ambiguous');
});

test('같은 구성품의 반복 항목을 합산해 표시한다', async () => {
    const entry = product('데일리 공물', 5500, 200);
    entry.구성품.push({ 이름: '골드', 수량: 100 }, { 이름: '골드', 수량: 100 });
    const { api } = createContext([entry]);
    await api.load();
    const components = api.getMatch({ title: entry.상품명, price: 5500, currency: '₩' }).candidates[0].components;
    assert.equal(components.length, 1);
    assert.equal(components[0].quantity, 400);
});

test('패스 구매·유료 단계 보상을 구분하고 무료·미확인 보상은 제외한다', async () => {
    const entry = { ...product('일반 패스', 11000), 패스보상: {
        구매보상: [{ 이름: '골드', 수량: 100 }],
        유료단계최대합계: [{ 이름: '골드', 수량: 300 }, { 이름: '유료 엘리프', 수량: 700 }],
        무료단계최대합계: [{ 이름: '무료 전용 아이템', 수량: 200 }],
        조건미확인보상: [{ 이름: '미확인 아이템', 수량: 10 }],
        구성품에유료단계포함: true,
    } };
    const upgrade = { ...entry, 상품명: '패스 업그레이드', 패스보상: { ...entry.패스보상, 구성품에유료단계포함: false } };
    const { api } = createContext([entry, upgrade]);
    await api.load();
    const match = api.getMatch({ title: '일반 패스', price: 11000, currency: '₩' });
    assert.equal(match.candidates[0].groups.length, 2);
    const html = api.render({ title: '일반 패스', price: 11000, currency: '₩' });
    assert.ok(html.includes('구매 보상'));
    assert.ok(html.includes('전체 단계 달성 기준'));
    assert.ok(!html.includes('무료 전용 아이템'));
    assert.ok(!html.includes('미확인 아이템'));
    const upgradeMatch = api.getMatch({ title: '패스 업그레이드', price: 11000, currency: '₩' });
    assert.equal(upgradeMatch.candidates[0].groups.length, 1);
    assert.equal(upgradeMatch.candidates[0].components[0].quantity, 100);
    assert.ok(api.render({ title: '패스 업그레이드', price: 11000, currency: '₩' }).includes('기존 패스의 단계 보상은 추가 지급에 포함하지 않습니다.'));
});

test('게임 재화 가격을 원화 결제 가격으로 사용하지 않는다', async () => {
    const cash = { ...product('혼합 상품', 9900, 10), 매핑정보: { 가격단위: '현금 (통화코드 미기재)' } };
    const inGame = { ...product('혼합 상품', 100, 20), 매핑정보: { 가격단위: '유료 엘리프' } };
    const { api } = createContext([cash, inGame]);
    await api.load();
    assert.equal(api.getMatch({ title: '혼합 상품', price: 100, currency: '₩' }).candidates[0].components[0].quantity, 10);
});

test('누적 구성품은 반복 구매와 서로 다른 패키지의 같은 아이템을 합산한다', async () => {
    const second = product('두 번째 패키지', 19800, 5);
    second.구성품.push({ 이름: '유료 엘리프', 수량: 20 });
    const { api, inventory } = createContext([product('첫 패키지', 9900), second]);
    await api.load();
    const totals = inventory.calculate([
        { title: '첫 패키지', price: 9900, currency: '₩' },
        { title: '첫 패키지', price: 9900, currency: '₩' },
        { title: '두 번째 패키지', price: 19800, currency: '₩' },
    ]);
    assert.equal(totals.included, 3);
    assert.equal(totals.components.find(component => component.name === '골드').quantity, 25);
    assert.equal(totals.components.find(component => component.name === '유료 엘리프').quantity, 20);
});

test('복수 후보·구성품 미확보·미등록 상품은 누적 합계에서 제외한다', async () => {
    const { api, inventory } = createContext([
        product('확인 상품', 9900), product('복수 후보', 9900, 100), product('복수 후보', 9900, 200),
        { 상품명: '이름만 확인', 가격: null, 구성품: [] },
    ]);
    await api.load();
    const totals = inventory.calculate(['확인 상품', '복수 후보', '이름만 확인', '미등록 상품'].map(title => ({ title, price: 9900, currency: '₩' })));
    assert.equal(totals.included, 1);
    assert.equal(totals.omitted.length, 3);
    assert.equal(totals.components[0].quantity, 10);
    assert.equal(totals.omitted.map(item => item.reason).sort().join(','), 'ambiguous,incomplete,unmatched');
});

function passProduct(name, season, purchase, paid, includePaid = true) {
    return { ...product(name, 11000), 매핑정보: { 공유보상키: 'shared-track', 추정시즌: season }, 패스보상: {
        구매보상: purchase ? [{ 이름: '골드', 수량: purchase }] : [],
        유료단계최대합계: [{ 이름: '골드', 수량: paid }],
        구성품에유료단계포함: includePaid,
    } };
}

test('일반·프리미엄·업그레이드의 같은 시즌 단계 보상은 한 번만 합산한다', async () => {
    const { api, inventory } = createContext([
        passProduct('일반 패스', '2025-01', 0, 100),
        passProduct('프리미엄 패스', '2025-01', 10, 100),
        passProduct('업그레이드', '2025-01', 10, 100, false),
    ]);
    await api.load();
    const totals = inventory.calculate(['일반 패스', '프리미엄 패스', '업그레이드'].map(title => ({ title, price: 11000, currency: '₩', date: new Date(2025, 0, 1) })));
    assert.equal(totals.components[0].quantity, 120);
    assert.equal(totals.included, 3);
    assert.equal(totals.sharedDeduplicated, 1);
    assert.equal(totals.sharedConflicts, 0);
    assert.equal(totals.inferredSeason, 3);
});

test('다른 시즌의 패스 단계 보상은 각각 합산한다', async () => {
    const { api, inventory } = createContext([
        passProduct('일반 패스', '2025-01', 0, 100), passProduct('일반 패스', '2025-02', 0, 100),
    ]);
    await api.load();
    const totals = inventory.calculate([new Date(2025, 0, 1), new Date(2025, 1, 1)].map(date => ({ title: '일반 패스', price: 11000, currency: '₩', date })));
    assert.equal(totals.components[0].quantity, 200);
    assert.equal(totals.sharedDeduplicated, 0);
});

test('같은 공유 단계 키의 구성이 다르면 구매 보상만 합산하고 단계 합산을 보류한다', async () => {
    const { api, inventory } = createContext([
        passProduct('패스 A', '2025-01', 10, 100), passProduct('패스 B', '2025-01', 10, 200),
    ]);
    await api.load();
    const totals = inventory.calculate(['패스 A', '패스 B'].map(title => ({ title, price: 11000, currency: '₩', date: new Date(2025, 0, 1) })));
    assert.equal(totals.components[0].quantity, 20);
    assert.equal(totals.sharedConflicts, 1);
});

test('빈 결제 목록은 이전 누적 합계를 남기지 않는다', async () => {
    const { api, inventory } = createContext([product('패키지', 9900)]);
    await api.load();
    inventory.calculate([{ title: '패키지', price: 9900, currency: '₩' }]);
    const totals = inventory.calculate([]);
    assert.equal(totals.components.length, 0);
    assert.equal(totals.included, 0);
    assert.equal(totals.omitted.length, 0);
});

test('구성품 수량·아이콘·누락 안내와 HTML 이스케이프를 제공한다', async () => {
    const entry = product('테스트 <패키지>', 9900, 10000);
    entry.구성품.push({ 이름: '<없는 아이템>', 수량: 1 });
    const { api } = createContext([entry]);
    await api.load();
    const html = api.render({ title: '테스트 <패키지>', price: 9900, currency: '₩' });
    assert.ok(html.includes(`component-icons/${icon}`));
    assert.ok(html.includes('×10,000'));
    assert.ok(html.includes('&lt;없는 아이템&gt;'));
    assert.ok(html.includes('data-product-title="테스트 &lt;패키지&gt;"'));
    assert.ok(!html.includes('<없는 아이템>'));
    assert.ok(api.render({ title: '미등록 상품', price: 1000, currency: '₩' }).includes('상품 목록에 구성품 정보가 없습니다.'));
});

test('외부 URL이나 경로를 아이콘 주소로 사용하지 않는다', async () => {
    const { api } = createContext([product('패키지', 9900)], { 골드: 'https://example.com/icon.png' });
    await api.load();
    const html = api.render({ title: '패키지', price: 9900, currency: '₩' });
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('product-icon-fallback'));
});

test('동시 요청을 합치고 실패 후 재시도할 수 있다', async () => {
    let fail = true;
    const { api, requests } = createContext([], {}, async url => {
        if (fail) return { ok: false };
        return { ok: true, json: async () => url.endsWith('products.json') ? [product('패키지', 9900)] : {} };
    });
    const first = api.load();
    assert.equal(api.load(), first);
    assert.equal(await first, false);
    assert.equal(api.status, 'error');
    assert.ok(api.render({ title: '패키지', price: 9900, currency: '₩' }).includes('다시 불러오기'));
    fail = false;
    assert.equal(await api.load(), true);
    await api.load();
    assert.equal(requests.length, 4);
});

test('실제 공개 카탈로그와 모든 아이콘 파일을 읽을 수 있다', async () => {
    const products = JSON.parse(fs.readFileSync(path.join(root, 'product/trickcal-revive/products.json'), 'utf8'));
    const iconMapping = JSON.parse(fs.readFileSync(path.join(root, 'product/trickcal-revive/component-icons/icon-mapping.json'), 'utf8'));
    const { api } = createContext(products, iconMapping);
    assert.equal(await api.load(), true);
    for (const entry of products) {
        assert.notEqual(api.getMatch({ title: entry.상품명, price: entry.가격, currency: '₩' }).status, 'unmatched');
    }
    for (const filename of Object.values(iconMapping)) {
        assert.match(filename, /^[a-f0-9]{64}\.png$/i);
        assert.ok(fs.existsSync(path.join(root, 'product/trickcal-revive/component-icons', filename)));
    }
});

// 경로는 환경 변수로만 받고 개인 파일 경로나 주문 정보를 테스트 출력에 포함하지 않습니다.
test('지정된 로컬 결제 파일을 메모리에서만 검증한다', { skip: !process.env.GAMER_TEST_ORDER_HISTORY }, async () => {
    const products = JSON.parse(fs.readFileSync(path.join(root, 'product/trickcal-revive/products.json'), 'utf8'));
    const iconMapping = JSON.parse(fs.readFileSync(path.join(root, 'product/trickcal-revive/component-icons/icon-mapping.json'), 'utf8'));
    const { api, context, requests, inventory } = createContext(products, iconMapping);
    assert.equal(await api.load(), true);
    context.orders = JSON.parse(fs.readFileSync(process.env.GAMER_TEST_ORDER_HISTORY, 'utf8'));
    const items = vm.runInContext("parseGoogleData(orders)['트릭컬 리바이브'] || []", context);
    assert.ok(items.length > 0, '트릭컬 결제 내역이 있어야 합니다.');
    let matched = 0;
    let singleMatches = 0;
    for (const item of items) {
        const match = api.getMatch(item);
        assert.ok(['matched', 'ambiguous', 'unmatched', 'incomplete', 'out-of-period'].includes(match.status));
        if (match.status === 'matched' || match.status === 'ambiguous') matched++;
        if (match.status === 'matched') singleMatches++;
        assert.ok(api.render(item).includes('trickcal-product-info'));
    }
    assert.ok(matched > 0, '카탈로그에서 매칭 가능한 결제가 있어야 합니다.');
    const totals = inventory.calculate(items);
    assert.equal(totals.included, singleMatches);
    assert.equal(totals.omitted.length, items.length - singleMatches);
    assert.ok(totals.components.length > 0);
    assert.equal(requests.length, 2, '결제 데이터와 무관하게 공개 카탈로그만 요청해야 합니다.');
    delete context.orders;
});
