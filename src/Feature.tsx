import { useEffect, useState, type FormEvent } from "react";
import {
  MeshButton,
  MeshNameInput,
  MeshStatusPill,
  MeshSurface,
  QRExchange,
  SelfRefBar,
  makeScanPayload,
  type Edge,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };
type ExchangeNotice = {
  tone: "success" | "warning";
  text: string;
};
const NAME_KEY = (prefix: string) => `${prefix}:displayName`;

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === "&") return "&amp;";
    if (character === "'") return "&apos;";
    if (character === '"') return "&quot;";
    return character;
  });
}

function peerLabel(id: string, names: Map<string, string>): string {
  return names.get(id) ?? `Peer ${id.slice(0, 6)}`;
}

function downloadBlob(data: string, filename: string, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Linkfield deliberately treats a connection as an agreement, not a contact
 * scrape. One QR scan makes a request; the relationship is confirmed only
 * after both peers add the directed edge to the same shared Yjs room.
 */
export function Feature({ room, config }: Props) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [cardOpen, setCardOpen] = useState(() =>
    Boolean(localStorage.getItem(NAME_KEY(config.storagePrefix))?.trim()),
  );
  const [exchangeNotice, setExchangeNotice] = useState<ExchangeNotice | null>(null);
  const [, rerender] = useState(0);

  useEffect(() => {
    const key = NAME_KEY(config.storagePrefix);
    try {
      if (name.trim()) localStorage.setItem(key, name);
      else localStorage.removeItem(key);
    } catch {
      // A private browser session can refuse local persistence. The active
      // contact card still works for the duration of the current page.
    }
  }, [config.storagePrefix, name]);

  useEffect(() => {
    if (!room) return;
    const edges = room.doc.getArray<Edge>("edges");
    const names = room.doc.getMap<string>("names");
    const update = () => rerender((revision) => revision + 1);
    edges.observe(update);
    names.observe(update);
    return () => {
      edges.unobserve(update);
      names.unobserve(update);
    };
  }, [room]);

  const edges = room?.doc.getArray<Edge>("edges");
  const nameMap = room?.doc.getMap<string>("names");

  useEffect(() => {
    if (!room || !nameMap || !name.trim()) return;
    nameMap.set(room.peerId, name.trim());
  }, [name, nameMap, room]);

  const edgeList = edges?.toArray() ?? [];
  const names = new Map<string, string>();
  nameMap?.forEach((displayName, id) => names.set(id, displayName));

  const isMutual = (first: string, second: string) =>
    edgeList.some((edge) => edge.from === first && edge.to === second) &&
    edgeList.some((edge) => edge.from === second && edge.to === first);

  const myOutgoing = room ? edgeList.filter((edge) => edge.from === room.peerId) : [];
  const myIncoming = room ? edgeList.filter((edge) => edge.to === room.peerId) : [];
  const myMutual = room ? myOutgoing.filter((edge) => isMutual(room.peerId, edge.to)) : [];
  const pendingIncoming = room
    ? myIncoming.filter((edge) => !isMutual(edge.from, room.peerId))
    : [];
  const pendingOutgoing = room ? myOutgoing.filter((edge) => !isMutual(room.peerId, edge.to)) : [];

  const addOneWay = (to: string, otherName?: string) => {
    const trimmedName = name.trim();
    if (!room || !edges || !nameMap || !trimmedName || to === room.peerId) return;
    if (edgeList.some((edge) => edge.from === room.peerId && edge.to === to)) return;

    room.doc.transact(() => {
      nameMap.set(room.peerId, trimmedName);
      if (otherName) nameMap.set(to, otherName);
      edges.push([{ from: room.peerId, to, ts: Date.now() }]);
    });
  };

  const graphmlText = (() => {
    const peers = [...names.entries()];
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n  <graph id="linkfield" edgedefault="directed">\n` +
      peers
        .map(
          ([id, displayName]) =>
            `    <node id="${escapeXml(id)}"><data key="name">${escapeXml(displayName)}</data></node>`,
        )
        .join("\n") +
      "\n" +
      edgeList
        .map(
          (edge) => `    <edge source="${escapeXml(edge.from)}" target="${escapeXml(edge.to)}"/>`,
        )
        .join("\n") +
      "\n  </graph>\n</graphml>\n"
    );
  })();

  const exportJson = () => {
    const peers = [...names.entries()].map(([id, displayName]) => ({
      id,
      name: displayName,
    }));
    downloadBlob(
      JSON.stringify({ peers, edges: edgeList }, null, 2),
      "linkfield-network.json",
      "application/json",
    );
  };

  const exportGraphml = () => {
    downloadBlob(graphmlText, "linkfield-network.graphml", "application/xml");
  };

  const createContactCard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim()) setCardOpen(true);
  };

  const updateName = (nextName: string) => {
    setName(nextName);
    if (!nextName.trim()) setCardOpen(false);
  };

  const useContactCode = (parsed: { roomId: string; peerId: string; extra: string | null }) => {
    if (!room) return;
    if (parsed.roomId !== room.roomId) {
      setExchangeNotice({
        tone: "warning",
        text: "That code belongs to a different room. Ask them to open this room first.",
      });
      return;
    }
    addOneWay(parsed.peerId, parsed.extra ?? undefined);
    setExchangeNotice({
      tone: "success",
      text: "Request recorded. Their return scan is needed to confirm the connection.",
    });
  };

  const contactCode = room ? makeScanPayload(room.roomId, room.peerId, name.trim()) : "";

  return (
    <main className="network-workspace" aria-labelledby="linkfield-title">
      <section className="network-hero" aria-labelledby="linkfield-title">
        <div className="network-hero-copy">
          <p className="network-eyebrow">A two-way room contact map</p>
          <h1 id="linkfield-title">Build a room worth remembering.</h1>
          <p className="network-hero-summary">
            Linkfield records a connection only after both people exchange a code. Start with your
            contact card, then grow a map together.
          </p>
        </div>

        <MeshSurface
          as="aside"
          tone="quiet"
          padding="md"
          className="network-ledger"
          aria-label="Room ledger"
        >
          <div className="network-ledger-heading">
            <span>Room ledger</span>
            <MeshStatusPill tone={room ? "success" : "warning"} dot announce="polite">
              {room ? "Contact code ready" : "Preparing room"}
            </MeshStatusPill>
          </div>
          <dl>
            <div>
              <dt>Profiles</dt>
              <dd>{names.size}</dd>
            </div>
            <div>
              <dt>Requests</dt>
              <dd>{edgeList.length}</dd>
            </div>
            <div>
              <dt>Confirmed with you</dt>
              <dd>{myMutual.length}</dd>
            </div>
          </dl>
        </MeshSurface>
      </section>

      <div className="network-dashboard">
        <MeshSurface
          as="section"
          tone="raised"
          padding="lg"
          className="network-contact-card"
          aria-labelledby="contact-card-title"
        >
          <div className="network-section-heading">
            <div>
              <p className="network-step">01 / Your card</p>
              <h2 id="contact-card-title">Make a contact code</h2>
            </div>
            <span className="network-route-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>

          <form className="network-name-form" onSubmit={createContactCard}>
            <MeshNameInput
              className="network-name-input"
              label="Name on your code"
              value={name}
              onChange={updateName}
              placeholder="For example, Alex"
              maxLength={48}
              showCounter
              hint="This is the name another person sees on their pending request."
            />
            <MeshButton
              type="submit"
              size="lg"
              fullWidth
              disabled={!name.trim()}
              className="network-create-card"
            >
              Create my QR code
            </MeshButton>
          </form>

          {!cardOpen ? (
            <div className="network-card-gate" aria-live="polite">
              <span className="network-card-gate-index">Next</span>
              <p>Choose a name, then create a code to begin a two-way exchange.</p>
            </div>
          ) : room ? (
            <div className="network-exchange-wrap">
              <div className="network-exchange-heading">
                <div>
                  <p className="network-step">02 / Exchange</p>
                  <h3>Share, then scan back</h3>
                </div>
                <MeshStatusPill tone="info" dot>
                  One scan = request
                </MeshStatusPill>
              </div>
              <QRExchange
                className="network-qr-exchange"
                myPayload={contactCode}
                showLabel="Your code — let the other person scan first"
                scanLabel="Scan their contact code"
                qrSize={156}
                persistVisibilityKey={`${config.storagePrefix}:qr:visible`}
                onScan={useContactCode}
              />
              {exchangeNotice ? (
                <p className={`network-exchange-notice is-${exchangeNotice.tone}`} role="status">
                  {exchangeNotice.text}
                </p>
              ) : null}
              <ol className="network-confirmation-path" aria-label="Confirmation path">
                <li>They scan your code.</li>
                <li>You scan theirs.</li>
                <li>The connection becomes confirmed.</li>
              </ol>
            </div>
          ) : (
            <div className="network-card-gate network-card-gate-waiting" role="status">
              <span className="network-card-gate-index">Saved</span>
              <p>Your name is ready. Your code appears when this room finishes preparing.</p>
            </div>
          )}
        </MeshSurface>

        <MeshSurface
          as="aside"
          tone="base"
          padding="lg"
          className="network-connections"
          aria-labelledby="connections-title"
        >
          <div className="network-section-heading">
            <div>
              <p className="network-step">03 / Connections</p>
              <h2 id="connections-title">Your room map</h2>
            </div>
            <span className="network-connection-total" aria-label={`${myMutual.length} confirmed`}>
              {myMutual.length}
            </span>
          </div>

          <section className="network-connection-block" aria-labelledby="confirmed-title">
            <div className="network-connection-block-heading">
              <h3 id="confirmed-title">Confirmed</h3>
              <span>{myMutual.length}</span>
            </div>
            {myMutual.length === 0 ? (
              <p className="network-empty-state">
                When both people scan, their connection settles here.
              </p>
            ) : (
              <ul className="network-person-list network-confirmed-list">
                {myMutual.map((edge) => (
                  <li key={edge.to}>
                    <span className="network-person-mark" aria-hidden="true" />
                    <strong>{peerLabel(edge.to, names)}</strong>
                    <span>Confirmed</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="network-connection-block" aria-labelledby="incoming-title">
            <div className="network-connection-block-heading">
              <h3 id="incoming-title">Waiting on you</h3>
              <span>{pendingIncoming.length}</span>
            </div>
            {pendingIncoming.length === 0 ? (
              <p className="network-empty-state">No one is waiting for your return scan.</p>
            ) : (
              <ul className="network-person-list">
                {pendingIncoming.map((edge) => (
                  <li key={edge.from}>
                    <span
                      className="network-person-mark network-person-mark-waiting"
                      aria-hidden="true"
                    />
                    <strong>{peerLabel(edge.from, names)}</strong>
                    <span>Scan back</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="network-connection-block" aria-labelledby="outgoing-title">
            <div className="network-connection-block-heading">
              <h3 id="outgoing-title">Awaiting confirmation</h3>
              <span>{pendingOutgoing.length}</span>
            </div>
            {pendingOutgoing.length === 0 ? (
              <p className="network-empty-state">Your outbound requests will appear here.</p>
            ) : (
              <ul className="network-person-list">
                {pendingOutgoing.map((edge) => (
                  <li key={edge.to}>
                    <span
                      className="network-person-mark network-person-mark-awaiting"
                      aria-hidden="true"
                    />
                    <strong>{peerLabel(edge.to, names)}</strong>
                    <span>Waiting</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="network-export-panel">
            <summary>Export this room</summary>
            <p>Download the names and directed requests currently known in this room.</p>
            <div className="network-export-actions">
              <MeshButton variant="secondary" size="sm" onClick={exportJson} disabled={!room}>
                Download JSON
              </MeshButton>
              <MeshButton variant="secondary" size="sm" onClick={exportGraphml} disabled={!room}>
                Download GraphML
              </MeshButton>
            </div>
            <pre className="nb-graphml-text" aria-label="GraphML export preview">
              {graphmlText}
            </pre>
          </details>
        </MeshSurface>
      </div>
      <SelfRefBar config={config} />
    </main>
  );
}
