# Dashboard — Evaluación de Técnicas de Imputación IoT 🌱

Herramienta interactiva para comparar técnicas de imputación de datos faltantes en sensores IoT de agricultura de precisión.

## 🔗 Demo en vivo

👉 **[Abrir Dashboard]([https://dbolanos-s.github.io/Dashboard-de-Evaluaci-n-de-Imputaci-n-en-IoT-Agr-cola/])**

---

## ¿Qué hace este dashboard?

Carga un archivo JSON con los resultados pre-calculados del notebook de análisis y visualiza:

- Comparación de **4 técnicas de imputación** por variable y por gap
- Métricas de error: **RMSE, MAE, MAPE, R², Sesgo, Correlación**
- Gráficas de series temporales con las 4 imputaciones superpuestas al dato real
- Análisis de residuos y diagnóstico estadístico
- Panel de conclusiones automático con la técnica óptima por variable

---

## Técnicas evaluadas

| Técnica | Qué hace |
|---------|----------|
| **Media global** | Imputa el promedio histórico — valor constante |
| **Mediana global** | Imputa la mediana histórica — robusta a outliers |
| **Interpolación Lineal** | Traza una recta entre los bordes del gap |
| **Serie Sintética STL** | Usa descomposición estacional (STL) para reconstruir el patrón |

> **Nota Sint. STL:** el archivo sintético guarda valores en unidades físicas (ej: 26.5 °C). El sensor IoT registra valores crudos ×100 (ej: 2650). El dashboard aplica un factor de reescalado automático por variable antes de graficar. Las métricas de las tablas ya usan el reescalado correcto.

---

## 🚀 Cómo usar

### Opción A — Prueba rápida con el JSON de ejemplo

El repositorio incluye el archivo **`dashboard_data.json`** con datos reales del Nodo 1 (junio–septiembre 2021, 2 gaps detectados). Úsalo para probar el dashboard sin necesidad del notebook.

1. Abre la URL de GitHub Pages (link arriba)
2. Descarga `dashboard_data.json` de este repositorio
3. Arrástralo al recuadro del dashboard
4. Explora los resultados

### Opción B — Generar tu propio JSON desde el notebook

1. Ejecuta las celdas 1 → 15 del notebook en Google Colab
2. Sube tus archivos CSV al entorno de Colab
3. La Celda 15 genera `dashboard_data.json` y lo guarda en Google Drive
4. Descarga el JSON y cárgalo en el dashboard

---

## 📁 Archivos del repositorio

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Estructura HTML del dashboard |
| `styles.css` | Estilos: Arimo · Playfair Display · paleta crema |
| `app.js` | Lógica: Chart.js · métricas · reescalado Sint. STL |
| `dashboard_data.json` | Datos de ejemplo — Nodo 1 · 2 gaps · 4 variables |
| `README.md` | Este archivo |

---

## 🏗️ Arquitectura

```
Backend — Google Colab               Frontend — GitHub Pages
──────────────────────────           ──────────────────────────
Python 3                             HTML5 + CSS3 + JS (Vanilla)
├── pandas · numpy                   ├── Chart.js 4.4.1
├── scikit-learn  (métricas)         ├── Google Fonts
├── statsmodels   (STL)              └── CSS Custom Properties
└── scipy         (curvas)
         │
         │ Celda 15 exporta
         ▼
  dashboard_data.json  ──────────────► usuario arrastra al dashboard
```

---

## 📡 Dataset de ejemplo

- **Nodo:** 1 — Agricultura de precisión
- **Período:** Junio–Septiembre 2021
- **Variables:** Humedad suelo · Temperatura suelo · Temperatura ambiente · Conductividad eléctrica
- **Gaps:** 2 periodos (~12h cada uno · 150 y 103 lecturas sin datos)

---

*Proyecto de ayudantía de investigación — Imputación de datos en redes de sensores IoT · Julio 2026*
