import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSettlementMissions, latestAnnualInvestments, portfolioGoalStatus } from './XpSettlementEngine';
import { getCharacterMood } from './characterMood';
import type { AppData, InvestmentMonthly } from '../types';
const investment: InvestmentMonthly = {invId:'i1',yearMonth:'2026-10',ticker:'AAPL',tickerName:'Apple',currency:'USD',quantity:10,purchasePrice:100,investedPrincipal:1000,currentValuation:1100,valuationSource:'market'};
const empty = (): AppData => ({character:{totalXp:0,level:1,currentXp:0,houseStage:1,isCustomized:false,avatar:{hair:1,eyes:1,face:1,skin:1,top:1,bottom:1,shoes:1}},budgetCodes:[{codeId:'FO01',categoryName:'식비',monthlyLimit:100}],goals:[],investments:[],transactions:[],xpLogs:[]});

test('bonus requirements distinguish unset goals, exact thresholds and over-budget', () => {
  const data = empty();
  assert.deepEqual(getSettlementMissions(data,'2026-10-22').map(m=>m.eligible),[true,false,false,false]);
  data.goals=[{year:2026,month:10,targetSavingAmount:200,targetInvestReturnRate:10},{year:2026,month:0,targetSavingAmount:300,targetInvestReturnRate:10}];
  data.transactions=[
    {txId:'s1',txDate:'2026-10-22',type:'SAVING',codeId:'SAVING',amount:200,memo:''},
    {txId:'s2',txDate:'2026-09-22',type:'SAVING',codeId:'SAVING',amount:100,memo:''},
    {txId:'e1',txDate:'2026-10-22',type:'EXPENSE',codeId:'FO01',amount:100,memo:''},
  ];
  data.investments=[investment];
  assert.deepEqual(getSettlementMissions(data,'2026-10-22').map(m=>m.eligible),[true,true,true,true]);
  data.transactions[2].amount=101;
  assert.equal(getSettlementMissions(data,'2026-10-22')[0].eligible,false);
  data.goals[1].targetSavingAmount=301;
  assert.equal(getSettlementMissions(data,'2026-10-22')[3].eligible,false);
  data.goals[1].targetSavingAmount=300;data.goals[1].targetInvestReturnRate=11;
  assert.equal(getSettlementMissions(data,'2026-10-22')[3].eligible,false);
  data.xpLogs=[{logId:'b',earnedDate:'2026-10-01',rewardType:'MONTHLY_BUDGET',referencePeriod:'2026-10',xpAmount:150}];
  assert.equal(getSettlementMissions(data,'2026-10-22')[0].claimed,true);
});
test('future transactions and prior-year savings cannot unlock current goals', () => {
  const data=empty();data.goals=[{year:2026,month:10,targetSavingAmount:1,targetInvestReturnRate:0},{year:2026,month:0,targetSavingAmount:1,targetInvestReturnRate:0}];data.investments=[investment];
  data.transactions=[{txId:'future',txDate:'2026-10-23',type:'SAVING',codeId:'SAVING',amount:100,memo:''},{txId:'last-year',txDate:'2025-12-31',type:'SAVING',codeId:'SAVING',amount:100,memo:''}];
  const missions=getSettlementMissions(data,'2026-10-22');
  assert.equal(missions[1].eligible,false);assert.equal(missions[3].eligible,false);
  data.budgetCodes=[];assert.equal(getSettlementMissions(data,'2026-10-22')[0].eligible,false);
});
test('explicit zero targets work for saving but unpriced/empty investment never qualifies', () => {
  const data=empty();data.goals=[{year:2026,month:10,targetSavingAmount:0,targetInvestReturnRate:0}];
  const missions=getSettlementMissions(data,'2026-10-22');
  assert.equal(missions[1].eligible,true);assert.equal(missions[2].eligible,false);
  data.investments=[{...investment,valuationSource:'principal'}];
  assert.equal(getSettlementMissions(data,'2026-10-22')[2].eligible,false);
});
test('currency-weighted investment goals never mix nominal USD and KRW amounts', () => {
  const won={...investment,invId:'kr',ticker:'005930.KS',currency:'KRW' as const,investedPrincipal:1000000,currentValuation:950000};
  assert.equal(portfolioGoalStatus([investment,won],5).achieved,false);
  assert.equal(portfolioGoalStatus([investment,{...won,currentValuation:1050000}],5).achieved,true);
  const second={...investment,invId:'us2',ticker:'MSFT',investedPrincipal:3000,currentValuation:3000};
  assert.equal(portfolioGoalStatus([investment,second],3).achieved,false);
  assert.equal(portfolioGoalStatus([investment,second],2.5).achieved,true);
});
test('annual portfolio uses each latest ticker once and excludes future and prior years', () => {
  const records=[investment,{...investment,invId:'old',yearMonth:'2026-09',currentValuation:800},{...investment,invId:'future',yearMonth:'2026-11',currentValuation:2000},{...investment,invId:'prior',ticker:'MSFT',yearMonth:'2025-12'}];
  assert.deepEqual(latestAnnualInvestments(records,'2026','2026-10'),[investment]);
});
test('all five expressions react to actual records without marking unfinished goals failed', () => {
  const data=empty();assert.equal(getCharacterMood(data,'2026-10-22').expression,'neutral');
  data.goals=[{year:2026,month:10,targetSavingAmount:1000,targetInvestReturnRate:10}];
  assert.equal(getCharacterMood(data,'2026-10-22').expression,'neutral');
  data.transactions=[{txId:'e',txDate:'2026-10-22',type:'EXPENSE',codeId:'FO01',amount:50,memo:''}];
  assert.equal(getCharacterMood(data,'2026-10-22').expression,'stoic');
  data.xpLogs=[{logId:'daily',earnedDate:'2026-10-22',rewardType:'DAILY_LOG',referencePeriod:'2026-10-22',xpAmount:10}];
  assert.equal(getCharacterMood(data,'2026-10-22').expression,'happy');
  data.transactions[0].amount=101;assert.equal(getCharacterMood(data,'2026-10-22').expression,'frowning');
  data.transactions=[];data.xpLogs=[];data.goals.push({year:2026,month:9,targetSavingAmount:500,targetInvestReturnRate:10});
  assert.equal(getCharacterMood(data,'2026-10-22').expression,'crying');
  data.goals=[{year:2026,month:9,targetSavingAmount:0,targetInvestReturnRate:10}];
  data.investments=[{...investment,yearMonth:'2026-09',valuationSource:'principal'}];
  assert.equal(getCharacterMood(data,'2026-10-22').expression,'neutral');
});
