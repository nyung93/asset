import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {setDatabaseForTests} from './db';
import {handleRequest} from './handler';
import {ensureAdminPassword} from './adminBootstrap';
import {encryptField,hashPassword,tokenHash,usernameLookup,verifyPassword} from './security';

type Saved = Record<string,unknown>;
class MemoryFirestore {
  rows = new Map<string,Saved>();
  collection(name:string) {
    const rows=this.rows;
    return {
      doc(id:string) {
        const key=`${name}/${id}`;
        return {
          key,
          async get() {const data=rows.get(key);return {exists:!!data,data:()=>data ? structuredClone(data) : undefined};},
          async create(value:Saved) {if(rows.has(key)) throw Object.assign(new Error('Already exists'),{code:6});rows.set(key,structuredClone(value));},
          async set(value:Saved) {rows.set(key,structuredClone(value));},
          async update(value:Saved) {const prior=rows.get(key);if(!prior) throw new Error('Missing document');rows.set(key,{...prior,...structuredClone(value)});},
          async delete() {rows.delete(key);},
        };
      },
      async get() {return {docs:[...rows].filter(([key])=>key.startsWith(`${name}/`)).map(([key,value])=>({id:key.slice(name.length+1),data:()=>structuredClone(value)}))};},
      where(field:string,operator:string,value:unknown) {
        assert.equal(operator,'==');
        return {async get() {return {docs:[...rows].filter(([key,row])=>key.startsWith(`${name}/`) && row[field]===value).map(([key])=>({ref:{key}}))};}};
      },
    };
  }
  batch() {
    const deletes:string[]=[];
    return {delete:(ref:{key:string})=>{deletes.push(ref.key);},commit:async()=>{deletes.forEach(key=>this.rows.delete(key));}};
  }
  async runTransaction<T>(run:(transaction:{get:(ref:ReturnType<ReturnType<MemoryFirestore['collection']>['doc']>)=>ReturnType<ReturnType<ReturnType<MemoryFirestore['collection']>['doc']>['get']>;
    create:(ref:{key:string},value:Saved)=>void;set:(ref:{key:string},value:Saved)=>void;update:(ref:{key:string},value:Saved)=>void;delete:(ref:{key:string})=>void})=>Promise<T>):Promise<T> {
    const writes:Array<()=>void>=[];
    const result=await run({
      get:ref=>ref.get(),
      create:(ref,value)=>writes.push(()=>{if(this.rows.has(ref.key)) throw Object.assign(new Error('Already exists'),{code:6});this.rows.set(ref.key,structuredClone(value));}),
      set:(ref,value)=>writes.push(()=>this.rows.set(ref.key,structuredClone(value))),
      update:(ref,value)=>writes.push(()=>{const prior=this.rows.get(ref.key);if(!prior) throw new Error('Missing document');this.rows.set(ref.key,{...prior,...structuredClone(value)});}),
      delete:ref=>writes.push(()=>{this.rows.delete(ref.key);}),
    });
    // This fake runs requests sequentially; Firestore handles concurrent retries in production.
    writes.forEach(write=>write());
    return result;
  }
}

const origin='https://example.com';
function request(action:string,method:'GET'|'POST'='GET',input?:object,cookie?:string,userId?:string) {
  const query=userId && method==='GET' ? `&userId=${encodeURIComponent(userId)}` : '';
  return new Request(`${origin}/api/index?action=${action}${query}`,{method,headers:{
    ...(method==='POST' ? {origin,'content-type':'application/json'} : {}),
    ...(cookie ? {cookie} : {}),
  },body:method==='POST' ? JSON.stringify({...input,...(userId?{userId}:{})}) : undefined});
}
function sessionCookie(response:Response) {
  return response.headers.getSetCookie().find(cookie=>cookie.startsWith('rgt_session='))!.split(';')[0];
}
function rememberCookie(response:Response) {
  return response.headers.getSetCookie().find(cookie=>cookie.startsWith('rgt_remember='))!.split(';')[0];
}

test('Firestore API keeps encrypted accounts, sessions, versioned data and admin access separate',async()=>{
  const originalFetch=globalThis.fetch;
  const oldGeminiKey=process.env.GEMINI_API_KEY;
  process.env.NODE_ENV='test';
  process.env.FIREBASE_PROJECT_ID='test-project';
  process.env.FIREBASE_CLIENT_EMAIL='test@example.com';
  process.env.FIREBASE_PRIVATE_KEY='test-key';
  process.env.FIELD_ENCRYPTION_KEY=randomBytes(32).toString('base64');
  const db=new MemoryFirestore();
  setDatabaseForTests(db as unknown as Firestore);
  try {
    const input={name:'민영',birthDate:'1995-05-12',phone:'010-1234-5678',username:'test1',password:'Test!1234'};
    const registered=await handleRequest(request('register','POST',input));
    assert.equal(registered.status,201);
    assert.doesNotMatch(registered.headers.getSetCookie()[0],/Max-Age=\d{2,}/);
    const cookie=sessionCookie(registered);
    const user=(await registered.json()).user;
    assert.equal(user.username,'test1');
    const stored=db.rows.get(`users/${user.id}`)!;
    assert.notEqual(stored.birth_date_cipher,input.birthDate);
    assert.notEqual(stored.phone_cipher,'01012345678');
    assert.notEqual(stored.password_hash,input.password);
    assert.equal(await handleRequest(request('register','POST',input)).then(res=>res.status),409);
    assert.equal(await handleRequest(request('status','GET',undefined,cookie)).then(res=>res.status),200);

    const initial=await handleRequest(request('data','GET',undefined,cookie,user.id));
    assert.deepEqual(await initial.json(),{data:null,version:0});
    const data={character:{totalXp:10},budgetCodes:[],transactions:[{type:'EXPENSE',amount:15000}],goals:[],investments:[],xpLogs:[],
      recurringExpenses:[{id:'rent',name:'월세',day:31,amount:500000,codeId:'HO01',startMonth:'2026-10'}],recurringExpensePayments:[]};
    const first=await handleRequest(request('data','POST',{data,version:0},cookie,user.id));
    assert.deepEqual(await first.json(),{version:1});
    assert.equal(await handleRequest(request('data','POST',{data,version:0},cookie,user.id)).then(res=>res.status),409);
    assert.deepEqual((await handleRequest(request('data','GET',undefined,cookie,user.id)).then(res=>res.json())).data,data);
    assert.notEqual(db.rows.get(`app_data/${user.id}`)?.data_cipher,JSON.stringify(data));

    const profile=await handleRequest(request('profile','POST',{birthDate:'1995-06-01',phone:'010-9876-5432'},cookie,user.id));
    assert.equal((await profile.json()).user.phone,'01098765432');
    assert.equal(await handleRequest(request('login','POST',{username:'test1',password:'wrong'})).then(res=>res.status),401);
    const login=await handleRequest(request('login','POST',{username:'test1',password:input.password}));
    assert.equal(login.status,200);
    assert.doesNotMatch(login.headers.getSetCookie()[0],/Max-Age=\d{2,}/);
    process.env.GEMINI_API_KEY='integration-test-key';
    const summary={yearMonth:'2026-10',totalBudget:100000,totalExpenses:120000,
      topCategory:{categoryName:'식비',codeId:'FO01',amount:120000},investmentReturns:[]};
    assert.equal(await handleRequest(request('ai-advice','POST',{summary})).then(res=>res.status),401);
    let aiCalls=0;
    globalThis.fetch=async (_url,init)=>{
      aiCalls++;
      assert.equal(new Headers(init?.headers).get('x-goog-api-key'),'integration-test-key');
      assert.doesNotMatch(String(init?.body),/personal memo/);
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'👵🏻 총평이야\n💸 식비를 줄여보렴\n📈 투자도 살펴보자'}]}}]});
    };
    const advice=await handleRequest(request('ai-advice','POST',{summary},sessionCookie(login)));
    assert.equal(advice.status,200);
    assert.match((await advice.json()).text,/식비를 줄여보렴/);
    assert.equal(aiCalls,1);
    assert.equal(await handleRequest(request('ai-receipt','POST',{imageBase64:'invalid'},sessionCookie(login))).then(res=>res.status),400);
    const imageBase64=Buffer.from([0xff,0xd8,0xff,...new Array(40).fill(0)]).toString('base64');
    globalThis.fetch=async ()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"amount":12500,"memo":"동네 식당","txDate":"2026-10-22","recommendedCodeId":"FO01"}'}]}}]});
    const receipt=await handleRequest(request('ai-receipt','POST',{imageBase64},sessionCookie(login)));
    assert.deepEqual(await receipt.json(),{status:'SUCCESS',data:{amount:12500,txDate:'2026-10-22',memo:'동네 식당',recommendedCodeId:'FO01'}});
    assert.equal(await handleRequest(request('logout','POST',{},cookie)).then(res=>res.status),200);
    assert.equal(await handleRequest(request('status','GET',undefined,cookie)).then(res=>res.status),401);

    const adminId=randomUUID(),adminName='admin',adminLookup=usernameLookup(adminName);
    db.rows.set(`users/${adminId}`,{id:adminId,name:'관리자',username_lookup:adminLookup,
      username_cipher:encryptField(adminName),birth_date_cipher:encryptField('2000-01-01'),
      phone_cipher:encryptField('01000000001'),password_hash:await hashPassword('Fixture!912'),
      role:'ADMIN',created_at:new Date().toISOString(),last_login_at:null});
    db.rows.set(`usernames/${adminLookup}`,{user_id:adminId});
    const adminLogin=await handleRequest(request('login','POST',{username:'admin',password:'Fixture!912'}));
    assert.equal(adminLogin.status,200);
    const adminRememberAttempt=await handleRequest(request('login','POST',{username:'admin',password:'Fixture!912',remember:true}));
    assert.equal((await adminRememberAttempt.json()).remembered,false);
    assert.equal(rememberCookie(adminRememberAttempt),'rgt_remember=');
    const adminCookie=sessionCookie(adminLogin);
    const dashboard=await handleRequest(request('dashboard','GET',undefined,adminCookie));
    assert.equal((await dashboard.json()).users.total_users,2);
    assert.equal(await handleRequest(request('dashboard','GET',undefined,sessionCookie(login))).then(res=>res.status),403);
    const members=await handleRequest(request('members','GET',undefined,adminCookie));
    assert.equal((await members.json()).members.length,2);
    const impersonation=await handleRequest(request('impersonate','POST',{userId:user.id},adminCookie));
    assert.equal(impersonation.status,200);
    const impersonationCookie=impersonation.headers.getSetCookie().find(item=>item.startsWith('rgt_impersonation='))!.split(';')[0];
    const both=`${adminCookie}; ${impersonationCookie}`;
    assert.equal((await handleRequest(request('status','GET',undefined,both)).then(res=>res.json())).user.id,user.id);
    assert.equal(await handleRequest(request('dashboard','GET',undefined,both)).then(res=>res.status),403);
    assert.equal(await handleRequest(request('reset-member-xp','POST',{userId:user.id,confirm:'RESET_XP'},both)).then(res=>res.status),403);
    assert.equal((await handleRequest(request('stop-impersonation','POST',{},both)).then(res=>res.json())).user.id,adminId);
    const other=await handleRequest(request('register','POST',{
      name:'다른 회원',birthDate:'1996-06-17',phone:'010-2222-3333',username:'otheruser',password:'Other!1234',
    }));
    assert.equal(other.status,201);
    const otherId=(await other.clone().json()).user.id;
    assert.deepEqual(await handleRequest(request('data','GET',undefined,sessionCookie(other),otherId)).then(res=>res.json()),{data:null,version:0});
    assert.deepEqual((await handleRequest(request('data','GET',undefined,sessionCookie(login),user.id)).then(res=>res.json())).data,data);
    assert.equal(await handleRequest(request('data','GET',undefined,sessionCookie(other),user.id)).then(res=>res.status),409);
    assert.equal(await handleRequest(request('data','POST',{data,version:0},sessionCookie(other),user.id)).then(res=>res.status),409);
    assert.equal(await handleRequest(request('profile','POST',{birthDate:'1995-06-01',phone:'010-9876-5432'},sessionCookie(other),user.id)).then(res=>res.status),409);
    const otherData={...data,transactions:[{type:'SAVING',amount:9999}],character:{totalXp:99}};
    assert.equal(await handleRequest(request('data','POST',{data:otherData,version:0},sessionCookie(other),otherId)).then(res=>res.status),200);
    assert.deepEqual((await handleRequest(request('data','GET',undefined,sessionCookie(other),otherId)).then(res=>res.json())).data,otherData);
    assert.deepEqual((await handleRequest(request('data','GET',undefined,sessionCookie(login),user.id)).then(res=>res.json())).data,data);
    const scoreMember=(await handleRequest(request('members','GET',undefined,adminCookie)).then(res=>res.json())).members.find((item:{id:string})=>item.id===otherId);
    assert.equal(scoreMember.totalXp,99);
    assert.equal(scoreMember.level,1);
    assert.equal(scoreMember.birthDate,'1996-06-17');
    assert.equal(scoreMember.phone,'01022223333');
    assert.equal(await handleRequest(request('reset-member-xp','POST',{userId:otherId,confirm:'RESET_XP'},sessionCookie(other))).then(res=>res.status),403);
    assert.equal(await handleRequest(request('reset-member-xp','POST',{userId:otherId},adminCookie)).then(res=>res.status),400);
    assert.equal((await handleRequest(request('reset-member-xp','POST',{userId:otherId,confirm:'RESET_XP'},adminCookie)).then(res=>res.json())).level,1);
    const resetData=await handleRequest(request('data','GET',undefined,sessionCookie(other),otherId)).then(res=>res.json());
    assert.equal(resetData.version,2);
    assert.equal(resetData.data.character.totalXp,0);
    assert.equal(resetData.data.character.houseStage,1);
    assert.deepEqual(resetData.data.xpLogs,[]);
    assert.deepEqual(resetData.data.transactions,otherData.transactions);
    assert.equal(db.rows.get(`app_data/${otherId}`)?.total_xp,0);
    assert.equal(await handleRequest(request('data','POST',{data:otherData,version:1},sessionCookie(other),otherId)).then(res=>res.status),409);
    assert.equal([...db.rows.values()].some(row=>row.action==='XP_RESET' && row.target_user_id===otherId),true);
    const remembered=await handleRequest(request('login','POST',{username:'test1',password:input.password,remember:true}));
    assert.equal((await remembered.clone().json()).remembered,true);
    assert.match(remembered.headers.getSetCookie().find(item=>item.startsWith('rgt_remember='))!,/Max-Age=604800/);
    const rememberedSession=sessionCookie(remembered),oldRemember=rememberCookie(remembered);
    const rememberedRow=db.rows.get(`sessions/${tokenHash(rememberedSession.split('=')[1])}`)!;
    rememberedRow.last_seen_at=new Date(Date.now()-16*60_000).toISOString();
    const restored=await handleRequest(request('status','GET',undefined,`${rememberedSession}; ${oldRemember}`));
    assert.equal(restored.status,200);
    assert.equal((await restored.clone().json()).user.id,user.id);
    assert.notEqual(rememberCookie(restored),oldRemember);
    assert.equal(db.rows.has(`remember_tokens/${tokenHash(oldRemember.split('=')[1])}`),false);
    const restoredCookies=`${sessionCookie(restored)}; ${rememberCookie(restored)}`;
    assert.deepEqual((await handleRequest(request('data','GET',undefined,restoredCookies,user.id)).then(res=>res.json())).data,data);
    assert.equal(await handleRequest(request('logout','POST',{},restoredCookies)).then(res=>res.status),200);
    assert.equal(await handleRequest(request('status','GET',undefined,rememberCookie(restored))).then(res=>res.status),401);
    const rememberedAgain=await handleRequest(request('login','POST',{username:'test1',password:input.password,remember:true}));
    const newAccount=await handleRequest(request('register','POST',{
      name:'새 회원',birthDate:'1997-07-18',phone:'010-3333-4444',username:'newmember',password:'New!12345',
    },rememberCookie(rememberedAgain)));
    assert.equal(newAccount.status,201);
    assert.equal(await handleRequest(request('status','GET',undefined,rememberCookie(rememberedAgain))).then(res=>res.status),401);
    const adminSessionId=tokenHash(adminCookie.split('=')[1]);
    const savedAdminSession=db.rows.get(`sessions/${adminSessionId}`)!;
    savedAdminSession.last_seen_at=new Date(Date.now()-16*60_000).toISOString();
    assert.equal(await handleRequest(request('status','GET',undefined,adminCookie)).then(res=>res.status),401);
    assert.equal(db.rows.has(`sessions/${adminSessionId}`),false);
  } finally {
    globalThis.fetch=originalFetch;
    if(oldGeminiKey===undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY=oldGeminiKey;
    setDatabaseForTests(undefined);
  }
});

test('admin bootstrap creates or rotates only an administrator and revokes old sessions',async()=>{
  process.env.NODE_ENV='test';
  process.env.FIREBASE_PROJECT_ID='test-project';
  process.env.FIREBASE_CLIENT_EMAIL='test@example.com';
  process.env.FIREBASE_PRIVATE_KEY='test-key';
  process.env.FIELD_ENCRYPTION_KEY=randomBytes(32).toString('base64');
  const db=new MemoryFirestore();
  setDatabaseForTests(db as unknown as Firestore);
  try {
    process.env.ADMIN_BOOTSTRAP_PASSWORD='Initial!123';
    const check=(secret:string)=>new Request(`${origin}/api/index?action=admin-bootstrap-check`,{method:'POST',headers:{origin,'x-admin-bootstrap-secret':secret}});
    assert.equal(await handleRequest(check('wrong')).then(res=>res.status),403);
    assert.deepEqual(await handleRequest(check('Initial!123')).then(res=>res.json()),{status:'created'});
    assert.deepEqual(await handleRequest(check('Initial!123')).then(res=>res.json()),{status:'unchanged'});
    assert.equal(await handleRequest(request('status')).then(res=>res.status),401);
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
    assert.equal(await handleRequest(check('Initial!123')).then(res=>res.status),404);
    assert.equal(await ensureAdminPassword('Initial!123'),'unchanged');
    const lookup=usernameLookup('admin');
    const id=db.rows.get(`usernames/${lookup}`)?.user_id as string;
    assert.equal(db.rows.get(`users/${id}`)?.role,'ADMIN');
    assert.equal(await verifyPassword('Initial!123',String(db.rows.get(`users/${id}`)?.password_hash)),true);
    const login=await handleRequest(request('login','POST',{username:'admin',password:'Initial!123'}));
    assert.equal(login.status,200);
    const oldCookie=sessionCookie(login);
    assert.equal(await ensureAdminPassword('Rotated!456'),'updated');
    assert.equal(await verifyPassword('Rotated!456',String(db.rows.get(`users/${id}`)?.password_hash)),true);
    assert.equal(await handleRequest(request('status','GET',undefined,oldCookie)).then(res=>res.status),401);
    assert.equal(await handleRequest(request('login','POST',{username:'admin',password:'Initial!123'})).then(res=>res.status),401);
    assert.equal(await handleRequest(request('login','POST',{username:'admin',password:'Rotated!456'})).then(res=>res.status),200);
  } finally {delete process.env.ADMIN_BOOTSTRAP_PASSWORD;setDatabaseForTests(undefined);}
});
