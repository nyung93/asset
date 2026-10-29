import type {AppData} from '../types';

export interface AccountUser {
  id:string; name:string; username:string; birthDate:string; phone:string;
  role:'USER'|'ADMIN'; createdAt:string; lastLoginAt:string|null;
}
export interface AccountSession {user:AccountUser; impersonating:boolean; remembered:boolean; adminName?:string}
export interface AdminMember {id:string;name:string;username:string;role:'USER'|'ADMIN';lastLoginAt:string|null;createdAt:string}
export interface AdminDashboardData {
  users:{total_users:number;new_users_this_month:number;active_users_30d:number};
  data:{transaction_count:string;total_expense:string;total_saving:string;total_xp:string};
}
export class AccountApiError extends Error {
  constructor(message:string,public status:number,public code:string) {super(message);}
}

async function call<T>(action:string, method:'GET'|'POST'='GET', input?:object, query?:Record<string,string>):Promise<T> {
  const params = new URLSearchParams({action,...query});
  let res:Response;
  try {
    res=await fetch(`/api/index?${params}`,{method,credentials:'same-origin',cache:'no-store',
      headers:method==='POST' ? {'Content-Type':'application/json'} : undefined,
      body:method==='POST' ? JSON.stringify(input ?? {}) : undefined});
  } catch {throw new AccountApiError('서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.',0,'network_error');}
  const data=await res.json().catch(()=>({})) as Record<string,unknown>;
  if(!res.ok) throw new AccountApiError(typeof data.error==='string' ? data.error : '요청을 처리하지 못했어요.',res.status,String(data.code ?? 'request_failed'));
  return data as T;
}

export const accountApi={
  status:()=>call<AccountSession>('status'),
  register:(input:{name:string;birthDate:string;phone:string;username:string;password:string})=>call<AccountSession>('register','POST',input),
  login:(input:{username:string;password:string;remember:boolean})=>call<AccountSession>('login','POST',input),
  logout:()=>call<{ok:boolean}>('logout','POST'),
  data:(userId:string)=>call<{data:AppData|null;version:number}>('data','GET',undefined,{userId}),
  saveData:(data:AppData,version:number,userId:string)=>call<{version:number}>('data','POST',{data,version,userId}),
  updateProfile:(input:{userId:string;birthDate:string;phone:string;currentPassword?:string;newPassword?:string})=>call<AccountSession>('profile','POST',input),
  dashboard:()=>call<AdminDashboardData>('dashboard'),
  members:(search:string,offset=0)=>call<{members:AdminMember[];hasMore:boolean}>('members','GET',undefined,{search,offset:String(offset)}),
  impersonate:(userId:string)=>call<AccountSession>('impersonate','POST',{userId}),
  stopImpersonation:()=>call<AccountSession>('stop-impersonation','POST'),
};
