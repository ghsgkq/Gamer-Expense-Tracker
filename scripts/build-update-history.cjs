// 공개 업데이트 JSON만 읽어 파일 직접 열기용 스크립트를 생성합니다.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, 'js/updateHistoryData.js');

function buildUpdateHistorySource() {
    const updates = JSON.parse(fs.readFileSync(path.join(root, 'updates.json'), 'utf8'));
    if (!Array.isArray(updates) || updates.some(update => typeof update.date !== 'string' ||
        typeof update.title !== 'string' || !Array.isArray(update.items) || update.items.some(item => typeof item !== 'string'))) {
        throw new Error('Invalid update history');
    }
    const serialized = JSON.stringify(updates).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return '// updates.json 수정 후 node scripts/build-update-history.cjs로 다시 생성하세요.\n' +
        `globalThis.GAMER_UPDATE_HISTORY = ${serialized};\n`;
}

if (require.main === module) {
    const source = buildUpdateHistorySource();
    if (process.argv.includes('--check')) {
        if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== source) {
            console.error('node scripts/build-update-history.cjs로 업데이트 데이터를 갱신하세요.');
            process.exitCode = 1;
        } else {
            console.log('업데이트 스크립트가 원본 JSON과 일치합니다.');
        }
    } else {
        fs.writeFileSync(outputPath, source);
        console.log('파일 직접 열기용 업데이트 데이터를 생성했습니다.');
    }
}

module.exports = { buildUpdateHistorySource };
