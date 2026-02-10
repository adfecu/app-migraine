# Algoritmo de Predicción de Dolores de Cabeza (Tipo Tensión)

## Introducción y Objetivo

Este documento explica el algoritmo utilizado para predecir la probabilidad y el tiempo estimado del próximo dolor de cabeza **no-migrañoso** (tipo tensión) basándose en factores de riesgo que se acumulan diariamente.

### Diferenciación entre Migrañas y Dolores de Cabeza por Tensión

Es importante entender que este algoritmo está diseñado específicamente para **dolores de cabeza tipo tensión**, que son diferentes de las migrañas:

- **Migrañas**: Suelen ser desencadenadas por eventos específicos inmediatos (olores, luces parpadeantes, cambios hormonales) y tienen características distintivas (dolor unilateral, pulsante, náuseas, etc.).

- **Dolores de Cabeza por Tensión**: Son frecuentemente **acumulativos**. Ocurren cuando la "carga de tensión" acumulada excede el umbral personal del usuario a lo largo del tiempo, en lugar de ser desencadenados por un evento inmediato.

El algoritmo de migraña tiene prioridad y se ejecuta primero. Si detecta un riesgo alto de migraña, este algoritmo de predicción de dolores de cabeza por tensión no se muestra.

## Datos de Entrada

El algoritmo utiliza los siguientes datos del check-in diario de la sección "Estado General". Estos datos se registran diariamente, independientemente de si el usuario tiene dolor de cabeza o no:

### Variables de Entrada

| Variable | Símbolo | Escala | Descripción |
|----------|---------|--------|-------------|
| **Calidad del Sueño** | $S_q$ | 0-10 | Donde 10 = excelente descanso, 0 = muy poco descanso |
| **Nivel de Estrés** | $St$ | 0-10 | Donde 10 = estrés muy alto, 0 = sin estrés |
| **Consumo de Alcohol** | $A$ | 0-10 | Donde 0 = sin alcohol, 10 = consumo muy por encima de lo habitual |
| **Desviación de Cafeína** | $C$ | 0-10 | Donde 0 = abstinencia total, 5 = consumo habitual, >5 = consumo excesivo |

Estos valores se obtienen directamente de las respuestas del usuario en el check-in diario. Si alguna variable no está disponible, se utilizan valores por defecto:
- Sueño: 5 (medio de la escala)
- Estrés: 5 (medio de la escala)
- Alcohol: 0 (sin consumo)
- Cafeína: 5 (consumo habitual)

## Cálculo de la Carga de Tensión Diaria (TL)

La carga de tensión diaria ($TL_{diaria}$) es un valor numérico que representa el nivel de factores de riesgo acumulados en un día específico. Se calcula mediante la siguiente fórmula:

$$TL_{diaria} = (W_{sueño} \times InvSueño) + (W_{estrés} \times St) + (W_{alcohol} \times A) + (W_{cafeína} \times C)$$

### Inversión del Sueño (InvSueño)

Dado que una calidad de sueño alta (10) es **buena** y reduce el riesgo, invertimos el valor:

$$InvSueño = 10 - S_q$$

- Un sueño de calidad 10 se convierte en riesgo 0
- Un sueño de calidad 0 se convierte en riesgo 10

### Pesos de las Variables ($W$)

Los pesos asignan importancia relativa a cada factor basándose en relevancia clínica. Estos valores pueden ajustarse mediante aprendizaje automático en el futuro:

| Factor | Peso | Porcentaje | Justificación |
|--------|------|------------|---------------|
| **Estrés** | $W_{estrés} = 0.4$ | 40% | El estrés es un desencadenante primario de dolores de cabeza por tensión |
| **Sueño** | $W_{sueño} = 0.3$ | 30% | La falta de descanso contribuye significativamente al riesgo |
| **Cafeína** | $W_{cafeína} = 0.15$ | 15% | Tanto la abstinencia como el exceso pueden causar dolores de cabeza |
| **Alcohol** | $W_{alcohol} = 0.15$ | 15% | El consumo excesivo puede desencadenar dolores de cabeza |

### Ejemplo de Cálculo

Supongamos un día con:
- Sueño: 3/10 (poco descanso)
- Estrés: 7/10 (alto estrés)
- Alcohol: 2/10 (consumo moderado)
- Cafeína: 0/10 (abstinencia)

Cálculo:
- $InvSueño = 10 - 3 = 7$
- $TL_{diaria} = (0.3 \times 7) + (0.4 \times 7) + (0.15 \times 2) + (0.15 \times 0)$
- $TL_{diaria} = 2.1 + 2.8 + 0.3 + 0 = 5.2$

## Lógica de Acumulación y Umbral

A diferencia de las migrañas que pueden ser desencadenadas inmediatamente, los dolores de cabeza por tensión ocurren cuando la carga acumulada excede el umbral personal del usuario.

### A. Cálculo de Carga Acumulativa (CL)

La carga acumulativa ($CL$) representa la tensión total acumulada a lo largo del tiempo:

$$CL_{hoy} = TL_{diaria} + (FactorDecaimiento \times CL_{ayer})$$

#### Factor de Decaimiento

El **Factor de Decaimiento** es un valor entre 0 y 1 (actualmente establecido en **0.5**). Representa la capacidad del cuerpo para recuperarse:

- Si el usuario tuvo un día de alto estrés ayer, parte de esa "tensión" se mantiene hoy
- La otra parte se disipa, permitiendo la recuperación gradual
- Con un factor de 0.5, la mitad de la carga de ayer se mantiene y la otra mitad se disipa

**Ejemplo:**
- Ayer: $CL_{ayer} = 8.0$
- Hoy: $TL_{diaria} = 5.2$
- $CL_{hoy} = 5.2 + (0.5 \times 8.0) = 5.2 + 4.0 = 9.2$

### B. Umbral del Usuario ($U_{umbral}$)

El umbral es el valor de carga acumulativa en el cual el usuario típicamente experimenta un dolor de cabeza por tensión.

#### Valor Inicial

- **Umbral por defecto**: 75
- Se utiliza este valor cuando el usuario aún no tiene datos históricos suficientes

#### Ajuste Dinámico del Umbral

El algoritmo aprende del usuario mediante un proceso de aprendizaje automático:

1. **Registro de Eventos**: Cada vez que el usuario reporta un dolor de cabeza que es categorizado como **no-migrañoso** (el algoritmo de migraña retorna "Bajo Riesgo" o `mayHaveMigraine: false`), se registra el valor de $CL$ de ese día.

2. **Cálculo del Nuevo Umbral**: El umbral del usuario se actualiza para ser el **promedio** de todos los valores de $CL$ registrados en días con dolor de cabeza.

3. **Personalización**: Con el tiempo, el umbral se ajusta específicamente a las características del usuario, mejorando la precisión de las predicciones.

**Ejemplo:**
- Día 1: Dolor de cabeza reportado con $CL = 72$
- Día 2: Dolor de cabeza reportado con $CL = 78$
- Día 3: Dolor de cabeza reportado con $CL = 75$
- Nuevo umbral: $(72 + 78 + 75) / 3 = 75$

## Zonas de Riesgo y Predicciones

El algoritmo compara la Carga Acumulativa actual ($CL_{hoy}$) contra el Umbral del Usuario ($U_{umbral}$) para determinar el nivel de riesgo y generar una predicción.

### Cálculo del Porcentaje

$$Porcentaje = \frac{CL_{hoy}}{U_{umbral}} \times 100\%$$

### Zonas de Riesgo

| Zona | Condición | Predicción |
|------|-----------|------------|
| **Zona Segura** | $CL_{hoy} < 50\%$ del Umbral | "Riesgo bajo de dolor de cabeza en las próximas 48 horas." |
| **Zona de Precaución** | $CL_{hoy}$ está entre $50\% - 80\%$ del Umbral | "Riesgo moderado. Si continúa el estrés o mal sueño, es probable dolor de cabeza en 24-48 horas." |
| **Zona de Peligro** | $CL_{hoy} > 80\%$ del Umbral | "Riesgo alto. Es probable dolor de cabeza en 12-24 horas sin intervención." |

### Ejemplo de Predicción

Supongamos:
- Umbral del usuario: 75
- Carga acumulativa hoy: 65

Cálculo:
- Porcentaje: $(65 / 75) \times 100\% = 86.7\%$
- Zona: **Peligro** (>80%)
- Predicción: "Riesgo alto. Es probable dolor de cabeza en 12-24 horas sin intervención."

## Integración con el Algoritmo de Migraña

El algoritmo de predicción de dolores de cabeza por tensión está diseñado para trabajar en conjunto con el algoritmo de evaluación de riesgo de migraña.

### Flujo de Integración

1. **Evaluación Primaria de Migraña**: 
   - Primero se ejecuta el algoritmo de migraña
   - Si detecta criterios de migraña (dolor unilateral, pulsante, náuseas, etc.) y el score es $\geq 40$ o `mayHaveMigraine: true`, este algoritmo de predicción de tensión **no se muestra**

2. **Filtrado de Eventos No-Migrañosos**:
   - Si el usuario reporta un dolor de cabeza pero el algoritmo de migraña retorna Score $< 40$ (Bajo Riesgo) y `mayHaveMigraine: false`, se trata como un **punto de datos** para entrenar el umbral de tensión ($U_{umbral}$)

3. **Diferenciación de Desencadenantes**:
   - Los desencadenantes de migraña y dolores de cabeza por tensión son diferentes
   - Esta diferenciación permite predicciones más precisas para cada tipo

### Diagrama de Flujo

```
Check-in Diario
    ↓
Evaluar Riesgo de Migraña
    ↓
¿Riesgo Alto de Migraña? (Score ≥ 40 o mayHaveMigraine: true)
    ├─ SÍ → Mostrar solo predicción de migraña
    └─ NO → Continuar con algoritmo de tensión
            ↓
        Calcular Carga de Tensión Diaria (TL)
            ↓
        Calcular Carga Acumulativa (CL)
            ↓
        Comparar CL con Umbral del Usuario
            ↓
        Determinar Zona de Riesgo
            ↓
        Generar Predicción
            ↓
        ¿Usuario reportó dolor de cabeza no-migrañoso?
            ├─ SÍ → Actualizar Umbral del Usuario
            └─ NO → Mostrar predicción
```

## Tabla de Lógica de Implementación

Esta tabla resume cómo se procesa cada variable de entrada en el algoritmo:

| Variable de Entrada | Lógica Aplicada | Valores de Alto Riesgo |
|---------------------|-----------------|------------------------|
| **Sueño** | Se invierte el valor (10 = Bueno → 0 riesgo, 0 = Malo → 10 riesgo) | Calidad < 4/10 |
| **Estrés** | Correlación directa (mayor estrés = mayor riesgo) | Nivel > 6/10 |
| **Cafeína** | Curva en "U" de riesgo (tanto abstinencia como exceso son riesgosos) | 0 (abstinencia) o > 6 (exceso) |
| **Alcohol** | Correlación directa (mayor consumo = mayor riesgo) | Consumo > 5/10 |
| **Dolor de Cabeza Previo** | Si se resuelve un dolor de cabeza, la Carga Acumulativa ($CL$) se reinicia a 0 | N/A |

### Razones Generadas

El algoritmo también genera razones específicas para explicar por qué se alcanzó cierto nivel de riesgo:

**Razones que Contribuyen al Riesgo (Met):**
- Sueño: X/10 (poco descanso) - cuando calidad < 4
- Estrés: X/10 (alto) - cuando nivel > 6
- Alcohol: X/10 (mucho más de lo habitual) - cuando consumo > 5
- Cafeína: X/10 (ninguna - abstinencia) - cuando desviación = 0
- Cafeína: X/10 (mucho más de lo habitual) - cuando desviación > 6

**Razones que No Contribuyen al Riesgo (NotMet):**
- Sueño: X/10 (suficiente) - cuando calidad ≥ 4
- Estrés: X/10 (bajo) - cuando nivel ≤ 6
- Alcohol: X/10 (ninguno) - cuando consumo = 0
- Alcohol: X/10 (consumo habitual) - cuando consumo ≤ 5
- Cafeína: X/10 (consumo habitual) - cuando desviación está entre 1-6

## Detalles Técnicos

### Reset de Carga Acumulativa (CL)

Cuando un usuario reporta que un dolor de cabeza se ha resuelto (no reporta dolor de cabeza en el check-in siguiente después de haberlo reportado), la Carga Acumulativa se reinicia a 0. Esto refleja que el cuerpo se ha recuperado y la tensión acumulada se ha disipado.

**Lógica de Reset:**
- Se comparan los dos check-ins más recientes
- Si el check-in anterior reportó dolor de cabeza y el actual no lo reporta, se resetea $CL$ a 0

### Persistencia de Datos

Los datos se almacenan en Supabase y persisten entre sesiones:

- **Historial de CL**: Se guarda el valor de Carga Acumulativa para cada fecha (clave: formato YYYY-MM-DD)
- **Umbral del Usuario**: Se almacena en la tabla `user_settings` con la clave `headache_threshold`
- **Datos de Entrenamiento**: Los valores de $CL$ en días con dolor de cabeza se almacenan en la tabla `threshold_data` para calcular el promedio y ajustar el umbral

### Funciones Principales del Código

Las siguientes funciones principales implementan el algoritmo:

#### En `utils/storage.ts`:

- **`calculateDailyTensionLoad(answers)`**: Calcula la carga de tensión diaria ($TL_{diaria}$) a partir de las respuestas del check-in
- **`evaluateHeadacheRisk(checkIn)`**: Función principal que evalúa el riesgo de dolor de cabeza, calcula $CL$, obtiene el umbral, determina la zona de riesgo y genera la predicción
- **`calculateHeadacheRisk(checkIn)`**: Función completa que integra la evaluación de migraña y el algoritmo de tensión, maneja la actualización del umbral y retorna `null` si hay alto riesgo de migraña
- **`determineRiskZone(cumulativeLoad, threshold)`**: Determina la zona de riesgo (segura, precaución, peligro) y el mensaje de predicción correspondiente

#### En `utils/supabaseStorage.ts`:

- **`calculateAndSaveCumulativeLoad(dailyTensionLoad)`**: Calcula y guarda la carga acumulativa usando el factor de decaimiento
- **`getUserThreshold()`**: Obtiene el umbral del usuario (o retorna el valor por defecto 75)
- **`updateUserThreshold(currentCL)`**: Actualiza el umbral del usuario cuando se reporta un dolor de cabeza no-migrañoso
- **`resetCumulativeLoad()`**: Reinicia la carga acumulativa a 0 cuando se resuelve un dolor de cabeza
- **`checkAndResetCLIfHeadacheResolved(checkIns)`**: Verifica si un dolor de cabeza se resolvió y resetea $CL$ si es necesario

### Constantes del Sistema

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `DEFAULT_THRESHOLD` | 75 | Umbral por defecto cuando el usuario no tiene datos históricos |
| `DECAY_FACTOR` | 0.5 | Factor de decaimiento para la carga acumulativa |
| `HEADACHE_WEIGHTS.sleep` | 0.3 | Peso del factor sueño |
| `HEADACHE_WEIGHTS.stress` | 0.4 | Peso del factor estrés |
| `HEADACHE_WEIGHTS.alcohol` | 0.15 | Peso del factor alcohol |
| `HEADACHE_WEIGHTS.caffeine` | 0.15 | Peso del factor cafeína |

## Ejemplo Completo de Ejecución

Supongamos un usuario con los siguientes datos:

**Historial:**
- Umbral personal: 70 (ajustado por datos históricos)
- CL de ayer: 45

**Check-in de Hoy:**
- Sueño: 2/10 (muy poco descanso)
- Estrés: 8/10 (muy alto)
- Alcohol: 0/10 (sin consumo)
- Cafeína: 1/10 (casi abstinencia)

**Cálculos:**

1. **Carga de Tensión Diaria:**
   - $InvSueño = 10 - 2 = 8$
   - $TL_{diaria} = (0.3 \times 8) + (0.4 \times 8) + (0.15 \times 0) + (0.15 \times 1)$
   - $TL_{diaria} = 2.4 + 3.2 + 0 + 0.15 = 5.75$

2. **Carga Acumulativa:**
   - $CL_{hoy} = 5.75 + (0.5 \times 45) = 5.75 + 22.5 = 28.25$

3. **Porcentaje del Umbral:**
   - Porcentaje: $(28.25 / 70) \times 100\% = 40.4\%$

4. **Zona de Riesgo:**
   - 40.4% < 50% → **Zona Segura**

5. **Predicción:**
   - "Riesgo bajo de dolor de cabeza en las próximas 48 horas."

6. **Razones Generadas:**
   - **Met (Contribuyen al riesgo):**
     - Sueño: 2/10 (poco descanso)
     - Estrés: 8/10 (alto)
     - Cafeína: 1/10 (ninguna - abstinencia)
   - **NotMet (No contribuyen):**
     - Alcohol: 0/10 (ninguno)

## Consideraciones Futuras

El algoritmo está diseñado para mejorar con el tiempo:

1. **Aprendizaje Automático**: Los pesos de las variables pueden ajustarse mediante técnicas de machine learning basándose en datos históricos del usuario.

2. **Personalización Avanzada**: El umbral se ajusta automáticamente, pero podrían implementarse factores adicionales como:
   - Patrones estacionales
   - Factores hormonales
   - Historial familiar

3. **Validación Continua**: A medida que se recopilan más datos, el algoritmo puede validar y refinar sus predicciones.

## Referencias

- Implementación del código: [`utils/storage.ts`](utils/storage.ts)
- Funciones de persistencia: [`utils/supabaseStorage.ts`](utils/supabaseStorage.ts)
- Documentación original en inglés: [`Headache algorithm.md`](Headache%20algorithm.md)
