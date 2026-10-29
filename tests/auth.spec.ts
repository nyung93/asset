import {test,expect,type Page} from '@playwright/test';
import {loadEnv} from 'vite';

const person={id:'00000000-0000-4000-8000-000000000001',name:'민영',username:'minyoung',birthDate:'1994-05-15',phone:'01012345678',role:'USER',createdAt:'2026-10-01T00:00:00.000Z',lastLoginAt:'2026-10-26T00:00:00.000Z'};
const admin={...person,id:'00000000-0000-4000-8000-000000000002',name:'관리자',username:'grandma_admin',role:'ADMIN'};
async function expectAppNavigation(page:Page) {
  if (page.viewportSize()!.width < 768) {
    await expect(page.getByRole('navigation',{name:'하단 탭'})).toBeVisible();
    await expect(page.locator('.sidebar')).toBeHidden();
  } else {
    await expect(page.getByRole('navigation',{name:'메인 메뉴'})).toBeVisible();
    await expect(page.locator('.bottom-nav')).toBeHidden();
  }
}

async function mockApi(page:Page,initial:'guest'|'user'|'admin') {
  let current=initial;
  let remembered=false;
  const actions:string[]=[];
  const saves:unknown[]=[];
  let savedData:unknown=null;
  let version=0;
  await page.context().route('**/api/index?**',async route=>{
    const request=route.request();
    const action=new URL(request.url()).searchParams.get('action');
    if(action) actions.push(action);
    const payload=request.postDataJSON?.() ?? {};
    const respond=(json:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(json)});
    if(action==='status') return current==='guest'?respond({error:'로그인이 필요해요.',code:'unauthorized'},401):respond({user:current==='admin'?admin:person,impersonating:false,remembered});
    if(action==='login') {current=initial==='admin'?'admin':'user';remembered=payload.remember===true && current==='user';return respond({user:current==='admin'?admin:person,impersonating:false,remembered});}
    if(action==='register') {current='user';remembered=false;return respond({user:person,impersonating:false,remembered});}
    if(action==='data'&&request.method()==='GET') return respond({data:savedData,version});
    if(action==='data'&&request.method()==='POST') {saves.push(payload);savedData=payload.data;version++;return respond({version});}
    if(action==='profile') return respond({user:{...person,birthDate:payload.birthDate,phone:payload.phone},impersonating:false,remembered});
    if(action==='dashboard') return respond({users:{total_users:12,new_users_this_month:3,active_users_30d:8},data:{transaction_count:'34',total_expense:'100000',total_saving:'50000',total_xp:'450'}});
    if(action==='members') return respond({members:[{id:person.id,name:person.name,username:person.username,role:'USER',createdAt:person.createdAt,lastLoginAt:person.lastLoginAt}],hasMore:false});
    if(action==='impersonate') {current='user';return respond({user:person,impersonating:true,adminName:admin.name});}
    if(action==='stop-impersonation') {current='admin';return respond({user:admin,impersonating:false});}
    if(action==='logout') {current='guest';remembered=false;return respond({ok:true});}
    return respond({error:'Unknown action'},404);
  });
  return {saves,actions};
}

async function openAuthenticated(page:Page,role:'user'|'admin') {
  const api=await mockApi(page,role);
  await page.goto('/');
  await page.getByLabel('아이디',{exact:true}).fill(role==='admin'?'grandma_admin':'minyoung');
  await page.getByLabel('비밀번호',{exact:true}).fill('Abcdefg!');
  await page.getByRole('button',{name:'로그인하고 시작하기'}).click();
  await expectAppNavigation(page);
  return api;
}

test('opening a link with only an old cookie requires a fresh login',async({page})=>{
  const api=await mockApi(page,'user');
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'내 마이룸에 들어가기'})).toBeVisible();
  expect(api.actions).toContain('logout');
  expect(api.actions).not.toContain('data');
  await page.getByLabel('아이디',{exact:true}).fill('minyoung');
  await page.getByLabel('비밀번호',{exact:true}).fill('Abcdefg!');
  await page.getByRole('button',{name:'로그인하고 시작하기'}).click();
  await expectAppNavigation(page);
  await page.reload();
  await expectAppNavigation(page);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'내 마이룸에 들어가기'})).toBeVisible();
});

test('saved ID and opted-in automatic login survive a new visit, then logout revokes them',async({page})=>{
  const api=await mockApi(page,'guest');
  await page.goto('/');
  await expect(page.getByRole('checkbox',{name:'아이디 저장'})).not.toBeChecked();
  await expect(page.getByRole('checkbox',{name:'7일간 자동 로그인'})).not.toBeChecked();
  await page.getByLabel('아이디',{exact:true}).fill('minyoung');
  await page.getByLabel('비밀번호',{exact:true}).fill('Abcdefg!');
  await page.getByRole('checkbox',{name:'아이디 저장'}).check();
  await page.getByRole('checkbox',{name:'7일간 자동 로그인'}).check();
  await page.getByRole('button',{name:'로그인하고 시작하기'}).click();
  await expectAppNavigation(page);
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('rgt-')).map(key=>[key,localStorage.getItem(key)]))).toEqual([['rgt-saved-username-v1','minyoung']]);
  await page.goto('/');
  await expectAppNavigation(page);
  const second=await page.context().newPage();
  await second.goto('/');
  await expectAppNavigation(second);
  expect(api.actions.filter(action=>action==='logout')).toHaveLength(0);
  await page.getByRole('button',{name:/마이페이지/}).first().click();
  await page.getByRole('button',{name:'로그아웃',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'내 마이룸에 들어가기'})).toBeVisible();
  await expect(second.getByRole('heading',{name:'내 마이룸에 들어가기'})).toBeVisible();
  await expect(page.getByLabel('아이디',{exact:true})).toHaveValue('minyoung');
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'내 마이룸에 들어가기'})).toBeVisible();
});

test('opening the link in a second tab also closes the first tab session',async({page})=>{
  let current:'guest'|'user'='guest';
  await page.context().route('**/api/index?**',route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    const respond=(json:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(json)});
    if(action==='login') {current='user';return respond({user:person,impersonating:false});}
    if(action==='logout') {current='guest';return respond({ok:true});}
    if(action==='status') return current==='user'?respond({user:person,impersonating:false}):respond({error:'로그인이 필요해요.'},401);
    if(action==='data') return current==='user'?respond({data:null,version:0}):respond({error:'로그인이 필요해요.'},401);
    return respond({error:'Unknown action'},404);
  });
  await page.goto('/');
  await page.getByLabel('아이디',{exact:true}).fill('minyoung');
  await page.getByLabel('비밀번호',{exact:true}).fill('Abcdefg!');
  await page.getByRole('button',{name:'로그인하고 시작하기'}).click();
  await expectAppNavigation(page);
  const second=await page.context().newPage();
  await second.goto('/');
  await expect(second.getByRole('heading',{name:'내 마이룸에 들어가기'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'내 마이룸에 들어가기'})).toBeVisible();
});

test('first screen gates the app and validates signup fields',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/오늘 쓴 가계부가/})).toBeVisible();
  await expect(page.getByRole('tab',{name:'로그인'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'내 마이룸에 들어가기'})).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await page.getByRole('tab',{name:'회원가입'}).click();
  for(const label of ['이름','생년월일','휴대폰 번호','아이디','비밀번호']) await expect(page.getByLabel(label,{exact:true})).toBeVisible();
  await page.getByLabel('이름',{exact:true}).fill('민영');
  await page.getByLabel('생년월일',{exact:true}).fill('1994-05-15');
  await page.getByLabel('휴대폰 번호',{exact:true}).fill('01012345678');
  await page.getByLabel('아이디',{exact:true}).fill('minyoung');
  await page.getByLabel('비밀번호',{exact:true}).fill('lowercase!');
  await page.getByRole('button',{name:'회원가입하고 시작하기'}).click();
  await expect(page.getByRole('alert')).toContainText('대문자');
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
});

test('login explains missing account storage instead of appearing unresponsive',async({page})=>{
  const env=loadEnv('development',process.cwd(),['FIREBASE_PROJECT_ID','FIREBASE_PRIVATE_KEY','GOOGLE_APPLICATION_CREDENTIALS']);
  test.skip(!!env.FIREBASE_PROJECT_ID && !!(env.FIREBASE_PRIVATE_KEY || env.GOOGLE_APPLICATION_CREDENTIALS), 'Requires the local account API without Firebase credentials');
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Firebase 연결을 준비하고 있어요.');
  await page.getByLabel('아이디',{exact:true}).fill('test1');
  await page.getByLabel('비밀번호',{exact:true}).fill('TestPass!1');
  const login=page.getByRole('button',{name:'로그인하고 시작하기'});
  await login.click();
  await expect(page.getByRole('alert')).toContainText('Firebase 연결이 아직 완료되지 않았어요.');
  await expect(login).toBeEnabled();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
});

test('valid signup creates a session and opens the app',async({page})=>{
  await mockApi(page,'guest');await page.goto('/');
  await page.getByRole('tab',{name:'회원가입'}).click();
  await page.getByLabel('이름',{exact:true}).fill('민영');
  await page.getByLabel('생년월일',{exact:true}).fill('1994-05-15');
  await page.getByLabel('휴대폰 번호',{exact:true}).fill('01012345678');
  await page.getByLabel('아이디',{exact:true}).fill('minyoung');
  await page.getByLabel('비밀번호',{exact:true}).fill('Abcdefg!');
  await page.getByRole('button',{name:'회원가입하고 시작하기'}).click();
  await expectAppNavigation(page);
});

test('login opens account data and immutable profile fields',async({page})=>{
  await mockApi(page,'guest');await page.goto('/');
  await page.getByLabel('아이디',{exact:true}).fill('minyoung');
  await page.getByLabel('비밀번호',{exact:true}).fill('Abcdefg!');
  await page.getByRole('button',{name:'로그인하고 시작하기'}).click();
  await expectAppNavigation(page);
  await page.getByRole('button',{name:/마이페이지/}).first().click();
  await expect(page.getByRole('heading',{name:'마이페이지'})).toBeVisible();
  await expect(page.getByLabel('이름',{exact:true})).toHaveAttribute('readonly','');
  await expect(page.getByLabel('아이디',{exact:true})).toHaveAttribute('readonly','');
  await page.getByLabel('휴대폰 번호',{exact:true}).fill('01099998888');
  await page.getByRole('button',{name:'내 정보 저장'}).click();
  await expect(page.getByRole('status')).toContainText('저장했어요');
  await page.getByRole('button',{name:'로그아웃',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'내 마이룸에 들어가기'})).toBeVisible();
});

test('admin dashboard lists members and account access can be ended',async({page})=>{
  await openAuthenticated(page,'admin');
  await page.getByRole('button',{name:'관리자',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'관리자 대시보드'})).toBeVisible();
  await expect(page.getByText('전체 회원')).toBeVisible();
  await expect(page.getByRole('cell',{name:'minyoung'})).toBeVisible();
  await page.getByRole('button',{name:'계정 접속'}).click();
  await expect(page.getByText(/회원 계정을 보고 있어요/)).toBeVisible();
  await page.getByRole('button',{name:'관리자로 돌아가기'}).click();
  await expect(page.getByRole('button',{name:'관리자',exact:true}).first()).toBeVisible();
});

test('authenticated store changes are sent to the account API',async({page})=>{
  const api=await openAuthenticated(page,'user');
  await page.evaluate(async()=>{
    const {useAppStore}=await import('/src/store/index.ts');
    useAppStore.getState().saveGoal({year:2026,month:10,targetSavingAmount:50000,targetInvestReturnRate:3});
  });
  await expect.poll(()=>api.saves.length).toBe(1);
  expect((api.saves[0] as {data:{goals:Array<{targetSavingAmount:number}>}}).data.goals[0].targetSavingAmount).toBe(50000);
  await page.reload();
  await expectAppNavigation(page);
  const restored=await page.evaluate(async()=>{
    const {useAppStore}=await import('/src/store/index.ts');
    return useAppStore.getState().goals;
  });
  expect(restored).toContainEqual({year:2026,month:10,targetSavingAmount:50000,targetInvestReturnRate:3});
});

test('recurring expense due dates and monthly paid checks survive reload',async({page},testInfo)=>{
  const api=await openAuthenticated(page,'user');
  const nav=page.viewportSize()!.width<768
    ? page.getByRole('navigation',{name:'하단 탭'})
    : page.getByRole('navigation',{name:'메인 메뉴'});
  await nav.getByRole('button',{name:/목표 & 설정/}).click();
  if(page.viewportSize()!.width>=768) {
    const cards=await page.locator('.goal-card').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().width));
    expect(Math.abs(cards[0]-cards[1])).toBeLessThan(1);
  }
  await page.getByLabel('목표 및 정기 지출 조회 월').fill('2028-02');
  await page.getByRole('button',{name:'지출 추가'}).click();
  await page.getByLabel('지출 이름').fill('월세');
  await page.getByLabel('매월 납부일').fill('31');
  await page.getByLabel('예정 금액 (원)').fill('500000');
  await page.getByRole('button',{name:'저장하기',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'정기 지출'})).toBeVisible();
  await expect(page.getByText('월말 납부')).toBeVisible();
  await expect(page.getByText('500,000원').first()).toBeVisible();
  await page.locator('section[aria-labelledby="recurring-title"]').screenshot({path:testInfo.outputPath('recurring-expenses.png')});
  const paid=page.getByRole('checkbox',{name:'월세 2028-02 납부 완료'});
  await expect(paid).not.toBeChecked();
  await paid.check();
  await expect(paid).toBeChecked();
  await expect.poll(()=>(api.saves.at(-1) as {data?:{recurringExpensePayments?:unknown[]}}|undefined)?.data?.recurringExpensePayments?.length).toBe(1);
  await page.getByLabel('목표 및 정기 지출 조회 월').fill('2028-03');
  await expect(page.getByRole('checkbox',{name:'월세 2028-03 납부 완료'})).not.toBeChecked();
  await page.getByLabel('목표 및 정기 지출 조회 월').fill('2028-02');
  await expect(paid).toBeChecked();
  await page.reload();
  await expectAppNavigation(page);
  await nav.getByRole('button',{name:/목표 & 설정/}).click();
  await page.getByLabel('목표 및 정기 지출 조회 월').fill('2028-02');
  await expect(page.getByRole('checkbox',{name:'월세 2028-02 납부 완료'})).toBeChecked();
});

test('switching accounts loads only the signed-in member’s saved data',async({page})=>{
  type Key='alice'|'bob';
  let current:Key|null=null;
  const saved:Partial<Record<Key,{data:unknown;version:number}>>={};
  const users={alice:{...person,id:'00000000-0000-4000-8000-000000000011',name:'앨리스',username:'alice'},
    bob:{...person,id:'00000000-0000-4000-8000-000000000012',name:'보라',username:'bob'}};
  await page.context().route('**/api/index?**',route=>{
    const request=route.request(),action=new URL(request.url()).searchParams.get('action');
    const payload=request.postDataJSON?.() ?? {};
    const respond=(json:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(json)});
    if(action==='login') {current=payload.username as Key;return respond({user:users[current],impersonating:false,remembered:false});}
    if(action==='logout') {current=null;return respond({ok:true});}
    if(action==='status') return current?respond({user:users[current],impersonating:false,remembered:false}):respond({error:'로그인이 필요해요.'},401);
    if(action==='data' && !current) return respond({error:'로그인이 필요해요.'},401);
    if(action==='data' && current && request.method()==='GET') return respond(saved[current] ?? {data:null,version:0});
    if(action==='data' && current) {const version=(saved[current]?.version ?? 0)+1;saved[current]={data:payload.data,version};return respond({version});}
    return respond({error:'Unknown action'},404);
  });
  const signIn=async(username:Key)=>{
    await page.getByLabel('아이디',{exact:true}).fill(username);
    await page.getByLabel('비밀번호',{exact:true}).fill('Abcdefg!');
    await page.getByRole('button',{name:'로그인하고 시작하기'}).click();
    await expectAppNavigation(page);
  };
  const signOut=async()=>{
    await page.getByRole('button',{name:/마이페이지/}).first().click();
    await page.getByRole('button',{name:'로그아웃',exact:true}).last().click();
    await expect(page.getByRole('heading',{name:'내 마이룸에 들어가기'})).toBeVisible();
  };
  const goals=()=>page.evaluate(async()=>{
    const {useAppStore}=await import('/src/store/index.ts');
    return useAppStore.getState().goals;
  });
  await page.goto('/');
  await signIn('alice');
  await page.evaluate(async()=>{
    const {useAppStore}=await import('/src/store/index.ts');
    useAppStore.getState().saveGoal({year:2026,month:10,targetSavingAmount:111000,targetInvestReturnRate:1});
  });
  await expect.poll(()=>saved.alice?.version).toBe(1);
  await signOut();
  await signIn('bob');
  expect(await goals()).toEqual([]);
  await page.evaluate(async()=>{
    const {useAppStore}=await import('/src/store/index.ts');
    useAppStore.getState().saveGoal({year:2026,month:10,targetSavingAmount:222000,targetInvestReturnRate:2});
  });
  await expect.poll(()=>saved.bob?.version).toBe(1);
  await signOut();
  await signIn('alice');
  expect(await goals()).toEqual([{year:2026,month:10,targetSavingAmount:111000,targetInvestReturnRate:1}]);
});

test('My Page character choice saves to the account and follows the user across tabs and reloads',async({page},testInfo)=>{
  const api=await openAuthenticated(page,'user');
  await page.getByRole('button',{name:/마이페이지/}).first().click();
  await expect(page.getByRole('heading',{name:'캐릭터 고르기'})).toBeVisible();
  await page.getByRole('button',{name:'저축 지킴이 선택'}).click();
  await expect(page.locator('.profile svg[data-artwork]')).toHaveAttribute('data-artwork','saver');
  await page.locator('section[aria-labelledby="character-picker-title"]').screenshot({path:testInfo.outputPath('mypage-characters.png')});
  await expect.poll(()=>api.saves.length).toBe(1);
  await page.getByRole('button',{name:'핑크 스마일 선택'}).click();
  await expect.poll(()=>api.saves.length).toBe(2);
  await page.getByRole('button',{name:'마이룸으로 돌아가기'}).click();
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-artwork','pink');
  if (page.viewportSize()!.width < 768) await page.getByRole('navigation',{name:'하단 탭'}).getByRole('button',{name:'캘린더',exact:true}).click();
  else await page.getByRole('navigation',{name:'메인 메뉴'}).getByRole('button',{name:/^캘린더/}).click();
  await expect(page.locator('.main-content svg[data-artwork]')).toHaveAttribute('data-artwork','pink');
  await page.reload();
  await expect(page.locator('.profile svg[data-artwork]')).toHaveAttribute('data-artwork','pink');
});
