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
  return { restore: () => {} };
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
  const [testValue, setTestValue] = useState("");

  return (
    <div style={{ padding: 40 }}>
      <h2>TEST INPUT ISOLATO</h2>

      <input
        style={{
          padding: 12,
          fontSize: 18,
          border: "2px solid black",
          width: "100%",
          maxWidth: 400,
        }}
        value={testValue}
        onChange={(e) => setTestValue(e.target.value)}
        placeholder="Scrivi qui..."
      />

      <p>Valore: {testValue}</p>
    </div>
  );
}
