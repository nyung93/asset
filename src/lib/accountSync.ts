import type {AppData} from '../types';
import {useAppStore} from '../store';
import {accountApi} from './accountApi';

export function snapshot():AppData {
  const {character,budgetCodes,transactions,goals,investments,xpLogs,recurringExpenses,recurringExpensePayments}=useAppStore.getState();
  return {character,budgetCodes,transactions,goals,investments,xpLogs,recurringExpenses,recurringExpensePayments};
}

/** Serializes writes and rejects stale versions, keeping server data account-scoped. */
export class AccountSync {
  private pending:AppData|null=null;
  private sending:Promise<void>|null=null;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private unsubscribe:()=>void;
  error='';
  constructor(private version:number,private userId:string,private onError:(message:string)=>void) {
    this.unsubscribe=useAppStore.subscribe((next,previous)=>{
      if (next.character===previous.character && next.budgetCodes===previous.budgetCodes && next.transactions===previous.transactions && next.goals===previous.goals && next.investments===previous.investments && next.xpLogs===previous.xpLogs && next.recurringExpenses===previous.recurringExpenses && next.recurringExpensePayments===previous.recurringExpensePayments) return;
      this.pending=snapshot();
      if(this.timer) clearTimeout(this.timer);
      this.timer=setTimeout(()=>{void this.flush();},350);
    });
  }
  async flush():Promise<boolean> {
    if(this.timer) {clearTimeout(this.timer);this.timer=null;}
    if(this.sending) {await this.sending;if(this.pending && !this.error) return this.flush();return !this.error;}
    if(!this.pending) return !this.error;
    const current=this.pending;this.pending=null;
    this.sending=(async()=>{
      try {
        const result=await accountApi.saveData(current,this.version,this.userId);
        this.version=result.version;this.error='';this.onError('');
      } catch(error) {
        this.pending ??= current;
        this.error=error instanceof Error ? error.message : '가계부를 저장하지 못했어요.';
        this.onError(this.error);
      } finally {this.sending=null;}
    })();
    await this.sending;
    if(this.pending && !this.error) return this.flush();
    return !this.error;
  }
  retry():Promise<boolean> {this.error='';return this.flush();}
  dispose() {this.unsubscribe();if(this.timer) clearTimeout(this.timer);this.timer=null;}
}
