import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progression } from './progression';

test('all requested house and level boundaries are exact', () => {
  for (const [xp, level, stage] of [[0,1,1],[99,1,1],[100,2,1],[499,5,1],[500,6,2],[1999,15,2],[2000,16,3],[4999,30,3],[5000,31,4],[9999,49,4],[10000,50,5],[10500,51,5]]) {
    const result = progression(xp);
    assert.equal(result.level,level,`level at ${xp}`);
    assert.equal(result.houseStage,stage,`house at ${xp}`);
    assert.ok(result.currentXp >= 0 && result.currentXp < result.levelSpan);
    assert.ok(result.houseProgress >= 0 && result.houseProgress <= 100);
  }
  assert.equal(progression(499).remainingHouseXp,1);
  assert.equal(progression(10000).remainingHouseXp,0);
  assert.throws(()=>progression(-1));assert.throws(()=>progression(NaN));
});
test('fractional stage-four spacing yields continuous monotonic integer levels', () => {
  let previous = 30;
  const reached = new Set<number>();
  for (let xp = 5000; xp <= 10000; xp++) {
    const value = progression(xp);
    assert.ok(value.level === previous || value.level === previous + 1);
    assert.ok(value.currentXp < value.levelSpan);
    previous = value.level;reached.add(value.level);
  }
  assert.equal(reached.size,20);
});
