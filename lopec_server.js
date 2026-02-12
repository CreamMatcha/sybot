// lopec_server.js
// 로펙 점수/티어를 크롤링해서 JSON으로 돌려주는 간단 서버

const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const app = express();
const PORT = 3100;

// 헬스 체크용
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// 실제 크롤링 로직
async function fetchLopecData(name) {
  console.log('=== fetchLopecData START ===');
  console.log('name =', name);

  const encodedName = encodeURIComponent(name);
  const url =
    'https://legacy.lopec.kr/search/search.html?headerCharacterName=' +
    encodedName;
  console.log('url =', url);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // 페이지 접속
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // 살짝 여유
    await new Promise(resolve => setTimeout(resolve, 2000));

    const html = await page.content();
    console.log('HTML length =', html.length);

    const $ = cheerio.load(html);

    // ---------- 스펙 포인트 ----------
    let specPoint = null;
    const specText = $('.spec-point').first().text().trim();
    console.log('spec-point raw text =', JSON.stringify(specText));

    if (specText) {
      // 숫자/콤마/점 외 제거 후 콤마 제거
      let cleaned = specText.replace(/[^\d.,]/g, '').replace(/,/g, '');
      specPoint = cleaned;
    }

    // ---------- 티어 이름만 추출 ----------
    let tierName = null;
    const tierSpan = $('.tier.now').first();

    if (tierSpan.length) {
      const classAttr = tierSpan.attr('class') || '';
      const classes = classAttr.split(/\s+/);
      console.log('tier span class =', JSON.stringify(classAttr));

      // CSS 클래스 → 한글 티어명 매핑
      const tierMapping = {
        esther: '에스더',
        master: '마스터',
        diamond: '다이아몬드',
        platinum: '플래티넘',
        gold: '골드',
        silver: '실버',
        bronze: '브론즈',
        iron: '아이언',
      };

      // 클래스 목록 중에서 티어에 해당하는 키만 찾기
      const foundKey = classes.find((c) => tierMapping[c]);

      if (foundKey) {
        tierName = tierMapping[foundKey];
      } else {
        // 혹시 모를 예외 케이스 대비: 텍스트가 NN 같은 잔여 점수가 아니면 텍스트 사용
        const txt = tierSpan.text().trim();
        console.log('tier span text =', JSON.stringify(txt));
        if (txt && !/^[N0-9\s]+$/i.test(txt)) {
          tierName = txt;
        }
      }
    }

    console.log('parsed specPoint =', specPoint);
    console.log('parsed tierName  =', tierName);
    console.log('=== fetchLopecData END ===');

    // remaining(남은 점수)는 더 이상 반환하지 않음
    return {
      ok: true,
      name,
      specPoint,
      tierName,
      url,
    };
  } finally {
    await browser.close();
  }
}

// /lopec 엔드포인트: ?name=캐릭터명
app.get('/lopec', async (req, res) => {
  const name = (req.query.name || '').trim();
  console.log('GET /lopec name =', name);

  if (!name) {
    res.status(400).json({ ok: false, message: 'name query is required' });
    return;
  }

  try {
    const data = await fetchLopecData(name);
    res.json(data);
  } catch (err) {
    console.error('ERROR in /lopec:', err);
    res
      .status(500)
      .json({ ok: false, message: String(err && err.message || err) });
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`LOPEC SERVER RUNNING on port ${PORT}`);
});
