#!/usr/bin/env node
// parser_smoke.js — coverage:
//   • optional 제 with whitespace guard
//   • standalone "제N조" inheriting law name from preceding citation
//   • sentence-break block
//   • regression: bracketed / bare / alias / anaphor filter

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.resolve(__dirname, '..', 'extension');
const sb = { console };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(EXT, 'parser.js'), 'utf8'), sb, { filename: 'parser.js' });
const P = sb.LexGuardParser;

function arrSummary(arr) {
  return arr.map(r => `(${r.lawNameRaw}/${r.articleNo}${r.paragraphNo ? '/' + r.paragraphNo : ''}@${r.startIndex})`).join(' ');
}

const cases = [
  // 제 없는 짧은 형식
  { text: '민법 750조',                     expect: [['민법', '750조', null, 0]] },
  { text: '민법 750조는 손해배상 규정이다.',   expect: [['민법', '750조', null, 0]] },
  { text: '민법750조',                       expect: [] },
  // 연속 조문
  { text: '민법 제750조, 제751조',           expect: [['민법', '750조', null, 0], ['민법', '751조', null, 10]] },
  { text: '민법 제750조, 제751조 및 제760조', expect: [['민법', '750조', null, 0], ['민법', '751조', null, 10], ['민법', '760조', null, 18]] },
  { text: '민법 제750조 및 제760조',         expect: [['민법', '750조', null, 0], ['민법', '760조', null, 11]] },
  // 문장 경계로 차단
  { text: '민법 제750조. 제751조',           expect: [['민법', '750조', null, 0]] },
  { text: '민법 제750조.\n제751조',          expect: [['민법', '750조', null, 0]] },
  // 다른 법령으로 갈아탐
  { text: '민법 제750조, 형법 제100조, 제101조', expect: [['민법', '750조', null, 0], ['형법', '100조', null, 10], ['형법', '101조', null, 20]] },
  // 회귀 — 기존 케이스
  { text: '「민법」 제750조 제1항',           expect: [['민법', '750조', '1항', 0]] },
  { text: '개인정보 보호법 제15조',          expect: [['개인정보 보호법', '15조', null, 0]] },
  { text: '개보법 제23조',                   expect: [['개보법', '23조', null, 0]] },
  { text: '이 법 제15조',                    expect: [] },
  // 신규 — 접속사/부사 strip + leading whitespace 보정
  { text: '또한 민법 제750조',               expect: [['민법', '750조', null, 3]] },
  { text: '다만 개인정보 보호법 제15조',     expect: [['개인정보 보호법', '15조', null, 3]] },
  { text: '→ 민법 제2조',                    expect: [['민법', '2조', null, 2]] },
  { text: '한편 형법 제347조',               expect: [['형법', '347조', null, 3]] },
  // 추가된 filler 단어
  { text: '먼저 민법 제750조',               expect: [['민법', '750조', null, 3]] },
  { text: '다음으로 개인정보 보호법 제15조', expect: [['개인정보 보호법', '15조', null, 5]] },
  { text: '다음 형법 제347조',               expect: [['형법', '347조', null, 3]] },
  { text: '우선 민법 제1조',                 expect: [['민법', '1조', null, 3]] },
  { text: '아울러 상법 제382조',             expect: [['상법', '382조', null, 4]] },
  { text: '나아가 헌법 제1조',               expect: [['헌법', '1조', null, 4]] },
  { text: '반면 형법 제347조',               expect: [['형법', '347조', null, 3]] },
  { text: '더불어 민법 제750조',             expect: [['민법', '750조', null, 4]] },
  { text: '이처럼 민법 제2조',               expect: [['민법', '2조', null, 4]] },
  { text: '이렇듯 민법 제5조',               expect: [['민법', '5조', null, 4]] },
  { text: '이와같이 민법 제100조',           expect: [['민법', '100조', null, 5]] },
  { text: '이와 같이 민법 제200조',          expect: [['민법', '200조', null, 6]] },
  // 신규 — anaphoric reference (같은 법, 위 법, 동법, 해당 법, 본 법) 해소
  { text: '민법 제750조와 같은 법 제751조',         expect: [['민법', '750조', null, 0], ['민법', '751조', null, 10]] },
  { text: '개인정보 보호법 제15조, 같은 법 제17조', expect: [['개인정보 보호법', '15조', null, 0], ['개인정보 보호법', '17조', null, 15]] },
  { text: '민법 제750조. 위 법 제751조',           expect: [['민법', '750조', null, 0]] }, // 문장 경계
  { text: '민법 제750조에 따라. 같은 법 제751조',  expect: [['민법', '750조', null, 0]] }, // 문장 경계
  { text: '민법 제100조 및 동법 제200조',          expect: [['민법', '100조', null, 0], ['민법', '200조', null, 11]] },
  { text: '민법 제5조와 해당 법 제10조',           expect: [['민법', '5조', null, 0], ['민법', '10조', null, 8]] },
  { text: '민법 제1조와 본 법 제2조',              expect: [['민법', '1조', null, 0], ['민법', '2조', null, 8]] },
  // 회귀 — 이/그 법은 여전히 0 matches
  { text: '이 법 제15조 그리고 그 법 제5조',       expect: [] },
];

console.log('--- parser smoke (제 optional + 후속 조문 상속) ---');
let pass = 0;
for (const c of cases) {
  const got = P.findCitations(c.text);
  let ok = got.length === c.expect.length;
  if (ok) {
    for (let i = 0; i < got.length; i++) {
      const [eLn, eAn, ePn, eSi] = c.expect[i];
      if (got[i].lawNameRaw !== eLn || got[i].articleNo !== eAn || got[i].paragraphNo !== ePn) {
        ok = false; break;
      }
      if (eSi !== undefined && got[i].startIndex !== eSi) {
        ok = false; break;
      }
    }
  }
  const expSum = c.expect.map(e => `(${e[0]}/${e[1]}${e[2] ? '/' + e[2] : ''}${e[3] !== undefined ? '@' + e[3] : ''})`).join(' ') || '(none)';
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${c.text}\n` +
              `        expect: ${expSum}\n` +
              `        got:    ${arrSummary(got) || '(none)'}`);
  if (ok) pass++;
}
console.log(`\nresult: ${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
