import {useCallback,useEffect,useState} from 'react';
import {apiRequest} from './lib/api.js';

function todayDetroit(){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=k=>parts.find(p=>p.type===k)?.value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
function afterDays(day,days){
  const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
const statusLabels={pending:'Awaiting Manager Approval',approved:'Approved',denied:'Denied',cancelled:'Cancelled'};
export default function LeaveRequests({profile}){
  const [unit,setUnit]=useState(profile.employment?.[0]?.businessUnitId||'');
  const [balances,setBalances]=useState(null),[policy,setPolicy]=useState(null),[requests,setRequests]=useState([]);
  const [startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState('');
  const [hours,setHours]=useState(''),[note,setNote]=useState('');
  const [dayHours,setDayHours]=useState({});
  const [loading,setLoading]=useState(false),[acting,setActing]=useState(false);
  const [error,setError]=useState(''),[success,setSuccess]=useState('');
  const load=useCallback(async()=>{
    if(!unit)return;
    setLoading(true);setError('');
    try{
      const [balanceResponse,requestResponse]=await Promise.all([
        apiRequest('/api/employee/leave/balances?businessUnitId='+unit),
        apiRequest('/api/employee/leave/requests?businessUnitId='+unit)
      ]);
      setBalances(balanceResponse.data.balances);setPolicy(balanceResponse.data.policy);
      setRequests(requestResponse.data||[]);
    }catch(e){setError(e.message||'Could not load PTO requests.');}
    finally{setLoading(false);}
  },[unit]);
  useEffect(()=>{setBalances(null);setPolicy(null);setRequests([]);void load();},[load]);
  const firstAllowed=afterDays(todayDetroit(),policy?.planned_notice_days??7);
  const available=balances?.pto?.balanceHours??0;
  const multiDay=Boolean(startDate&&endDate&&startDate!==endDate);
  const dates=[];
  if(startDate&&endDate&&startDate<=endDate){
    for(let day=startDate;day<=endDate&&dates.length<31;day=afterDays(day,1))dates.push(day);
  }
  const days=dates.map(date=>({date,hours:Number(dayHours[date]||0)})).filter(d=>d.hours>0);
  const total=multiDay?Number(days.reduce((n,d)=>n+d.hours,0).toFixed(2)):Number(hours);
  const withinRange=dates.length>0&&endDate<=afterDays(startDate,30);
  async function submit(e){
    e.preventDefault();setError('');setSuccess('');setActing(true);
    try{
      if(!withinRange||total<=0||total>available)throw new Error('Check the leave dates and available PTO balance.');
      await apiRequest('/api/employee/leave/requests',{method:'POST',
        body:JSON.stringify({businessUnitId:unit,startDate,endDate,requestedHours:total,note,
          ...(multiDay?{days}: {})})});
      setSuccess('PTO request submitted for management review.');
      setStartDate('');setEndDate('');setHours('');setDayHours({});setNote('');
      await load();
    }catch(e){setError(e.message||'Unable to submit PTO request.');}
    finally{setActing(false);}
  }
  async function cancel(id){
    setActing(true);setError('');setSuccess('');
    try{
      await apiRequest('/api/employee/leave/requests/'+id+'/cancel',{method:'POST',
        body:JSON.stringify({businessUnitId:unit})});
      setSuccess('Your pending request was cancelled.');await load();
    }catch(e){setError(e.message||'Unable to cancel request.');}
    finally{setActing(false);}
  }
  return <div className="page-body">
    <header className="page-heading"><div><span className="eyebrow">Employee Benefits</span>
      <h1>Request PTO</h1><p>Submit planned paid time off for manager approval.</p>
    </div><button type="button" className="button button-outline" disabled={loading||acting} onClick={load}>Refresh</button></header>
    {profile.employment.length>1&&<label className="field"><span>Business</span>
      <select value={unit} onChange={e=>setUnit(e.target.value)}>
        {profile.employment.map(e=><option key={e.id} value={e.businessUnitId}>{e.businessName}</option>)}
      </select></label>}
    {error&&<p className="alert alert-error" role="alert">{error}</p>}
    {success&&<p className="alert" role="status">{success}</p>}
    <section className="content-card"><h2>Your PTO Balance</h2>
      <p><strong>{available.toFixed(2)} hours</strong> currently available to request.
        {balances?.pto?.pendingHours>0&&<> Another {balances.pto.pendingHours.toFixed(2)} hours are reserved by pending requests.</>}
      </p>
      <p>Sick leave is separate: {Number(balances?.sick?.balanceHours??0).toFixed(2)} hours available.
        This form is for planned PTO, not unexpected illness.</p>
      <p>Planned PTO must be requested at least {policy?.planned_notice_days??7} calendar days in advance. Requests are not automatically approved.</p>
    </section>
    <section className="content-card"><h2>New PTO Request</h2>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field"><span>First Day Off</span><input type="date" required min={firstAllowed} value={startDate}
            onChange={e=>{setStartDate(e.target.value);if(endDate<e.target.value)setEndDate(e.target.value);}} /></label>
          <label className="field"><span>Last Day Off</span><input type="date" required min={startDate||firstAllowed} value={endDate}
            onChange={e=>setEndDate(e.target.value)} /></label>
          {!multiDay&&<label className="field"><span>Paid Hours Requested</span><input type="number" required
            min="0.25" max={Math.min(24,160,Math.max(0,available))} step="0.25"
            value={hours} onChange={e=>setHours(e.target.value)} placeholder="e.g. 8" /></label>}
        </div>
        {multiDay&&<div className="content-card"><h3>Paid Hours by Date</h3>
          <p>Enter the exact number of PTO hours for each date. Leave a day at zero if no PTO should be paid for it.</p>
          <div className="form-grid">{dates.map(date=><label className="field" key={date}>
            <span>{date}</span><input type="number" min="0" max="24" step="0.25"
              value={dayHours[date]??'0'} onChange={e=>setDayHours(previous=>({...previous,[date]:e.target.value}))}/>
          </label>)}</div>
          <p><strong>Total PTO: {total.toFixed(2)} hours</strong> · Available: {available.toFixed(2)} hours</p>
          {!withinRange&&<p role="alert" className="alert alert-error">Split requests longer than 31 days.</p>}
        </div>}
        <label className="field"><span>Note to Management (optional)</span>
          <textarea maxLength={1000} rows={3} value={note} onChange={e=>setNote(e.target.value)}
            placeholder="Any scheduling details your manager should know" /></label>
        <p className="muted">Enter only the paid hours you want to use. Days you were not scheduled to work should not be charged.</p>
        <button type="submit" className="button" disabled={acting||loading||!balances||available<0.25||!withinRange||total<=0||total>available}>
          {acting?'Submitting…':'Submit PTO Request'}</button>
      </form>
    </section>
    <section className="content-card"><h2>Your Requests</h2>
      {!loading&&requests.length===0&&<p>No PTO requests have been submitted yet.</p>}
      {requests.map(r=><article key={r.id} className="content-card" style={{marginTop:'1rem'}}>
        <div className="field-section-heading"><div>
          <h3>{r.startDate}{r.endDate!==r.startDate?' through '+r.endDate:''}</h3>
          <p>{r.requestedHours.toFixed(2)} paid hours · {statusLabels[r.status]||r.status}</p>
        </div><span className="status-tag">{r.status}</span></div>
        {r.note&&<p>Note: {r.note}</p>}
        {r.managerNote&&<p>Management: {r.managerNote}</p>}
        {r.status==='pending'&&<button className="button button-outline" type="button"
          disabled={acting} onClick={()=>cancel(r.id)}>Cancel Pending Request</button>}
      </article>)}
    </section>
  </div>;
}
