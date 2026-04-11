import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";
import {
  Upload, Clock, Database, Star, User, X,
  ChevronRight, ChevronDown, Search, Grid,
  AlertCircle, ExternalLink, RefreshCw, Home,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// REC.NET PROXY HELPER
// ─────────────────────────────────────────────────────────────
const rnProxy = url => `/api/recnet?url=${encodeURIComponent(url)}`;

async function rnGet(url) {
  const res = await fetch(rnProxy(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────
// DIRECTORY WALKER (drag-drop fix)
// ─────────────────────────────────────────────────────────────
async function walkEntry(entry, base = "") {
  const out = {};
  if (entry.isFile) {
    const f = await new Promise((res, rej) => entry.file(res, rej));
    out[base + entry.name] = f;
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      for (const c of batch)
        Object.assign(out, await walkEntry(c, `${base}${entry.name}/`));
    } while (batch.length > 0);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// FILE UTILITIES
// ─────────────────────────────────────────────────────────────
function readText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsText(file);
  });
}

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const h = lines[0].split(",").map(s => s.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(l => {
    const v = l.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
    return h.reduce((o, k, i) => ({ ...o, [k]: v[i] ?? "" }), {});
  });
}

function imgId(name) { return name.replace(/\.(jpg|jpeg|png)$/i, ""); }

// ─────────────────────────────────────────────────────────────
// LOCAL EXPORT PARSER
// ─────────────────────────────────────────────────────────────
async function parseExport(files, map = null) {
  const d = {
    roomName: "", roomDetails: null, roomImageUrl: null,
    subrooms: [], inventions: [], allImages: [], allAudio: [], allGlb: [],
  };
  let byPath = map || {};
  if (!map) {
    if (!files?.length) return d;
    for (const f of files) byPath[f.webkitRelativePath || f.name] = f;
  }
  const paths = Object.keys(byPath).filter(Boolean);
  if (!paths.length) return d;
  d.roomName = paths[0].split("/")[0];

  // Root-level files
  for (const p of paths.filter(p => p.split("/").length === 2)) {
    const f = byPath[p], n = p.split("/").pop();
    if (n === "RoomDetails.json") try { d.roomDetails = JSON.parse(await readText(f)); } catch {}
    else if (/^RoomImage\.(jpg|png|jpeg)/i.test(n)) d.roomImageUrl = URL.createObjectURL(f);
  }

  // Find subrooms + inventions
  const srSet = new Set(), invSet = new Set();
  for (const p of paths) {
    const pts = p.split("/");
    if (pts[1]?.startsWith("SubRoom_")) srSet.add(pts[1]);
    if (pts[1] === "Inventions" && pts[2]?.startsWith("Invention_")) invSet.add(pts[2]);
  }

  for (const folder of srSet) {
    const pts = folder.split("_");
    const sr = { id: pts[1], name: pts.slice(2).join("_"), folder, metadata: null, images: [], audio: [], glb: [], csv: {} };
    const prefix = `${d.roomName}/${folder}/`;
    for (const p of paths.filter(p => p.startsWith(prefix))) {
      const f = byPath[p], n = p.split("/").pop();
      if (n === "Subroom.json") try { sr.metadata = JSON.parse(await readText(f)); } catch {}
      else if (/\.(jpg|png|jpeg)$/i.test(n)) {
        const url = URL.createObjectURL(f);
        const img = { id: imgId(n), name: n, url, path: p, subroom: sr.name, subroomId: sr.id, type: "subroom-image" };
        sr.images.push(img); d.allImages.push(img);
      } else if (/\.wav$/i.test(n)) {
        const url = URL.createObjectURL(f);
        sr.audio.push({ name: n, url, path: p, subroom: sr.name });
        d.allAudio.push({ name: n, url, path: p, subroom: sr.name });
      } else if (/\.glb$/i.test(n)) {
        const url = URL.createObjectURL(f);
        sr.glb.push({ name: n, url, path: p });
        d.allGlb.push({ name: n, url, path: p, subroom: sr.name });
      } else if (n === "CV2NodeTypes.csv") try { sr.csv.cv2 = parseCSV(await readText(f)); } catch {}
      else if (n === "PrefabIds.csv") try { sr.csv.prefab = parseCSV(await readText(f)); } catch {}
    }
    d.subrooms.push(sr);
  }

  for (const folder of invSet) {
    const pts = folder.split("_");
    const inv = { id: pts[1], name: pts.slice(2).join("_"), folder, metadata: null, details: null, version: null, imageUrl: null, images: [], audio: [] };
    const prefix = `${d.roomName}/Inventions/${folder}/`;
    for (const p of paths.filter(p => p.startsWith(prefix))) {
      const f = byPath[p], n = p.split("/").pop();
      if (n === "Invention.json") try { inv.metadata = JSON.parse(await readText(f)); } catch {}
      else if (n === "InventionDetails.json") try { inv.details = JSON.parse(await readText(f)); } catch {}
      else if (n === "InventionVersion.json") try { inv.version = JSON.parse(await readText(f)); } catch {}
      else if (/^InventionImage\.(jpg|png|jpeg)/i.test(n)) inv.imageUrl = URL.createObjectURL(f);
      else if (/\.(jpg|png|jpeg)$/i.test(n)) {
        const url = URL.createObjectURL(f);
        const img = { id: imgId(n), name: n, url, path: p, invention: inv.name, inventionId: inv.id, type: "invention-image" };
        inv.images.push(img); d.allImages.push(img);
      } else if (/\.wav$/i.test(n)) {
        const url = URL.createObjectURL(f);
        inv.audio.push({ name: n, url, path: p });
        d.allAudio.push({ name: n, url, path: p, invention: inv.name });
      }
    }
    d.inventions.push(inv);
  }

  // Fallback: flat folder of images
  if (d.allImages.length === 0) {
    for (const p of paths) {
      const n = p.split("/").pop();
      if (/\.(jpg|png|jpeg)$/i.test(n)) {
        const pts = p.split("/");
        d.allImages.push({
          id: imgId(n), name: n, url: URL.createObjectURL(byPath[p]), path: p,
          subroom: pts.length > 2 ? pts[pts.length - 2] : (pts[0] || "root"),
          subroomId: "flat", type: "subroom-image",
        });
      }
    }
  }

  return d;
}

// ─────────────────────────────────────────────────────────────
// REC.NET ENRICHMENT
// ─────────────────────────────────────────────────────────────
async function enrichFromRecNet(localImages, username, onProgress) {
  onProgress("Looking up account…");
  const account = await rnGet(`https://accounts.rec.net/account?username=${encodeURIComponent(username)}`);

  const rnImages = [];
  let skip = 0;
  while (rnImages.length < 5000) {
    onProgress(`Fetching photos… (${rnImages.length} loaded)`);
    const batch = await rnGet(
      `https://api.rec.net/api/images/v4/player/${account.accountId}?take=100&skip=${skip}`
    );
    if (!Array.isArray(batch) || !batch.length) break;
    rnImages.push(...batch);
    if (batch.length < 100) break;
    skip += 100;
  }

  const byId = {};
  for (const img of rnImages) byId[String(img.ImageId)] = img;

  const matched = localImages.map(li => {
    const rni = byId[li.id];
    if (!rni) return li;
    return {
      ...li,
      roomId: rni.RoomId,
      takenAt: rni.CreatedAt,
      playerCount: rni.PlayerCount ?? null,
      recnetUrl: `https://rec.net/image/${rni.ImageId}`,
    };
  });

  const roomIds = [...new Set(matched.filter(i => i.roomId).map(i => i.roomId))];
  onProgress(`Loading ${roomIds.length} rooms…`);
  const rooms = {};
  for (let i = 0; i < roomIds.length; i += 10) {
    await Promise.all(
      roomIds.slice(i, i + 10).map(async id => {
        try { rooms[id] = await rnGet(`https://rooms.rec.net/rooms/${id}`); } catch {}
      })
    );
  }

  const enriched = matched.map(img => {
    if (!img.roomId) return img;
    const r = rooms[img.roomId];
    if (!r) return img;
    return { ...img, roomName: r.DisplayName || r.Name?.replace(/^\^/, "") || String(img.roomId) };
  });

  return {
    account,
    images: enriched,
    rooms,
    matchedCount: enriched.filter(i => i.takenAt).length,
  };
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const S = {
  bg: "#0d0d14", surface: "#13131f", surface2: "#1a1a2e",
  border: "rgba(255,255,255,0.07)", text: "#e2e2f0", muted: "#5a5a7a",
  accent: "#7c5cfc", accent2: "#f050a0", gold: "#f5b942",
};

const fmtDate = iso => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d) ? null : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};
const fmtMonth = iso => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d) ? null : d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
};
const monthKey = iso => iso?.slice(0, 7) ?? null;

// ─────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────
function Badge({ label, color = S.accent }) {
  return (
    <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function EmptyState({ emoji, title, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80, color: S.muted, textAlign: "center" }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>{emoji}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: S.text, marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontSize: 13, maxWidth: 320 }}>{sub}</div>}
    </div>
  );
}

function Card({ children, style = {} }) {
  return <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, ...style }}>{children}</div>;
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 18, height: 18, border: `2px solid ${S.accent}44`, borderTopColor: S.accent, borderRadius: "50%", animation: "spin .7s linear infinite", flexShrink: 0 }} />
    </>
  );
}

function ConnectBanner({ onGo }) {
  return (
    <div style={{ background: `${S.accent}15`, border: `1px solid ${S.accent}44`, borderRadius: 12, padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 20 }}>🔗</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Connect to Rec.net for dates, room names & more</div>
        <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>Enter your username to match photos with room data</div>
      </div>
      <button onClick={onGo} style={{ background: `linear-gradient(135deg,${S.accent},${S.accent2})`, border: "none", borderRadius: 8, padding: "7px 16px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
        Connect →
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UPLOAD PAGE
// ─────────────────────────────────────────────────────────────
function UploadPage({ onFiles }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.webkitdirectory = true;
      inputRef.current.directory = true;
    }
  }, []);

  const handleDrop = async e => {
    e.preventDefault(); setDrag(false);
    const items = [...(e.dataTransfer.items || [])];
    const entries = items.map(i => i.webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) {
      const maps = await Promise.all(entries.map(en => walkEntry(en, "")));
      const merged = Object.assign({}, ...maps);
      if (Object.keys(merged).length) { onFiles(null, merged); return; }
    }
    onFiles(e.dataTransfer.files);
  };

  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "system-ui,sans-serif", color: S.text }}>
      <style>{`@keyframes shimmer{0%{width:20%}50%{width:80%}100%{width:20%}}`}</style>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎮</div>
        <h1 style={{ fontSize: 44, fontWeight: 900, margin: 0, background: `linear-gradient(135deg,${S.accent},${S.accent2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Rec Room Archive
        </h1>
        <p style={{ color: S.muted, fontSize: 16, marginTop: 10, maxWidth: 420 }}>
          Upload your Rec Room export folder to explore images, get room names, dates, and generate your Wrapped stats.
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onClick={() => inputRef.current?.click()}
        style={{ border: `2px dashed ${drag ? S.accent : S.border}`, borderRadius: 24, padding: "56px 72px", textAlign: "center", cursor: "pointer", background: drag ? `${S.accent}11` : S.surface, transition: "all .25s", maxWidth: 480, width: "100%" }}
      >
        <Upload size={40} color={S.accent} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Drop your export folder here</div>
        <div style={{ color: S.muted, marginBottom: 24, fontSize: 14 }}>or click to browse</div>
        <button
          onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
          style={{ background: `linear-gradient(135deg,${S.accent},${S.accent2})`, border: "none", borderRadius: 12, padding: "12px 32px", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
        >
          Choose Folder
        </button>
        <input ref={inputRef} type="file" multiple style={{ display: "none" }} onChange={e => onFiles(e.target.files)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 40, maxWidth: 560, width: "100%" }}>
        {[
          { icon: "🖼️", label: "Image Gallery", desc: "Filter & browse all photos" },
          { icon: "📅", label: "Timeline", desc: "Chronological photo history" },
          { icon: "🏠", label: "Room Explorer", desc: "Browse photos by room" },
        ].map(({ icon, label, desc }) => (
          <div key={label} style={{ background: S.surface, borderRadius: 14, padding: 18, border: `1px solid ${S.border}`, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{label}</div>
            <div style={{ color: S.muted, fontSize: 12 }}>{desc}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24, fontSize: 12, color: S.muted, textAlign: "center" }}>
        All processing is local. Connect to Rec.net after uploading to unlock room names and dates.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOADING SCREEN
// ─────────────────────────────────────────────────────────────
function LoadingScreen({ progress }) {
  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", color: S.text }}>
      <style>{`@keyframes shimmer{0%{width:20%}50%{width:80%}100%{width:20%}}`}</style>
      <div style={{ fontSize: 56, marginBottom: 20 }}>🎮</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Loading…</div>
      <div style={{ color: S.accent, marginBottom: 28, fontSize: 14 }}>{progress}</div>
      <div style={{ width: 280, height: 4, background: S.surface2, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", background: `linear-gradient(90deg,${S.accent},${S.accent2})`, borderRadius: 4, animation: "shimmer 1.2s infinite" }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, data, enrichData }) {
  const allImages = enrichData?.images || data?.allImages || [];
  const nav = [
    { id: "gallery",  icon: "🖼️", label: "Gallery" },
    { id: "timeline", icon: "📅", label: "Timeline" },
    { id: "explorer", icon: "🏠", label: "Rooms" },
    { id: "wrapped",  icon: "✨", label: "Wrapped" },
    { id: "recnet",   icon: "🔗", label: enrichData ? "Connected ✓" : "Rec.net" },
  ];
  return (
    <aside style={{ width: 210, background: S.surface, borderRight: `1px solid ${S.border}`, padding: "20px 12px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "0 8px", marginBottom: 28 }}>
        <div style={{ fontSize: 17, fontWeight: 900, background: `linear-gradient(135deg,${S.accent},${S.accent2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>🎮 RR Archive</div>
        <div style={{ fontSize: 11, color: S.muted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {enrichData ? `@${enrichData.account.username}` : data?.roomName}
        </div>
      </div>
      <nav style={{ flex: 1 }}>
        {nav.map(({ id, icon, label }) => {
          const active = page === id;
          return (
            <button key={id} onClick={() => setPage(id)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 12px", borderRadius: 10, border: "none", cursor: "pointer", marginBottom: 2, background: active ? `${S.accent}22` : "transparent", color: active ? S.accent : id === "recnet" && enrichData ? "#4ade80" : S.muted, fontWeight: active ? 700 : 400, fontSize: 13, textAlign: "left" }}>
              {icon} {label}
            </button>
          );
        })}
      </nav>
      <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 14, fontSize: 11, color: S.muted, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[
          { v: allImages.length, l: "images" },
          { v: enrichData ? Object.keys(enrichData.rooms).length : data?.subrooms.length, l: enrichData ? "rooms" : "subrooms" },
          { v: enrichData?.matchedCount ?? data?.inventions.length, l: enrichData ? "matched" : "inventions" },
          { v: data?.allAudio.length ?? 0, l: "audio" },
        ].map(({ v, l }) => (
          <div key={l} style={{ background: S.surface2, borderRadius: 8, padding: "6px 8px" }}>
            <div style={{ fontWeight: 700, color: S.text, fontSize: 14 }}>{v ?? 0}</div>
            <div>{l}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// GALLERY PAGE
// ─────────────────────────────────────────────────────────────
function ImageModal({ img, onClose }) {
  useEffect(() => {
    const h = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: S.surface, borderRadius: 20, overflow: "hidden", maxWidth: 820, width: "100%", border: `1px solid ${S.border}` }}>
        <img src={img.url} alt={img.name} style={{ width: "100%", maxHeight: 460, objectFit: "contain", background: S.bg, display: "block" }} />
        <div style={{ padding: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{img.name}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {img.roomName && <Badge label={`🏠 ${img.roomName}`} color={S.accent} />}
              {img.subroom && !img.roomName && <Badge label={`📁 ${img.subroom}`} color={S.accent} />}
              {img.takenAt && <Badge label={fmtDate(img.takenAt)} color="#059669" />}
              {img.playerCount != null && <Badge label={`👥 ${img.playerCount}`} color={S.muted} />}
            </div>
            {img.recnetUrl && (
              <a href={img.recnetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: S.accent, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <ExternalLink size={12} /> View on Rec.net
              </a>
            )}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer", color: S.text, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function GalleryPage({ allImages, enrichData, onGoRecNet }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(0);
  const PER_PAGE = 60;

  const rooms = useMemo(() => [...new Set(allImages.map(i => i.roomName || i.subroom).filter(Boolean))].sort(), [allImages]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allImages.filter(img => {
      const matchSearch = !q || img.name.toLowerCase().includes(q) || (img.roomName || img.subroom || "").toLowerCase().includes(q);
      const matchFilter = filter === "all" ? true : (img.roomName || img.subroom) === filter;
      return matchSearch && matchFilter;
    });
  }, [allImages, search, filter]);

  const pages = Math.ceil(filtered.length / PER_PAGE);
  const visible = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      {!enrichData && <ConnectBanner onGo={onGoRecNet} />}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px" }}>Image Gallery</h1>
        <div style={{ color: S.muted, fontSize: 13 }}>{filtered.length} of {allImages.length} images</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: S.muted }} />
          <input placeholder="Search…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            style={{ width: "100%", padding: "9px 9px 9px 32px", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, color: S.text, fontSize: 13, boxSizing: "border-box", outline: "none" }} />
        </div>
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}
          style={{ padding: "9px 12px", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, color: S.text, fontSize: 13 }}>
          <option value="all">All Rooms</option>
          {rooms.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {visible.length === 0
        ? <EmptyState emoji="🖼️" title="No images found" sub={allImages.length === 0 ? "No image files were found in your upload." : "Try a different search or filter."} />
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
            {visible.map((img, i) => (
              <div key={i} onClick={() => setSelected(img)}
                style={{ borderRadius: 12, overflow: "hidden", cursor: "pointer", background: S.surface, border: `1px solid ${S.border}`, transition: "transform .2s" }}
                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                <img src={img.url} alt={img.name} loading="lazy" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: S.accent, textTransform: "uppercase", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {img.roomName || img.subroom || img.invention || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: S.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {img.takenAt ? fmtDate(img.takenAt) : img.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      }

      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
          {Array.from({ length: pages }).map((_, i) => (
            <button key={i} onClick={() => setPage(i)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${i === page ? S.accent : S.border}`, background: i === page ? `${S.accent}22` : "transparent", color: i === page ? S.accent : S.muted, cursor: "pointer", fontSize: 13, fontWeight: i === page ? 700 : 400 }}>{i + 1}</button>
          ))}
        </div>
      )}

      {selected && <ImageModal img={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TIMELINE PAGE
// ─────────────────────────────────────────────────────────────
function TimelinePage({ allImages, enrichData, onGoRecNet }) {
  const { months, chartData, hasRealDates } = useMemo(() => {
    const dated = allImages.filter(i => i.takenAt).sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt));
    if (!dated.length) return { months: [], chartData: [], hasRealDates: false };

    const byMonth = {};
    for (const img of dated) {
      const k = monthKey(img.takenAt);
      if (!byMonth[k]) byMonth[k] = [];
      byMonth[k].push(img);
    }

    const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a)).map(k => ({ key: k, label: fmtMonth(k + "-01"), images: byMonth[k] }));
    const chartData = [...months].reverse().map(m => ({ month: m.key.slice(0, 7), count: m.images.length }));

    return { months, chartData, hasRealDates: true };
  }, [allImages]);

  if (!enrichData) {
    return (
      <div style={{ padding: 28, overflowY: "auto" }}>
        <ConnectBanner onGo={onGoRecNet} />
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 8px" }}>Timeline</h1>
        <p style={{ color: S.muted, fontSize: 13, marginBottom: 28 }}>Connect to Rec.net to see your photos in chronological order.</p>
        <EmptyState emoji="📅" title="No date data yet" sub="Once you connect your Rec.net account, your photos will be sorted by when they were taken." />
      </div>
    );
  }

  if (!hasRealDates) {
    return (
      <div style={{ padding: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 8px" }}>Timeline</h1>
        <EmptyState emoji="📅" title="No dates matched" sub="None of your local images could be matched to Rec.net data. Make sure your username is correct." />
      </div>
    );
  }

  return (
    <div style={{ padding: 28, overflowY: "auto", height: "100%" }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px" }}>Timeline</h1>
      <p style={{ color: S.muted, fontSize: 13, marginBottom: 24 }}>{allImages.filter(i => i.takenAt).length} photos with dates · {months.length} months of memories</p>

      {chartData.length > 1 && (
        <Card style={{ padding: "20px 16px", marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: S.muted }}>Photos per Month</div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ left: -20, right: 0 }}>
              <defs>
                <linearGradient id="tgrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={S.accent} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={S.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
              <XAxis dataKey="month" tick={{ fill: S.muted, fontSize: 10 }} />
              <YAxis tick={{ fill: S.muted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: S.surface2, border: "none", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke={S.accent} fill="url(#tgrad)" strokeWidth={2} name="Photos" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {months.map(({ key, label, images }) => (
        <div key={key} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{label}</div>
            <Badge label={`${images.length} photos`} color={S.accent} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 }}>
            {images.slice(0, 24).map((img, i) => (
              <div key={i} style={{ borderRadius: 8, overflow: "hidden", background: S.surface, border: `1px solid ${S.border}`, position: "relative" }}>
                <img src={img.url} alt={img.name} loading="lazy" style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
                {img.roomName && (
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,.8))", padding: "12px 6px 4px", fontSize: 9, fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {img.roomName}
                  </div>
                )}
              </div>
            ))}
            {images.length > 24 && (
              <div style={{ borderRadius: 8, background: S.surface2, border: `1px solid ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center", height: 90, fontSize: 13, color: S.muted, fontWeight: 700 }}>
                +{images.length - 24} more
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EXPLORER PAGE
// ─────────────────────────────────────────────────────────────
function ExplorerPage({ allImages, data, enrichData, onGoRecNet }) {
  const [selRoom, setSelRoom] = useState(null);
  const [selImg, setSelImg] = useState(null);

  const roomGroups = useMemo(() => {
    const byRoom = {};
    for (const img of allImages) {
      const key = img.roomName || img.subroom || "Unknown";
      if (!byRoom[key]) byRoom[key] = [];
      byRoom[key].push(img);
    }
    return Object.entries(byRoom).sort((a, b) => b[1].length - a[1].length);
  }, [allImages]);

  const roomImages = selRoom ? (roomGroups.find(([k]) => k === selRoom)?.[1] ?? []) : [];

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Room list */}
      <div style={{ width: 240, padding: 16, borderRight: `1px solid ${S.border}`, overflowY: "auto", flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: S.muted }}>
          {enrichData ? "🏠 Rooms" : "📁 Folders"} ({roomGroups.length})
        </div>
        {!enrichData && (
          <button onClick={onGoRecNet} style={{ width: "100%", marginBottom: 12, padding: "7px 10px", background: `${S.accent}22`, border: `1px solid ${S.accent}44`, borderRadius: 8, color: S.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            🔗 Connect Rec.net for room names
          </button>
        )}
        {roomGroups.map(([name, imgs]) => (
          <div key={name} onClick={() => setSelRoom(name)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2, background: selRoom === name ? `${S.accent}22` : "transparent", color: selRoom === name ? S.accent : S.muted, fontSize: 12 }}
            onMouseEnter={e => { if (selRoom !== name) e.currentTarget.style.background = "rgba(255,255,255,.04)"; }}
            onMouseLeave={e => { if (selRoom !== name) e.currentTarget.style.background = "transparent"; }}>
            <Home size={12} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: selRoom === name ? 700 : 400 }}>{name}</span>
            <span style={{ fontSize: 10, background: `rgba(255,255,255,.08)`, borderRadius: 4, padding: "1px 5px" }}>{imgs.length}</span>
          </div>
        ))}
      </div>

      {/* Image grid */}
      <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        {!selRoom ? (
          <EmptyState emoji="🏠" title="Select a room" sub="Click a room on the left to see its photos." />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{selRoom}</h2>
              <Badge label={`${roomImages.length} photos`} color={S.accent} />
              {enrichData?.rooms && Object.values(enrichData.rooms).find(r => (r.DisplayName || r.Name?.replace(/^\^/, "")) === selRoom) && (() => {
                const room = Object.values(enrichData.rooms).find(r => (r.DisplayName || r.Name?.replace(/^\^/, "")) === selRoom);
                return room?.Name ? <a href={`https://rec.net/rooms/${room.Name.replace(/^\^/, "")}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: S.accent, display: "inline-flex", alignItems: "center", gap: 4 }}><ExternalLink size={12} /> Open on Rec.net</a> : null;
              })()}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
              {roomImages.map((img, i) => (
                <div key={i} onClick={() => setSelImg(img)} style={{ borderRadius: 10, overflow: "hidden", cursor: "pointer", background: S.surface, border: `1px solid ${S.border}` }}
                  onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                  <img src={img.url} alt={img.name} loading="lazy" style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                  {img.takenAt && <div style={{ padding: "5px 8px", fontSize: 10, color: S.muted }}>{fmtDate(img.takenAt)}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {selImg && <ImageModal img={selImg} onClose={() => setSelImg(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WRAPPED PAGE
// ─────────────────────────────────────────────────────────────
const PIE_COLORS = ["#7c5cfc","#f050a0","#22d3ee","#f5b942","#4ade80","#f97316"];

function WrappedPage({ allImages, data, enrichData }) {
  const [step, setStep] = useState(0);

  const stats = useMemo(() => {
    const dated = allImages.filter(i => i.takenAt).sort((a, b) => new Date(a.takenAt) - new Date(b.takenAt));
    const first = dated[0], last = dated[dated.length - 1];

    const byRoom = {};
    for (const img of allImages) {
      const k = img.roomName || img.subroom || "Unknown";
      byRoom[k] = (byRoom[k] || 0) + 1;
    }
    const topRooms = Object.entries(byRoom).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topRoom = topRooms[0];

    const byMonth = {};
    for (const img of dated) {
      const k = monthKey(img.takenAt);
      byMonth[k] = (byMonth[k] || 0) + 1;
    }
    const topMonth = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];
    const monthChartData = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ month: k, count: v }));

    return { first, last, topRoom, topRooms, topMonth, monthChartData, totalRooms: Object.keys(byRoom).length };
  }, [allImages]);

  const slides = [
    {
      bg: "linear-gradient(145deg,#1a0835,#2a0d55,#0d1a40)",
      render: () => (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎮</div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,.6)", marginBottom: 6 }}>Your</div>
          <div style={{ fontSize: 58, fontWeight: 900, lineHeight: 1, letterSpacing: -1 }}>Rec Room</div>
          <div style={{ fontSize: 58, fontWeight: 900, color: S.gold, lineHeight: 1.1, letterSpacing: -1 }}>Wrapped</div>
          <div style={{ marginTop: 20, color: "rgba(255,255,255,.5)", fontSize: 14 }}>
            {enrichData ? `@${enrichData.account.username}` : data?.roomName}
          </div>
        </div>
      )
    },
    {
      bg: "linear-gradient(145deg,#1a0030,#500070,#200050)",
      render: () => (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginBottom: 6 }}>You captured</div>
          <div style={{ fontSize: 110, fontWeight: 900, color: S.gold, lineHeight: 0.9, letterSpacing: -4 }}>{allImages.length}</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>Photos</div>
          <div style={{ marginTop: 14, color: "rgba(255,255,255,.5)", fontSize: 14 }}>moments saved forever</div>
          <div style={{ fontSize: 52, marginTop: 16 }}>📸</div>
        </div>
      )
    },
    ...(stats.first && stats.last ? [{
      bg: "linear-gradient(145deg,#002535,#005070,#001530)",
      render: () => (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 52 }}>📅</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: 12 }}>Your journey</div>
          <div style={{ marginTop: 16, display: "flex", gap: 16, justifyContent: "center" }}>
            <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 14, padding: "14px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 4 }}>First photo</div>
              <div style={{ fontWeight: 700, color: "#22d3ee", fontSize: 14 }}>{fmtDate(stats.first.takenAt)}</div>
              {stats.first.roomName && <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>{stats.first.roomName}</div>}
            </div>
            <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 14, padding: "14px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 4 }}>Latest photo</div>
              <div style={{ fontWeight: 700, color: S.accent2, fontSize: 14 }}>{fmtDate(stats.last.takenAt)}</div>
              {stats.last.roomName && <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>{stats.last.roomName}</div>}
            </div>
          </div>
          <div style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,.4)" }}>
            {Math.round((new Date(stats.last.takenAt) - new Date(stats.first.takenAt)) / 86400000)} days of memories
          </div>
        </div>
      )
    }] : []),
    ...(stats.topRoom ? [{
      bg: "linear-gradient(145deg,#35000a,#700020,#200010)",
      render: () => (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 52 }}>🏠</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: 12 }}>Your most visited room</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: S.accent2, lineHeight: 1.1, marginTop: 8 }}>{stats.topRoom[0]}</div>
          <div style={{ marginTop: 12, fontSize: 22, fontWeight: 800, color: S.gold }}>{stats.topRoom[1]} photos</div>
          <div style={{ marginTop: 16, color: "rgba(255,255,255,.4)", fontSize: 13 }}>You clearly loved this place</div>
        </div>
      )
    }] : []),
    ...(stats.topMonth ? [{
      bg: "linear-gradient(145deg,#1a1500,#3a3000,#0f0a00)",
      render: () => (
        <div style={{ width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 36 }}>📈</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: 8 }}>Your most active month</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: S.gold, marginTop: 4 }}>{fmtMonth(stats.topMonth[0] + "-01")}</div>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,.6)", marginTop: 4 }}>{stats.topMonth[1]} photos</div>
          </div>
          {stats.monthChartData.length > 1 && (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats.monthChartData} margin={{ left: -20, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" />
                <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,.5)", fontSize: 9 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,.5)", fontSize: 9 }} />
                <Tooltip contentStyle={{ background: "#1a1030", border: "none", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" name="Photos" fill={S.gold} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )
    }] : []),
    {
      bg: "linear-gradient(145deg,#0d0d14,#1a0a2e,#0a1628)",
      render: () => (
        <div style={{ textAlign: "center", width: "100%" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌟</div>
          <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 20 }}>Your Legacy</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, textAlign: "left" }}>
            {[
              { icon: "📸", label: "Total Photos", value: allImages.length, color: S.accent },
              { icon: "🏠", label: "Rooms", value: stats.totalRooms, color: "#22d3ee" },
              { icon: "📅", label: "Months Active", value: stats.monthChartData.length, color: S.accent2 },
              { icon: "🎵", label: "Audio Clips", value: data?.allAudio.length ?? 0, color: "#4ade80" },
              { icon: "📦", label: "3D Models", value: data?.allGlb.length ?? 0, color: S.gold },
              { icon: "🔗", label: "Matched", value: enrichData?.matchedCount ?? "—", color: "#f97316" },
            ].map(({ icon, label, value, color }) => (
              <div key={label} style={{ background: "rgba(255,255,255,.06)", borderRadius: 14, padding: 16, border: "1px solid rgba(255,255,255,.08)" }}>
                <div style={{ fontSize: 22 }}>{icon}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, zIndex: 10 }}>
        {slides.map((_, i) => (
          <div key={i} onClick={() => setStep(i)} style={{ width: i === step ? 22 : 6, height: 6, borderRadius: 3, background: i === step ? "white" : "rgba(255,255,255,.25)", cursor: "pointer", transition: "all .3s" }} />
        ))}
      </div>
      <div key={step} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: slides[step].bg, padding: "48px 40px 24px", overflowY: "auto" }}>
        <div style={{ maxWidth: 480, width: "100%", color: "white" }}>{slides[step].render()}</div>
      </div>
      <div style={{ padding: "14px 24px", background: "rgba(0,0,0,.4)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} style={{ padding: "8px 22px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.08)", color: step === 0 ? "rgba(255,255,255,.25)" : "white", cursor: step === 0 ? "default" : "pointer", fontWeight: 700, fontSize: 13 }}>← Prev</button>
        <span style={{ color: "rgba(255,255,255,.3)", fontSize: 12 }}>{step + 1} / {slides.length}</span>
        <button onClick={() => setStep(Math.min(slides.length - 1, step + 1))} disabled={step === slides.length - 1} style={{ padding: "8px 22px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.08)", color: step === slides.length - 1 ? "rgba(255,255,255,.25)" : "white", cursor: step === slides.length - 1 ? "default" : "pointer", fontWeight: 700, fontSize: 13 }}>Next →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REC.NET PAGE
// ─────────────────────────────────────────────────────────────
function RecNetPage({ data, enrichData, onEnrich }) {
  const [username, setUsername] = useState(enrichData?.account?.username ?? "");
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const search = async () => {
    const u = username.trim();
    if (!u) return;
    setLoading(true); setError(""); setProfile(null);
    try {
      const account = await rnGet(`https://accounts.rec.net/account?username=${encodeURIComponent(u)}`);
      const [roomsR, photosR] = await Promise.allSettled([
        rnGet(`https://rooms.rec.net/rooms/ownedby/${account.accountId}?take=20`),
        rnGet(`https://api.rec.net/api/images/v4/player/${account.accountId}?take=12&skip=0`),
      ]);
      setProfile({
        account,
        rooms: roomsR.status === "fulfilled" ? roomsR.value : [],
        recentPhotos: photosR.status === "fulfilled" ? photosR.value : [],
      });
    } catch (e) {
      setError(e.message || "Could not reach Rec.net. The server proxy may be unavailable.");
    }
    setLoading(false);
  };

  const doEnrich = async () => {
    if (!profile) return;
    setEnriching(true); setError("");
    try {
      const result = await enrichFromRecNet(data.allImages, profile.account.username, setProgress);
      onEnrich(result);
    } catch (e) {
      setError(e.message || "Enrichment failed.");
    }
    setEnriching(false);
  };

  return (
    <div style={{ padding: 28, maxWidth: 700, overflowY: "auto", height: "100%" }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px" }}>Rec.net</h1>
      <p style={{ color: S.muted, fontSize: 13, marginBottom: 24 }}>
        Look up a profile and connect it to your local images to unlock dates, room names, and more.
      </p>

      {enrichData && (
        <div style={{ background: "#052e1644", border: "1px solid #4ade8044", borderRadius: 12, padding: "12px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <div style={{ fontWeight: 700, color: "#4ade80" }}>Connected as @{enrichData.account.username}</div>
            <div style={{ fontSize: 12, color: S.muted }}>{enrichData.matchedCount} of {data.allImages.length} images enriched with room + date data</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Enter Rec.net username…"
          style={{ flex: 1, padding: "11px 14px", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, color: S.text, fontSize: 14, outline: "none" }} />
        <button onClick={search} disabled={loading}
          style={{ padding: "11px 22px", background: `linear-gradient(135deg,${S.accent},${S.accent2})`, border: "none", borderRadius: 12, color: "white", fontWeight: 700, cursor: loading ? "wait" : "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          {loading ? <Spinner /> : null} {loading ? "…" : "Search"}
        </button>
      </div>

      {error && (
        <Card style={{ padding: 16, marginBottom: 20, borderColor: "rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertCircle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div>
          </div>
        </Card>
      )}

      {enriching && (
        <Card style={{ padding: 20, marginBottom: 20, borderColor: `${S.accent}44` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Spinner />
            <div style={{ fontSize: 14 }}>{progress || "Working…"}</div>
          </div>
        </Card>
      )}

      {profile && !enriching && (
        <>
          <Card style={{ padding: 22, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              {profile.account.profileImage
                ? <img src={`https://img.rec.net/${profile.account.profileImage}`} alt="Profile" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `2px solid ${S.accent}` }} />
                : <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg,${S.accent},${S.accent2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>👤</div>
              }
              <div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{profile.account.displayName || profile.account.username}</div>
                <div style={{ color: S.muted, fontSize: 13 }}>@{profile.account.username}</div>
                {profile.account.bio && <div style={{ color: S.text, fontSize: 13, marginTop: 4 }}>{profile.account.bio}</div>}
              </div>
            </div>

            {/* Enrich button */}
            {data?.allImages.length > 0 && (
              <button onClick={doEnrich}
                style={{ width: "100%", padding: "12px", background: `linear-gradient(135deg,${S.accent},${S.accent2})`, border: "none", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 16 }}>
                🔗 Enrich {data.allImages.length} local images with Rec.net data
              </button>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[
                { label: "Account ID", value: profile.account.accountId },
                { label: "Level", value: profile.account.level ?? "?" },
                { label: "Junior", value: profile.account.isJunior ? "Yes" : "No" },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: S.surface2, borderRadius: 10, padding: 12, textAlign: "center" }}>
                  <div style={{ fontWeight: 700, color: S.accent, fontSize: 16 }}>{value}</div>
                  <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent photos */}
          {profile.recentPhotos?.length > 0 && (
            <Card style={{ padding: 20, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>📸 Recent Photos</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {profile.recentPhotos.slice(0, 8).map((photo, i) => (
                  <a key={i} href={`https://rec.net/image/${photo.ImageId}`} target="_blank" rel="noreferrer">
                    <img
                      src={`https://img.rec.net/${photo.ImageName}`}
                      alt={String(photo.ImageId)}
                      style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8, border: `1px solid ${S.border}` }}
                    />
                  </a>
                ))}
              </div>
            </Card>
          )}

          {/* Rooms */}
          {profile.rooms?.length > 0 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>🏠 Rooms ({profile.rooms.length})</h2>
              {profile.rooms.map((room, i) => (
                <Card key={i} style={{ padding: 14, marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {room.ImageName
                      ? <img src={`https://img.rec.net/${room.ImageName}`} alt={room.Name} style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover" }} />
                      : <div style={{ width: 52, height: 52, borderRadius: 10, background: `${S.accent}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏠</div>
                    }
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{room.DisplayName || room.Name}</div>
                      <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>
                        {room.Stats?.VisitsLastDay != null && `👥 ${room.Stats.VisitsLastDay} visits/day · `}
                        {room.Stats?.Cheers != null && `❤️ ${room.Stats.Cheers} cheers`}
                      </div>
                    </div>
                    <a href={`https://rec.net/rooms/${(room.Name || "").replace(/^\^/, "")}`} target="_blank" rel="noreferrer" style={{ color: S.accent }}>
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [exportData, setExportData] = useState(null);
  const [enrichData, setEnrichData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [page, setPage] = useState("gallery");

  const handleFiles = useCallback(async (files, prebuiltMap = null) => {
    if (!files?.length && !prebuiltMap) return;
    setLoading(true); setProgress("Scanning files…");
    await new Promise(r => setTimeout(r, 30));
    try {
      const data = await parseExport(files ? Array.from(files) : [], prebuiltMap);
      setProgress("Processing media…");
      await new Promise(r => setTimeout(r, 50));
      setExportData(data);
      setPage("gallery");
    } catch (e) {
      alert("Error reading export: " + e.message);
    }
    setLoading(false);
  }, []);

  const allImages = enrichData?.images || exportData?.allImages || [];

  if (loading) return <LoadingScreen progress={progress} />;
  if (!exportData) return <UploadPage onFiles={handleFiles} />;

  return (
    <div style={{ display: "flex", height: "100vh", background: S.bg, color: S.text, fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Sidebar page={page} setPage={setPage} data={exportData} enrichData={enrichData} />
      <main style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {page === "gallery"  && <GalleryPage  allImages={allImages} enrichData={enrichData} onGoRecNet={() => setPage("recnet")} />}
        {page === "timeline" && <TimelinePage allImages={allImages} enrichData={enrichData} onGoRecNet={() => setPage("recnet")} />}
        {page === "explorer" && <ExplorerPage allImages={allImages} data={exportData} enrichData={enrichData} onGoRecNet={() => setPage("recnet")} />}
        {page === "wrapped"  && <WrappedPage  allImages={allImages} data={exportData} enrichData={enrichData} />}
        {page === "recnet"   && <RecNetPage   data={exportData} enrichData={enrichData} onEnrich={setEnrichData} />}
      </main>
    </div>
  );
}
