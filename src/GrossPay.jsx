import {useCallback,useEffect,useState,useRef} from 'react';
import {apiRequest} from './lib/api.js';

const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((c||0)/100);
const hours=s=>(s/3600).toFixed(2);
function previousDay(day){const date=new Date(day+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
export default function GrossPayPage({profile}){
  const [unit,setUnit]=useState(profile.employment?.[0]?.businessUnitId||'');
  const [statements,setStatements]=useState([]);
  const [paid,setPaid]=useState([]),[downloading,setDownloading]=useState('');
  const generation=useRef(0);
  async function downloadStub(id){setDownloading(id);setError('');try{const r=await apiRequest('/api/employee/pay/paid-statements/'+id+'/download?businessUnitId='+unit);const url=URL.createObjectURL(new Blob([r.data.html],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=r.data.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e.message);}finally{setDownloading('');}}

  const [adjustments,setAdjustments]=useState([]);
  const [providerStatements,setProviderStatements]=useState([]);
  const [nativePreviews,setNativePreviews]=useState([]);
  const [taxPreviews,setTaxPreviews]=useState([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    if(!unit)return;
    const current=++generation.current;setPaid([]);setBusy(true);
    try{const [res,adj,provider,native,tax,final]=await Promise.all([
      apiRequest('/api/employee/pay/statements?businessUnitId='+unit),
      apiRequest('/api/employee/pay/adjustments?businessUnitId='+unit),
      apiRequest('/api/employee/pay/provider-statements?businessUnitId='+unit),
      apiRequest('/api/employee/pay/native-preview?businessUnitId='+unit),
      apiRequest('/api/employee/pay/tax-preview?businessUnitId='+unit),
      apiRequest('/api/employee/pay/paid-statements?businessUnitId='+unit),
    ]);
      if(current!==generation.current)return;
      setPaid(final.data||[]);setStatements((res.data||[]).filter(x=>!(final.data||[]).some(p=>p.runId===x.runId)));setAdjustments(adj.data||[]);
      setProviderStatements(provider.data||[]);setNativePreviews(native.data||[]);
      setTaxPreviews(tax.data||[]);
      setError('');}
    catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Unable to load pay history.');}
    finally{if(current===generation.current)setBusy(false);}
  },[unit]);
  useEffect(()=>{void load();},[load]);
  return <div className="page-body gross-pay-page">
    <header className="page-heading"><div><span className="eyebrow">Earnings Records</span>
      <h1>My Pay</h1>
      <p>View your final net-pay stubs and itemized earnings and deductions.</p>
    </div><button type="button" className="button button-outline" onClick={load} disabled={busy}>
      {busy?'Refreshing…':'Refresh'}</button></header>
    {profile.employment.length>1&&<label className="field gross-pay-business">
      <span>Business</span><select value={unit} onChange={e=>setUnit(e.target.value)}>
        {profile.employment.map(e=><option key={e.id} value={e.businessUnitId}>{e.businessName}</option>)}
      </select></label>}
    {error&&<p className="alert alert-error" role="alert">{error}</p>}
    <section aria-label="Final Pay Stubs"><h2>Final Pay Stubs</h2>
      <p>Issued from payments recorded by your employer. Download a printable stub to keep or save as PDF from your browser’s Print menu.</p>
      {!busy&&!paid.length&&!error&&<p>No final pay stubs have been issued yet. A stub appears after your employer records your completed payment.</p>}
      {paid.map(p=>{const a=p.statement.amounts;return <article className="content-card" key={p.id}>
        <div className="field-section-heading"><div><h3>Pay Date: {p.payDate}</h3><p>{p.statement.periodStart} – {previousDay(p.statement.periodEndExclusive)}</p></div><span className="status-tag">{p.status==='reversed'?'Reversed — Not Current Pay':'Final · Recorded Paid'}</span></div>
        <div className="gross-pay-gross">{money(p.netPaidCents)}<small>{p.status==='reversed'?'Original Net Payment — Reversed':'Net Paid'}</small></div>
        <div className="gross-pay-breakdown">{[['Gross wages',a.gross_cents],['Federal income tax',a.federal_income_cents],['Ohio income tax',a.ohio_income_cents],['Toledo income tax',a.toledo_income_cents],['School district tax',a.school_income_cents],['Social Security',a.social_security_cents],['Medicare',a.medicare_cents],['Additional Medicare',a.additional_medicare_cents],['Total tax withheld',a.total_withholding_cents],['Other deductions',a.voluntary_deductions_cents],['Reimbursements',a.reimbursement_cents]].map(([label,value])=><div key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</div>
        <button className="button button-outline" disabled={Boolean(downloading)} onClick={()=>downloadStub(p.id)}>{downloading===p.id?'Preparing…':'Download Pay Stub'}</button>
      </article>;})}
    </section>
    <details><summary>Preliminary Calculations & Other Payroll Records</summary>
    <section className="gross-pay-tax">
      <h2>Pioneer Tax Withholding — Approved Estimates</h2>
      <p className="muted">These projections are based on management-verified
        employee tax elections and 2026 withholding rules. They are NOT final pay
        statements or proof of payment. Employer taxes, filing and disbursement
        are not complete.</p>
      <div className="gross-pay-list">{taxPreviews.map(item=><article
        key={item.calculationId} className="content-card">
        <div className="field-section-heading">
          <div><span className="eyebrow">Reviewed Tax Estimate · Not Payable</span>
            <h3>{item.periodStart} – {previousDay(item.periodEnd)}</h3></div>
          <span className="status-tag">No Payment Authorized</span>
        </div>
        <div className="gross-pay-gross">{money(item.projectedNetCents)}
          <small>Projected Net Only — Not Final</small></div>
        <div className="gross-pay-breakdown">
          <div><span>Gross earnings</span><strong>{money(item.grossCents)}</strong></div>
          <div><span>Federal income withholding</span><strong>{money(item.federalIncomeCents)}</strong></div>
          <div><span>Ohio income withholding</span><strong>{money(item.ohioIncomeCents)}</strong></div>
          <div><span>Toledo income withholding</span><strong>{money(item.toledoIncomeCents)}</strong></div>
          <div><span>School district withholding</span><strong>{money(item.schoolIncomeCents)}</strong></div>
          <div><span>Employee Social Security</span><strong>{money(item.socialSecurityCents)}</strong></div>
          <div><span>Employee Medicare</span><strong>{money(item.medicareCents)}</strong></div>
          <div><span>Additional Medicare</span><strong>{money(item.additionalMedicareCents)}</strong></div>
          <div><span>Total estimated withholding</span><strong>{money(item.totalWithholdingCents)}</strong></div>
          <div><span>Voluntary deductions</span><strong>{money(item.voluntaryDeductionsCents)}</strong></div>
          <div><span>Separate reimbursements</span><strong>{money(item.reimbursementCents)}</strong></div>
          <div><span>Projected net — unpaid</span><strong>{money(item.projectedNetCents)}</strong></div>
        </div>
        <p className="muted">Calculated using {item.taxRuleVersion}.
          No check, direct deposit, tax deposit, or official pay statement was issued.
          Verify amounts with management before relying on them.</p>
      </article>)}</div>
      {!taxPreviews.length&&!busy&&<p className="muted">
        No approved withholding estimates are available yet.</p>}
    </section>
    <section className="gross-pay-native">
      <h2>Pioneer Native Earnings — Approved Previews</h2>
      <p className="muted">These are internally reviewed gross earnings calculations.
        Taxes and final net pay have NOT been calculated, and no payment has been initiated.
        Approved calculations are not final pay statements.</p>
      <div className="gross-pay-list">{nativePreviews.map(item=><article className="content-card"
        key={item.calculationId}>
        <div className="field-section-heading">
          <div><span className="eyebrow">Internal Earnings Snapshot · Taxes Pending</span>
            <h3>{item.periodStart} – {previousDay(item.periodEnd)}</h3></div>
          <span className="status-tag">Not Payable</span>
        </div>
        <div className="gross-pay-gross">{money(item.grossWagesCents)} <small>Gross Earnings Only</small></div>
        <div className="gross-pay-breakdown">
          <div><span>Regular wages</span><strong>{money(item.regularCents)}</strong></div>
          <div><span>Estimated overtime</span><strong>{money(item.overtimeCents)}</strong></div>
          <div><span>Posted wage adjustments</span><strong>{money(item.wageAdjustmentsCents)}</strong></div>
          <div><span>Voluntary deduction estimate</span><strong>{money(item.voluntaryDeductionsCents)}</strong></div>
          <div><span>Separate expense reimbursements</span><strong>{money(item.reimbursementCents)}</strong></div>
          <div><span>Tax withholding</span><strong>Not calculated</strong></div>
          <div><span>Net pay</span><strong>Not calculated</strong></div>
        </div>
        <p className="muted">This approved snapshot cannot authorize a check or direct deposit.
          Voluntary deductions are not final tax withholding or take-home pay.</p>
      </article>)}</div>
      {!nativePreviews.length&&!busy&&<p className="muted">No approved native earnings previews yet.</p>}
    </section>
    <section className="gross-pay-provider">
      <h2>External Payroll Provider Results</h2>
      <p className="muted">These summaries reflect reports imported by management from
        the payroll provider. They are not official provider-issued pay stubs or independent proof of payment.</p>
      <div className="gross-pay-list">{providerStatements.map(item=><section className="content-card"
        key={item.batchId}>
        <div className="field-section-heading">
          <div><span className="eyebrow">{item.providerName} · Imported Payroll Result</span>
            <h3>{item.periodStart} – {previousDay(item.periodEnd)}</h3></div>
          <span className="status-tag">{item.paymentStatus==='paid'?'Provider reported paid':
            item.paymentStatus==='failed'?'Provider reported failed':'Payment pending'}</span>
        </div>
        <div className="gross-pay-gross">{money(item.netCents)} <small>Provider-Reported Net Pay</small></div>
        <div className="gross-pay-breakdown">
          <div><span>Gross wages</span><strong>{money(item.grossCents)}</strong></div>
          <div><span>Federal withholding</span><strong>{money(item.federalWithholdingCents)}</strong></div>
          <div><span>State withholding</span><strong>{money(item.stateWithholdingCents)}</strong></div>
          <div><span>Social Security</span><strong>{money(item.socialSecurityCents)}</strong></div>
          <div><span>Medicare</span><strong>{money(item.medicareCents)}</strong></div>
          <div><span>Other deductions</span><strong>{money(item.otherDeductionsCents)}</strong></div>
          <div><span>Net pay</span><strong>{money(item.netCents)}</strong></div>
          {item.paidOn&&<div><span>Provider-reported payment date</span><strong>{item.paidOn}</strong></div>}
          {item.statementReference&&<div><span>Provider statement reference</span><strong>{item.statementReference}</strong></div>}
        </div>
        <p className="muted">Payment status is provider-reported, not bank-verified.
          Pioneer Books settlement and tax liability reconciliation are separate.</p>
      </section>)}</div>
      {!providerStatements.length&&!busy&&<p className="muted">
        No external payroll provider results have been imported yet.</p>}
    </section>
    <h2>Pioneer Books — Gross Wage Accruals</h2>
    <div className="gross-pay-list">{statements.map(statement=><section className="content-card" key={statement.runId}>
      <div className="field-section-heading">
        <div><span className="eyebrow">Recorded in Pioneer Books</span>
          <h2>{statement.periodStart} – {previousDay(statement.periodEnd)}</h2></div>
        <span className="status-tag">Not Marked Paid</span>
      </div>
      <div className="gross-pay-gross">{money(statement.grossCents)} <small>Gross Wages</small></div>
      <div className="gross-pay-breakdown">
        <div><span>Regular Hours</span><strong>{hours(statement.regularSeconds)}</strong></div>
        <div><span>Estimated Overtime Hours</span><strong>{hours(statement.overtimeSeconds)}</strong></div>
        <div><span>Regular Gross</span><strong>{money(statement.regularCents)}</strong></div>
        <div><span>Estimated Overtime Gross</span><strong>{money(statement.overtimeCents)}</strong></div>
      </div>
    </section>)}</div>
    <section className="gross-pay-adjustments">
      <h2>Posted Pay Adjustments</h2>
      <p className="muted">Bonuses and retroactive corrections affect accrued gross wages.
        Reimbursements are shown separately because their tax treatment may differ.
        These accounting entries do not confirm an actual payment.</p>
      {adjustments.map(a=><article className="content-card gross-adjustment" key={a.id}>
        <div className="field-section-heading"><div>
          <span className="eyebrow">{a.category==='reimbursement'?'Expense Reimbursement':
            a.category==='bonus'?'Bonus':a.category==='retro_pay'?'Retroactive Pay':'Wage Correction'}</span>
          <h3>{a.description}</h3>
          <p className="muted">Service date: {a.serviceDate}</p>
        </div><strong className="gross-pay-adjustment-amount">{money(a.amountCents)}</strong></div>
        <p className="muted">{a.reversesAdjustmentId?'Reversal of a prior adjustment. ':
          a.isReversed?'This adjustment was subsequently reversed. ':''}
          {a.category==='reimbursement'
            ?'Expense reimbursement accrual — separate from gross wages.'
            :'Estimated gross wage adjustment.'} Not marked paid.</p>
      </article>)}
      {!adjustments.length&&!busy&&<p className="muted">No posted pay adjustments yet.</p>}
    </section>
    </details>
    {!busy&&!paid.length&&!statements.length&&!adjustments.length&&!providerStatements.length&&!nativePreviews.length&&!taxPreviews.length&&!error&&<div className="empty-state">
      <h3>No gross-pay records yet</h3>
      <p>When management reviews and posts a payroll register, the resulting gross wages appear here.
        Approved hours are available now in your Hours & Time Clock section.</p>
    </div>}
  </div>;
}
