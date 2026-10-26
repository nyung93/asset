import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {setDatabaseForTests} from './db';
import {handleRequest} from './handler';
import {encryptField,hashPassword,usernameLookup} from './security';

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
          async update(value:Saved) {const prior=rows.get(key);if(!prior) throw new Error('Missing document');rows.set(key,{...prior,...structuredClone(value)});},
          async delete() {rows.delete(key);},
        };
      },
      async get() {return {docs:[...rows].filter(([key])=>key.startsWith(`${name}/`)).map(([,value])=>({data:()=>structuredClone(value)}))};},
    };
  }
  async runTransaction<T>(run:(transaction:{get:(ref:ReturnType<ReturnType<MemoryFirestore['collection']>['doc']>)=>ReturnType<ReturnType<ReturnType<MemoryFirestore['collection']>['doc']>['get']>;
    create:(ref:{key:string},value:Saved)=>void;set:(ref:{key:string},value:Saved)=>void;update:(ref:{key:string},value:Saved)=>void})=>Promise<T>):Promise<T> {
    const writes:Array<()=>void>=[];
    const result=await run({
      get:ref=>ref.get(),
      create:(ref,value)=>writes.push(()=>{if(this.rows.has(ref.key)) throw Object.assign(new Error('Already exists'),{code:6});this.rows.set(ref.key,structuredClone(value));}),
      set:(ref,value)=>writes.push(()=>this.rows.set(ref.key,structuredClone(value))),
      update:(ref,value)=>writes.push(()=>{const prior=this.rows.get(ref.key);if(!prior) throw new Error('Missing document');this.rows.set(ref.key,{...prior,...structuredClone(value)});}),
    });
    // This fake runs requests sequentially; Firestore handles concurrent retries in production.
    writes.forEach(write=>write());
    return result;
  }
}

const origin='https://example.com';
function request(action:string,method:'GET'|'POST'='GET',input?:object,cookie?:string) {
  return new Request(`${origin}/api/index?action=${action}`,{method,headers:{
    ...(method==='POST' ? {origin,'content-type':'application/json'} : {}),
    ...(cookie ? {cookie} : {}),
  },body:method==='POST' ? JSON.stringify(input ?? {}) : undefined});
}
function sessionCookie(response:Response) {
  return response.headers.getSetCookie().find(cookie=>cookie.startsWith('rgt_session='))!.split(';')[0];
}

test('Firestore API keeps encrypted accounts, sessions, versioned data and admin access separate',async()=>{
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
    const cookie=sessionCookie(registered);
    const user=(await registered.json()).user;
    assert.equal(user.username,'test1');
    const stored=db.rows.get(`users/${user.id}`)!;
    assert.notEqual(stored.birth_date_cipher,input.birthDate);
    assert.notEqual(stored.phone_cipher,'01012345678');
    assert.notEqual(stored.password_hash,input.password);
    assert.equal(await handleRequest(request('register','POST',input)).then(res=>res.status),409);
    assert.equal(await handleRequest(request('status','GET',undefined,cookie)).then(res=>res.status),200);

    const initial=await handleRequest(request('data','GET',undefined,cookie));
    assert.deepEqual(await initial.json(),{data:null,version:0});
    const data={character:{totalXp:10},budgetCodes:[],transactions:[{type:'EXPENSE',amount:15000}],goals:[],investments:[],xpLogs:[]};
    const first=await handleRequest(request('data','POST',{data,version:0},cookie));
    assert.deepEqual(await first.json(),{version:1});
    assert.equal(await handleRequest(request('data','POST',{data,version:0},cookie)).then(res=>res.status),409);
    assert.deepEqual((await handleRequest(request('data','GET',undefined,cookie)).then(res=>res.json())).data,data);
    assert.notEqual(db.rows.get(`app_data/${user.id}`)?.data_cipher,JSON.stringify(data));

    const profile=await handleRequest(request('profile','POST',{birthDate:'1995-06-01',phone:'010-9876-5432'},cookie));
    assert.equal((await profile.json()).user.phone,'01098765432');
    assert.equal(await handleRequest(request('login','POST',{username:'test1',password:'wrong'})).then(res=>res.status),401);
    const login=await handleRequest(request('login','POST',{username:'test1',password:input.password}));
    assert.equal(login.status,200);
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
    assert.equal((await handleRequest(request('stop-impersonation','POST',{},both)).then(res=>res.json())).user.id,adminId);
  } finally {setDatabaseForTests(undefined);}
});
