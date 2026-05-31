import { useEffect, useState } from "react";
import {
  MeshNameInput,
  QRExchange,
  makeScanPayload,
  type MeshConfig,
  type YRoom,
  type Edge,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };
const NAME_KEY = (p: string) => `${p}:displayName`;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === "&") return "&amp;";
    if (c === "'") return "&apos;";
    if (c === '"') return "&quot;";
    return c;
  });
}

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="viral-screen">
        <h1>network builder</h1>
        <p className="viral-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [, rerender] = useState(0);

  useEffect(() => {
    if (name) localStorage.setItem(NAME_KEY(config.storagePrefix), name);
  }, [name, config.storagePrefix]);

  useEffect(() => {
    const edges = room.doc.getArray<Edge>("edges");
    const names = room.doc.getMap<string>("names");
    const cb = () => rerender((n) => n + 1);
    edges.observe(cb);
    names.observe(cb);
    return () => {
      edges.unobserve(cb);
      names.unobserve(cb);
    };
  }, [room]);

  const edges = room.doc.getArray<Edge>("edges");
  const names = room.doc.getMap<string>("names");

  useEffect(() => {
    if (name.trim()) names.set(room.peerId, name.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, room.peerId]);

  const edgeList = edges.toArray();

  const addOneWay = (to: string, otherName?: string) => {
    const t = name.trim();
    if (!t || to === room.peerId) return;
    if (edgeList.some((e) => e.from === room.peerId && e.to === to)) return;
    room.doc.transact(() => {
      names.set(room.peerId, t);
      if (otherName) names.set(to, otherName);
      edges.push([{ from: room.peerId, to, ts: Date.now() }]);
    });
  };

  const myPayload = makeScanPayload(room.roomId, room.peerId, name.trim() || "anon");

  const isMutual = (a: string, b: string) =>
    edgeList.some((e) => e.from === a && e.to === b) &&
    edgeList.some((e) => e.from === b && e.to === a);

  const myOutgoing = edgeList.filter((e) => e.from === room.peerId);
  const myIncoming = edgeList.filter((e) => e.to === room.peerId);
  const myMutual = myOutgoing.filter((e) => isMutual(room.peerId, e.to));

  const downloadBlob = (data: string, filename: string, mime: string) => {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const peers: Array<{ id: string; name: string }> = [];
    names.forEach((n, id) => peers.push({ id, name: n }));
    const data = { peers, edges: edgeList };
    downloadBlob(JSON.stringify(data, null, 2), "network.json", "application/json");
  };

  const graphmlText = (() => {
    const peers: Array<[string, string]> = [];
    names.forEach((n, id) => peers.push([id, n]));
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n  <graph id="mesh" edgedefault="directed">\n` +
      peers
        .map(
          ([id, n]) =>
            `    <node id="${escapeXml(id)}"><data key="name">${escapeXml(n)}</data></node>`,
        )
        .join("\n") +
      "\n" +
      edgeList
        .map((e) => `    <edge source="${escapeXml(e.from)}" target="${escapeXml(e.to)}"/>`)
        .join("\n") +
      `\n  </graph>\n</graphml>\n`
    );
  })();

  const exportGraphML = () => {
    downloadBlob(graphmlText, "network.graphml", "application/xml");
  };

  return (
    <div className="viral-screen">
      <header>
        <h1>network builder</h1>
        <p className="viral-status">
          {names.size} people · {edgeList.length} requests · you: {myMutual.length} mutual
        </p>
      </header>

      <MeshNameInput
        className="viral-name"
        value={name}
        onChange={setName}
        placeholder="your name"
        maxLength={48}
      />

      <QRExchange
        myPayload={myPayload}
        showLabel="your QR — show to send a friend request"
        scanLabel="scan to send a request"
        onScan={(parsed) => addOneWay(parsed.peerId, parsed.extra ?? undefined)}
      />

      <section>
        <h2 className="viral-section-title">mutual friends ({myMutual.length})</h2>
        {myMutual.length === 0 ? (
          <p className="viral-empty">scan and be scanned to make it mutual</p>
        ) : (
          <ul className="viral-tags">
            {myMutual.map((e) => (
              <li key={e.to}>
                <strong>{names.get(e.to) ?? e.to.slice(0, 6)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="viral-section-title">requests received (not yet returned)</h2>
        {myIncoming.filter((e) => !isMutual(e.from, room.peerId)).length === 0 ? (
          <p className="viral-empty">none — scan their QR to make it mutual</p>
        ) : (
          <ul className="viral-tags">
            {myIncoming
              .filter((e) => !isMutual(e.from, room.peerId))
              .map((e) => (
                <li key={e.from}>{names.get(e.from) ?? e.from.slice(0, 6)}</li>
              ))}
          </ul>
        )}
      </section>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" className="viral-ghost" onClick={exportJSON}>
          export JSON
        </button>
        <button type="button" className="viral-ghost" onClick={exportGraphML}>
          export GraphML
        </button>
      </div>

      <details className="nb-graphml-preview">
        <summary>preview GraphML export</summary>
        <pre className="nb-graphml-text">{graphmlText}</pre>
      </details>
    </div>
  );
}
