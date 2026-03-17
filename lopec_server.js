// 2026.02.14 기준 테스트완료


const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');

const app = express();
const PORT = 3101;

app.use(express.json());

// 티어별 이미지
const TIER_IMAGES = {
  '에스더': 'https://cdnlopec.xyz/asset/image/esther.png',
  '마스터': 'https://cdnlopec.xyz/asset/image/master.png',
  '다이아몬드': 'https://cdnlopec.xyz/asset/image/diamond.png',
  '골드': 'https://cdnlopec.xyz/asset/image/gold.png',
  '실버': 'https://cdnlopec.xyz/asset/image/silver.png',
  '브론즈': 'https://cdnlopec.xyz/asset/image/bronze.png',
  '기본': 'https://i.imgur.com/VucNVmi.jpeg'
};

const CLASS_IMAGES = {
  '버서커': 'https://i.imgur.com/Fnwa0D6.png',
  '워로드': 'https://i.imgur.com/UImdsLL.png',
  '디스트로이어': 'https://i.imgur.com/6weEtzK.png',
  '홀리나이트': 'https://i.imgur.com/XwJJJ4L.png',
  '슬레이어': 'https://i.imgur.com/imtQiNs.png',
  '발키리': 'https://i.imgur.com/Tv5d5AR.png',
  '아르카나': 'https://i.imgur.com/QNCXkb0.png',
  '바드': 'https://i.imgur.com/uwVYaCB.png',
  '서머너': 'https://i.imgur.com/a7TU5wQ.png',
  '소서리스': 'https://i.imgur.com/4u9ERvH.png',
  '데빌헌터': 'https://i.imgur.com/RJNzf1f.png',
  '호크아이': 'https://i.imgur.com/ACnwYEk.png',
  '블래스터': 'https://i.imgur.com/vSRUaZs.png',
  '스카우터': 'https://i.imgur.com/AJrswvy.png',
  '건슬링어': 'https://i.imgur.com/gKNGtfy.png',
  '배틀마스터': 'https://i.imgur.com/6FKSfOf.png',
  '인파이터': 'https://i.imgur.com/pIfR6BE.png',
  '기공사': 'https://i.imgur.com/q3sTlJD.png',
  '창술사': 'https://i.imgur.com/PIxSail.png',
  '스트라이커': 'https://i.imgur.com/ovHY0SO.png',
  '브레이커': 'https://i.imgur.com/sksysh4.png',
  '리퍼': 'https://i.imgur.com/eUrILM9.png',
  '데모닉': 'https://i.imgur.com/sgXw3ta.png',
  '블레이드': 'https://i.imgur.com/4rp4bWa.png',
  '소울이터': 'https://i.imgur.com/yMUbl8q.png',
  '기상술사': 'https://i.imgur.com/J4ijhdU.png',
  '도화가': 'https://i.imgur.com/XpOE6jY.png',
  '환수사': 'https://i.imgur.com/lRzDjDb.png',
  '가디언나이트': 'https://i.imgur.com/l6glgxq.png',

  '기본': 'https://i.imgur.com/VucNVmi.jpeg'
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

    const url = `https://lopec.kr/character/specPoint/${encodeURIComponent(name)}`;

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

    // 예: "#서폿 바드" -> "바드" 추출
    const jobRaw = $('.sc-profile .name-area .job').text().trim();
    const className = jobRaw.split(' ').pop(); // 공백으로 자르고 마지막 단어 가져오기

    // 미리 정의한 목록에서 이미지 찾기 (없으면 기본 이미지)
    const classImgUrl = CLASS_IMAGES[className] || CLASS_IMAGES['기본'];

    // 이미지 추출
    let tierImgUrl = $('.spec-area .tier-box img').attr('src');
    if (!tierImgUrl) {
      tierImgUrl = getTierImage(tierNameRaw);
    } else if (!tierImgUrl.startsWith('http')) {
      tierImgUrl = 'https://legacy.lopec.kr' + tierImgUrl;
    }

    const charImg = $('.sc-profile .group-img img').attr('src');

    // .info-area 안의 모든 .name 태그를 뒤져서 "레벨 :" 로 시작하는 걸 찾습니다.
    let level = "0";
    $('.info-area .info-box .name').each(function () {
      const text = $(this).text().trim();
      if (text.startsWith('레벨 :')) {
        // "레벨 : 1,771.66" -> "1,771.66" 만 남김
        level = text.replace('레벨 :', '').trim();
      }
    });

    console.log(`✅ 추출 성공: ${name} / ${className} / Lv.${level}`);

    res.json({
      ok: true,
      data: {
        name: name,
        class_name: className,
        class_img: classImgUrl,
        item_level: level, // ★ 추출한 레벨 담기

        tier_name: tierNameRaw,
        tier_img: tierImgUrl,
        class_rank: classRank,
        class_percent: classPercent,
        total_rank: totalRank,
        total_percent: totalPercent,
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