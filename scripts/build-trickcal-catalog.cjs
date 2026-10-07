// 공개 상품 JSON만 읽어 file://에서도 읽을 수 있는 브라우저용 데이터를 생성합니다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const catalogDirectory = path.resolve(__dirname, '../product/trickcal-revive');
const outputPath = path.join(catalogDirectory, 'catalog.js');

function pick(object, keys) {
    return Object.fromEntries(keys.filter(key => Object.hasOwn(object, key)).map(key => [key, object[key]]));
}

function projectComponents(components) {
    return components.map(component => pick(component, ['이름', '수량', '구성품UID', '엘리프종류']));
}

function buildCatalogSource() {
    const productSource = fs.readFileSync(path.join(catalogDirectory, 'products.json'), 'utf8');
    const iconSource = fs.readFileSync(path.join(catalogDirectory, 'component-icons/icon-mapping.json'), 'utf8');
    const products = JSON.parse(productSource).map(product => {
        const projected = pick(product, ['상품명', '가격', '판매 시작일', '종료일']);
        projected['구성품'] = projectComponents(product['구성품']);
        if (product['매핑정보']) {
            projected['매핑정보'] = pick(product['매핑정보'], ['상태', '추정시즌', '과거구성검증', '가격단위', '공유보상키']);
            projected['매핑정보']['영수증상품명후보'] = (product['매핑정보']['영수증상품명후보'] || [])
                .map(alias => typeof alias === 'string' ? alias : alias['상품명']);
        }
        if (product['패스보상']) {
            const rewards = product['패스보상'];
            projected['패스보상'] = {
                구매보상: projectComponents(rewards['구매보상']),
                유료단계최대합계: projectComponents(rewards['유료단계최대합계'] ?? rewards['유료단계보상']),
                구성품에유료단계포함: rewards['구성품에유료단계포함'],
            };
        }
        return projected;
    });
    const catalog = {
        sourceHash: crypto.createHash('sha256').update(productSource).update(iconSource).digest('hex'),
        products,
        icons: JSON.parse(iconSource),
    };
    const serialized = JSON.stringify(catalog).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return '// 원본 상품 JSON 수정 후 node scripts/build-trickcal-catalog.cjs로 다시 생성하세요.\n' +
        `globalThis.TRICKCAL_PRODUCT_CATALOG = ${serialized};\n`;
}

if (require.main === module) {
    const source = buildCatalogSource();
    if (process.argv.includes('--check')) {
        if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== source) {
            console.error('상품 데이터가 변경됐습니다. node scripts/build-trickcal-catalog.cjs를 실행하세요.');
            process.exitCode = 1;
        } else {
            console.log('브라우저용 상품 데이터가 원본 JSON과 일치합니다.');
        }
    } else {
        fs.writeFileSync(outputPath, source);
        console.log('공개 상품 JSON으로 브라우저용 catalog.js를 생성했습니다.');
    }
}

module.exports = { buildCatalogSource };
