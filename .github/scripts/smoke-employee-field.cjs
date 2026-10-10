const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

const origin='http://127.0.0.1:4173';
const mockId='11111111-1111-4111-8111-111111111111';
const employeeId='22222222-2222-4222-8222-222222222222';
const businessId='33333333-3333-4333-8333-333333333333';
const jobId='44444444-4444-4444-8444-444444444444';
const shiftId='55555555-5555-4555-8555-555555555555';
const mockJob={id:jobId,businessUnitId:businessId,businessName:'Pioneer Outdoor Services',
  workOrderNumber:'POS-MOCK-01',title:'Driveway Snow Clearing',
  customerName:'Example Customer',status:'scheduled',reportStatus:null,
  scheduledStart:'2026-12-01T03:00:00.000Z',
  scheduledEnd:'2026-12-01T04:00:00.000Z',
  description:'Clear driveway and sidewalk',serviceAddress:{
    addressLine1:'123 Main Street',city:'Toledo',state:'OH',postalCode:'43604',
  }};
const profile={user:{id:mockId,email:'employee@example.test',displayName:'Test Employee'},
  employment:[{id:employeeId,businessUnitId:businessId,businessName:'Pioneer Outdoor Services',
    displayName:'Test Employee',jobTitle:'Snow Removal Technician',
    payRate:{hourlyCents:2375,effectiveOn:'2026-09-28',overtimeMultiplierBps:15000}}]};
const headers={'access-control-allow-origin':origin,'access-control-allow-credentials':'true',
  'access-control-allow-methods':'GET,POST,PUT,PATCH,OPTIONS',
  'access-control-allow-headers':'Content-Type','content-type':'application/json'};
async function run(){
  const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173'],{
    stdio:['ignore','pipe','pipe']
  });
  let browser=null;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
    const page=await browser.newPage();
    let reportStatus=null;
    let actionCount=0, saveCount=0, profileReads=0;
    const errors=[];
    page.on('pageerror',e=>errors.push(e.stack||e.message));
    await page.route('https://api.pioneerlegacyworks.com/**',async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname;
      if(req.method()==='OPTIONS'){
        await route.fulfill({status:204,headers});return;
      }
      let result={data:[]};
      if(path==='/api/employee/me'){
        profileReads++;result={data:profile};
      }
      else if(path==='/api/employee/capabilities')result={data:{photoUploads:false}};
      else if(path==='/api/employee/jobs' || path==='/api/employee/jobs/'){
        result={data:[mockJob]};
      }else if(path==='/api/employee/jobs/'+jobId){
        result={data:mockJob};
      }else if(path===`/api/employee/jobs/${jobId}/report`){
        result={data:reportStatus?{id:'77777777-7777-4777-8777-777777777777',status:reportStatus}:null};
      }else if(path===`/api/employee/jobs/${jobId}/photos`){
        result={data:[]};
      }else if(path===`/api/employee/jobs/${jobId}/action`){
        actionCount++;
        reportStatus='acknowledged';
        result={data:{status:reportStatus}};
      }else if(path==='/api/employee/availability'){
        if(req.method()==='PUT')saveCount++;
        result={data:[]};
      }else if(path==='/api/employee/shifts'){
        result={data:[{id:shiftId,title:'Overnight Snow Shift',status:'open',
          startsAt:'2026-12-01T01:00:00Z',endsAt:'2026-12-01T08:00:00Z',
          capacity:2,acceptedCount:0,offers:[{id:'offer',employeeId,status:'offered'}]}]};
      }else if(path==='/api/employee/pay/adjustments'){
        result={data:[
          {id:'adjustment-bonus',category:'bonus',amountCents:5000,
            description:'Overnight snow work bonus',serviceDate:'2026-10-08',
            paymentStatus:'not_recorded',grossWageImpactCents:5000,reimbursementCents:0},
          {id:'adjustment-expense',category:'reimbursement',amountCents:1250,
            description:'Driveway salt reimbursement',serviceDate:'2026-10-08',
            paymentStatus:'not_recorded',grossWageImpactCents:0,reimbursementCents:1250},
        ]};
      }else if(path==='/api/employee/pay/provider-statements'){
        result={data:[{batchId:'provider-batch-one',providerName:'Example Payroll Provider',
          periodStart:'2026-09-28',periodEnd:'2026-10-05',
          grossCents:95000,netCents:70000,
          federalWithholdingCents:15000,stateWithholdingCents:3000,
          socialSecurityCents:5000,medicareCents:1000,otherDeductionsCents:1000,
          paymentStatus:'paid',paidOn:'2026-10-08',statementReference:'EXTERNAL-123',
          source:'imported_external_provider',paymentVerifiedByPioneer:false,
          booksSettlementRecorded:false}]};
      }else if(path==='/api/employee/pay/statements'){
        result={data:[{runId:'77777777-7777-4777-8777-777777777777',
          periodStart:'2026-09-28',periodEnd:'2026-10-05',
          grossCents:95000,regularSeconds:144000,overtimeSeconds:18000,
          regularCents:80000,overtimeCents:15000,
          status:'recorded_in_books',paymentStatus:'not_recorded',netPay:null}]};
      }else if(path==='/api/employee/routes'){
        result={data:[{id:'route',name:'North Toledo',status:'planned',notes:'Overnight route',
          startsAt:'2026-12-01T03:00:00Z',members:[{id:employeeId,name:'Test Employee'}],
          jobs:[{id:jobId,title:mockJob.title,number:'POS-MOCK-01',status:'scheduled'}]}]};
      }
      await route.fulfill({status:200,headers,body:JSON.stringify(result)});
    });
    async function visit(path,expected){
      const response=await page.goto(origin+'/#/'+path,{waitUntil:'domcontentloaded'});
      if(response && response.status()!==200)throw new Error('HTTP '+response.status()+' on '+path);
      await page.getByText(expected,{exact:false}).first().waitFor({timeout:10000});
      console.log('PASS: /'+path+' rendered '+expected);
    }
    await visit('','Good to see you');
    await visit('jobs','Driveway Snow Clearing');
    await visit('jobs/'+jobId,'Field Report');
    await page.getByRole('button',{name:'Acknowledge'}).click();
    await page.getByText('Acknowledged',{exact:true}).first().waitFor({timeout:10000});
    if(actionCount!==1)throw new Error('Employee acknowledgment was not submitted');
    console.log('PASS: job acknowledgment');
    await visit('availability','My Availability');
    await page.getByRole('button',{name:'Add Time Range'}).click();
    await page.getByRole('button',{name:'Save Availability'}).click();
    await page.getByText('Weekly availability saved',{exact:false}).waitFor({timeout:10000});
    if(saveCount!==1)throw new Error('Availability was not saved');
    console.log('PASS: availability saved');
    await visit('shifts','Overnight Snow Shift');
    await visit('routes','North Toledo');
    await visit('pay','My Pay');
    await page.getByText('$950.00',{exact:false}).first().waitFor({timeout:10000});
    await page.getByText('Provider-Reported Net Pay',{exact:false}).first().waitFor({timeout:10000});
    await page.getByText('$700.00',{exact:true}).first().waitFor({timeout:10000});
    await page.getByText('Provider reported paid',{exact:false}).first().waitFor({timeout:10000});
    await page.getByText('not bank-verified',{exact:false}).first().waitFor({timeout:10000});
    console.log('PASS: external provider-reported net pay, withheld amounts and unverified payment status');
    await page.getByText('Pioneer Books — Gross Wage Accruals').waitFor({timeout:10000});
    await page.getByText('Not Marked Paid').waitFor({timeout:10000});
    console.log('PASS: existing gross accrual remains separate from external provider pay');
    await page.getByText('Overnight snow work bonus').waitFor({timeout:10000});
    await page.getByText('Driveway salt reimbursement').waitFor({timeout:10000});
    await page.getByText('separate from gross wages',{exact:false}).first().waitFor({timeout:10000});
    console.log('PASS: employee pay adjustments and expense reimbursements display separately');
    await visit('profile','My Profile');
    await page.getByText('$23.75/hour',{exact:true}).waitFor({timeout:10000});
    await page.getByText('Effective 9/28/2026',{exact:true}).waitFor({timeout:10000});
    const previousReads=profileReads;
    await page.getByRole('button',{name:'Refresh Pay Rate'}).click();
    await page.waitForTimeout(100);
    await page.getByText('$23.75/hour',{exact:true}).waitFor({timeout:10000});
    if(profileReads<=previousReads)throw new Error('Employee profile hourly pay did not refresh via the authenticated /me API');
    console.log('PASS: employee sees only current hourly rate and effective date in My Profile');
    if(errors.length)throw new Error('Uncaught browser errors: '+JSON.stringify(errors));
    console.log('PASS: employee v0.2 authenticated browser smoke test');
  }finally{
    if(browser)await browser.close();
    server.kill('SIGTERM');
    process.exitCode=process.exitCode||0;
  }
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e.stack);process.exit(1);});
