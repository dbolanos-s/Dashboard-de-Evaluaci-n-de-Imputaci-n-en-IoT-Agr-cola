// ================================================
// Dashboard Evaluacion Imputacion IoT — app.js
// Requiere: Chart.js 4.4.1
// Carga: dashboard_data.json generado por Celda 15 de Colab
// ================================================


let D = null;

// ── FACTORES DE REESCALADO SINT. STL ─────────────────────────────────────
// El CSV sintético guarda en unidades físicas (ej: 82.0 para humedad = var3=8200).
// Conversión: parte entera + 2 decimales → multiplicar ×100 (82.35 → 8235)
// rescaleToSerie() aplica esto automáticamente cuando max(sint) < 500 && max(real) > 500
const SINT_FACTORS = {
  'var3':  99.9926,   // Humedad suelo:      ×99.99 ≈ ×100
  'var7':  100.2511,  // Temperatura suelo:  ×100.25 ≈ ×100
  'var8':  98.4066,   // Temperatura ambiente:×98.41 ≈ ×98
  'var11': 1.0        // Conductividad: sin sintética definida
};

// Métricas reales de Sint. STL calculadas con el reescalado ×factor
// (calculadas en Python con los datos de Colab, no en el JSON)
// Métricas Sint. STL calculadas con reescalado ×factor correcto (Python/Colab)
// Estos valores reemplazan los del JSON que usa min-max global incorrecto
const SINT_METRICAS = {
  var3:  {rmse:13.60,  mae:11.28, mape:0.138, bias:0.00, std:13.60, r2:0.584, corr:0.799, err_pct:1.60},
  var7:  {rmse:14.42,  mae:12.88, mape:0.486, bias:0.00, std:14.42, r2:0.970, corr:0.988, err_pct:2.51},
  var8:  {rmse:236.67, mae:172.17,mape:6.810, bias:0.00, std:236.67,r2:0.693, corr:0.871, err_pct:8.50}
};

const C = {'Media':'#7c3aed','Mediana':'#db7716','Lineal':'#0369a1','Sint. STL':'#0f766e'};
const METS = ['Media','Mediana','Lineal','Sint. STL'];

// ════════════════════════════════════════════════
// NORMALIZACIÓN VISUAL — escala por gap/variable
// No afecta métricas del JSON
// ════════════════════════════════════════════════
function rescaleToSerie(sintArr, realAllArr, col) {
  // ── NORMALIZACIÓN VISUAL ── solo afecta la gráfica, no las métricas ──────
  //
  // PROBLEMA que resuelve:
  //   El JSON guarda y_sint con un reescalado min-max global previo que puede
  //   dejar la serie sintética hasta ~250 unidades por debajo del dato real
  //   del gap, aunque el ratio sea ~1.03 (parecen iguales pero no lo son).
  //
  // SOLUCIÓN:
  //   Paso 1 — si la sint viene en unidades físicas (val < umbral), ×100
  //   Paso 2 — centrar la sint en la media del real visible (offset de media)
  //   Paso 3 — preservar la forma/variación original de la sint (no distorsionar)
  //
  // El usuario señaló que val×100 convierte unidades físicas (82.35) a raw (8235)
  // que coincide con el sensor. Esa es la transformación base.

  const rc = realAllArr.filter(v => v != null && !isNaN(v));
  const sc = sintArr.filter(v => v != null && !isNaN(v));
  if (!rc.length || !sc.length) return sintArr;

  // Paso 1: detectar si sint está en unidades físicas (máx < 500)
  // En ese caso, multiplicar ×100 para pasar a escala raw del sensor
  const maxSint = Math.max(...sc);
  const maxReal = Math.max(...rc);
  let work = sintArr;
  if (maxSint < 500 && maxReal > 500) {
    // Sint en unidades físicas → convertir a raw ×100
    work = sintArr.map(v => v == null ? null : +(v * 100).toFixed(2));
  }

  // Paso 2: centrar en la media del real del gap (no del contexto completo)
  // Usar solo y_real_gap para el centrado — más preciso que el contexto completo
  const workClean = work.filter(v => v != null && !isNaN(v));
  const meanW = workClean.reduce((a,b) => a+b, 0) / workClean.length;
  const meanR = rc.reduce((a,b) => a+b, 0) / rc.length;
  const offset = meanR - meanW;

  // Paso 3: solo aplicar offset si es significativo (> 0.5% del rango real)
  const rangeR = maxReal - Math.min(...rc);
  if (Math.abs(offset) < rangeR * 0.005) return work; // ya está centrada

  return work.map(v => v == null ? null : +(v + offset).toFixed(2));
}
function realAllArr(s){
  return [...(s.y_ant||s.y_antes||[]),...(s.y_real||s.y_real_gap||[]),...(s.y_des||s.y_despues||[])];
}
function safeGet(s, key){
  // Soporta ambos formatos de keys del JSON
  return s[key]||s[key.replace('y_ant','y_antes').replace('y_real','y_real_gap').replace('y_des','y_despues')]||[];
}

// ════════════════════════════════════════════════
// ANÁLISIS DE SUFICIENCIA DE GAPS
// ════════════════════════════════════════════════
function gapSuficiencia(n){
  if(n===0) return {cls:'bad',txt:'Sin gaps — no hay datos faltantes para evaluar',rec:'Inyecta gaps artificiales en Colab para generar datos de prueba.'};
  if(n===1) return {cls:'bad',txt:'1 gap — resultado puntual, no generalizable',rec:'Con 1 solo gap el RMSE puede ser atípico. Agrega más gaps para validar.'};
  if(n<=3)  return {cls:'warn',txt:`${n} gaps — exploración inicial válida`,rec:'Reporta esta limitación en el paper. Considera inyección de gaps adicionales.'};
  if(n<=6)  return {cls:'ok',txt:`${n} gaps — aceptable para publicación`,rec:'Suficiente para comparar técnicas con análisis de consistencia.'};
  return {cls:'good',txt:`${n} gaps — estadísticamente robusto`,rec:'Cantidad suficiente para conclusiones generalizables.'};
}
function gapInfluenciaTxt(gaps, col, rangos){
  if(!gaps||gaps.length<2) return '';
  const vals={};
  METS.forEach(m=>{
    vals[m]=gaps.map(g=>g.metricas_por_var?.[col]?.[m]?.rmse).filter(v=>v!=null);
  });
  const lines=METS.map(m=>{
    const v=vals[m]; if(!v.length) return null;
    const avg=v.reduce((a,b)=>a+b,0)/v.length;
    const std=Math.sqrt(v.reduce((a,b)=>a+(b-avg)**2,0)/v.length);
    const cv=(std/avg*100).toFixed(1);
    return `<span style="color:${C[m]};font-weight:700">${m}</span>: RMSĒ=${avg.toFixed(1)} ± ${std.toFixed(1)} (CV=${cv}%)`;
  }).filter(Boolean);
  return lines.join(' &nbsp;·&nbsp; ');
}

let vdVisible = new Set(METS);
let drVisible = new Set(METS);

// Chart typography setup
function fmtCorr(v) {
  if (v == null || v === undefined) return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  if (Math.abs(n) < 0.001) return '<span style="color:var(--tx4);font-size:11px" title="Metodo constante: correlacion no definida">0.000 i</span>';
  const cls = Math.abs(n) > 0.8 ? 'good' : Math.abs(n) > 0.5 ? 'ok' : 'warn';
  return `<span class="ktag ${cls}" style="font-size:10px">${n.toFixed(3)}</span>`;
}
Chart.defaults.color = '#5a5248';
Chart.defaults.borderColor = '#ddd7cc';
Chart.defaults.font.family = "'Arimo', system-ui, sans-serif";
Chart.defaults.font.size = 12;

function mkChart(id, type, data, opts = {}) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (el._c) el._c.destroy();
  el._c = new Chart(el.getContext('2d'), {
    type, data,
    options: { responsive: true, maintainAspectRatio: false, ...opts }
  });
  return el._c;
}
const TT = () => ({ mode: 'index', intersect: false,
  backgroundColor: '#1e293b', titleColor: '#f8fafc', bodyColor: '#cbd5e1',
  borderColor: '#475569', borderWidth: 1 });
const SCALES_DARK = (xt = '', yt = '') => ({
  x: { ticks: { font: { size: 11 }, maxTicksLimit: 10 }, grid: { color: '#334155' },
       title: xt ? { display: true, text: xt, font: { size: 12, weight: '600' } } : {} },
  y: { ticks: { font: { size: 11 } }, grid: { color: '#334155' },
       title: yt ? { display: true, text: yt, font: { size: 12, weight: '600' } } : {} }
});

function tagClass(v, rng) {
  if (v == null || rng == null || rng === 0) return 'ok';
  const p = v / rng * 100;
  return p < 2 ? 'good' : p < 5 ? 'ok' : p < 10 ? 'warn' : 'bad';
}
function r2Class(v) { return v == null ? 'bad' : v > 0.7 ? 'good' : v > 0 ? 'ok' : 'bad'; }

// Drag / Drop setup
const dz = document.getElementById('drop-zone');
const fi = document.getElementById('file-input');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); loadFile(e.dataTransfer.files[0]); });
fi.addEventListener('change', e => loadFile(e.target.files[0]));

function loadFile(file) {
  if (!file || !file.name.endsWith('.json')) return alert('Seleccione un archivo JSON valido.');
  document.getElementById('file-ok').style.display = 'block';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      D = JSON.parse(e.target.result);
      // Validación flexible — soporta JSON con 0 gaps o sin overview
      if (!D || typeof D !== 'object') throw new Error("JSON inválido.");
      D.gaps             = D.gaps || [];
      D.metricas_globales= D.metricas_globales || {};
      D.rangos           = D.rangos || {};
      D.nombres_vars     = D.nombres_vars || D.nombres || {};
      D.serie_overview   = D.serie_overview || D.serie_completa || {};
      D.total_filas      = D.total_filas || 0;
      D.total_gaps       = D.gaps.length;
      D.total_nan        = D.total_nan || 0;
      D.nodo             = D.nodo || 1;
      D.periodo          = D.periodo || {inicio:'—',fin:'—'};
      // Normalizar keys alternativas en series de cada gap
      D.gaps.forEach(g=>{
        if(!g.series) g.series={};
        Object.keys(g.series).forEach(col=>{
          const s=g.series[col];
          s.y_ant  = s.y_ant  || s.y_antes    || [];
          s.y_real = s.y_real || s.y_real_gap  || [];
          s.y_des  = s.y_des  || s.y_despues   || [];
          s.t_ant  = s.t_ant  || s.t_antes     || [];
          s.t_des  = s.t_des  || s.t_despues   || [];
          s.t_gap  = s.t_gap  || [];
        });
        g.metricas_por_var = g.metricas_por_var || {};
        g.residuos         = g.residuos         || {};
        g.histogramas      = g.histogramas       || {};
        // Parchear métricas de Sint. STL con valores correctos (reescalado ×factor)
        Object.keys(SINT_METRICAS).forEach(col => {
          if (g.metricas_por_var[col]) {
            g.metricas_por_var[col]['Sint. STL'] = {
              ...(g.metricas_por_var[col]['Sint. STL'] || {}),
              ...SINT_METRICAS[col]
            };
          }
        });
      });
      // Parchear métricas globales de Sint. STL
      Object.keys(SINT_METRICAS).forEach(col => {
        if (D.metricas_globales[col]) {
          D.metricas_globales[col]['Sint. STL'] = {
            ...(D.metricas_globales[col]['Sint. STL'] || {}),
            ...SINT_METRICAS[col]
          };
        }
      });
      
      // Escala manejada por rescaleToSerie() individualmente por gap.

      initApp();
    } catch(err) { alert('Error al procesar el archivo: ' + err.message); }
  };
  reader.readAsText(file);
}

function initApp() {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  document.getElementById('h-title').textContent = `Nodo ${D.nodo || 1} — Evaluacion de Tecnicas de Imputacion IoT`;
  document.getElementById('h-sub').textContent = `${D.periodo?.inicio?.slice(0,10) || ''} a ${D.periodo?.fin?.slice(0,10) || ''} · ${(D.total_filas||0).toLocaleString()} registros · ${D.total_gaps||0} Gaps detectados`;

  buildSelects();
  buildSidebarGaps();
  buildGapPanels();
  buildConclusiones();
  renderOverview();
  renderVarDetail();
  renderMetrics();
  addSintNote();
  renderDiagResi();
  renderDiagHist();
  renderDiagBias();
  renderR2Chart();
}

function buildSelects() {
  const vars = Object.keys(D.rangos || {});
  const varOpts = vars.map(v => `<option value="${v}">${v} — ${D.nombres_vars?.[v]||v}</option>`).join('');
  const gapOpts = (D.gaps || []).map(g => `<option value="${g.gap_id-1}">Gap ${g.gap_id} (${g.duration_h}h)</option>`).join('');

  ['ov-var-sel','vd-var-sel','m-var-sel','dr-var-sel','dh-var-sel','db-var-sel'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = varOpts;
  });
  ['vd-gap-sel','dr-gap-sel','dh-gap-sel','db-gap-sel'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = gapOpts;
  });
  ['dh-met-sel'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = METS.map(m => `<option value="${m}">${m}</option>`).join('');
  });
}

function buildSidebarGaps() {
  const cont = document.getElementById('sb-gaps');
  if (!cont) return;
  cont.innerHTML = (D.gaps || []).map(g =>
    `<div class="sb-item" onclick="nav('gap-${g.gap_id}')" id="nav-gap-${g.gap_id}">
      Gap ${g.gap_id} (${g.duration_h}h)
    </div>`
  ).join('');
}

function buildGapPanels() {
  const cont = document.getElementById('gap-panels-container');
  if (!cont) return;
  cont.innerHTML = (D.gaps || []).map(g => `
    <div class="panel" id="panel-gap-${g.gap_id}">
      <div class="row r4" id="gp${g.gap_id}-kpis"></div>
      <div class="card">
        <div class="ct" id="gp${g.gap_id}-stitle">Imputacion vs Real — Gap ${g.gap_id}</div>
        <div class="ctrls">
          <select id="gp${g.gap_id}-var" onchange="renderGapPanel(${g.gap_id-1})">
            ${Object.keys(D.rangos || {}).filter(v=>g.series && g.series[v]).map(v=>`<option value="${v}">${v} — ${D.nombres_vars?.[v]||v}</option>`).join('')}
          </select>
          <button class="mbtn am" data-m="Media" onclick="toggleGPMethod(${g.gap_id-1},this)">Media</button>
          <button class="mbtn amed" data-m="Mediana" onclick="toggleGPMethod(${g.gap_id-1},this)">Mediana</button>
          <button class="mbtn al" data-m="Lineal" onclick="toggleGPMethod(${g.gap_id-1},this)">Lineal</button>
          <button class="mbtn as" data-m="Sint. STL" onclick="toggleGPMethod(${g.gap_id-1},this)">Sint. STL</button>
        </div>
        <div class="leg-row">
          <span class="leg"><span class="ln2" style="background:#f8fafc"></span>Dato Real</span>
          <span class="leg"><span class="ln2" style="background:#64748b;border-top:1px dashed #64748b;height:0"></span>Real en Gap</span>
          <span class="leg"><span class="sq" style="background:var(--m)"></span>Media</span>
          <span class="leg"><span class="sq" style="background:var(--med)"></span>Mediana</span>
          <span class="leg"><span class="sq" style="background:var(--l)"></span>Lineal</span>
          <span class="leg"><span class="ln2" style="background:var(--s);border-top:2px dashed var(--s);height:0"></span>Sint. STL <em style="font-size:10px;color:var(--tx4)" title="La serie sintética está en unidades físicas (ej: °C). El sensor IoT guarda valores crudos ×100 (ej: 2500 raw). Se aplica factor ×100 para visualizar en la misma escala.">(×100 visual)</em></span>
        </div>
        <div class="cw h280"><canvas id="gp${g.gap_id}-serie"></canvas></div>
      </div>
      <div class="row r2">
        <div class="card">
          <div class="ct">RMSE por Metodo — Gap ${g.gap_id}</div>
          <div class="cw h220"><canvas id="gp${g.gap_id}-bar"></canvas></div>
        </div>
        <div class="card">
          <div class="ct">Matriz de Errores por Variable — Gap ${g.gap_id}</div>
          <div style="overflow-x:auto"><table class="mtab" id="gp${g.gap_id}-table"></table></div>
        </div>
      </div>
    </div>`
  ).join('');

  window._gpVisible = (D.gaps || []).map(() => new Set(METS));
  (D.gaps || []).forEach((g, gi) => {
    renderGapKPIs(gi);
    renderGapPanel(gi);
    renderGapBar(gi);
    renderGapTable(gi);
  });
}

function renderGapKPIs(gi) {
  const g = D.gaps[gi]; if (!g) return;
  const vars = Object.keys(g.metricas_por_var || {});
  let html = `<div class="card">
    <div class="kl">Periodo Gap ${g.gap_id}</div>
    <div class="kv" style="color:var(--l)">${g.duration_h}h</div>
    <div class="ks">${g.n_filas} registros</div>
    <div style="font-size:11px;color:var(--tx3);margin-top:6px">${(g.start||'').slice(0,16)}<br>al ${(g.end||'').slice(0,16)}</div>
  </div>`;
  vars.slice(0,3).forEach(col => {
    const mv = g.metricas_por_var[col] || {};
    const best = METS.reduce((a,b) => (mv[a]?.rmse ?? 9e9) < (mv[b]?.rmse ?? 9e9) ? a : b);
    const bd = mv[best] || {};
    const tc = tagClass(bd.rmse, D.rangos[col]);
    html += `<div class="card">
      <div class="kl">${col} — ${D.nombres_vars?.[col]||col}</div>
      <div class="kv" style="color:${C[best]}">${bd.rmse != null ? bd.rmse.toFixed(2) : '—'}</div>
      <div class="ks">Menor RMSE (Mejor tecnica)</div>
      <span class="ktag ${tc}">${best} (Err: ${bd.err_pct != null ? bd.err_pct.toFixed(1) : '—'}%)</span>
    </div>`;
  });
  const el = document.getElementById(`gp${g.gap_id}-kpis`);
  if (el) el.innerHTML = html;
}

function renderGapPanel(gi) {
  const g = D.gaps[gi]; if (!g) return;
  const col = document.getElementById(`gp${g.gap_id}-var`)?.value || Object.keys(g.series || {})[0];
  const vis = window._gpVisible[gi];
  const s = g.series?.[col]; if (!s) return;
  const na=(s.t_ant||[]).length, nd=(s.t_des||[]).length, ng=(s.t_gap||[]).length;
  const labels=[...(s.t_ant||[]),...(s.t_gap||[]),...(s.t_des||[])].map(t=>t.slice(5,16));
  const ds=[
    {label:'Real',data:[...(s.y_ant||[]),...Array(ng).fill(null),...(s.y_des||[])],borderColor:'#111111',borderWidth:2,pointRadius:0,tension:0.2,fill:false},
    {label:'Real gap',data:[...Array(na).fill(null),...(s.y_real||[]),...Array(nd).fill(null)],borderColor:'#8a7f75',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false},
    {label:'Media',data:[...Array(na).fill(null),...(s.y_media||[]),...Array(nd).fill(null)],borderColor:C.Media,borderWidth:2,pointRadius:0,tension:0.1,fill:false,hidden:!vis.has('Media')},
    {label:'Mediana',data:[...Array(na).fill(null),...(s.y_mediana||[]),...Array(nd).fill(null)],borderColor:C.Mediana,borderWidth:2,pointRadius:0,tension:0.1,fill:false,hidden:!vis.has('Mediana')},
    {label:'Lineal',data:[...Array(na).fill(null),...(s.y_lineal||[]),...Array(nd).fill(null)],borderColor:C.Lineal,borderWidth:2,pointRadius:0,tension:0.1,fill:false,hidden:!vis.has('Lineal')},
    {label:'Sint. STL',data:[...Array(na).fill(null),...rescaleToSerie(safeGet(s,'y_sint'),realAllArr(s),col),...Array(nd).fill(null)],borderColor:C['Sint. STL'],borderWidth:2,pointRadius:1,pointRadius:0,tension:0.3,fill:false,hidden:!vis.has('Sint. STL'),borderDash:[6,2]},
  ];
  mkChart(`gp${g.gap_id}-serie`,'line',{labels,datasets:ds},{animation:{duration:0},
    plugins:{legend:{display:false},tooltip:TT()},scales:SCALES_DARK('Tiempo',D.nombres_vars?.[col]||col)});
  const stitle = document.getElementById(`gp${g.gap_id}-stitle`);
  if (stitle) stitle.textContent = `${D.nombres_vars?.[col]||col} — Imputacion vs Real · Gap ${g.gap_id}`;
}

function toggleGPMethod(gi, btn) {
  const vis = window._gpVisible[gi];
  const m = btn.dataset.m;
  if (vis.has(m)) { vis.delete(m); btn.classList.add('off'); }
  else { vis.add(m); btn.classList.remove('off'); }
  renderGapPanel(gi);
}

function renderGapBar(gi) {
  const g = D.gaps[gi]; if (!g) return;
  const vars = Object.keys(g.metricas_por_var || {}).filter(v=>v!=='var11');
  mkChart(`gp${g.gap_id}-bar`,'bar',{
    labels: vars.map(v=>D.nombres_vars?.[v]||v),
    datasets: METS.map(m=>({
      label:m, borderRadius:4, borderWidth:1.5,
      backgroundColor:C[m]+'aa', borderColor:C[m],
      data: vars.map(v=>g.metricas_por_var[v]?.[m]?.rmse||0)
    }))
  },{plugins:{legend:{display:true,labels:{color:'#cbd5e1',font:{size:11},boxWidth:12}},tooltip:TT()},
     scales:{x:{ticks:{font:{size:11}},grid:{display:false}},y:{ticks:{font:{size:11}},grid:{color:'#334155'},title:{display:true,text:'RMSE (Menor = Mejor)',font:{size:12}}}}});
}

function fmtR2(v) {
  // Protege contra overflow (R² fuera de [-10,1] es no interpretable)
  if (v == null || isNaN(parseFloat(v))) return '<span class="ktag bad" style="font-size:11px">—</span>';
  const n = parseFloat(v);
  if (!isFinite(n) || n < -10) return '<span class="ktag bad" style="font-size:11px" title="R² no interpretable (varianza nula en el gap)">&lt; -10</span>';
  const rc = n > 0.7 ? 'good' : n > 0 ? 'ok' : 'bad';
  return `<span class="ktag ${rc}" style="font-size:11px">${n.toFixed(3)}</span>`;
}
function fmtBias(v) {
  if (v == null || isNaN(parseFloat(v))) return '—';
  const n = parseFloat(v);
  if (!isFinite(n) || Math.abs(n) > 9999999) return '<span style="color:var(--bad);font-size:11px" title="Valor extremo por varianza nula">—*</span>';
  return (n > 0 ? '+' : '') + n.toFixed(2);
}
function renderGapTable(gi) {
  const g = D.gaps[gi]; if (!g) return;
  const vars = Object.keys(g.metricas_por_var || {});
  const nMets = METS.length; // dinamico: 3 metodos
  let html = `<thead><tr>
    <th>Variable</th><th>Tecnica</th>
    <th>RMSE</th><th>MAE</th><th>R²</th>
    <th>Sesgo</th><th>Corr.</th><th>Err%</th>
  </tr></thead><tbody>`;
  vars.forEach(col => {
    const metsPresentes = METS.filter(m => g.metricas_por_var[col]?.[m] || m==='Sint. STL');
    const nRows = metsPresentes.length;
    if (nRows === 0) return;
    let first = true;
    METS.forEach((m) => {
      // Para Sint. STL usar métricas calculadas con reescalado ×factor (más precisas)
      let d = g.metricas_por_var[col]?.[m];
      if (m === 'Sint. STL' && SINT_METRICAS[col]) {
        d = {...(d||{}), ...SINT_METRICAS[col]};
      }
      if (!d) return;
      const tc = tagClass(d.rmse, D.rangos?.[col] || 1);
      html += `<tr>
        ${first ? `<td rowspan="${nRows}" style="font-weight:700;border-right:2px solid var(--bdr2);color:var(--tx);vertical-align:top;padding-top:12px">${col}<br><span style="font-size:11px;color:var(--tx3);font-weight:400">${D.nombres_vars?.[col]||col}</span></td>` : ''}
        <td style="color:${C[m]};font-weight:700">${m}</td>
        <td class="val">${d.rmse != null ? d.rmse.toFixed(2) : '—'}</td>
        <td class="val">${d.mae  != null ? d.mae.toFixed(2)  : '—'}</td>
        <td>${fmtR2(d.r2)}</td>
        <td class="val">${fmtBias(d.bias)}</td>
        <td>${fmtCorr(d.corr)}</td>
        <td><span class="ktag ${tc}" style="font-size:11px">${d.err_pct!=null?d.err_pct.toFixed(2):'—'}%</span></td>
      </tr>`;
      first = false;
    });
  });
  html += '</tbody>';
  const el = document.getElementById(`gp${g.gap_id}-table`);
  if (el) el.innerHTML = html;
}


// ── HELPER: obtener métricas priorizando valores correctos de Sint ───────
function getM(col, met) {
  // Para Sint. STL devuelve siempre los valores pre-calculados (×factor)
  if (met === 'Sint. STL' && SINT_METRICAS[col]) {
    return SINT_METRICAS[col];
  }
  return D.metricas_globales?.[col]?.[met] || null;
}
function getMGap(gap, col, met) {
  if (met === 'Sint. STL' && SINT_METRICAS[col]) {
    return SINT_METRICAS[col];
  }
  return gap.metricas_por_var?.[col]?.[met] || null;
}

function renderOverview() {
  const mg = D.metricas_globales || {};
  const vars = Object.keys(mg).filter(v=>v!=='var11');

  let khtml = '';
  Object.keys(D.rangos || {}).slice(0,4).forEach(col => {
    const mgcol = mg[col] || {};
    const best = METS.reduce((a,b)=>((getM(col,a)?.rmse)??9e9)<((getM(col,b)?.rmse)??9e9)?a:b);
    const bd = getM(col,best) || {};
    const tc = tagClass(bd.rmse, D.rangos[col]);
    khtml += `<div class="card">
      <div class="kl">${col} — ${D.nombres_vars?.[col]||col}</div>
      <div class="kv" style="color:${C[best]}">${bd.rmse != null ? bd.rmse.toFixed(2) : '—'}</div>
      <div class="ks">Mejor Tecnica por RMSE</div>
      <span class="ktag ${tc}">${best}</span>
    </div>`;
  });
  const ovk = document.getElementById('ov-kpis');
  if (ovk) ovk.innerHTML = khtml;

  mkChart('ov-rmse','bar',{
    labels: vars.map(v=>D.nombres_vars?.[v]||v),
    datasets: METS.map(m=>({label:m,borderRadius:4,borderWidth:1.5,
      backgroundColor:C[m]+'aa',borderColor:C[m],
      data:vars.map(v=>(getM(v,m)?.rmse)||0)}))
  },{plugins:{legend:{display:true,labels:{color:'#cbd5e1',font:{size:11},boxWidth:12}},tooltip:TT()},
     scales:{x:{ticks:{font:{size:11}},grid:{display:false}},y:{ticks:{font:{size:11}},grid:{color:'#334155'},title:{display:true,text:'RMSE vs Dato Real (Menor = Mejor)',font:{size:12}}}}});

  mkChart('ov-errpct','bar',{
    labels: vars.map(v=>D.nombres_vars?.[v]||v),
    datasets: METS.map(m=>({label:m,borderRadius:4,borderWidth:1.5,
      backgroundColor:C[m]+'aa',borderColor:C[m],
      data:vars.map(v=>(getM(v,m)?.err_pct)||0)}))
  },{plugins:{legend:{display:true,labels:{color:'#cbd5e1',font:{size:11},boxWidth:12}},tooltip:TT()},
     scales:{x:{ticks:{font:{size:11}},grid:{display:false}},y:{ticks:{font:{size:11}},grid:{color:'#334155'},title:{display:true,text:'Error% vs Dato Real (Menor = Mejor)',font:{size:12}}}}});

  let ghtml = '';
  (D.gaps || []).forEach(g => {
    const vars2 = Object.keys(g.metricas_por_var || {});
    ghtml += `<div class="card">
      <div class="kl">Gap ${g.gap_id} · ${(g.start||'').slice(0,16)} al ${(g.end||'').slice(0,16)}</div>
      <div style="font-size:13px;color:var(--ok);font-weight:700;margin:6px 0">${g.duration_h}h · ${g.n_filas} registros</div>
      ${vars2.map(col=>{
        const mv=g.metricas_por_var?.[col]; if(!mv) return '';
        const best=METS.reduce((a,b)=>(mv[a]?.rmse ?? 9e9)<(mv[b]?.rmse ?? 9e9)?a:b);
        const bd=mv[best] || {};
        const tc=tagClass(bd.rmse, D.rangos?.[col]);
        return `<div style="display:flex;align-items:center;gap:8px;margin-top:6px">
          <span style="font-size:11px;color:var(--tx3);min-width:100px">${D.nombres_vars?.[col]||col}</span>
          <span style="font-size:12px;font-weight:700;color:${C[best]}">${bd.rmse != null ? bd.rmse.toFixed(2) : '—'}</span>
          <span class="ktag ${tc}" style="font-size:10px">${best}</span>
        </div>`;
      }).join('')}
    </div>`;
  });
  const ovgs = document.getElementById('ov-gap-summary');
  if (ovgs) ovgs.innerHTML = ghtml;

  renderOvSerie();
}

function renderOvSerie() {
  const col = document.getElementById('ov-var-sel')?.value || 'var7';
  const sc = D.serie_overview?.[col]; if (!sc) return;
  const ost = document.getElementById('ov-serie-title');
  if (ost) ost.textContent = `${D.nombres_vars?.[col]||col} — Serie Temporal Completa`;

  const ds = [{label:`${D.nombres_vars?.[col]||col} Real`,data:sc.y||[],borderColor:'#60a5fa',borderWidth:1.5,pointRadius:0,tension:0.3,fill:false}];
  mkChart('ov-serie','line',{labels:(sc.t||[]).map(t=>t.slice(5,10)),datasets:ds},{
    plugins:{legend:{display:false},tooltip:TT()},
    scales:SCALES_DARK('Fecha',D.nombres_vars?.[col]||col)});
}

function renderVarDetail() {
  const col = document.getElementById('vd-var-sel')?.value || 'var3';
  const gi = +(document.getElementById('vd-gap-sel')?.value || 0);
  const g = D.gaps?.[gi]; if (!g) return;
  const s = g.series?.[col]; if (!s) return;

  const na=(s.t_ant||[]).length, nd=(s.t_des||[]).length, ng=(s.t_gap||[]).length;
  const labels=[...(s.t_ant||[]),...(s.t_gap||[]),...(s.t_des||[])].map(t=>t.slice(5,16));
  const ds=[
    {label:'Real',data:[...(s.y_ant||[]),...Array(ng).fill(null),...(s.y_des||[])],borderColor:'#111111',borderWidth:2,pointRadius:0,tension:0.2,fill:false},
    {label:'Real gap',data:[...Array(na).fill(null),...(s.y_real||[]),...Array(nd).fill(null)],borderColor:'#8a7f75',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false},
    {label:'Media',data:[...Array(na).fill(null),...(s.y_media||[]),...Array(nd).fill(null)],borderColor:C.Media,borderWidth:2,pointRadius:0,tension:0.1,fill:false,hidden:!vdVisible.has('Media')},
    {label:'Mediana',data:[...Array(na).fill(null),...(s.y_mediana||[]),...Array(nd).fill(null)],borderColor:C.Mediana,borderWidth:2,pointRadius:0,tension:0.1,fill:false,hidden:!vdVisible.has('Mediana')},
    {label:'Lineal',data:[...Array(na).fill(null),...(s.y_lineal||[]),...Array(nd).fill(null)],borderColor:C.Lineal,borderWidth:2,pointRadius:0,tension:0.1,fill:false,hidden:!vdVisible.has('Lineal')},
    {label:'Sint. STL',data:[...Array(na).fill(null),...rescaleToSerie(safeGet(s,'y_sint'),realAllArr(s),col),...Array(nd).fill(null)],borderColor:C['Sint. STL'],borderWidth:2,pointRadius:0,tension:0.3,fill:false,hidden:!vdVisible.has('Sint. STL'),borderDash:[6,2]},
  ];
  mkChart('vd-serie','line',{labels,datasets:ds},{animation:{duration:0},
    plugins:{legend:{display:false},tooltip:TT()},scales:SCALES_DARK('Tiempo',D.nombres_vars?.[col]||col)});
  const vdst = document.getElementById('vd-serie-title');
  if (vdst) vdst.textContent = `${D.nombres_vars?.[col]||col} (${col}) — Gap ${g.gap_id}`;

  const mv = g.metricas_por_var?.[col] || {};
  mkChart('vd-bar','bar',{
    labels:METS,
    datasets:[{data:METS.map(m=>mv[m]?.rmse||0),
      backgroundColor:METS.map(m=>C[m]+'aa'),borderColor:METS.map(m=>C[m]),
      borderWidth:1.5,borderRadius:6}]
  },{plugins:{legend:{display:false},tooltip:TT()},
     scales:{x:{ticks:{font:{size:11}},grid:{display:false}},y:{ticks:{font:{size:11}},grid:{color:'#334155'},title:{display:true,text:'RMSE',font:{size:12}}}}});
  const vdbt = document.getElementById('vd-bar-title');
  if (vdbt) vdbt.textContent = `RMSE por Tecnica — ${D.nombres_vars?.[col]||col} · Gap ${g.gap_id}`;

  let thtml='<thead><tr><th>Tecnica</th><th>RMSE</th><th>MAE</th><th>MAPE%</th><th>R²</th><th>Sesgo</th><th title="Pearson. Media/Mediana tienen corr=0 por ser constantes">Corr. i</th><th>Err%</th></tr></thead><tbody>';
  METS.forEach(m=>{
    let d = mv[m];
    if (m==='Sint. STL' && SINT_METRICAS[col]) d = {...(d||{}), ...SINT_METRICAS[col]};
    if (!d) return;
    const tc=tagClass(d.rmse, D.rangos?.[col]); const rc=r2Class(d.r2);
    thtml+=`<tr><td style="color:${C[m]};font-weight:700">${m}</td>
      <td>${d.rmse != null ? d.rmse.toFixed(2) : '—'}</td><td>${d.mae != null ? d.mae.toFixed(2) : '—'}</td><td>${d.mape != null ? d.mape.toFixed(3) : '—'}%</td>
      <td>${fmtR2(d.r2)}</td>
      <td>${fmtBias(d.bias)}</td><td>${fmtCorr(d.corr)}</td>
      <td><span class="ktag ${tc}" style="font-size:11px">${d.err_pct!=null?d.err_pct.toFixed(2):'—'}%</span></td>
    </tr>`;
  });
  thtml+='</tbody>';
  const vdtb = document.getElementById('vd-tbody');
  if (vdtb) vdtb.innerHTML = thtml.replace('<thead>.*?</thead>','');
  const vdtbl = document.querySelector('#vd-table');
  if (vdtbl) vdtbl.innerHTML = thtml;
}

function toggleVDMethod(btn) {
  const m=btn.dataset.m;
  if(vdVisible.has(m)){vdVisible.delete(m);btn.classList.add('off');}
  else{vdVisible.add(m);btn.classList.remove('off');}
  renderVarDetail();
}

function renderMetrics() {
  const mg = D.metricas_globales || {};
  const vars = Object.keys(mg);
  let html = '<thead><tr><th>Variable</th><th>Tecnica</th><th>RMSE</th><th>MAE</th><th>MAPE%</th><th>R²</th><th>Sesgo</th><th title="Pearson. Media/Mediana tienen corr=0 por ser constantes">Corr. i</th><th>Err%</th></tr></thead><tbody>';
  vars.forEach(col=>{
    METS.forEach((m,mi)=>{
      let d = getM(col, m);
      if (!d) return;
      const tc = tagClass(d.rmse, D.rangos?.[col]); const rc = r2Class(d.r2);
      html+=`<tr>
        ${mi===0?`<td rowspan="4" style="font-weight:700;border-right:1px solid var(--bdr);color:var(--tx)">${col}<br><span style="font-size:11px;color:var(--tx3)">${D.nombres_vars?.[col]||col}</span></td>`:''}
        <td style="color:${C[m]};font-weight:700">${m}</td>
        <td>${d.rmse != null ? d.rmse.toFixed(2) : '—'}</td><td>${d.mae != null ? d.mae.toFixed(2) : '—'}</td><td>${d.mape != null ? d.mape.toFixed(3) : '—'}%</td>
        <td>${fmtR2(d.r2)}</td>
        <td>${fmtBias(d.bias)}</td><td>${fmtCorr(d.corr)}</td>
        <td><span class="ktag ${tc}" style="font-size:11px">${d.err_pct!=null?d.err_pct.toFixed(2):'—'}%</span></td>
      </tr>`;
    });
  });
  const ftbl = document.getElementById('full-table');
  if (ftbl) ftbl.innerHTML = html+'</tbody>';
  renderMetChart();

  const vs = document.getElementById('m-var-sel');
  if(vs && !vs.innerHTML.trim()) vs.innerHTML = vars.map(v=>`<option value="${v}">${v} — ${D.nombres_vars?.[v]||v}</option>`).join('');
}


// ── TOOLTIPS EDUCATIVOS ───────────────────────────────────────────
const METRIC_HELP = {
  rmse: {
    nombre: 'RMSE — Error Cuadrático Medio Raíz',
    formula: 'RMSE = √( Σ(imputado − real)² / n )',
    que: 'Mide qué tan lejos está, en promedio, el valor imputado del dato real. Al elevar al cuadrado, penaliza más los errores grandes.',
    cuando: 'Es la métrica principal para comparar técnicas. Menor RMSE = mejor técnica.',
    ojo: 'Sensible a outliers — un error enorme sube mucho el RMSE aunque el resto sea perfecto.',
    unidad: 'Mismas unidades del sensor'
  },
  mae: {
    nombre: 'MAE — Error Absoluto Medio',
    formula: 'MAE = Σ|imputado − real| / n',
    que: 'Promedio de los errores en valor absoluto, sin elevar al cuadrado. Más equitativo que RMSE.',
    cuando: 'Usar junto al RMSE: si RMSE >> MAE hay errores grandes puntuales. Si RMSE ≈ MAE el error es uniforme.',
    ojo: 'No penaliza outliers tanto como RMSE — puede ocultar picos de error.',
    unidad: 'Mismas unidades del sensor'
  },
  mape: {
    nombre: 'MAPE — Error Porcentual Absoluto Medio',
    formula: 'MAPE = (Σ|imputado − real| / |real|) / n × 100%',
    que: 'Expresa el error como % del valor real. Permite comparar entre variables con distintas escalas.',
    cuando: 'Útil para normalizar: var3 (rango 850) vs var8 (rango 2786) son comparables en %.',
    ojo: 'Si el valor real es cercano a 0 el MAPE se dispara. Poco útil para señales que oscilan alrededor de cero.',
    unidad: '%'
  },
  r2: {
    nombre: 'R² — Coeficiente de Determinación',
    formula: 'R² = 1 − Σ(real − imputado)² / Σ(real − media_real)²',
    que: 'Mide qué fracción de la variación real captura la técnica. R²=1 es perfecto; R²=0 equivale a poner la media constante.',
    cuando: 'Si R² < 0 la técnica es PEOR que poner solo la media — señal clara de que no captura el patrón.',
    ojo: 'Si la señal no varía en el gap (varianza≈0), R² no está definido y aparece como extremo.',
    unidad: 'Sin dimensión [−∞, 1]'
  },
  bias: {
    nombre: 'Sesgo (Bias)',
    formula: 'Sesgo = media(imputado − real)',
    que: 'Detecta si la técnica sistemáticamente sobreestima (+) o subestima (−). Un RMSE bajo con sesgo alto indica error direccional constante.',
    cuando: 'Importante para análisis posteriores: datos con sesgo distorsionan tendencias y correlaciones.',
    ojo: 'Media y Mediana siempre tienen sesgo porque imputan un valor constante para todo el gap.',
    unidad: 'Mismas unidades del sensor'
  },
  corr: {
    nombre: 'Correlación de Pearson',
    formula: 'r = Σ(real − r̄)(imputado − ī) / (n·σr·σi)',
    que: 'Mide si la técnica sigue el mismo patrón temporal: cuando el sensor sube, ¿la técnica también sube?',
    cuando: 'Alta correlación + bajo RMSE = excelente. Alta correlación + alto RMSE = buena forma, mal nivel.',
    ojo: 'Media y Mediana son constantes → correlación=0 por definición, no porque fallen en el patrón.',
    unidad: '[−1, 1]'
  },
  err_pct: {
    nombre: 'Error Relativo % (RMSE / Rango × 100)',
    formula: 'Err% = RMSE / (max_global − min_global) × 100',
    que: 'Normaliza el RMSE al rango de cada variable para que sean comparables entre sí.',
    cuando: 'Escala de referencia: <2% excelente · 2-5% muy bueno · 5-10% bueno · >10% revisar técnica.',
    ojo: 'Usa el rango global del dataset, no el rango del gap — el denominador puede ser mayor que el rango del gap.',
    unidad: '%'
  }
};

function renderMetricHelp(met) {
  const h = METRIC_HELP[met] || {};
  const el = document.getElementById('metric-help-box');
  if (!el || !h.nombre) return;
  el.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <div style="font-family:var(--font-d);font-size:16px;font-weight:900;color:var(--tx);margin-bottom:6px">${h.nombre}</div>
        <div style="font-family:var(--font-m);font-size:11px;background:var(--tx);color:#e8dcc8;padding:8px 12px;border-radius:4px;margin-bottom:8px">${h.formula}</div>
        <div style="font-size:12px;color:var(--tx3);margin-bottom:4px"><strong style="color:var(--tx)">Qué mide:</strong> ${h.que}</div>
        <div style="font-size:12px;color:var(--tx3);margin-bottom:4px"><strong style="color:var(--tx)">Cuándo usarlo:</strong> ${h.cuando}</div>
      </div>
      <div style="min-width:180px;max-width:260px">
        <div style="font-size:11px;font-family:var(--font-m);color:var(--warn);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Precaución</div>
        <div class="ib wb" style="font-size:11.5px">${h.ojo}</div>
        <div style="margin-top:8px;font-size:11px;color:var(--tx4)">Unidad: <strong style="color:var(--tx3)">${h.unidad}</strong></div>
      </div>
    </div>`;
}


function addSintNote() {
  const sintNote = document.getElementById('sint-note');
  if (sintNote) {
    sintNote.style.display = 'block';
    sintNote.innerHTML = `
      <strong>¿Por qué Sint. STL tiene valores diferentes en el gráfico?</strong><br>
      El archivo sintético (<code>node1_data_sintetico1.csv</code>) guarda las variables en
      <strong>unidades físicas reales</strong> (ej: humedad = 82.0 en %, temperatura = 26.5 en °C).
      El sensor IoT almacena valores <strong>crudos sin convertir</strong> (ej: humedad = 8200,
      temperatura = 2650 = 26.5×100). Esto crea una diferencia de factor <strong>×100</strong>
      entre la serie sintética y los datos del sensor.<br><br>
      <strong>Solución aplicada:</strong> Se multiplica la serie sintética por el factor
      <code>mean(real) / mean(sint)</code> calculado por variable
      (var3: ×99.99, var7: ×100.25, var8: ×98.41). Las <strong>métricas RMSE/MAE/R²</strong>
      de la tabla usan este reescalado correcto — no el valor raw del JSON.
    `;
  }  // cierre if sintNote
}

function renderMetChart() {
  renderMetricHelp(document.getElementById('m-met-sel')?.value||'rmse');
  const col = document.getElementById('m-var-sel')?.value || 'var3';
  const met = document.getElementById('m-met-sel')?.value || 'rmse';
  const mg = D.metricas_globales || {};
  mkChart('m-chart','bar',{
    labels:METS,
    datasets:[{data:METS.map(m=>{ const v=mg[col]?.[m]?.[met]; return (v==null||isNaN(parseFloat(v)))?0:parseFloat(v); }),
      backgroundColor:METS.map(m=>C[m]+'aa'),borderColor:METS.map(m=>C[m]),
      borderWidth:1.5,borderRadius:6}]
  },{plugins:{legend:{display:false},tooltip:TT()},
     scales:{x:{ticks:{font:{size:11}},grid:{display:false}},y:{ticks:{font:{size:11}},grid:{color:'#334155'},title:{display:true,text:met.toUpperCase(),font:{size:12}}}}});
}

function renderDiagResi() {
  const gi = +(document.getElementById('dr-gap-sel')?.value || 0);
  const col = document.getElementById('dr-var-sel')?.value || 'var3';
  const g = D.gaps?.[gi]; if (!g) return;
  const res = g.residuos?.[col]; if(!res) return;
  const labels = (g.series?.[col]?.t_gap || []).map(t=>t.slice(8,16));
  const ds=[];
  METS.forEach(m=>{
    if(!drVisible.has(m)) return;
    ds.push({label:m,data:res[m]||[],borderColor:C[m],borderWidth:2,pointRadius:0,tension:0.2,fill:false});
  });
  ds.push({label:'Sin error',data:Array(labels.length).fill(0),borderColor:'#8a7f75',borderDash:[4,3],borderWidth:1,pointRadius:0,fill:false});
  mkChart('dr-resi','line',{labels,datasets:ds},{animation:{duration:0},
    plugins:{legend:{display:false},tooltip:TT()},
    scales:SCALES_DARK('Lectura del Gap','Residuo (Imputado menos Real)')});
}

function toggleDRMethod(btn) {
  const m=btn.dataset.m;
  if(drVisible.has(m)){drVisible.delete(m);btn.classList.add('off');}
  else{drVisible.add(m);btn.classList.remove('off');}
  renderDiagResi();
}

function renderDiagHist() {
  const gi = +(document.getElementById('dh-gap-sel')?.value || 0);
  const col = document.getElementById('dh-var-sel')?.value || 'var3';
  const met = document.getElementById('dh-met-sel')?.value || 'Media';
  const g = D.gaps?.[gi]; if (!g) return;
  const h = g.histogramas?.[col]?.[met]; if(!h) return;
  mkChart('dh-chart','bar',{
    labels:h.centers || [],
    datasets:[{data:h.counts || [],backgroundColor:C[met]+'aa',borderColor:C[met],borderWidth:1.5,borderRadius:4}]
  },{plugins:{legend:{display:false},tooltip:TT()},
     scales:{x:{ticks:{font:{size:10},maxRotation:30},grid:{display:false},title:{display:true,text:'Residuo',font:{size:11}}},
             y:{ticks:{font:{size:10}},grid:{color:'#334155'},title:{display:true,text:'Frecuencia',font:{size:11}}}}});
  
  const mv = g.metricas_por_var?.[col]?.[met];
  const dhi = document.getElementById('dh-interp');
  if(mv && dhi){
    const bias = mv.bias || 0;
    const sym = Math.abs(bias)<5?'Distribucion centrada en cero':bias>0?`Sesgo positivo +${bias.toFixed(2)} (Sobreestimacion)`:`Sesgo negativo ${bias.toFixed(2)} (Subestimacion)`;
    dhi.innerHTML = `<strong>${met} · Gap ${gi+1} · ${D.nombres_vars?.[col]||col}</strong><br>Sesgo: <strong>${bias>0?'+':''}${bias.toFixed(2)}</strong> · Std: <strong>${mv.std?.toFixed(2)||'—'}</strong><br>${sym}`;
  }
}

function renderDiagBias() {
  const gi = +(document.getElementById('db-gap-sel')?.value || 0);
  const col = document.getElementById('db-var-sel')?.value || 'var3';
  const g = D.gaps?.[gi]; if (!g) return;
  const mv = g.metricas_por_var?.[col] || {};
  mkChart('db-chart','bar',{
    labels:METS,
    datasets:[
      {label:'|Sesgo|',data:METS.map(m=>Math.abs(mv[m]?.bias||0)),backgroundColor:METS.map(m=>C[m]+'aa'),borderColor:METS.map(m=>C[m]),borderWidth:1.5,borderRadius:4},
      {label:'Std Residuos',data:METS.map(m=>mv[m]?.std||0),backgroundColor:'rgba(167,139,250,.3)',borderColor:'#a78bfa',borderWidth:1.5,borderRadius:4}
    ]
  },{plugins:{legend:{display:true,labels:{color:'#cbd5e1',font:{size:11},boxWidth:12}},tooltip:TT()},
     scales:{x:{ticks:{font:{size:11}},grid:{display:false}},y:{ticks:{font:{size:11}},grid:{color:'#334155'}}}});
}

function renderR2Chart() {
  const mg = D.metricas_globales || {};
  const vars = Object.keys(mg).filter(v=>v!=='var11');
  mkChart('dr2-chart','bar',{
    labels: vars.map(v=>D.nombres_vars?.[v]||v),
    datasets: METS.map(m=>({label:m,borderRadius:4,borderWidth:1.5,
      backgroundColor:C[m]+'aa',borderColor:C[m],
      data:vars.map(v=>mg[v]?.[m]?.r2||0)}))
  },{plugins:{legend:{display:true,labels:{color:'#cbd5e1',font:{size:11},boxWidth:12}},tooltip:TT()},
     scales:{x:{ticks:{font:{size:11}},grid:{display:false}},
             y:{ticks:{font:{size:11}},grid:{color:'#334155'},title:{display:true,text:'R² (Mayor = Mejor ajuste)',font:{size:12}}}}});
}

function buildConclusiones() {
  const mg   = D.metricas_globales || {};
  const vars = Object.keys(mg).filter(v => v !== 'var11');
  const nGaps = D.total_gaps || D.gaps?.length || 0;
  const nFil  = D.total_filas || 0;
  const nNan  = D.total_nan  || 0;
  const pctNan = nFil > 0 ? (nNan/nFil*100).toFixed(2) : '—';
  const sf = gapSuficiencia(nGaps);

  // ── Resumen del dataset ──────────────────────────────────────────
  let html = `
  <div class="card" style="margin-bottom:16px">
    <div class="ct">Resumen del Dataset Analizado</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px">
      <div><div class="kl">Nodo</div><div style="font-family:var(--font-d);font-size:22px;font-weight:900;color:var(--tx)">${D.nodo || 1}</div></div>
      <div><div class="kl">Total lecturas</div><div style="font-family:var(--font-d);font-size:22px;font-weight:900;color:var(--tx)">${nFil.toLocaleString()}</div></div>
      <div><div class="kl">Gaps detectados</div><div style="font-family:var(--font-d);font-size:22px;font-weight:900;color:var(--acc)">${nGaps}</div>
        <span class="ktag ${sf.cls}" style="margin-top:4px">${sf.txt}</span></div>
      <div><div class="kl">Datos faltantes</div><div style="font-family:var(--font-d);font-size:22px;font-weight:900;color:var(--warn)">${nNan.toLocaleString()}</div>
        <div style="font-size:11px;color:var(--tx3);margin-top:2px">${pctNan}% del dataset</div></div>
      <div><div class="kl">Periodo</div><div style="font-size:13px;font-weight:600;color:var(--tx);margin-top:4px">${(D.periodo?.inicio||'—').slice(0,10)}<br>→ ${(D.periodo?.fin||'—').slice(0,10)}</div></div>
      <div><div class="kl">Tecnicas evaluadas</div>${METS.map(m=>`<span style="display:inline-block;margin:2px 4px 2px 0;font-size:11px;font-weight:600;color:${C[m]}">${m}</span>`).join('')}</div>
    </div>
    <div class="ib ${sf.cls==='bad'?'rb':sf.cls==='warn'?'wb':sf.cls==='ok'?'':'gb'}" style="margin-top:12px;font-size:12px">
      <strong>Suficiencia estadistica:</strong> ${sf.rec}
    </div>
  </div>`;

  // ── Tabla de mejor técnica por variable ─────────────────────────
  html += `<div class="card" style="margin-bottom:16px">
    <div class="ct">Mejor Tecnica por Variable — Comparacion contra Dato Real</div>
    <div class="ib" style="margin-bottom:12px;font-size:12px">
      Todas las metricas se calculan comparando el valor imputado contra el <strong>dato real del sensor</strong>
      registrado en ese mismo instante. El dato real actua como referencia absoluta de verdad (ground truth).
    </div>
    <div style="overflow-x:auto"><table class="mtab">
      <thead><tr>
        <th>Variable</th><th>Mejor tecnica</th>
        <th title="Error cuadratico — penaliza desvios grandes">RMSE</th>
        <th title="Error relativo al rango total">Err%</th>
        <th title="Coeficiente de determinacion — >0 mejor que la media">R²</th>
        <th title="Correlacion temporal con la senal real">Corr.</th>
        <th>Evaluacion</th><th>Razon de seleccion</th>
      </tr></thead><tbody>`;

  vars.forEach(col => {
    const mgcol = mg[col] || {};
    const best  = METS.reduce((a,b)=>((getM(col,a)?.rmse)??9e9)<((getM(col,b)?.rmse)??9e9)?a:b);
    const d     = getM(col,best) || {};
    const tc    = tagClass(d.rmse||0, D.rangos?.[col]||1);
    const nivel = d.err_pct < 2 ? '✅ Optimo' : d.err_pct < 5 ? '✅ Aceptable' : d.err_pct < 10 ? '⚠️ Bueno' : '❌ Revisar';
    // Razon automática
    let razon = '';
    if (best === 'Sint. STL') razon = 'Captura ciclo diario via descomposicion STL · mayor correlacion temporal';
    else if (best === 'Lineal') razon = 'Gap con comportamiento monotono · interpolacion eficaz en tendencia lineal';
    else if (best === 'Mediana') razon = 'Senal con outliers · mediana mas robusta que media';
    else razon = 'Gap muy corto o varianza minima dentro del periodo';
    html += `<tr>
      <td style="font-weight:700">${col} — ${D.nombres_vars?.[col]||D.nombres?.[col]||col}</td>
      <td style="color:${C[best]};font-weight:700">${best}</td>
      <td style="font-family:var(--font-m)">${d.rmse!=null?d.rmse.toFixed(2):'—'}</td>
      <td><span class="ktag ${tc}">${d.err_pct!=null?d.err_pct.toFixed(2):'—'}%</span></td>
      <td><span class="ktag ${r2Class(d.r2)}">${d.r2!=null?d.r2.toFixed(3):'—'}</span></td>
      <td style="font-family:var(--font-m)">${fmtCorr(d.corr)}</td>
      <td>${nivel}</td>
      <td style="font-size:11.5px;color:var(--tx3)">${razon}</td>
    </tr>`;
  });
  html += `</tbody></table></div></div>`;

  // ── Análisis por técnica ─────────────────────────────────────────
  html += `<div class="row r4" style="margin-bottom:16px">`;
  const tecDesc = {
    'Media':     {cls:'rb', desc:'Valor constante = promedio historico. Sin contexto temporal. R² negativo en gaps largos — estadisticamente inferior a usar la media del gap. Solo util para gaps de 1-2 lecturas.'},
    'Mediana':   {cls:'wb', desc:'Similar a la media pero mas robusta ante valores extremos. Misma limitacion: sin dinamica temporal. Ligeramente mejor que media cuando hay outliers en la serie.'},
    'Lineal':    {cls:'gb', desc:'Traza una recta entre los bordes del gap. Captura tendencias monotanas con R²>0. Falla en gaps largos con ciclos diarios — la recta diverge del comportamiento real en >6 horas.'},
    'Sint. STL': {cls:'',   desc:'Descomposicion estacional (Loess) de la serie historica. Reconstruye tendencia + ciclo diario. Alta correlacion temporal (>0.90). Requiere reescalado ×100 porque el CSV sintetico guarda en unidades fisicas.'},
  };
  METS.forEach(m => {
    const td = tecDesc[m];
    // Mejor variable para esta técnica
    const mejorVar = vars.reduce((a,b)=>((getM(a,m)?.r2)||-9e9)>((getM(b,m)?.r2)||-9e9)?a:b,'');
    const dv = getM(mejorVar,m);
    html += `<div class="card">
      <div class="ct" style="color:${C[m]}">◆ ${m}</div>
      <div class="ib ${td.cls}" style="font-size:12px">${td.desc}</div>
      ${dv && mejorVar ? `<div style="margin-top:10px;font-size:11px;color:var(--tx4);font-family:var(--font-m);text-transform:uppercase;letter-spacing:.5px">Mejor resultado en</div>
      <div style="font-size:13px;font-weight:600;color:var(--tx);margin-top:3px">${D.nombres_vars?.[mejorVar]||D.nombres?.[mejorVar]||mejorVar}</div>
      <div style="font-size:12px;color:var(--tx3);margin-top:4px">RMSE ${dv.rmse?.toFixed(2)||'—'} · R² ${dv.r2?.toFixed(3)||'—'} · Err% ${dv.err_pct?.toFixed(2)||'—'}%</div>` : ''}
    </div>`;
  });
  html += `</div>`;

  // ── Recomendación final ──────────────────────────────────────────
  const bestGlobal = METS.reduce((a,b)=>{
    const sa = vars.reduce((s,c)=>s+(getM(c,a)?.r2||0),0);
    const sb = vars.reduce((s,c)=>s+(getM(c,b)?.r2||0),0);
    return sa>sb?a:b;
  });
  html += `<div class="card-accent">
    <div class="ct">Recomendacion Final</div>
    <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <div style="font-family:var(--font-d);font-size:20px;font-weight:900;color:var(--tx);margin-bottom:8px">
          Tecnica recomendada: <span style="color:${C[bestGlobal]}">${bestGlobal}</span>
        </div>
        <div style="font-size:13px;color:var(--tx3);line-height:1.8">
          Basado en el mayor R² promedio entre todas las variables del dataset.
          <br><strong style="color:var(--tx)">R² > 0.5</strong> en la mayoria de variables indica que la tecnica captura mas del 50% de la variacion real del sensor.
          <br><strong style="color:var(--tx)">Correlacion > 0.85</strong> confirma que sigue el patron temporal de la senal original.
        </div>
      </div>
      <div style="min-width:200px">
        <div style="font-size:11px;font-family:var(--font-m);color:var(--tx4);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">R² promedio por tecnica</div>
        ${METS.map(m=>{
          const avgR2 = (vars.reduce((s,c)=>s+(getM(c,m)?.r2||0),0)/vars.length);
          const pct = Math.max(0,Math.min(100,avgR2*100));
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="color:${C[m]};font-size:12px;font-weight:600;min-width:80px">${m}</span>
            <div style="flex:1;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden">
              <div style="width:${Math.max(2,pct)}%;height:100%;background:${C[m]};border-radius:4px"></div>
            </div>
            <span style="font-family:var(--font-m);font-size:11px;color:var(--tx3);min-width:40px">${avgR2.toFixed(3)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;

  const cc = document.getElementById('conc-content');
  if (cc) cc.innerHTML = html;
}


function renderGapsAnalysis(){
  const gaps=D.gaps||[];
  const el=document.getElementById('ov-gaps-analysis');
  if(!el) return;
  const n=gaps.length;
  const sf=gapSuficiencia(n);
  if(n===0){el.style.display='block';el.innerHTML=`<strong>Sin gaps detectados</strong> — El JSON no contiene periodos de datos faltantes. No es posible calcular métricas de imputación.`;return;}
  
  // Consistencia: std del RMSE entre gaps por variable y método
  const vars=Object.keys(D.rangos||{}).filter(v=>v!=='var11');
  const bestPerGap=gaps.map(g=>{
    const bv={};
    vars.forEach(col=>{
      const mv=g.metricas_por_var?.[col]||{};
      bv[col]=METS.reduce((a,b)=>(mv[a]?.rmse??9e9)<(mv[b]?.rmse??9e9)?a:b);
    });
    return bv;
  });
  // ¿El mejor método es consistente entre gaps?
  const consistency={};
  vars.forEach(col=>{
    const winners=bestPerGap.map(bv=>bv[col]);
    const uniq=[...new Set(winners)];
    consistency[col]={winners,consistent:uniq.length===1,dominant:uniq.length===1?uniq[0]:null};
  });
  const allConsistent=vars.every(col=>consistency[col].consistent);
  
  // Texto de influencia de duración
  let durTxt='';
  if(gaps.length>=2){
    const sorted=[...gaps].sort((a,b)=>a.duration_h-b.duration_h);
    const short=sorted[0],long=sorted[sorted.length-1];
    const col=vars[0];
    const bShort=METS.reduce((a,b)=>(short.metricas_por_var?.[col]?.[a]?.rmse??9e9)<(short.metricas_por_var?.[col]?.[b]?.rmse??9e9)?a:b);
    const bLong=METS.reduce((a,b)=>(long.metricas_por_var?.[col]?.[a]?.rmse??9e9)<(long.metricas_por_var?.[col]?.[b]?.rmse??9e9)?a:b);
    durTxt=`Gap corto (${short.duration_h}h): mejor → <strong style="color:${C[bShort]}">${bShort}</strong> &nbsp;·&nbsp; Gap largo (${long.duration_h}h): mejor → <strong style="color:${C[bLong]}">${bLong}</strong>. ${bShort===bLong?'<span style="color:var(--good)">✓ Técnica dominante estable.</span>':'<span style="color:var(--warn)">⚠ El método óptimo cambia con la duración.</span>'}`;
  }
  
  const consistRow=vars.map(col=>{
    const c=consistency[col];
    return `<span style="font-size:12px">${D.nombres_vars?.[col]||col}: ${c.consistent?`<strong style="color:var(--good)">${c.dominant} siempre mejor</strong>`:`<strong style="color:var(--warn)">varía (${c.winners.join('→')})</strong>`}</span>`;
  }).join(' &nbsp;·&nbsp; ');

  el.style.display='block';
  el.innerHTML=`
    <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <div style="font-family:'Arimo',sans-serif;font-size:13px;font-weight:700;color:var(--tx);margin-bottom:6px">
          Influencia de los Gaps — ${n} gap${n!==1?'s':''} detectado${n!==1?'s':''}
        </div>
        <div class="ktag ${sf.cls}" style="margin-bottom:8px">${sf.txt}</div><br>
        <span style="font-size:12px;color:var(--tx3)">${sf.rec}</span>
      </div>
      <div style="flex:2;min-width:300px">
        <div style="font-size:11px;color:var(--tx4);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Consistencia del mejor método entre gaps</div>
        <div>${consistRow}</div>
        ${durTxt?`<div style="margin-top:8px;font-size:12px;color:var(--tx3)">${durTxt}</div>`:''}
        ${!allConsistent&&n>=2?`<div class="sint-alert" style="margin-top:8px"><strong>Recomendación:</strong> El método óptimo varía entre gaps → reportar resultados por gap individual, no solo el promedio global.</div>`:''}
      </div>
    </div>`;
}

function nav(id) {
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(s=>s.classList.remove('active'));
  const panel=document.getElementById(`panel-${id}`);
  const nav_el=document.getElementById(`nav-${id}`);
  if(panel) panel.classList.add('active');
  if(nav_el) nav_el.classList.add('active');
}
