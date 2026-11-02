import { useEffect, useRef, useState, type CSSProperties } from "react";
import { io } from "socket.io-client";

type Snapshot = {
  status: string;
  questId: string;
  completedQuestIds: string[];
  questContent?: { title: string; premise: string; objectives: string[] };
  encounterVitality: number;
  partyVitality: number;
  objectiveProgress: number;
  players: Record<string, unknown>;
};
type SnapshotEnvelope = { sequence: number; state: Snapshot };
const fallback: Snapshot = {
  status: "ready",
  questId: "ember-vault",
  completedQuestIds: [],
  questContent: {
    title: "The Ember Vault",
    premise: "Gather the ember seals before the Ash Warden wakes.",
    objectives: [
      "Gather ember seals",
      "Hold the eastern passage",
      "Defeat the Ash Warden",
    ],
  },
  encounterVitality: 68,
  partyVitality: 100,
  objectiveProgress: 0,
  players: {},
};

function getApiBase(): string {
  const configured = new URLSearchParams(window.location.search).get("api");
  if (!configured)
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  try {
    const url = new URL(configured);
    if (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
      return url.origin;
  } catch {
    /* Invalid OBS query setting: show a local connection error. */
  }
  return "";
}

export function Overlay() {
  const params = new URLSearchParams(window.location.search);
  const apiBase = getApiBase();
  const compact = params.get("layout") === "compact";
  const rawAccent = params.get("accent");
  const accent =
    rawAccent && /^#[\da-fA-F]{6}$/.test(rawAccent) ? rawAccent : undefined;
  const [state, setState] = useState(fallback);
  const sequence = useRef(0);
  useEffect(() => {
    if (!apiBase) return;
    const socket = io(apiBase, { autoConnect: true, reconnection: true });
    const recoverSnapshot = async () => {
      try {
        const response = await fetch(`${apiBase}/api/game/snapshot`);
        if (!response.ok) return;
        const event = (await response.json()) as SnapshotEnvelope;
        if (event.sequence >= sequence.current) {
          sequence.current = event.sequence;
          setState(event.state);
        }
      } catch {
        // The reconnect handler will request a fresh snapshot when service returns.
      }
    };
    socket.on("game.snapshot", (event: SnapshotEnvelope) => {
      if (
        !Number.isSafeInteger(event.sequence) ||
        event.sequence <= sequence.current
      )
        return;
      if (sequence.current > 0 && event.sequence !== sequence.current + 1) {
        void recoverSnapshot();
        return;
      }
      sequence.current = event.sequence;
      setState(event.state);
    });
    socket.on("connect", () => void recoverSnapshot());
    void recoverSnapshot();
    return () => {
      socket.disconnect();
    };
  }, [apiBase]);

  const party = Object.keys(state.players).length;
  const objectives =
    state.questContent?.objectives ?? fallback.questContent!.objectives;
  const title =
    state.questContent?.title ??
    state.questId
      .replaceAll("-", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const enemy =
    objectives.at(-1)?.replace(/^Defeat the /i, "encounter") ?? "encounter";
  const chapterNumber =
    state.completedQuestIds.length +
    (state.status === "active" || state.status === "ready" ? 1 : 0);
  return (
    <main
      className={`overlay-wrap ${compact ? "compact" : ""}`}
      style={
        accent ? ({ "--overlay-accent": accent } as CSSProperties) : undefined
      }
    >
      <section className="widget">
        <div className="top" />
        <div className="inner">
          <div className="brand">
            <span>✳ SIDEQUEST</span>
            <span className="live">
              <i className="dot" />{" "}
              {state.status === "active"
                ? "QUEST LIVE"
                : state.status.toUpperCase()}
            </span>
          </div>
          <div className="chapter">
            CHAPTER {String(chapterNumber).padStart(2, "0")}
          </div>
          <div className="title">{title}</div>
          <div className="desc">
            {state.questContent?.premise ?? fallback.questContent!.premise}
          </div>
          <div className="progress-head">
            <span>ENCOUNTER VITALITY</span>
            <span>{state.encounterVitality}%</span>
          </div>
          <div className="bar">
            <i style={{ width: `${state.encounterVitality}%` }} />
          </div>
          <div className="progress-head party-progress-head">
            <span>PARTY VITALITY</span>
            <span>{state.partyVitality}%</span>
          </div>
          <div className="bar party-bar">
            <i style={{ width: `${state.partyVitality}%` }} />
          </div>
          <div className="objectives">
            {objectives.map((objective, index) => (
              <div
                className={`objective ${index < state.objectiveProgress ? "done" : ""}`}
                key={`${index}-${objective}`}
              >
                <span className="check">
                  {index < state.objectiveProgress ? "✓" : ""}
                </span>
                <span>{objective}</span>
              </div>
            ))}
          </div>
          <div className="party">
            <span>✧</span>
            <span>{party} adventurers in the party</span>
          </div>
          <div className="outcome">
            ✦ Chat, choose your role: <b>!join</b>
            <br />
            Attack the {enemy} with <b>!attack</b>
          </div>
          {!apiBase && (
            <div className="tip">
              Invalid API address. Use HTTPS or localhost.
            </div>
          )}
          <div className="tip">
            THE WORLD KEEPS HISTORY. THE GAME ENGINE KEEPS RULES.
          </div>
        </div>
      </section>
    </main>
  );
}
