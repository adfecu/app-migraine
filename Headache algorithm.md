### **Algorithm: Prediction of Next Non-Migraine Headache (Tension-Type)**

**Objective:** Estimate the probability or timeframe of the next non-migraine headache based on daily accumulating risk factors.

#### **1\. Data Inputs (From Daily Check-in)**

We will use the following inputs from your "Estado General" (General Status) section, as these are tracked daily regardless of headache presence:

* **Sleep Quality ($S\_q$):** 0-10 scale 1

* **Stress Level ($St$):** 0-10 scale 2

* **Alcohol Consumption ($A$):** 0-10 scale 3

* **Caffeine Deviation ($C$):** 0-10 scale (where \>5 indicates withdrawal or excess) 4

#### **2\. The "Tension Load" Score ($TL$)**

Non-migraine headaches (often tension headaches) are frequently cumulative. We calculate a daily "Tension Load" score based on the user's inputs.

$$TL\_{daily} \= (W\_{sleep} \\times \\text{InvSleep}) \+ (W\_{stress} \\times St) \+ (W\_{alc} \\times A) \+ (W\_{caf} \\times C)$$

* **InvSleep (Inverted Sleep):** Since high sleep quality (10) is good, we invert it: $(10 \- S\_q)$. A score of 10 becomes 0 risk; a score of 0 becomes 10 risk.  
* **Weights ($W$):** Assign weights based on clinical relevance (these can be adjusted via machine learning later).  
  * $W\_{stress} \= 0.4$ (Stress is a primary trigger for tension headaches)  
  * $W\_{sleep} \= 0.3$  
  * $W\_{caf} \= 0.15$  
  * $W\_{alc} \= 0.15$

#### **3\. Accumulation and Threshold Logic**

Unlike a migraine which might be triggered immediately by a specific event (like a smell or flashing light), tension headaches often happen when the "load" exceeds a person's threshold over time.

A. Calculate Cumulative Load ($CL$):

$$CL\_{today} \= TL\_{daily} \+ (\\text{DecayFactor} \\times CL\_{yesterday})$$

* **DecayFactor:** A value between 0 and 1 (e.g., 0.5). This represents the body's ability to recover. If the user had a high stress day yesterday, some of that "tension" carries over, but some dissipates.

**B. Define User Threshold ($U\_{thresh}$):**

* Initially set a default (e.g., 75).  
* **Dynamic Adjustment:** Every time the user reports a headache that is categorized as **Non-Migraine** (via your existing "Algoritmo riesgo migraña" returning "Low Risk" or mayHaveMigraine: false 5), record the $CL$ value of that day. Set the user's unique threshold to the average of their $CL$ on headache days.

#### **4\. Prediction Output**

The algorithm compares the Current Cumulative Load ($CL\_{today}$) against the User Threshold ($U\_{thresh}$).

* **Safe Zone:** $CL\_{today} \< 50\\%$ of Threshold.  
  * *Prediction:* "Low risk of headache in the next 48 hours."  
* **Caution Zone:** $CL\_{today}$ is $50\\% \- 80\\%$ of Threshold.  
  * *Prediction:* "Moderate risk. If stress/poor sleep continues, headache likely within 24-48 hours."  
* **Danger Zone:** $CL\_{today} \> 80\\%$ of Threshold.  
  * *Prediction:* "High risk. Headache likely within 12-24 hours without intervention."

#### **5\. Integration with Existing "Migraine Risk" Algorithm**

You must differentiate between predicting a *Migraine* vs. a *Non-Migraine* headache, as the triggers differ.

1. **Run Migraine Check first:** Use your algorithm. If the criteria for migraine are met (Unilateral, Pulsating, Nausea, etc.) 6, this specific prediction algorithm is overridden (it is a migraine event).

2. **Filter Non-Migraine Events:** If the user reports a headache but the migraine algorithm returns Score \< 40 (Low Risk)7, treat this as a **Data Point** to train the Tension Threshold ($U\_{thresh}$).

### **Implementation Logic Table**

| Input Variable | Logic Applied |
| :---- | :---- |
| **Sleep** | Invert value (10=Good, 0=Bad). High risk if \< 4\. |
| **Stress** | Direct correlation. High risk if \> 6\. |
| **Caffeine** | "U" curve risk. 0 (Withdrawal) and \>6 (Excess) are risk factors. |
| **Alcohol** | Direct correlation. High risk if \> 5\. |
| **Previous Headache** | Reset Cumulative Load ($CL$) to 0 after a reported headache resolves. |

