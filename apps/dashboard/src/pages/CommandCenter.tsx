import { useState } from "react";
type Role = "scout" | "healer" | "strategist" | "saboteur";

const roles: { name: Role; icon: string; className: string }[] = [
  { name: "scout", icon: "⌁", className: "scout" },
  { name: "healer", icon: "✚", className: "healer" },
  { name: "strategist", icon: "⌘", className: "strategist" },
  { name: "saboteur", icon: "ϟ", className: "saboteur" },
];
const quests = [
  {
    title: "The Ember Vault",
    enemy: "Ash Warden",
    desc: "An ancient vault has stirred beneath the old city. Gather its scattered ember seals before the Ash Warden wakes.",
  },
  {
    title: "The Glasswood Oath",
    enemy: "Hollow Stag",
    desc: "The forest remembers your mercy. Follow its silver roots and protect the Mosskeeper from a voice calling beneath the lake.",
  },
  {
    title: "Storm at Starfall",
    enemy: "Tempest Engine",
    desc: "A signal burns on the horizon. Chart a safe route through the storm before the stranded crew runs out of time.",
  },
];
type FeedItem = { name: string; text: string; role: Role | "system" };

export function CommandCenter() {
  const [role, setRole] = useState<Role>("scout");
  const [quest, setQuest] = useState(0);
  const [launched, setLaunched] = useState(false);
  const [vitality, setVitality] = useState(68);
  const [party, setParty] = useState(0);
  const [actions, setActions] = useState(0);
  const [progress, setProgress] = useState(1);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState("");
  const [feed, setFeed] = useState<FeedItem[]>([
    {
      name: "SIDEQUEST",
      text: "World memory loaded: the guild spared the Mosskeeper.",
      role: "system",
    },
  ]);
  const [showPlan, setShowPlan] = useState(false);
  const notify = (s: string) => {
    setToast(s);
    window.setTimeout(() => setToast(""), 2300);
  };
  const push = (item: FeedItem) => setFeed((old) => [item, ...old].slice(0, 7));
  async function dispatch(command: unknown, success: string) {
    try {
      const response = await fetch("http://localhost:4000/api/game/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "Action rejected");
      const state = body.data.state;
      setVitality(state.encounterVitality);
      setParty(Object.keys(state.players).length);
      setActions(state.actions);
      setProgress(state.objectiveProgress);
      notify(success);
      return true;
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "API unavailable — start all workspaces with pnpm dev",
      );
      return false;
    }
  }
  async function launch() {
    const ok = await dispatch(
      {
        type: "quest.launch",
        questId: quests[quest]!.title.toLowerCase().replaceAll(" ", "-"),
      },
      "Quest launched — chat can join now",
    );
    if (ok) {
      setLaunched(true);
      push({
        name: "WORLD CHRONICLER",
        text: "A new chapter opens. The guild's choices echo forward.",
        role: "system",
      });
    }
  }
  async function send(raw = input) {
    const [verb, ...args] = raw
      .trim()
      .replace(/^!/, "")
      .toLowerCase()
      .split(/\s+/);
    if (verb === "join") {
      const id = `viewer-${Date.now()}`;
      if (
        await dispatch(
          { type: "player.join", playerId: id, role },
          `Joined as ${role}`,
        )
      )
        push({ name: "you", text: `joined as ${role}`, role });
    } else {
      const action = (
        {
          attack: "attack",
          heal: "heal",
          scout: "scout",
          vote: "vote",
          sabotage: "sabotage",
        } as const
      )[verb as "attack" | "heal" | "scout" | "vote" | "sabotage"];
      if (!action) {
        notify("Try !join, !attack, !heal, !scout, !vote or !sabotage");
        return;
      }
      const response = await fetch("http://localhost:4000/api/game/snapshot");
      const snap = await response.json();
      const player = Object.values(
        snap.state.players as Record<string, { id: string; role: Role }>,
      ).find((p) => p.role === role);
      if (!player) {
        notify("Join the party first with !join");
        return;
      }
      if (
        await dispatch(
          {
            type: "encounter.act",
            playerId: player.id,
            action,
            ...(args[0] ? { target: args[0] } : {}),
          },
          `${verb} action applied`,
        )
      )
        push({
          name: "you",
          text: `used ${verb}${args[0] ? ` on ${args[0]}` : ""}`,
          role,
        });
    }
    setInput("");
  }
  async function addDemo() {
    const names = ["pixelpiper", "fern_fable", "mossmode", "starling_gg"];
    const id = `demo-${Date.now()}`;
    const demoRole = roles[(party + 1) % roles.length]!.name;
    if (
      await dispatch(
        { type: "player.join", playerId: id, role: demoRole },
        `${names[party % 4]} joined as ${demoRole}`,
      )
    )
      push({
        name: names[party % 4]!,
        text: `joined as ${demoRole}`,
        role: demoRole,
      });
  }
  async function resolve() {
    try {
      const response = await fetch("http://localhost:4000/api/game/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "encounter.resolve" }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "Resolve failed");
      const won = body.data.state.status === "won";
      setLaunched(false);
      push({
        name: "WORLD CHRONICLER",
        text: won
          ? "Victory. The guild wins +240 XP; the world remembers your triumph."
          : "The guild retreats. The world has shifted while you regroup.",
        role: "system",
      });
      notify(
        won
          ? "Victory! +240 Guild XP"
          : "Retreat — regroup and return stronger",
      );
      setQuest((quest + 1) % quests.length);
      setVitality(won ? 100 : 54);
    } catch (e) {
      notify(
        e instanceof Error
          ? e.message
          : "API unavailable — start all workspaces with pnpm dev",
      );
    }
  }
  const q = quests[quest]!;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-mark">✳</span>
          <span>
            SIDEQUEST<small>THE LIVING COMMUNITY WORLD</small>
          </span>
        </a>
        <div className="side-label">WORKSPACE</div>
        <button className="nav-item active">
          <span>◈</span> Command center
        </button>
        <a
          className="nav-item"
          href="http://localhost:5174"
          target="_blank"
          rel="noreferrer"
        >
          <span>▣</span> OBS overlay <i>↗</i>
        </a>
        <button className="nav-item" onClick={() => setShowPlan(true)}>
          <span>⌘</span> Build roadmap
        </button>
        <div className="side-bottom">
          <div className="streamer-card">
            <div className="avatar">M</div>
            <div>
              <b>moonlit_morgan</b>
              <small>Streamer workspace</small>
            </div>
            <span className="dots">•••</span>
          </div>
          <div className="local-note">
            <span className="pulse" /> LOCAL DEMO MODE
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="crumb">
            WORKSPACE <span>/</span> COMMAND CENTER
          </div>
          <div className="top-actions">
            <div className="connection">
              <span className="pulse" /> Local demo adapter
            </div>
            <div className="avatar small">M</div>
          </div>
        </header>
        <div className="content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="live-dot" /> EVERY STREAM CREATES A CHAPTER
              </div>
              <h1>Make chat part of the story.</h1>
              <p className="subhead">
                Every viewer leaves a mark on your living community world.
              </p>
            </div>
            <button className="primary-btn" onClick={launch}>
              ✦ {launched ? "Quest live" : "Launch quest"}
            </button>
          </section>
          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-head">
                COMMUNITY LEVEL <span className="tiny-icon violet">✳</span>
              </div>
              <div className="stat-value">04</div>
              <div className="stat-foot">
                <span className="accent">●</span> The Lantern Guild{" "}
                <span className="muted">· 2,460 XP</span>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-head">
                QUESTS COMPLETED <span className="tiny-icon gold">⚑</span>
              </div>
              <div className="stat-value">12</div>
              <div className="stat-foot">
                <span className="green">↗ 3</span>{" "}
                <span className="muted">this stream</span>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-head">
                VIEWERS IN THE PARTY <span className="tiny-icon blue">♙</span>
              </div>
              <div className="stat-value">
                {String(party).padStart(2, "0")}
                <span className="stat-unit">/ 24</span>
              </div>
              <div className="stat-foot">
                <span className="live-dot" />{" "}
                <span className="muted">Active in this quest</span>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-head">
                COMMUNITY STREAK <span className="tiny-icon orange">♨</span>
              </div>
              <div className="stat-value">
                03<span className="stat-unit"> wins</span>
              </div>
              <div className="stat-foot">
                <span className="muted">Best: 7 quests</span>
              </div>
            </article>
          </section>
          <section className="game-grid">
            <article className="quest-panel panel">
              <div className="panel-top">
                <div>
                  <div className="section-kicker">
                    <span className="live-dot" />
                    <span>
                      {launched ? "QUEST IN PROGRESS" : "ACTIVE QUEST"}
                    </span>
                    <span className="chapter">CHAPTER 04</span>
                  </div>
                  <h2>{q.title}</h2>
                </div>
                <button
                  className="more-btn"
                  onClick={() =>
                    notify(
                      "Quest settings are part of the streamer dashboard milestone",
                    )
                  }
                >
                  •••
                </button>
              </div>
              <div className="quest-art">
                <div className="art-stars">✦　·　✧　　 ·　　　 ✦</div>
                <div className="vault-glow" />
                <div className="mountain m1" />
                <div className="mountain m2" />
                <div className="vault-symbol">⌑</div>
                <div className="art-caption">
                  <span className="difficulty">◆ MODERATE</span>
                  <span>THE SUNKEN ARCHIVE</span>
                </div>
              </div>
              <div className="quest-description">{q.desc}</div>
              <div className="objective-head">
                <span>OBJECTIVES</span>
                <span>{progress} OF 3 COMPLETE</span>
              </div>
              <div className="objectives">
                {[
                  "Gather ember seals",
                  "Hold the eastern passage",
                  `Defeat the ${q.enemy}`,
                ].map((o, i) => (
                  <div
                    className={`objective ${i < progress ? "done" : ""}`}
                    key={o}
                  >
                    <span className="check">{i < progress ? "✓" : ""}</span>
                    <span className="objective-name">{o}</span>
                    <small>
                      {i < progress
                        ? "COMPLETE"
                        : i === 2
                          ? "LOCKED"
                          : "IN PROGRESS"}
                    </small>
                  </div>
                ))}
              </div>
              <div className="quest-footer">
                <div className="reward">
                  <span className="reward-icon">✧</span>
                  <span>
                    <small>COMMUNITY REWARD</small>
                    <b>
                      +240 Guild XP <i>·</i> Ember relic
                    </b>
                  </span>
                </div>
                <button className="resolve-btn" onClick={resolve}>
                  {launched ? "Resolve encounter →" : "Resolve round →"}
                </button>
              </div>
            </article>
            <div className="right-stack">
              <article className="panel party-panel">
                <div className="panel-heading">
                  <div>
                    <div className="section-kicker">THE ADVENTURERS</div>
                    <h3>Party roles</h3>
                  </div>
                  <button
                    className="text-btn"
                    onClick={() =>
                      notify(
                        "Invite links will be enabled with the viewer identity milestone",
                      )
                    }
                  >
                    Invite chat ↗
                  </button>
                </div>
                <div className="role-grid">
                  {roles.map((r) => (
                    <button
                      key={r.name}
                      className={`role-card role-${r.className} ${role === r.name ? "selected" : ""}`}
                      onClick={() => setRole(r.name)}
                    >
                      <span className="role-icon">{r.icon}</span>
                      <b>{r.name}</b>
                      <small>{r.name === role ? "selected" : "choose"}</small>
                    </button>
                  ))}
                </div>
                <div className="party-bottom">
                  <div className="avatars">
                    {["J", "K", "L", "R", "T"]
                      .slice(0, Math.min(5, party))
                      .map((x, i) => (
                        <span
                          key={x}
                          className="party-avatar"
                          style={{
                            background: [
                              "#cf987e",
                              "#8ab5a2",
                              "#b2a0d7",
                              "#d8bd79",
                              "#82a9c8",
                            ][i],
                          }}
                        >
                          {x}
                        </span>
                      ))}
                  </div>
                  <span>{party} adventurers in party</span>
                  <button className="add-btn" onClick={addDemo}>
                    +
                  </button>
                </div>
              </article>
              <article className="panel activity-panel">
                <div className="panel-heading">
                  <div>
                    <div className="section-kicker">HAPPENING NOW</div>
                    <h3>Chat activity</h3>
                  </div>
                  <span className="live-pill">
                    <span className="live-dot" /> LOCAL
                  </span>
                </div>
                <div className="feed">
                  {feed.map((item, i) => (
                    <div className="feed-row" key={`${item.name}-${i}`}>
                      <span className="feed-avatar">
                        {item.role === "system"
                          ? "✦"
                          : roles.find((r) => r.name === item.role)?.icon}
                      </span>
                      <span className="feed-text">
                        <b>{item.name}</b> {item.text}
                        <small>{item.role.toUpperCase()} · just now</small>
                      </span>
                    </div>
                  ))}
                </div>
                <form
                  className="chat-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <span className="chat-prefix">!</span>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Try join, attack, heal, scout…"
                  />
                  <button aria-label="Send action">↑</button>
                </form>
                <div className="command-hint">
                  Try <code>!join</code>, <code>!attack</code>,{" "}
                  <code>!heal</code>, <code>!scout</code>
                </div>
              </article>
            </div>
          </section>
          <section className="lower-grid">
            <article className="panel boss-panel">
              <div className="boss-label">
                <span className="boss-icon">♜</span>
                <div>
                  <div className="section-kicker">
                    ENCOUNTER PROGRESS · {actions} ACTIONS
                  </div>
                  <h3>{q.enemy}</h3>
                </div>
                <span className="boss-phase">
                  PHASE {vitality < 30 ? 2 : 1} ·{" "}
                  {vitality < 30 ? "ENRAGED" : "STIRRING"}
                </span>
              </div>
              <div className="hp-row">
                <span>ENCOUNTER VITALITY</span>
                <b>{vitality}%</b>
              </div>
              <div className="hp-track">
                <div className="hp-fill" style={{ width: `${vitality}%` }} />
              </div>
              <div className="boss-note">
                “Little sparks… you dare enter my halls?”{" "}
                <span>— {q.enemy}</span>
              </div>
            </article>
            <article className="panel director-panel">
              <div className="director-head">
                <span className="sparkle">✦</span>
                <div>
                  <div className="section-kicker">WORLD CHRONICLER</div>
                  <h3>History informs the next chapter</h3>
                </div>
                <span className="memory-tag">MEMORY ON</span>
              </div>
              <p>
                The guild's last recorded choice spared the Mosskeeper. That
                history informs the current quest; gameplay outcomes remain
                deterministic.
              </p>
              <div className="memory-chips">
                <span>◈ Mosskeeper spared</span>
                <span>↗ 3 win streak</span>
              </div>
            </article>
          </section>
          <footer className="page-footer">
            <span>✳ SIDEQUEST</span>
            <span>THE WORLD KEEPS HISTORY. THE GAME ENGINE KEEPS RULES.</span>
            <button onClick={() => window.location.reload()}>Reset demo</button>
          </footer>
        </div>
      </main>
      {toast && <div className="toast show">{toast}</div>}
      {showPlan && (
        <div className="modal-backdrop open" onClick={() => setShowPlan(false)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPlan(false)}>
              ×
            </button>
            <div className="section-kicker">PHASED PRODUCT ROADMAP</div>
            <h2>Build the living world in layers.</h2>
            <p className="modal-intro">
              Keep the first release narrow: prove a persistent guild loop with
              one creator before broadening game support.
            </p>
            <div className="roadmap">
              {[
                [
                  "01 · Foundation",
                  "Modular monolith, contracts, deterministic rules, preserved demo.",
                ],
                [
                  "02 · Living world",
                  "Guild identity, player progression, durable history and replay.",
                ],
                [
                  "03 · Twitch and realtime",
                  "OAuth, EventSub, chat moderation, recovery and read-only overlay.",
                ],
                [
                  "04 · Adaptive director",
                  "Schema-validated quest proposals, narration, contextual pacing and fallbacks.",
                ],
                [
                  "05 · Production learning",
                  "Creator pilots, reliability signals and second-session retention.",
                ],
              ].map(([t, d]) => (
                <div className="roadmap-step" key={t}>
                  <span className="step-num">✦</span>
                  <div>
                    <h4>{t}</h4>
                    <p>{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
