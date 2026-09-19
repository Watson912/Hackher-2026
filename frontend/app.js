/* =========================================================
   CYCLE ENGINE, PLAN GENERATOR & INSIGHTS
   ---------------------------------------------------------
   Everything below is computed client-side (pure functions +
   localStorage) — there's no cycle/plan/log API on the backend
   yet. It's kept as one block so it's easy to swap later:
     - getCyclePhase()   -> replace with GET /api/users/{id}/cycle
     - loadLogs()/saveLog() -> replace with GET/POST /api/logs
   until then, this is a fully working rough draft on its own.
========================================================= */

const PHASE_LABEL = { menstrual: "Menstrual", follicular: "Follicular", ovulation: "Ovulation", luteal: "Luteal" };
const PHASE_COLOR_VAR = { menstrual: "--rose", follicular: "--peach", ovulation: "--coral", luteal: "--lilac" };
const PHASE_BLURB = {
    menstrual: "Energy is typically at its lowest — favoring mobility and light loads.",
    follicular: "Estrogen is rising — energy and recovery climb, a good window to push intensity.",
    ovulation: "Peak estrogen, brief window — strength and power output often peak here.",
    luteal: "Progesterone rises, energy tends to dip toward the end — favor steady-state work."
};

function getCyclePhase(lastPeriodStart, cycleLength, today) {
    cycleLength = Math.max(18, Math.min(45, cycleLength || 28));
    today = today || new Date();

    const start = new Date(lastPeriodStart);
    const diffDays = Math.floor((today.setHours(0, 0, 0, 0) - new Date(start).setHours(0, 0, 0, 0)) / 86400000);
    const cycleDay = ((diffDays % cycleLength) + cycleLength) % cycleLength + 1;

    const periodLength = Math.min(6, Math.max(3, Math.round(cycleLength * 0.18)));
    const ovulationDay = Math.max(periodLength + 3, cycleLength - 14);
    const ovStart = Math.max(periodLength + 1, ovulationDay - 1);
    const ovEnd = Math.min(cycleLength, ovulationDay + 1);

    let phase;
    if (cycleDay <= periodLength) phase = "menstrual";
    else if (cycleDay < ovStart) phase = "follicular";
    else if (cycleDay <= ovEnd) phase = "ovulation";
    else phase = "luteal";

    const boundaries = [periodLength, ovStart - 1, ovEnd, cycleLength];
    const order = ["menstrual", "follicular", "ovulation", "luteal"];
    let daysUntilNext = null, nextPhase = null;
    for (let i = 0; i < boundaries.length; i++) {
        if (cycleDay <= boundaries[i]) {
            daysUntilNext = boundaries[i] - cycleDay + 1;
            nextPhase = order[(i + 1) % order.length];
            break;
        }
    }

    return { phase, cycleDay, cycleLength, daysUntilNext, nextPhase };
}

const PLAN_RULES = {
    menstrual: {
        strength: { intensity: "Low", focus: "Mobility + light strength" },
        cardio: { intensity: "Low", focus: "Easy walk or gentle spin" },
        general: { intensity: "Low", focus: "Stretch + light full-body" },
        nutrition: "Lean into iron (leafy greens, red meat, lentils) and extra fluids this week."
    },
    follicular: {
        strength: { intensity: "Rising", focus: "Progressive overload, new lifts" },
        cardio: { intensity: "Moderate", focus: "Tempo runs / intervals" },
        general: { intensity: "Moderate", focus: "Full-body strength + light cardio" },
        nutrition: "Appetite and recovery capacity are climbing — a good week to fuel training a bit more."
    },
    ovulation: {
        strength: { intensity: "Peak", focus: "Heaviest lifts of the cycle" },
        cardio: { intensity: "Peak", focus: "Speed work / hard intervals" },
        general: { intensity: "High", focus: "Highest-intensity session of the week" },
        nutrition: "Strength and power tend to peak here — prioritize protein around your hardest sessions."
    },
    luteal: {
        strength: { intensity: "Tapering", focus: "Maintain load, more rest between sets" },
        cardio: { intensity: "Tapering", focus: "Steady zone-2 cardio" },
        general: { intensity: "Tapering", focus: "Steady-state + mobility" },
        nutrition: "Cravings often rise with progesterone — extra complex carbs and magnesium can help."
    }
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function generatePlan(phase, goal, daysPerWeek) {
    const phaseRules = PLAN_RULES[phase];
    const rule = phaseRules[goal];
    daysPerWeek = Math.max(1, Math.min(6, daysPerWeek));
    const gap = 7 / daysPerWeek;
    const trainingDays = new Set();
    for (let i = 0; i < daysPerWeek; i++) trainingDays.add(Math.round(i * gap) % 7);

    const todayDow = new Date().getDay();
    const week = [];
    for (let i = 0; i < 7; i++) {
        const isTraining = trainingDays.has(i);
        week.push({
            dow: DOW[(todayDow + i) % 7],
            isToday: i === 0,
            isTraining,
            focus: isTraining ? rule.focus : "Rest / recovery",
            intensity: isTraining ? rule.intensity : "—"
        });
    }
    return { week, nutrition: phaseRules.nutrition };
}

/* --- logs: localStorage for now, see file header --- */

const LOG_KEY = "herbalance_logs_v1";

function seedLogs() {
    const base = [
        { phase: "menstrual", energy: 2 }, { phase: "menstrual", energy: 2 },
        { phase: "follicular", energy: 4 }, { phase: "follicular", energy: 4 }, { phase: "follicular", energy: 5 },
        { phase: "ovulation", energy: 4 }, { phase: "ovulation", energy: 3 },
        { phase: "luteal", energy: 3 }, { phase: "luteal", energy: 2 }, { phase: "luteal", energy: 2 }
    ];
    return base.map((l, i) => Object.assign({ id: "seed-" + i, seeded: true, loggedAt: Date.now() - (base.length - i) * 86400000 }, l));
}

function loadLogs() {
    try {
        const raw = localStorage.getItem(LOG_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    const seeded = seedLogs();
    try { localStorage.setItem(LOG_KEY, JSON.stringify(seeded)); } catch (e) {}
    return seeded;
}

function saveLog(entry) {
    let logs = [];
    try { logs = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch (e) {}
    logs.push(entry);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch (e) {}
    return logs;
}

/* --- rendering --- */

function renderPlan() {
    const lastPeriodVal = document.getElementById("lastPeriod").value;
    const cycleLength = parseInt(document.getElementById("cycleLength").value, 10) || 28;
    const goal = document.getElementById("goal").value;
    const daysPerWeek = parseInt(document.getElementById("daysPerWeek").value, 10) || 4;

    if (!lastPeriodVal) return null;

    const info = getCyclePhase(new Date(lastPeriodVal + "T00:00:00"), cycleLength, new Date());
    const colorVar = PHASE_COLOR_VAR[info.phase];

    const pill = document.getElementById("phasePill");
    pill.style.setProperty("--phase-color", `var(${colorVar})`);
    document.getElementById("phaseName").textContent = PHASE_LABEL[info.phase];

    const { week, nutrition } = generatePlan(info.phase, goal, daysPerWeek);

    document.getElementById("planHint").innerHTML =
        `<b>${PHASE_LABEL[info.phase]}</b> · day ${info.cycleDay} of ${info.cycleLength} · ${PHASE_BLURB[info.phase]}`;

    document.getElementById("sessionList").innerHTML = week.map(d => `
        <li class="${d.isToday ? "today" : ""}">
            <span><strong>${d.dow}${d.isToday ? " · Today" : ""}</strong> — ${d.focus}</span>
            <span class="tag">${d.intensity}</span>
        </li>
    `).join("");

    document.getElementById("nutritionNote").innerHTML = `<b>Nutrition note</b><br>${nutrition}`;

    return info.phase;
}

function renderInsights(currentPhase) {
    const logs = loadLogs();
    document.getElementById("logCount").textContent = logs.length;

    const phases = ["menstrual", "follicular", "ovulation", "luteal"];
    const byPhase = {};
    phases.forEach(p => byPhase[p] = []);
    logs.forEach(l => { if (byPhase[l.phase]) byPhase[l.phase].push(l.energy); });

    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const avgByPhase = {};
    phases.forEach(p => avgByPhase[p] = avg(byPhase[p]));

    const peak = phases.reduce((a, b) => avgByPhase[b] > avgByPhase[a] ? b : a, phases[0]);
    const textbookPeak = "ovulation";

    document.getElementById("insightText").innerHTML = (peak !== textbookPeak && avgByPhase[peak] > 0)
        ? `You actually peak during your <b>${PHASE_LABEL[peak]}</b> phase (avg ${avgByPhase[peak].toFixed(1)}/5) — not <b>${PHASE_LABEL[textbookPeak]}</b>, like the textbook pattern predicts.`
        : `Your logged pattern matches the textbook so far — energy peaks during <b>${PHASE_LABEL[textbookPeak]}</b>.`;

    const maxAvg = Math.max(1, ...Object.values(avgByPhase));
    document.getElementById("phaseBars").innerHTML = phases.map(p => `
        <div class="bar-row">
            <span class="label">${PHASE_LABEL[p]}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(avgByPhase[p] / maxAvg * 100).toFixed(0)}%; background: var(${PHASE_COLOR_VAR[p]})"></div></div>
            <span class="bar-val">${avgByPhase[p] ? avgByPhase[p].toFixed(1) : "–"}</span>
        </div>
    `).join("");
}

function isoDaysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}

let currentPhase = null;

function renderAll() {
    currentPhase = renderPlan();
    renderInsights(currentPhase);
}

document.getElementById("lastPeriod").value = isoDaysAgo(10); // demo default: mid-cycle
["lastPeriod", "cycleLength", "goal", "daysPerWeek"].forEach(id => {
    document.getElementById(id).addEventListener("input", renderAll);
    document.getElementById(id).addEventListener("change", renderAll);
});

renderAll();

/* =========================================================
   MOOD TAP-GRID
   ---------------------------------------------------------
   Doubles as the session check-in that feeds Insights above
   (energy = the mood you tapped) so there's real data to chart
   without a separate logging UI.
========================================================= */

const MOOD_NOTES = {
    1: "Rough one today — be gentle with yourself.",
    2: "A little off today — that's okay.",
    3: "Feeling steady today.",
    4: "Feeling good today ♡",
    5: "Feeling great today! ♡"
};

document.getElementById("moodGrid").addEventListener("click", (e) => {
    const chip = e.target.closest(".mood-chip");
    if (!chip) return;

    document.querySelectorAll(".mood-chip").forEach(c => c.classList.remove("selected"));
    chip.classList.add("selected");

    document.getElementById("moodNote").textContent = MOOD_NOTES[chip.dataset.mood] || "";

    if (currentPhase) {
        saveLog({ id: "log-" + Date.now(), phase: currentPhase, energy: parseInt(chip.dataset.mood, 10), loggedAt: Date.now() });
        renderInsights(currentPhase);
    }
});

async function loadFoods() {

    const response = await fetch("http://localhost:8080/api/foods");

    const foods = await response.json();

    const foodList = document.getElementById("foodList");

    foodList.innerHTML = "";

    foods.forEach((food, i) => {

        const pct = Math.max(4, Math.min(100, Math.round((food.calories / 2000) * 100)));

        foodList.innerHTML += `
            <div style="animation-delay: ${i * 0.05}s">
                <div class="food-card-head">
                    <span class="food-mini-ring" style="--pct: ${pct}"></span>
                    <h3>${food.name}</h3>
                </div>
                <p>Calories <span>${food.calories}</span></p>
                <p>Protein <span>${food.protein}g</span></p>
                <p>Carbs <span>${food.carbs}g</span></p>
                <p>Fat <span>${food.fat}g</span></p>
            </div>
        `;
    });
}