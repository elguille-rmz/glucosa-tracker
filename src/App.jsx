import { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ── Constantes ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "glucosa_registros";
const CONTEXTOS   = ["Ayunas", "Pre-comida", "Post-comida (2h)", "Antes de dormir", "Otro"];
const TZ          = "America/El_Salvador"; // UTC-6, sin horario de verano
const FILE_API    = typeof window !== "undefined" && "showOpenFilePicker" in window;

// ── IndexedDB (persiste el file handle entre recargas) ────────────────────────
const idb = (() => {
  const open = () =>
    new Promise((res, rej) => {
      const r = indexedDB.open("glucosa_idb", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess  = () => res(r.result);
      r.onerror    = () => rej(r.error);
    });
  return {
    get: async (key) => {
      try {
        const db = await open();
        return await new Promise((res) => {
          const req = db.transaction("kv").objectStore("kv").get(key);
          req.onsuccess = () => res(req.result ?? null);
          req.onerror   = () => res(null);
        });
      } catch { return null; }
    },
    set: async (key, val) => {
      try {
        const db = await open();
        await new Promise((res, rej) => {
          const tx = db.transaction("kv", "readwrite");
          val === null
            ? tx.objectStore("kv").delete(key)
            : tx.objectStore("kv").put(val, key);
          tx.oncomplete = res;
          tx.onerror    = rej;
        });
      } catch { /* silent */ }
    },
  };
})();

// ── Helpers de zona horaria y formato ─────────────────────────────────────────
const getRango = (val) => {
  if (val < 70)   return { label: "Bajo",        color: "#185FA5", bg: "#E6F1FB" };
  if (val <= 99)  return { label: "Normal",       color: "#3B6D11", bg: "#EAF3DE" };
  if (val <= 125) return { label: "Pre-diabetes", color: "#854F0B", bg: "#FAEEDA" };
  return           { label: "Alto",        color: "#A32D2D", bg: "#FCEBEB" };
};

const nowCST = () =>
  new Date().toLocaleString("sv-SE", { timeZone: TZ }).replace(" ", "T").slice(0, 16);

const parseCST = (iso) =>
  new Date(iso.length === 16 ? iso + ":00-06:00" : iso);

const fmt = (iso) => {
  const d = parseCST(iso);
  return (
    d.toLocaleDateString("es-SV",  { day: "2-digit", month: "short", timeZone: TZ }) +
    " " +
    d.toLocaleTimeString("es-SV",  { hour: "2-digit", minute: "2-digit", timeZone: TZ })
  );
};

const fmtShort = (iso) =>
  parseCST(iso).toLocaleDateString("es-SV", { day: "2-digit", month: "short", timeZone: TZ });

// ── Componente principal ──────────────────────────────────────────────────────
export default function App() {
  // Estado de registros y formulario
  const [registros, setRegistros]     = useState([]);
  const [valor, setValor]             = useState("");
  const [ctx, setCtx]                 = useState(CONTEXTOS[0]);
  const [fecha, setFecha]             = useState(nowCST);
  const [tab, setTab]                 = useState("registro");
  const [guardado, setGuardado]       = useState(false);

  // Estado del archivo vinculado
  const [fileLinked, setFileLinked]             = useState(false);
  const [fileName, setFileName]                 = useState("");
  const [fileNeedsReconnect, setFileNeedsReconnect] = useState(false);
  const fileHandleRef = useRef(null);
  const timeoutRef    = useRef(null);

  // ── Inicialización ───────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // 1. Cargar desde localStorage como base
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setRegistros(JSON.parse(saved));

      // 2. Intentar restaurar el file handle desde IndexedDB
      if (!FILE_API) return;
      const handle = await idb.get("fileHandle");
      if (!handle) return;

      fileHandleRef.current = handle;
      setFileName(handle.name);

      try {
        const perm = await handle.queryPermission({ mode: "readwrite" });
        if (perm === "granted") {
          await leerDesdeArchivo(handle);
        } else {
          // El navegador necesita gesto del usuario para re-autorizar
          setFileNeedsReconnect(true);
        }
      } catch {
        setFileNeedsReconnect(true);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lectura desde archivo ────────────────────────────────────────────────────
  const leerDesdeArchivo = async (handle) => {
    try {
      const file = await handle.getFile();
      const text = await file.text();
      if (text.trim()) {
        const data = JSON.parse(text);
        setRegistros(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
      setFileLinked(true);
      setFileNeedsReconnect(false);
    } catch (e) {
      console.error("Error leyendo archivo:", e);
    }
  };

  // ── Escritura en archivo ─────────────────────────────────────────────────────
  const guardarEnArchivo = async (lista) => {
    if (!fileHandleRef.current) return;
    try {
      const writable = await fileHandleRef.current.createWritable();
      await writable.write(JSON.stringify(lista, null, 2));
      await writable.close();
    } catch { /* silent — localStorage siempre es el fallback */ }
  };

  // Guarda en localStorage + archivo vinculado (si existe)
  const guardar = (lista) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
    guardarEnArchivo(lista); // fire-and-forget
  };

  // ── Acciones del archivo ─────────────────────────────────────────────────────
  const abrirArchivo = async () => {
    if (!FILE_API) return;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: "Registros de glucosa (.txt)",
          accept: { "text/plain": [".txt", ".json"] },
        }],
      });
      fileHandleRef.current = handle;
      setFileName(handle.name);
      await idb.set("fileHandle", handle);
      await leerDesdeArchivo(handle);
    } catch (e) {
      if (e.name !== "AbortError") console.error(e);
    }
  };

  const crearArchivo = async () => {
    if (!FILE_API) return;
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "glucosa-registros.txt",
        types: [{
          description: "Registros de glucosa (.txt)",
          accept: { "text/plain": [".txt"] },
        }],
      });
      fileHandleRef.current = handle;
      setFileName(handle.name);
      setFileLinked(true);
      setFileNeedsReconnect(false);
      await idb.set("fileHandle", handle);
      // Escribir registros actuales en el archivo nuevo
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(registros, null, 2));
      await writable.close();
    } catch (e) {
      if (e.name !== "AbortError") console.error(e);
    }
  };

  const reconectarArchivo = async () => {
    if (!fileHandleRef.current) return;
    try {
      const perm = await fileHandleRef.current.requestPermission({ mode: "readwrite" });
      if (perm === "granted") await leerDesdeArchivo(fileHandleRef.current);
    } catch (e) {
      console.error(e);
    }
  };

  const desvincularArchivo = async () => {
    fileHandleRef.current = null;
    setFileLinked(false);
    setFileName("");
    setFileNeedsReconnect(false);
    await idb.set("fileHandle", null);
  };

  // ── CRUD de registros ────────────────────────────────────────────────────────
  const agregar = () => {
    const v = parseFloat(valor);
    if (!v || v < 20 || v > 600) return;
    const nuevo = { id: Date.now(), valor: v, contexto: ctx, fecha };
    const lista = [nuevo, ...registros].sort((a, b) => parseCST(b.fecha) - parseCST(a.fecha));
    setRegistros(lista);
    guardar(lista);
    setValor("");
    setFecha(nowCST());
    setGuardado(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setGuardado(false), 2200);
  };

  const eliminar = (id) => {
    const lista = registros.filter(r => r.id !== id);
    setRegistros(lista);
    guardar(lista);
  };

  // ── Datos derivados ──────────────────────────────────────────────────────────
  const promedio = registros.length
    ? Math.round(registros.reduce((s, r) => s + r.valor, 0) / registros.length)
    : null;
  const ultima    = registros[0];
  const chartData = [...registros].reverse().slice(-20).map(r => ({
    fecha: fmtShort(r.fecha),
    valor: r.valor,
    ctx:   r.contexto,
  }));

  // ── Estilos de tabs ──────────────────────────────────────────────────────────
  const tabStyle = (t) => ({
    padding: "9px 18px", fontSize: 13,
    fontWeight:   tab === t ? 600 : 400,
    color:        tab === t ? "#1d4ed8" : "var(--color-text-secondary)",
    borderBottom: tab === t ? "2px solid #2563eb" : "2px solid transparent",
    background: "none", border: "none", borderRadius: 0, boxShadow: "none",
    cursor: "pointer", transition: "color .15s",
  });

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
        borderRadius: "var(--border-radius-lg)", padding: "1.25rem 1.5rem",
        marginBottom: "1rem", color: "#fff",
        boxShadow: "0 4px 16px rgba(37,99,235,0.30)",
      }}>
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.75, textTransform: "uppercase", marginBottom: 4 }}>
          Monitor personal
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px" }}>
          Control de glucosa
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
          Zona horaria: Centroamérica (UTC-6)
        </div>
      </div>

      {/* ── Banner de archivo vinculado ── */}
      <div style={{
        marginBottom: "1.25rem",
        background:
          fileLinked          ? "#f0fdf4" :
          fileNeedsReconnect  ? "#fffbeb" : "#f0f7ff",
        border: `1.5px solid ${
          fileLinked          ? "#86efac" :
          fileNeedsReconnect  ? "#fcd34d" : "#bfdbfe"
        }`,
        borderRadius: "var(--border-radius-md)",
        padding: "10px 14px",
        display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 10, flexWrap: "wrap",
      }}>
        {/* Texto de estado */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!FILE_API ? (
            <span style={{ fontSize: 12, color: "#dc2626" }}>
              ⚠️ Tu navegador no soporta File System API. Usa Chrome o Edge para vincular archivos.
            </span>
          ) : fileLinked ? (
            <div>
              <div style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                📄 {fileName}
              </div>
              <div style={{ fontSize: 11, color: "#166534", marginTop: 1 }}>
                Sincronización automática activa — cada cambio se guarda en el archivo
              </div>
            </div>
          ) : fileNeedsReconnect ? (
            <div>
              <div style={{ fontSize: 13, color: "#b45309", fontWeight: 600 }}>
                ⚠️ {fileName}
              </div>
              <div style={{ fontSize: 11, color: "#92400e", marginTop: 1 }}>
                El archivo fue vinculado antes. Haz clic en "Reconectar" para reautorizar el acceso.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>
                Sin archivo vinculado
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 1 }}>
                Los registros se guardan solo en este navegador. Vincula un archivo .txt para portabilidad.
              </div>
            </div>
          )}
        </div>

        {/* Botones de acción del archivo */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          {FILE_API && fileNeedsReconnect && (
            <button
              onClick={reconectarArchivo}
              style={{ fontSize: 12, padding: "6px 12px", background: "#d97706", boxShadow: "none" }}
            >
              Reconectar
            </button>
          )}
          {FILE_API && !fileLinked && !fileNeedsReconnect && (
            <>
              <button
                onClick={abrirArchivo}
                style={{ fontSize: 12, padding: "6px 12px" }}
              >
                Abrir archivo
              </button>
              <button
                onClick={crearArchivo}
                style={{ fontSize: 12, padding: "6px 12px", background: "var(--blue-light)", color: "var(--blue-primary)", border: "1.5px solid var(--color-border-primary)", boxShadow: "none" }}
              >
                Crear archivo
              </button>
            </>
          )}
          {fileLinked && (
            <button
              onClick={desvincularArchivo}
              style={{ fontSize: 12, padding: "6px 12px", background: "none", color: "#dc2626", border: "1.5px solid #fca5a5", boxShadow: "none" }}
            >
              Desvincular
            </button>
          )}
        </div>
      </div>

      {/* ── Tarjetas resumen ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        {[
          { label: "Última lectura", val: ultima   ? `${ultima.valor} mg/dL`   : "—", extra: ultima   ? getRango(ultima.valor)   : null },
          { label: "Promedio",       val: promedio ? `${promedio} mg/dL` : "—", extra: promedio ? getRango(promedio) : null },
          { label: "Registros",      val: registros.length, extra: null },
        ].map((c, i) => (
          <div key={i} style={{
            background: "#fff", borderRadius: "var(--border-radius-md)",
            padding: "1rem", borderLeft: "3px solid #2563eb",
            boxShadow: "var(--shadow-sm)",
          }}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
              {c.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{c.val}</div>
            {c.extra && (
              <span style={{ fontSize: 11, background: c.extra.bg, color: c.extra.color, padding: "2px 8px", borderRadius: 99, display: "inline-block", marginTop: 4, fontWeight: 500 }}>
                {c.extra.label}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1.5px solid var(--color-border-tertiary)", marginBottom: "1.25rem" }}>
        {["registro", "historial", "grafica"].map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
            {t === "registro" ? "Registrar" : t === "historial" ? "Historial" : "Gráfica"}
          </button>
        ))}
      </div>

      {/* ── Tab: Registrar ── */}
      {tab === "registro" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 400 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1 }}>
              Glucosa (mg/dL)
            </label>
            <input
              type="number"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="Ej. 95"
              min={20} max={600}
              onKeyDown={e => e.key === "Enter" && agregar()}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1 }}>
              Contexto
            </label>
            <select value={ctx} onChange={e => setCtx(e.target.value)}>
              {CONTEXTOS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1 }}>
              Fecha y hora (Centroamérica)
            </label>
            <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>

          {valor && !isNaN(parseFloat(valor)) && parseFloat(valor) >= 20 && (() => {
            const rng = getRango(parseFloat(valor));
            return (
              <div style={{ background: rng.bg, color: rng.color, border: `1.5px solid ${rng.bg}`, borderRadius: "var(--border-radius-md)", padding: "10px 14px", fontSize: 14, fontWeight: 500 }}>
                {parseFloat(valor)} mg/dL — <strong>{rng.label}</strong>
              </div>
            );
          })()}

          <button
            onClick={agregar}
            style={{ marginTop: 4, background: guardado ? "#16a34a" : "var(--blue-primary)", padding: "11px 20px", fontSize: 14, fontWeight: 600, letterSpacing: 0.3 }}
          >
            {guardado ? "✓ Guardado" : "Agregar lectura"}
          </button>
        </div>
      )}

      {/* ── Tab: Historial ── */}
      {tab === "historial" && (
        <div>
          {registros.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--color-text-tertiary)", fontSize: 14 }}>
              No hay registros aún.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {registros.map(r => {
                const rng = getRango(r.valor);
                return (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "#fff", border: "1.5px solid var(--color-border-tertiary)",
                    borderRadius: "var(--border-radius-md)", padding: "10px 14px",
                    boxShadow: "var(--shadow-sm)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", minWidth: 44 }}>{r.valor}</div>
                      <div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>{r.contexto}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 1 }}>{fmt(r.fecha)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, background: rng.bg, color: rng.color, padding: "3px 9px", borderRadius: 99, fontWeight: 600 }}>
                        {rng.label}
                      </span>
                      <button
                        onClick={() => eliminar(r.id)}
                        style={{ fontSize: 16, padding: "2px 8px", background: "none", color: "var(--color-text-danger)", border: "none", boxShadow: "none" }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Gráfica ── */}
      {tab === "grafica" && (
        <div>
          {chartData.length < 2 ? (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--color-text-tertiary)", fontSize: 14 }}>
              Agrega al menos 2 lecturas para ver la gráfica.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap", fontSize: 11 }}>
                {[
                  { label: "Normal (70–99)",         color: "#3B6D11" },
                  { label: "Pre-diabetes (100–125)", color: "#854F0B" },
                  { label: "Alto (≥126)",            color: "#A32D2D" },
                  { label: "Bajo (<70)",             color: "#185FA5" },
                ].map(l => (
                  <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--color-text-secondary)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: "inline-block", flexShrink: 0 }} />
                    {l.label}
                  </span>
                ))}
              </div>
              <div style={{ background: "#fff", borderRadius: "var(--border-radius-lg)", padding: "1rem", boxShadow: "var(--shadow-sm)", border: "1.5px solid var(--color-border-tertiary)" }}>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(37,99,235,0.08)" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis domain={[40, "auto"]} tick={{ fontSize: 10, fill: "#94a3b8" }} unit=" mg" />
                    <Tooltip
                      formatter={(v, n, p) => [`${v} mg/dL — ${getRango(v).label}`, p.payload.ctx]}
                      labelStyle={{ fontSize: 12, color: "#0f172a" }}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #dbeafe" }}
                    />
                    <ReferenceLine y={70}  stroke="#185FA5" strokeDasharray="4 2" label={{ value: "70",  fontSize: 10, fill: "#185FA5" }} />
                    <ReferenceLine y={100} stroke="#3B6D11" strokeDasharray="4 2" label={{ value: "100", fontSize: 10, fill: "#3B6D11" }} />
                    <ReferenceLine y={126} stroke="#A32D2D" strokeDasharray="4 2" label={{ value: "126", fontSize: 10, fill: "#A32D2D" }} />
                    <Line type="monotone" dataKey="valor" stroke="#2563eb" strokeWidth={2.5}
                      dot={{ r: 4, fill: "#2563eb", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Pie: exportar ── */}
      <div style={{ marginTop: "1.75rem", paddingTop: 14, borderTop: "1.5px solid var(--color-border-tertiary)", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => {
            if (!registros.length) return;
            const csv = [
              "Fecha,Glucosa (mg/dL),Contexto,Rango",
              ...registros.map(r => `${fmt(r.fecha)},${r.valor},${r.contexto},${getRango(r.valor).label}`),
            ].join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            a.download = "glucosa.csv";
            a.click();
          }}
          style={{ fontSize: 13, background: "var(--blue-light)", color: "var(--blue-primary)", border: "1.5px solid var(--color-border-primary)", padding: "8px 14px", boxShadow: "none" }}
        >
          Exportar CSV
        </button>
        <button
          onClick={() => {
            if (!registros.length) return;
            const txt = registros
              .map(r => `${fmt(r.fecha)} | ${r.valor} mg/dL | ${r.contexto} | ${getRango(r.valor).label}`)
              .join("\n");
            navigator.clipboard.writeText(txt).then(() => alert("¡Copiado al portapapeles!"));
          }}
          style={{ fontSize: 13, background: "var(--blue-light)", color: "var(--blue-primary)", border: "1.5px solid var(--color-border-primary)", padding: "8px 14px", boxShadow: "none" }}
        >
          Copiar como texto
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-text-tertiary)" }}>
        Rangos de referencia: ADA 2024. Esta app es informativa, no reemplaza consulta médica.
      </div>
    </div>
  );
}
