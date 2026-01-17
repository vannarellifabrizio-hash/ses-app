import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * SES App (Supabase)
 * FIX focus/cursore:
 * - Componenti di pagina spostati FUORI da App() per evitare remount ad ogni render.
 */

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const clamp10 = (arr) => arr.slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { year: "numeric", month: "2-digit", day: "2-digit" });
}
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

/** Activity item (fuori da App per evitare remount) */
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
            <input style={styles.input} value={editActText} onChange={(e) => setEditActText(e.target.value)} />
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

function AuthView({ intent, authEmail, authPass, setAuthEmail, setAuthPass, authError, doLogin, goBack }) {
  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h1 style={styles.h1}>Login</h1>
          <div style={styles.small}>
            Sezione scelta: <b>{intent || "—"}</b>
          </div>
        </div>
        <button style={styles.btn2} onClick={goBack}>← Indietro</button>
      </div>

      <div style={{ ...styles.card, maxWidth: 520 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={styles.small}>Email</div>
            <input style={styles.input} value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="es. admin@test.it" />
          </div>
          <div>
            <div style={styles.small}>Password</div>
            <input style={styles.input} type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder="••••••••" />
          </div>

          {authError && (
            <div style={{ padding: 10, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
              {authError}
            </div>
          )}

          <button style={styles.btn} onClick={doLogin}>Entra</button>

          <div style={styles.small}>
            Nota: le password utenti si gestiscono in <b>Supabase → Authentication → Users</b>.
          </div>
        </div>
      </div>
    </div>
  );
}

function MissingProfile({ doLogout }) {
  return (
    <div style={styles.page}>
      <div style={{ ...styles.card }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Profilo mancante</div>
        <div style={{ color: "#6b7280", marginBottom: 10 }}>
          Questo utente ha fatto login, ma non esiste una riga in <b>profiles</b> con il suo UUID.
        </div>
        <div style={styles.small}>
          Vai in <b>Supabase → Table Editor → profiles → Insert row</b> e inserisci:
          <br />- <b>id</b> = UUID utente (da Authentication → Users)
          <br />- <b>email</b>, <b>name</b>, <b>color</b>, <b>role</b>
        </div>
        <div style={{ marginTop: 12 }}>
          <button style={styles.btn2} onClick={doLogout}>Logout</button>
        </div>
      </div>
    </div>
  );
}

function AdminView({
  profile,
  projects,
  profiles,
  newProj,
  setNewProj,
  createProject,
  renameProj,
  setRenameProj,
  updateProject,
  deleteProject,
  editProfile,
  setEditProfile,
  saveProfileEdits,
  refreshAll,
  goHome,
  doLogout,
}) {
  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h1 style={styles.h1}>Pannello Admin</h1>
          <div style={styles.small}>
            {profile.name} — ruolo <b>{profile.role}</b>
          </div>
        </div>
        <div style={styles.row}>
          <button style={styles.btn2} onClick={goHome}>Home</button>
          <button style={styles.btn2} onClick={refreshAll}>Aggiorna</button>
          <button style={styles.btn2} onClick={doLogout}>Logout</button>
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <SectionTitle title="Progetti" right={null} />

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 700 }}>Crea progetto</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input
                style={styles.input}
                placeholder="Titolo"
                value={newProj.title}
                onChange={(e) => setNewProj((p) => ({ ...p, title: e.target.value }))}
              />
              <input
                style={styles.input}
                placeholder="Sottotitolo"
                value={newProj.subtitle}
                onChange={(e) => setNewProj((p) => ({ ...p, subtitle: e.target.value }))}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={styles.small}>Inizio</div>
                  <input
                    style={styles.input}
                    type="date"
                    value={newProj.start_date}
                    onChange={(e) => setNewProj((p) => ({ ...p, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <div style={styles.small}>Fine</div>
                  <input
                    style={styles.input}
                    type="date"
                    value={newProj.end_date}
                    onChange={(e) => setNewProj((p) => ({ ...p, end_date: e.target.value }))}
                  />
                </div>
              </div>
              <button style={styles.btn} onClick={createProject}>Crea</button>
            </div>

            <hr style={{ border: 0, borderTop: "1px solid #e5e7eb" }} />

            <div style={{ fontWeight: 700 }}>Rinomina / modifica sottotitolo</div>
            <div style={{ display: "grid", gap: 8 }}>
              <select
                style={styles.select}
                value={renameProj.id}
                onChange={(e) => {
                  const id = e.target.value;
                  const p = projects.find((x) => x.id === id);
                  setRenameProj({ id, title: p?.title || "", subtitle: p?.subtitle || "" });
                }}
              >
                <option value="">Seleziona progetto…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <input style={styles.input} placeholder="Nuovo titolo" value={renameProj.title} onChange={(e) => setRenameProj((p) => ({ ...p, title: e.target.value }))} />
              <input style={styles.input} placeholder="Nuovo sottotitolo" value={renameProj.subtitle} onChange={(e) => setRenameProj((p) => ({ ...p, subtitle: e.target.value }))} />
              <button style={styles.btn2} onClick={updateProject} disabled={!renameProj.id}>Salva modifiche</button>
            </div>

            <hr style={{ border: 0, borderTop: "1px solid #e5e7eb" }} />

            <div style={{ fontWeight: 700 }}>Elimina progetto</div>
            <div style={{ display: "grid", gap: 8 }}>
              {projects.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{p.title}</div>
                    <div style={styles.small}>
                      {p.subtitle || "—"} • {p.start_date} → {p.end_date}
                    </div>
                  </div>
                  <button style={styles.btnDanger} onClick={() => deleteProject(p.id)}>Elimina</button>
                </div>
              ))}
              {projects.length === 0 && <div style={styles.small}>Nessun progetto.</div>}
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <SectionTitle title="Collaboratori (profili)" right={null} />
          <div style={{ ...styles.small, marginBottom: 10 }}>
            Qui modifichi <b>nome/colore/ruolo</b>. Le password NON si modificano qui: vai in <b>Supabase → Authentication → Users</b>.
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 700 }}>Modifica profilo</div>
            <select
              style={styles.select}
              value={editProfile.id}
              onChange={(e) => {
                const id = e.target.value;
                const p = profiles.find((x) => x.id === id);
                setEditProfile({
                  id,
                  name: p?.name || "",
                  color: p?.color || "#111111",
                  role: p?.role || "collab",
                });
              }}
            >
              <option value="">Seleziona utente…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>

            <div style={{ display: "grid", gap: 8, opacity: editProfile.id ? 1 : 0.6 }}>
              <input style={styles.input} value={editProfile.name} onChange={(e) => setEditProfile((p) => ({ ...p, name: e.target.value }))} placeholder="Nome" disabled={!editProfile.id} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={styles.small}>Colore</div>
                  <input type="color" value={editProfile.color} onChange={(e) => setEditProfile((p) => ({ ...p, color: e.target.value }))} disabled={!editProfile.id} />
                </div>
                <div>
                  <div style={styles.small}>Ruolo</div>
                  <select style={styles.select} value={editProfile.role} onChange={(e) => setEditProfile((p) => ({ ...p, role: e.target.value }))} disabled={!editProfile.id}>
                    <option value="collab">collab</option>
                    <option value="dashboard">dashboard</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>

              <button style={styles.btn} onClick={saveProfileEdits} disabled={!editProfile.id}>Salva profilo</button>
            </div>

            <hr style={{ border: 0, borderTop: "1px solid #e5e7eb" }} />

            <div style={{ fontWeight: 700 }}>Elenco profili</div>
            <div style={{ display: "grid", gap: 8 }}>
              {profiles.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={styles.dot(p.color || "#111111")} />
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={styles.small}>{p.email} • ruolo {p.role}</div>
                    </div>
                  </div>
                </div>
              ))}
              {profiles.length === 0 && <div style={styles.small}>Nessun profilo visibile. Controlla policy/ruolo.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollabView({
  profile,
  projects,
  activitiesByProject,
  meId,
  expandedProjects,
  toggleExpand,
  draftByProject,
  setDraftByProject,
  addActivity,
  editActId,
  editActText,
  setEditActId,
  setEditActText,
  updateActivity,
  deleteActivity,
  profilesById,
  refreshAll,
  goHome,
  doLogout,
}) {
  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h1 style={styles.h1}>Area Collaboratore</h1>
          <div style={styles.small}>
            <span style={{ fontWeight: 800, color: profile.color }}>{profile.name}</span> — attività visibili solo a te
          </div>
        </div>
        <div style={styles.row}>
          <button style={styles.btn2} onClick={goHome}>Home</button>
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
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{p.title}</div>
                  <div style={styles.small}>{p.subtitle || "—"}</div>
                  <div style={styles.small}>Periodo: {p.start_date} → {p.end_date}</div>
                </div>
                <button style={styles.btn2} onClick={() => toggleExpand(p.id)}>
                  {expanded ? "Comprimi" : "Espandi"}
                </button>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  style={styles.input}
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
                {acts.length > 10 && !expanded && (
                  <div style={{ marginTop: 8 }}>
                    <button style={styles.btn2} onClick={() => toggleExpand(p.id)}>Mostra tutte ({acts.length})</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {projects.length === 0 && (
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Nessun progetto</div>
            <div style={styles.small}>Creali dal pannello Admin.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardView({
  profile,
  profiles,
  projects,
  filteredActivities,
  fProject,
  setFProject,
  fUser,
  setFUser,
  fPeriod,
  setFPeriod,
  fFrom,
  setFFrom,
  fTo,
  setFTo,
  expandedProjects,
  toggleExpand,
  activitiesByProjectFiltered,
  resourcesByProject,
  profilesById,
  lastActivityByUser,
  exportPdfTable,
  exportPdfEditorial,
  refreshAll,
  goHome,
  doLogout,
}) {
  const collabs = profiles.filter((p) => p.role === "collab");

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h1 style={styles.h1}>Dashboard</h1>
          <div style={styles.small}>
            {profile.name} — ruolo <b>{profile.role}</b>
          </div>
        </div>
        <div style={styles.row}>
          <button style={styles.btn2} onClick={goHome}>Home</button>
          <button style={styles.btn2} onClick={refreshAll}>Aggiorna</button>
          <button style={styles.btn2} onClick={doLogout}>Logout</button>
        </div>
      </div>

      <div style={{ ...styles.card, marginBottom: 12 }}>
        <SectionTitle title="Collaboratori — ultima attività" right={null} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {collabs.map((c) => {
            const last = lastActivityByUser.get(c.id) || null;
            const days = daysDiffFromNow(last);
            const color = last ? statusColorByDays(days) : "#dc2626";
            return (
              <div key={c.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={styles.dot(c.color || "#111111")} />
                    <div style={{ fontWeight: 800 }}>{c.name}</div>
                  </div>
                  <span style={styles.dot(color)} title="Stato ultimo aggiornamento" />
                </div>
                <div style={styles.small}>
                  Ultima attività: <b>{last ? fmtDateTime(last) : "mai"}</b>
                </div>
                <div style={styles.small}>
                  Stato: {last ? (days <= 7 ? "verde (≤7gg)" : days <= 10 ? "arancione (8–10gg)" : "rosso (≥11gg)") : "rosso (nessuna attività)"}
                </div>
              </div>
            );
          })}
          {collabs.length === 0 && <div style={styles.small}>Nessun collaboratore (role=collab) visibile.</div>}
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
            <select style={styles.select} value={fProject} onChange={(e) => setFProject(e.target.value)}>
              <option value="all">Tutti</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>

          <div>
            <div style={styles.small}>Collaboratore</div>
            <select style={styles.select} value={fUser} onChange={(e) => setFUser(e.target.value)}>
              <option value="all">Tutti</option>
              {profiles.filter((p) => p.role === "collab").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <div style={styles.small}>Periodo</div>
            <select style={styles.select} value={fPeriod} onChange={(e) => setFPeriod(e.target.value)}>
              <option value="all">Tutte</option>
              <option value="last7">Ultimi 7GG</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div style={{ opacity: fPeriod === "custom" ? 1 : 0.5 }}>
            <div style={styles.small}>Da</div>
            <input style={styles.input} type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} disabled={fPeriod !== "custom"} />
          </div>
          <div style={{ opacity: fPeriod === "custom" ? 1 : 0.5 }}>
            <div style={styles.small}>A</div>
            <input style={styles.input} type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} disabled={fPeriod !== "custom"} />
          </div>
        </div>

        <div style={{ marginTop: 10, ...styles.small }}>
          Attività filtrate: <b>{filteredActivities.length}</b>
        </div>
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
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{p.title}</div>
                  <div style={styles.small}>{p.subtitle || "—"}</div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                    <span style={styles.small}>Inizio: <b>{p.start_date}</b></span>
                    <span style={styles.small}>Fine: <b>{p.end_date}</b></span>
                    <Pill color={past ? "#dc2626" : "#16a34a"} label={past ? "terminato" : "in corso"} />
                  </div>

                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    <b>Risorse interessate:</b>{" "}
                    {resNames.length ? resNames.map((n) => <span key={n} style={{ fontWeight: 800, marginRight: 8 }}>{n}</span>) : <span style={styles.small}>—</span>}
                  </div>
                </div>

                <button style={styles.btn2} onClick={() => toggleExpand(p.id)}>
                  {expanded ? "Comprimi" : "Espandi"}
                </button>
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
                {acts.length > 10 && !expanded && (
                  <div style={{ marginTop: 8 }}>
                    <button style={styles.btn2} onClick={() => toggleExpand(p.id)}>Mostra tutte ({acts.length})</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {projects.length === 0 && (
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Nessun progetto</div>
            <div style={styles.small}>Creali dal pannello Admin.</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("home"); // home | auth | admin | collab | dashboard
  const [intent, setIntent] = useState(null); // "admin" | "collab" | "dashboard"
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // {id,email,name,color,role}

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
  const [fPeriod, setFPeriod] = useState("all"); // all | last7 | custom
  const [fFrom, setFFrom] = useState(toISODateOnly(new Date(Date.now() - 7 * 86400000)));
  const [fTo, setFTo] = useState(toISODateOnly(new Date()));

  const mounted = useRef(false);

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
      didDrawPage: (data) => {
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(9);
        doc.text(
          `Pagina ${data.pageNumber} / ${pageCount}`,
          doc.internal.pageSize.getWidth() - 90,
          doc.internal.pageSize.getHeight() - 20
        );
      },
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

        <div style={styles.small}>
          Se qualcosa non funziona: controlla in Vercel le env var e in Supabase che l’utente abbia un profilo.
        </div>
      </div>
    );
  }

  if (view === "auth") {
    return (
      <AuthView
        intent={intent}
        authEmail={authEmail}
        authPass={authPass}
        setAuthEmail={setAuthEmail}
        setAuthPass={setAuthPass}
        authError={authError}
        doLogin={doLogin}
        goBack={() => { setView("home"); setAuthError(""); }}
      />
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

  if (!profile) return <MissingProfile doLogout={doLogout} />;

  if (view === "admin") {
    if (profile.role !== "admin") {
      return (
        <div style={styles.page}>
          <div style={styles.card}>
            Accesso negato. Ruolo richiesto: admin.
            <div style={{ marginTop: 10 }}>
              <button style={styles.btn2} onClick={() => setView("home")}>Home</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <AdminView
        profile={profile}
        projects={projects}
        profiles={profiles}
        newProj={newProj}
        setNewProj={setNewProj}
        createProject={createProject}
        renameProj={renameProj}
        setRenameProj={setRenameProj}
        updateProject={updateProject}
        deleteProject={deleteProject}
        editProfile={editProfile}
        setEditProfile={setEditProfile}
        saveProfileEdits={saveProfileEdits}
        refreshAll={refreshAll}
        goHome={() => setView("home")}
        doLogout={doLogout}
      />
    );
  }

  if (view === "collab") {
    if (profile.role !== "collab") {
      return (
        <div style={styles.page}>
          <div style={styles.card}>
            Accesso negato. Ruolo richiesto: collab.
            <div style={{ marginTop: 10 }}>
              <button style={styles.btn2} onClick={() => setView("home")}>Home</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <CollabView
        profile={profile}
        projects={projects}
        activitiesByProject={activitiesByProject}
        meId={meId}
        expandedProjects={expandedProjects}
        toggleExpand={toggleExpand}
        draftByProject={draftByProject}
        setDraftByProject={setDraftByProject}
        addActivity={addActivity}
        editActId={editActId}
        editActText={editActText}
        setEditActId={setEditActId}
        setEditActText={setEditActText}
        updateActivity={updateActivity}
        deleteActivity={deleteActivity}
        profilesById={profilesById}
        refreshAll={refreshAll}
        goHome={() => setView("home")}
        doLogout={doLogout}
      />
    );
  }

  if (view === "dashboard") {
    if (profile.role !== "dashboard" && profile.role !== "admin") {
      return (
        <div style={styles.page}>
          <div style={styles.card}>Accesso negato. Ruolo richiesto: dashboard (o admin).</div>
        </div>
      );
    }
    return (
      <DashboardView
        profile={profile}
        profiles={profiles}
        projects={projects}
        filteredActivities={filteredActivities}
        fProject={fProject}
        setFProject={setFProject}
        fUser={fUser}
        setFUser={setFUser}
        fPeriod={fPeriod}
        setFPeriod={setFPeriod}
        fFrom={fFrom}
        setFFrom={setFFrom}
        fTo={fTo}
        setFTo={setFTo}
        expandedProjects={expandedProjects}
        toggleExpand={toggleExpand}
        activitiesByProjectFiltered={activitiesByProjectFiltered}
        resourcesByProject={resourcesByProject}
        profilesById={profilesById}
        lastActivityByUser={lastActivityByUser}
        exportPdfTable={exportPdfTable}
        exportPdfEditorial={exportPdfEditorial}
        refreshAll={refreshAll}
        goHome={() => setView("home")}
        doLogout={doLogout}
      />
    );
  }

  return <div style={styles.page}>—</div>;
}
