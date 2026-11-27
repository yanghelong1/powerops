const SECTIONS = [1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240,300,400];
const CU = [14,19,25,32,43,57,75,92,110,140,170,192,219,248,291,334,387];
const AL = [0,15,20,25,34,45,59,73,87,110,134,151,173,196,230,264,306];
const MATERIAL = [{rho:0.0175,alpha:0.00393},{rho:0.0282,alpha:0.00403}];
const HISTORY_KEY = 'powerops_mini_history_v1';
Page({
 data:{
  mode:'section',phaseOptions:['三相三线 / 三相四线','单相两线'],phaseIndex:0,
  materialOptions:['铜芯（Cu）','铝芯（Al）'],materialIndex:0,
  installOptions:['穿管 / 封闭线槽（基准）','空气中敷设 / 通风桥架（估算）'],installIndex:0,
  ambientOptions:['25','30','35','40','45','50'],ambientIndex:1,
  sectionOptions:SECTIONS.map(String),sectionIndex:6,
  lossModeOptions:['单相两线制','三相平衡负载','三相四线制不平衡负载'],lossModeIndex:0,
  voltage:'380',current:'60',length:'100',pf:'0.85',temperature:'70',dropLimit:'5',parallel:'1',
  runCurrent:'100',ia:'100',ib:'100',ic:'100',inCurrent:'0',hours:'24',days:'30',tariff:'0.8',
  sectionResult:null,resistanceResult:null,history:[]
 },
 onLoad(){this.refreshHistory()},
 switchMode(e){this.setData({mode:e.currentTarget.dataset.mode,sectionResult:null,resistanceResult:null})},
 onInput(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value})},
 onPhaseChange(e){this.setData({phaseIndex:Number(e.detail.value),voltage:Number(e.detail.value)===0?'380':'220'})},
 onMaterialChange(e){this.setData({materialIndex:Number(e.detail.value)})},
 onInstallChange(e){this.setData({installIndex:Number(e.detail.value)})},
 onAmbientChange(e){this.setData({ambientIndex:Number(e.detail.value)})},
 onSectionChange(e){this.setData({sectionIndex:Number(e.detail.value)})},
 onLossModeChange(e){this.setData({lossModeIndex:Number(e.detail.value)})},
 num(key){return Number(this.data[key])},
 validPositive(keys){return keys.every(k=>Number.isFinite(this.num(k))&&this.num(k)>0)},
 addHistory(type,result){const list=wx.getStorageSync(HISTORY_KEY)||[];list.unshift({id:String(Date.now())+Math.random(),type,time:new Date().toLocaleString(),result});const next=list.slice(0,50);wx.setStorageSync(HISTORY_KEY,next);this.setData({history:next})},
 refreshHistory(){this.setData({history:wx.getStorageSync(HISTORY_KEY)||[]})},
 calculateSection(){
  const d=this.data,keys=['voltage','current','length','pf','temperature','dropLimit'];
  if(!this.validPositive(keys)||this.num('pf')>1||this.num('dropLimit')>15){wx.showToast({title:'请检查输入参数',icon:'none'});return}
  const phase=d.phaseIndex===0?3:1,cores=phase===3?3:2,idx=d.materialIndex,mat=MATERIAL[idx],base=idx===0?CU:AL;
  const ambient=Number(d.ambientOptions[d.ambientIndex]);
  const tempFactor=({25:1.06,30:1,35:.94,40:.87,45:.79,50:.71})[ambient]||1;
  const installFactor=d.installIndex===0?1:1.18,coreFactor=cores===2?1.15:1;
  const rho=mat.rho*(1+mat.alpha*(this.num('temperature')-20));
  const candidates=SECTIONS.map((s,i)=>{
   const amp=base[i]*tempFactor*coreFactor*installFactor*ambientFactor;
   if(!amp)return null;
   const resistance=rho*this.num('length')/s;
   const drop=(phase===3?Math.sqrt(3):2)*this.num('current')*resistance*this.num('pf');
   return {s,amp,drop,percent:drop/this.num('voltage')*100};
  }).filter(Boolean);
  const found=candidates.find(x=>x.amp>=this.num('current')&&x.percent<=this.num('dropLimit'));
  const lines=found?[
   '估算修正载流量：'+found.amp.toFixed(1)+' A；负载电流：'+this.num('current').toFixed(1)+' A',
   '估算电压降：'+found.drop.toFixed(2)+' V（'+found.percent.toFixed(2)+'%）',
   '载流量校核：通过；电压降校核：通过',
   '计算条件：'+(phase===3?'三相':'单相')+'，'+d.voltage+' V，'+d.length+' m，'+(idx===0?'铜芯':'铝芯')
  ]:['当前参考规格内未找到同时满足载流量和压降要求的截面，请增大截面或复核敷设条件。'];
  const title=found?(found.s+' mm²'):'暂无合适截面';
  this.setData({sectionResult:{title,lines}});
  this.addHistory('电缆截面推荐',title+'；'+lines.join('；'));
 },
 calculateResistance(){
  const d=this.data;
  if(!this.validPositive(['length','parallel'])||!Number.isFinite(this.num('temperature'))||this.num('parallel')%1!==0){wx.showToast({title:'请检查电缆参数',icon:'none'});return}
  const mat=MATERIAL[d.materialIndex],s=Number(d.sectionOptions?d.sectionOptions[d.sectionIndex]:SECTIONS[d.sectionIndex]);
  const rho=mat.rho*(1+mat.alpha*(this.num('temperature')-20));
  const r=rho*this.num('length')/s/this.num('parallel');
  const perKm=rho*1000/s/this.num('parallel');
  if(d.mode==='resistance'){
   const lines=['20℃参考电阻：'+(mat.rho*this.num('length')/s/this.num('parallel')).toFixed(5)+' Ω','温度修正后每公里电阻：'+perKm.toFixed(4)+' Ω/km','单相往返回路电阻估算：'+(2*r).toFixed(5)+' Ω','并联根数按均流、长度和截面一致估算。'];
   this.setData({resistanceResult:{title:r.toFixed(5)+' Ω',lines}});this.addHistory('电缆电阻',r.toFixed(5)+' Ω；'+lines.join('；'));return;
  }
  const mode=d.lossModeIndex;let loss=0,detail='';
  if(mode===0){const i=this.num('runCurrent');if(!Number.isFinite(i)||i<0){wx.showToast({title:'请输入有效电流',icon:'none'});return}loss=2*i*i*r;detail='火线与零线按相同电阻估算'}
  else if(mode===1){const i=this.num('runCurrent');if(!Number.isFinite(i)||i<0){wx.showToast({title:'请输入有效电流',icon:'none'});return}loss=3*i*i*r;detail='三相平衡：3×I²×R'}
  else{const currents=['ia','ib','ic','inCurrent'].map(k=>this.num(k));if(!currents.every(x=>Number.isFinite(x)&&x>=0)){wx.showToast({title:'请检查各相及零线电流',icon:'none'});return}loss=currents.reduce((sum,i)=>sum+i*i*r,0);detail='按A、B、C相及零线实测电流分别计算'}
  const hours=this.num('hours'),days=this.num('days'),tariff=this.num('tariff');
  if(!(hours>=0&&hours<=24&&days>=0&&days<=31&&tariff>=0)){wx.showToast({title:'请检查运行时间和电价',icon:'none'});return}
  const kw=loss/1000,day=kw*hours,month=day*days,cost=month*tariff;
  const lines=[detail,'每天损耗电量：'+day.toFixed(3)+' kWh','每月损耗电量：'+month.toFixed(2)+' kWh','每月线损电费：'+cost.toFixed(2)+' 元'];
  this.setData({resistanceResult:{title:loss.toFixed(2)+' W（'+kw.toFixed(4)+' kW）',lines}});
  this.addHistory('线路损耗',loss.toFixed(2)+' W；'+lines.join('；'));
 },
 clearHistory(){wx.showModal({title:'确认清空',content:'清空后无法恢复计算历史。',success:(res)=>{if(res.confirm){wx.removeStorageSync(HISTORY_KEY);this.setData({history:[]})}}})}
});