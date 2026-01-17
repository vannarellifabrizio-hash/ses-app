import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * SES App (Supabase)
 * FIX "cursore esce dal campo":
 * - FocusKeeper: salva l'input attivo + posizione del cursore
 * - dopo ogni render ripristina focus e caret
 */

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const clamp10 = (arr) => arr.slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);

function fmtDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("it-IT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function toISODateOnly(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function daysDiffFromNow(iso) {
  if (!iso) return 9999;
  const now = new Date();
  const d = new Date(iso);
  const ms = now.getTime() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
function statusColorByDays(days) {
  if (days <= 7) return "#16a34a";
  if (days <= 10) return "#f59e0b";
  return "#dc2626";
}
function isPastEndDate(endDateStr) {
  if (!endDateStr) return false;
  const end = new Date(endDateStr + "T23:59:59");
  return new Date() > end;
}

const styles = {
  page: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", padding: 16, maxWidth: 1100, margin: "0 auto" },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 },
  h1: { margin: 0, fontSize: 20 },
  card: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "white" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 },
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  btn: { border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", background: "#111827", color: "white", cursor: "pointer" },
  btn2: { border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", background: "white", cursor: "pointer" },
  btnDanger: { border: "1px solid #fecaca", borderRadius: 10, padding: "8px 10px", background: "#fee2e2", cursor: "pointer" },
  input: { border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", width: "100%" },
  select: { border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", width: "100%" },
  small: { fontSize: 12, color: "#6b7280" },
  badge: { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 999, border: "1px solid #e5e7eb", fontSize: 12 },
  dot: (c) => ({ width: 10, height: 10, borderRadius: 3, background: c, display: "inline-block" }),
};

function SectionTitle({ title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      {right}
    </div>
  );
}
function Pill({ color, label }) {
  return (
    <span style={styles.badge}>
      <span style={styles.dot(color)} />
      <span>{label}</span>
    </span>
  );
}

/**
 * FocusKeeper:
 * - Assegniamo data-fid a input/select/textarea
 * - Salviamo (fid, selectionStart/End) su focus + input
 * - Dopo ogni render, se quel fid esiste ancora, ripristiniamo focus e caret
 */
function useFocusKeeper() {
  const last = useRef({ fid: null, start: null, end: null });
  const raf = useRef(null);

  const capture = (el) => {
    const fid = el?.getAttribute?.("data-fid");
    if (!fid) return;
    let start = null;
    let end = null;
    try {
      if (typeof el.selectionStart === "number") start = el.selectionStart;
      if (typeof el.selectionEnd === "number") end = el.selectionEnd;
    } catch {}
    last.current = { fid, start, end };
  };
// --- FIX HARD: evita che il focus "cada" su BODY mentre stai scrivendo ---
useEffect(() => {
  const onFocusOut = (e) => {
    const el = e.target;
    if (!el) return;

    const isTypingField =
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable;

    if (!isTypingField) return;

    // Se dopo il focusout l'activeElement diventa BODY, ripristina focus sul campo
    setTimeout(() => {
      if (document.activeElement === document.body) {
        try {
          el.focus({ preventScroll: true });
        } catch {
          try { el.focus(); } catch {}
        }
        // ripristina caret (se possibile)
        try {
          if (typeof el.selectionStart === "number") {
            const pos = el.selectionStart;
            el.setSelectionRange(pos, pos);
          }
        } catch {}
      }
    }, 0);
  };

  document.addEventListener("focusout", onFocusOut, true);
  return () => document.removeEventListener("focusout", onFocusOut, true);
}, []);

  useEffect(() => {
    const onFocusIn = (e) => capture(e.target);
    const onInput = (e) => capture(e.target);

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("input", onInput, true);

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("input", onInput, true);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  // Chiama questa funzione dopo ogni render “importante”
  const restore = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const { fid, start, end } = last.current;
      if (!fid) return;
      const el = document.querySelector(`[data-fid="${CSS.escape(fid)}"]`);
      if (!el) return;
      if (document.activeElement === el) return;

      try {
        el.focus({ preventScroll: true });
      } catch {
        try { el.focus(); } catch {}
      }
      try {
        if (typeof start === "number" && typeof end === "number" && typeof el.setSelectionRange === "function") {
          el.setSelectionRange(start, end);
        }
      } catch {}
    });
  };

  return { restore };
}

// Input wrapper con data-fid
function FInput({ fid, style, ...props }) {
  return <input data-fid={fid} style={{ ...styles.input, ...style }} {...props} />;
}
function FSelect({ fid, style, children, ...props }) {
  return (
    <select data-fid={fid} style={{ ...styles.select, ...style }} {...props}>
      {children}
    </select>
  );
}

/** Activity item */
function ActivityItem({ a, allowEdit, profilesById, editActId, editActText, setEditActId, setEditActText, onUpdate, onDelete }) {
  const user = profilesById.get(a.user_id);
  const name = user?.name || user?.email || "—";
  const color = user?.color || "#111111";
  const isEditing = editActId === a.id;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0", borderBottom: "1px dashed #e5e7eb" }}>
      <div style={{ width: 18, paddingTop: 2 }}>•</div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, lineHeight: 1.3 }}>
          <span style={{ fontWeight: 700, color }}>{name}</span>
          <span style={{ color: "#6b7280" }}> — {fmtDateTime(a.created_at)}</span>
        </div>

        {!isEditing && <div style={{ marginTop: 4, fontSize: 13, color: "#111827" }}>{a.text}</div>}

        {isEditing && (
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
            <FInput fid={`act-edit-${a.id}`} value={editActText} onChange={(e) => setEditActText(e.target.value)} />
            <button style={styles.btn} onClick={() => onUpdate(a.id)}>Salva</button>
            <button style={styles.btn2} onClick={() => { setEditActId(null); setEditActText(""); }}>Annulla</button>
          </div>
        )}
      </div>

      {allowEdit && !isEditing && (
        <div style={{ display: "flex", gap: 6 }}>
          <button style={styles.btn2} onClick={() => { setEditActId(a.id); setEditActText(a.text); }}>
            Modifica
          </button>
          <button style={styles.btnDanger} onClick={() => onDelete(a.id)}>Elimina</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("home"); // home | auth | admin | collab | dashboard
  const [intent, setIntent] = useState(null);
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authError, setAuthError] = useState("");

  const [profiles, setProfiles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activities, setActivities] = useState([]);

  const [expandedProjects, setExpandedProjects] = useState({});
  const [newProj, setNewProj] = useState({ title: "", subtitle: "", start_date: toISODateOnly(new Date()), end_date: toISODateOnly(new Date()) });
  const [renameProj, setRenameProj] = useState({ id: "", title: "", subtitle: "" });
  const [editProfile, setEditProfile] = useState({ id: "", name: "", color: "#111111", role: "collab" });

  const [draftByProject, setDraftByProject] = useState({});
  const [editActId, setEditActId] = useState(null);
  const [editActText, setEditActText] = useState("");

  const [fProject, setFProject] = useState("all");
  const [fUser, setFUser] = useState("all");
  const [fPeriod, setFPeriod] = useState("all");
  const [fFrom, setFFrom] = useState(toISODateOnly(new Date(Date.now() - 7 * 86400000)));
  const [fTo, setFTo] = useState(toISODateOnly(new Date()));

  const mounted = useRef(false);
  const focusKeeper = useFocusKeeper();

  // ripristina focus dopo OGNI render (workaround forte ma efficace)
  useEffect(() => {
    focusKeeper.restore();
  });

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted.current) return;
      setSession(data.session || null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => {
      mounted.current = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!session?.user?.id) {
        setProfile(null);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,name,color,role,created_at")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error(error);
        setProfile(null);
        return;
      }
      setProfile(data || null);
    })();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    if (view !== "auth") return;
    if (!profile) return;

    const wanted = intent;
    if (!wanted) {
      setView(profile.role === "admin" ? "admin" : profile.role === "dashboard" ? "dashboard" : "collab");
      return;
    }
    if (profile.role !== wanted) {
      setAuthError(`Questo utente è ruolo "${profile.role}". Hai selezionato "${wanted}". Cambia sezione o usa un altro account.`);
      return;
    }
    setAuthError("");
    setView(wanted === "admin" ? "admin" : wanted === "dashboard" ? "dashboard" : "collab");
  }, [session, profile, view, intent]);

  async function refreshAll() {
    if (!session) return;

    const p1 = supabase.from("projects").select("*").order("title", { ascending: true });
    const p2 = supabase.from("profiles").select("id,email,name,color,role,created_at").order("name", { ascending: true });
    const p3 = supabase.from("activities").select("id,project_id,user_id,created_at,text").order("created_at", { ascending: false });

    const [rProjects, rProfiles, rActs] = await Promise.all([p1, p2, p3]);
    if (rProjects.error) console.error(rProjects.error);
    if (rProfiles.error) console.error(rProfiles.error);
    if (rActs.error) console.error(rActs.error);

    setProjects(rProjects.data || []);
    setProfiles(rProfiles.data || []);
    setActivities(rActs.data || []);
  }

  useEffect(() => {
    if (!session || !profile) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, profile?.role]);

  const meId = profile?.id || null;

  const profilesById = useMemo(() => {
    const m = new Map();
    (profiles || []).forEach((p) => m.set(p.id, p));
    if (profile?.id && !m.has(profile.id)) m.set(profile.id, profile);
    return m;
  }, [profiles, profile]);

  const projectById = useMemo(() => {
    const m = new Map();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const activitiesByProject = useMemo(() => {
    const m = new Map();
    for (const a of activities) {
      if (!m.has(a.project_id)) m.set(a.project_id, []);
      m.get(a.project_id).push(a);
    }
    return m;
  }, [activities]);

  function toggleExpand(projectId) {
    setExpandedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  }

  async function doLogin() {
    setAuthError("");
    const email = authEmail.trim();
    const password = authPass;
    if (!email || !password) {
      setAuthError("Inserisci email e password.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  }

  async function doLogout() {
    await supabase.auth.signOut();
    setIntent(null);
    setView("home");
    setAuthEmail("");
    setAuthPass("");
    setAuthError("");
    setExpandedProjects({});
  }

  async function createProject() {
    if (!newProj.title.trim()) return alert("Titolo obbligatorio");
    const payload = {
      title: newProj.title.trim(),
      subtitle: newProj.subtitle.trim() || null,
      start_date: newProj.start_date,
      end_date: newProj.end_date,
    };
    const { error } = await supabase.from("projects").insert(payload);
    if (error) return alert(error.message);
    setNewProj({ title: "", subtitle: "", start_date: toISODateOnly(new Date()), end_date: toISODateOnly(new Date()) });
    await refreshAll();
  }

  async function updateProject() {
    if (!renameProj.id) return;
    const { error } = await supabase
      .from("projects")
      .update({ title: renameProj.title.trim(), subtitle: renameProj.subtitle.trim() || null })
      .eq("id", renameProj.id);
    if (error) return alert(error.message);
    setRenameProj({ id: "", title: "", subtitle: "" });
    await refreshAll();
  }

  async function deleteProject(id) {
    if (!confirm("Eliminare progetto? (cancella anche attività collegate)")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return alert(error.message);
    await refreshAll();
  }

  async function saveProfileEdits() {
    if (!editProfile.id) return;
    const { error } = await supabase
      .from("profiles")
      .update({ name: editProfile.name.trim(), color: editProfile.color, role: editProfile.role })
      .eq("id", editProfile.id);
    if (error) return alert(error.message);
    setEditProfile({ id: "", name: "", color: "#111111", role: "collab" });
    await refreshAll();
  }

  async function addActivity(projectId) {
    const text = (draftByProject[projectId] || "").trim();
    if (!text) return;

    const { error } = await supabase.from("activities").insert({
      project_id: projectId,
      user_id: meId,
      text,
    });
    if (error) return alert(error.message);

    setDraftByProject((p) => ({ ...p, [projectId]: "" }));
    await refreshAll();
  }

  async function updateActivity(actId) {
    const text = editActText.trim();
    if (!text) return;

    const { error } = await supabase.from("activities").update({ text }).eq("id", actId);
    if (error) return alert(error.message);

    setEditActId(null);
    setEditActText("");
    await refreshAll();
  }

  async function deleteActivity(actId) {
    if (!confirm("Eliminare attività?")) return;
    const { error } = await supabase.from("activities").delete().eq("id", actId);
    if (error) return alert(error.message);
    await refreshAll();
  }

  const lastActivityByUser = useMemo(() => {
    const m = new Map();
    for (const a of activities) {
      if (!m.has(a.user_id)) m.set(a.user_id, a.created_at);
    }
    return m;
  }, [activities]);

  const filteredActivities = useMemo(() => {
    let arr = [...activities];
    if (fProject !== "all") arr = arr.filter((a) => a.project_id === fProject);
    if (fUser !== "all") arr = arr.filter((a) => a.user_id === fUser);

    if (fPeriod === "last7") {
      const from = new Date(Date.now() - 7 * 86400000);
      arr = arr.filter((a) => new Date(a.created_at) >= from);
    }
    if (fPeriod === "custom") {
      const from = new Date(fFrom + "T00:00:00");
      const to = new Date(fTo + "T23:59:59");
      arr = arr.filter((a) => {
        const d = new Date(a.created_at);
        return d >= from && d <= to;
      });
    }
    return arr;
  }, [activities, fProject, fUser, fPeriod, fFrom, fTo]);

  const resourcesByProject = useMemo(() => {
    const m = new Map();
    for (const a of filteredActivities) {
      if (!m.has(a.project_id)) m.set(a.project_id, new Set());
      m.get(a.project_id).add(a.user_id);
    }
    return m;
  }, [filteredActivities]);

  const activitiesByProjectFiltered = useMemo(() => {
    const m = new Map();
    for (const a of filteredActivities) {
      if (!m.has(a.project_id)) m.set(a.project_id, []);
      m.get(a.project_id).push(a);
    }
    return m;
  }, [filteredActivities]);

  function exportPdfTable() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Export Attività (tabella)", 40, 40);

    const rows = [...filteredActivities].sort((a, b) => {
      const pa = projectById.get(a.project_id)?.title || "";
      const pb = projectById.get(b.project_id)?.title || "";
      if (pa.localeCompare(pb, "it") !== 0) return pa.localeCompare(pb, "it");
      return new Date(b.created_at) - new Date(a.created_at);
    });

    let lastProject = null;
    let lastCollab = null;

    const body = rows.map((a) => {
      const projTitle = projectById.get(a.project_id)?.title || "—";
      const user = profilesById.get(a.user_id);
      const collabName = user?.name || user?.email || "—";
      const activityText = `${fmtDateTime(a.created_at)} — ${a.text}`;

      const showProj = projTitle !== lastProject;
      const showCollab = showProj || collabName !== lastCollab;

      lastProject = projTitle;
      lastCollab = collabName;

      return [showProj ? projTitle : "", activityText, showCollab ? collabName : ""];
    });

    autoTable(doc, {
      startY: 60,
      head: [["NOME PROGETTI", "ATTIVITÀ SVOLTE", "COLLABORATORI"]],
      body,
      styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak" },
      headStyles: { fillColor: [17, 24, 39] },
      columnStyles: { 0: { cellWidth: 190 }, 1: { cellWidth: 430 }, 2: { cellWidth: 170 } },
    });

    doc.save(`export_attivita_tabella_${uid()}.pdf`);
  }

  function exportPdfEditorial() {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    let y = 40;

    doc.setFontSize(14);
    doc.text("Export Attività (per progetto)", 40, y);
    y += 20;

    const projectsSorted = [...projects].sort((a, b) => (a.title || "").localeCompare(b.title || "", "it"));

    for (const p of projectsSorted) {
      const acts = filteredActivities
        .filter((a) => a.project_id === p.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (acts.length === 0) continue;

      if (y > 720) {
        doc.addPage();
        y = 40;
      }

      doc.setFontSize(12);
      doc.text(p.title, 40, y);
      y += 14;

      doc.setFontSize(9);
      doc.text(`${p.subtitle || ""}`, 40, y);
      y += 12;

      doc.setFontSize(9);
      doc.text(`Periodo: ${p.start_date} → ${p.end_date}`, 40, y);
      y += 10;

      const resSet = resourcesByProject.get(p.id);
      const resNames = resSet ? [...resSet].map((uid) => profilesById.get(uid)?.name || "—") : [];
      const resLine = resNames.length ? `Risorse interessate: ${resNames.join(", ")}` : "Risorse interessate: —";
      doc.text(resLine, 40, y);
      y += 12;

      const body = acts.map((a) => {
        const user = profilesById.get(a.user_id);
        const name = user?.name || user?.email || "—";
        return [fmtDateTime(a.created_at), name, a.text];
      });

      autoTable(doc, {
        startY: y,
        head: [["DATA", "COLLABORATORE", "ATTIVITÀ"]],
        body,
        styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak" },
        headStyles: { fillColor: [17, 24, 39] },
        columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 140 }, 2: { cellWidth: 260 } },
        margin: { left: 40, right: 40 },
      });

      y = doc.lastAutoTable.finalY + 18;
    }

    doc.save(`export_attivita_progetti_${uid()}.pdf`);
  }

  if (loading) return <div style={styles.page}>Caricamento…</div>;

  // HOME
  if (view === "home") {
    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <h1 style={styles.h1}>SES App</h1>
          {session ? <button style={styles.btn2} onClick={doLogout}>Logout</button> : <span style={styles.small}>Supabase online</span>}
        </div>

        <div style={{ ...styles.card, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Entra come</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={styles.btn} onClick={() => { setIntent("admin"); setView("auth"); }}>ADMIN</button>
            <button style={styles.btn} onClick={() => { setIntent("collab"); setView("auth"); }}>COLLABORATORI</button>
            <button style={styles.btn} onClick={() => { setIntent("dashboard"); setView("auth"); }}>DASHBOARD</button>
          </div>

          {session && profile && (
            <div style={{ marginTop: 10 }}>
              <Pill color={profile.color || "#111111"} label={`Loggato: ${profile.name} (${profile.role})`} />
              <div style={{ marginTop: 10 }}>
                <button
                  style={styles.btn2}
                  onClick={() => setView(profile.role === "admin" ? "admin" : profile.role === "dashboard" ? "dashboard" : "collab")}
                >
                  Vai alla tua sezione →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // AUTH
  if (view === "auth") {
    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <div>
            <h1 style={styles.h1}>Login</h1>
            <div style={styles.small}>Sezione scelta: <b>{intent || "—"}</b></div>
          </div>
          <button style={styles.btn2} onClick={() => { setView("home"); setAuthError(""); }}>← Indietro</button>
        </div>

        <div style={{ ...styles.card, maxWidth: 520 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={styles.small}>Email</div>
              <FInput fid="login-email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="es. admin@test.it" />
            </div>
            <div>
              <div style={styles.small}>Password</div>
              <FInput fid="login-pass" type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder="••••••••" />
            </div>

            {authError && (
              <div style={{ padding: 10, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
                {authError}
              </div>
            )}

            <button style={styles.btn} onClick={doLogin}>Entra</button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div>Devi fare login.</div>
          <button style={{ ...styles.btn, marginTop: 10 }} onClick={() => setView("home")}>Torna alla home</button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Profilo mancante</div>
          <div style={styles.small}>Crea la riga in <b>profiles</b> con l’UUID di questo utente.</div>
          <div style={{ marginTop: 12 }}>
            <button style={styles.btn2} onClick={doLogout}>Logout</button>
          </div>
        </div>
      </div>
    );
  }

  // ADMIN
  if (view === "admin") {
    if (profile.role !== "admin") return <div style={styles.page}><div style={styles.card}>Accesso negato (serve admin).</div></div>;

    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <div>
            <h1 style={styles.h1}>Pannello Admin</h1>
            <div style={styles.small}>{profile.name} — ruolo <b>{profile.role}</b></div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn2} onClick={() => setView("home")}>Home</button>
            <button style={styles.btn2} onClick={refreshAll}>Aggiorna</button>
            <button style={styles.btn2} onClick={doLogout}>Logout</button>
          </div>
        </div>

        <div style={styles.grid}>
          <div style={styles.card}>
            <SectionTitle title="Progetti" />
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Crea progetto</div>
              <FInput fid="proj-title" placeholder="Titolo" value={newProj.title} onChange={(e) => setNewProj((p) => ({ ...p, title: e.target.value }))} />
              <FInput fid="proj-sub" placeholder="Sottotitolo" value={newProj.subtitle} onChange={(e) => setNewProj((p) => ({ ...p, subtitle: e.target.value }))} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={styles.small}>Inizio</div>
                  <FInput fid="proj-start" type="date" value={newProj.start_date} onChange={(e) => setNewProj((p) => ({ ...p, start_date: e.target.value }))} />
                </div>
                <div>
                  <div style={styles.small}>Fine</div>
                  <FInput fid="proj-end" type="date" value={newProj.end_date} onChange={(e) => setNewProj((p) => ({ ...p, end_date: e.target.value }))} />
                </div>
              </div>
              <button style={styles.btn} onClick={createProject}>Crea</button>

              <hr style={{ border: 0, borderTop: "1px solid #e5e7eb" }} />

              <div style={{ fontWeight: 700 }}>Rinomina / modifica sottotitolo</div>
              <FSelect
                fid="proj-pick"
                value={renameProj.id}
                onChange={(e) => {
                  const id = e.target.value;
                  const p = projects.find((x) => x.id === id);
                  setRenameProj({ id, title: p?.title || "", subtitle: p?.subtitle || "" });
                }}
              >
                <option value="">Seleziona progetto…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </FSelect>

              <FInput fid="proj-rename-title" placeholder="Nuovo titolo" value={renameProj.title} onChange={(e) => setRenameProj((p) => ({ ...p, title: e.target.value }))} />
              <FInput fid="proj-rename-sub" placeholder="Nuovo sottotitolo" value={renameProj.subtitle} onChange={(e) => setRenameProj((p) => ({ ...p, subtitle: e.target.value }))} />

              <button style={styles.btn2} onClick={updateProject} disabled={!renameProj.id}>Salva modifiche</button>

              <hr style={{ border: 0, borderTop: "1px solid #e5e7eb" }} />
              <div style={{ fontWeight: 700 }}>Elimina progetto</div>
              <div style={{ display: "grid", gap: 8 }}>
                {projects.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.title}</div>
                      <div style={styles.small}>{p.subtitle || "—"} • {p.start_date} → {p.end_date}</div>
                    </div>
                    <button style={styles.btnDanger} onClick={() => deleteProject(p.id)}>Elimina</button>
                  </div>
                ))}
                {projects.length === 0 && <div style={styles.small}>Nessun progetto.</div>}
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <SectionTitle title="Collaboratori (profili)" />
            <div style={{ display: "grid", gap: 10 }}>
              <div style={styles.small}>
                Qui modifichi nome/colore/ruolo (password in Supabase Auth).
              </div>

              <FSelect
                fid="prof-pick"
                value={editProfile.id}
                onChange={(e) => {
                  const id = e.target.value;
                  const p = profiles.find((x) => x.id === id);
                  setEditProfile({ id, name: p?.name || "", color: p?.color || "#111111", role: p?.role || "collab" });
                }}
              >
                <option value="">Seleziona utente…</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
              </FSelect>

              <FInput fid="prof-name" value={editProfile.name} disabled={!editProfile.id} onChange={(e) => setEditProfile((p) => ({ ...p, name: e.target.value }))} placeholder="Nome" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, opacity: editProfile.id ? 1 : 0.6 }}>
                <div>
                  <div style={styles.small}>Colore</div>
                  <input
                    data-fid="prof-color"
                    type="color"
                    value={editProfile.color}
                    disabled={!editProfile.id}
                    onChange={(e) => setEditProfile((p) => ({ ...p, color: e.target.value }))}
                  />
                </div>
                <div>
                  <div style={styles.small}>Ruolo</div>
                  <FSelect fid="prof-role" value={editProfile.role} disabled={!editProfile.id} onChange={(e) => setEditProfile((p) => ({ ...p, role: e.target.value }))}>
                    <option value="collab">collab</option>
                    <option value="dashboard">dashboard</option>
                    <option value="admin">admin</option>
                  </FSelect>
                </div>
              </div>

              <button style={styles.btn} disabled={!editProfile.id} onClick={saveProfileEdits}>Salva profilo</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // COLLAB
  if (view === "collab") {
    if (profile.role !== "collab") return <div style={styles.page}><div style={styles.card}>Accesso negato (serve collab).</div></div>;

    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <div>
            <h1 style={styles.h1}>Area Collaboratore</h1>
            <div style={styles.small}><b style={{ color: profile.color }}>{profile.name}</b></div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn2} onClick={() => setView("home")}>Home</button>
            <button style={styles.btn2} onClick={refreshAll}>Aggiorna</button>
            <button style={styles.btn2} onClick={doLogout}>Logout</button>
          </div>
        </div>

        <div style={styles.grid}>
          {projects.map((p) => {
            const acts = (activitiesByProject.get(p.id) || [])
              .filter((a) => a.user_id === meId)
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            const expanded = !!expandedProjects[p.id];
            const shown = expanded ? acts : clamp10(acts);

            return (
              <div key={p.id} style={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{p.title}</div>
                    <div style={styles.small}>{p.subtitle || "—"}</div>
                    <div style={styles.small}>Periodo: {p.start_date} → {p.end_date}</div>
                  </div>
                  <button style={styles.btn2} onClick={() => toggleExpand(p.id)}>{expanded ? "Comprimi" : "Espandi"}</button>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <FInput
                    fid={`act-draft-${p.id}`}
                    placeholder="Scrivi attività…"
                    value={draftByProject[p.id] || ""}
                    onChange={(e) => setDraftByProject((d) => ({ ...d, [p.id]: e.target.value }))}
                  />
                  <button style={styles.btn} onClick={() => addActivity(p.id)}>Salva</button>
                </div>

                <div style={{ marginTop: 12 }}>
                  {shown.map((a) => (
                    <ActivityItem
                      key={a.id}
                      a={a}
                      allowEdit={true}
                      profilesById={profilesById}
                      editActId={editActId}
                      editActText={editActText}
                      setEditActId={setEditActId}
                      setEditActText={setEditActText}
                      onUpdate={updateActivity}
                      onDelete={deleteActivity}
                    />
                  ))}
                  {acts.length === 0 && <div style={styles.small}>Nessuna attività ancora.</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // DASHBOARD
  if (view === "dashboard") {
    if (profile.role !== "dashboard" && profile.role !== "admin") return <div style={styles.page}><div style={styles.card}>Accesso negato (serve dashboard o admin).</div></div>;

    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <div>
            <h1 style={styles.h1}>Dashboard</h1>
            <div style={styles.small}>{profile.name}</div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn2} onClick={() => setView("home")}>Home</button>
            <button style={styles.btn2} onClick={refreshAll}>Aggiorna</button>
            <button style={styles.btn2} onClick={doLogout}>Logout</button>
          </div>
        </div>

        <div style={{ ...styles.card, marginBottom: 12 }}>
          <SectionTitle title="Collaboratori — ultima attività" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {profiles.filter((p) => p.role === "collab").map((c) => {
              const last = lastActivityByUser.get(c.id) || null;
              const days = daysDiffFromNow(last);
              const color = last ? statusColorByDays(days) : "#dc2626";
              return (
                <div key={c.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={styles.dot(c.color || "#111111")} />
                      <div style={{ fontWeight: 800 }}>{c.name}</div>
                    </div>
                    <span style={styles.dot(color)} />
                  </div>
                  <div style={styles.small}>Ultima attività: <b>{last ? fmtDateTime(last) : "mai"}</b></div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ ...styles.card, marginBottom: 12 }}>
          <SectionTitle
            title="Filtri + Export PDF"
            right={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={styles.btn2} onClick={exportPdfTable}>Export PDF (tabella)</button>
                <button style={styles.btn2} onClick={exportPdfEditorial}>Export PDF (per progetto)</button>
              </div>
            }
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <div>
              <div style={styles.small}>Progetto</div>
              <FSelect fid="f-proj" value={fProject} onChange={(e) => setFProject(e.target.value)}>
                <option value="all">Tutti</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </FSelect>
            </div>

            <div>
              <div style={styles.small}>Collaboratore</div>
              <FSelect fid="f-user" value={fUser} onChange={(e) => setFUser(e.target.value)}>
                <option value="all">Tutti</option>
                {profiles.filter((p) => p.role === "collab").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </FSelect>
            </div>

            <div>
              <div style={styles.small}>Periodo</div>
              <FSelect fid="f-period" value={fPeriod} onChange={(e) => setFPeriod(e.target.value)}>
                <option value="all">Tutte</option>
                <option value="last7">Ultimi 7GG</option>
                <option value="custom">Custom</option>
              </FSelect>
            </div>

            <div style={{ opacity: fPeriod === "custom" ? 1 : 0.5 }}>
              <div style={styles.small}>Da</div>
              <FInput fid="f-from" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} disabled={fPeriod !== "custom"} />
            </div>

            <div style={{ opacity: fPeriod === "custom" ? 1 : 0.5 }}>
              <div style={styles.small}>A</div>
              <FInput fid="f-to" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} disabled={fPeriod !== "custom"} />
            </div>
          </div>

          <div style={{ marginTop: 10, ...styles.small }}>Attività filtrate: <b>{filteredActivities.length}</b></div>
        </div>

        <div style={styles.grid}>
          {projects.map((p) => {
            const acts = (activitiesByProjectFiltered.get(p.id) || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const expanded = !!expandedProjects[p.id];
            const shown = expanded ? acts : clamp10(acts);
            const past = isPastEndDate(p.end_date);

            const resSet = resourcesByProject.get(p.id);
            const resNames = resSet ? [...resSet].map((id) => profilesById.get(id)?.name || "—") : [];

            return (
              <div key={p.id} style={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{p.title}</div>
                    <div style={styles.small}>{p.subtitle || "—"}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Pill color={past ? "#dc2626" : "#16a34a"} label={past ? "terminato" : "in corso"} />
                      <span style={styles.small}>Inizio: <b>{p.start_date}</b></span>
                      <span style={styles.small}>Fine: <b>{p.end_date}</b></span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      <b>Risorse interessate:</b>{" "}
                      {resNames.length ? resNames.map((n) => <span key={n} style={{ fontWeight: 800, marginRight: 8 }}>{n}</span>) : <span style={styles.small}>—</span>}
                    </div>
                  </div>
                  <button style={styles.btn2} onClick={() => toggleExpand(p.id)}>{expanded ? "Comprimi" : "Espandi"}</button>
                </div>

                <div style={{ marginTop: 12 }}>
                  {shown.map((a) => (
                    <ActivityItem
                      key={a.id}
                      a={a}
                      allowEdit={false}
                      profilesById={profilesById}
                      editActId={null}
                      editActText=""
                      setEditActId={() => {}}
                      setEditActText={() => {}}
                      onUpdate={() => {}}
                      onDelete={() => {}}
                    />
                  ))}
                  {acts.length === 0 && <div style={styles.small}>Nessuna attività (con i filtri attuali).</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return <div style={styles.page}>—</div>;
}
