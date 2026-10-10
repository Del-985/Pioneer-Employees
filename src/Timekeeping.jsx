import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from './lib/api.js';

const ZONE = 'America/Detroit';
function localDay(value = new Date()){
  const parts = new Intl.DateTimeFormat('en-US',{
    timeZone:ZONE,month:'2-digit',day:'2-digit',year:'numeric',
  }).formatToParts(value);
  const get=k=>parts.find(x=>x.type===k)?.value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
function monday(value = new Date()){
  const day = new Date(localDay(value)+'T12:00:00Z');
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay()+6)%7);
  return day.toISOString().slice(0,10);
}
function shiftWeek(week,days){
  const date=new Date(week+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
function localTime(value,detail=true){
  if(!value)return 'Not clocked out';
  return new Intl.DateTimeFormat('en-US',{
    timeZone:ZONE,month:'short',day:'numeric',
    ...(detail?{weekday:'short'}:{}),
    hour:'numeric',minute:'2-digit',timeZoneName:'short',
  }).format(new Date(value));
}
function duration(seconds=0){
  const rounded=Math.max(0,Math.round(seconds/60));
  return Math.floor(rounded/60)+'h '+String(rounded%60).padStart(2,'0')+'m';
}
function hours(seconds=0){return (Math.max(0,seconds)/3600).toFixed(2);}
const nice={open:'Clocked In',submitted:'Awaiting Approval',approved:'Approved',returned:'Needs Correction'};
function ErrorMessage({error}){return error?<p className="alert alert-error" role="alert">{error}</p>:null;}

export default function TimekeepingPage({profile}){
  const [unit,setUnit]=useState(profile.employment[0]?.businessUnitId||'');
  const [week,setWeek]=useState(()=>monday());
  const [time,setTime]=useState(null);
  const [jobs,setJobs]=useState([]);
  const [shifts,setShifts]=useState([]);
  const [shiftId,setShiftId]=useState('');
  const [jobId,setJobId]=useState('');
  const [working,setWorking]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [now,setNow]=useState(Date.now());
  const [fetchedAt,setFetchedAt]=useState(Date.now());
  const employee=useMemo(()=>profile.employment.find(e=>e.businessUnitId===unit),[profile,unit]);
  const load=useCallback(async()=>{
    if(!unit)return;
    setLoading(true);
    try{
      const [t,j,s]=await Promise.all([
        apiRequest('/api/employee/time?businessUnitId='+unit+'&weekStart='+week),
        apiRequest('/api/employee/jobs?businessUnitId='+unit+'&limit=100'),
        apiRequest('/api/employee/shifts?businessUnitId='+unit),
      ]);
      setTime(t.data);
      setFetchedAt(Date.now());
      setNow(Date.now());
      setJobs((j.data||[]).filter(x=>['scheduled','in_progress'].includes(x.status)));
      setShifts((s.data||[]).filter(x=>x.status!=='cancelled'&&
        x.offers?.some(offer=>offer.employeeId===employee?.id&&offer.status==='accepted')));
      setError('');
    }catch(err){setError(err instanceof Error?err.message:'Unable to load time records.');}
    finally{setLoading(false);}
  },[unit,week,employee?.id]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    const interval=setInterval(()=>setNow(Date.now()),15000);
    return()=>clearInterval(interval);
  },[]);
  const active=time?.activeEntry;
  // The API's workedSeconds already includes elapsed unpaid-break time at fetch.
  // Only add time since that snapshot, and do not add time while on an unpaid break.
  const liveSeconds=active?Math.max(0,(active.workedSeconds||0)+
    (active.breakStartedAt&&!active.breakPaid?0:Math.max(0,Math.round((now-fetchedAt)/1000)))):0;

  async function act(path,body,label){
    setWorking(path);setError('');setSuccess('');
    try{
      await apiRequest('/api/employee/time/'+path,{method:'POST',body:JSON.stringify(body)});
      await load();setSuccess(label);
    }catch(err){setError(err instanceof Error?err.message:'Unable to update your time clock.');}
    finally{setWorking('');}
  }
  const canClockIn=!active&&!!unit;
  const rows=time?.entries||[];
  const summary=time?.summary;
  const previous=shiftWeek(week,-7),next=shiftWeek(week,7);
  return <div className="page-body timekeeping-page">
    <header className="page-heading">
      <div><span className="eyebrow">Workforce Timekeeping</span>
        <h1>Hours & Time Clock</h1>
        <p>Track your shifts, breaks, and hours. Clock times use Eastern Time.</p>
      </div>
      <button type="button" className="button button-outline" disabled={loading||!!working}
        onClick={()=>void load()}>{loading?'Refreshing…':'Refresh'}</button>
    </header>
    {profile.employment.length>1&&<label className="field time-business-select">
      <span>Business</span><select value={unit} onChange={e=>{setUnit(e.target.value);setTime(null);setError('');}}>
        {profile.employment.map(e=><option key={e.id} value={e.businessUnitId}>{e.businessName}</option>)}
      </select>
    </label>}
    <ErrorMessage error={error}/>
    {success&&<p className="alert alert-success" role="status">{success}</p>}
    <div className="time-clock-grid">
      <section className="content-card time-clock-card">
        <div className="field-section-heading"><h2>Time Clock</h2>
          <span className={'status-tag '+(active?'status-in_progress':'')}>{active?'On the Clock':'Clocked Out'}</span>
        </div>
        {active?<div className="time-clock-active">
          <span className="time-live-label">Current Worked Time</span>
          <strong className="time-live-value" aria-live="off">{hours(liveSeconds)} <small>hrs</small></strong>
          <p className="muted">Clocked in {localTime(active.clockInAt)}</p>
          {active.missedClockOut&&<p className="alert alert-error">
            This clock-in is more than 16 hours old. Clock out when finished or ask your manager to correct it.
          </p>}
          {active.breakStartedAt&&<p className="alert alert-info">
            {active.breakPaid?'Paid':'Unpaid'} break started {localTime(active.breakStartedAt,false)}.
          </p>}
          <div className="time-clock-actions">
            {active.breakStartedAt?
              <button type="button" className="button button-outline" disabled={!!working}
                onClick={()=>act('break/end',{businessUnitId:unit},'Break ended.')}>End Break</button>:
              <>
                <button type="button" className="button button-outline" disabled={!!working}
                  onClick={()=>act('break/start',{businessUnitId:unit,paid:false},'Unpaid break started.')}>Start Unpaid Break</button>
                <button type="button" className="button button-outline" disabled={!!working}
                  onClick={()=>act('break/start',{businessUnitId:unit,paid:true},'Paid break started.')}>Start Paid Break</button>
              </>}
            <button type="button" className="button button-primary" disabled={!!working}
              onClick={()=>act('clock-out',{businessUnitId:unit},
                'Clock-out recorded. Your hours are ready for manager approval.')}>
              {working==='clock-out'?'Clocking Out…':'Clock Out'}
            </button>
          </div>
          <p className="muted footnote">Clock-out automatically ends an active break. Your manager reviews the resulting time entry.</p>
        </div>:
        <div className="time-clock-in-form">
          <p className="muted">Start a shift when you begin work. You may link it to an accepted shift or an assigned job.</p>
          <label className="field"><span>Accepted Shift (Optional)</span>
            <select value={shiftId} onChange={e=>setShiftId(e.target.value)}>
              <option value="">General Hours</option>
              {shifts.map(s=><option key={s.id} value={s.id}>{s.title} — {localTime(s.startsAt,false)}</option>)}
            </select>
          </label>
          <label className="field"><span>Assigned Job (Optional)</span>
            <select value={jobId} onChange={e=>setJobId(e.target.value)}>
              <option value="">Not Linked to a Specific Job</option>
              {jobs.map(j=><option value={j.id} key={j.id}>{j.workOrderNumber} — {j.title}</option>)}
            </select>
          </label>
          <button type="button" className="button button-primary button-full" disabled={!canClockIn||!!working}
            onClick={()=>act('clock-in',{businessUnitId:unit,shiftId:shiftId||null,workOrderId:jobId||null},
              'Clock-in recorded. Your shift has started.')}>
            {working==='clock-in'?'Clocking In…':'Clock In'}
          </button>
        </div>}
      </section>
      <section className="content-card">
        <h2>This Week</h2>
        <p className="muted">Completed shifts starting in this week. Active shifts are shown separately above.</p>
        <div className="time-stat-stack">
          <div><span>Total Recorded Hours</span><strong>{hours(summary?.totalSeconds)} h</strong></div>
          <div><span>Approved Hours</span><strong>{hours(summary?.approvedSeconds)} h</strong></div>
          <div><span>Awaiting Approval / Correction</span><strong>{hours(summary?.pendingSeconds)} h</strong></div>
          <div><span>Unpaid Breaks</span><strong>{duration(summary?.unpaidBreakSeconds)}</strong></div>
        </div>
        <Link className="time-card-link" to="/schedule">View My Schedule →</Link>
      </section>
    </div>
    <section className="content-card time-week-section">
      <div className="time-week-heading">
        <div><h2>My Timesheet</h2><p className="muted">Week of {new Date(week+'T12:00:00Z').toLocaleDateString('en-US',
          {month:'long',day:'numeric',year:'numeric',timeZone:'UTC'})}</p></div>
        <div className="time-week-controls">
          <button className="button button-outline button-small" type="button"
            onClick={()=>setWeek(previous)}>Previous Week</button>
          <button className="button button-outline button-small" type="button" onClick={()=>setWeek(monday())}>This Week</button>
          <button className="button button-outline button-small" type="button" onClick={()=>setWeek(next)}>Next Week</button>
        </div>
      </div>
      <div className="time-entry-list">
        {rows.map(entry=><article className="time-entry" key={entry.id}>
          <div className="time-entry-top"><strong>{localTime(entry.clockInAt)}</strong>
            <span className={'status-tag '+(entry.reviewStatus==='approved'?'status-completed':'')}>
              {nice[entry.reviewStatus]||entry.reviewStatus}</span></div>
          <p>{entry.clockOutAt?'Clocked Out '+localTime(entry.clockOutAt):'Still Clocked In'}
            {entry.missedClockOut&&<strong className="time-warning"> · Possible Missed Clock-Out</strong>}</p>
          <div className="time-entry-meta">
            <span>Worked: <strong>{duration(entry.workedSeconds)}</strong></span>
            <span>Unpaid Break: <strong>{duration(entry.unpaidBreakSeconds)}</strong></span>
            {entry.paidBreakSeconds>0&&<span>Paid Break: <strong>{duration(entry.paidBreakSeconds)}</strong></span>}
          </div>
          {entry.reviewNotes&&<p className="time-review-note">Manager note: {entry.reviewNotes}</p>}
          {entry.correctedAt&&<p className="table-secondary">Adjusted by management — original values retained in the audit history.</p>}
        </article>)}
        {!rows.length&&<div className="empty-state"><h3>No time entries for this week</h3>
          <p>Your shifts will appear here after clocking in.</p></div>}
      </div>
      <p className="muted footnote">Overnight shifts appear under the week they started. Hours are recorded, not payroll or proof of payment. Contact a manager about missing or incorrect punches.</p>
    </section>
  </div>;
}
