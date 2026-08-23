import { fetchCarrySeriesRange } from "../../src/trading/funding-feed.js";
import { CARRY_ARCHETYPES, internParamsFrom } from "../../src/trading/carry-archetypes.js";
import { runCarryBacktest, initCarryState, stepCarry } from "../../src/trading/carry-engine.js";
const DAY=86_400_000, END=Date.parse("2026-08-23T00:00:00Z"), START=END-90*DAY, SEAT=20_000;
const bars = await fetchCarrySeriesRange("BTCUSDT", START, END);
const params = [...CARRY_ARCHETYPES.map(a=>a.params), internParamsFrom(CARRY_ARCHETYPES[1].params), internParamsFrom(CARRY_ARCHETYPES[2].params)].slice(0,5);
const usd=(c:number)=>`$${(c/100).toFixed(2)}`;
let engineTot=0, loopTot=0;
console.log("seat | engine(final) | loop(cash) | loop(+unreal) | ciclos | somaCiclos | funding | fees | basis");
params.forEach((p,i)=>{
  const eng = runCarryBacktest(bars, p, SEAT, {});
  let st=initCarryState(), cash=SEAT, unreal=0, f=0, fe=0, b=0, cyc=0, cycSum=0;
  for (let t=0;t<bars.length;t++){
    const r=stepCarry(st,bars[t],p,{barIndex:t,equityCents:cash});
    st=r.state; cash += r.fundingCents - r.feesCents + r.realizedBasisCents;
    f+=r.fundingCents; fe+=r.feesCents; b+=r.realizedBasisCents; unreal=r.unrealizedBasisCents;
    if(r.closedCycle){cyc++; cycSum+=r.closedCycle.netCents;}
  }
  engineTot+=eng.finalEquityCents; loopTot+=cash;
  console.log(`  ${i} | ${usd(eng.finalEquityCents).padStart(9)} | ${usd(cash).padStart(9)} | ${usd(cash+unreal).padStart(9)} | ${String(cyc).padStart(2)}/${eng.closedTrades} | ${usd(cycSum).padStart(7)} | ${usd(f).padStart(7)} | ${usd(fe).padStart(6)} | ${usd(b).padStart(6)}`);
});
console.log(`TOTAL engine ${usd(engineTot)}  loop ${usd(loopTot)}  diff ${usd(loopTot-engineTot)}`);
