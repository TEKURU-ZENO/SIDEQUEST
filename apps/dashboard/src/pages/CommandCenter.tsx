import { useEffect, useState } from "react";
type Role = "scout" | "healer" | "strategist" | "saboteur";
type QuestDraft = {
  title: string;
  premise: string;
  objectives: string[];
  difficulty: "easy" | "moderate" | "hard";
  rewardXp: number;
  narrativeHook: string;
  enemy?: string;
};

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
    premise:
      "An ancient vault has stirred beneath the old city. Gather its scattered ember seals before the Ash Warden wakes.",
    objectives: [
      "Gather ember seals",
      "Hold the eastern passage",
      "Defeat the Ash Warden",
    ],
    difficulty: "moderate" as const,
    rewardXp: 240,
    narrativeHook: "The guild's old choices echo through the vault.",
  },
  {
    title: "The Glasswood Oath",
    enemy: "Hollow Stag",
    premise:
      "The forest remembers your mercy. Follow its silver roots and protect the Mosskeeper from a voice calling beneath the lake.",
    objectives: [
      "Follow silver roots",
      "Protect the Mosskeeper",
      "Silence the lake voice",
    ],
    difficulty: "moderate" as const,
    rewardXp: 240,
    narrativeHook: "The forest remembers the guild's mercy.",
  },
  {
    title: "Storm at Starfall",
    enemy: "Tempest Engine",
    premise:
      "A signal burns on the horizon. Chart a safe route through the storm before the stranded crew runs out of time.",
    objectives: [
      "Find the signal",
      "Chart a safe route",
      "Reach the stranded crew",
    ],
    difficulty: "hard" as const,
    rewardXp: 240,
    narrativeHook: "A signal calls the guild toward a storm-lit horizon.",
  },
];
type FeedItem = { name: string; text: string; role: Role | "system" };
const API_BASE = (() => {
  const configured = new URLSearchParams(window.location.search).get("api");
  if (!configured) {
    return ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
      window.location.port === "5173"
      ? "http://localhost:4000"
      : window.location.origin;
  }
  try {
    const url = new URL(configured);
    if (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
      return url.origin;
  } catch {
    /* Fall back to local development API for invalid settings. */
  }
  return "http://localhost:4000";
})();

export function CommandCenter() {
  const [role, setRole] = useState<Role>("scout");
  const [quest, setQuest] = useState(0);
  const [activeQuest, setActiveQuest] = useState<QuestDraft | null>(null);
  const [proposal, setProposal] = useState<QuestDraft | null>(null);
  const [proposalSource, setProposalSource] = useState("");
  const [generating, setGenerating] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [vitality, setVitality] = useState(68);
  const [partyVitality, setPartyVitality] = useState(100);
  const [party, setParty] = useState(0);
  const [actions, setActions] = useState(0);
  const [progress, setProgress] = useState(0);
  const [worldMemory, setWorldMemory] = useState(
    "Loading persistent world history…",
  );
  const [worldMemoryMeta, setWorldMemoryMeta] = useState("WORLD HISTORY");
  const [worldChapterLabel, setWorldChapterLabel] = useState(
    "No completed chapter yet",
  );
  const [worldStats, setWorldStats] = useState({
    guildName: "SIDEQUEST Local Guild",
    reputation: 0,
    chapters: 0,
    victories: 0,
  });
  const [input, setInput] = useState("");
  const [toast, setToast] = useState("");
  const [feed, setFeed] = useState<FeedItem[]>([
    {
      name: "SIDEQUEST",
      text: "World history will appear here when an adventure is completed.",
      role: "system",
    },
  ]);
  const [showPlan, setShowPlan] = useState(false);
  async function refreshWorldMemory() {
    try {
      const [snapshotResponse, historyResponse] = await Promise.all([
        fetch(`${API_BASE}/api/world/snapshot`),
        fetch(`${API_BASE}/api/world/history`),
      ]);
      if (!snapshotResponse.ok || !historyResponse.ok)
        throw new Error("World history is unavailable");
      const snapshot = await snapshotResponse.json();
      const history = (await historyResponse.json()) as {
        events: Array<Record<string, unknown>>;
      };
      const chapters = history.events.filter(
        (event) => event.type === "world.chapter.recorded",
      );
      const completed = snapshot.adventures.filter(
        (adventure: { status: string }) => adventure.status === "completed",
      );
      setWorldStats({
        guildName: snapshot.guild.name,
        reputation: snapshot.guild.reputation,
        chapters: completed.length,
        victories: completed.filter(
          (adventure: { outcome: string | null }) =>
            adventure.outcome === "won",
        ).length,
      });
      const latest = chapters.at(-1) as
        | {
            chapter?: {
              title?: string;
              outcome?: string;
              consequence?: string;
            };
          }
        | undefined;
      setWorldMemory(
        latest?.chapter
          ? `${latest.chapter.outcome === "won" ? "Victory" : "Defeat"}: ${latest.chapter.consequence ?? latest.chapter.title ?? "Chapter recorded."}`
          : `${snapshot.guild.name}: ${Object.keys(snapshot.members).length} members and ${snapshot.adventures.length} recorded adventures.`,
      );
      setWorldMemoryMeta(`${history.events.length} PERSISTED EVENTS`);
      setWorldChapterLabel(
        latest?.chapter?.title ?? "No completed chapter yet",
      );
    } catch {
      setWorldMemory(
        "Persistent world history is unavailable. Check the API connection.",
      );
      setWorldMemoryMeta("WORLD OFFLINE");
    }
  }
  const notify = (s: string) => {
    setToast(s);
    window.setTimeout(() => setToast(""), 2300);
  };
  const push = (item: FeedItem) => setFeed((old) => [item, ...old].slice(0, 7));
  useEffect(() => {
    void fetch(`${API_BASE}/api/game/snapshot`)
      .then((response) => response.json())
      .then((snapshot) => {
        const state = snapshot.state;
        setLaunched(state.status === "active");
        setVitality(state.encounterVitality);
        setPartyVitality(state.partyVitality);
        setParty(Object.keys(state.players ?? {}).length);
        setActions(state.actions);
        setProgress(state.objectiveProgress);
        if (state.questContent)
          setActiveQuest(state.questContent as QuestDraft);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    void refreshWorldMemory();
  }, []);
  const q = activeQuest ?? quests[quest]!;
  async function dispatch(command: unknown, success: string) {
    try {
      const response = await fetch(`${API_BASE}/api/game/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "Action rejected");
      const state = body.data.state;
      setVitality(state.encounterVitality);
      setPartyVitality(state.partyVitality);
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
  async function launch(questToLaunch = q) {
    const questSlug = questToLaunch.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const questId = `${questSlug || "quest"}-${window.crypto.randomUUID()}`;
    const ok = await dispatch(
      {
        type: "quest.launch",
        questId,
        questContent: questToLaunch,
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
  async function generateProposal() {
    setGenerating(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/intelligence/quest-proposal`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "Could not generate a proposal");
      setProposal(body.data as QuestDraft);
      setProposalSource(body.source ?? "unknown");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Quest proposal unavailable",
      );
    } finally {
      setGenerating(false);
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
        notify(
          "Try !join, !attack, !heal, !scout, !vote assault or !vote retreat, or !sabotage",
        );
        return;
      }
      const response = await fetch(`${API_BASE}/api/game/snapshot`);
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
      const response = await fetch(`${API_BASE}/api/game/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "encounter.resolve" }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "Resolve failed");
      const won = body.data.state.status === "won";
      setVitality(body.data.state.encounterVitality);
      setPartyVitality(body.data.state.partyVitality);
      setProgress(body.data.state.objectiveProgress);
      void refreshWorldMemory();
      setLaunched(false);
      push({
        name: "WORLD CHRONICLER",
        text: won
          ? "Victory recorded. The guild's new chapter is in persistent world history."
          : "The guild retreats. Its consequence is in persistent world history.",
        role: "system",
      });
      notify(
        won
          ? "Victory — chapter saved to the guild history"
          : "Retreat — regroup and return stronger",
      );
      setQuest((quest + 1) % quests.length);
      setActiveQuest(null);
      setProposal(null);
    } catch (e) {
      notify(
        e instanceof Error
          ? e.message
          : "API unavailable — start all workspaces with pnpm dev",
      );
    }
  }
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
          href={
            ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
            window.location.port === "5173"
              ? "http://localhost:5174"
              : "/overlay/"
          }
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
            <button className="primary-btn" onClick={() => void launch()}>
              ✦ {launched ? "Quest live" : "Launch quest"}
            </button>
          </section>
          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-head">
                GUILD REPUTATION <span className="tiny-icon violet">✳</span>
              </div>
              <div className="stat-value">{worldStats.reputation}</div>
              <div className="stat-foot">
                <span className="accent">●</span> {worldStats.guildName}
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-head">
                CHAPTERS RECORDED <span className="tiny-icon gold">⚑</span>
              </div>
              <div className="stat-value">{worldStats.chapters}</div>
              <div className="stat-foot">
                <span className="muted">Persisted adventure outcomes</span>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-head">
                VIEWERS IN THE PARTY <span className="tiny-icon blue">♙</span>
              </div>
              <div className="stat-value">{String(party).padStart(2, "0")}</div>
              <div className="stat-foot">
                <span className="live-dot" />{" "}
                <span className="muted">Active in this quest</span>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-head">
                VICTORIES <span className="tiny-icon orange">♨</span>
              </div>
              <div className="stat-value">
                {worldStats.victories}
                <span className="stat-unit"> wins</span>
              </div>
              <div className="stat-foot">
                <span className="muted">From world history</span>
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
                    <span className="chapter">
                      CHAPTER {worldStats.chapters + 1}
                    </span>
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
                  <span className="difficulty">
                    ◆ {q.difficulty.toUpperCase()}
                  </span>
                  <span>{q.title.toUpperCase()}</span>
                </div>
              </div>
              <div className="quest-description">{q.premise}</div>
              {proposal ? (
                <div className="proposal-card">
                  <div className="section-kicker">
                    CREATOR REVIEW ·{" "}
                    {proposalSource === "openai"
                      ? "AI PROPOSAL"
                      : "AUTHORED FALLBACK"}
                  </div>
                  <h3>{proposal.title}</h3>
                  <p>{proposal.premise}</p>
                  <small>
                    Suggested {proposal.difficulty} · {proposal.rewardXp} XP
                    suggestion
                  </small>
                  <div className="proposal-actions">
                    <button
                      className="primary-btn"
                      disabled={launched}
                      onClick={() => {
                        setActiveQuest(proposal);
                        setProposal(null);
                        void launch(proposal);
                      }}
                    >
                      Approve &amp; launch
                    </button>
                    <button
                      className="text-btn"
                      onClick={() => setProposal(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="text-btn"
                  disabled={generating || launched}
                  onClick={generateProposal}
                >
                  {generating
                    ? "Creating proposal…"
                    : "✦ Generate quest proposal"}
                </button>
              )}
              <div className="objective-head">
                <span>OBJECTIVES</span>
                <span>
                  {progress} OF {q.objectives.length} COMPLETE
                </span>
              </div>
              <div className="objectives">
                {q.objectives.map((o, i) => (
                  <div
                    className={`objective ${i < progress ? "done" : ""}`}
                    key={o}
                  >
                    <span className="check">{i < progress ? "✓" : ""}</span>
                    <span className="objective-name">{o}</span>
                    <small>
                      {i < progress
                        ? "COMPLETE"
                        : i === q.objectives.length - 1
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
                    <small>WORLD HISTORY</small>
                    <b>Outcome and consequence saved as a chapter</b>
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
                  <h3>
                    {q.enemy ??
                      q.objectives.at(-1)?.replace(/^Defeat the /i, "") ??
                      "Encounter"}
                  </h3>
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
              <div className="hp-row party-vitality-row">
                <span>PARTY VITALITY</span>
                <b>{partyVitality}%</b>
              </div>
              <div className="hp-track party-vitality-track">
                <div
                  className="party-vitality-fill"
                  style={{ width: `${partyVitality}%` }}
                />
              </div>
              <div className="boss-note">
                “Little sparks… you dare enter my halls?”{" "}
                <span>
                  —{" "}
                  {q.enemy ??
                    q.objectives.at(-1)?.replace(/^Defeat the /i, "") ??
                    "Encounter"}
                </span>
              </div>
            </article>
            <article className="panel director-panel">
              <div className="director-head">
                <span className="sparkle">✦</span>
                <div>
                  <div className="section-kicker">WORLD CHRONICLER</div>
                  <h3>History informs the next chapter</h3>
                </div>
                <span className="memory-tag">{worldMemoryMeta}</span>
              </div>
              <p>{worldMemory}</p>
              <div className="memory-chips">
                <span>◈ {worldChapterLabel}</span>
                <span>
                  ↗ Verified game history:{" "}
                  <a
                    href={`${API_BASE}/api/game/verify`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    inspect
                  </a>
                </span>
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
