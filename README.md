#  Dashboard de Evaluación de Imputación en IoT Agrícola

**Herramienta interactiva para análisis riguroso de técnicas de imputación de datos faltantes en sensores de agricultura de precisión**
---

##  PROBLEMA ABORDADO

### El Desafío en Agricultura de Precisión

En sistemas de monitoreo agrícola basados en **IoT (Internet of Things)**, los sensores ubicados en campo capturan datos ambientales críticos de forma continua. Sin embargo, es común que ocurran **interrupciones en las lecturas** debido a:

-  Fallas de conectividad (wifi/red móvil)
-  Mal funcionamiento temporal del sensor
-  Pérdida de energía en el nodo
-  Errores en la transmisión de datos

Estos **datos faltantes** (gaps) representan un problema real para el análisis, siendo imposible usar técnicas estadísticas estándar y comprometiendo la integridad de los modelos predictivos.

### La Pregunta de Investigación

**¿Cuál es la técnica más efectiva para imputar (llenar) estos datos faltantes, manteniendo la máxima fidelidad con los valores reales?**

---

##  SOLUCIÓN INVESTIGADA

### Cuatro Técnicas de Imputación Comparadas

Este proyecto compara **4 métodos distintos** de imputación, cada uno con diferentes supuestos y características:

#### 1️⃣ **Media Global**
```python
# Llena el gap con el promedio de todos los valores disponibles
valor_imputado = np.mean(datos_disponibles)
```

**Características:**
- ✓ Muy simple de implementar
- ✗ Ignora completamente la dinámina temporal
- ✗ Introduce discontinuidades abruptas
- ✗ Asume que los datos faltan al azar (no realista)

**Desempeño Esperado:** BAJO - Alto RMSE, R² negativo

---

#### 2️⃣ **Mediana Global**
```python
# Llena el gap con el valor central de los datos disponibles
valor_imputado = np.median(datos_disponibles)
```

**Características:**
- ✓ Robusta ante outliers
- ✗ Igual de estática que la media
- ✗ No captura ciclos diarios/nocturnos
- ✗ Genera artefactos en series temporales

**Desempeño Esperado:** BAJO - Similar a media, quizás ligeramente mejor

---

#### 3️⃣ **Interpolación Lineal Temporal**
```python
# Conecta linealmente los puntos antes y después del gap
# Asume cambio lineal gradual entre valores reales
valor_imputado = valor_antes + (valor_despues - valor_antes) * (tiempo_faltante / duracion_gap)
```

**Características:**
- ✓ Respeta tendencias lineales
- ✓ Computacionalmente eficiente
- ✓ Bueno para gaps cortos (< 2-3 horas)
- ✗ No captura variabilidad cíclica
- ✗ Falla con gaps largos

**Desempeño Esperado:** MEDIO - Mejor para gaps cortos (RMSE ~1-2)

---

#### 4️⃣ **Serie Sintética con Descomposición STL** 
```python
# Descomposición Seasonal-Trend-LOESS
# Separa: Tendencia + Estacionalidad + Residuos
componentes = stl_decompose(datos_históricos, period=288)  # 1440 min / 5 min = 288 puntos/día

# Reconstruye el patrón esperado para ese momento
valor_imputado = tendencia[t] + estacionalidad[t] + residuo_promedio
```

**Características:**
- ✓ Captura ciclos diarios automáticamente
- ✓ Respeta tendencias de largo plazo
- ✓ Adapta residuos al contexto temporal
- ✓ Excelente para gaps medianos y largos
- ✓ Más cercano al comportamiento real

**Desempeño Esperado:** ALTO - R² > 0.90, RMSE bajo

---

## 📊 METODOLOGÍA IMPLEMENTADA

### Pipeline de Análisis

```
Datos Brutos (17,280 registros)
         ↓
Detección de Gaps
(búsqueda de secuencias faltantes)
         ↓
Validación Cruzada Estricta
(ocultar datos reales y predecir)
         ↓
Aplicación de 4 Técnicas
(en paralelo para cada gap)
         ↓
Cálculo de Métricas de Error
(RMSE, MAE, MSE, R², Error %)
         ↓
Análisis Estadístico
(consistencia, influencia de duración)
         ↓
Resultados & Conclusiones
```

### Métricas Calculadas

Para cada gap y cada técnica, se calculan:

#### 🔢 **RMSE (Root Mean Square Error)**
```
RMSE = √(Σ(valor_real - valor_imputado)² / n)
```
- **Rango ideal:** Cercano a 0
- **Interpretación:** Error promedio en unidades originales
- **Sensibilidad:** Alta a valores atípicos grandes

#### 🔢 **MAE (Mean Absolute Error)**
```
MAE = Σ|valor_real - valor_imputado| / n
```
- **Rango ideal:** Cercano a 0
- **Interpretación:** Error promedio en valor absoluto
- **Sensibilidad:** Robusta ante outliers

#### 🔢 **MSE (Mean Square Error)**
```
MSE = Σ(valor_real - valor_imputado)² / n
```
- **Rango ideal:** Cercano a 0
- **Interpretación:** Error cuadrático promedio
- **Uso:** Base para RMSE

#### 🔢 **R² (Coeficiente de Determinación)**
```
R² = 1 - (Σ(residuos²) / Σ(desviaciones²))
```
- **Rango:** -∞ a 1.0
- **Interpretación:**
  - **R² = 1.0** → Ajuste perfecto
  - **R² = 0.9** → Excelente ajuste
  - **R² = 0.5** → Ajuste moderado
  - **R² < 0** → Peor que usar la media (técnica falla)

#### 🔢 **Error Relativo Porcentual**
```
Error % = (RMSE / rango_variable) × 100
```
- **Rango:** 0% a infinito
- **Interpretación:**
  - **< 2%** → Óptimo ✓
  - **2% - 5%** → Aceptable
  - **> 5%** → Deficiente ✗

---

##  TECNOLOGÍA APLICADA

### Software y Librerías

**Backend (Generación de Datos):**
```python
Python 3.8+
├── pandas        # Manipulación de datos
├── numpy         # Operaciones numéricas
├── scikit-learn  # Métodos estadísticos
├── statsmodels   # Descomposición STL
└── scipy         # Funciones científicas avanzadas
```

**Frontend (Dashboard Interactivo):**
```
HTML5 + CSS3 + JavaScript (Vanilla)
├── Chart.js 4.4.1    # Visualización de gráficos
├── Google Fonts      # Tipografía profesional
└── CSS Custom Props  # Diseño responsive
```

### Características Técnicas del Dashboard

#### 🎨 **Interfaz Responsiva**
- Funciona en desktop, tablet y móvil
- Paleta de colores: crema/papel con acentos teal
- Tipografía profesional (Arimo, Playfair, DM Mono)

#### 📊 **Visualizaciones Interactivas**
- Gráficos de barras comparativos
- Análisis temporal
- Tablas dinámicas sortables
- Badges de desempeño (color-coded)

#### ⚙️ **Funcionalidades**
- Carga dinámica de archivos JSON
- Detección automática de estructura
- Cálculo en tiempo real de métricas
- Generación de reportes técnicos
- Análisis de consistencia entre gaps
- Exportación de resultados

---

##  OBTENER LOS DATOS: DESCARGA DEL ARCHIVO JSON

### PASO CRÍTICO: Descargar JSON del Google Colab

Los datos procesados (con métricas ya calculadas) se generan en Google Colab. Este archivo JSON es **OBLIGATORIO** para usar el dashboard.

### 🔗 LINK AL COLAB:
```
https://colab.research.google.com/drive/1__GA6x87OzjeSeeLiczkpHlOrzri9LLj?authuser=2
```

###  INSTRUCCIONES: Descargar JSON del Colab

#### **Paso 1: Descargar el Archivo JSON proporcionado **

**Opción A: Panel Izquierdo (Recomendado)**

1. En el panel izquierdo, haz clic en la carpeta 📁 (Files)
2. Busca el archivo `metricas_imputacion.json` (o similar)
3. Haz clic derecho → **Download**

**Opción B: Botón de Descarga (Alternativa)**

1. Al final del notebook, debería haber un botón
2. Haz clic en **Download JSON**
3. Se descargará automáticamente

**Opción C: Comandos de Colab**

Si aparece este código en el notebook:
```python
from google.colab import files
files.download('metricas_imputacion.json')
```

1. Ejecuta la celda
2. Se abrirá un diálogo de descarga
3. Guarda el archivo

#### **Paso 2: Guardar en la Carpeta Correcta**

El archivo JSON descargado debe estar en la misma carpeta que:
- `index.html` (el dashboard)
- Otros archivos

---

### Paso 3: Explorar los Resultados

Una vez cargado, verás:

- **Overview:** Resumen de gaps detectados
- **Análisis Detallado:** Métricas por variable
- **Gráficos:** Comparativas visuales
- **Conclusiones:** Tabla de técnica óptima

---

##  FLUJO COMPLETO DEL PROYECTO

```
Datos Brutos en Colab
(17,280 registros de sensores)
         ↓
[PASO 1] Procesamiento en Colab
├─ Detección de gaps
├─ Validación cruzada
├─ Imputación con 4 técnicas
├─ Cálculo de métricas
└─ Exportación a JSON
         ↓
[PASO 2] Descargar archivo JSON
         ↓
[PASO 3] Cargar JSON en Dashboard
         ↓
[PASO 4] Explorar Resultados Interactivamente
├─ Ver gráficos
├─ Analizar consistencia
├─ Entender metodología
└─ Generar conclusiones
         ↓
[PASO 5] Compartir Hallazgos
└─ Escribir artículo IEEE
```

---

### Patrones Observados en la Investigación

#### 🔍 Patrón 1: Media y Mediana NUNCA Funcionan Bien
Ambas generan R² negativo porque son valores estáticos que no capturan la dinámica temporal.

#### 🔍 Patrón 2: Lineal Funciona Bien en Gaps Cortos
Para interrupciones < 2 horas, la interpolación lineal da RMSE ~1-2.

#### 🔍 Patrón 3: STL Funciona Mejor en Gaps Largos
Para interrupciones > 4 horas, STL supera 3x a lineal porque captura ciclos.

#### 🔍 Patrón 4: Consistencia Varía por Variable
Algunas variables (temperatura) son predecibles; otras (radiación solar) dependen más del clima.

---

## CARACTERÍSTICAS DEL DASHBOARD

### Pantalla 1: Overview
```
┌─────────────────────────────────────────┐
│ Resumen de Gaps Detectados              │
├─────────────────────────────────────────┤
│ • Nodo: 1                               │
│ • Total de registros: 17,280            │
│ • Gaps detectados: 12-15                │
│ • Período: junio - septiembre 2021      │
│ • Duración total de gaps: 50-60 horas   │
└─────────────────────────────────────────┘
```

### Pantalla 2: Análisis por Variable
```
┌─────────────────────────────────────────┐
│ Temperatura Ambiente (var1)              │
├─────────────────────────────────────────┤
│ Mejor técnica:    Sint. STL             │
│ RMSE:             0.87 °C               │
│ Error relativo:   2.08%                 │
│ R²:               0.95                  │
│ Evaluación:       ✓ Óptimo              │
└─────────────────────────────────────────┘
```

### Pantalla 3: Gráficos Interactivos
- Barras comparativas: RMSE de cada técnica
- Líneas temporales: Performance por gap
- Heatmaps: Consistencia entre variables
- Scatter plots: R² vs duración del gap

### Pantalla 4: Conclusiones
- Tabla de recomendaciones por variable
- Análisis de influencia de duración
- Interpretaciones metodológicas
- Sugerencias operacionales

---

**Última actualización:** Julio 2026 | **Versión:** 1.0 | **Estado:** Activo
