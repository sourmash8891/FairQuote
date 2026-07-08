 const ANTHROPIC_API_KEY = window.ANTHROPIC_API_KEY || 'YOUR_API_KEY_HERE';

let vehicleData = null;
let manualMode = false;

function setProgress(step) {
  for (let i = 1; i <= 3; i++) {
    document.getElementById('ps' + i).classList.toggle('done', i <= step);
  }
}

function showStep(n) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById('step' + n).classList.add('active');
  setProgress(n);
}

function toggleManual() {
  manualMode = !manualMode;
  const fields = document.getElementById('manualFields');
  const toggle = document.getElementById('manualToggle');
  fields.classList.toggle('visible', manualMode);
  toggle.textContent = manualMode ? 'Use reg lookup instead' : 'Enter vehicle details manually instead';
  if (manualMode) {
    vehicleData = null;
    document.getElementById('carResult').classList.remove('visible');
  }
}

async function lookupReg() {
  const reg = document.getElementById('regInput').value.replace(/\s/g, '').toUpperCase();
  if (!reg || reg.length < 2) return;

  const btn = document.getElementById('lookupBtn');
  btn.disabled = true;
  btn.textContent = 'Looking up...';

  const resultBox = document.getElementById('carResult');
  resultBox.classList.remove('visible');

  try {
    const response = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'DVLA_API_KEY_HERE'
      },
      body: JSON.stringify({ registrationNumber: reg })
    });

    if (response.ok) {
      const data = await response.json();
      vehicleData = data;
      resultBox.innerHTML = `<strong>${data.make || ''} ${data.colour || ''}</strong>${data.yearOfManufacture ? data.yearOfManufacture + ' · ' : ''}${data.fuelType || ''}${data.engineCapacity ? ' · ' + (data.engineCapacity / 1000).toFixed(1) + 'L' : ''}`;
      resultBox.classList.add('visible');
    } else {
      showManualFallback(reg);
    }
  } catch (e) {
    showManualFallback(reg);
  }

  btn.disabled = false;
  btn.textContent = '🔍 Look up';
}

function showManualFallback(reg) {
  const resultBox = document.getElementById('carResult');
  resultBox.innerHTML = `⚠️ Couldn't find reg ${reg} — please enter details manually below`;
  resultBox.classList.add('visible');
  manualMode = true;
  document.getElementById('manualFields').classList.add('visible');
  document.getElementById('manualToggle').textContent = 'Use reg lookup instead';
}

function getVehicleString() {
  if (vehicleData) {
    return `${vehicleData.make || ''} ${vehicleData.colour || ''}, ${vehicleData.yearOfManufacture || ''}, ${vehicleData.fuelType || ''}${vehicleData.engineCapacity ? ', ' + (vehicleData.engineCapacity / 1000).toFixed(1) + 'L' : ''}`.trim();
  }
  if (manualMode) {
    const make = document.getElementById('manualMake').value;
    const model = document.getElementById('manualModel').value;
    const year = document.getElementById('manualYear').value;
    const engine = document.getElementById('manualEngine').value;
    const mileage = document.getElementById('manualMileage').value;
    if (make || model) {
      return `${year} ${make} ${model} ${engine}${mileage ? ', ' + mileage + ' miles' : ''}`.trim();
    }
  }
  return null;
}

function goToStep2() {
  const vehicle = getVehicleString();
  const region = document.getElementById('region').value;
  const garageType = document.getElementById('garageType').value;
  const symptoms = document.getElementById('symptoms').value.trim();
  const quote = document.getElementById('quoteText').value.trim();
  const errEl = document.getElementById('formError');

  if (!vehicle || !region || !garageType || !symptoms || !quote) {
    errEl.style.display = 'block';
    errEl.textContent = !vehicle
      ? 'Please look up your reg or enter vehicle details manually'
      : 'Please fill in all required fields before continuing';
    return;
  }

  errEl.style.display = 'none';
  showStep(2);
  runAnalysis(vehicle, region, garageType, symptoms, quote);
}

const loadingMessages = [
  'Checking labour times for your vehicle...',
  'Comparing regional rates...',
  'Looking for red flags...',
  'Putting together your report...'
];

async function runAnalysis(vehicle, region, garageType, symptoms, quote) {
  let msgIdx = 0;
  const msgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % loadingMessages.length;
    const el = document.getElementById('loadingMsg');
    if (el) el.textContent = loadingMessages[msgIdx];
  }, 2000);

  const systemPrompt = `You are FairQuote, an expert mechanic assistant with 20+ years of hands-on trade experience in both independent garages and main dealerships across the UK. You analyse garage quotes for UK consumers honestly and fairly.

Your role is to help the customer understand if their quote is reasonable — not to bash garages. Garages deserve to make a living and many charges are completely legitimate. Always be fair to both sides.

Key knowledge:
- UK labour rates: Independent garages £55-£90/hr (London £90-£120), Main dealerships £100-£160/hr, Fast-fit chains £60-£85/hr
- Parts markups: 20-40% over trade price is normal and fair. Over 80-100% markup is worth flagging.
- Labour times vary significantly by vehicle make and model — always factor in the specific vehicle
- Unforeseen complications like seized bolts are real and legitimate — garages should communicate these upfront
- MOT advisories are not always urgent — use context to assess
- Reference industry standard labour times mentally when assessing jobs

Respond ONLY in valid JSON, no markdown, no preamble. Use this exact structure:
{
  "overall": {
    "verdict": "fair" or "caution" or "concern",
    "summary": "2-3 sentence plain English summary"
  },
  "labour": {
    "verdict": "fair" or "caution" or "concern",
    "analysis": "Assessment of labour charges vs expected times for this specific vehicle and regional rates"
  },
  "parts": {
    "verdict": "fair" or "caution" or "concern",
    "analysis": "Assessment of parts pricing. Acknowledge reasonable markup is normal and fair."
  },
  "flags": [
    { "severity": "red" or "amber" or "green", "text": "specific observation" }
  ],
  "questions": [
    "Question 1 to ask the garage",
    "Question 2 to ask the garage",
    "Question 3 to ask the garage"
  ],
  "communication": "One sentence on whether something should have been explained upfront or if communication looks fine"
}`;

  const userMsg = `Vehicle: ${vehicle}
Region: ${region}
Garage type: ${garageType}
Reason for visit / symptoms: ${symptoms}

Quote:
${quote}

Please analyse this quote honestly and return JSON only.`;

  try {
    const response = await fetch('/api/analyse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vehicle, region, garageType, symptoms, quote })
    });

    clearInterval(msgInterval);
    const result = await response.json();
    if (result.error) throw new Error(result.error);
    renderResults(result);
  } catch (err) {
    clearInterval(msgInterval);
    renderError();
  }
}

function verdictLabel(v) {
  if (v === 'fair') return 'Looks fair';
  if (v === 'caution') return 'Worth querying';
  return 'Needs attention';
}

function renderResults(r) {
  const c = document.getElementById('resultsContainer');
  const flagsHtml = (r.flags || []).map(f =>
    `<div class="flag-item"><div class="flag-dot ${f.severity}"></div><span>${f.text}</span></div>`
  ).join('');
  const questionsHtml = (r.questions || []).map(q => `<li>${q}</li>`).join('');

  c.innerHTML = `
    <div class="result-card">
      <span class="verdict-badge verdict-${r.overall.verdict}">${verdictLabel(r.overall.verdict)}</span>
      <h3>Overall verdict</h3>
      <p>${r.overall.summary}</p>
    </div>
    <div class="result-card">
      <span class="verdict-badge verdict-${r.labour.verdict}">${verdictLabel(r.labour.verdict)}</span>
      <h3>Labour assessment</h3>
      <p>${r.labour.analysis}</p>
    </div>
    <div class="result-card">
      <span class="verdict-badge verdict-${r.parts.verdict}">${verdictLabel(r.parts.verdict)}</span>
      <h3>Parts pricing</h3>
      <p>${r.parts.analysis}</p>
    </div>
    ${flagsHtml ? `<div class="result-card"><div class="section-title">Observations</div>${flagsHtml}</div>` : ''}
    <div class="result-card">
      <div class="section-title">Questions to ask your garage</div>
      <ul class="questions-list">${questionsHtml}</ul>
    </div>
    ${r.communication ? `<div class="result-card"><div class="section-title">Communication</div><p>${r.communication}</p></div>` : ''}
  `;
  showStep(3);
}

function renderError() {
  const c = document.getElementById('resultsContainer');
  c.innerHTML = `
    <div class="result-card">
      <h3>Something went wrong</h3>
      <p>We couldn't analyse your quote right now. Please check your connection and try again in a moment.</p>
    </div>`;
  showStep(3);
}

function resetApp() {
  vehicleData = null;
  manualMode = false;
  document.getElementById('regInput').value = '';
  document.getElementById('carResult').classList.remove('visible');
  document.getElementById('manualFields').classList.remove('visible');
  document.getElementById('manualToggle').textContent = 'Enter vehicle details manually instead';
  document.getElementById('manualMake').value = '';
  document.getElementById('manualModel').value = '';
  document.getElementById('manualYear').value = '';
  document.getElementById('manualEngine').value = '';
  document.getElementById('manualMileage').value = '';
  document.getElementById('region').value = '';
  document.getElementById('garageType').value = '';
  document.getElementById('symptoms').value = '';
  document.getElementById('quoteText').value = '';
  document.getElementById('resultsContainer').innerHTML = '';
  document.getElementById('formError').style.display = 'none';
  showStep(1);
}
