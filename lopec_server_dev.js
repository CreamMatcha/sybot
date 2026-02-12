// lopec_server.js
// 로펙 점수/티어를 크롤링해서 JSON으로 돌려주는 간단 서버 + 카카오링크 기능 추가

const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
// [1] 카카오링크 모듈 불러오기
const { KakaoLinkClient } = require('node-kakaolink');

const app = express();

// [2] 포트 변경 (3100 -> 3101) : 개발 서버용
const PORT = 3101;

// [3] 카카오링크 설정
// 카카오 디벨로퍼스(https://developers.kakao.com/)에서 확인
const KAKAO_JS_KEY = "63ccd6c2bfe4e0b189d6d2eeeac77584";
const KAKAO_URL = "http://google.com"; // 예: http://google.com (카카오에 등록된 도메인)

const kakao = new KakaoLinkClient(KAKAO_JS_KEY, KAKAO_URL);

// [4] 서버 켜질 때 카카오 로그인 시도
kakao.login("appleseoy@gmail.com", "seo248555!!").then(() => {
    console.log("✅ 카카오 로그인 성공!");
}).catch(err => {
    console.error("❌ 카카오 로그인 실패:", err);
});

// 헬스 체크용
app.get('/health', (req, res) => {
    res.json({ ok: true });
});

// 실제 크롤링 로직 (fetchLopecData 함수 - 중복 제거됨)
async function fetchLopecData(name) {
    console.log('=== fetchLopecData START ===');
    console.log('name =', name);

    const encodedName = encodeURIComponent(name);
    const url = 'https://legacy.lopec.kr/search/search.html?headerCharacterName=' + encodedName;
    console.log('url =', url);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000));

        const html = await page.content();
        const $ = cheerio.load(html);

        let specPoint = null;
        const specText = $('.spec-point').first().text().trim();
        if (specText) {
            let cleaned = specText.replace(/[^\d.,]/g, '').replace(/,/g, '');
            specPoint = cleaned;
        }

        let tierName = null;
        const tierSpan = $('.tier.now').first();
        if (tierSpan.length) {
            const classAttr = tierSpan.attr('class') || '';
            const classes = classAttr.split(/\s+/);
            const tierMapping = {
                esther: '에스더', master: '마스터', diamond: '다이아몬드',
                platinum: '플래티넘', gold: '골드', silver: '실버', bronze: '브론즈', iron: '아이언',
            };
            const foundKey = classes.find((c) => tierMapping[c]);
            if (foundKey) {
                tierName = tierMapping[foundKey];
            } else {
                const txt = tierSpan.text().trim();
                if (txt && !/^[N0-9\s]+$/i.test(txt)) tierName = txt;
            }
        }
        return { ok: true, name, specPoint, tierName, url };
    } finally {
        await browser.close();
    }
}

// /lopec 엔드포인트
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
        res.status(500).json({ ok: false, message: String(err && err.message || err) });
    }
});

// [5] 카카오링크 전송 라우터 추가
app.get('/kakao/send', async (req, res) => {
    const { room, title, desc } = req.query; // 봇이 보내주는 데이터

    if (!room) return res.json({ ok: false, msg: "방 이름이 없습니다." });

    try {
        // 템플릿 보내기
        await kakao.sendLink(room, {
            template_id: 12345, // ★본인의 템플릿 ID로 수정★
            template_args: {
                title: title || '제목 없음',
                desc: desc || '내용 없음'
            }
        });

        console.log(`[카카오링크] ${room} 방으로 전송 완료`);
        res.json({ ok: true, msg: "전송 성공" });
    } catch (e) {
        console.error("[카카오링크] 전송 실패:", e);
        res.json({ ok: false, msg: "전송 에러 발생" });
    }
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`LOPEC SERVER RUNNING on port ${PORT}`); // 3101번 포트
});