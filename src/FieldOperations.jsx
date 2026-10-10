import { useCallback,useEffect,useMemo,useState,useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, API_BASE_URL } from './lib/api.js';
import { prepareFieldPhoto } from './lib/photo.js';

const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const statusLabel={assigned:'Assigned',acknowledged:'Acknowledged',in_progress:'In Progress',
 issue:'Issue Flagged',submitted:'Awaiting Review',approved:'Approved',rejected:'Revision Required'};
const shortTime=(v)=>v?.slice(0,5)||'';
const fmt=(value)=>value?new Intl.DateTimeFormat('en-US',{
 weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',
}).format(new Date(value)):'Not Scheduled';
const workUnit=(profile)=>profile.employment?.[0]?.businessUnitId||'';
const errText=(err)=>err instanceof Error?err.message:'Unable to complete this operation.';
const photoUrl=(url)=>url?.startsWith('/')?API_BASE_URL+url:url;
function Notice({error,success}){
 return <>{error&&<p className="alert alert-error" role="alert">{error}</p>}
 {success&&<p className="alert alert-success" role="status">{success}</p>}</>;
}

export function FieldJobActions({job,onChanged}){
 const [report,setReport]=useState(null);
 const [photos,setPhotos]=useState([]);
 const [photoEnabled,setPhotoEnabled]=useState(false);
 const [notes,setNotes]=useState('');
 const [issueNotes,setIssueNotes]=useState('');
 const [salt,setSalt]=useState(false);
 const [amount,setAmount]=useState('');
 const [kind,setKind]=useState('before');
 const [file,setFile]=useState(null);
 const photoInput=useRef(null);
 const [uploadStage,setUploadStage]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const load=useCallback(async()=>{
   const [rep,pics,capabilities]=await Promise.all([
     apiRequest('/api/employee/jobs/'+job.id+'/report'),
     apiRequest('/api/employee/jobs/'+job.id+'/photos'),
     apiRequest('/api/employee/capabilities'),
   ]);
   setReport(rep.data);setPhotos(Array.isArray(pics.data)?pics.data:[]);
   setPhotoEnabled(capabilities.data?.photoUploads===true);
 },[job.id]);
 useEffect(()=>{let active=true;load().catch(e=>{if(active)setError(errText(e));});return()=>{active=false;};},[load]);
 const status=report?.status||'assigned';
 const closed=['completed','cancelled','draft'].includes(job.status);
 const locked=closed||['submitted','approved'].includes(status);
 const actions={
   acknowledge:['assigned','rejected'].includes(status),
   start:['assigned','acknowledged','issue','rejected'].includes(status),
   issue:['assigned','acknowledged','in_progress','issue','rejected'].includes(status),
   submit:['in_progress','issue','rejected'].includes(status),
 };
 async function takeAction(action){
   setBusy(true);setError('');setSuccess('');
   try{
     const response=await apiRequest('/api/employee/jobs/'+job.id+'/action',{
       method:'POST',body:JSON.stringify({action,
         completionNotes:notes.trim()||undefined,
         issueNotes:issueNotes.trim()||undefined,
         saltApplied:salt,saltAmountLbs:salt&&amount!==''?Number(amount):null,
       })
     });
     setReport(response.data);
     setSuccess(action==='submit'?'Completion report sent for manager review.':
       action==='issue'?'The issue was reported.':'Job progress updated.');
     if(onChanged)await onChanged();
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function uploadPhoto(event){
   event.preventDefault();
   if(!file)return;
   setBusy(true);setError('');setSuccess('');
   try {
     setUploadStage('Preparing photo…');
     const prepared=await prepareFieldPhoto(file);
     setUploadStage('Requesting upload…');
     const intent=await apiRequest('/api/employee/jobs/'+job.id+'/photos/upload-intent',{
       method:'POST',
       body:JSON.stringify({
         kind,fileName:prepared.name,contentType:prepared.type,byteSize:prepared.size
       })
     });
     const destination=intent.data;
     setUploadStage('Uploading photo…');
     if(destination.storageProvider==='database'){
       if(!destination.uploadPath)throw new Error('The photo upload destination was not provided.');
       await apiRequest(destination.uploadPath,{
         method:'POST',
         headers:{'Content-Type':'application/octet-stream'},
         body:prepared,
       });
     }else if(destination.storageProvider==='object_storage' && destination.uploadUrl){
       const response=await fetch(destination.uploadUrl,{
         method:'PUT',headers:{'Content-Type':prepared.type},body:prepared
       });
       if(!response.ok)throw new Error('Photo storage rejected the upload. Ask your manager to check storage permissions.');
     }else{
       throw new Error('This upload destination is not supported. Refresh the page and retry.');
     }
     setUploadStage('Confirming photo…');
     await apiRequest('/api/employee/photos/'+destination.id+'/complete',{method:'POST'});
     setFile(null);
     if(photoInput.current)photoInput.current.value='';
     await load();
     setSuccess('Photo uploaded. Your manager can view it from the job report.');
   }catch(e){setError(errText(e));}
   finally{setBusy(false);setUploadStage('');}
 }
 return <section className="content-card detail-wide field-workflow">
   <div className="field-section-heading"><div><h2>Field Report</h2>
     <p className="muted">Record the work you performed. Your manager reviews submitted reports.</p></div>
     <span className={'status-tag status-'+(status==='approved'?'completed':status)}>{statusLabel[status]||status}</span>
   </div>
   <Notice error={error} success={success}/>
   {report?.managerNotes&&<p className="alert alert-info"><strong>Manager Feedback:</strong> {report.managerNotes}</p>}
   {report?.completionNotes&&locked&&<p className="muted"><strong>Submitted notes:</strong> {report.completionNotes}</p>}
   {!locked&&<div className="field-form">
     <label className="field"><span>Work Notes</span>
       <textarea rows={3} maxLength={5000} value={notes} onChange={e=>setNotes(e.target.value)}
         placeholder="Describe the work completed, access problems, conditions…"/></label>
     <label className="field"><span>Issue Details (required when flagging)</span>
       <textarea rows={2} maxLength={2000} value={issueNotes} onChange={e=>setIssueNotes(e.target.value)}
         placeholder="What needs your manager's attention?"/></label>
     <div className="field-inline">
       <label className="checkbox-label"><input type="checkbox" checked={salt} onChange={e=>setSalt(e.target.checked)}/> Salt Applied</label>
       {salt&&<label className="field"><span>Salt Amount (lbs, optional)</span>
         <input type="number" min="0" max="1000" step=".25" value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
     </div>
     <div className="field-buttons">
       {actions.acknowledge&&<button type="button" className="button button-outline" disabled={busy} onClick={()=>takeAction('acknowledge')}>Acknowledge</button>}
       {actions.start&&<button type="button" className="button button-primary" disabled={busy} onClick={()=>takeAction('start')}>Start Job</button>}
       {actions.issue&&<button type="button" className="button button-outline" disabled={busy||!issueNotes.trim()} onClick={()=>takeAction('issue')}>Flag Issue</button>}
       {actions.submit&&<button type="button" className="button button-primary" disabled={busy} onClick={()=>takeAction('submit')}>Submit Completion</button>}
     </div>
   </div>}
   {closed&&<p className="muted">This job is closed or has not been scheduled. Progress updates are unavailable.</p>}
   <div className="field-photo-section">
     <h3>Job Photographs</h3>
     {photos.length>0&&<div className="field-photos">{photos.map(photo=>
       <a className="field-photo" href={photoUrl(photo.downloadUrl)} key={photo.id} target="_blank" rel="noopener noreferrer">
         <img loading="lazy" src={photoUrl(photo.downloadUrl)} alt={photo.kind+' photo for '+job.title}/>
         <span>{photo.kind==='before'?'Before':photo.kind==='after'?'After':'Issue'}</span>
       </a>
     )}</div>}
     {!photos.length&&<p className="muted">No photographs have been uploaded for this job.</p>}
     {!photoEnabled&&<p className="alert alert-info">Checking photo storage availability. If this message remains, refresh or ask your manager.</p>}
     {!locked&&photoEnabled&&<form className="field-photo-upload" onSubmit={uploadPhoto}>
       <label className="field"><span>Photo Type</span><select value={kind} onChange={e=>setKind(e.target.value)}>
         <option value="before">Before</option><option value="after">After</option><option value="issue">Issue</option>
       </select></label>
       <label className="field"><span>Choose or Take Photo</span>
         <input ref={photoInput} type="file" accept="image/*,.heic,.heif" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
       <button className="button button-outline" type="submit" disabled={busy||!file}>{busy ? (uploadStage||"Uploading…") : "Upload Photo"}</button>
     </form>}
     <p className="muted footnote">JPEG, PNG, WebP and supported iPhone camera photos. Large images are resized to conserve mobile data. Files are private and limited to 10 MB after preparation.</p>
   </div>
 </section>;
}

export function AvailabilityPage({profile}){
 const [unit,setUnit]=useState(workUnit(profile));
 const [slots,setSlots]=useState([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 useEffect(()=>{let active=true;apiRequest('/api/employee/availability?businessUnitId='+unit).then(r=>{
   if(active)setSlots((r.data||[]).map(s=>({weekday:s.weekday,
     startTime:shortTime(s.startTime),endTime:shortTime(s.endTime),available:s.available,notes:s.notes||''})));
 }).catch(e=>{if(active)setError(errText(e));});return()=>{active=false;};},[unit]);
 function edit(i,key,value){setSlots(s=>s.map((x,n)=>n===i?{...x,[key]:value}:x));}
 async function save(){
  setBusy(true);setError('');setSuccess('');
  try{
   await apiRequest('/api/employee/availability',{method:'PUT',body:JSON.stringify({
     businessUnitId:unit,slots:slots.map(s=>({weekday:Number(s.weekday),startTime:s.startTime,
       endTime:s.endTime,available:s.available,notes:s.notes.trim()||null}))
   })});
   setSuccess('Weekly availability saved. Overnight hours are supported.');
  }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 return <div className="page-body"><header className="page-heading"><div>
   <span className="eyebrow">Scheduling Preferences</span><h1>My Availability</h1>
   <p>List the hours you are normally available. Overnight time ranges may end the next day.</p>
 </div></header>
 <div className="content-card">
   {profile.employment.length>1&&<label className="field"><span>Business</span>
    <select value={unit} onChange={e=>setUnit(e.target.value)}>
      {profile.employment.map(e=><option key={e.id} value={e.businessUnitId}>{e.businessName}</option>)}
    </select></label>}
   <Notice error={error} success={success}/>
   {slots.map((s,i)=><div className="availability-row" key={i}>
     <label className="field"><span>Day</span><select value={s.weekday} onChange={e=>edit(i,'weekday',Number(e.target.value))}>
       {DAYS.map((day,n)=><option key={day} value={n}>{day}</option>)}
     </select></label>
     <label className="field"><span>From</span><input type="time" value={s.startTime} onChange={e=>edit(i,'startTime',e.target.value)}/></label>
     <label className="field"><span>To</span><input type="time" value={s.endTime} onChange={e=>edit(i,'endTime',e.target.value)}/></label>
     <label className="field availability-notes"><span>Notes</span>
       <input maxLength={500} value={s.notes} onChange={e=>edit(i,'notes',e.target.value)} placeholder="Optional"/></label>
     <label className="checkbox-label"><input type="checkbox" checked={s.available} onChange={e=>edit(i,'available',e.target.checked)}/> Available</label>
     <button type="button" className="button button-outline" onClick={()=>setSlots(a=>a.filter((_,j)=>j!==i))}>Remove</button>
   </div>)}
   <div className="field-buttons">
     <button type="button" className="button button-outline" disabled={slots.length>=30} onClick={()=>setSlots(a=>[...a,{
       weekday:0,startTime:'20:00',endTime:'06:00',available:true,notes:''}])}>Add Time Range</button>
     <button type="button" className="button button-primary" disabled={busy} onClick={save}>{busy?'Saving…':'Save Availability'}</button>
   </div>
   <p className="muted footnote">Availability is informative; accepting a shift offer is a separate action.</p>
 </div></div>;
}

export function ShiftOffersPage({profile}){
 const [unit,setUnit]=useState(workUnit(profile));
 const [shifts,setShifts]=useState([]);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const [busy,setBusy]=useState('');
 const load=useCallback(async()=>{
  try{const res=await apiRequest('/api/employee/shifts?businessUnitId='+unit);
   setShifts(Array.isArray(res.data)?res.data:[]);}catch(e){setError(errText(e));}
 },[unit]);
 useEffect(()=>{void load();},[load]);
 async function reply(shift,response){
   setBusy(shift.id);setError('');setSuccess('');
   try{await apiRequest('/api/employee/shifts/'+shift.id+'/respond',{
     method:'POST',body:JSON.stringify({response})});
     await load();setSuccess('Shift '+(response==='accepted'?'accepted.':'declined.'));
   }catch(e){setError(errText(e));}finally{setBusy('');}
 }
 const employeeId=profile.employment.find(e=>e.businessUnitId===unit)?.id;
 return <div className="page-body"><header className="page-heading"><div>
   <span className="eyebrow">Staffing</span><h1>Shift Offers</h1>
   <p>Respond to available shifts. Your manager controls final job and route assignments.</p>
 </div></header>
 {profile.employment.length>1&&<label className="field"><span>Business</span>
   <select value={unit} onChange={e=>setUnit(e.target.value)}>{profile.employment.map(e=><option key={e.id} value={e.businessUnitId}>{e.businessName}</option>)}</select>
 </label>}
 <Notice error={error} success={success}/>
 <div className="job-grid">{shifts.map(shift=>{
   const offer=shift.offers?.find(o=>o.employeeId===employeeId);
   return <article key={shift.id} className="job-card">
     <div className="job-card-top"><span className="job-number">{shift.capacity} Position{shift.capacity!==1?'s':''}</span>
       <span className="status-tag">{offer?.status||shift.status}</span></div>
     <h3>{shift.title}</h3><p className="muted">{shift.description||'No additional details.'}</p>
     <p className="featured-time">{fmt(shift.startsAt)}</p>
     <p className="muted">Ends: {fmt(shift.endsAt)} · Accepted: {shift.acceptedCount}/{shift.capacity}</p>
     {shift.status==='open'&&['offered','declined','accepted'].includes(offer?.status)&&
       <div className="field-buttons">
         {offer.status!=='accepted'&&<button type="button" className="button button-primary" disabled={!!busy} onClick={()=>reply(shift,'accepted')}>Accept Shift</button>}
         {offer.status!=='declined'&&<button type="button" className="button button-outline" disabled={!!busy} onClick={()=>reply(shift,'declined')}>Decline Shift</button>}
       </div>}
   </article>;
 })}</div>
 {!shifts.length&&<div className="empty-state"><h3>No shift offers yet</h3><p>New offers will appear here when dispatched by your manager.</p></div>}
 </div>;
}

export function CrewRoutesPage({profile}){
 const [unit,setUnit]=useState(workUnit(profile));
 const [routes,setRoutes]=useState([]);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{
   try{const res=await apiRequest('/api/employee/routes?businessUnitId='+unit);
     setRoutes(Array.isArray(res.data)?res.data:[]);}catch(e){setError(errText(e));}
 },[unit]);
 useEffect(()=>{void load();},[load]);
 return <div className="page-body">
  <header className="page-heading"><div><span className="eyebrow">Route Dispatch</span>
    <h1>My Routes</h1><p>Stop order and crew assignments from Pioneer Admin.</p></div>
    <button type="button" className="button button-outline" onClick={load}>Refresh</button></header>
  {profile.employment.length>1&&<label className="field"><span>Business</span>
    <select value={unit} onChange={e=>setUnit(e.target.value)}>{profile.employment.map(e=><option key={e.id} value={e.businessUnitId}>{e.businessName}</option>)}</select></label>}
  <Notice error={error}/>
  <div className="schedule-list">{routes.map(route=><section className="content-card" key={route.id}>
    <div className="field-section-heading"><div><span className="eyebrow">{route.status}</span>
      <h2>{route.name}</h2><p className="muted">{fmt(route.startsAt)}</p></div>
      <span className="status-tag">{route.jobs?.length||0} Stops</span></div>
    {route.notes&&<p className="muted">{route.notes}</p>}
    <p className="muted"><strong>Crew:</strong> {route.members?.map(e=>e.name).join(', ')||'Unassigned'}</p>
    {route.jobs?.map((job,i)=><Link className="schedule-item" to={'/jobs/'+job.id} key={job.id}>
      <div><strong>Stop {i+1}: {job.title}</strong><span>{job.number}</span></div>
      <span className="status-tag">{job.status.replaceAll('_',' ')}</span>
    </Link>)}
  </section>)}</div>
  {!routes.length&&<div className="empty-state"><h3>No routes assigned</h3><p>Your manager will assign you to a route when needed.</p></div>}
 </div>;
}
