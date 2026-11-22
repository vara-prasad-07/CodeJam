export function normalizeMetrics(raw){
 const valid=n=>Number.isSafeInteger(n)&&n>=0;
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s));
 const history=Array.isArray(raw.history)?raw.history.filter(p=>date(p.date)&&valid(p.installs)):[];
 if(!history.length&&date(raw.asOf)&&valid(raw.installs))history.push({date:raw.asOf,installs:raw.installs});
 const unique=[...new Map(history.map(p=>[p.date,p])).values()].sort((a,b)=>a.date.localeCompare(b.date));
 const daily=(Array.isArray(raw.dailyAcquisition)?raw.dailyAcquisition:[]).filter(p=>date(p.date)&&valid(p.installs)).sort((a,b)=>a.date.localeCompare(b.date));
 const report=raw.report&&date(raw.report.start)&&date(raw.report.end)&&valid(raw.report.installs)&&valid(raw.report.pageViews)?raw.report:null;
 return {installs:valid(raw.installs)?raw.installs:null,version:typeof raw.version==='string'?raw.version:'',asOf:date(raw.asOf)?raw.asOf:'',history:unique,dailyAcquisition:daily,report,source:raw.source||''};
}
export function chartGeometry(points,width=720,height=240){
 const top=22,bottom=height-36,left=44,right=width-32,max=Math.max(1,...points.map(p=>p.installs)),ceiling=Math.ceil(max/5)*5||5;
 return {ceiling,bottom,top,left,right,points:points.map((p,i)=>({...p,x:points.length===1?(left+right)/2:left+i*(right-left)/(points.length-1),y:bottom-(p.installs/ceiling)*(bottom-top)})),ticks:[0,ceiling/2,ceiling]};
}
