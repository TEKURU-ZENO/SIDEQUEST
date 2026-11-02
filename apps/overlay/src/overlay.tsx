import { useEffect, useState } from "react";
import { io } from "socket.io-client";

type Snapshot = {
  status: string;
  encounterVitality: number;
  objectiveProgress: number;
  players: Record<string, unknown>;
};
const fallback: Snapshot = {
  status: "active",
  encounterVitality: 68,
  objectiveProgress: 1,
  players: {},
};
export function Overlay() {
  const [state, setState] = useState(fallback);
  useEffect(() => {
    const socket = io("http://localhost:4000", {
      autoConnect: true,
      reconnection: true,
    });
    socket.on("game.snapshot", (event: { state: Snapshot }) =>
      setState(event.state),
    );
    return () => {
      socket.disconnect();
    };
  }, []);
  const party = Object.keys(state.players).length;
  return (
    <main className="overlay-wrap">
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
          <div className="chapter">CHAPTER 04 · THE SUNKEN ARCHIVE</div>
          <div className="title">The Ember Vault</div>
          <div className="desc">
            Gather the ember seals before the Ash Warden wakes.
          </div>
          <div className="progress-head">
            <span>WARDEN VITALITY</span>
            <span>{state.encounterVitality}%</span>
          </div>
          <div className="bar">
            <i style={{ width: `${state.encounterVitality}%` }} />
          </div>
          <div className="objectives">
            <div
              className={`objective ${state.objectiveProgress > 0 ? "done" : ""}`}
            >
              <span className="check">
                {state.objectiveProgress > 0 ? "✓" : ""}
              </span>
              <span>Gather ember seals</span>
            </div>
            <div
              className={`objective ${state.objectiveProgress > 1 ? "done" : ""}`}
            >
              <span className="check">
                {state.objectiveProgress > 1 ? "✓" : ""}
              </span>
              <span>Hold the eastern passage</span>
            </div>
            <div className="objective">
              <span className="check" />
              <span>Defeat the Ash Warden</span>
            </div>
          </div>
          <div className="party">
            <span>✧</span>
            <span>{party} adventurers in the party</span>
          </div>
          <div className="outcome">
            ✦ Chat, choose your role: <b>!join</b>
            <br />
            Attack the Warden with <b>!attack</b>
          </div>
          <div className="tip">
            THE WORLD KEEPS HISTORY. THE GAME ENGINE KEEPS RULES.
          </div>
        </div>
      </section>
    </main>
  );
}
