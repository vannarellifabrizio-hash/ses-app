import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/* =======================
   STYLES – FIX CURSORE
======================= */
const styles = {
  page: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    padding: 16,
    maxWidth: 1100,
    margin: "0 auto",
    background: "#ffffff",
  },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  h1: { margin: 0, fontSize: 20 },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 14,
    background: "white",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 12,
  },
  row: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  btn: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 12px",
    background: "#111827",
    color: "white",
    cursor: "pointer",
  },
  btn2: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 12px",
    background: "white",
    color: "#111827",
    cursor: "pointer",
  },
  btnDanger: {
    border: "1px solid #fecaca",
    borderRadius: 10,
    padding: "8px 10px",
    background: "#fee2e2",
    color: "#991b1b",
    cursor: "pointer",
  },

  /* 🔥 FIX CARET DEFINITIVO */
  input: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 12px",
    width: "100%",
    background: "#ffffff",
    color: "#111827",
    caretColor: "#111827",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    WebkitTextFillColor: "#111827",
  },
  select: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 12px",
    width: "100%",
    background: "#ffffff",
    color: "#111827",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
  },

  small: { fontSize: 12, color: "#6b7280" },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    fontSize: 12,
  },
  dot: (c) => ({
    width: 10,
    height: 10,
    borderRadius: 3,
    background: c,
    display: "inline-block",
  }),
};

/* =======================
   HELPERS
======================= */
const clamp10 = (arr) => arr.slice(0, 10);
const uid = () =>
  Math.random().toString(36).slice(2, 10) +
  "_" +
  Date.now().toString(36);

/* =======================
   APP
======================= */
export default function App() {
  const [view, setView] = useState("home");
  const [intent, setIntent] = useState(null);
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState("");

  const [projects, setProjects] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [activities, setActivities] = useState([]);
  const [expandedProjects, setExpandedProjects] = useState({});

  /* ===== AUTH ===== */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    );

    return () => data.subscription.unsubscribe();
  }, []);

  /* ===== PROFILE ===== */
  useEffect(() => {
    if (!session?.user?.id) return setProfile(null);

    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data || null));
  }, [session?.user?.id]);

  if (loading) return <div style={styles.page}>Caricamento…</div>;

  /* =======================
     HOME
  ======================= */
  if (view === "home") {
    return (
      <div style={styles.page}>
        <h1 style={styles.h1}>SES App</h1>
        <button style={styles.btn} onClick={() => setView("auth")}>
          Login
        </button>
      </div>
    );
  }

  /* =======================
     AUTH
  ======================= */
  if (view === "auth") {
    const emailRef = useRef(null);
    const passRef = useRef(null);

    async function doLogin() {
      const email = emailRef.current.value;
      const password = passRef.current.value;
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setAuthError(error.message);
    }

    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <input ref={emailRef} style={styles.input} placeholder="Email" />
          <input
            ref={passRef}
            style={styles.input}
            type="password"
            placeholder="Password"
          />
          {authError && <div style={styles.small}>{authError}</div>}
          <button style={styles.btn} onClick={doLogin}>
            Entra
          </button>
        </div>
      </div>
    );
  }

  return <div style={styles.page}>OK</div>;
}

