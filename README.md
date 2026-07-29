# Dashboard — Prueba de Tecnicas de Imputacion IoT

Herramienta interactiva para comparar técnicas de imputación de datos faltantes en sensores IoT de agricultura de precisión. Desarrollado como parte de una ayudantía de investigación.

---

## Como usar el dashboard

### Paso 1 — Descargar el archivo de datos

El archivo **`nodo2_faltante_1_dashboard_data.json`** ya está disponible en este repositorio.

1. Ve a los archivos del repositorio
2. Haz clic en `nodo2_faltante_1_dashboard_data.json`
3. Clic en el botón **Download raw file** (esquina superior derecha)
4. Guarda el archivo en tu computadora

### Paso 2 — Abrir el dashboard

Abre el dashboard en tu navegador:

👉 **[https://dbolanos-s.github.io/Dashboard-de-Evaluaci-n-de-Imputaci-n-en-IoT-Agr-cola/](https://dbolanos-s.github.io/Dashboard-de-Evaluaci-n-de-Imputaci-n-en-IoT-Agr-cola/)**

### Paso 3 — Cargar el JSON

Arrastra el archivo `nodo2_faltante_1_dashboard_data.json` al recuadro de carga, o haz clic en **Cargar JSON** y selecciónalo desde tu computadora.

---

## Contenido del archivo JSON

El archivo contiene los resultados pre-calculados del análisis de imputación del **Nodo 1**, generados desde Google Colab:

| Campo | Valor |
|-------|-------|
| Nodo | 1 — Agricultura de precisión |
| Período | 20 jun 2021 → 22 sep 2021 |
| Total de lecturas | 23.263 |
| Datos faltantes | 253 lecturas (2 gaps) |
| Variables | Humedad · Temperatura Suelo · Temperatura Ambiente · Conductividad |

**Gaps detectados:**

| Gap | Inicio | Fin | Duración | Lecturas |
|-----|--------|-----|----------|----------|
| Gap 1 | 2021-07-23 15:18 | 2021-07-24 03:16 | 11.97h | 150 |
| Gap 2 | 2021-08-02 00:48 | 2021-08-02 12:46 | 11.97h | 103 |

---

## Tecnicas evaluadas

| Técnica | Descripción |
|---------|-------------|
| **Media global** | Imputa el promedio histórico de la variable — valor constante para todo el gap |
| **Mediana global** | Imputa el valor central histórico — más robusta ante valores extremos |
| **Interpolación Lineal** | Traza una recta entre los bordes del gap respetando la tendencia temporal |
| **Serie Sintética STL** | Reconstruye el patrón mediante descomposición estacional de la serie histórica |

---

## Metricas calculadas — como interpretarlas

Todas las métricas se calculan comparando el valor imputado contra el **dato real del sensor** (ground truth):

| Métrica | Qué mide | Valor ideal |
|---------|----------|-------------|
| **RMSE** | Error cuadrático medio — penaliza errores grandes | Cercano a 0 |
| **MAE** | Error absoluto medio — robusto ante valores atípicos | Cercano a 0 |
| **MAPE** | Error porcentual medio relativo al valor real | Cercano a 0% |
| **R²** | Fracción de variación real capturada — negativo = peor que la media | Cercano a 1 |
| **Sesgo** | Error sistemático — positivo sobreestima, negativo subestima | Cercano a 0 |
| **Err%** | RMSE normalizado al rango de la variable | < 2% excelente · < 5% aceptable |

**Escala de referencia para Err%:**

| Rango | Interpretación |
|-------|----------------|
| < 2% | Excelente — imputación casi perfecta |
| 2% – 5% | Muy bueno — aceptable para publicación |
| 5% – 10% | Bueno — margen de mejora |
| > 10% | Revisar técnica o condiciones del gap |

---

## Resultados del archivo JSON — resumen

**Mejor técnica por variable (menor RMSE vs dato real):**

| Variable | Mejor técnica | RMSE | Err% | R² |
|----------|--------------|------|------|----|
| Humedad (var3) | Lineal | 14.12 | 1.66% | 0.55 |
| Temperatura Suelo (var7) | Lineal | 13.65 | 2.37% | 0.97 |
| Temperatura Ambiente (var8) | Lineal | 284.10 | 10.20% | 0.56 |
| Conductividad (var11) | Lineal | 124.21 | 0.19% | 0.999 |

> **Nota Sint. STL:** el archivo sintético guarda valores en unidades físicas (ej: 26.5 °C) mientras el sensor IoT registra valores crudos ×100 (ej: 2650). El dashboard aplica un factor de reescalado automático antes de graficar. Las métricas sin reescalar aparecen altas en este JSON — el dashboard las corrige internamente.

---

## Secciones del dashboard

Al cargar el JSON verás estas secciones en el menú lateral:

**Vision General**
Resumen global con el mejor RMSE por variable, gráficas comparativas de todas las técnicas y tarjetas de información de cada gap.

**Variables Detalle**
Gráfica de serie temporal con las 4 imputaciones superpuestas al dato real. Permite activar/desactivar cada técnica y cambiar de variable y gap.

**Gap 1 / Gap 2**
Análisis individual de cada periodo sin datos: serie temporal, tabla de métricas por variable y gráfica de RMSE por técnica.

**Metricas Completas**
Gráfico comparativo seleccionable por variable y por métrica (RMSE, MAE, R², etc.) con explicación de qué indica cada indicador.

**Residuos**
Análisis estadístico del error: residuos por lectura, histograma de distribución y gráfico de sesgo vs dispersión.

**Conclusiones**
Informe automático con la técnica óptima por variable, análisis por método y recomendación final basada en R² promedio.

---

## Arquitectura del proyecto

```
Backend — Google Colab               Frontend — GitHub Pages
──────────────────────────           ──────────────────────────
Python 3                             HTML5 + CSS3 + JS (Vanilla)
├── pandas · numpy                   ├── Chart.js 4.4.1
├── scikit-learn  (metricas)         ├── Google Fonts
├── statsmodels   (STL)              └── CSS Custom Properties
└── scipy         (curvas)
         │
         │ Celda 15 exporta
         ▼
  dashboard_data.json  ──────────────► usuario carga en el dashboard
```

---

## Archivos del repositorio

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Estructura HTML del dashboard |
| `styles.css` | Estilos: tipografía Arimo y Playfair Display, paleta crema |
| `app.js` | Lógica: Chart.js, métricas, reescalado Sint. STL |
| `nodo2_faltante_1_dashboard_data.json` | Datos del Nodo 1 — cargar en el dashboard |
| `README.md` | Este archivo |

---

*Proyecto de ayudantía de investigación — Imputación de datos en redes de sensores IoT · Julio 2026*
