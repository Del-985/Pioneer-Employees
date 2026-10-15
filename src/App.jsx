import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest, saveEmployeeSession, clearEmployeeSession } from './lib/api.js';
import { FieldJobActions, AvailabilityPage, ShiftOffersPage, CrewRoutesPage } from './FieldOperations.jsx';
import TimekeepingPage from './Timekeeping.jsx';
import GrossPayPage from './GrossPay.jsx';

const navigation = [
  { to: '/', label: 'Dashboard', symbol: '▦', end: true },
  { to: '/jobs', label: 'My Jobs', symbol: '▤' },
  { to: '/time', label: 'Hours', symbol: '◷' },
  { to: '/pay', label: 'My Pay', symbol: '¢' },
  { to: '/schedule', label: 'Schedule', symbol: '▦' },
  { to: '/shifts', label: 'Shifts', symbol: '◷' },
  { to: '/availability', label: 'Availability', symbol: '◴' },
  { to: '/routes', label: 'Routes', symbol: '≡' },
  { to: '/profile', label: 'Profile', symbol: '◉' },
];

const statusNames = {
  draft: 'Needs Scheduling',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function statusName(status) {
  return statusNames[status] || status || 'Unknown';
}

function dateTime(value) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(date);
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unscheduled';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(date);
}

function addressText(address) {
  if (!address) return '';
  return [address.addressLine1, address.addressLine2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
}

function StatusTag({ status }) {
  return <span className={'status-tag status-' + status}>{statusName(status)}</span>;
}

function Brand({ compact = false }) {
  return (
    <div className={'brand ' + (compact ? 'brand-compact' : '')}>
      <span className="brand-emblem" aria-hidden="true">P</span>
      <span className="brand-text"><strong>Pioneer</strong><small>Employee Portal</small></span>
    </div>
  );
}

function ErrorMessage({ message }) {
  return message ? <p className="alert alert-error" role="alert">{message}</p> : null;
}

function Notice({ children }) {
  return <div className="alert alert-success" role="status">{children}</div>;
}

function usePortalAuth() {
  const [session, setSession] = useState({ status: 'checking', profile: null, error: '' });
  const authRequestId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++authRequestId.current;
    try {
      const response = await apiRequest('/api/employee/me');
      if (authRequestId.current !== id) return;
      if (!response.data?.user || !Array.isArray(response.data?.employment)) {
        throw new Error('The employee profile response was incomplete.');
      }
      setSession({ status: 'authenticated', profile: response.data, error: '' });
    } catch (error) {
      if (authRequestId.current !== id) return;
      if (error instanceof ApiError && error.status === 401) {
        clearEmployeeSession();
        setSession({ status: 'anonymous', profile: null, error: '' });
      } else if (error instanceof ApiError && error.status === 403) {
        clearEmployeeSession();
        setSession({ status: 'denied', profile: null, error: error.message });
      } else {
        setSession({
          status: 'error', profile: null,
          error: error instanceof Error ? error.message : 'Unable to connect to the employee workspace.',
        });
      }
    }
  }, []);

  useEffect(() => {
    // Never attempt to authenticate employees over an unencrypted production URL.
    if (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)) {
      void refresh();
    }
  }, [refresh]);

  async function login(email, password) {
    const id = ++authRequestId.current;
    const response = await apiRequest('/api/employee/session/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (authRequestId.current !== id) return;
    const data = response.data;
    if (!data?.token || !data?.expiresAt) {
      throw new Error('Employee login succeeded but no usable session was returned.');
    }
    saveEmployeeSession(data.token, data.expiresAt);
    try {
      // Verify the same authenticated request the dashboard will use.
      // This works on Safari even when it discards the API's cookies.
      const result = await apiRequest('/api/employee/me');
      if (authRequestId.current !== id) return;
      if (!result.data?.user || !Array.isArray(result.data?.employment)) {
        throw new Error('The employee profile response was incomplete.');
      }
      setSession({ status: 'authenticated', profile: result.data, error: '' });
    } catch (error) {
      clearEmployeeSession();
      setSession({ status: 'anonymous', profile: null, error: '' });
      throw error;
    }
  }

  async function logout() {
    ++authRequestId.current;
    try {
      await apiRequest('/api/employee/session/logout', { method: 'POST' });
    } finally {
      clearEmployeeSession();
      setSession({ status: 'anonymous', profile: null, error: '' });
    }
  }

  return { ...session, refresh, login, logout };
}

function SignIn({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      await onLogin(email.trim(), password);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-background">
      <div className="auth-layout">
        <div className="auth-aside">
          <Brand />
          <div className="auth-aside-copy">
            <span className="eyebrow">Pioneer Legacy Works</span>
            <h1>Your work. One place.</h1>
            <p>Check your assignments, review your schedule, and stay connected with your team.</p>
          </div>
          <p className="auth-aside-foot">Built for the people doing the work.</p>
        </div>
        <form className="auth-card" onSubmit={submit}>
          <span className="eyebrow">Welcome Back</span>
          <h2>Employee Sign In</h2>
          <p className="muted">Use the email and password issued for your Pioneer employee account.</p>
          <label className="field">
            <span>Email Address</span>
            <input type="email" autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <ErrorMessage message={error} />
          <button className="button button-primary button-full" type="submit" disabled={busy}>
            {busy ? 'Signing In…' : 'Sign In'}
          </button>
          <Link className="auth-link" to="/forgot-password">Forgot Password?</Link>
          <p className="auth-help">Don't have access yet? Ask your manager to send an account invitation.</p>
        </form>
      </div>
    </div>
  );
}

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await apiRequest('/api/auth/password/reset/request', {
        method: 'POST', body: JSON.stringify({ email: email.trim() }),
      });
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to request a password reset.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-background">
      <div className="auth-card auth-card-centered">
        <Brand compact />
        <span className="eyebrow">Account Recovery</span>
        <h1>Reset Your Password</h1>
        {complete ? (
          <>
            <Notice>If an active account exists for that email address, a password-reset link has been requested. It expires in 30 minutes.</Notice>
            <Link className="button button-primary button-full" to="/login">Return to Sign In</Link>
          </>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <p className="muted">Enter your employee email to receive a secure reset link.</p>
            <label className="field"><span>Email Address</span>
              <input type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </label>
            <ErrorMessage message={error} />
            <button className="button button-primary button-full" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send Reset Link'}
            </button>
            <Link className="auth-link" to="/login">Back to Sign In</Link>
          </form>
        )}
      </div>
    </div>
  );
}

function ResetPassword() {
  const [searchParams] = useSearchParams();
  // HashRouter stores router queries after #; email links may put the token before #.
  const token = searchParams.get('token') || new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault(); setError('');
    if (password.length < 12) { setError('Use at least 12 characters.'); return; }
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    if (!token) { setError('This link has no security token. Request a new one.'); return; }

    setBusy(true);
    try {
      await apiRequest('/api/auth/password/reset', {
        method: 'POST', body: JSON.stringify({ token, newPassword: password }),
      });
      setPassword(''); setConfirm(''); setComplete(true);
      window.history.replaceState(null, '', window.location.pathname + '#/reset-password');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reset the password.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-background">
      <div className="auth-card auth-card-centered">
        <Brand compact />
        <span className="eyebrow">Secure Account Setup</span>
        <h1>Choose a Password</h1>
        {complete ? (
          <>
            <Notice>Your password has been set. You can now sign in to your employee workspace.</Notice>
            <Link className="button button-primary button-full" to="/login">Go to Sign In</Link>
          </>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <p className="muted">Create a password of at least 12 characters. The reset link is single-use.</p>
            {!token && <ErrorMessage message="This reset link is incomplete or invalid. Request a new link." />}
            <label className="field"><span>New Password</span>
              <input type="password" minLength={12} maxLength={200} autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required disabled={!token} />
            </label>
            <label className="field"><span>Confirm Password</span>
              <input type="password" minLength={12} maxLength={200} autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={!token} />
            </label>
            <ErrorMessage message={error} />
            <button className="button button-primary button-full" type="submit" disabled={busy || !token}>
              {busy ? 'Saving…' : 'Set Password'}
            </button>
            <Link className="auth-link" to="/forgot-password">Request a New Link</Link>
          </form>
        )}
      </div>
    </div>
  );
}

function Restricted({ message, onLogout, onRetry }) {
  return (
    <div className="auth-background">
      <div className="auth-card auth-card-centered">
        <Brand compact />
        <span className="eyebrow">Access Required</span>
        <h1>Employee Access Unavailable</h1>
        <p className="muted">{message || 'No active employee profile is linked to this account.'}</p>
        <p className="muted">If you are a manager, use Pioneer Admin. Otherwise, ask your manager to confirm your employee record is linked to the correct account.</p>
        <button type="button" className="button button-primary button-full" onClick={onRetry}>Try Again</button>
        <button type="button" className="button button-quiet button-full" onClick={onLogout}>Sign Out</button>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="loading-screen">
      <Brand compact />
      <div className="spinner" aria-hidden="true" />
      <p>Loading your employee workspace…</p>
    </div>
  );
}

function EmptyState({ title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">▤</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function JobCard({ job }) {
  const address = addressText(job.serviceAddress);
  return (
    <article className="job-card">
      <div className="job-card-top">
        <span className="job-number">{job.workOrderNumber}</span>
        <StatusTag status={job.status} />
      </div>
      <h3><Link to={'/jobs/' + job.id}>{job.title}</Link></h3>
      <p className="job-customer">{job.customerName}</p>
      <div className="job-card-details">
        <div><span className="meta-label">Scheduled</span><strong>{dateTime(job.scheduledStart)}</strong></div>
        {address && <div><span className="meta-label">Location</span><span>{address}</span></div>}
      </div>
      <Link className="button button-outline button-small" to={'/jobs/' + job.id}>View Job Details <span aria-hidden="true">→</span></Link>
    </article>
  );
}

function Dashboard({ profile, jobs, loading, error, onRefresh }) {
  const active = jobs.filter((job) => ['scheduled', 'in_progress', 'draft'].includes(job.status));
  const upcoming = [...active].sort((a,b) => {
    const da = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Number.MAX_SAFE_INTEGER;
    return da - db;
  });
  const next = upcoming[0];
  const complete = jobs.filter((job) => job.status === 'completed').length;
  const firstName = (profile.user.displayName || 'Team Member').trim().split(' ')[0];

  return (
    <div className="page-body">
      <header className="page-heading">
        <div><span className="eyebrow">Your Workspace</span><h1>Good to see you, {firstName}.</h1>
          <p>Here's what's on your plate at Pioneer.</p></div>
        <button className="button button-outline" type="button" disabled={loading} onClick={onRefresh}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      <ErrorMessage message={error} />
      <div className="metric-row">
        <div className="metric"><span>Active Jobs</span><strong>{active.length}</strong><small>Assigned to you</small></div>
        <div className="metric"><span>Scheduled</span><strong>{jobs.filter((job) => job.status === 'scheduled').length}</strong><small>Ready to work</small></div>
        <div className="metric"><span>Completed</span><strong>{complete}</strong><small>In your current job list</small></div>
      </div>
      <div className="dashboard-columns">
        <section className="content-card featured-assignment">
          <div className="section-heading"><h2>Next Assignment</h2><Link to="/jobs">All Jobs →</Link></div>
          {next ? (
            <>
              <span className="job-number">{next.workOrderNumber}</span>
              <h3>{next.title}</h3>
              <p className="job-customer">{next.customerName}</p>
              <div className="featured-time">{dateTime(next.scheduledStart)}</div>
              {next.serviceAddress && <p className="muted">{addressText(next.serviceAddress)}</p>}
              <div className="featured-actions"><StatusTag status={next.status} /><Link className="button button-primary" to={'/jobs/' + next.id}>View Assignment →</Link></div>
            </>
          ) : <EmptyState title="Nothing assigned yet" description="Your next job will appear here when a manager assigns it." />}
        </section>
        <section className="content-card">
          <div className="section-heading"><h2>Quick Links</h2></div>
          <div className="quick-links">
            <Link to="/jobs"><strong>My Jobs</strong><span>Review job details and locations</span><span aria-hidden="true">→</span></Link>
            <Link to="/schedule"><strong>Schedule</strong><span>See when you're assigned</span><span aria-hidden="true">→</span></Link>
            <Link to="/time"><strong>Hours & Time Clock</strong><span>Clock in, record breaks and check timesheets</span><span aria-hidden="true">→</span></Link>
            <Link to="/pay"><strong>My Pay</strong><span>View final net-pay stubs and deductions</span><span aria-hidden="true">→</span></Link>
            <Link to="/profile"><strong>My Profile</strong><span>View your employee information</span><span aria-hidden="true">→</span></Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function Jobs({ jobs, loading, error, onRefresh }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (status === 'active' && !['draft', 'scheduled', 'in_progress'].includes(job.status)) return false;
      if (status === 'history' && !['completed', 'cancelled'].includes(job.status)) return false;
      if (!term) return true;
      return [job.title, job.workOrderNumber, job.customerName, addressText(job.serviceAddress)]
        .some((text) => String(text || '').toLowerCase().includes(term));
    });
  }, [jobs, search, status]);
  return (
    <div className="page-body">
      <header className="page-heading"><div><span className="eyebrow">Your Assignments</span>
        <h1>My Jobs</h1><p>Only jobs assigned to your employee account appear here.</p></div>
        <button className="button button-outline" type="button" disabled={loading} onClick={onRefresh}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>
      <ErrorMessage message={error} />
      <div className="filters">
        <label className="field field-search"><span>Search Jobs</span><input value={search}
          onChange={(e) => setSearch(e.target.value)} placeholder="Job number, customer, or address" /></label>
        <label className="field"><span>Show</span><select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active Jobs</option><option value="history">Completed & Cancelled</option><option value="all">All Jobs</option>
        </select></label>
      </div>
      <div className="job-grid">
        {visible.map((job) => <JobCard key={job.id} job={job} />)}
      </div>
      {!loading && visible.length === 0 &&
        <EmptyState title="No matching jobs" description={jobs.length ? 'Try another search or status filter.' : 'Your manager has not assigned any jobs yet.'} />}
    </div>
  );
}

function JobDetail({ jobs, loading, onChanged }) {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const found = jobs.find((item) => item.id === jobId);
    if (found) {
      setJob(found); setError('');
    } else {
      apiRequest('/api/employee/jobs/' + encodeURIComponent(jobId)).then((payload) => {
        if (!cancelled) { setJob(payload.data); setError(''); }
      }).catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load this job.');
      });
    }
    return () => { cancelled = true; };
  }, [jobs, jobId]);

  const address = addressText(job?.serviceAddress);
  const directionsUrl = address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address) : '';
  return (
    <div className="page-body">
      <Link className="back-link" to="/jobs">← Back to My Jobs</Link>
      {error && <ErrorMessage message={error} />}
      {!job && !error && <p className="muted">{loading ? 'Loading job…' : 'Fetching job details…'}</p>}
      {job && (
        <>
          <header className="page-heading">
            <div><span className="eyebrow">{job.workOrderNumber}</span><h1>{job.title}</h1>
              <p>{job.customerName}</p></div><StatusTag status={job.status} />
          </header>
          <div className="detail-grid">
            <section className="content-card">
              <h2>Job Details</h2>
              <dl className="details">
                <div><dt>Scheduled Start</dt><dd>{dateTime(job.scheduledStart)}</dd></div>
                {job.scheduledEnd && <div><dt>Scheduled End</dt><dd>{dateTime(job.scheduledEnd)}</dd></div>}
                <div><dt>Customer</dt><dd>{job.customerName}</dd></div>
                <div><dt>Business</dt><dd>{job.businessName}</dd></div>
                <div><dt>Job Status</dt><dd>{statusName(job.status)}</dd></div>
              </dl>
            </section>
            <section className="content-card">
              <h2>Service Location</h2>
              {address ? <><p className="address-block">{address}</p>
                <a className="button button-outline" href={directionsUrl} target="_blank" rel="noopener noreferrer">Open Directions ↗</a>
              </> : <p className="muted">No service address is attached to this work order. Confirm the location with your manager.</p>}
            </section>
            <section className="content-card detail-wide">
              <h2>Instructions</h2>
              <p className="instructions">{job.description || 'No special instructions have been added. Contact your manager if details are missing.'}</p>
            </section>
          </div>
          <div className="detail-grid field-action-grid">
            <FieldJobActions job={job} onChanged={onChanged}/>
          </div>
        </>
      )}
    </div>
  );
}

function Schedule({ jobs, profile }) {
  const [acceptedShifts, setAcceptedShifts] = useState([]);
  const [shiftError, setShiftError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all(profile.employment.map((entry) =>
      apiRequest('/api/employee/shifts?businessUnitId=' + entry.businessUnitId)
        .then((response) => (response.data || [])
          .filter((shift) => shift.status !== 'cancelled' &&
            shift.offers?.some((offer) => offer.employeeId === entry.id && offer.status === 'accepted'))
          .map((shift) => ({ ...shift, businessName: entry.businessName })))
    )).then((results) => { if (active) setAcceptedShifts(results.flat()); })
      .catch((error) => { if (active) setShiftError(error instanceof Error ? error.message : 'Shifts unavailable.'); });
    return () => { active = false; };
  }, [profile]);
  const scheduled = [...jobs]
    .filter((job) => job.scheduledStart && !['cancelled', 'completed'].includes(job.status))
    .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));
  const groups = scheduled.reduce((acc, job) => {
    const day = shortDate(job.scheduledStart);
    (acc[day] ||= []).push(job);
    return acc;
  }, {});
  return (
    <div className="page-body">
      <header className="page-heading"><div><span className="eyebrow">Your Calendar</span>
        <h1>Schedule</h1><p>Your upcoming assigned jobs, grouped by date.</p></div></header>
      {scheduled.length === 0 ?
        <EmptyState title="No scheduled assignments" description="Once jobs are assigned and scheduled, they'll appear here." /> :
        <div className="schedule-list">
          {Object.entries(groups).map(([day, dayJobs]) => (
            <section className="schedule-day" key={day}>
              <h2>{day}</h2>
              {dayJobs.map((job) => (
                <Link className="schedule-item" key={job.id} to={'/jobs/' + job.id}>
                  <div><strong>{job.title}</strong><span>{job.customerName}</span></div>
                  <div className="schedule-item-right"><span>{dateTime(job.scheduledStart).split(', ').slice(-1)[0]}</span><StatusTag status={job.status} /></div>
                </Link>
              ))}
            </section>
          ))}
        </div>}
      <section className="content-card schedule-shifts">
        <div className="section-heading"><h2>Accepted Shifts</h2><Link to="/shifts">Manage Offers →</Link></div>
        {shiftError && <ErrorMessage message={shiftError} />}
        {acceptedShifts.length ? acceptedShifts.map((shift) => (
          <Link key={shift.id} to="/shifts" className="schedule-item">
            <div><strong>{shift.title}</strong>
              <span>{shift.businessName} · {dateTime(shift.startsAt)}</span></div>
            <span className="status-tag status-completed">Accepted</span>
          </Link>
        )) : <p className="muted">You have no accepted shifts yet.</p>}
      </section>
      <p className="muted footnote">Job assignments and accepted shifts are managed separately by your supervisor.</p>
    </div>
  );
}

function Profile({ profile }) {
  const [employment, setEmployment] = useState(profile.employment);
  const [loadingEmployment, setLoadingEmployment] = useState(false);
  const [employmentError, setEmploymentError] = useState('');

  const refreshEmployment = useCallback(async () => {
    setLoadingEmployment(true);
    setEmploymentError('');
    try {
      const response = await apiRequest('/api/employee/me');
      setEmployment(response.data?.employment || []);
    } catch (cause) {
      setEmploymentError(cause instanceof Error ? cause.message :
        'Your latest pay rate could not be refreshed.');
    } finally {
      setLoadingEmployment(false);
    }
  }, []);

  useEffect(() => { void refreshEmployment(); }, [refreshEmployment]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function changePassword(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (newPassword.length < 12) { setError('Use at least 12 characters.'); return; }
    if (newPassword !== confirm) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      await apiRequest('/api/employee/session/password/change', {
        method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword(''); setNewPassword(''); setConfirm('');
      setMessage('Password updated. Your other sessions have been signed out.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update password.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="page-body">
      <header className="page-heading"><div><span className="eyebrow">Your Information</span>
        <h1>My Profile</h1><p>Review your account and employment details.</p></div></header>
      <div className="detail-grid">
        <section className="content-card">
          <h2>Account</h2>
          <div className="profile-heading"><span className="profile-avatar">{profile.user.displayName.slice(0,1).toUpperCase()}</span>
            <div><strong>{profile.user.displayName}</strong><span>{profile.user.email}</span></div></div>
          <p className="muted">To correct your email address or contact information, contact your manager.</p>
        </section>
        <section className="content-card">
          <div className="profile-employment-heading">
            <h2>Employment</h2>
            <button type="button" className="button button-outline"
              disabled={loadingEmployment}
              onClick={() => void refreshEmployment()}>
              {loadingEmployment ? 'Refreshing…' : 'Refresh Pay Rate'}
            </button>
          </div>
          {employmentError && <p role="alert" className="alert alert-error">
            Could not refresh your latest employment information: {employmentError}
          </p>}
          {employment.map((entry) => (
            <dl className="details" key={entry.id}>
              <div><dt>Business</dt><dd>{entry.businessName}</dd></div>
              <div><dt>Position</dt><dd>{entry.jobTitle || 'Employee'}</dd></div>
              {entry.employeeNumber && <div><dt>Employee Number</dt><dd>{entry.employeeNumber}</dd></div>}
              {entry.phone && <div><dt>Phone</dt><dd>{entry.phone}</dd></div>}
              {entry.hireDate && <div><dt>Hire Date</dt><dd>{new Date(entry.hireDate + 'T12:00:00').toLocaleDateString()}</dd></div>}
              <div className="profile-hourly-rate">
                <dt>Current Hourly Rate</dt>
                <dd>{entry.payRate
                  ? <><strong>{new Intl.NumberFormat('en-US', {
                      style: 'currency', currency: 'USD',
                    }).format(entry.payRate.hourlyCents / 100)}/hour</strong>
                    <span className="profile-pay-effective">
                      Effective {new Date(entry.payRate.effectiveOn + 'T12:00:00').toLocaleDateString('en-US')}
                    </span></>
                  : <span className="muted">Not set — ask your manager.</span>}
                </dd>
              </div>
            </dl>
          ))}
        </section>
        <section className="content-card detail-wide">
          <h2>Change Password</h2>
          <form className="password-form" onSubmit={changePassword}>
            <label className="field"><span>Current Password</span>
              <input type="password" autoComplete="current-password" value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
            <label className="field"><span>New Password</span>
              <input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} required /></label>
            <label className="field"><span>Confirm New Password</span>
              <input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={confirm}
                onChange={(e) => setConfirm(e.target.value)} required /></label>
            <ErrorMessage message={error} />
            {message && <Notice>{message}</Notice>}
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update Password'}</button>
          </form>
        </section>
      </div>
    </div>
  );
}

function PortalShell({ profile, logout }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadJobs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await apiRequest('/api/employee/jobs?limit=100');
      setJobs(Array.isArray(response.data) ? response.data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to retrieve assigned jobs.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  return (
    <div className="portal-layout">
      <aside className="sidebar">
        <Link to="/" className="sidebar-brand"><Brand /></Link>
        <div className="sidebar-subheading">Workspace</div>
        <nav className="sidebar-links" aria-label="Employee navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <span className="nav-symbol" aria-hidden="true">{item.symbol}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom"><span>Signed In As</span>
          <strong>{profile.user.displayName}</strong>
          <button className="sidebar-signout" onClick={logout} type="button">Sign Out →</button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-brand"><Brand compact /></div>
          <span className="topbar-company">{profile.employment[0]?.businessName || 'Pioneer Legacy Works'}</span>
          <button className="topbar-signout" type="button" onClick={logout}>Sign Out</button>
        </header>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard profile={profile} jobs={jobs} loading={loading} error={error} onRefresh={loadJobs} />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/jobs" element={<Jobs jobs={jobs} loading={loading} error={error} onRefresh={loadJobs} />} />
            <Route path="/jobs/:jobId" element={<JobDetail jobs={jobs} loading={loading} onChanged={loadJobs} />} />
            <Route path="/schedule" element={<Schedule jobs={jobs} profile={profile} />} />
            <Route path="/time" element={<TimekeepingPage profile={profile} />} />
            <Route path="/pay" element={<GrossPayPage profile={profile} />} />
            <Route path="/shifts" element={<ShiftOffersPage profile={profile} />} />
            <Route path="/availability" element={<AvailabilityPage profile={profile} />} />
            <Route path="/routes" element={<CrewRoutesPage profile={profile} />} />
            <Route path="/profile" element={<Profile profile={profile} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="portal-footer">© Pioneer Legacy Works · Internal Employee Workspace</footer>
      </div>
      <nav className="mobile-nav" aria-label="Employee navigation">
        {navigation.map((item) => (
          <NavLink key={item.to} end={item.end} to={item.to} className={({ isActive }) => 'mobile-nav-item' + (isActive ? ' active' : '')}>
            <span aria-hidden="true">{item.symbol}</span><small>{item.label}</small>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function SecureConnectionNotice() {
  const secureUrl = 'https://' + window.location.host +
    window.location.pathname + window.location.search + window.location.hash;
  return (
    <div className="auth-background">
      <div className="auth-card auth-card-centered">
        <Brand compact />
        <span className="eyebrow">Connection Security</span>
        <h1>Secure Connection Required</h1>
        <p className="muted">
          This employee portal is currently loading without HTTPS. For your protection,
          do not enter a password until a secure connection is available.
        </p>
        <a className="button button-primary button-full" href={secureUrl}>Open Secure Portal</a>
        <p className="auth-help">
          If the secure link does not open, contact your administrator.
          HTTPS must be enabled for this domain in GitHub Pages.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const auth = usePortalAuth();
  const insecureProductionOrigin = window.location.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (insecureProductionOrigin) return <SecureConnectionNotice />;

  return (
    <Routes>
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={
        auth.status === 'checking' ? <Loading /> :
        auth.status === 'error' ? <Restricted message={auth.error} onRetry={auth.refresh} onLogout={auth.logout} /> :
        auth.status === 'denied' ? <Restricted message={auth.error} onRetry={auth.refresh} onLogout={auth.logout} /> :
        auth.status === 'authenticated' ? <PortalShell profile={auth.profile} logout={auth.logout} /> :
        <SignIn onLogin={auth.login} />
      } />
    </Routes>
  );
}
