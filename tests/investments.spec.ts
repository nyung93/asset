import { test, expect, type Page } from '@playwright/test';

const now = new Date('2026-10-21T03:00:00Z');
const quote = (ticker: string, price: number) => ({chart: {error: null, result: [{meta: {
  symbol: ticker, currency: ticker === 'KRW=X' || ticker.endsWith('.KS') ? 'KRW' : 'USD',
  regularMarketPrice: price, regularMarketTime: Math.floor(now.getTime() / 1000),
}}]}});

async function enterInvestments(page: Page) {
  if (page.viewportSize()!.width < 768) await page.getByRole('navigation', {name: '하단 탭'}).getByRole('button', {name: '투자', exact: true}).click();
  else await page.getByRole('navigation', {name: '메인 메뉴'}).getByRole('button', {name: /^투자/}).click();
}
async function addStock(page: Page, search: string, principal: string, quantity: string) {
  await page.getByRole('button', {name: '종목 추가', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '투자 종목 추가'});
  await dialog.getByRole('combobox', {name: '종목 검색'}).fill(search);
  await dialog.getByRole('combobox', {name: '종목 검색'}).press('Enter');
  await dialog.getByLabel('매수 원금', {exact: false}).fill(principal);
  await dialog.getByLabel('보유 수량 (주)').fill(quantity);
  await dialog.getByRole('button', {name: '저장하기', exact: true}).click();
  await expect(dialog).not.toBeVisible();
}
const holdings = (page: Page) => page.getByRole('table').getByRole('rowgroup').last();

test('combined KRW summary, market tabs, compact table, quotes and failure retention', async ({page}, testInfo) => {
  await page.clock.setFixedTime(now);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let apple = 220, samsung = 55000, failApple = false;
  await page.route(/\/api\/index\?action=finance-quote&ticker=/, route => {
    const ticker = new URL(route.request().url()).searchParams.get('ticker')!;
    if (ticker === 'AAPL' && failApple) return route.fulfill({status: 503, body: 'unavailable'});
    return route.fulfill({json: quote(ticker, ticker === 'KRW=X' ? 1300 : ticker === 'AAPL' ? apple : samsung)});
  });
  await page.goto('/'); await enterInvestments(page);
  await addStock(page, '애플', '2000', '10');
  await expect(page.getByRole('tab', {name: /해외 주식/})).toHaveAttribute('aria-selected', 'true');
  const appleRow = holdings(page).getByRole('row').filter({hasText: 'Apple Inc.'});
  await expect(appleRow).toContainText('US$2,200.00');
  await expect(appleRow).toContainText('10주');
  await expect(appleRow).toContainText('US$200.00');
  await expect(appleRow.getByText('+10.00%', {exact: true})).toHaveClass(/text-rose-500/);
  await expect(page.getByRole('article').filter({hasText: '총 매수 원금'})).toContainText('₩2,600,000');
  apple = 230;
  await page.getByRole('button', {name: '시세 새로고침', exact: true}).click();
  await expect(appleRow).toContainText('US$2,300.00');
  await addStock(page, '삼성전자', '500000', '10');
  await expect(page.getByRole('tab', {name: /국내 주식/})).toHaveAttribute('aria-selected', 'true');
  await expect(holdings(page)).toContainText('삼성전자');
  await expect(holdings(page)).not.toContainText('Apple Inc.');
  await expect(page.getByRole('article').filter({hasText: '총 매수 원금'})).toContainText('₩3,100,000');
  await expect(page.getByRole('article').filter({hasText: '현재 총 평가금액'})).toContainText('₩3,540,000');
  await page.getByRole('tab', {name: /해외 주식/}).click();
  await expect(holdings(page)).toContainText('US$2,300.00');
  await expect(holdings(page)).not.toContainText('삼성전자');
  failApple = true; samsung = 45000;
  await page.getByRole('button', {name: '시세 새로고침', exact: true}).click();
  await expect(page.getByText('1개 종목의 시세를 갱신하지 못했어요. 저장된 평가금액을 유지합니다.')).toBeVisible();
  await expect(appleRow).toContainText('US$2,300.00');
  await appleRow.getByRole('button', {name: 'Apple Inc. 상세 보기'}).click();
  const detail = page.getByRole('dialog', {name: '종목 상세'});
  await expect(detail).toContainText('시세 갱신에 실패');
  await expect(detail).toContainText('US$230.00');
  await detail.getByRole('button', {name: '닫기'}).click();
  await expect(appleRow.getByRole('button', {name: 'Apple Inc. 상세 보기'})).toBeFocused();
  await page.getByRole('tab', {name: /국내 주식/}).click();
  await expect(holdings(page).getByText('-10.00%', {exact: true})).toHaveClass(/text-blue-500/);
  await expect(page.getByRole('article').filter({hasText: '현재 총 평가금액'})).toContainText('₩3,440,000');
  if (page.viewportSize()!.width < 768) {
    const scrollRegion = page.getByRole('region', {name: '국내 보유 종목 표 가로 스크롤'});
    const firstColumnX = await scrollRegion.locator('tbody th').first().evaluate(element => element.getBoundingClientRect().x);
    await expect(page.getByRole('button', {name: '표 왼쪽으로 이동'})).toBeDisabled();
    await page.getByRole('button', {name: '표 오른쪽으로 이동'}).click();
    await expect.poll(() => scrollRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    const movedColumnX = await scrollRegion.locator('tbody th').first().evaluate(element => element.getBoundingClientRect().x);
    expect(Math.abs(firstColumnX - movedColumnX)).toBeLessThan(2);
  } else await expect(page.getByRole('button', {name: '표 오른쪽으로 이동'})).toHaveCount(0);
  await page.getByRole('button', {name: '계산 기준'}).click();
  await expect(page.getByRole('dialog', {name: '계산 기준'})).toContainText('USD/KRW');
  await page.getByRole('dialog', {name: '계산 기준'}).press('Escape');
  await expect(page.getByRole('dialog', {name: '계산 기준'})).not.toBeVisible();
  await page.screenshot({path: testInfo.outputPath('investments.png'), fullPage: true, animations: 'disabled'});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload(); await enterInvestments(page);
  await page.getByRole('tab', {name: /해외 주식/}).click();
  await expect(holdings(page)).toContainText('US$2,300.00');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rich-grandma-tycoon-v1')!).state.investments.length)).toBe(2);
  expect(errors).toEqual([]);
});

test('previous month popup and holding details preserve historic snapshot', async ({page}) => {
  await page.clock.setFixedTime(now);
  await page.addInitScript(() => localStorage.setItem('rich-grandma-tycoon-v1', JSON.stringify({version: 1, state: {investments: [{
    invId: 'prev', yearMonth: '2026-09', tickerName: 'Apple Inc.', ticker: 'AAPL', currency: 'USD', quantity: 10,
    purchasePrice: 200, investedPrincipal: 2000, currentValuation: 2100, lastPrice: 210,
    quoteTime: '2026-09-30T20:00:00Z', fetchedAt: '2026-09-30T21:00:00Z', valuationSource: 'market',
  }]}})));
  await page.route(/\/api\/index\?action=finance-quote&ticker=/, route => {
    const ticker = new URL(route.request().url()).searchParams.get('ticker')!;
    return route.fulfill({json: quote(ticker, ticker === 'KRW=X' ? 1300 : 220)});
  });
  await page.goto('/'); await enterInvestments(page);
  await expect(page.getByRole('article').filter({hasText: '현재 총 평가금액'})).toContainText('₩2,860,000');
  await expect(page.getByRole('article').filter({hasText: '총 누적 수익률'})).toContainText('+5.00%p');
  await page.getByRole('tab', {name: /해외 주식/}).click();
  await holdings(page).getByRole('button', {name: 'Apple Inc. 상세 보기'}).click();
  await expect(page.getByRole('dialog', {name: '종목 상세'})).toContainText('+5.00%p');
  await page.getByRole('dialog', {name: '종목 상세'}).getByRole('button', {name: '닫기'}).click();
  await page.getByRole('button', {name: '전월 상세'}).click();
  await expect(page.getByRole('dialog', {name: '전월 비교 상세'})).toContainText('₩2,730,000');
  await page.getByRole('dialog', {name: '전월 비교 상세'}).getByRole('button', {name: '닫기'}).click();
  await page.getByLabel('투자 조회 월').fill('2026-09');
  await expect(page.getByRole('button', {name: '시세 새로고침', exact: true})).toBeDisabled();
  await expect(holdings(page)).toContainText('US$2,100.00');
  await holdings(page).getByRole('button', {name: 'Apple Inc. 상세 보기'}).click();
  await expect(page.getByRole('dialog', {name: '종목 상세'}).getByRole('button', {name: '종목 수정'})).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rich-grandma-tycoon-v1')!).state.investments.find((i: {yearMonth: string}) => i.yearMonth === '2026-09').currentValuation)).toBe(2100);
});

test('exchange rate recovers automatically after temporary failure', async ({page}) => {
  await page.clock.setFixedTime(now);
  await page.addInitScript(() => localStorage.setItem('rich-grandma-tycoon-v1', JSON.stringify({version: 1, state: {investments: [{
    invId: 'usd', yearMonth: '2026-10', tickerName: 'Apple Inc.', ticker: 'AAPL', currency: 'USD', quantity: 10,
    purchasePrice: 200, investedPrincipal: 2000, currentValuation: 2100, lastPrice: 210,
    quoteTime: '2026-10-20T20:00:00Z', fetchedAt: '2026-10-20T21:00:00Z', valuationSource: 'market',
  }]}})));
  let fxRequests = 0;
  await page.route(/\/api\/index\?action=finance-quote&ticker=/, route => {
    const ticker = new URL(route.request().url()).searchParams.get('ticker')!;
    if (ticker === 'KRW=X' && ++fxRequests === 1) return route.fulfill({status: 502, body: 'temporarily unavailable'});
    return route.fulfill({json: quote(ticker, ticker === 'KRW=X' ? 1300 : 210)});
  });
  await page.goto('/'); await enterInvestments(page);
  await expect(page.getByText('적용 환율 1 USD =', {exact: false})).toBeVisible();
  await expect(page.getByRole('article').filter({hasText: '총 매수 원금'})).toContainText('₩2,600,000');
  expect(fxRequests).toBe(2);
});

test('unpriced holdings keep entered principal until quotes recover', async ({page}) => {
  await page.clock.setFixedTime(now);
  await page.route(/\/api\/index\?action=finance-quote&ticker=/, route => route.fulfill({status: 503, body: 'unavailable'}));
  await page.goto('/'); await enterInvestments(page); await addStock(page, '애플', '2000', '10');
  await expect(holdings(page)).toContainText('시세 미확인');
  await expect(page.getByRole('article').filter({hasText: '총 누적 수익률'})).toContainText('—');
  await expect(page.getByText('환율을 조회하지 못해 원화 합계를 표시할 수 없어요.')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rich-grandma-tycoon-v1')!).state.investments[0].currentValuation)).toBe(2000);
  await page.unroute(/\/api\/index\?action=finance-quote&ticker=/);
  await page.route(/\/api\/index\?action=finance-quote&ticker=/, route => {
    const ticker = new URL(route.request().url()).searchParams.get('ticker')!;
    return route.fulfill({json: quote(ticker, ticker === 'KRW=X' ? 1300 : 210)});
  });
  await page.getByRole('button', {name: '환율 다시 조회'}).click();
  await expect(page.getByRole('article').filter({hasText: '총 매수 원금'})).toContainText('₩2,600,000');
  await page.getByRole('button', {name: '시세 새로고침', exact: true}).click();
  await expect(holdings(page)).toContainText('+5.00%');
  await expect(page.getByRole('article').filter({hasText: '현재 총 평가금액'})).toContainText('₩2,730,000');
  await expect(holdings(page)).not.toContainText('시세 미확인');
});

test('more than ten holdings paginate without changing the combined total', async ({page}) => {
  await page.clock.setFixedTime(now);
  await page.addInitScript(() => localStorage.setItem('rich-grandma-tycoon-v1', JSON.stringify({version: 1, state: {investments: Array.from({length: 11}, (_, index) => ({
    invId: `stock-${index}`, yearMonth: '2026-10', tickerName: `국내 종목 ${index + 1}`, ticker: `${String(index + 1).padStart(6, '0')}.KS`,
    currency: 'KRW', quantity: 1, purchasePrice: 10000, investedPrincipal: 10000, currentValuation: 12000, lastPrice: 12000,
    quoteTime: '2026-10-20T20:00:00Z', fetchedAt: '2026-10-20T21:00:00Z', valuationSource: 'market',
  }))}})));
  await page.route(/\/api\/index\?action=finance-quote&ticker=/, route => route.fulfill({status: 503, body: 'unavailable'}));
  await page.goto('/'); await enterInvestments(page);
  await expect(holdings(page).getByRole('row')).toHaveCount(10);
  await expect(page.getByRole('article').filter({hasText: '총 매수 원금'})).toContainText('₩110,000');
  await page.getByRole('button', {name: '다음', exact: true}).click();
  await expect(holdings(page).getByRole('row')).toHaveCount(1);
  await expect(page.getByRole('article').filter({hasText: '총 매수 원금'})).toContainText('₩110,000');
});

test('narrow screen keeps long names, large values and fractional shares usable', async ({page}) => {
  await page.setViewportSize({width: 320, height: 700});
  await page.clock.setFixedTime(now);
  const name = '매우 긴 국내 상장 미국 반도체 지수 추종 종목';
  await page.addInitScript(name => localStorage.setItem('rich-grandma-tycoon-v1', JSON.stringify({version: 1, state: {investments: [{
    invId: 'long-name', yearMonth: '2026-10', tickerName: name, ticker: '123456.KS', currency: 'KRW',
    quantity: 0.125, purchasePrice: 800000000000, investedPrincipal: 100000000000,
    currentValuation: 120000000000, lastPrice: 960000000000,
    quoteTime: '2026-10-20T20:00:00Z', fetchedAt: '2026-10-20T21:00:00Z', valuationSource: 'market',
  }]}})), name);
  await page.route(/\/api\/index\?action=finance-quote&ticker=/, route => route.fulfill({status: 503, body: 'unavailable'}));
  await page.goto('/'); await enterInvestments(page);
  const scrollRegion = page.getByRole('region', {name: '국내 보유 종목 표 가로 스크롤'});
  await expect(holdings(page)).toContainText('0.125주');
  await expect(holdings(page)).toContainText('+20.00%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', {name: '표 오른쪽으로 이동'})).toBeEnabled();
  await page.getByRole('button', {name: '표 오른쪽으로 이동'}).click();
  await expect.poll(() => scrollRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await holdings(page).getByRole('button', {name: `${name} 상세 보기`}).click();
  const detail = page.getByRole('dialog', {name: '종목 상세'});
  await expect(detail).toContainText(name);
  await expect(detail).toContainText('₩120,000,000,000');
});
