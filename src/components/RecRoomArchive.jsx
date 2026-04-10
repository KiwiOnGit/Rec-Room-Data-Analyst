import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import {
  Upload, Image as ImageIcon, Music, Box, FileText, Clock,
  Database, Star, User, X, ChevronRight, ChevronDown, Search,
  Play, Pause, Grid, Package, Layers, Home, AlertCircle
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// FILE PARSING UTILITIES
// ─────────────────────────────────────────────────────────────

async function readText(file) {
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
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    return headers.reduce((o, h, i) => ({ ...o, [h]: vals[i] ?? "" }), {});
  });
}

async function parseExport(files) {
  const data = {
    roomName: "", roomDetails: null, roomImageUrl: null,
    subrooms: [], inventions: [],
    allImages: [], allAudio: [], allGlb: [],
    errors: [],
  };
  if (!files.length) return data;

  const byPath = {};
  for (const f of files) byPath[f.webkitRelativePath] = f;
  const paths = Object.keys(byPath);
  data.roomName = paths[0].split("/")[0];

  // Root files
  for (const p of paths.filter(p => p.split("/").length === 2)) {
    const file = byPath[p], name = p.split("/").pop();
    if (name === "RoomDetails.json") {
      try { data.roomDetails = JSON.parse(await readText(file)); } catch {}
    } else if (/^RoomImage\.(jpg|png|jpeg)/i.test(name)) {
      data.roomImageUrl = URL.createObjectURL(file);
    }
  }

  // Collect folder groups
  const subroomSet = new Set(), inventionSet = new Set();
  for (const p of paths) {
    const parts = p.split("/");
    if (parts[1]?.startsWith("SubRoom_")) subroomSet.add(parts[1]);
    if (parts[1] === "Inventions" && parts[2]?.startsWith("Invention_")) inventionSet.add(parts[2]);
  }

  // Parse subrooms
  for (const folder of subroomSet) {
    const parts = folder.split("_");
    const sr = {
      id: parts[1], name: parts.slice(2).join("_"), folder,
      metadata: null, images: [], audio: [], glb: [], csv: {}
    };
    const prefix = `${data.roomName}/${folder}/`;
    for (const p of paths.filter(p => p.startsWith(prefix))) {
      const file = byPath[p], name = p.split("/").pop();
      const rel = p.slice(prefix.length);
      if (name === "Subroom.json") {
        try { sr.metadata = JSON.parse(await readText(file)); } catch {}
      } else if (rel.startsWith("Image/") && /\.(jpg|png|jpeg)$/i.test(name)) {
        const url = URL.createObjectURL(file);
        const img = { id: name, name, url, path: p, subroom: sr.name, subroomId: sr.id, type: "subroom-image" };
        sr.images.push(img); data.allImages.push(img);
      } else if (/\.wav$/i.test(name)) {
        const url = URL.createObjectURL(file);
        const aud = { name, url, path: p, subroom: sr.name, subroomId: sr.id };
        sr.audio.push(aud); data.allAudio.push(aud);
      } else if (/\.glb$/i.test(name)) {
        const url = URL.createObjectURL(file);
        sr.glb.push({ name, url, path: p }); data.allGlb.push({ name, url, path: p, subroom: sr.name });
      } else if (name === "CV2NodeTypes.csv") {
        try { sr.csv.cv2 = parseCSV(await readText(file)); } catch {}
      } else if (name === "PrefabIds.csv") {
        try { sr.csv.prefab = parseCSV(await readText(file)); } catch {}
      }
    }
    data.subrooms.push(sr);
  }

  // Parse inventions
  for (const folder of inventionSet) {
    const parts = folder.split("_");
    const inv = {
      id: parts[1], name: parts.slice(2).join("_"), folder,
      metadata: null, details: null, version: null, imageUrl: null,
      images: [], audio: []
    };
    const prefix = `${data.roomName}/Inventions/${folder}/`;
    for (const p of paths.filter(p => p.startsWith(prefix))) {
      const file = byPath[p], name = p.split("/").pop();
      const rel = p.slice(prefix.length);
      if (name === "Invention.json") { try { inv.metadata = JSON.parse(await readText(file)); } catch {} }
      else if (name === "InventionDetails.json") { try { inv.details = JSON.parse(await readText(file)); } catch {} }
      else if (name === "InventionVersion.json") { try { inv.version = JSON.parse(await readText(file)); } catch {} }
      else if (/^InventionImage\.(jpg|png|jpeg)/i.test(name)) { inv.imageUrl = URL.createObjectURL(file); }
      else if (rel.startsWith("Image/") && /\.(jpg|png|jpeg)$/i.test(name)) {
        const url = URL.createObjectURL(file);
        const img = { id: name, name, url, path: p, invention: inv.name, inventionId: inv.id, type: "invention-image" };
        inv.images.push(img); data.allImages.push(img);
      } else if (/\.wav$/i.test(name)) {
        const url = URL.createObjectURL(file);
        inv.audio.push({ name, url, path: p }); data.allAudio.push({ name, url, path: p, invention: inv.name });
      }
    }
    data.inventions.push(inv);
  }

  return data;
}

// ─────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────

const S = {
  bg: "#0d0d14",
  surface: "#13131f",
  surface2: "#1a1a2e",
  border: "rgba(255,255,255,0.07)",
  text: "#e2e2f0",
  muted: "#5a5a7a",
  accent: "#7c5cfc",
  accent2: "#f050a0",
  gold: "#f5b942",
};

function Badge({ label, color = S.accent }) {
  return (
    <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
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
  return (
    <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, ...style }}>
      {children}
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

  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "system-ui,sans-serif", color: S.text }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎮</div>
        <h1 style={{ fontSize: 44, fontWeight: 900, margin: 0, background: `linear-gradient(135deg, ${S.accent}, ${S.accent2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Rec Room Archive
        </h1>
        <p style={{ color: S.muted, fontSize: 16, marginTop: 10, maxWidth: 420 }}>
          Upload your Rec Room export folder to explore images, audio, 3D models, and generate your Wrapped stats.
        </p>
      </div>

      <div
        onDrop={e => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${drag ? S.accent : S.border}`,
          borderRadius: 24, padding: "56px 72px", textAlign: "center", cursor: "pointer",
          background: drag ? `${S.accent}11` : S.surface, transition: "all .25s",
          maxWidth: 480, width: "100%",
        }}
      >
        <Upload size={40} color={S.accent} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Drop your export folder here</div>
        <div style={{ color: S.muted, marginBottom: 24, fontSize: 14 }}>or click to browse for the folder</div>
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
          { icon: "🖼️", label: "Image Gallery", desc: "Filter & browse all room images" },
          { icon: "✨", label: "Room Wrapped", desc: "Stats styled like Spotify Wrapped" },
          { icon: "🔍", label: "Data Explorer", desc: "Browse JSON, CSV, audio & 3D files" },
        ].map(({ icon, label, desc }) => (
          <div key={label} style={{ background: S.surface, borderRadius: 14, padding: 18, border: `1px solid ${S.border}`, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{label}</div>
            <div style={{ color: S.muted, fontSize: 12 }}>{desc}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, fontSize: 12, color: S.muted, textAlign: "center", maxWidth: 400 }}>
        All processing happens locally in your browser. No data is uploaded to any server.
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
      <div style={{ fontSize: 56, marginBottom: 20 }}>🎮</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Loading your Rec Room data…</div>
      <div style={{ color: S.accent, marginBottom: 28, fontSize: 14 }}>{progress}</div>
      <div style={{ width: 280, height: 4, background: S.surface2, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: "55%", height: "100%", background: `linear-gradient(90deg,${S.accent},${S.accent2})`, borderRadius: 4, animation: "shimmer 1.2s infinite" }} />
      </div>
      <style>{`@keyframes shimmer { 0%{width:20%} 50%{width:80%} 100%{width:20%} }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────

function Sidebar({ page, setPage, data }) {
  const nav = [
    { id: "gallery", Icon: Grid, label: "Gallery" },
    { id: "timeline", Icon: Clock, label: "Timeline" },
    { id: "explorer", Icon: Database, label: "Explorer" },
    { id: "wrapped", Icon: Star, label: "Wrapped ✨" },
    { id: "recnet", Icon: User, label: "Rec.net" },
  ];

  return (
    <aside style={{ width: 210, background: S.surface, borderRight: `1px solid ${S.border}`, padding: "20px 12px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "0 8px", marginBottom: 28 }}>
        <div style={{ fontSize: 17, fontWeight: 900, background: `linear-gradient(135deg,${S.accent},${S.accent2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          🎮 RR Archive
        </div>
        <div style={{ fontSize: 11, color: S.muted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.roomName}</div>
      </div>

      <nav style={{ flex: 1 }}>
        {nav.map(({ id, Icon, label }) => {
          const active = page === id;
          return (
            <button key={id} onClick={() => setPage(id)} style={{
              display: "flex", alignItems: "center", gap: 9, width: "100%",
              padding: "9px 12px", borderRadius: 10, border: "none", cursor: "pointer",
              marginBottom: 2, background: active ? `${S.accent}22` : "transparent",
              color: active ? S.accent : S.muted, fontWeight: active ? 700 : 400,
              fontSize: 13, transition: "all .15s", textAlign: "left",
            }}>
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </nav>

      <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 14, fontSize: 11, color: S.muted, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[
          { v: data.allImages.length, l: "images" },
          { v: data.subrooms.length, l: "subrooms" },
          { v: data.inventions.length, l: "inventions" },
          { v: data.allAudio.length, l: "audio" },
        ].map(({ v, l }) => (
          <div key={l} style={{ background: S.surface2, borderRadius: 8, padding: "6px 8px" }}>
            <div style={{ fontWeight: 700, color: S.text, fontSize: 14 }}>{v}</div>
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

function GalleryPage({ data }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(0);
  const PER_PAGE = 60;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.allImages.filter(img => {
      const matchSearch = !q ||
        img.name.toLowerCase().includes(q) ||
        (img.subroom || "").toLowerCase().includes(q) ||
        (img.invention || "").toLowerCase().includes(q);
      const matchFilter =
        filter === "all" ? true :
        filter === "subroom" ? img.type === "subroom-image" :
        filter === "invention" ? img.type === "invention-image" :
        img.subroom === filter || img.invention === filter;
      return matchSearch && matchFilter;
    });
  }, [data.allImages, search, filter]);

  const pages = Math.ceil(filtered.length / PER_PAGE);
  const visible = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px" }}>Image Gallery</h1>
        <div style={{ color: S.muted, fontSize: 13 }}>{filtered.length} of {data.allImages.length} images</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: S.muted }} />
          <input
            placeholder="Search…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            style={{ width: "100%", padding: "9px 9px 9px 32px", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, color: S.text, fontSize: 13, boxSizing: "border-box", outline: "none" }}
          />
        </div>
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}
          style={{ padding: "9px 12px", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, color: S.text, fontSize: 13 }}>
          <option value="all">All Sources</option>
          <option value="subroom">Subrooms Only</option>
          <option value="invention">Inventions Only</option>
          {data.subrooms.map(s => <option key={s.id} value={s.name}>{s.name || "Unnamed"}</option>)}
        </select>
      </div>

      {visible.length === 0
        ? <EmptyState emoji="🖼️" title="No images found" sub={data.allImages.length === 0 ? "Your export doesn't contain any image files in the expected paths." : "Try a different search or filter."} />
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
            {visible.map((img, i) => (
              <div key={i} onClick={() => setSelected(img)} style={{ borderRadius: 12, overflow: "hidden", cursor: "pointer", background: S.surface, border: `1px solid ${S.border}`, transition: "transform .2s" }}
                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                <img src={img.url} alt={img.name} loading="lazy" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: S.accent, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {img.subroom || img.invention || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: S.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name}</div>
                </div>
              </div>
            ))}
          </div>
      }

      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
          {Array.from({ length: pages }).map((_, i) => (
            <button key={i} onClick={() => setPage(i)} style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${i === page ? S.accent : S.border}`,
              background: i === page ? `${S.accent}22` : "transparent", color: i === page ? S.accent : S.muted,
              cursor: "pointer", fontSize: 13, fontWeight: i === page ? 700 : 400,
            }}>{i + 1}</button>
          ))}
        </div>
      )}

      {selected && <ImageModal img={selected} onClose={() => setSelected(null)} data={data} />}
    </div>
  );
}

function ImageModal({ img, onClose, data }) {
  const idx = data.allImages.indexOf(img);
  const prev = idx > 0 ? () => {} : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: S.surface, borderRadius: 20, overflow: "hidden", maxWidth: 820, width: "100%", border: `1px solid ${S.border}`, display: "flex", flexDirection: "column" }}>
        <img src={img.url} alt={img.name} style={{ width: "100%", maxHeight: 460, objectFit: "contain", background: S.bg }} />
        <div style={{ padding: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{img.name}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Badge label={img.type === "subroom-image" ? "Subroom Image" : "Invention Image"} color={S.accent} />
              {img.subroom && <Badge label={`📍 ${img.subroom}`} color="#059669" />}
              {img.invention && <Badge label={`⚙️ ${img.invention}`} color={S.accent2} />}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: S.muted, fontFamily: "monospace", wordBreak: "break-all" }}>{img.path}</div>
          </div>
          <button onClick={onClose} style={{ background: `rgba(255,255,255,.08)`, border: "none", borderRadius: 8, padding: 8, cursor: "pointer", color: S.text, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TIMELINE PAGE
// ─────────────────────────────────────────────────────────────

function TimelinePage({ data }) {
  const events = useMemo(() => {
    const evts = [];
    const tryDate = (...keys) => {
      for (const k of keys) if (k) { const d = new Date(k); if (!isNaN(d)) return d; }
      return null;
    };
    data.subrooms.forEach(sr => {
      const m = sr.metadata;
      const date = tryDate(m?.createdAt, m?.created_at, m?.lastModifiedAt, m?.modified_at, m?.timestamp);
      evts.push({ type: "subroom", name: sr.name || "Unnamed Subroom", date, metadata: sr.metadata, icon: "🏠", color: S.accent, stats: `${sr.images.length} images · ${sr.audio.length} audio · ${sr.glb.length} 3D` });
    });
    data.inventions.forEach(inv => {
      const m = inv.metadata || inv.details;
      const date = tryDate(m?.created, m?.createdAt, m?.created_at, inv.version?.created);
      evts.push({ type: "invention", name: inv.name || "Unnamed Invention", date, metadata: inv.metadata, icon: "⚙️", color: S.accent2, stats: `${inv.images.length} images · ${inv.audio.length} audio` });
    });
    return evts.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  }, [data]);

  const hasDates = events.some(e => e.date);

  return (
    <div style={{ padding: 28, overflowY: "auto", maxWidth: 720 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px" }}>Timeline</h1>
      <p style={{ color: S.muted, fontSize: 13, marginBottom: 28 }}>
        {hasDates ? "Chronological history from your export metadata" : "No date metadata found — showing all items"}
      </p>

      {events.length === 0
        ? <EmptyState emoji="⏰" title="No items found" />
        : (
          <div style={{ position: "relative", paddingLeft: 24 }}>
            <div style={{ position: "absolute", left: 11, top: 0, bottom: 0, width: 2, background: `${S.accent}33`, borderRadius: 2 }} />
            {events.map((evt, i) => (
              <div key={i} style={{ display: "flex", gap: 20, marginBottom: 18, position: "relative" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: evt.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, zIndex: 1, border: `3px solid ${S.bg}`, position: "absolute", left: -31 }}>
                  {evt.icon}
                </div>
                <Card style={{ flex: 1, padding: 18, marginLeft: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{evt.name}</div>
                    <Badge label={evt.type} color={evt.color} />
                  </div>
                  <div style={{ fontSize: 12, color: evt.date ? S.muted : "#4a4a6a", marginBottom: 6 }}>
                    {evt.date ? `📅 ${evt.date.toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}` : "📅 Date not available"}
                  </div>
                  <div style={{ fontSize: 12, color: S.muted }}>{evt.stats}</div>
                  {evt.metadata && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 11, color: S.muted, cursor: "pointer" }}>View raw metadata</summary>
                      <pre style={{ fontSize: 10, color: "#6060a0", marginTop: 6, overflow: "auto", maxHeight: 120, background: S.surface2, padding: 10, borderRadius: 8 }}>
                        {JSON.stringify(evt.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </Card>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EXPLORER PAGE
// ─────────────────────────────────────────────────────────────

function TreeFolder({ label, expanded, onToggle, depth = 0 }) {
  return (
    <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", paddingLeft: 8 + depth * 14, cursor: "pointer", borderRadius: 8, color: S.muted, fontSize: 12, userSelect: "none" }}
      onMouseEnter={e => e.currentTarget.style.background = `rgba(255,255,255,.04)`}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      📁 {label}
    </div>
  );
}

function TreeLeaf({ label, icon, onClick, active, depth = 0 }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", paddingLeft: 8 + depth * 14, cursor: "pointer", borderRadius: 8, fontSize: 12, color: active ? S.accent : S.muted, background: active ? `${S.accent}18` : "transparent", userSelect: "none" }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = `rgba(255,255,255,.04)`; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      <span style={{ width: 14 }} />{icon} {label}
    </div>
  );
}

function ExplorerPage({ data }) {
  const [exp, setExp] = useState({ subrooms: true });
  const [sel, setSel] = useState(null);
  const toggle = k => setExp(p => ({ ...p, [k]: !p[k] }));

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 260, padding: 16, borderRight: `1px solid ${S.border}`, overflowY: "auto", flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, paddingLeft: 8 }}>📁 {data.roomName || "Export"}</div>

        {data.roomDetails && <TreeLeaf label="RoomDetails.json" icon="📄" onClick={() => setSel({ type: "json", label: "Room Details", payload: data.roomDetails })} active={sel?.label === "Room Details"} />}

        <TreeFolder label={`Subrooms (${data.subrooms.length})`} expanded={exp.subrooms} onToggle={() => toggle("subrooms")} />
        {exp.subrooms && data.subrooms.map(sr => (
          <div key={sr.id}>
            <TreeFolder label={sr.name || sr.folder} expanded={exp[`sr_${sr.id}`]} onToggle={() => toggle(`sr_${sr.id}`)} depth={1} />
            {exp[`sr_${sr.id}`] && <>
              {sr.metadata && <TreeLeaf label="Subroom.json" icon="📄" depth={2} onClick={() => setSel({ type: "json", label: `${sr.name} — metadata`, payload: sr.metadata })} active={sel?.label === `${sr.name} — metadata`} />}
              {sr.images.length > 0 && <TreeLeaf label={`Images (${sr.images.length})`} icon="🖼️" depth={2} onClick={() => setSel({ type: "images", label: `${sr.name} images`, payload: sr.images })} active={sel?.label === `${sr.name} images`} />}
              {sr.audio.length > 0 && <TreeLeaf label={`Audio (${sr.audio.length})`} icon="🎵" depth={2} onClick={() => setSel({ type: "audio", label: `${sr.name} audio`, payload: sr.audio })} active={sel?.label === `${sr.name} audio`} />}
              {sr.glb.length > 0 && <TreeLeaf label={`3D Models (${sr.glb.length})`} icon="📦" depth={2} onClick={() => setSel({ type: "glb", label: `${sr.name} models`, payload: sr.glb })} active={sel?.label === `${sr.name} models`} />}
              {sr.csv.cv2 && <TreeLeaf label="CV2NodeTypes.csv" icon="📊" depth={2} onClick={() => setSel({ type: "csv", label: "CV2 Node Types", payload: sr.csv.cv2 })} active={sel?.label === "CV2 Node Types"} />}
              {sr.csv.prefab && <TreeLeaf label="PrefabIds.csv" icon="📊" depth={2} onClick={() => setSel({ type: "csv", label: "Prefab IDs", payload: sr.csv.prefab })} active={sel?.label === "Prefab IDs"} />}
            </>}
          </div>
        ))}

        {data.inventions.length > 0 && <>
          <TreeFolder label={`Inventions (${data.inventions.length})`} expanded={exp.inventions} onToggle={() => toggle("inventions")} />
          {exp.inventions && data.inventions.map(inv => (
            <div key={inv.id}>
              <TreeFolder label={inv.name || inv.folder} expanded={exp[`inv_${inv.id}`]} onToggle={() => toggle(`inv_${inv.id}`)} depth={1} />
              {exp[`inv_${inv.id}`] && <>
                {inv.metadata && <TreeLeaf label="Invention.json" icon="📄" depth={2} onClick={() => setSel({ type: "json", label: `${inv.name} — meta`, payload: inv.metadata })} active={sel?.label === `${inv.name} — meta`} />}
                {inv.details && <TreeLeaf label="InventionDetails.json" icon="📄" depth={2} onClick={() => setSel({ type: "json", label: `${inv.name} — details`, payload: inv.details })} active={sel?.label === `${inv.name} — details`} />}
                {inv.images.length > 0 && <TreeLeaf label={`Images (${inv.images.length})`} icon="🖼️" depth={2} onClick={() => setSel({ type: "images", label: `${inv.name} images`, payload: inv.images })} active={sel?.label === `${inv.name} images`} />}
                {inv.audio.length > 0 && <TreeLeaf label={`Audio (${inv.audio.length})`} icon="🎵" depth={2} onClick={() => setSel({ type: "audio", label: `${inv.name} audio`, payload: inv.audio })} active={sel?.label === `${inv.name} audio`} />}
              </>}
            </div>
          ))}
        </>}
      </div>

      <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        {!sel ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 280, color: S.muted }}>
            <Database size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div style={{ fontSize: 14 }}>Select an item from the tree to preview</div>
          </div>
        ) : sel.type === "json" ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: S.text }}>📄 {sel.label}</h2>
            <pre style={{ background: S.surface2, borderRadius: 12, padding: 18, fontSize: 12, color: "#9090d0", border: `1px solid ${S.border}`, overflow: "auto", maxHeight: "calc(100vh - 200px)", lineHeight: 1.6 }}>
              {JSON.stringify(sel.payload, null, 2)}
            </pre>
          </>
        ) : sel.type === "csv" ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: S.text }}>📊 {sel.label} <span style={{ fontSize: 12, color: S.muted, fontWeight: 400 }}>({sel.payload.length} rows)</span></h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {sel.payload[0] && Object.keys(sel.payload[0]).map(k => (
                      <th key={k} style={{ padding: "8px 12px", background: `${S.accent}22`, color: S.accent, textAlign: "left", borderBottom: `1px solid ${S.border}`, whiteSpace: "nowrap" }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sel.payload.slice(0, 200).map((row, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${S.border}` }}>
                      {Object.values(row).map((v, j) => (
                        <td key={j} style={{ padding: "6px 12px", color: S.muted }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {sel.payload.length > 200 && <div style={{ color: S.muted, marginTop: 8, fontSize: 11 }}>Showing 200 of {sel.payload.length} rows</div>}
            </div>
          </>
        ) : sel.type === "images" ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: S.text }}>🖼️ {sel.label}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }}>
              {sel.payload.map((img, i) => (
                <img key={i} src={img.url} alt={img.name} loading="lazy" title={img.name} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 8, border: `1px solid ${S.border}` }} />
              ))}
            </div>
          </>
        ) : sel.type === "audio" ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: S.text }}>🎵 {sel.label}</h2>
            {sel.payload.map((a, i) => (
              <Card key={i} style={{ padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{a.name}</div>
                <audio controls src={a.url} style={{ width: "100%", height: 36 }} />
              </Card>
            ))}
          </>
        ) : sel.type === "glb" ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: S.text }}>📦 {sel.label}</h2>
            {sel.payload.map((g, i) => (
              <Card key={i} style={{ padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</div>
                <div style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>GLB 3D model — downloadable below</div>
                <a href={g.url} download={g.name} style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: S.accent }}>⬇ Download {g.name}</a>
              </Card>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WRAPPED PAGE
// ─────────────────────────────────────────────────────────────

const PIE_COLORS = ["#7c5cfc", "#f050a0", "#22d3ee", "#f5b942", "#4ade80", "#f97316"];

function WrappedPage({ data }) {
  const [step, setStep] = useState(0);

  const stats = useMemo(() => {
    const mostActive = data.subrooms.reduce((b, s) => s.images.length > (b?.images.length || -1) ? s : b, null);
    const mostInvented = data.inventions.reduce((b, inv) => (inv.details?.cheers || 0) > (b?.details?.cheers || -1) ? inv : b, null);
    const bySubroom = data.subrooms.map(s => ({ name: (s.name || "?").slice(0, 14), images: s.images.length, audio: s.audio.length }));
    const pieData = [
      { name: "Subroom imgs", value: data.subrooms.reduce((a, s) => a + s.images.length, 0) },
      { name: "Invention imgs", value: data.inventions.reduce((a, inv) => a + inv.images.length, 0) },
    ].filter(d => d.value > 0);
    return { mostActive, mostInvented, bySubroom, pieData };
  }, [data]);

  const slides = [
    {
      bg: "linear-gradient(145deg,#1a0835,#2a0d55,#0d1a40)",
      render: () => (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎮</div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,.6)", marginBottom: 6 }}>Your</div>
          <div style={{ fontSize: 58, fontWeight: 900, lineHeight: 1, letterSpacing: -1 }}>Rec Room</div>
          <div style={{ fontSize: 58, fontWeight: 900, color: S.gold, lineHeight: 1.1, letterSpacing: -1 }}>Wrapped</div>
          <div style={{ marginTop: 20, color: "rgba(255,255,255,.5)", fontSize: 14 }}>{data.roomName}</div>
          <div style={{ marginTop: 8, color: "rgba(255,255,255,.3)", fontSize: 12 }}>Before the lights go out, here's your story.</div>
        </div>
      )
    },
    {
      bg: "linear-gradient(145deg,#1a0030,#500070,#200050)",
      render: () => (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginBottom: 6 }}>You captured</div>
          <div style={{ fontSize: 110, fontWeight: 900, color: S.gold, lineHeight: 0.9, letterSpacing: -4 }}>
            {data.allImages.length}
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>Images</div>
          <div style={{ marginTop: 14, color: "rgba(255,255,255,.5)", fontSize: 14 }}>moments saved forever</div>
          <div style={{ fontSize: 52, marginTop: 16 }}>📸</div>
        </div>
      )
    },
    {
      bg: "linear-gradient(145deg,#002535,#005070,#001530)",
      render: () => (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 52 }}>🏠</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: 12 }}>You built</div>
          <div style={{ fontSize: 100, fontWeight: 900, color: "#22d3ee", lineHeight: 0.9, letterSpacing: -3 }}>{data.subrooms.length}</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>Subrooms</div>
          {stats.mostActive && (
            <div style={{ marginTop: 16, background: "rgba(255,255,255,.08)", borderRadius: 14, padding: "10px 20px", display: "inline-block" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Most active</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#22d3ee" }}>{stats.mostActive.name || "—"}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>{stats.mostActive.images.length} images</div>
            </div>
          )}
        </div>
      )
    },
    {
      bg: "linear-gradient(145deg,#35000a,#700020,#200010)",
      render: () => (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 52 }}>⚙️</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: 12 }}>You invented</div>
          <div style={{ fontSize: 100, fontWeight: 900, color: S.accent2, lineHeight: 0.9, letterSpacing: -3 }}>{data.inventions.length}</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>Inventions</div>
          <div style={{ marginTop: 14, color: "rgba(255,255,255,.5)", fontSize: 14 }}>creations that lived in your world</div>
        </div>
      )
    },
    {
      bg: "linear-gradient(145deg,#003518,#007040,#001525)",
      render: () => (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 52 }}>🎵</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: 12 }}>You recorded</div>
          <div style={{ fontSize: 100, fontWeight: 900, color: "#4ade80", lineHeight: 0.9, letterSpacing: -3 }}>{data.allAudio.length}</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>Audio Clips</div>
          {data.allGlb.length > 0 && (
            <div style={{ marginTop: 12, color: "rgba(255,255,255,.5)", fontSize: 13 }}>
              + {data.allGlb.length} 3D models in your rooms
            </div>
          )}
        </div>
      )
    },
    {
      bg: "linear-gradient(145deg,#1a1500,#3a3000,#0f0a00)",
      render: () => (
        <div style={{ width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 20, fontSize: 22, fontWeight: 900 }}>Images by Subroom</div>
          {stats.bySubroom.length === 0
            ? <div style={{ textAlign: "center", color: "rgba(255,255,255,.4)" }}>No subroom data</div>
            : <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.bySubroom} margin={{ left: 0, right: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,.6)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,.6)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#1a1030", border: "none", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="images" name="Images" fill={S.gold} radius={[4,4,0,0]} />
                  <Bar dataKey="audio" name="Audio" fill="#22d3ee" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
      )
    },
    {
      bg: "linear-gradient(145deg,#0d0d14,#1a0a2e,#0a1628)",
      render: () => (
        <div style={{ textAlign: "center", width: "100%" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌟</div>
          <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 20 }}>Your Legacy</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, textAlign: "left" }}>
            {[
              { icon: "📸", label: "Total Images", value: data.allImages.length, color: S.accent },
              { icon: "🏠", label: "Subrooms", value: data.subrooms.length, color: "#22d3ee" },
              { icon: "⚙️", label: "Inventions", value: data.inventions.length, color: S.accent2 },
              { icon: "🎵", label: "Audio Clips", value: data.allAudio.length, color: "#4ade80" },
              { icon: "📦", label: "3D Models", value: data.allGlb.length, color: S.gold },
              { icon: "📄", label: "JSON Files", value: (data.subrooms.filter(s => s.metadata).length + data.inventions.filter(i => i.metadata).length + (data.roomDetails ? 1 : 0)), color: "#f97316" },
            ].map(({ icon, label, value, color }) => (
              <div key={label} style={{ background: "rgba(255,255,255,.06)", borderRadius: 14, padding: 16, border: "1px solid rgba(255,255,255,.08)" }}>
                <div style={{ fontSize: 22 }}>{icon}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, color: "rgba(255,255,255,.5)", fontSize: 13 }}>
            Thank you for being part of Rec Room 🎮
          </div>
        </div>
      )
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", overflow: "hidden", fontFamily: "system-ui,sans-serif" }}>
      {/* Dot indicators */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, zIndex: 10 }}>
        {slides.map((_, i) => (
          <div key={i} onClick={() => setStep(i)} style={{ width: i === step ? 22 : 6, height: 6, borderRadius: 3, background: i === step ? "white" : "rgba(255,255,255,.25)", cursor: "pointer", transition: "all .3s" }} />
        ))}
      </div>

      {/* Slide area */}
      <div key={step} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: slides[step].bg, padding: "48px 40px 24px", transition: "background .5s", overflowY: "auto" }}>
        <div style={{ maxWidth: 480, width: "100%", color: "white" }}>
          {slides[step].render()}
        </div>
      </div>

      {/* Nav buttons */}
      <div style={{ padding: "14px 24px", background: "rgba(0,0,0,.4)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
          style={{ padding: "8px 22px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.08)", color: step === 0 ? "rgba(255,255,255,.25)" : "white", cursor: step === 0 ? "default" : "pointer", fontWeight: 700, fontSize: 13 }}>
          ← Prev
        </button>
        <span style={{ color: "rgba(255,255,255,.3)", fontSize: 12 }}>{step + 1} / {slides.length}</span>
        <button onClick={() => setStep(Math.min(slides.length - 1, step + 1))} disabled={step === slides.length - 1}
          style={{ padding: "8px 22px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.08)", color: step === slides.length - 1 ? "rgba(255,255,255,.25)" : "white", cursor: step === slides.length - 1 ? "default" : "pointer", fontWeight: 700, fontSize: 13 }}>
          Next →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REC.NET PAGE
// ─────────────────────────────────────────────────────────────

function RecNetPage({ data }) {
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    const u = username.trim();
    if (!u) return;
    setLoading(true); setError(""); setProfile(null);
    try {
      const res = await fetch(`https://accounts.rec.net/account?username=${encodeURIComponent(u)}`);
      if (!res.ok) throw new Error("Account not found (HTTP " + res.status + ")");
      const account = await res.json();
      const [roomsR] = await Promise.allSettled([
        fetch(`https://rooms.rec.net/rooms/ownedby/${account.accountId}?take=20`)
      ]);
      const rooms = roomsR.status === "fulfilled" && roomsR.value.ok ? await roomsR.value.json() : [];
      setProfile({ account, rooms });
    } catch (e) {
      setError(e.message || "Unable to reach Rec.net API.");
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: 28, maxWidth: 680, overflowY: "auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px" }}>Rec.net Profile</h1>
      <p style={{ color: S.muted, fontSize: 13, marginBottom: 24 }}>Look up a Rec.net profile while the API is still accessible.</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Enter username…"
          style={{ flex: 1, padding: "11px 14px", background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, color: S.text, fontSize: 14, outline: "none" }} />
        <button onClick={search} disabled={loading}
          style={{ padding: "11px 22px", background: `linear-gradient(135deg,${S.accent},${S.accent2})`, border: "none", borderRadius: 12, color: "white", fontWeight: 700, cursor: loading ? "wait" : "pointer", fontSize: 14 }}>
          {loading ? "…" : "Search"}
        </button>
      </div>

      {error && (
        <Card style={{ padding: 16, marginBottom: 20, borderColor: "rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertCircle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ color: "#fca5a5", fontWeight: 600, marginBottom: 4 }}>{error}</div>
              <div style={{ fontSize: 12, color: S.muted }}>
                Rec.net may block browser requests due to CORS policies, or the service may be offline. 
                Try visiting <a href="https://rec.net" style={{ color: S.accent }}>rec.net</a> directly.
              </div>
            </div>
          </div>
        </Card>
      )}

      {profile && (
        <>
          <Card style={{ padding: 22, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
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

          {profile.rooms?.length > 0 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>🏠 Rooms ({profile.rooms.length})</h2>
              {profile.rooms.map((room, i) => (
                <Card key={i} style={{ padding: 14, marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {room.imageUrl
                      ? <img src={`https://img.rec.net/${room.imageUrl}`} alt={room.name} style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover" }} />
                      : <div style={{ width: 52, height: 52, borderRadius: 10, background: `${S.accent}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏠</div>
                    }
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{room.name || room.Name}</div>
                      <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>
                        {room.stats?.visitsLastDay != null && `👥 ${room.stats.visitsLastDay} visits/day · `}
                        {room.stats?.cheers != null && `❤️ ${room.stats.cheers} cheers`}
                      </div>
                    </div>
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
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [page, setPage] = useState("gallery");

  const handleFiles = useCallback(async (files) => {
    if (!files?.length) return;
    setLoading(true);
    setProgress("Scanning folder structure…");
    await new Promise(r => setTimeout(r, 30));
    setProgress("Parsing JSON metadata…");
    await new Promise(r => setTimeout(r, 30));
    try {
      const data = await parseExport(Array.from(files));
      setProgress("Processing media files…");
      await new Promise(r => setTimeout(r, 50));
      setExportData(data);
      setPage("gallery");
    } catch (e) {
      alert("Error reading export: " + e.message);
    }
    setLoading(false);
  }, []);

  if (loading) return <LoadingScreen progress={progress} />;

  if (!exportData) return <UploadPage onFiles={handleFiles} />;

  return (
    <div style={{ display: "flex", height: "100vh", background: S.bg, color: S.text, fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      <Sidebar page={page} setPage={setPage} data={exportData} />
      <main style={{ flex: 1, overflow: "auto" }}>
        {page === "gallery"  && <GalleryPage  data={exportData} />}
        {page === "timeline" && <TimelinePage data={exportData} />}
        {page === "explorer" && <ExplorerPage data={exportData} />}
        {page === "wrapped"  && <WrappedPage  data={exportData} />}
        {page === "recnet"   && <RecNetPage   data={exportData} />}
      </main>
    </div>
  );
}
