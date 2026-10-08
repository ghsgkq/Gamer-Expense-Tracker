const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildUpdateHistorySource } = require('../scripts/build-update-history.cjs');
const root = path.resolve(__dirname, '..');

function createHistoryContext(protocol, fetch) {
    const container = { innerHTML: '' };
    const context = vm.createContext({
        appKeywords: {}, location: { protocol }, fetch,
        document: { getElementById: () => container }, console: { error() {} },
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'js/updateHistoryData.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(root, 'js/common.js'), 'utf8'), context);
    return { context, container, load: () => vm.runInContext('loadUpdateHistory()', context) };
}

test('업데이트 스크립트가 원본과 같고 분석 페이지에서 공용 코드보다 먼저 로드한다', () => {
    const source = fs.readFileSync(path.join(root, 'js/updateHistoryData.js'), 'utf8');
    assert.equal(source, buildUpdateHistorySource());
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(html.indexOf('src="js/updateHistoryData.js"') >= 0);
    assert.ok(html.indexOf('src="js/updateHistoryData.js"') < html.indexOf('src="js/common.js"'));
});

test('직접 파일 열기에서는 fetch 없이 실제 최신 공지를 표시한다', async () => {
    let requests = 0;
    const { container, load } = createHistoryContext('file:', async () => { requests++; throw new Error('Blocked'); });
    await load();
    assert.equal(requests, 0);
    assert.ok(container.innerHTML.includes('파일 직접 열기 시 업데이트 내역 로딩 수정'));
    assert.ok(container.innerHTML.includes('누적 보물창고 베타 안내'));
    assert.ok(!container.innerHTML.includes('불러오지 못했습니다'));
});

test('HTTP에서는 최신 JSON을 우선하며 공지 문구를 이스케이프한다', async () => {
    let requests = 0;
    const { container, load } = createHistoryContext('http:', async (url, options) => {
        requests++;
        assert.equal(url, 'updates.json');
        assert.equal(options.cache, 'no-cache');
        return { ok: true, json: async () => [{ date: '2026-10-08', title: '<새 공지>', items: ['<내용>'] }] };
    });
    await load();
    assert.equal(requests, 1);
    assert.ok(container.innerHTML.includes('&lt;새 공지&gt;'));
    assert.ok(container.innerHTML.includes('&lt;내용&gt;'));
    assert.ok(!container.innerHTML.includes('누적 보물창고 베타 안내'));
});

test('HTTP 오류·네트워크 오류·잘못된 JSON에는 함께 제공한 공지를 표시한다', async () => {
    for (const fetch of [
        async () => ({ ok: false }),
        async () => { throw new Error('Network unavailable'); },
        async () => ({ ok: true, json: async () => { throw new Error('Invalid JSON'); } }),
    ]) {
        const { container, load } = createHistoryContext('https:', fetch);
        await load();
        assert.ok(container.innerHTML.includes('누적 보물창고 베타 안내'));
    }
});
