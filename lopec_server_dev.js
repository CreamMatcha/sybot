const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');

const app = express();
const PORT = 3101;

app.use(express.json());

// ★ 티어별 이미지 (보조용)
const TIER_IMAGES = {
    '에스더': 'https://cdnlopec.xyz/asset/image/esther.png',
    '마스터': 'https://cdnlopec.xyz/asset/image/master.png',
    '다이아몬드': 'https://cdnlopec.xyz/asset/image/diamond.png',
    '골드': 'https://cdnlopec.xyz/asset/image/gold.png',
    '실버': 'https://cdnlopec.xyz/asset/image/silver.png',
    '브론즈': 'https://cdnlopec.xyz/asset/image/bronze.png',
    '기본': 'https://imgur.com/a/eYjcWaC'
};

function getTierImage(tierText) {
    if (!tierText) return TIER_IMAGES['기본'];
    for (const key in TIER_IMAGES) {
        if (tierText.includes(key)) return TIER_IMAGES[key];
    }
    return TIER_IMAGES['기본'];
}

app.get('/search', async (req, res) => {
    const { name } = req.query;
    if (!name) return res.json({ ok: false, error: "이름을 입력해주세요." });

    console.log(`🔎 [Legacy Lopec] ${name} 검색 시작...`);

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const url = `https://legacy.lopec.kr/search/search.html?headerCharacterName=${encodeURIComponent(name)}`;

        // 페이지 접속
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 로딩 대기
        try {
            await page.waitForFunction(
                () => {
                    const el = document.querySelector('.spec-area .tier-box .spec-point');
                    return el && el.innerText.trim().length > 0 && !el.innerText.includes('로딩중');
                },
                { timeout: 10000 }
            );
        } catch (waitError) {
            console.log("⚠️ 로딩 대기 시간 초과");
        }

        const content = await page.content();
        const $ = cheerio.load(content);

        // 데이터 추출
        const tierNameRaw = $('.spec-area .gauge-box .tier.now').text().trim() || "Unranked";

        let score = $('.spec-area .tier-box .spec-point').text().trim() || "0";
        score = score.replace('로딩중', '0');

        // ★★★ [수정됨] 랭킹 및 퍼센트 분리 추출 ★★★

        // 1. 전체 랭킹
        const totalRankEl = $('.info-area .info-box').eq(2).find('.name').eq(0);
        const totalRankText = totalRankEl.text();
        const totalRankMatch = totalRankText.match(/([0-9,]+위)/);
        const totalRank = totalRankMatch ? totalRankMatch[1] : "-";

        // <em> 태그 안의 퍼센트 추출 (예: 0.57%)
        const totalPercent = totalRankEl.find('em').text().trim() || "";

        // 2. 직업 랭킹
        const classRankEl = $('.info-area .info-box').eq(2).find('.name').eq(1);
        const classRankText = classRankEl.text();
        const classRankMatch = classRankText.match(/([0-9,]+위)/);
        const classRank = classRankMatch ? classRankMatch[1] : "-";

        // <em> 태그 안의 퍼센트 추출 (예: 0.76%)
        const classPercent = classRankEl.find('em').text().trim() || "";

        // 이미지 추출
        let tierImgUrl = $('.spec-area .tier-box img').attr('src');
        if (!tierImgUrl) {
            tierImgUrl = getTierImage(tierNameRaw);
        } else if (!tierImgUrl.startsWith('http')) {
            tierImgUrl = 'https://legacy.lopec.kr' + tierImgUrl;
        }

        const charImg = $('.sc-profile .group-img img').attr('src');

        console.log(`✅ 추출 성공: ${name} / ${tierNameRaw} / ${totalPercent}`);

        res.json({
            ok: true,
            data: {
                name: name,
                tier_name: tierNameRaw,
                tier_img: tierImgUrl,
                class_rank: classRank,
                class_percent: classPercent, // ★ 추가됨 (직업 %)
                total_rank: totalRank,
                total_percent: totalPercent, // ★ 추가됨 (전체 %)
                score: score,
                char_img: charImg,
                url: url
            }
        });

    } catch (e) {
        console.error("❌ 크롤링 에러:", e);
        if (!res.headersSent) res.json({ ok: false, error: "서버 내부 오류" });
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Lopec API 서버 가동! (포트: ${PORT})`);
});