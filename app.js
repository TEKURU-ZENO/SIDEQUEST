const $ = (id) => document.getElementById(id);
const initial = {level:4, quests:12, party:8, streak:3, hp:68, actions:0, round:1, launched:false, completed:0, objectiveDone:1, joined:8, roleCounts:{Scout:2,Healer:2,Strategist:2,Saboteur:2}, selectedRole:'Scout', history:['Mosskeeper spared'], lastOutcome:'won'};
let state = {...initial, roleCounts:{...initial.roleCounts}};
const roleMeta = [
  {name:'Scout',icon:'⌁',cls:'scout',ability:'Reveal',cmd:'!scout'},
  {name:'Healer',icon:'✚',cls:'healer',ability:'Restore',cmd:'!heal'},
  {name:'Strategist',icon:'⌘',cls:'strategist',ability:'Guide',cmd:'!vote'},
  {name:'Saboteur',icon:'ϟ',cls:'saboteur',ability:'Weaken',cmd:'!sabotage'}
];
const quests = [
  {title:'The Ember Vault',place:'THE SUNKEN ARCHIVE',desc:'An ancient vault has stirred beneath the old city. Gather its scattered ember seals before the Ash Warden wakes.',enemy:'Ash Warden',boss:'“Little sparks… you dare enter my halls?”',objectives:[['Gather ember seals','2 / 3'],['Hold the eastern passage','In progress'],['Defeat the Ash Warden','Locked']],reward:'+240 Guild XP · Ember relic'},
  {title:'The Glasswood Oath',place:'THE GLASSWOOD',desc:'The forest remembers your mercy. Follow its silver roots and protect the Mosskeeper from a voice calling beneath the lake.',enemy:'Hollow Stag',boss:'“Your kindness has made you careless.”',objectives:[['Find the silver root','1 / 2'],['Protect the Mosskeeper','In progress'],['Silence the lake voice','Locked']],reward:'+300 Guild XP · Moonseed charm'},
  {title:'Storm at Starfall',place:'THE STARFALL COAST',desc:'A signal burns on the horizon. Chart a safe route through the storm before the stranded crew runs out of time.',enemy:'Tempest Engine',boss:'“Route detected. Resistance is inefficient.”',objectives:[['Map a safe route','In progress'],['Rescue the stranded crew','Locked'],['Disable the engine','Locked']],reward:'+280 Guild XP · Navigator badge'}
];
let questIndex=0, toastTimer;
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500)}
function renderRoles(){
  $('roles').innerHTML=roleMeta.map(r=>`<button class="role-card role-${r.cls} ${state.selectedRole===r.name?'selected':''}" data-role="${r.name}" title="${r.ability} · ${r.cmd}"><span class="role-icon">${r.icon}</span><b>${r.name}</b><small>${state.roleCounts[r.name]} joined</small></button>`).join('');
  document.querySelectorAll('.role-card').forEach(btn=>btn.onclick=()=>{state.selectedRole=btn.dataset.role;renderRoles();toast(`${state.selectedRole} selected — use !join to enter the party`)})
}
function renderObjectives(){const q=quests[questIndex];$('objectives').innerHTML=q.objectives.map((o,i)=>{const done=i<state.objectiveDone;return `<div class="objective ${done?'done':''}"><span class="check">${done?'✓':''}</span><span class="objective-name">${o[0]}</span><small>${done?'COMPLETE':o[1]}</small></div>`}).join('');$('objectiveCount').textContent=`${state.objectiveDone} OF 3 COMPLETE`}
function render(){
  const q=quests[questIndex]; $('level').textContent=String(state.level).padStart(2,'0');$('questCount').textContent=state.quests;$('partyCount').innerHTML=`${String(state.joined).padStart(2,'0')}<span class="stat-unit">/ 24</span>`;$('streak').textContent=String(state.streak).padStart(2,'0');
  $('questTitle').textContent=q.title;$('questDesc').textContent=q.desc;$('reward').textContent=q.reward;$('bossName').textContent=q.enemy;$('bossNote').innerHTML=`${q.boss} <span>— ${q.enemy}</span>`;$('hpText').textContent=`${state.hp}%`;$('hpFill').style.width=`${state.hp}%`;
  $('questStatus').textContent=state.launched?'QUEST IN PROGRESS':'ACTIVE QUEST';$('resolveBtn').textContent=state.launched?'Resolve encounter →':'Resolve round →';$('bossPhase').textContent=state.hp<30?'PHASE 2 · ENRAGED':'PHASE 1 · STIRRING';renderObjectives();renderRoles();renderAvatars();
  $('directorText').textContent=state.lastOutcome==='won'?`Your guild ${state.history[state.history.length-1]||'made its mark'} last quest. The world remembers—and answers in kind.`:`The guild's last expedition ended in retreat. The world has shifted while you regrouped.`;
}
function renderAvatars(){const colors=['#cf987e','#8ab5a2','#b2a0d7','#d8bd79','#82a9c8','#c889aa'];$('avatars').innerHTML=Array.from({length:Math.min(5,state.joined)},(_,i)=>`<span class="party-avatar" style="background:${colors[i%colors.length]}">${['J','K','L','R','T'][i]}</span>`).join('');$('joinedText').textContent=state.joined>5?`+ ${state.joined-3} adventurers exploring`:'Your party is assembling'}
function pushFeed(user,action,detail,role='Scout') {const r=roleMeta.find(x=>x.name===role)||roleMeta[0];const row=document.createElement('div');row.className='feed-row';row.innerHTML=`<span class="feed-avatar" style="background:#28382f;color:#a9e2bf">${r.icon}</span><span class="feed-text"><b>${escapeHtml(user)}</b> ${action} <em>${escapeHtml(detail)}</em><small>${role.toUpperCase()} · just now</small></span>`;$('feed').prepend(row);while($('feed').children.length>7)$('feed').lastElementChild.remove()}
function systemFeed(text){const row=document.createElement('div');row.className='feed-row';row.innerHTML=`<span class="feed-system">${text}</span>`;$('feed').prepend(row)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function joinParty(){if(state.joined>=24){toast('Party is full — max 24 adventurers');return}const chosen=state.selectedRole;state.joined++;state.roleCounts[chosen]++;render();pushFeed('you','joined as',chosen,chosen);toast(`Joined the party as ${chosen}`)}
function action(raw,user='you'){
  const input=raw.trim().toLowerCase().replace(/^!/, '');if(!input)return;
  if(input==='join'){joinParty();return}
  const [verb,...rest]=input.split(/\s+/);const role=state.selectedRole;
  if(['attack','hit','strike'].includes(verb)){state.actions++;state.hp=Math.max(0,state.hp-(5+(state.actions%3===0?3:0)));pushFeed(user,'struck the Warden for',`${5+(state.actions%3===0?3:0)} impact`,role);systemFeed(state.hp<30?'The Ash Warden enters an enraged phase!':'The Warden staggers. Keep the pressure on.');}
  else if(['heal','restore'].includes(verb)){state.actions++;state.hp=Math.min(100,state.hp+4);pushFeed(user,'restored the party:',`+4 vitality`,role)}
  else if(['scout','reveal'].includes(verb)){state.objectiveDone=Math.min(2,state.objectiveDone+1);pushFeed(user,'scouted ahead and revealed','a hidden ember seal',role);systemFeed('Objective progress updated: an ember seal is found.')}
  else if(['vote','choose'].includes(verb)){const choice=rest[0]||'1';pushFeed(user,'voted for path',choice,role);systemFeed(`The party's route vote is now ${choice}.`)}
  else if(['sabotage','weaken'].includes(verb)){state.actions++;state.hp=Math.max(0,state.hp-7);pushFeed(user,'weakened the Warden for','7 impact',role)}
  else if(verb==='help'){toast('Commands: !join · !attack · !heal · !scout · !vote 1 · !sabotage');return}
  else{toast('Unknown action. Try !help');return}
  render();if(state.hp===0)systemFeed('The Warden is vulnerable. Resolve the encounter to claim the outcome.')
}
function launch(){if(state.launched){toast('Quest is already live');return}state.launched=true;state.actions=0;state.hp=68;state.objectiveDone=1;systemFeed(`Quest launched: ${quests[questIndex].title}. Choose your role and jump in!`);render();toast('Quest is live — chat can join now')}
function resolve(){if(!state.launched){launch();return}const score=state.actions*2+state.joined+state.objectiveDone*4;const won=score>=20;state.launched=false;state.completed++;state.quests++;state.objectiveDone=won?3:2;state.lastOutcome=won?'won':'lost';state.streak=won?state.streak+1:0;state.level=4+Math.floor((state.quests-12)/4);state.history.push(won?'defeated the Ash Warden':'retreated from the Ash Warden');systemFeed(won?'VICTORY! Community actions tipped the encounter. +240 Guild XP.':'The party retreats together. The Warden will remember this.');toast(won?'Victory! The guild earned +240 XP.':'Retreat! Regroup and return stronger.');questIndex=(questIndex+1)%quests.length;state.hp=won?100:54;state.actions=0;render()}
function addDemo(){if(state.joined>=24){toast('Party is full');return}const roles=roleMeta.map(r=>r.name);const role=roles[(state.joined+1)%roles.length];state.joined++;state.roleCounts[role]++;render();pushFeed(['pixelpiper','starling_gg','fern_fable','mossmode'][state.joined%4],'joined as',role,role);toast(`A viewer joined as ${role}`)}
function reset(){state={...initial,roleCounts:{...initial.roleCounts}};questIndex=0;$('feed').innerHTML='';[['pixelpiper','joined as','Scout','Scout'],['fern_fable','healed the party:','+4 vitality','Healer'],['mossmode','voted for path','the old bridge','Strategist']].forEach(x=>pushFeed(x[0],x[1],x[2],x[3]));render();toast('Demo reset')}
const roadmap=[
 {title:'1 · Prove the five-second loop',tag:'DEMO · NOW',text:'One streamer, one encounter, one visible consequence. Measure time to first action, action-to-feedback time, and whether chat can explain its impact without coaching.'},
 {title:'2 · Connect one real Twitch channel',tag:'INTEGRATION',text:'Add broadcaster OAuth with chat read/send scopes, EventSub WebSocket lifecycle and reconnect handling. Keep tokens server-side; show connection health and a clear local fallback.'},
 {title:'3 · Make the rules legible and safe',tag:'GAME ENGINE',text:'Use a server-authoritative state machine, per-user cooldowns, capped contribution, role permissions, idempotent event handling and a readable action log. Persist session snapshots in SQLite.'},
 {title:'4 · Add AI as a bounded content service',tag:'AI LAYER',text:'Generate JSON quest packs against a schema, validate every objective and reward, and provide curated fallback quests. Use aggregate session summaries for adaptation; never let the model write game state.'},
 {title:'5 · Ship the OBS browser overlay',tag:'CREATOR TOOL',text:'A tokenized, read-only overlay URL with quest, objective progress, role counts and outcome animations. Design for 1920×1080 capture, high contrast and minimal screen obstruction.'},
 {title:'6 · Test repeat use before expanding',tag:'VALIDATION',text:'Pilot with 3–5 small streamers across two sessions each. Track join conversion, unique contributors, repeat actions, streamer setup time and second-session retention; only then generalize to other games.'}
];
function openPlan(){ $('roadmap').innerHTML=roadmap.map((s,i)=>`<div class="roadmap-step"><span class="step-num">0${i+1}</span><div><h4>${s.title}</h4><p>${s.text}</p></div><span class="step-tag">${s.tag}</span></div>`).join('');$('modal').classList.add('open')}
$('launchBtn').onclick=launch;$('resolveBtn').onclick=resolve;$('addViewer').onclick=addDemo;$('inviteBtn').onclick=()=>toast('Invite link copied: sidequest.local/join');$('overlayLink').onclick=()=>window.open('overlay.html','_blank','noopener');$('planLink').onclick=openPlan;$('planLaunch').onclick=()=>$('modal').classList.remove('open');$('modalClose').onclick=()=>$('modal').classList.remove('open');$('modal').onclick=e=>{if(e.target===$('modal'))$('modal').classList.remove('open')};$('resetBtn').onclick=reset;
$('chatForm').onsubmit=e=>{e.preventDefault();const input=$('chatInput');action(input.value);input.value='';input.focus()};$('chatInput').onkeydown=e=>{if(e.key==='Enter')e.preventDefault()};document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target!==$('chatInput')&&!$('modal').classList.contains('open'))launch();if(e.key==='Escape')$('modal').classList.remove('open')});$('questMenu').onclick=()=>toast('Quest settings will be available in the streamer dashboard.');$('overlayLink').title='Open a read-only OBS overlay preview';
reset();
