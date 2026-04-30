import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const STORAGE_KEY = "glucosa_registros";
const CONTEXTOS = ["Ayunas", "Pre-comida", "Post-comida (2h)", "Antes de dormir", "Otro"];

const getRango = (val) => {
  if (val < 70) return { label: "Bajo", color: "#185FA5", bg: "#E6F1FB" };
  if (val <= 99) return { label: "Normal", color: "#3B6D11", bg: "#EAF3DE" };
  if (val <= 125) return { label: "Pre-diabetes", color: "#854F0B", bg: "#FAEEDA" };
  return { label: "Alto", color: "#A32D2D", bg: "#FCEBEB" };
};

const fmt = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("es-SV", { day: "2-digit", month: "short" }) + " " +
    d.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" });
};

const fmtShort = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("es-SV", { day: "2-digit", month: "short" });
};

export default function App() {
  const [registros, setRegistros] = useState([]);
  const [valor, setValor] = useState("");
  const [ctx, setCtx] = useState(CONTEXTOS[0]);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 16));
  const [tab, setTab] = useState("registro");
  const [guardado, setGuardado] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setRegistros(JSON.parse(saved));
  }, []);

  const guardar = (lista) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  };

  const agregar = () => {
    const v = parseFloat(valor);
    if (!v || v < 20 || v > 600) return;
    const nuevo = { id: Date.now(), valor: v, contexto: ctx, fecha };
    const lista = [nuevo, ...registros].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    setRegistros(lista);
    guardar(lista);
    setValor("");
    setGuardado(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setGuardado(false), 2000);
  };

  const eliminar = (id) => {
    const lista = registros.filter(r => r.id !== id);
    setRegistros(lista);
    guardar(lista);
  };

  const promedio = registros.length ? Math.round(registros.reduce((s, r) => s + r.valor, 0) / registros.length) : null;
  const ultima = registros[0];
  const chartData = [...registros].reverse().slice(-20).map(r => ({
    fecha: fmtShort(r.fecha),
    valor: r.valor,
    ctx: r.contexto,
  }));

  const tabStyle = (t) => ({
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: tab === t ? 500 : 400,
    color: tab === t ? "var(--color-text-primary)" : "var(--color-text-secondary)",
    borderBottom: tab === t ? "2px solid var(--color-text-primary)" : "2px solid transparent",
    background: "none",
    border: "none",
    cursor: "pointer",
  });

  return (
    <div style={{ padding: "1rem 0", fontFamily: "var(--font-sans)" }}>
      <h2 style={{ fontSize: 18, fontWeight: 500, margin: "0 0 1rem", color: "var(--color-text-primary)" }}>
        Control de glucosa
      </h2>

      {/* Tarjetas resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        {[
          { label: "Última lectura", val: ultima ? `${ultima.valor} mg/dL` : "—", extra: ultima ? getRango(ultima.valor) : null },
          { label: "Promedio", val: promedio ? `${promedio} mg/dL` : "—", extra: promedio ? getRango(promedio) : null },
          { label: "Registros", val: registros.length, extra: null },
        ].map((c, i) => (
          <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500 }}>{c.val}</div>
            {c.extra && (
              <span style={{ fontSize: 11, background: c.extra.bg, color: c.extra.color, padding: "2px 8px", borderRadius: 4, display: "inline-block", marginTop: 4 }}>
                {c.extra.label}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "1.25rem" }}>
        {["registro", "historial", "grafica"].map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
            {t === "registro" ? "Registrar" : t === "historial" ? "Historial" : "Gráfica"}
          </button>
        ))}
      </div>

      {/* Tab: Registrar */}
      {tab === "registro" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Glucosa (mg/dL)</label>
            <input
              type="number"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="Ej. 95"
              min={20} max={600}
              style={{ width: "100%" }}
              onKeyDown={e => e.key === "Enter" && agregar()}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Contexto</label>
            <select value={ctx} onChange={e => setCtx(e.target.value)} style={{ width: "100%" }}>
              {CONTEXTOS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Fecha y hora</label>
            <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} style={{ width: "100%" }} />
          </div>
          {valor && !isNaN(parseFloat(valor)) && parseFloat(valor) >= 20 && (
            <div style={{ background: getRango(parseFloat(valor)).bg, color: getRango(parseFloat(valor)).color, border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "10px 14px", fontSize: 14 }}>
              {parseFloat(valor)} mg/dL — <strong>{getRango(parseFloat(valor)).label}</strong>
            </div>
          )}
          <button onClick={agregar} style={{ marginTop: 4 }}>
            {guardado ? "¡Guardado!" : "Agregar lectura"}
          </button>
        </div>
      )}

      {/* Tab: Historial */}
      {tab === "historial" && (
        <div>
          {registros.length === 0 ? (
            <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>No hay registros aún.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {registros.map(r => {
                const rng = getRango(r.valor);
                return (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "var(--color-background-primary)",
                    border: "0.5px solid var(--color-border-tertiary)",
                    borderRadius: "var(--border-radius-md)",
                    padding: "10px 14px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 20, fontWeight: 500 }}>{r.valor}</div>
                      <div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.contexto}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{fmt(r.fecha)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, background: rng.bg, color: rng.color, padding: "2px 8px", borderRadius: 4 }}>{rng.label}</span>
                      <button onClick={() => eliminar(r.id)} style={{ fontSize: 12, padding: "4px 10px", color: "var(--color-text-danger)" }}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Gráfica */}
      {tab === "grafica" && (
        <div>
          {chartData.length < 2 ? (
            <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Agrega al menos 2 lecturas para ver la gráfica.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap", fontSize: 12, color: "var(--color-text-secondary)" }}>
                {[{ label: "Normal (70–99)", color: "#639922" }, { label: "Pre-diabetes (100–125)", color: "#BA7517" }, { label: "Alto (≥126)", color: "#E24B4A" }, { label: "Bajo (<70)", color: "#378ADD" }].map(l => (
                  <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: "inline-block" }}></span>
                    {l.label}
                  </span>
                ))}
              </div>
              <div style={{ position: "relative", width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                    <YAxis domain={[40, "auto"]} tick={{ fontSize: 11 }} unit=" mg" />
                    <Tooltip
                      formatter={(v, n, p) => [`${v} mg/dL — ${getRango(v).label}`, p.payload.ctx]}
                      labelStyle={{ fontSize: 12 }}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <ReferenceLine y={70} stroke="#185FA5" strokeDasharray="4 2" label={{ value: "70", fontSize: 10, fill: "#185FA5" }} />
                    <ReferenceLine y={100} stroke="#3B6D11" strokeDasharray="4 2" label={{ value: "100", fontSize: 10, fill: "#3B6D11" }} />
                    <ReferenceLine y={126} stroke="#E24B4A" strokeDasharray="4 2" label={{ value: "126", fontSize: 10, fill: "#E24B4A" }} />
                    <Line type="monotone" dataKey="valor" stroke="#3266ad" strokeWidth={2} dot={{ r: 4, fill: "#3266ad" }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: "1.5rem", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => {
          if (!registros.length) return;
          const csv = ["Fecha,Glucosa (mg/dL),Contexto,Rango",
            ...registros.map(r => `${fmt(r.fecha)},${r.valor},${r.contexto},${getRango(r.valor).label}`)
          ].join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "glucosa.csv";
          a.click();
        }} style={{ fontSize: 13 }}>Exportar CSV</button>
        <button onClick={() => {
          if (!registros.length) return;
          const txt = registros.map(r => `${fmt(r.fecha)} | ${r.valor} mg/dL | ${r.contexto} | ${getRango(r.valor).label}`).join("\n");
          navigator.clipboard.writeText(txt).then(() => alert("¡Copiado al portapapeles!"));
        }} style={{ fontSize: 13 }}>Copiar como texto</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-tertiary)" }}>
        Rangos de referencia: ADA 2024. Esta app es informativa, no reemplaza consulta médica.
      </div>
    </div>
  );
}
