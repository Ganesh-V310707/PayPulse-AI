// Deterministic, explainable calculators; no invented market data or credit advice.
function money(x){return Math.round((Number(x)||0)*100)/100;}
function calculate(kind, inputs={}){
 const n=(key,fallback=0)=>{const v=Number(inputs[key]);return Number.isFinite(v)?v:fallback};
 const nonneg=(key,fallback=0)=>Math.max(0,n(key,fallback));
 switch(kind){
 case 'total-cost':{
  const purchase=nonneg('purchase'),shipping=nonneg('shipping'),tax=nonneg('tax'),maintenance=nonneg('maintenance'),years=Math.max(1,Math.min(20,n('years',3))),resale=nonneg('resale');
  const total=money(purchase+shipping+tax+maintenance*years-resale);
  return {title:'True ownership cost',value:total,unit:'money',details:[`Upfront: ${money(purchase+shipping+tax)}`,`Maintenance over ${years} years: ${money(maintenance*years)}`,`Assumed resale offset: ${resale}`,`Monthly equivalent: ${money(total/(12*years))}`],assumptions:'Inputs are your own estimates, not market forecasts.'};}
 case 'cost-per-use':{
  const price=nonneg('price'),uses=Math.max(1,n('uses',12)),ongoing=nonneg('ongoing');const value=money((price+ongoing)/uses);
  return {title:'Cost per use',value,unit:'money',details:[`${uses} expected uses`,`${money(price+ongoing)} total expected spend`],assumptions:'Value depends on how often you really use it.'};}
 case 'needs-wants':{
  const needs=Math.max(0,Math.min(10,n('needs',6))),urgency=Math.max(0,Math.min(10,n('urgency',4))),frequency=Math.max(0,Math.min(10,n('frequency',6))),budgetStress=Math.max(0,Math.min(10,n('budgetStress',5)));
  const score=Math.round(needs*.35*10+urgency*.2*10+frequency*.25*10+(10-budgetStress)*.2*10);
  return {title:'Purchase readiness',value:score,unit:'score',details:[score>=70?'Strongly aligned with your stated priorities':score>=45?'Mixed reasons: review needs before buying':'Consider postponing until the purchase better fits your priorities'],assumptions:'Reflection tool, not an objective financial recommendation.'};}
 case 'subscription-audit':{
  const monthly=nonneg('monthly'),active=Math.max(1,n('active',12)),used=Math.max(0,Math.min(active,n('used',4)));
  return {title:'Subscription review',value:money(monthly*12),unit:'money',details:[`Annual spend: ${money(monthly*12)}`,`Cost per used month: ${used?money(monthly*active/used):'not defined'}`,`Months used: ${used} of ${active}`],assumptions:'Review cancellation terms and actual billing history.'};}
 case 'split-plan':{
  const goal=nonneg('goal'),saved=nonneg('saved'),months=Math.max(1,Math.min(120,n('months',6)));const remaining=Math.max(0,goal-saved);
  return {title:'Savings timeline',value:money(remaining/months),unit:'money',details:[`Still needed: ${money(remaining)}`,`Target months: ${months}`],assumptions:'Savings goal calculator; not credit, financing or guaranteed affordability.'};}
 case 'resale-scenario':{
  const paid=nonneg('paid'),resalePct=Math.max(0,Math.min(100,n('resalePct',40))),fees=nonneg('fees');const resale=money(paid*resalePct/100-fees);
  return {title:'Hypothetical resale value',value:resale,unit:'money',details:[`Net ownership cost: ${money(paid-resale)}`],assumptions:'Your resale assumption is hypothetical, not a price prediction.'};}
 case 'repair-or-replace':{
  const repair=nonneg('repair'),replacement=nonneg('replacement'),repairMonths=Math.max(1,n('repairMonths',12)),newMonths=Math.max(1,n('newMonths',36));const a=money(repair/repairMonths),b=money(replacement/newMonths);
  return {title:'Repair vs replace',value:a<=b?'REPAIR':'REPLACE',unit:'text',details:[`Repair cost / expected month: ${a}`,`Replacement cost / expected month: ${b}`],assumptions:'Does not account for energy use, safety, breakdown risk or warranty.'};}
 case 'return-risk':{
  const returnDays=nonneg('returnDays'),warrantyMonths=nonneg('warrantyMonths'),shippingCost=nonneg('shippingCost'),restockingFee=nonneg('restockingFee');const flags=[];
  if(returnDays<7)flags.push('Very short or unconfirmed return window');if(warrantyMonths<6)flags.push('Limited or unconfirmed warranty');if(shippingCost||restockingFee)flags.push('Possible return costs');const warnings=flags.length; if(!flags.length)flags.push('No obvious red flags from entered fields; verify seller terms.');
  return {title:'Return policy risk review',value:warnings,unit:'count',details:flags,assumptions:'Seller policy must be checked manually.'};}
 case 'eco-impact':{
  const replaceYears=Math.max(1,n('replaceYears',2)),repairYears=Math.max(1,n('repairYears',1));return {title:'Lifetime extension scenario',value:repairYears,unit:'years',details:[`Planned lifetime: ${replaceYears} years`,`Extended lifetime if repaired: ${replaceYears+repairYears} years`],assumptions:'Longevity only, not a quantified carbon footprint.'};}
 default: {const e=new Error('Unknown decision tool');e.status=400;throw e;}
 }
}
module.exports={calculate};
