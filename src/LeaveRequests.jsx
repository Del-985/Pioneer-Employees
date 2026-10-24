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
function displayDate(date){
  if(!date)return '—';
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})
    .format(new Date(date+'T12:00:00Z'));
}
const statusLabels={pending:'Awaiting Approval',approved:'Approved',denied:'Denied',cancelled:'Cancelled'};
const typeLabel=type=>type==='sick'?'Sick Leave':'PTO';
const fmt=value=>Number(value||0).toFixed(2);

export default function LeaveRequests({profile}){
  const [unit,setUnit]=useState(profile.employment?.[0]?.businessUnitId||'');
  const [balances,setBalances]=useState(null),[policy,setPolicy]=useState(null),[requests,setRequests]=useState([]);
  const [startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState('');
  const [hours,setHours]=useState(''),[note,setNote]=useState('');
  const [leaveType,setLeaveType]=useState('pto'),[filter,setFilter]=useState('all');
  const [dayHours,setDayHours]=useState({});
  const [loading,setLoading]=useState(false),[acting,setActing]=useState(false);
  const [error,setError]=useState(''),[success,setSuccess]=useState('');

  const load=useCallback(async()=>{
    if(!unit)return;
    setLoading(true);setError('');
    try{
      const [balanceResponse,requestResponse]=await Promise.all([
        apiRequest('/api/employee/leave/balances?businessUnitId='+unit),
        apiRequest('/api/employee/leave/requests?businessUnitId='+unit),
      ]);
      setBalances(balanceResponse.data.balances);setPolicy(balanceResponse.data.policy);
      setRequests(requestResponse.data||[]);
    }catch(e){setError(e.message||'Could not load leave requests.');}
    finally{setLoading(false);}
  },[unit]);
  useEffect(()=>{setBalances(null);setPolicy(null);setRequests([]);void load();},[load]);

  const firstAllowed=afterDays(todayDetroit(),leaveType==='sick'?-30:(policy?.planned_notice_days??7));
  const available=balances?.[leaveType]?.balanceHours??0;
  const multiDay=Boolean(startDate&&endDate&&startDate!==endDate);
  const dates=[];
  if(startDate&&endDate&&startDate<=endDate){
    for(let day=startDate;day<=endDate&&dates.length<31;day=afterDays(day,1))dates.push(day);
  }
  const days=dates.map(date=>({date,hours:Number(dayHours[date]||0)})).filter(d=>d.hours>0);
  const total=multiDay?Number(days.reduce((n,d)=>n+d.hours,0).toFixed(2)):Number(hours);
  const withinRange=dates.length>0&&endDate<=afterDays(startDate,30);
  const filtered=filter==='all'?requests:requests.filter(r=>filter==='pending'?r.status==='pending':r.leaveType===filter);
  const pendingCount=requests.filter(r=>r.status==='pending').length;
  const canSubmit=!acting&&!loading&&!!balances&&available>=0.25&&withinRange&&total>0&&total<=available;

  async function submit(e){
    e.preventDefault();setError('');setSuccess('');setActing(true);
    try{
      if(!withinRange||total<=0||total>available)throw new Error('Check the leave dates and available balance.');
      await apiRequest('/api/employee/leave/requests',{method:'POST',
        body:JSON.stringify({businessUnitId:unit,leaveType,startDate,endDate,requestedHours:total,note,
          ...(multiDay?{days}:{})})});
      setSuccess(leaveType==='pto'?'PTO request submitted for management review.':
        'Sick leave recorded. No advance notice or management approval was required.');
      setStartDate('');setEndDate('');setHours('');setDayHours({});setNote('');
      await load();
    }catch(e){setError(e.message||'Unable to submit leave request.');}
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

  return <div className="page-body leave-page">
    <header className="page-heading">
      <div><span className="eyebrow">Employee Benefits</span>
        <h1>Request PTO</h1>
        <p>Plan paid time off, record sick leave, and track your available hours.</p>
      </div>
      <button type="button" className="button button-outline" disabled={loading||acting} onClick={()=>void load()}>
        {loading?'Refreshing…':'Refresh'}
      </button>
    </header>

    {profile.employment.length>1&&<label className="field leave-business-select"><span>Business</span>
      <select value={unit} onChange={e=>{setUnit(e.target.value);setError('');setSuccess('');}}>
        {profile.employment.map(e=><option key={e.id} value={e.businessUnitId}>{e.businessName}</option>)}
      </select>
    </label>}
    {error&&<p className="alert alert-error" role="alert">{error}</p>}
    {success&&<p className="alert alert-success" role="status">{success}</p>}

    <div className="leave-balance-grid" aria-label="Paid leave balances">
      {['pto','sick'].map(type=><section className="content-card leave-balance-card" key={type}>
        <span className="leave-kicker">{typeLabel(type)} Available</span>
        <div className="leave-balance-value">{balances?fmt(balances[type]?.balanceHours):'—'} <small>hours</small></div>
        <p className="muted">{type==='pto'?'30-day eligibility · 7-day request notice':'No advance notice or approval required'}</p>
        {type==='pto'&&Number(balances?.pto?.pendingHours||0)>0&&
          <span className="leave-balance-reserved">{fmt(balances.pto.pendingHours)} hours awaiting approval</span>}
      </section>)}
    </div>

    <div className="leave-main-grid">
      <section className="content-card leave-form-card">
        <div className="field-section-heading leave-section-heading">
          <div><span className="eyebrow">New Leave Entry</span>
            <h2>{leaveType==='pto'?'Request Paid Time Off':'Record Sick Leave'}</h2>
            <p className="muted">{leaveType==='pto'?
              'Planned PTO requests are sent to management for approval.':
              'Sick leave is recorded immediately using your accrued balance.'}</p>
          </div>
        </div>
        <form className="leave-request-form" onSubmit={submit}>
          <label className="field"><span>Leave Type</span>
            <select value={leaveType} onChange={e=>{
              setLeaveType(e.target.value);setStartDate('');setEndDate('');setHours('');setDayHours({});setError('');
            }}>
              <option value="pto">Planned PTO (7-day notice)</option>
              <option value="sick">Sick Leave (no notice)</option>
            </select>
          </label>
          <div className="leave-form-grid">
            <label className="field"><span>First Day Off</span>
              <input type="date" required min={firstAllowed} value={startDate}
                onChange={e=>{setStartDate(e.target.value);if(endDate<e.target.value)setEndDate(e.target.value);}}/>
            </label>
            <label className="field"><span>Last Day Off</span>
              <input type="date" required min={startDate||firstAllowed} value={endDate}
                onChange={e=>setEndDate(e.target.value)}/>
            </label>
          </div>
          {!multiDay&&<label className="field leave-hours-field"><span>Paid Hours Requested</span>
            <input type="number" required min="0.25" max={Math.min(24,160,Math.max(0,available))}
              step="0.25" value={hours} onChange={e=>setHours(e.target.value)} placeholder="e.g. 8"/>
          </label>}
          {multiDay&&<div className="leave-day-allocation">
            <div className="field-section-heading"><div><h3>Paid Hours by Date</h3>
              <p className="muted">Enter hours only on dates you would otherwise work.</p></div>
            </div>
            <div className="leave-day-grid">{dates.map(date=><label className="field" key={date}>
              <span>{displayDate(date)}</span>
              <input type="number" min="0" max="24" step="0.25" value={dayHours[date]??'0'}
                onChange={e=>setDayHours(previous=>({...previous,[date]:e.target.value}))}/>
            </label>)}</div>
            {!withinRange&&<p role="alert" className="alert alert-error">Split requests longer than 31 days.</p>}
          </div>}
          <label className="field"><span>Note to Management (Optional)</span>
            <textarea maxLength={1000} rows={3} value={note} onChange={e=>setNote(e.target.value)}
              placeholder="Any scheduling details your manager should know"/>
          </label>
          <div className="leave-request-summary" aria-live="polite">
            <div><span>Paid Leave Requested</span><strong>{fmt(total)} hours</strong></div>
            <div><span>Available Balance</span><strong>{fmt(available)} hours</strong></div>
          </div>
          <button type="submit" className="button button-primary leave-submit" disabled={!canSubmit}>
            {acting?'Submitting…':leaveType==='pto'?'Submit PTO Request':'Record Paid Sick Leave'}
          </button>
          <p className="muted leave-form-footnote">Paid hours do not count toward overtime or additional leave accrual.</p>
        </form>
      </section>

      <aside className="content-card leave-policy-card">
        <span className="eyebrow">Leave Policy</span>
        <h2>Before You Submit</h2>
        <div className="leave-policy-list">
          <div><strong>Paid Time Off</strong><p>Accrues from your first day. Available to use after 30 calendar days of employment; request at least {policy?.planned_notice_days??7} calendar days ahead.</p></div>
          <div><strong>Sick Leave</strong><p>No advance notice is required. Notify management as soon as reasonably possible when you are unable to work.</p></div>
          <div><strong>Unused Leave</strong><p>Both balances carry forward without annual caps and are paid out upon separation.</p></div>
        </div>
      </aside>
    </div>

    <section className="content-card leave-history">
      <div className="field-section-heading leave-section-heading">
        <div><h2>Leave History</h2><p className="muted">Review previous requests and manager decisions.</p></div>
        <label className="field leave-history-filter"><span>Show</span>
          <select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="all">All Leave</option>
            <option value="pending">Awaiting Approval ({pendingCount})</option>
            <option value="pto">PTO Only</option>
            <option value="sick">Sick Leave Only</option>
          </select>
        </label>
      </div>
      {!loading&&filtered.length===0&&<div className="empty-state">
        {requests.length===0?'No leave requests have been submitted yet.':'No entries match this filter.'}
      </div>}
      <div className="leave-history-list">
        {filtered.map(r=><article key={r.id} className="leave-history-entry">
          <div className="leave-entry-top"><div>
            <span className="leave-entry-type">{typeLabel(r.leaveType)}</span>
            <h3>{displayDate(r.startDate)}{r.endDate!==r.startDate?' – '+displayDate(r.endDate):''}</h3>
            <p className="muted">{fmt(r.requestedHours)} paid hours</p>
          </div>
            <span className={'status-tag leave-status leave-status-'+r.status}>{statusLabels[r.status]||r.status}</span>
          </div>
          {r.note&&<p className="leave-entry-note"><strong>Note:</strong> {r.note}</p>}
          {r.managerNote&&<p className="leave-entry-note"><strong>Management:</strong> {r.managerNote}</p>}
          {r.status==='pending'&&<button type="button" className="button button-outline button-small"
            disabled={acting} onClick={()=>void cancel(r.id)}>Cancel Pending Request</button>}
        </article>)}
      </div>
    </section>
  </div>;
}
