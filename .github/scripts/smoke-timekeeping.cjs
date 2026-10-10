const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

const origin='http://127.0.0.1:4173';
const business='33333333-3333-4333-8333-333333333333';
const employee='22222222-2222-4222-8222-222222222222';
const entryId='77777777-7777-4777-8777-777777777777';
const headers={
  'content-type':'application/json',
  'access-control-allow-origin':origin,
  'access-control-allow-credentials':'true',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'Content-Type',
};
const mockProfile={user:{
  id:'11111111-1111-4111-8111-111111111111',
  displayName:'Test Employee',email:'employee@example.test',
},employment:[{id:employee,businessUnitId:business,
  businessName:'Pioneer Outdoor Services',displayName:'Test Employee'}]};
async function run(){
  const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173'],
    {stdio:['ignore','pipe','pipe']});
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
    const page=await browser.newPage();
    const errors=[];
    let active=null,finish=null;
    let clockInCount=0,breakStartCount=0,breakEndCount=0,clockOutCount=0;
    page.on('pageerror',e=>errors.push(e.stack||e.message));
    const makeEntry=(status='open')=>({
      id:entryId,businessUnitId:business,employeeId:employee,employeeName:'Test Employee',
      clockInAt:'2026-10-09T23:00:00.000Z',clockOutAt:status==='open'?null:'2026-10-10T03:00:00.000Z',
      breakStartedAt:status==='break'?'2026-10-10T00:00:00.000Z':null,
      breakPaid:status==='break'?false:null,
      reviewStatus:status==='closed'?'submitted':'open',paidBreakSeconds:0,
      unpaidBreakSeconds:status==='closed'?900:0,
      workedSeconds:status==='closed'?13500:3600,workedHours:status==='closed'?3.75:1,
      missedClockOut:false,isOpen:status!=='closed',
    });
    await page.route('https://api.pioneerlegacyworks.com/**',async route=>{
      const request=route.request(),url=new URL(request.url()),path=url.pathname;
      if(request.method()==='OPTIONS'){
        await route.fulfill({status:204,headers});return;
      }
      let payload={data:[]};
      if(path==='/api/employee/me')payload={data:mockProfile};
      else if(path==='/api/employee/jobs')payload={data:[]};
      else if(path==='/api/employee/shifts')payload={data:[]};
      else if(path==='/api/employee/time'&&request.method()==='GET'){
        payload={data:{weekStart:url.searchParams.get('weekStart'),
          timeZone:'America/Detroit',
          entries:finish?[finish]:active?[active]:[],
          activeEntry:active,
          summary:{
            totalSeconds:finish?finish.workedSeconds:0,
            approvedSeconds:0,pendingSeconds:finish?finish.workedSeconds:0,
            unpaidBreakSeconds:finish?900:0,openEntries:active?1:0,
            pendingCount:finish?1:0,approvedCount:0,
          },
        }};
      } else if(path==='/api/employee/time/clock-in'){
        const input=JSON.parse(request.postData()||'{}');
        if(input.businessUnitId!==business)throw new Error('Clocked in to wrong business');
        clockInCount++;
        active=makeEntry();
        payload={data:active};
      } else if(path==='/api/employee/time/break/start'){
        const input=JSON.parse(request.postData()||'{}');
        if(input.paid!==false)throw new Error('Expected an unpaid break');
        breakStartCount++;active=makeEntry('break');payload={data:active};
      } else if(path==='/api/employee/time/break/end'){
        breakEndCount++;active=makeEntry();payload={data:active};
      } else if(path==='/api/employee/time/clock-out'){
        clockOutCount++;active=null;finish=makeEntry('closed');payload={data:finish};
      }
      await route.fulfill({status:200,headers,body:JSON.stringify(payload)});
    });
    await page.goto(origin+'/#/time',{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Hours & Time Clock'}).waitFor({timeout:15000});
    await page.getByRole('button',{name:'Clock In',exact:true}).click();
    await page.getByText('Clock-in recorded.').waitFor({timeout:15000});
    await page.getByRole('button',{name:'Start Unpaid Break'}).click();
    await page.getByRole('button',{name:'End Break'}).waitFor({timeout:10000});
    await page.getByRole('button',{name:'End Break'}).click();
    await page.getByRole('button',{name:'Clock Out',exact:true}).click();
    await page.getByText('Clock-out recorded.').waitFor({timeout:15000});
    await page.getByText('Awaiting Approval',{exact:true}).waitFor({timeout:15000});
    if(clockInCount!==1||breakStartCount!==1||breakEndCount!==1||clockOutCount!==1){
      throw new Error('Wrong timekeeping action counts: '+JSON.stringify({
        clockInCount,breakStartCount,breakEndCount,clockOutCount
      }));
    }
    if(errors.length)throw new Error('Uncaught errors: '+errors.join('\n'));
    console.log('PASS: employee v0.3 clock-in, unpaid break, break end, clock-out and timesheet rendering');
  }finally{if(browser)await browser.close();server.kill('SIGTERM');}
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e.stack);process.exit(1);});
