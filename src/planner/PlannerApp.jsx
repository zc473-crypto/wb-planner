// src/planner/PlannerApp.jsx
import { useState, useRef } from 'react'

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap');`
const MARKERS = [250,150,100,75,50,37,25,20,15,10]
const RED_M = new Set([75,25])
const COLORS = ['#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2','#be123c','#4f46e5','#a16207','#0f766e','#7c3aed','#b45309']

const LAB_PRESETS = [
  {name:'CPS1',mw:165},{name:'Lamin B1',mw:67},{name:'Transferrin',mw:79},
  {name:'GAPDH',mw:37},{name:'ERK1/2',mw:42},{name:'p-ERK1/2',mw:42},
  {name:'AKT',mw:60},{name:'p-AKT (Ser473)',mw:60},{name:'JNK',mw:46},
  {name:'p-JNK',mw:46},{name:'p38',mw:38},{name:'p-p38',mw:38},
  {name:'Keratin 19',mw:40},{name:'Keratin 8',mw:54},
  {name:'PARP (full)',mw:116},{name:'PARP (cleaved)',mw:89},
  {name:'Caspase-3 (full)',mw:35},{name:'Caspase-3 (cleaved)',mw:17},
  {name:'Caspase-7 (full)',mw:35},{name:'Caspase-7 (cleaved)',mw:20},
  {name:'FABP1',mw:14},{name:'Albumin',mw:65},
  {name:'STAT3',mw:92},{name:'p-STAT3 (Tyr705)',mw:92},
  {name:'mTOR',mw:289},{name:'p-mTOR',mw:289},
  {name:'GSK3β',mw:46},{name:'p-GSK3β',mw:46},
  {name:'β-Actin',mw:42},{name:'EGFR',mw:134},
  {name:'Clathrin HC',mw:190},{name:'AP2α',mw:50},
].sort((a,b) => b.mw - a.mw)

// ── Zone logic ──
const ALL_ZONES = (() => {
  const s = [...MARKERS].sort((a,b) => b-a)
  const z = []
  z.push({id:`above${s[0]}`, lo:s[0], hi:Infinity, top:true})
  for(let i=0; i<s.length-1; i++)
    z.push({id:`${s[i+1]}_${s[i]}`, lo:s[i+1], hi:s[i]})
  z.push({id:`below${s[s.length-1]}`, lo:0, hi:s[s.length-1], bottom:true})
  return z
})()

function zoneLabel(z) {
  if(z.top)    return `> ${z.lo} kDa`
  if(z.bottom) return `< ${z.hi} kDa`
  return `${z.lo}–${z.hi} kDa`
}
function gelCanRun(g, mw) {
  if(g==='10%') return mw >= 37
  if(g==='15%') return mw <= 75
  return true
}
function specialistGels(mw) {
  const r = []
  if(mw >= 37) r.push('10%')
  if(mw <= 75) r.push('15%')
  return r
}
function zoneForMW(mw) {
  for(const z of ALL_ZONES) {
    if(z.top    && mw >= z.lo)                         return z
    if(z.bottom && mw > z.lo && mw < z.hi)             return z
    if(!z.top && !z.bottom && mw >= z.lo && mw < z.hi) return z
  }
  if(mw >= MARKERS[0]) return ALL_ZONES[0]
  return null
}
function usableZones(gelKey) {
  return ALL_ZONES.filter(z => {
    const mid = z.top ? z.lo+10 : z.bottom ? Math.max(1, z.hi-1) : (z.lo+z.hi)/2
    return gelCanRun(gelKey, mid)
  })
}
function conflict(zA, zB, mode) {
  if(zA.id === zB.id) return true
  if(mode === 'standard') {
    const ia = ALL_ZONES.findIndex(z=>z.id===zA.id)
    const ib = ALL_ZONES.findIndex(z=>z.id===zB.id)
    return Math.abs(ia-ib) <= 1
  }
  return false
}
function bestGel(proteins, enabled) {
  const pref = enabled.filter(k=>k!=='4-20%')
  const fall = enabled.filter(k=>k==='4-20%')
  for(const k of [...pref, ...fall])
    if(proteins.every(p=>gelCanRun(k, p.mw))) return k
  return null
}
function buildPlan(proteins, cutMode, enabledGels, forcedIds) {
  const pZone = {}
  const unassignable = []
  for(const p of proteins) {
    if(forcedIds.has(p.id)) { pZone[p.id] = ALL_ZONES[0]; continue }
    const z = zoneForMW(p.mw)
    if(!z || !enabledGels.some(g=>gelCanRun(g,p.mw))) { unassignable.push(p); continue }
    pZone[p.id] = z
  }
  const assignable = proteins.filter(p => pZone[p.id] !== undefined)
  const adj = {}
  for(const p of assignable) adj[p.id] = new Set()
  for(let i=0; i<assignable.length; i++)
    for(let j=i+1; j<assignable.length; j++) {
      const a=assignable[i], b=assignable[j]
      if(conflict(pZone[a.id], pZone[b.id], cutMode)) {
        adj[a.id].add(b.id); adj[b.id].add(a.id)
      }
    }
  const sorted = [...assignable].sort((a,b) => adj[b.id].size - adj[a.id].size)
  const color = {}
  let numColors = 0
  for(const p of sorted) {
    const used = new Set([...adj[p.id]].filter(id=>color[id]!==undefined).map(id=>color[id]))
    let c=0; while(used.has(c)) c++
    color[p.id]=c
    if(c>=numColors) numColors=c+1
  }
  // Build logical gel groups
  const logicalGels = []
  let idx = 1
  for(let g=0; g<numColors; g++) {
    const gp = assignable.filter(p=>color[p.id]===g)
    const gt = bestGel(gp, enabledGels)
    if(gt) {
      logicalGels.push({index:idx++, gelType:gt, proteins:gp})
    } else {
      const byGel = {}
      for(const p of gp) {
        const k = bestGel([p], enabledGels) || enabledGels[0]
        if(!byGel[k]) byGel[k]=[]
        byGel[k].push(p)
      }
      for(const k of ['10%','15%','4-20%'])
        if(byGel[k]) logicalGels.push({index:idx++, gelType:k, proteins:byGel[k]})
    }
  }
  return {logicalGels, unassignable, pZone}
}

// ── Merge logical gels into physical gels based on well capacity ──
// Each logical gel becomes a "run" on a physical gel of the same type
function mergeIntoPhysicalGels(logicalGels, wellsPerRun, gelFormat) {
  const totalWells = gelFormat === 15 ? 15 : 12
  const runsPerGel = wellsPerRun > 0 ? Math.floor(totalWells / wellsPerRun) : 1
  // Group logical gels by type
  const byType = {}
  for(const lg of logicalGels) {
    if(!byType[lg.gelType]) byType[lg.gelType] = []
    byType[lg.gelType].push(lg)
  }
  const physicalGels = []
  let physIdx = 1
  for(const [gelType, runs] of Object.entries(byType)) {
    // Pack runs into physical gels
    for(let i=0; i<runs.length; i+=runsPerGel) {
      const chunk = runs.slice(i, i+runsPerGel)
      const usedWells = chunk.length * wellsPerRun
      const unusedWells = totalWells - usedWells
      // Assign well ranges to each run
      const runsWithWells = chunk.map((run, ri) => ({
        ...run,
        wellStart: ri * wellsPerRun + 1,
        wellEnd:   ri * wellsPerRun + wellsPerRun,
      }))
      physicalGels.push({
        physIndex: physIdx++,
        gelType,
        runs: runsWithWells,
        totalWells,
        usedWells,
        unusedWells,
        runsPerGel: chunk.length,
      })
    }
  }
  return physicalGels
}

// ── Get cut zones for a set of proteins ──
// Returns the marker values where cuts should happen
function getCutsForProteins(proteins, pZone, gelType) {
  if(!proteins.length) return []
  const zones = usableZones(gelType)
  // Find which zones have proteins
  const occupiedZoneIds = new Set(proteins.map(p => pZone[p.id]?.id).filter(Boolean))
  // Find cut positions: between occupied zones with a gap, or at marker boundary
  const cuts = []
  for(let i=0; i<zones.length-1; i++) {
    const thisOccupied = occupiedZoneIds.has(zones[i].id)
    const nextOccupied = occupiedZoneIds.has(zones[i+1].id)
    // Cut between two groups of occupied zones
    if(thisOccupied && !nextOccupied) {
      // find next occupied zone
      let nextOccIdx = -1
      for(let j=i+1; j<zones.length; j++) {
        if(occupiedZoneIds.has(zones[j].id)) { nextOccIdx = j; break }
      }
      if(nextOccIdx > i+1) {
        // cut at the boundary between zone i and i+1
        cuts.push(zones[i].bottom ? zones[i].hi : zones[i+1].top ? zones[i+1].lo : zones[i+1].lo)
      } else if(nextOccIdx === i+1) {
        // adjacent zones — cut at boundary
        cuts.push(zones[i+1].lo)
      }
    }
  }
  return [...new Set(cuts)].sort((a,b) => b-a)
}

// ── Gel visualisation (mini strip) ──
function mwToY(mw, gelKey) {
  const [lo,hi] = gelKey==='15%'?[8,110]:gelKey==='10%'?[22,280]:[8,310]
  const t = (Math.log10(Math.max(mw,lo))-Math.log10(lo))/(Math.log10(hi)-Math.log10(lo))
  return Math.max(3,Math.min(93,(1-t)*90+3))
}
function visMarkers(gelKey) {
  if(gelKey==='10%') return MARKERS.filter(m=>m>=25)
  if(gelKey==='15%') return MARKERS.filter(m=>m<=100)
  return MARKERS
}

// ── Run strip: vertical view of one run's proteins + cuts ──
function RunStrip({ run, allProteins, pZone, gelType, forcedIds, en }) {
  const ms = visMarkers(gelType)
  const cuts = getCutsForProteins(run.proteins, pZone, gelType)
  const mono = {fontFamily:'monospace'}

  return (
    <div style={{display:'flex',gap:4,alignItems:'flex-start',flexShrink:0}}>
      {/* Marker labels */}
      <div style={{width:32,position:'relative',height:240,flexShrink:0}}>
        {ms.map(m => {
          const y = mwToY(m,gelType)
          return (
            <div key={m} style={{position:'absolute',top:`${y}%`,right:0,transform:'translateY(-50%)',display:'flex',alignItems:'center',gap:2}}>
              <span style={{fontSize:7,color:RED_M.has(m)?'#dc2626':'#94a3b8',...mono,fontWeight:RED_M.has(m)?700:400}}>{m}</span>
              <div style={{width:5,height:RED_M.has(m)?2:1,background:RED_M.has(m)?'#dc2626':'#94a3b8'}}/>
            </div>
          )
        })}
      </div>
      {/* Membrane */}
      <div style={{width:52,position:'relative',height:240,background:'linear-gradient(180deg,#1e293b,#0f172a)',borderRadius:4,overflow:'hidden',border:'1px solid rgba(255,255,255,0.06)'}}>
        {ms.map(m => (
          <div key={m} style={{position:'absolute',top:`${mwToY(m,gelType)}%`,left:0,right:0,height:RED_M.has(m)?1.5:1,background:RED_M.has(m)?'rgba(220,38,38,0.35)':'rgba(148,163,184,0.1)'}}/>
        ))}
        {/* Cut lines */}
        {cuts.map(cutMW => (
          <div key={cutMW} style={{position:'absolute',top:`${mwToY(cutMW,gelType)}%`,left:-2,right:-2,height:2,background:'#fbbf24',zIndex:3,boxShadow:'0 0 4px #fbbf2488'}}>
            <div style={{position:'absolute',right:-14,top:-7,fontSize:9,color:'#fbbf24',...mono}}>✂</div>
          </div>
        ))}
        {/* Protein bands */}
        {run.proteins.map(p => {
          const ci = allProteins.findIndex(x=>x.id===p.id)
          const col = COLORS[ci%COLORS.length]
          const dispMW = forcedIds.has(p.id) ? 260 : p.mw
          return (
            <div key={p.id} title={`${p.name} ${p.mw} kDa`}
              style={{position:'absolute',top:`${mwToY(dispMW,gelType)}%`,left:'8%',right:'8%',height:3,background:col,borderRadius:2,boxShadow:`0 0 6px ${col}bb`,transform:'translateY(-50%)',zIndex:2}}/>
          )
        })}
      </div>
    </div>
  )
}

// ── Cut diagram for settings ──
function CutDiagram({mode, en}) {
  const isStd = mode === 'standard'
  const mono = {fontFamily:'monospace'}
  const rows_std = [
    {type:'band',  label:en?'── Protein A ──':'── 蛋白 A ──', color:'#2563eb'},
    {type:'gap'},
    {type:'marker',label:'75 kDa ─────────────────', red:true},
    {type:'gap'},
    {type:'cut',   label:en?'- - - - ✂ cut here - - -':'- - - - ✂ 在此切割 - -'},
    {type:'gap'},
    {type:'marker',label:'50 kDa ─────────────────', red:false},
    {type:'gap'},
    {type:'band',  label:en?'── Protein B ──':'── 蛋白 B ──', color:'#dc2626'},
  ]
  const rows_ss = [
    {type:'band',       label:en?'── Protein A ──':'── 蛋白 A ──', color:'#2563eb'},
    {type:'gap'},
    {type:'marker_cut', label:'50 kDa ─────────────────'},
    {type:'gap'},
    {type:'band',       label:en?'── Protein B ──':'── 蛋白 B ──', color:'#dc2626'},
  ]
  const rows = isStd ? rows_std : rows_ss
  return (
    <div style={{background:'#0f172a',borderRadius:8,padding:'10px 14px',...mono,fontSize:11,lineHeight:'1.9'}}>
      {rows.map((r,i) => {
        if(r.type==='band')   return <div key={i} style={{color:r.color,fontWeight:700}}>{r.label}</div>
        if(r.type==='marker') return <div key={i} style={{color:r.red?'#ef4444':'#94a3b8',fontWeight:r.red?700:400}}>{r.label}</div>
        if(r.type==='cut')    return <div key={i} style={{color:'#fbbf24',fontWeight:600}}>{r.label}</div>
        if(r.type==='marker_cut') return (
          <div key={i}>
            <div style={{color:'#94a3b8'}}>{r.label}</div>
            <div style={{color:'#fbbf24',fontWeight:600,marginTop:-2}}>{'- - - - ✂ '+(en?'cut here':'在此切割')+' - - -'}</div>
          </div>
        )
        return <div key={i} style={{height:2}}/>
      })}
      <div style={{marginTop:6,paddingTop:6,borderTop:'1px solid rgba(255,255,255,0.07)',fontSize:10,color:'#64748b',lineHeight:1.6}}>
        {isStd?(en?'≥1 full marker above & below each protein':'蛋白上下各留一条完整 marker'):(en?'Cut at marker line — for limited samples':'直接在 marker 线上切，适合样本不足时')}
      </div>
    </div>
  )
}

// ── Export text (new compact format) ──
function buildExportText(physicalGels, pZone, cutMode, gelFormat, wellsPerRun, lang) {
  const en = lang==='en'
  const today = new Date().toLocaleDateString()
  const lines = [
    '============================================================',
    en?'  WESTERN BLOT MEMBRANE PLAN':'  Western Blot 膜分组方案',
    '============================================================',
    `${en?'Date':'日期'}: ${today}    ${en?'Mode':'模式'}: ${cutMode==='standard'?(en?'Standard':'标准'):(en?'Sample-Saving':'节省样本')}`,
    `${en?'Gel format':'Gel 规格'}: ${gelFormat}-well    ${en?'Wells per run':'每次孔数'}: ${wellsPerRun}`,
    '',
  ]
  for(const pg of physicalGels) {
    const unusedStr = pg.unusedWells > 0 ? `  (Well ${pg.usedWells+1}–${pg.totalWells} unused)` : ''
    lines.push(`GEL ${pg.physIndex}  [${pg.gelType}]  ·  ${pg.totalWells}-well${unusedStr}`)
    lines.push('─'.repeat(52))
    for(const run of pg.runs) {
      lines.push(`  Well ${run.wellStart}–${run.wellEnd}`)
      const zones = usableZones(run.gelType)
      const cuts = getCutsForProteins(run.proteins, pZone, run.gelType)
      let lastCutPrinted = false
      for(const z of zones) {
        const prots = run.proteins.filter(p => pZone[p.id]?.id === z.id)
        const cutHere = cuts.includes(z.lo)
        if(cutHere) lines.push(`    ✂ cut at ${z.lo} kDa`)
        if(prots.length) {
          prots.forEach(p => lines.push(`    ${p.name} (${p.mw}k)`))
        }
      }
      lines.push('')
    }
  }
  lines.push('============================================================')
  lines.push(en
    ?'Bio-Rad Ladder: 250/150/100/75(red)/50/37/25(red)/20/15/10 kDa'
    :'Bio-Rad Marker: 250/150/100/75(红)/50/37/25(红)/20/15/10 kDa')
  lines.push('============================================================')
  return lines.join('\n')
}

// ── Main ──
export default function PlannerApp({lang, setLang, user, isAdmin, onAdminPanel, onSignOut}) {
  const [proteins,setProteins]   = useState([])
  const [nameInp,setNameInp]     = useState('')
  const [mwInp,setMwInp]         = useState('')
  const [addErr,setAddErr]       = useState('')
  const [showPresets,setShowPresets] = useState(false)
  const [nextId,setNextId]       = useState(1)
  const fileRef = useRef()

  const [gelEnabled,setGelEnabled] = useState({'10%':true,'15%':true,'4-20%':false})
  const [gelStock,setGelStock]     = useState({'10%':4,'15%':4,'4-20%':0})
  const [cutMode,setCutMode]       = useState('standard')
  const [forcedIds,setForcedIds]   = useState(new Set())
  const [wellsPerRun,setWellsPerRun] = useState(4)
  const [gelFormat,setGelFormat]     = useState(12)

  const [plan,setPlan]         = useState(null)
  const [physicalGels,setPhysicalGels] = useState([])
  const [planErr,setPlanErr]   = useState('')
  const [step,setStep]         = useState(1)
  const [exportText,setExportText] = useState(null)

  const en = lang==='en'
  const enabled = Object.keys(gelEnabled).filter(k=>gelEnabled[k])
  const mono = {fontFamily:'monospace'}
  const card = {background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:'20px 22px',marginBottom:14}
  const lbl  = {fontSize:11,color:'#64748b',fontFamily:'monospace',letterSpacing:.5,textTransform:'uppercase'}
  const SBGS = ['#dbeafe','#dcfce7','#fef9c3','#fce7f3','#e0e7ff','#ffedd5','#f0fdf4','#fdf4ff','#ecfdf5','#fff7ed']
  const SBDR = ['#93c5fd','#86efac','#fde047','#f9a8d4','#a5b4fc','#fdba74','#6ee7b7','#d8b4fe','#34d399','#fb923c']

  const addProtein = () => {
    setAddErr('')
    const name = nameInp.trim(), mw = parseFloat(mwInp)
    if(!name) { setAddErr(en?'Enter a name.':'请输入名称。'); return }
    if(!mw||mw<=0||mw>1000) { setAddErr(en?'Invalid MW (1–1000).':'无效分子量。'); return }
    if(proteins.some(p=>p.name.toLowerCase()===name.toLowerCase())) { setAddErr(en?'Already added.':'已存在。'); return }
    setProteins(prev=>[...prev,{id:nextId,name,mw}])
    setNextId(n=>n+1); setNameInp(''); setMwInp('')
  }
  const addPreset = p => {
    if(proteins.some(x=>x.name===p.name)) return
    setProteins(prev=>[...prev,{id:nextId,name:p.name,mw:p.mw}])
    setNextId(n=>n+1)
  }
  const handleUpload = e => {
    const file=e.target.files[0]; if(!file) return
    const reader=new FileReader()
    reader.onload=ev=>{
      let added=0
      ev.target.result.split(/\r?\n/).forEach(line=>{
        const parts=line.split(/[\t,]+/)
        if(parts.length>=2){
          const name=parts[0].trim(),mw=parseFloat(parts[1])
          if(name&&mw>0&&mw<=1000&&!proteins.some(p=>p.name.toLowerCase()===name.toLowerCase())){
            setProteins(prev=>[...prev,{id:nextId+added,name,mw}]); added++
          }
        }
      })
      setNextId(n=>n+added)
    }
    reader.readAsText(file); e.target.value=''
  }
  const doExportList = () => {
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([proteins.map(p=>`${p.name}\t${p.mw}`).join('\n')],{type:'text/plain'}))
    a.download='proteins.txt'; a.click()
  }

  const incompatible = proteins.filter(p => !forcedIds.has(p.id) && !enabled.some(g=>gelCanRun(g,p.mw)))
  const suggestedGels = [...new Set(incompatible.flatMap(p=>[...specialistGels(p.mw),'4-20%']))].filter(g=>!gelEnabled[g])

  const generate = () => {
    setPlanErr('')
    if(!proteins.length) { setPlanErr(en?'Add proteins first.':'请先添加蛋白。'); return }
    if(!enabled.length)  { setPlanErr(en?'Select at least one gel.':'请至少选择一种胶。'); return }
    const result = buildPlan(proteins, cutMode, enabled, forcedIds)
    const pg = mergeIntoPhysicalGels(result.logicalGels, wellsPerRun, gelFormat)
    setPlan(result)
    setPhysicalGels(pg)
    setStep(3)
  }

  const sc = physicalGels.length ? (() => {
    const needed={}
    physicalGels.forEach(g=>{needed[g.gelType]=(needed[g.gelType]||0)+1})
    const issues=Object.entries(needed).filter(([t,n])=>(gelStock[t]||0)<n).map(([t,n])=>({type:t,have:gelStock[t]||0,need:n}))
    return{ok:!issues.length,issues,needed}
  })() : null

  return (
    <div style={{minHeight:'100vh',background:'#f1f5f9'}}>
      <style>{FONTS}</style>

      {/* Nav */}
      <div style={{background:'#0f172a',padding:'0 24px'}}>
        <div style={{maxWidth:1100,margin:'0 auto',height:54,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontFamily:"'DM Serif Display',serif",color:'#f8fafc',fontSize:18}}>{en?'WB Planner':'WB 规划器'}</span>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <button onClick={()=>setLang(l=>l==='en'?'zh':'en')}
              style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#94a3b8',borderRadius:16,padding:'4px 12px',fontSize:11,cursor:'pointer',...mono}}>
              {en?'中文':'English'}
            </button>
            {user && <span style={{fontSize:11,color:'#475569',...mono}}>{user.displayName||user.email}</span>}
            {isAdmin && (
              <button onClick={onAdminPanel}
                style={{background:'#7c3aed',border:'none',color:'#fff',borderRadius:8,padding:'4px 12px',fontSize:11,fontWeight:600,cursor:'pointer',...mono}}>
                ⚙ {en?'Admin':'管理'}
              </button>
            )}
            <button onClick={onSignOut} style={{background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:12}}>
              {en?'Sign Out':'退出'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0'}}>
        <div style={{maxWidth:1100,margin:'0 auto',padding:'0 24px',display:'flex'}}>
          {[[1,en?'1. Proteins':'1. 蛋白'],[2,en?'2. Settings':'2. 设置'],[3,en?'3. Plan':'3. 方案']].map(([n,label])=>(
            <button key={n} onClick={()=>{if(n<3||plan) setStep(n)}}
              style={{padding:'14px 22px',border:'none',background:'none',cursor:(n===3&&!plan)?'not-allowed':'pointer',fontSize:13,fontWeight:step===n?600:400,color:step===n?'#2563eb':'#64748b',borderBottom:step===n?'2.5px solid #2563eb':'2.5px solid transparent',opacity:(n===3&&!plan)?0.5:1}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'24px'}}>

        {/* ═══ STEP 1 ═══ */}
        {step===1 && (
          <div>
            <div style={card}>
              <div style={{...lbl,display:'block',marginBottom:14}}>{en?'Add Protein':'添加蛋白'}</div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <span style={lbl}>{en?'Name':'名称'}</span>
                  <input value={nameInp} onChange={e=>setNameInp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addProtein()} placeholder="e.g. p-AKT"
                    style={{padding:'8px 12px',border:'1.5px solid #e2e8f0',borderRadius:7,fontSize:13,width:155,outline:'none'}}/>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <span style={lbl}>{en?'MW (kDa)':'分子量 (kDa)'}</span>
                  <input value={mwInp} onChange={e=>setMwInp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addProtein()} type="number" placeholder="60"
                    style={{padding:'8px 12px',border:'1.5px solid #e2e8f0',borderRadius:7,fontSize:13,width:90,outline:'none'}}/>
                </div>
                <button onClick={addProtein} style={{height:37,padding:'0 15px',background:'#1e293b',color:'#fff',border:'none',borderRadius:7,cursor:'pointer',fontSize:13,alignSelf:'flex-end'}}>+ {en?'Add':'添加'}</button>
                <button onClick={()=>setShowPresets(x=>!x)} style={{height:37,padding:'0 14px',background:'#f1f5f9',color:'#334155',border:'none',borderRadius:7,cursor:'pointer',fontSize:13,alignSelf:'flex-end'}}>⊞ {en?'Lab Presets':'实验室预设'}</button>
                <button onClick={()=>fileRef.current.click()} style={{height:37,padding:'0 14px',background:'#f1f5f9',color:'#334155',border:'none',borderRadius:7,cursor:'pointer',fontSize:13,alignSelf:'flex-end'}}>↑ {en?'Upload .txt':'上传 .txt'}</button>
                {proteins.length>0 && <>
                  <button onClick={doExportList} style={{height:37,padding:'0 14px',background:'#f1f5f9',color:'#334155',border:'none',borderRadius:7,cursor:'pointer',fontSize:13,alignSelf:'flex-end'}}>↓ {en?'Export list':'导出列表'}</button>
                  <button onClick={()=>setProteins([])} style={{height:37,padding:'0 14px',background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca',borderRadius:7,cursor:'pointer',fontSize:13,alignSelf:'flex-end'}}>✕ {en?'Clear':'清空'}</button>
                </>}
                <input ref={fileRef} type="file" accept=".txt,.csv" onChange={handleUpload} style={{display:'none'}}/>
              </div>
              {addErr && <div style={{fontSize:12,color:'#dc2626',marginTop:8,background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,padding:'6px 12px'}}>{addErr}</div>}

              {showPresets && (
                <div style={{marginTop:14,padding:14,background:'#f8fafc',borderRadius:8,border:'1px solid #e2e8f0'}}>
                  <div style={{fontSize:10,color:'#94a3b8',...mono,marginBottom:8}}>{en?'Click to add · sorted by MW (high→low) · [gel type]':'点击添加 · 按分子量从大到小排列 · [胶浓度]'}</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                    {LAB_PRESETS.map(p => {
                      const added = proteins.some(x=>x.name===p.name)
                      const sg = specialistGels(p.mw)
                      return (
                        <button key={p.name} onClick={()=>addPreset(p)} disabled={added}
                          style={{padding:'4px 11px',borderRadius:14,border:'1px solid '+(added?'#e2e8f0':'#cbd5e1'),background:added?'#f1f5f9':'#fff',color:added?'#94a3b8':'#334155',fontSize:11.5,cursor:added?'default':'pointer',...mono}}>
                          {p.name} <span style={{opacity:.4,fontSize:9}}>{p.mw}</span>
                          <span style={{opacity:.3,fontSize:8.5}}> [{sg.length?sg.join('/'):'4-20%'}]</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {proteins.length>0 && (
              <div style={card}>
                <div style={{...lbl,display:'block',marginBottom:12}}>{proteins.length} {en?'proteins added':'个蛋白已添加'}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {proteins.map((p,i) => {
                    const col = COLORS[i%COLORS.length]
                    const sg = specialistGels(p.mw)
                    return (
                      <div key={p.id} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 10px 4px 8px',background:col+'15',border:`1.5px solid ${col}55`,borderRadius:20,fontSize:12.5,...mono}}>
                        <div style={{width:7,height:7,borderRadius:'50%',background:col}}/>
                        <span style={{fontWeight:500,color:'#1e293b'}}>{p.name}</span>
                        <span style={{opacity:.5,fontSize:10}}>{p.mw}k</span>
                        <span style={{fontSize:9,color:'#94a3b8'}}>[{sg.length?sg.join('/'):'4-20%'}]</span>
                        <button onClick={()=>setProteins(prev=>prev.filter(x=>x.id!==p.id))} style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:15,lineHeight:1,padding:'0 0 0 2px'}}>×</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {proteins.length>0 && (
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button onClick={()=>setStep(2)} style={{padding:'10px 26px',background:'#1e293b',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer'}}>{en?'Next: Settings →':'下一步：设置 →'}</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 2 ═══ */}
        {step===2 && (
          <div>
            {/* Gel type + stock */}
            <div style={card}>
              <div style={{...lbl,display:'block',marginBottom:16}}>{en?'Gel Type & Inventory':'胶类型与库存'}</div>
              {suggestedGels.length>0 && (
                <div style={{marginBottom:14,padding:'10px 14px',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,fontSize:12.5,color:'#92400e'}}>
                  ⚠ {en?`${incompatible.map(p=>p.name).join(', ')} need${incompatible.length===1?'s':''} `:`${incompatible.map(p=>p.name).join('、')} 需要 `}
                  <strong>{suggestedGels.join(' / ')}</strong>
                  {en?' — consider enabling below.':' 胶，建议在下方勾选。'}
                </div>
              )}
              {[
                ['10%',  en?'Good for ≥ 37 kDa (most common)':'适合 ≥ 37 kDa，最常用'],
                ['15%',  en?'Good for ≤ 75 kDa (Caspase cleaved, FABP1…)':'适合 ≤ 75 kDa，检测小蛋白必须'],
                ['4-20%',en?'Full range 10–250 kDa':'全范围，最万能'],
              ].map(([key,desc]) => (
                <div key={key} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px',background:gelEnabled[key]?'#eff6ff':'#f8fafc',border:`1.5px solid ${gelEnabled[key]?'#93c5fd':'#e2e8f0'}`,borderRadius:8,marginBottom:8}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',flex:1}}>
                    <input type="checkbox" checked={gelEnabled[key]} onChange={e=>setGelEnabled(prev=>({...prev,[key]:e.target.checked}))} style={{width:16,height:16,accentColor:'#2563eb',cursor:'pointer'}}/>
                    <span style={{fontWeight:600,fontSize:13,color:'#1e293b',...mono}}>{key}</span>
                    <span style={{fontSize:12,color:'#64748b'}}>{desc}</span>
                  </label>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                    <span style={lbl}>{en?'Stock':'库存'}</span>
                    <div style={{display:'flex',alignItems:'center',border:'1.5px solid #e2e8f0',borderRadius:7,overflow:'hidden'}}>
                      <button onClick={()=>setGelStock(p=>({...p,[key]:Math.max(0,(p[key]||0)-1)}))} style={{width:30,height:30,border:'none',background:'#f1f5f9',cursor:'pointer',fontSize:16,color:'#475569'}}>−</button>
                      <span style={{width:34,textAlign:'center',fontSize:14,...mono,fontWeight:600,color:'#1e293b'}}>{gelStock[key]||0}</span>
                      <button onClick={()=>setGelStock(p=>({...p,[key]:(p[key]||0)+1}))} style={{width:30,height:30,border:'none',background:'#f1f5f9',cursor:'pointer',fontSize:16,color:'#475569'}}>+</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Gel format + wells per run */}
            <div style={card}>
              <div style={{...lbl,display:'block',marginBottom:16}}>{en?'Gel Format & Sample Setup':'Gel 规格与样品设置'}</div>
              <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'flex-start'}}>
                <div>
                  <div style={{...lbl,marginBottom:8}}>{en?'Gel format':'Gel 孔数'}</div>
                  <div style={{display:'flex',gap:8}}>
                    {[12,15].map(f=>(
                      <button key={f} onClick={()=>setGelFormat(f)}
                        style={{padding:'8px 20px',border:`2px solid ${gelFormat===f?'#2563eb':'#e2e8f0'}`,background:gelFormat===f?'#eff6ff':'#fff',borderRadius:8,cursor:'pointer',fontSize:14,fontWeight:gelFormat===f?700:400,...mono,color:gelFormat===f?'#2563eb':'#64748b'}}>
                        {f}-well
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{flex:1,minWidth:240}}>
                  <div style={{...lbl,marginBottom:4}}>{en?'Wells per run':'每次 run 占用孔数'}</div>
                  <div style={{fontSize:11,color:'#94a3b8',...mono,marginBottom:8,lineHeight:1.6}}>
                    {en
                      ?'Count ALL wells used per run: marker(s) + samples + any blank spacer wells between marker and samples or between runs.'
                      :'请数清楚每次 run 实际占用的孔数，包括：marker 孔 + 样品孔 + marker 与样品之间的空白孔 + run 之间的间隔孔。'}
                    <br/>
                    <span style={{color:'#64748b'}}>{en?'e.g. 1 marker + 1 blank + 3 samples = 5':'例：1 marker + 1 空格 + 3 样品 = 填 5'}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{display:'flex',alignItems:'center',border:'1.5px solid #e2e8f0',borderRadius:7,overflow:'hidden'}}>
                      <button onClick={()=>setWellsPerRun(n=>Math.max(1,n-1))} style={{width:34,height:34,border:'none',background:'#f1f5f9',cursor:'pointer',fontSize:18,color:'#475569'}}>−</button>
                      <span style={{width:40,textAlign:'center',fontSize:16,...mono,fontWeight:700,color:'#1e293b'}}>{wellsPerRun}</span>
                      <button onClick={()=>setWellsPerRun(n=>Math.min(gelFormat,n+1))} style={{width:34,height:34,border:'none',background:'#f1f5f9',cursor:'pointer',fontSize:18,color:'#475569'}}>+</button>
                    </div>
                    <span style={{fontSize:12,color:'#94a3b8',...mono}}>
                      → {en?`${Math.floor(gelFormat/wellsPerRun)} run${Math.floor(gelFormat/wellsPerRun)>1?'s':''} per gel`:`每张 gel 可跑 ${Math.floor(gelFormat/wellsPerRun)} 次`}
                      {gelFormat % wellsPerRun > 0 && <span style={{color:'#f59e0b'}}>{en?` · ${gelFormat%wellsPerRun} well(s) unused`:` · 剩 ${gelFormat%wellsPerRun} 孔空余`}</span>}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cutting mode */}
            <div style={card}>
              <div style={{...lbl,display:'block',marginBottom:14}}>{en?'Cutting Mode':'切膜模式'}</div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                {[
                  ['standard',     en?'Standard':'标准模式',      en?'Leave one empty zone between proteins — safer.':'两蛋白之间留一空区间，更安全。'],
                  ['sample-saving',en?'Sample-Saving':'样本节省',  en?'Adjacent zones allowed — for limited samples.':'相邻区间可放蛋白，样本极少时用。'],
                ].map(([key,lbl2,desc]) => (
                  <button key={key} onClick={()=>setCutMode(key)}
                    style={{flex:1,minWidth:220,padding:'14px 16px',border:`2px solid ${cutMode===key?'#7c3aed':'#e2e8f0'}`,background:cutMode===key?'#f5f3ff':'#fff',borderRadius:10,cursor:'pointer',textAlign:'left'}}>
                    <div style={{fontWeight:600,fontSize:13,color:cutMode===key?'#7c3aed':'#334155',marginBottom:4,...mono}}>{lbl2}</div>
                    <div style={{fontSize:11,color:'#64748b',lineHeight:1.5,marginBottom:10}}>{desc}</div>
                    <CutDiagram mode={key} en={en}/>
                  </button>
                ))}
              </div>
            </div>

            {/* Incompatible proteins */}
            {incompatible.length>0 && (
              <div style={{...card,background:'#fef2f2',border:'1px solid #fecaca'}}>
                <div style={{...lbl,display:'block',marginBottom:10,color:'#dc2626'}}>⚠ {en?'Cannot run on selected gels:':'以下蛋白无法用所选胶检测：'}</div>
                {incompatible.map(p => {
                  const forced = forcedIds.has(p.id)
                  return (
                    <div key={p.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'#fff',border:'1px solid #fecaca',borderRadius:8,marginBottom:8,gap:12,flexWrap:'wrap'}}>
                      <div>
                        <span style={{fontWeight:600,...mono,fontSize:13,color:'#1e293b'}}>{p.name}</span>
                        <span style={{fontSize:11,color:'#dc2626',marginLeft:8}}>{p.mw} kDa</span>
                        <div style={{fontSize:12,color:'#64748b',marginTop:3}}>
                          {en?`Needs: ${[...specialistGels(p.mw),'4-20%'].join(' or ')}`:`需要: ${[...specialistGels(p.mw),'4-20%'].join(' 或 ')}`}
                        </div>
                      </div>
                      <button onClick={()=>setForcedIds(prev=>{const s=new Set(prev);forced?s.delete(p.id):s.add(p.id);return s})}
                        style={{padding:'6px 14px',background:forced?'#fef3c7':'#f1f5f9',color:forced?'#92400e':'#475569',border:`1px solid ${forced?'#fde68a':'#e2e8f0'}`,borderRadius:7,cursor:'pointer',fontSize:12}}>
                        {forced?(en?'✓ Forced':'✓ 已强制'):(en?'Force assign':'强制分配')}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {planErr && <div style={{fontSize:13,color:'#dc2626',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',marginBottom:12}}>{planErr}</div>}
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <button onClick={()=>setStep(1)} style={{padding:'10px 20px',background:'#f1f5f9',color:'#475569',border:'none',borderRadius:8,fontSize:13,cursor:'pointer'}}>← {en?'Back':'返回'}</button>
              <button onClick={generate} style={{padding:'10px 28px',background:'#2563eb',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer'}}>{en?'Generate Plan →':'生成方案 →'}</button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3 ═══ */}
        {step===3 && plan && (
          <div>
            {/* Stock check */}
            {sc && (
              <div style={{marginBottom:16,padding:'14px 18px',background:sc.ok?'#f0fdf4':'#fef2f2',border:`1px solid ${sc.ok?'#bbf7d0':'#fecaca'}`,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                <span style={{fontWeight:600,fontSize:13,color:sc.ok?'#16a34a':'#dc2626',...mono}}>
                  {sc.ok?(en?'✓ Stock sufficient':'✓ 库存充足'):(en?'⚠ Insufficient stock':'⚠ 库存不足')}
                </span>
                {!sc.ok && sc.issues.map(({type,have,need}) => (
                  <span key={type} style={{fontSize:12,color:'#dc2626',...mono}}>
                    {type}: {en?`need ${need-have} more (have ${have}/${need})`:`需再补 ${need-have} 张（现有 ${have}/${need}）`}
                  </span>
                ))}
                <div style={{display:'flex',gap:14}}>
                  {Object.entries(sc.needed).map(([type,need]) => {
                    const have=gelStock[type]||0
                    return (
                      <div key={type} style={{textAlign:'center'}}>
                        <div style={{fontSize:10,...mono,color:'#64748b'}}>{type}</div>
                        <div style={{fontSize:14,fontWeight:700,...mono,color:have>=need?'#16a34a':'#dc2626'}}>{have}/{need}</div>
                        <div style={{fontSize:9,color:'#94a3b8',...mono}}>{en?'have/need':'有/需'}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Summary row + export */}
            <div style={{display:'flex',gap:12,marginBottom:18,flexWrap:'wrap',alignItems:'stretch'}}>
              {[
                [physicalGels.length, en?'Physical Gels':'实际 Gel 数', false],
                [plan.logicalGels.length, en?'Total Runs':'总 Run 数', false],
                [proteins.length, en?'Proteins':'蛋白数量', false],
                [plan.unassignable.length, en?'Unassigned':'未分配', true],
              ].map(([v,label,warn]) => (
                <div key={label} style={{flex:1,minWidth:90,background:'#0f172a',borderRadius:10,padding:'12px 16px'}}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:(warn&&v>0)?'#f87171':'#f8fafc'}}>{v}</div>
                  <div style={{fontSize:10,color:'#475569',...mono,marginTop:2}}>{label}</div>
                </div>
              ))}
              <div style={{flex:1,minWidth:140,background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px',display:'flex',flexDirection:'column',justifyContent:'center',gap:6}}>
                <button onClick={()=>setExportText(buildExportText(physicalGels,plan.pZone,cutMode,gelFormat,wellsPerRun,lang))}
                  style={{padding:'9px 14px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                  📄 {en?'Export Plan':'导出方案'}
                </button>
              </div>
            </div>

            {/* Unassigned */}
            {plan.unassignable.length>0 && (
              <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'14px 18px',marginBottom:14}}>
                <div style={{fontSize:12,...mono,fontWeight:600,color:'#dc2626',marginBottom:8}}>
                  ⚠ {en?'Not assigned — enable the correct gel type in Settings:':'未分配 — 请在设置中勾选对应胶浓度：'}
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {plan.unassignable.map(p => (
                    <span key={p.id} style={{fontSize:12,...mono,color:'#991b1b',background:'#fee2e2',borderRadius:12,padding:'3px 10px'}}>
                      {p.name} {p.mw}k → {[...specialistGels(p.mw),'4-20%'].join(' or ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Physical gel cards */}
            {physicalGels.map(pg => (
              <div key={pg.physIndex} style={card}>
                {/* Gel header */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
                  <span style={{background:'#1e293b',color:'#fff',...mono,fontSize:12,padding:'4px 12px',borderRadius:6}}>GEL {pg.physIndex}</span>
                  <span style={{...mono,fontSize:13,color:'#64748b'}}>{pg.gelType}</span>
                  <span style={{...mono,fontSize:11,color:'#94a3b8'}}>{pg.totalWells}-well</span>
                  <span style={{...mono,fontSize:11,color:'#94a3b8'}}>·</span>
                  <span style={{...mono,fontSize:11,color:'#64748b'}}>
                    {pg.runs.length} {en?`run${pg.runs.length>1?'s':''}`:` 次 run`}
                    {pg.unusedWells>0 && <span style={{color:'#f59e0b',marginLeft:6}}>· Well {pg.usedWells+1}–{pg.totalWells} unused</span>}
                  </span>
                </div>

                {/* Runs side by side */}
                <div style={{display:'flex',gap:20,overflowX:'auto',paddingBottom:8}}>
                  {pg.runs.map((run, ri) => {
                    const cuts = getCutsForProteins(run.proteins, plan.pZone, pg.gelType)
                    const zones = usableZones(pg.gelType).filter(z => {
                      const hasProt = run.proteins.some(p=>plan.pZone[p.id]?.id===z.id)
                      const hasCut = cuts.includes(z.lo)
                      return hasProt || hasCut
                    })
                    return (
                      <div key={ri} style={{flexShrink:0,minWidth:200}}>
                        {/* Well label */}
                        <div style={{...mono,fontSize:11,fontWeight:700,color:'#2563eb',marginBottom:8,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'4px 10px',display:'inline-block'}}>
                          Well {run.wellStart}–{run.wellEnd}
                        </div>
                        {/* Strip + labels side by side */}
                        <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                          <RunStrip run={run} allProteins={proteins} pZone={plan.pZone} gelType={pg.gelType} forcedIds={forcedIds} en={en}/>
                          {/* Protein list beside strip */}
                          <div style={{paddingTop:4}}>
                            {(() => {
                              const ms = visMarkers(pg.gelType)
                              const cuts2 = getCutsForProteins(run.proteins, plan.pZone, pg.gelType)
                              const allZones = usableZones(pg.gelType)
                              return allZones.map((z,zi) => {
                                const prots = run.proteins.filter(p=>plan.pZone[p.id]?.id===z.id)
                                const cutHere = cuts2.includes(z.lo)
                                if(!prots.length && !cutHere) return null
                                const yTop = mwToY(z.top ? 260 : z.hi, pg.gelType)
                                const yBot = mwToY(z.lo === 0 ? 8 : z.lo, pg.gelType)
                                const yMid = (yTop + yBot) / 2
                                return (
                                  <div key={z.id}>
                                    {cutHere && (
                                      <div style={{fontSize:10,...mono,color:'#d97706',marginBottom:2,marginTop:2,display:'flex',alignItems:'center',gap:4}}>
                                        <span>✂</span><span style={{borderTop:'1px dashed #fbbf24',flex:1,minWidth:40}}/><span>{en?`cut at ${z.lo} kDa`:`在 ${z.lo} kDa 切`}</span>
                                      </div>
                                    )}
                                    {prots.map(p => {
                                      const ci = proteins.findIndex(x=>x.id===p.id)
                                      const col = COLORS[ci%COLORS.length]
                                      return (
                                        <div key={p.id} style={{display:'flex',alignItems:'center',gap:5,marginBottom:3,padding:'2px 8px 2px 5px',background:col+'12',border:`1px solid ${col}44`,borderRadius:10,fontSize:11,...mono}}>
                                          <div style={{width:6,height:6,borderRadius:'50%',background:col,flexShrink:0}}/>
                                          <span style={{color:'#1e293b',fontWeight:500}}>{p.name}</span>
                                          <span style={{color:'#94a3b8',fontSize:9}}>{p.mw}k</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })
                            })()}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <button onClick={()=>setStep(2)} style={{padding:'9px 20px',background:'#f1f5f9',color:'#475569',border:'none',borderRadius:8,fontSize:13,cursor:'pointer'}}>← {en?'Back to Settings':'返回设置'}</button>
          </div>
        )}
      </div>

      {/* Export modal */}
      {exportText && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:24}}>
          <div style={{background:'#fff',borderRadius:14,padding:24,width:'100%',maxWidth:600,maxHeight:'80vh',display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontWeight:700,fontSize:15,color:'#1e293b'}}>{en?'WB Plan — Copy & Paste':'WB 方案 — 复制粘贴'}</span>
              <button onClick={()=>setExportText(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#94a3b8',lineHeight:1}}>×</button>
            </div>
            <div style={{fontSize:12,color:'#64748b'}}>{en?'Click inside, Ctrl+A to select all, Ctrl+C to copy.':'点击文本框，Ctrl+A 全选，Ctrl+C 复制。'}</div>
            <textarea readOnly value={exportText} onClick={e=>e.target.select()}
              style={{flex:1,minHeight:300,fontFamily:'monospace',fontSize:11,padding:14,border:'1.5px solid #e2e8f0',borderRadius:8,background:'#f8fafc',color:'#1e293b',resize:'none',lineHeight:1.6,whiteSpace:'pre'}}/>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>{const el=document.querySelector('textarea[readonly]');if(el){el.select();document.execCommand('copy');}}}
                style={{padding:'9px 20px',background:'#2563eb',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                {en?'Copy All':'全部复制'}
              </button>
              <button onClick={()=>setExportText(null)} style={{padding:'9px 20px',background:'#f1f5f9',color:'#475569',border:'none',borderRadius:8,fontSize:13,cursor:'pointer'}}>
                {en?'Close':'关闭'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
