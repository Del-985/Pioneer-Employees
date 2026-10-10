import {useCallback,useEffect,useState} from 'react';
import {apiRequest} from './lib/api.js';

const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((c||0)/100);
const hours=s=>(s/3600).toFixed(2);
function previousDay(day){const date=new Date(day+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
export default function GrossPayPage({profile}){
  const [unit,setUnit]=useState(profile.employment?.[0]?.businessUnitId||'');
  const [statements,setStatements]=useState([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    if(!unit)return;
    setBusy(true);
    try{const res=await apiRequest('/api/employee/pay/statements?businessUnitId='+unit);
      setStatements(res.data||[]);setError('');}
    catch(e){setError(e instanceof Error?e.message:'Unable to load pay history.');}
    finally{setBusy(false);}
  },[unit]);
  useEffect(()=>{void load();},[load]);
  return <div className="page-body gross-pay-page">
    <header className="page-heading"><div><span className="eyebrow">Earnings Records</span>
      <h1>My Gross Pay</h1>
      <p>View wage amounts recorded in Pioneer Books from approved timekeeping.</p>
    </div><button type="button" className="button button-outline" onClick={load} disabled={busy}>
      {busy?'Refreshing…':'Refresh'}</button></header>
    <div className="alert alert-info">
      These are <strong>gross wage estimates recorded as unpaid liabilities</strong>, not pay stubs or confirmation of payment.
      They do not show tax withholding or net pay. Check your separate payroll provider or pay statement for actual wages paid.
    </div>
    {profile.employment.length>1&&<label className="field gross-pay-business">
      <span>Business</span><select value={unit} onChange={e=>setUnit(e.target.value)}>
        {profile.employment.map(e=><option key={e.id} value={e.businessUnitId}>{e.businessName}</option>)}
      </select></label>}
    {error&&<p className="alert alert-error" role="alert">{error}</p>}
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
    {!busy&&!statements.length&&!error&&<div className="empty-state">
      <h3>No gross-pay records yet</h3>
      <p>When management reviews and posts a payroll register, the resulting gross wages appear here.
        Approved hours are available now in your Hours & Time Clock section.</p>
    </div>}
  </div>;
}
