import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
const memory = new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}});
const {useAppStore,initialData,migrateAppData} = await import('./index');
beforeEach(()=>useAppStore.setState(structuredClone(initialData)));
test('budget CRUD rejects duplicates and keeps transaction references consistent',()=>{
 const s = useAppStore.getState();
 s.saveBudgetCode({codeId:'CA01',categoryName:'카페',monthlyLimit:50000});
 assert.equal(useAppStore.getState().budgetCodes.length,6);
 assert.throws(()=>s.saveBudgetCode({codeId:'CA01',categoryName:'중복',monthlyLimit:0}));
 s.saveTransaction({txId:'tx1',txDate:'2026-10-21',type:'EXPENSE',codeId:'CA01',amount:5000,memo:''});
 s.saveBudgetCode({codeId:'CA02',categoryName:'커피',monthlyLimit:60000},'CA01');
 assert.equal(useAppStore.getState().transactions[0].codeId,'CA02');
 assert.throws(()=>s.deleteBudgetCode('CA02'));
 s.deleteTransaction('tx1'); s.deleteBudgetCode('CA02');
 assert.equal(useAppStore.getState().budgetCodes.length,5);
});
test('annual and monthly goals upsert independently and reject invalid values',()=>{
 const s = useAppStore.getState();
 const goal = {year:2026,month:0,targetSavingAmount:10000000,targetInvestReturnRate:5};
 s.saveGoal(goal); s.saveGoal({...goal,month:10});s.saveGoal({...goal,targetSavingAmount:20000000});
 assert.equal(useAppStore.getState().goals.length,2);
 assert.equal(useAppStore.getState().goals.find(g=>g.month===0)?.targetSavingAmount,20000000);
 assert.throws(()=>s.saveGoal({...goal,targetSavingAmount:-1}));
 assert.throws(()=>s.saveGoal({...goal,targetInvestReturnRate:NaN}));
 const stored = JSON.parse(memory.get('rich-grandma-tycoon-v1')!);
 assert.equal(stored.state.goals.length,2);
 useAppStore.setState({goals:[]});
 memory.set('rich-grandma-tycoon-v1',JSON.stringify(stored));
 useAppStore.persist.rehydrate();
 assert.equal(useAppStore.getState().goals.length,2);
});
test('XP is awarded once per reward and period and grows character and house',()=>{
 const s=useAppStore.getState();
 const log={logId:'xp1',earnedDate:'2026-10-21',rewardType:'DAILY_LOG' as const,referencePeriod:'2026-10-21',xpAmount:1500};
 assert.equal(s.awardXp(log),true);
 assert.equal(s.awardXp({...log,logId:'xp2'}),false);
 assert.equal(useAppStore.getState().character.level,12);
 assert.equal(useAppStore.getState().character.houseStage,2);
 assert.equal(useAppStore.getState().character.currentXp,100);
 assert.equal(useAppStore.getState().character.totalXp,1500);
});

test('daily reward persists atomically, follows txDate and cannot be farmed by deleting',()=>{
 const s=useAppStore.getState();
 const tx={txId:'daily1',txDate:'2024-02-29',type:'EXPENSE' as const,codeId:'FO01',amount:5000,memo:'점심'};
 let updates=0;
 const unsubscribe=useAppStore.subscribe(()=>updates++);
 assert.equal(s.saveTransactionWithDailyReward(tx),true);
 assert.equal(updates,1);
 unsubscribe();
 assert.equal(s.saveTransactionWithDailyReward({...tx,txId:'daily2'}),false);
 assert.equal(useAppStore.getState().character.currentXp,10);
 s.deleteTransaction('daily1');s.deleteTransaction('daily2');
 useAppStore.persist.rehydrate();
 assert.equal(s.saveTransactionWithDailyReward({...tx,txId:'daily3'}),false);
 assert.equal(s.saveTransactionWithDailyReward({...tx,txId:'daily4',txDate:'2024-03-01'}),true);
 assert.equal(useAppStore.getState().character.currentXp,20);
 const stored=JSON.parse(memory.get('rich-grandma-tycoon-v1')!);
 assert.equal(stored.state.transactions.length,2);
 assert.equal(stored.state.xpLogs.length,2);
 assert.equal(stored.state.xpLogs[0].referencePeriod,'2024-02-29');
});
test('invalid transactions award no XP and leave all data unchanged',()=>{
 const s=useAppStore.getState();
 const tx={txId:'bad',txDate:'2025-02-29',type:'EXPENSE' as const,codeId:'FO01',amount:5000,memo:''};
 assert.throws(()=>s.saveTransactionWithDailyReward(tx),/거래 날짜/);
 assert.throws(()=>s.saveTransactionWithDailyReward({...tx,txDate:'2026-10-21',amount:-1}));
 assert.throws(()=>s.saveTransactionWithDailyReward({...tx,txDate:'2026-10-21',codeId:'INCOME'}));
 assert.equal(useAppStore.getState().transactions.length,0);
 assert.equal(useAppStore.getState().xpLogs.length,0);
 assert.equal(useAppStore.getState().character.currentXp,0);
});
test('daily reward respects prior XpLog and triggers level-up at the threshold',()=>{
 const s=useAppStore.getState();
 useAppStore.setState({character:{...s.character,totalXp:90,currentXp:90}});
 s.awardXp({logId:'prior',earnedDate:'2026-10-21',referencePeriod:'2026-10-20',rewardType:'DAILY_LOG',xpAmount:10});
 assert.equal(useAppStore.getState().character.level,2);
 const tx={txId:'income',txDate:'2026-10-20',type:'INCOME' as const,codeId:'INCOME',amount:1000000,memo:''};
 assert.equal(s.saveTransactionWithDailyReward(tx),false);
 assert.equal(s.saveTransactionWithDailyReward({...tx,txId:'saving',txDate:'2026-10-21',type:'SAVING',codeId:'SAVING'}),true);
 assert.equal(useAppStore.getState().character.currentXp,10);
});

test('tracked investment validates quantity, calculates cost basis and rejects monthly duplicates',()=>{
 const s=useAppStore.getState();
 const investment={invId:'apple',yearMonth:'2026-10',ticker:'AAPL',tickerName:'Apple',currency:'USD' as const,quantity:10,investedPrincipal:1000,currentValuation:1000,valuationSource:'principal' as const};
 s.saveInvestment(investment);
 assert.equal(useAppStore.getState().investments[0].purchasePrice,100);
 assert.throws(()=>s.saveInvestment({...investment,invId:'duplicate'}),/등록된 종목/);
 assert.throws(()=>s.saveInvestment({...investment,quantity:0}));
 assert.throws(()=>s.saveInvestment({...investment,quantity:Infinity}));
 s.saveInvestment({...investment,quantity:5});
 assert.equal(useAppStore.getState().investments[0].purchasePrice,200);
});
test('quote update does not rewrite historical records and uses current quantities',async()=>{
 const {todayDate,addMonths}=await import('../lib/calendar');
 const s=useAppStore.getState();const month=todayDate().slice(0,7);const previous=addMonths(`${month}-01`,-1).slice(0,7);
 s.saveInvestment({invId:'prev',yearMonth:previous,ticker:'AAPL',tickerName:'Apple',currency:'USD',quantity:10,investedPrincipal:1000,currentValuation:1050,valuationSource:'market'});
 s.ensureInvestmentMonth();s.ensureInvestmentMonth();
 assert.equal(useAppStore.getState().investments.length,2);
 const quote={ticker:'AAPL',price:120,currency:'USD' as const,marketTime:new Date().toISOString(),fetchedAt:new Date().toISOString()};
 s.updateInvestmentQuotes(previous,[quote]);
 assert.equal(useAppStore.getState().investments[0].currentValuation,1050);
 s.updateInvestmentQuotes(month,[quote]);
 assert.equal(useAppStore.getState().investments.find(i=>i.yearMonth===month)?.currentValuation,1200);
 useAppStore.persist.rehydrate();
 assert.equal(useAppStore.getState().investments.find(i=>i.yearMonth===month)?.currentValuation,1200);
});

test('legacy XP migrates once without losing avatar, rewards or transactions',()=>{
 const old=structuredClone(initialData);
 old.character={...old.character,level:6,currentXp:0,isCustomized:true,avatar:{hair:5,eyes:5,face:5,skin:5,top:5,bottom:5,shoes:3}};
 old.xpLogs=[{logId:'old',earnedDate:'2026-09-01',rewardType:'ANNUAL_GOAL',referencePeriod:'2025',xpAmount:1500}];
 const updated=migrateAppData(old,1);
 assert.equal(updated.character.totalXp,1500);assert.equal(updated.character.level,12);
 assert.deepEqual(updated.character.avatar,old.character.avatar);
 assert.deepEqual(updated.xpLogs,old.xpLogs);
 assert.deepEqual(migrateAppData(updated,2),updated);
});
test('settlement atomically checks eligibility, pays once and upgrades the house',()=>{
 const s=useAppStore.getState();
 useAppStore.setState({character:{...s.character,totalXp:450,level:5,currentXp:50}});
 assert.equal(s.claimSettlement('MONTHLY_SAVING').awarded,false);
 assert.equal(useAppStore.getState().character.totalXp,450);
 const paid=s.claimSettlement('MONTHLY_BUDGET');
 assert.equal(paid.awarded,true);assert.equal(paid.xpAmount,150);assert.equal(paid.houseUpgraded,true);
 assert.equal(useAppStore.getState().character.totalXp,600);assert.equal(useAppStore.getState().character.houseStage,2);
 assert.equal(s.claimSettlement('MONTHLY_BUDGET').awarded,false);
 useAppStore.persist.rehydrate();
 assert.equal(s.claimSettlement('MONTHLY_BUDGET').awarded,false);
 assert.equal(useAppStore.getState().character.totalXp,600);
 assert.equal(useAppStore.getState().xpLogs.filter(l=>l.rewardType==='MONTHLY_BUDGET').length,1);
});
test('all bonus types are independently claimed at fixed amounts and daily reward still works',async()=>{
 const {todayDate}=await import('../lib/calendar');const date=todayDate();const year=Number(date.slice(0,4));const month=Number(date.slice(5,7));
 const s=useAppStore.getState();
 s.saveGoal({year,month,targetSavingAmount:1000,targetInvestReturnRate:5});s.saveGoal({year,month:0,targetSavingAmount:1000,targetInvestReturnRate:5});
 s.saveTransactionWithDailyReward({txId:'saving',txDate:date,type:'SAVING',codeId:'SAVING',amount:1000,memo:''});
 s.saveInvestment({invId:'priced',yearMonth:date.slice(0,7),ticker:'AAPL',tickerName:'Apple',currency:'USD',quantity:10,investedPrincipal:1000,currentValuation:1100,valuationSource:'market'});
 for(const type of ['MONTHLY_BUDGET','MONTHLY_SAVING','MONTHLY_INVEST','ANNUAL_GOAL'] as const) assert.equal(s.claimSettlement(type).awarded,true);
 assert.equal(useAppStore.getState().character.totalXp,1560);assert.equal(useAppStore.getState().xpLogs.length,5);
 assert.equal(s.claimSettlement('ANNUAL_GOAL').awarded,false);
 s.saveGoal({year,month,targetSavingAmount:999999,targetInvestReturnRate:5});
 assert.equal(s.claimSettlement('MONTHLY_SAVING').awarded,false);
});
test('avatar customization persists all variants and rejects out-of-range parts',()=>{
 const s=useAppStore.getState();const avatar={hair:5,eyes:5,face:5,skin:5,top:5,bottom:5,shoes:3} as const;
 s.customizeAvatar(avatar);useAppStore.persist.rehydrate();
 assert.deepEqual(useAppStore.getState().character.avatar,avatar);assert.equal(useAppStore.getState().character.isCustomized,true);
 assert.throws(()=>s.customizeAvatar({...avatar,shoes:4} as never));
 assert.throws(()=>s.customizeAvatar({...avatar,hair:0} as never));
 assert.deepEqual(useAppStore.getState().character.avatar,avatar);
});
test('complete character choices persist without changing money records or XP',()=>{
 const s=useAppStore.getState();
 s.saveTransaction({txId:'one',txDate:'2026-10-01',type:'EXPENSE',codeId:'FO01',amount:1000,memo:'점심'});
 const before=useAppStore.getState();
 s.selectCharacter('saver');
 assert.equal(useAppStore.getState().character.selectedCharacterId,'saver');
 assert.equal(useAppStore.getState().character.isCustomized,true);
 s.selectCharacter('default');
 useAppStore.persist.rehydrate();
 assert.equal(useAppStore.getState().character.selectedCharacterId,'default');
 assert.deepEqual(useAppStore.getState().transactions,before.transactions);
 assert.equal(useAppStore.getState().character.totalXp,before.character.totalXp);
 assert.throws(()=>s.selectCharacter('unknown' as never));
});
