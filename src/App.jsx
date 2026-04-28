import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ─── Constants ────────────────────────────────────────────────────────────────

const SHOT_TYPES = [
  "Layup","Floater","Free Throw","Mid-Range Jumper",
  "3-Pointer","Jump Shot (2 dribbles)","Catch & Shoot","Pull-Up Jumper",
];
const SHOT_LOCATIONS = [
  "Paint","Free Throw Line","Mid-Range Left","Mid-Range Right",
  "Mid-Range Top","Corner 3 (Left)","Corner 3 (Right)","Above the Break 3",
];
const REACTIONS = ["🔥","💪","❤️","👏","⭐","🏀"];
const BADGES_META = {
  first_log:  { icon:"🏀", label:"First Log",    desc:"Logged your first workout" },
  streak_3:   { icon:"🔥", label:"3-Day Streak", desc:"3 days in a row" },
  streak_7:   { icon:"⚡", label:"Week Warrior",  desc:"7 days in a row" },
  shots_100:  { icon:"💯", label:"Century",       desc:"100 total shots made" },
  shots_500:  { icon:"🎯", label:"Sharpshooter", desc:"500 total shots made" },
  dribble_60: { icon:"🏆", label:"Ball Handler", desc:"60+ minutes dribbling" },
};

const C = {
  orange:"#F97316", navy:"#4F46E5", navyMid:"#A5B4FC",
  dark:"#EEF2FF", card:"#FFFFFF", muted:"#F1F5F9", border:"#E2E8F0",
  text:"#0F172A", sub:"#64748B",
  green:"#10B981", red:"#EF4444",
};
const AV_BG = ["#4F46E5","#F97316","#10B981","#8B5CF6","#EF4444","#06B6D4","#F59E0B","#EC4899"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tod        = () => new Date().toISOString().slice(0,10);
const initials   = n  => (n||"").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
const daysSince  = d  => d ? Math.floor((Date.now()-new Date(d))/86400000) : 999;

const getTotalShots    = (ws,uid) => ws.filter(w=>w.userId===uid).flatMap(w=>w.shots).reduce((s,sh)=>s+sh.made,0);
const getTotalDribble  = (ws,uid) => ws.filter(w=>w.userId===uid).reduce((s,w)=>s+w.dribble,0);
const getShotsByType   = (ws,uid,type) => ws.filter(w=>w.userId===uid).flatMap(w=>w.shots).filter(s=>s.type===type).reduce((s,sh)=>s+sh.made,0);
const getWeeklyShots   = (ws,uid,type) => {
  const cut=new Date(); cut.setDate(cut.getDate()-7);
  return ws.filter(w=>w.userId===uid&&new Date(w.date)>=cut).flatMap(w=>w.shots).filter(s=>!type||s.type===type).reduce((s,sh)=>s+sh.made,0);
};
const getWeeklyDribble = (ws,uid) => {
  const cut=new Date(); cut.setDate(cut.getDate()-7);
  return ws.filter(w=>w.userId===uid&&new Date(w.date)>=cut).reduce((s,w)=>s+w.dribble,0);
};

function xWorkout(w) {
  const reactions={};
  for (const r of w.reactions||[]) { if (!reactions[r.emoji]) reactions[r.emoji]=[]; reactions[r.emoji].push(r.user_id); }
  return {
    id:w.id, userId:w.user_id, teamId:w.team_id,
    date:w.date, dribble:w.dribble||0, note:w.note||"",
    shots:(w.shots||[]).map(s=>({type:s.type,location:s.location,cond:s.cond||"",made:s.made||0,attempted:s.attempted||0})),
    reactions,
    comments:(w.comments||[]).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).map(c=>({uid:c.user_id,text:c.text,date:c.date})),
  };
}
function xUser(u) { return {id:u.id,name:u.name,role:u.role,teamId:u.team_id,streak:u.streak||0,lastLog:u.last_log}; }
function xGoal(g) { return {id:g.id,type:g.type,shotType:g.shot_type,target:g.target,period:g.period,label:g.label,playerId:g.player_id}; }
function groupBadges(badges) {
  const g={};
  for (const b of badges||[]) { if (!g[b.user_id]) g[b.user_id]=[]; g[b.user_id].push(b.badge_id); }
  return g;
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function Av({name,size=36}){const bg=AV_BG[(name||"").charCodeAt(0)%AV_BG.length];return <div style={{width:size,height:size,borderRadius:"50%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.37,fontWeight:600,color:"#fff",flexShrink:0}}>{initials(name)}</div>;}
function Bar({val,max,color=C.orange}){const pct=max>0?Math.min(100,(val/max)*100):0;return <div style={{background:C.muted,borderRadius:99,height:7,overflow:"hidden"}}><div style={{width:`${pct}%`,background:color,height:"100%",borderRadius:99,transition:"width 0.4s"}}/></div>;}
function Pill({text,color=C.orange}){return <span style={{background:color+"28",color,borderRadius:8,padding:"2px 9px",fontSize:11,fontWeight:600,display:"inline-block"}}>{text}</span>;}
function Btn({children,onClick,color=C.orange,outline=false,sm=false,full=true,disabled=false,style:sx={}}){return <button onClick={onClick} disabled={disabled} style={{background:outline?"transparent":color,color:outline?color:"#fff",border:outline?`1.5px solid ${color}`:"none",borderRadius:sm?10:13,padding:sm?"7px 14px":"13px 20px",fontWeight:700,fontSize:sm?13:15,cursor:disabled?"not-allowed":"pointer",width:full?"100%":"auto",fontFamily:"inherit",opacity:disabled?0.5:1,...sx}}>{children}</button>;}
function Inp({label,...p}){return <div style={{marginBottom:12}}>{label&&<div style={{fontSize:12,color:C.sub,marginBottom:4}}>{label}</div>}<input style={{background:C.muted,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"11px 14px",color:C.text,fontSize:15,width:"100%",boxSizing:"border-box",fontFamily:"inherit",outline:"none"}} {...p}/></div>;}
function Sel({label,children,...p}){return <div style={{marginBottom:12}}>{label&&<div style={{fontSize:12,color:C.sub,marginBottom:4}}>{label}</div>}<select style={{background:C.muted,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"11px 14px",color:C.text,fontSize:15,width:"100%",boxSizing:"border-box",fontFamily:"inherit",outline:"none"}} {...p}>{children}</select></div>;}
function Card({children,style:sx={}}){return <div style={{background:C.card,borderRadius:16,padding:16,marginBottom:12,border:`1.5px solid ${C.border}`,...sx}}>{children}</div>;}
function Row({children,style:sx={}}){return <div style={{display:"flex",alignItems:"center",gap:10,...sx}}>{children}</div>;}
function Btwn({children,style:sx={}}){return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",...sx}}>{children}</div>;}
function SecTitle({children}){return <div style={{fontSize:12,fontWeight:700,color:C.sub,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:10}}>{children}</div>;}
function Spinner(){return <div style={{background:C.dark,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}><div style={{textAlign:"center",color:C.sub}}><div style={{fontSize:40,marginBottom:12}}>🏀</div><div>Loading…</div></div></div>;}

const scroll={padding:"12px 16px 100px",overflowY:"auto",maxHeight:"calc(100vh - 115px)"};

// ─── Auth ─────────────────────────────────────────────────────────────────────

function Auth() {
  const [tab,setTab]=useState("login");
  const [f,setF]=useState({email:"",name:"",teamName:"",code:"",pw:""});
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const sf=(k,v)=>setF(x=>({...x,[k]:v}));

  const login=async()=>{
    setBusy(true);setErr("");
    const{error}=await supabase.auth.signInWithPassword({email:f.email,password:f.pw});
    if(error)setErr(error.message);
    setBusy(false);
  };

  const createTeam=async()=>{
    if(!f.email||!f.name||!f.teamName||!f.pw)return setErr("Fill in all fields.");
    setBusy(true);setErr("");
    const{data,error}=await supabase.auth.signUp({email:f.email,password:f.pw});
    if(error){setErr(error.message);setBusy(false);return;}
    const code=(f.teamName.replace(/[^a-zA-Z]/g,"").toUpperCase().slice(0,4)+String(Math.floor(Math.random()*100)).padStart(2,"0")).slice(0,8);
    const{data:team,error:tErr}=await supabase.from("teams").insert({name:f.teamName,code}).select().single();
    if(tErr){setErr(tErr.message);setBusy(false);return;}
    await supabase.from("users").insert({id:data.user.id,name:f.name,role:"coach",team_id:team.id,streak:0});
    setBusy(false);
  };

  const joinTeam=async()=>{
    if(!f.email||!f.name||!f.code||!f.pw)return setErr("Fill in all fields.");
    setBusy(true);setErr("");
    const{data:team}=await supabase.from("teams").select("*").eq("code",f.code.trim().toUpperCase()).single();
    if(!team){setErr("Team code not found. Check with your coach.");setBusy(false);return;}
    const{data,error}=await supabase.auth.signUp({email:f.email,password:f.pw});
    if(error){setErr(error.message);setBusy(false);return;}
    await supabase.from("users").insert({id:data.user.id,name:f.name,role:"player",team_id:team.id,streak:0});
    setBusy(false);
  };

  const TABS=[["login","Sign In"],["coach","New Coach"],["player","Join Team"]];
  return (
    <div style={{background:C.dark,minHeight:"100vh",display:"flex",flexDirection:"column",justifyContent:"center",padding:"32px 24px",fontFamily:"system-ui,-apple-system,sans-serif",color:C.text}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:58,marginBottom:8}}>🏀</div>
        <div style={{fontSize:30,fontWeight:800,color:C.orange}}>HoopTrack</div>
        <div style={{color:C.sub,marginTop:6,fontSize:14}}>Off-season training tracker</div>
      </div>
      <div style={{display:"flex",background:C.card,borderRadius:14,padding:4,marginBottom:20,gap:4,border:`1.5px solid ${C.border}`}}>
        {TABS.map(([id,label])=><button key={id} onClick={()=>{setTab(id);setErr("");}} style={{flex:1,border:"none",borderRadius:11,padding:"10px 4px",fontWeight:600,fontSize:13,cursor:"pointer",background:tab===id?C.orange:"transparent",color:tab===id?"#fff":C.sub,fontFamily:"inherit",transition:"all 0.2s"}}>{label}</button>)}
      </div>
      {err&&<div style={{background:"#FEF2F2",color:"#B91C1C",borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:13,border:"1px solid #FECACA"}}>{err}</div>}
      {tab==="login"&&<><Inp label="Email" type="email" placeholder="you@email.com" value={f.email} onChange={e=>sf("email",e.target.value)}/><Inp label="Password" type="password" value={f.pw} onChange={e=>sf("pw",e.target.value)}/><Btn onClick={login} disabled={busy}>{busy?"Signing in…":"Sign In"}</Btn></>}
      {tab==="coach"&&<><Inp label="Your name" placeholder="Coach name" value={f.name} onChange={e=>sf("name",e.target.value)}/><Inp label="Email" type="email" placeholder="you@email.com" value={f.email} onChange={e=>sf("email",e.target.value)}/><Inp label="Team name" placeholder='e.g. "Eastside Ballers"' value={f.teamName} onChange={e=>sf("teamName",e.target.value)}/><Inp label="Password (6+ characters)" type="password" value={f.pw} onChange={e=>sf("pw",e.target.value)}/><Btn onClick={createTeam} disabled={busy}>{busy?"Creating…":"Create Team"}</Btn></>}
      {tab==="player"&&<><Inp label="Your name" placeholder="Your name" value={f.name} onChange={e=>sf("name",e.target.value)}/><Inp label="Email" type="email" placeholder="you@email.com" value={f.email} onChange={e=>sf("email",e.target.value)}/><Inp label="Team join code" placeholder="e.g. EAST24" value={f.code} onChange={e=>sf("code",e.target.value)}/><Inp label="Password (6+ characters)" type="password" value={f.pw} onChange={e=>sf("pw",e.target.value)}/><Btn onClick={joinTeam} disabled={busy}>{busy?"Joining…":"Join Team"}</Btn></>}
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function Header({title,sub}){return <div style={{padding:"16px 20px 12px",background:C.dark,borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:19,fontWeight:800,color:C.text}}>{title}</div>{sub&&<div style={{fontSize:12,color:C.sub,marginTop:2}}>{sub}</div>}</div>;}
function Nav({tabs,active,onChange}){return <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:C.dark,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100}}>{tabs.map(({id,label,icon})=><button key={id} onClick={()=>onChange(id)} style={{flex:1,border:"none",background:"transparent",padding:"10px 0 14px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:"inherit"}}><span style={{fontSize:20}}>{icon}</span><span style={{fontSize:10,color:active===id?C.orange:C.sub,fontWeight:active===id?700:400,transition:"color 0.2s"}}>{label}</span></button>)}</div>;}

// ─── Logger ───────────────────────────────────────────────────────────────────

function Logger({state,userId,onSave,onCancel}){
  const teamId=state.users[userId]?.teamId;
  const customST=state.teams[teamId]?.customShotTypes||[];
  const lastW=state.workouts.filter(w=>w.userId===userId).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const[shots,setShots]=useState([{type:SHOT_TYPES[0],location:SHOT_LOCATIONS[0],made:"",attempted:"",cond:""}]);
  const[dribble,setDribble]=useState("");
  const[note,setNote]=useState("");
  const[busy,setBusy]=useState(false);
  const addShot=()=>setShots(s=>[...s,{type:SHOT_TYPES[0],location:SHOT_LOCATIONS[0],made:"",attempted:"",cond:""}]);
  const rm=i=>setShots(s=>s.filter((_,idx)=>idx!==i));
  const upd=(i,k,v)=>setShots(s=>s.map((sh,idx)=>{if(idx!==i)return sh;const u={...sh,[k]:v};if(k==="type"){const ct=customST.find(t=>t.name===v);if(ct&&!sh.cond)u.cond=ct.cond;}return u;}));
  const quickLog=()=>{if(!lastW)return;setShots(lastW.shots.map(s=>({...s,made:"",attempted:""})));setNote("(Repeated from last session)");};
  const save=async()=>{setBusy(true);const valid=shots.filter(s=>s.made!==""||s.attempted!=="");await onSave({shots:valid.map(s=>({...s,made:parseInt(s.made)||0,attempted:parseInt(s.attempted)||0})),dribble:parseInt(dribble)||0,note});setBusy(false);};
  return(
    <div style={{background:C.dark,minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif",color:C.text}}>
      <Btwn style={{padding:"16px 20px 12px",background:C.dark,borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:19,fontWeight:800}}>Log Workout</div>
        <button onClick={onCancel} style={{background:"transparent",border:"none",color:C.sub,fontSize:22,cursor:"pointer",lineHeight:1,fontFamily:"inherit"}}>✕</button>
      </Btwn>
      <div style={scroll}>
        {lastW&&<Btn outline onClick={quickLog} style={{marginBottom:12}}>⚡ Quick Log — repeat last session types</Btn>}
        <Card>
          <Btwn style={{marginBottom:12}}><div style={{fontWeight:700}}>Shot Tracking</div><Btn sm full={false} onClick={addShot}>+ Shot</Btn></Btwn>
          {shots.map((sh,i)=>(
            <div key={i} style={{background:C.muted,borderRadius:12,padding:12,marginBottom:10}}>
              <Btwn style={{marginBottom:8}}><span style={{fontSize:12,fontWeight:600,color:C.orange}}>Shot {i+1}</span>{shots.length>1&&<button onClick={()=>rm(i)} style={{background:"transparent",border:"none",color:C.sub,cursor:"pointer",fontSize:16,padding:0,lineHeight:1}}>✕</button>}</Btwn>
              <Sel label="Shot type" value={sh.type} onChange={e=>upd(i,"type",e.target.value)}>
                <optgroup label="Standard">{SHOT_TYPES.map(t=><option key={t}>{t}</option>)}</optgroup>
                {customST.length>0&&<optgroup label="— Team Custom —">{customST.map(t=><option key={t.id}>{t.name}</option>)}</optgroup>}
              </Sel>
              <Sel label="Location" value={sh.location} onChange={e=>upd(i,"location",e.target.value)}>{SHOT_LOCATIONS.map(l=><option key={l}>{l}</option>)}</Sel>
              <Inp label="Condition" placeholder="e.g. off screen, contested" value={sh.cond} onChange={e=>upd(i,"cond",e.target.value)}/>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><Inp label="Made" type="number" min="0" placeholder="0" value={sh.made} onChange={e=>upd(i,"made",e.target.value)}/></div>
                <div style={{flex:1}}><Inp label="Attempted" type="number" min="0" placeholder="0" value={sh.attempted} onChange={e=>upd(i,"attempted",e.target.value)}/></div>
              </div>
            </div>
          ))}
        </Card>
        <Card><div style={{fontWeight:700,marginBottom:12}}>Dribbling</div><Inp label="Minutes spent dribbling" type="number" min="0" placeholder="0" value={dribble} onChange={e=>setDribble(e.target.value)}/></Card>
        <Card><div style={{fontSize:12,color:C.sub,marginBottom:4}}>Session note (optional)</div><textarea style={{background:C.muted,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"11px 14px",color:C.text,fontSize:14,width:"100%",boxSizing:"border-box",fontFamily:"inherit",height:72,resize:"none",outline:"none"}} placeholder="How'd it go?" value={note} onChange={e=>setNote(e.target.value)}/></Card>
        <Btn color={C.green} onClick={save} disabled={busy}>{busy?"Saving…":"Save Workout ✓"}</Btn>
      </div>
    </div>
  );
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

function WCard({w,state,me,onReact,onComment}){
  const user=state.users[w.userId];
  const made=w.shots.reduce((s,sh)=>s+sh.made,0);
  const att=w.shots.reduce((s,sh)=>s+sh.attempted,0);
  const[showC,setShowC]=useState(false);
  const[ct,setCt]=useState("");
  const send=()=>{if(!ct.trim())return;onComment(w.id,ct.trim());setCt("");};
  return(
    <Card>
      <Row style={{marginBottom:10}}>
        <Av name={user?.name} size={42}/>
        <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{user?.name}</div><div style={{fontSize:12,color:C.sub}}>{w.date}</div></div>
        <div style={{display:"flex",gap:4}}>{(state.badges[w.userId]||[]).slice(0,2).map(b=><span key={b} title={BADGES_META[b]?.label} style={{fontSize:16}}>{BADGES_META[b]?.icon}</span>)}</div>
      </Row>
      {w.note?<div style={{fontSize:13,color:"#7C3AED",fontStyle:"italic",marginBottom:10,padding:"8px 12px",background:"#F5F3FF",borderRadius:10,border:"1px solid #DDD6FE"}}>"{w.note}"</div>:null}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {made>0&&<Pill text={`🎯 ${made}/${att} shots`}/>}
        {w.dribble>0&&<Pill text={`⏱ ${w.dribble}m dribbling`} color={C.navyMid}/>}
        {w.shots.map((s,i)=><Pill key={i} text={s.type} color={C.sub}/>)}
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
        {REACTIONS.map(emoji=>{const list=w.reactions[emoji]||[];const mine=list.includes(me);const own=w.userId===me;return <button key={emoji} onClick={()=>!own&&onReact(w.id,emoji)} style={{background:mine?C.orange+"33":C.muted,border:`1.5px solid ${mine?C.orange:"transparent"}`,borderRadius:99,padding:"4px 10px",cursor:own?"default":"pointer",fontSize:14,display:"flex",gap:4,alignItems:"center",opacity:own?0.45:1}}>{emoji}{list.length>0&&<span style={{fontSize:11,color:C.sub}}>{list.length}</span>}</button>;})}
      </div>
      {w.comments.length>0&&<button onClick={()=>setShowC(!showC)} style={{background:"transparent",border:"none",color:C.sub,fontSize:12,cursor:"pointer",padding:0,marginBottom:8,fontFamily:"inherit"}}>💬 {w.comments.length} comment{w.comments.length!==1?"s":""}</button>}
      {showC&&w.comments.map((c,i)=><div key={i} style={{background:C.muted,borderRadius:10,padding:"8px 12px",marginBottom:6}}><div style={{fontSize:12,fontWeight:600,color:C.orange}}>{state.users[c.uid]?.name}</div><div style={{fontSize:13,marginTop:2}}>{c.text}</div></div>)}
      <Row style={{marginTop:8}}>
        <input style={{flex:1,background:C.muted,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",color:C.text,fontSize:13,fontFamily:"inherit",outline:"none"}} placeholder="Add a comment…" value={ct} onChange={e=>setCt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}/>
        <Btn sm full={false} onClick={send}>Send</Btn>
      </Row>
    </Card>
  );
}

function Feed({state,me,onReact,onComment}){
  const teamId=state.users[me]?.teamId;
  const team=state.teams[teamId];
  const ws=state.workouts.filter(w=>w.teamId===teamId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);
  return(
    <div style={scroll}>
      {team?.announcements?.filter(a=>a.pinned).map(ann=>(
        <Card key={ann.id} style={{borderLeft:`4px solid ${C.orange}`,borderRadius:"4px 16px 16px 4px"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.orange,marginBottom:4}}>📌 PINNED FROM COACH</div>
          <div style={{fontSize:14}}>{ann.text}</div>
        </Card>
      ))}
      {ws.length===0&&<div style={{textAlign:"center",color:C.sub,marginTop:60,fontSize:14}}>No workouts yet — be the first! 🏀</div>}
      {ws.map(w=><WCard key={w.id} w={w} state={state} me={me} onReact={onReact} onComment={onComment}/>)}
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

function Leaderboard({state,me}){
  const teamId=state.users[me]?.teamId;
  const players=Object.values(state.users).filter(u=>u.teamId===teamId&&u.role==="player");
  const[cat,setCat]=useState("total");
  const CATS=[{id:"total",label:"Total Shots",icon:"🎯"},{id:"ft",label:"Free Throws",icon:"🏀"},{id:"3pt",label:"3-Pointers",icon:"🔥"},{id:"dribble",label:"Dribble Min",icon:"⏱"},{id:"streak",label:"Streak",icon:"⚡"}];
  const val=uid=>{switch(cat){case"total":return getTotalShots(state.workouts,uid);case"ft":return getShotsByType(state.workouts,uid,"Free Throw");case"3pt":return getShotsByType(state.workouts,uid,"3-Pointer");case"dribble":return getTotalDribble(state.workouts,uid);case"streak":return state.users[uid]?.streak||0;}};
  const unit=cat==="dribble"?"min":cat==="streak"?"days":"made";
  const ranked=[...players].sort((a,b)=>val(b.id)-val(a.id));
  const medals=["🥇","🥈","🥉"];
  return(
    <div style={scroll}>
      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:10,marginBottom:12}}>
        {CATS.map(c=><button key={c.id} onClick={()=>setCat(c.id)} style={{background:cat===c.id?C.orange:C.card,color:cat===c.id?"#fff":C.sub,border:`1.5px solid ${cat===c.id?C.orange:C.border}`,borderRadius:10,padding:"8px 12px",fontWeight:600,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",flexShrink:0,transition:"all 0.2s"}}>{c.icon} {c.label}</button>)}
      </div>
      {ranked.map((p,idx)=>{const v=val(p.id);const maxV=val(ranked[0]?.id)||1;const isMe=p.id===me;return(
        <Card key={p.id} style={{border:isMe?`2px solid ${C.orange}`:`1.5px solid ${C.border}`}}>
          <Row>
            <div style={{fontSize:20,width:30,textAlign:"center",flexShrink:0}}>{idx<3?medals[idx]:`#${idx+1}`}</div>
            <Av name={p.name} size={38}/>
            <div style={{flex:1,minWidth:0}}>
              <Btwn style={{marginBottom:5}}><Row style={{gap:6}}><span style={{fontWeight:700,fontSize:14}}>{p.name}</span>{isMe&&<Pill text="You"/>}</Row><Row style={{gap:4}}><span style={{fontWeight:800,fontSize:17,color:idx===0?"#FBBF24":C.text}}>{v}</span><span style={{fontSize:11,color:C.sub}}>{unit}</span></Row></Btwn>
              <Bar val={v} max={maxV} color={isMe?C.orange:C.navyMid}/>
            </div>
          </Row>
        </Card>
      );})}
    </div>
  );
}

// ─── Player Home ──────────────────────────────────────────────────────────────

function PlayerHome({state,me,onLog}){
  const user=state.users[me];
  const team=state.teams[user?.teamId];
  const badges=state.badges[me]||[];
  const todayW=state.workouts.find(w=>w.userId===me&&w.date===tod());
  const allGoals=[...(team?.goals||[]),...(state.playerGoals?.[me]||[])];
  return(
    <div style={scroll}>
      <Card>
        <Row>
          <Av name={user?.name} size={50}/>
          <div style={{flex:1}}><div style={{fontWeight:800,fontSize:17}}>Hey, {user?.name?.split(" ")[0]}! 👋</div><div style={{fontSize:13,color:C.sub}}>{team?.name}</div></div>
          <div style={{textAlign:"center"}}><div style={{fontSize:22}}>🔥</div><div style={{fontWeight:800,color:C.orange,fontSize:17}}>{user?.streak||0}</div><div style={{fontSize:10,color:C.sub}}>day streak</div></div>
        </Row>
      </Card>
      {team?.announcements?.filter(a=>a.pinned).map(ann=>(
        <Card key={ann.id} style={{borderLeft:`4px solid ${C.orange}`,borderRadius:"4px 16px 16px 4px"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.orange,marginBottom:4}}>📌 COACH SAYS</div>
          <div style={{fontSize:14}}>{ann.text}</div>
        </Card>
      ))}
      {!todayW
        ?<button onClick={onLog} style={{background:C.orange,border:"none",borderRadius:13,padding:"15px 20px",fontWeight:800,fontSize:16,color:"#fff",width:"100%",cursor:"pointer",marginBottom:12,fontFamily:"inherit"}}>🏋️ Log Today's Workout</button>
        :<Card style={{border:`1.5px solid ${C.green}`}}><div style={{color:C.green,fontWeight:700}}>✅ Logged today!</div><div style={{fontSize:13,color:C.sub,marginTop:4}}>{todayW.shots.reduce((s,sh)=>s+sh.made,0)} shots · {todayW.dribble}min dribbling{todayW.note?` · "${todayW.note}"`:""}</div></Card>
      }
      <div style={{display:"flex",gap:10,marginBottom:0}}>
        {[["Total Shots",getTotalShots(state.workouts,me),"🎯"],["Dribble Min",getTotalDribble(state.workouts,me),"⏱"],["Streak",`${user?.streak||0}d`,"🔥"]].map(([l,v,i])=>(
          <Card key={l} style={{flex:1,minWidth:0,textAlign:"center",marginBottom:0}}>
            <div style={{fontSize:20,marginBottom:4}}>{i}</div>
            <div style={{fontSize:22,fontWeight:800,color:C.orange}}>{v}</div>
            <div style={{fontSize:11,color:C.sub}}>{l}</div>
          </Card>
        ))}
      </div>
      {allGoals.length>0&&(
        <Card style={{marginTop:12}}>
          <SecTitle>This Week's Goals</SecTitle>
          {allGoals.map(goal=>{const prog=goal.type==="dribbling"?getWeeklyDribble(state.workouts,me):getWeeklyShots(state.workouts,me,goal.shotType);const done=prog>=goal.target;return(
            <div key={goal.id} style={{marginBottom:12}}>
              <Btwn style={{marginBottom:5}}><span style={{fontSize:13}}>{goal.label}</span><Row style={{gap:4}}>{done&&<span>✅</span>}<span style={{fontWeight:700,fontSize:13,color:done?C.green:C.orange}}>{prog}/{goal.target}</span></Row></Btwn>
              <Bar val={prog} max={goal.target} color={done?C.green:C.orange}/>
            </div>
          );})}
        </Card>
      )}
      {badges.length>0&&<Card><SecTitle>Your Badges</SecTitle><div style={{display:"flex",gap:16,flexWrap:"wrap"}}>{badges.map(b=><div key={b} style={{textAlign:"center"}}><div style={{fontSize:28}}>{BADGES_META[b]?.icon}</div><div style={{fontSize:10,color:C.sub,marginTop:2}}>{BADGES_META[b]?.label}</div></div>)}</div></Card>}
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function Profile({state,me,onLogout}){
  const user=state.users[me];
  const team=state.teams[user?.teamId];
  const ws=state.workouts.filter(w=>w.userId===me).sort((a,b)=>b.date.localeCompare(a.date));
  const badges=state.badges[me]||[];
  const total=getTotalShots(state.workouts,me);
  const dTotal=getTotalDribble(state.workouts,me);
  const breakdown=SHOT_TYPES.map(t=>({type:t,made:getShotsByType(state.workouts,me,t)})).filter(s=>s.made>0).sort((a,b)=>b.made-a.made);
  const bMax=breakdown[0]?.made||1;
  return(
    <div style={scroll}>
      <Card style={{textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:12}}><Av name={user?.name} size={64}/></div>
        <div style={{fontWeight:800,fontSize:20}}>{user?.name}</div>
        <div style={{color:C.sub,fontSize:13,marginTop:2}}>{team?.name}</div>
        <div style={{display:"flex",justifyContent:"center",gap:28,marginTop:18}}>
          {[["Shots",total],["Sessions",ws.length],["Streak",`${user?.streak||0}🔥`],["Dribble",`${dTotal}m`]].map(([l,v])=>(
            <div key={l} style={{textAlign:"center"}}><div style={{fontWeight:800,fontSize:18,color:C.orange}}>{v}</div><div style={{fontSize:11,color:C.sub,marginTop:1}}>{l}</div></div>
          ))}
        </div>
      </Card>
      <Card>
        <SecTitle>Badges</SecTitle>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:badges.length>0?16:0}}>{badges.map(b=><div key={b} style={{textAlign:"center"}}><div style={{fontSize:28}}>{BADGES_META[b]?.icon}</div><div style={{fontSize:10,color:C.sub,marginTop:2}}>{BADGES_META[b]?.label}</div></div>)}</div>
        {Object.entries(BADGES_META).filter(([id])=>!badges.includes(id)).length>0&&<div style={{borderTop:`1px solid ${C.border}`,paddingTop:12}}><div style={{fontSize:12,color:C.sub,marginBottom:8}}>Still locked:</div>{Object.entries(BADGES_META).filter(([id])=>!badges.includes(id)).map(([id,b])=><Row key={id} style={{marginBottom:6,opacity:0.4}}><span style={{fontSize:18}}>{b.icon}</span><span style={{fontSize:12}}>{b.label} — {b.desc}</span></Row>)}</div>}
      </Card>
      {breakdown.length>0&&<Card><SecTitle>Shot Breakdown</SecTitle>{breakdown.map(s=><div key={s.type} style={{marginBottom:10}}><Btwn style={{marginBottom:4}}><span style={{fontSize:13}}>{s.type}</span><span style={{fontWeight:700,fontSize:13}}>{s.made}</span></Btwn><Bar val={s.made} max={bMax}/></div>)}</Card>}
      <Card>
        <SecTitle>Recent Sessions</SecTitle>
        {ws.length===0&&<div style={{color:C.sub,fontSize:13}}>No sessions yet — get to work! 🏀</div>}
        {ws.slice(0,8).map(w=><Btwn key={w.id} style={{paddingBottom:10,marginBottom:10,borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13,color:C.sub}}>{w.date}</span><Row style={{gap:14}}><span style={{fontSize:13}}>🎯 {w.shots.reduce((s,sh)=>s+sh.made,0)}</span><span style={{fontSize:13}}>⏱ {w.dribble}m</span></Row></Btwn>)}
      </Card>
      <Btn outline color={C.red} onClick={onLogout}>Sign Out</Btn>
      <div style={{height:20}}/>
    </div>
  );
}

// ─── Coach: Overview ──────────────────────────────────────────────────────────

function CoachOverview({state,me,onPostAnn,onUnpin}){
  const teamId=state.users[me]?.teamId;
  const team=state.teams[teamId];
  const players=Object.values(state.users).filter(u=>u.teamId===teamId&&u.role==="player");
  const todayN=state.workouts.filter(w=>w.teamId===teamId&&w.date===tod()).length;
  const activeN=players.filter(p=>daysSince(p.lastLog)<=3).length;
  const[annText,setAnnText]=useState("");
  const[showCode,setShowCode]=useState(false);
  const[busy,setBusy]=useState(false);
  const post=async()=>{if(!annText.trim())return;setBusy(true);await onPostAnn(annText.trim());setAnnText("");setBusy(false);};
  return(
    <div style={scroll}>
      <div style={{display:"flex",gap:10,marginBottom:0}}>
        {[["Players",players.length,"👥"],["Active (3d)",activeN,"🟢"],["Today",todayN,"📊"]].map(([l,v,i])=>(
          <Card key={l} style={{flex:1,minWidth:0,textAlign:"center",marginBottom:0}}>
            <div style={{fontSize:20,marginBottom:4}}>{i}</div>
            <div style={{fontSize:22,fontWeight:800,color:C.orange}}>{v}</div>
            <div style={{fontSize:11,color:C.sub}}>{l}</div>
          </Card>
        ))}
      </div>
      <Card style={{marginTop:12}}>
        <Btwn style={{marginBottom:showCode?12:0}}>
          <div><div style={{fontWeight:700}}>Share with Players</div>{!showCode&&<div style={{fontSize:12,color:C.sub,marginTop:2}}>Tap to reveal join code</div>}</div>
          <Btn sm full={false} outline onClick={()=>setShowCode(!showCode)}>{showCode?"Hide":"Show Code"}</Btn>
        </Btwn>
        {showCode&&<div style={{textAlign:"center",background:C.muted,borderRadius:12,padding:"16px 20px"}}><div style={{fontSize:13,color:C.sub,marginBottom:8}}>Players tap "Join Team" and enter:</div><div style={{fontSize:38,fontWeight:900,color:C.orange,letterSpacing:8,fontFamily:"monospace"}}>{team?.code}</div><div style={{fontSize:12,color:C.sub,marginTop:10,lineHeight:1.6}}>Sign up → "Join Team" → enter this code</div></div>}
      </Card>
      <Card>
        <div style={{fontWeight:700,marginBottom:12}}>📌 Pin Announcement</div>
        <textarea style={{background:C.muted,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"11px 14px",color:C.text,fontSize:14,width:"100%",boxSizing:"border-box",fontFamily:"inherit",height:72,resize:"none",outline:"none",marginBottom:10}} placeholder="Message your team…" value={annText} onChange={e=>setAnnText(e.target.value)}/>
        <Btn onClick={post} disabled={busy}>{busy?"Posting…":"Post & Pin to Feed"}</Btn>
      </Card>
      {(team?.announcements||[]).filter(a=>a.pinned).length>0&&(
        <Card>
          <SecTitle>Live Announcements</SecTitle>
          {team.announcements.filter(a=>a.pinned).map(ann=>(
            <Btwn key={ann.id} style={{background:C.muted,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
              <div style={{fontSize:13,flex:1}}>{ann.text}</div>
              <button onClick={()=>onUnpin(ann.id)} style={{background:"transparent",border:"none",color:C.sub,cursor:"pointer",fontSize:12,fontFamily:"inherit",marginLeft:10,flexShrink:0}}>Unpin</button>
            </Btwn>
          ))}
        </Card>
      )}
      <Card>
        <SecTitle>Inactive Players (3+ days)</SecTitle>
        {players.filter(p=>daysSince(p.lastLog)>3).length===0
          ?<div style={{color:C.green,fontSize:13}}>✅ All players active in the last 3 days!</div>
          :players.filter(p=>daysSince(p.lastLog)>3).map(p=>(
            <Row key={p.id} style={{marginBottom:10}}>
              <Av name={p.name} size={36}/>
              <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{p.name}</div><div style={{fontSize:12,color:C.sub}}>Last seen: {p.lastLog?`${daysSince(p.lastLog)}d ago`:"never"}</div></div>
              <Pill text="⚠ Inactive" color={C.red}/>
            </Row>
          ))
        }
      </Card>
    </div>
  );
}

// ─── Coach: Players ───────────────────────────────────────────────────────────

function CoachPlayers({state,me}){
  const teamId=state.users[me]?.teamId;
  const players=Object.values(state.users).filter(u=>u.teamId===teamId&&u.role==="player").sort((a,b)=>(b.streak||0)-(a.streak||0));
  return(
    <div style={scroll}>
      {players.map(p=>{const since=daysSince(p.lastLog);const inactive=since>3;const pb=state.badges[p.id]||[];return(
        <Card key={p.id} style={{border:inactive?`1.5px solid ${C.red}60`:`1.5px solid ${C.border}`}}>
          <Row style={{marginBottom:10}}>
            <Av name={p.name} size={44}/>
            <div style={{flex:1,minWidth:0}}>
              <Btwn><div style={{fontWeight:700,fontSize:15}}>{p.name}</div>{inactive?<Pill text="⚠ Inactive" color={C.red}/>:<Pill text="✓ Active" color={C.green}/>}</Btwn>
              <div style={{fontSize:12,color:C.sub,marginTop:3}}>🔥 {p.streak||0}d streak · Last: {p.lastLog?`${since}d ago`:"never"}</div>
            </div>
          </Row>
          <div style={{display:"flex",gap:16,marginBottom:pb.length>0?10:0}}><span style={{fontSize:13}}>🎯 {getTotalShots(state.workouts,p.id)} shots</span><span style={{fontSize:13}}>⏱ {getTotalDribble(state.workouts,p.id)}min</span><span style={{fontSize:13}}>📋 {state.workouts.filter(w=>w.userId===p.id).length} sessions</span></div>
          {pb.length>0&&<Row style={{gap:8}}>{pb.map(b=><span key={b} title={BADGES_META[b]?.label} style={{fontSize:18}}>{BADGES_META[b]?.icon}</span>)}</Row>}
        </Card>
      );})}
      {players.length===0&&<div style={{textAlign:"center",color:C.sub,marginTop:40,fontSize:14}}>No players yet. Share your join code!</div>}
    </div>
  );
}

// ─── Coach: Goals ─────────────────────────────────────────────────────────────

function CoachGoals({state,me,onAddGoal,onDelGoal,onAddCST,onDelCST,onEditCST}){
  const teamId=state.users[me]?.teamId;
  const team=state.teams[teamId];
  const players=Object.values(state.users).filter(u=>u.teamId===teamId&&u.role==="player");
  const customST=team?.customShotTypes||[];
  const[showGoal,setShowGoal]=useState(false);
  const[f,setF]=useState({type:"shots",shotType:SHOT_TYPES[0],target:"",label:"",period:"weekly",assignTo:"team"});
  const sf=(k,v)=>setF(x=>({...x,[k]:v}));
  const[showCST,setShowCST]=useState(false);
  const[cstForm,setCstForm]=useState({name:"",cond:""});
  const[editId,setEditId]=useState(null);
  const[editForm,setEditForm]=useState({name:"",cond:""});
  const addGoal=async()=>{if(!f.target||!f.label)return;await onAddGoal({...f,target:parseInt(f.target)});setShowGoal(false);setF({type:"shots",shotType:SHOT_TYPES[0],target:"",label:"",period:"weekly",assignTo:"team"});};
  const addCST=async()=>{if(!cstForm.name.trim())return;await onAddCST(cstForm);setCstForm({name:"",cond:""});setShowCST(false);};
  const saveEdit=async()=>{if(!editForm.name.trim())return;await onEditCST(editId,editForm);setEditId(null);};
  return(
    <div style={scroll}>
      <Btwn style={{marginBottom:10}}><SecTitle>Custom Shot Types</SecTitle><Btn sm full={false} onClick={()=>{setShowCST(!showCST);setEditId(null);}}>+ New Type</Btn></Btwn>
      {showCST&&(
        <Card style={{background:"#F8FAFC"}}>
          <div style={{fontWeight:700,marginBottom:12,fontSize:14}}>New Custom Shot Type</div>
          <Inp label="Shot type name" placeholder='e.g. "Euro Step Layup"' value={cstForm.name} onChange={e=>setCstForm(f=>({...f,name:e.target.value}))}/>
          <Inp label="Default condition" placeholder='e.g. "off two dribbles, contact at rim"' value={cstForm.cond} onChange={e=>setCstForm(f=>({...f,cond:e.target.value}))}/>
          <div style={{display:"flex",gap:8}}><Btn color={C.green} onClick={addCST}>Save</Btn><Btn outline color={C.sub} onClick={()=>setShowCST(false)}>Cancel</Btn></div>
        </Card>
      )}
      {customST.length===0&&!showCST&&<div style={{color:C.sub,fontSize:13,marginBottom:16,padding:"12px 14px",background:C.muted,borderRadius:12}}>No custom shot types yet. Add drills like "Euro Step" or "Step-Back 3" for players to track.</div>}
      {customST.map(t=>(
        <Card key={t.id} style={{marginBottom:8}}>
          {editId===t.id
            ?<><div style={{fontSize:12,fontWeight:700,color:C.navy,marginBottom:10}}>Editing shot type</div><Inp label="Name" value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}/><Inp label="Default condition" placeholder="Optional" value={editForm.cond} onChange={e=>setEditForm(f=>({...f,cond:e.target.value}))}/><div style={{display:"flex",gap:8}}><Btn color={C.green} onClick={saveEdit}>Save</Btn><Btn outline color={C.sub} onClick={()=>setEditId(null)}>Cancel</Btn></div></>
            :<Btwn><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:14}}>{t.name}</div>{t.cond?<div style={{fontSize:12,color:C.sub,marginTop:3}}>Condition: <em>{t.cond}</em></div>:<div style={{fontSize:12,color:C.sub,marginTop:3,fontStyle:"italic"}}>No default condition</div>}</div><div style={{display:"flex",gap:6,flexShrink:0,marginLeft:10}}><button onClick={()=>{setEditId(t.id);setEditForm({name:t.name,cond:t.cond||""});}} style={{background:C.navy+"18",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:14}}>✏️</button><button onClick={()=>onDelCST(t.id)} style={{background:C.red+"18",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:14}}>🗑</button></div></Btwn>
          }
        </Card>
      ))}
      <div style={{height:1,background:C.border,marginBottom:16,marginTop:4}}/>
      <Btwn style={{marginBottom:10}}><SecTitle>Goals</SecTitle><Btn sm full={false} onClick={()=>setShowGoal(!showGoal)}>+ Add Goal</Btn></Btwn>
      {showGoal&&(
        <Card style={{background:"#F8FAFC"}}>
          <Sel label="Assign to" value={f.assignTo} onChange={e=>sf("assignTo",e.target.value)}><option value="team">Whole Team</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Sel>
          <Sel label="Goal type" value={f.type} onChange={e=>sf("type",e.target.value)}><option value="shots">Shots</option><option value="dribbling">Dribbling</option></Sel>
          {f.type==="shots"&&<Sel label="Shot type" value={f.shotType} onChange={e=>sf("shotType",e.target.value)}><optgroup label="Standard">{SHOT_TYPES.map(t=><option key={t}>{t}</option>)}</optgroup>{customST.length>0&&<optgroup label="— Team Custom —">{customST.map(t=><option key={t.id}>{t.name}</option>)}</optgroup>}</Sel>}
          <Inp label="Goal label" placeholder='e.g. "Free Throws This Week"' value={f.label} onChange={e=>sf("label",e.target.value)}/>
          <Inp label={`Target (${f.type==="dribbling"?"minutes":"shots made"})`} type="number" placeholder="e.g. 200" value={f.target} onChange={e=>sf("target",e.target.value)}/>
          <Sel label="Period" value={f.period} onChange={e=>sf("period",e.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="season">Off-Season</option></Sel>
          <Btn color={C.green} onClick={addGoal}>Save Goal</Btn>
        </Card>
      )}
      <SecTitle>Team Goals</SecTitle>
      {(team?.goals||[]).length===0&&<div style={{color:C.sub,fontSize:13,marginBottom:12}}>No team goals yet.</div>}
      {(team?.goals||[]).map(g=>(
        <Card key={g.id}><Btwn><div><div style={{fontWeight:700}}>{g.label}</div><div style={{fontSize:12,color:C.sub,marginTop:2}}>{g.period} · target: {g.target} {g.type==="dribbling"?"min":"shots"}{g.type==="shots"&&g.shotType?` · ${g.shotType}`:""}</div></div><button onClick={()=>onDelGoal(g.id)} style={{background:"transparent",border:"none",color:C.sub,cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>🗑</button></Btwn></Card>
      ))}
      {players.map(p=>{const pg=state.playerGoals?.[p.id]||[];if(!pg.length)return null;return(
        <div key={p.id}>
          <SecTitle>{p.name}'s Individual Goals</SecTitle>
          {pg.map(g=><Card key={g.id}><Btwn><div><div style={{fontWeight:700}}>{g.label}</div><div style={{fontSize:12,color:C.sub,marginTop:2}}>{g.period} · {g.target} {g.type==="dribbling"?"min":"shots"}</div></div><button onClick={()=>onDelGoal(g.id)} style={{background:"transparent",border:"none",color:C.sub,cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>🗑</button></Btwn></Card>)}
        </div>
      );})}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const[session,setSession]=useState(undefined);
  const[appData,setAppData]=useState(null);
  const[tab,setTab]=useState("home");
  const[logging,setLogging]=useState(false);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>setSession(session));
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>setSession(session));
    return()=>subscription.unsubscribe();
  },[]);

 useEffect(()=>{
    if(session===undefined)return;
    if(!session){setAppData(null);return;}
    const tryLoad=async(retries=8)=>{
      const{data}=await supabase.from("users").select("*").eq("id",session.user.id).single();
      if(!data){
        if(retries>0){await new Promise(r=>setTimeout(r,1000));return tryLoad(retries-1);}
        await supabase.auth.signOut();
        return;
      }
      loadData(session.user.id);
    };
    tryLoad();
  },[session]);

const loadData=async(userId, retries=5)=>{
    const{data:rawProfile}=await supabase.from("users").select("*").eq("id",userId).single();
    if(!rawProfile){
      if(retries>0){await new Promise(r=>setTimeout(r,800));return loadData(userId,retries-1);}
      return;
    }
    const profile=xUser(rawProfile);
    const{data:rawTeam}=await supabase.from("teams").select("*").eq("id",profile.teamId).single();
    const{data:rawAnns}=await supabase.from("announcements").select("*").eq("team_id",profile.teamId).order("created_at",{ascending:false});
    const{data:rawMembers}=await supabase.from("users").select("*").eq("team_id",profile.teamId);
    const members=(rawMembers||[]).map(xUser);
    const{data:rawWorkouts}=await supabase.from("workouts").select("*, shots(*), reactions(*), comments(*)").eq("team_id",profile.teamId).order("date",{ascending:false}).order("created_at",{ascending:false});
    const workouts=(rawWorkouts||[]).map(xWorkout);
    const{data:rawGoals}=await supabase.from("goals").select("*").eq("team_id",profile.teamId);
    const goals=(rawGoals||[]).map(xGoal);
    const{data:rawCST}=await supabase.from("custom_shot_types").select("*").eq("team_id",profile.teamId).order("created_at");
    const memberIds=(rawMembers||[]).map(m=>m.id);
    const{data:rawBadges}=memberIds.length>0?await supabase.from("badges").select("*").in("user_id",memberIds):{data:[]};
    const badgesMap=groupBadges(rawBadges||[]);
    const allUsers={};
    for(const m of members)allUsers[m.id]=m;
    const teamGoals=goals.filter(g=>!g.playerId);
    const playerGoals={};
    for(const g of goals.filter(g=>g.playerId)){if(!playerGoals[g.playerId])playerGoals[g.playerId]=[];playerGoals[g.playerId].push(g);}
    const team={...(rawTeam||{}),goals:teamGoals,announcements:rawAnns||[],customShotTypes:rawCST||[]};
    setAppData({profile,state:{users:allUsers,teams:{[team.id]:team},workouts,playerGoals,badges:badgesMap}});
  };

  const refresh=()=>session&&loadData(session.user.id);

  const handleSaveWorkout=async({shots,dribble,note})=>{
    const{profile,state}=appData;
    const{data:workout}=await supabase.from("workouts").insert({user_id:profile.id,team_id:profile.teamId,date:tod(),dribble,note}).select().single();
    if(shots.length>0)await supabase.from("shots").insert(shots.map(s=>({workout_id:workout.id,type:s.type,location:s.location,cond:s.cond,made:s.made,attempted:s.attempted})));
    const yest=new Date();yest.setDate(yest.getDate()-1);const yStr=yest.toISOString().slice(0,10);
    const newStreak=(profile.lastLog===yStr||profile.lastLog===tod())?(profile.streak||0)+1:1;
    await supabase.from("users").update({streak:newStreak,last_log:tod()}).eq("id",profile.id);
    const allW=[...state.workouts,{userId:profile.id,shots,dribble}];
    const tSh=getTotalShots(allW,profile.id);const tDr=getTotalDribble(allW,profile.id);
    const toAward=["first_log"];
    if(newStreak>=3)toAward.push("streak_3");if(newStreak>=7)toAward.push("streak_7");
    if(tSh>=100)toAward.push("shots_100");if(tSh>=500)toAward.push("shots_500");
    if(tDr>=60)toAward.push("dribble_60");
    for(const bId of toAward)await supabase.from("badges").insert({user_id:profile.id,badge_id:bId}).then(()=>{});
    await refresh();setLogging(false);setTab("home");
  };

  const handleReact=async(workoutId,emoji)=>{
    const{profile,state}=appData;
    const w=state.workouts.find(w=>w.id===workoutId);
    const already=(w?.reactions[emoji]||[]).includes(profile.id);
    if(already)await supabase.from("reactions").delete().eq("workout_id",workoutId).eq("user_id",profile.id).eq("emoji",emoji);
    else await supabase.from("reactions").insert({workout_id:workoutId,user_id:profile.id,emoji});
    await refresh();
  };

  const handleComment=async(workoutId,text)=>{
    await supabase.from("comments").insert({workout_id:workoutId,user_id:appData.profile.id,text,date:tod()});
    await refresh();
  };

  const handlePostAnn=async(text)=>{
    await supabase.from("announcements").insert({team_id:appData.profile.teamId,text,pinned:true,date:tod()});
    await refresh();
  };

  const handleUnpin=async(id)=>{
    await supabase.from("announcements").update({pinned:false}).eq("id",id);
    await refresh();
  };

  const handleAddGoal=async(f)=>{
    await supabase.from("goals").insert({team_id:appData.profile.teamId,player_id:f.assignTo==="team"?null:f.assignTo,type:f.type,shot_type:f.shotType,target:f.target,period:f.period,label:f.label});
    await refresh();
  };

  const handleDelGoal=async(id)=>{await supabase.from("goals").delete().eq("id",id);await refresh();};
  const handleAddCST=async({name,cond})=>{await supabase.from("custom_shot_types").insert({team_id:appData.profile.teamId,name:name.trim(),cond:cond.trim()});await refresh();};
  const handleDelCST=async(id)=>{await supabase.from("custom_shot_types").delete().eq("id",id);await refresh();};
  const handleEditCST=async(id,{name,cond})=>{await supabase.from("custom_shot_types").update({name:name.trim(),cond:cond.trim()}).eq("id",id);await refresh();};
  const handleLogout=async()=>{await supabase.auth.signOut();setAppData(null);setTab("home");};

  if(session===undefined||(session&&!appData))return <Spinner/>;
  if(!session)return <Auth/>;

  const{profile,state}=appData;
  const isCoach=profile.role==="coach";
  const me=profile.id;
  const team=state.teams[profile.teamId];

  if(logging){
    return(
      <div style={{background:C.dark,minHeight:"100vh",maxWidth:430,margin:"0 auto",fontFamily:"system-ui,-apple-system,sans-serif",color:C.text}}>
        <Logger state={state} userId={me} onSave={handleSaveWorkout} onCancel={()=>setLogging(false)}/>
      </div>
    );
  }

  const PLAYER_TABS=[{id:"home",label:"Home",icon:"🏠"},{id:"leaderboard",label:"Ranks",icon:"🏆"},{id:"feed",label:"Feed",icon:"💬"},{id:"profile",label:"Me",icon:"👤"}];
  const COACH_TABS=[{id:"home",label:"Overview",icon:"📊"},{id:"players",label:"Players",icon:"👥"},{id:"goals",label:"Goals",icon:"🎯"},{id:"feed",label:"Feed",icon:"💬"},{id:"leaderboard",label:"Ranks",icon:"🏆"}];
  const tabs=isCoach?COACH_TABS:PLAYER_TABS;
  const titles={home:isCoach?"Dashboard":team?.name||"Home",players:"Roster",goals:"Goals",feed:"Team Feed",leaderboard:"Leaderboard",profile:"My Profile"};

  return(
    <div style={{background:C.dark,minHeight:"100vh",maxWidth:430,margin:"0 auto",fontFamily:"system-ui,-apple-system,sans-serif",color:C.text,position:"relative"}}>
      <Header title={titles[tab]} sub={isCoach?`${team?.name} · Join code: ${team?.code}`:undefined}/>
      {!isCoach&&tab==="home"        &&<PlayerHome    state={state} me={me} onLog={()=>setLogging(true)}/>}
      {!isCoach&&tab==="leaderboard" &&<Leaderboard   state={state} me={me}/>}
      {!isCoach&&tab==="feed"        &&<Feed          state={state} me={me} onReact={handleReact} onComment={handleComment}/>}
      {!isCoach&&tab==="profile"     &&<Profile       state={state} me={me} onLogout={handleLogout}/>}
      {isCoach&&tab==="home"         &&<CoachOverview state={state} me={me} onPostAnn={handlePostAnn} onUnpin={handleUnpin}/>}
      {isCoach&&tab==="players"      &&<CoachPlayers  state={state} me={me}/>}
      {isCoach&&tab==="goals"        &&<CoachGoals    state={state} me={me} onAddGoal={handleAddGoal} onDelGoal={handleDelGoal} onAddCST={handleAddCST} onDelCST={handleDelCST} onEditCST={handleEditCST}/>}
      {isCoach&&tab==="feed"         &&<Feed          state={state} me={me} onReact={handleReact} onComment={handleComment}/>}
      {isCoach&&tab==="leaderboard"  &&<Leaderboard   state={state} me={me}/>}
      <Nav tabs={tabs} active={tab} onChange={setTab}/>
      {!isCoach&&<button onClick={()=>setLogging(true)} style={{position:"fixed",bottom:74,right:"max(20px,calc(50vw - 195px))",width:54,height:54,borderRadius:"50%",background:C.orange,border:"none",fontSize:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99,color:"#fff",fontWeight:700}}>+</button>}
    </div>
  );
}
