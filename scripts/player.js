const NOISE_FILE = "Radio Static Sound Effect 4.mp3";
const DEFAULT_FILE = "Freepik Audio Editor.mp3";
const SPECIAL_FILE = "REM Losing My Religion.mp3";
const SPECIAL_KEY = "decoder.specialTransmission";

const MIN_FREQUENCY = 300;
const MAX_FREQUENCY = 3500;
const MIN_Q = 1;
const MAX_Q = 20;
const MAX_HIGHPASS = 1000;

const CORRECT_VALUES = {
  frequency: 0.6,
  stability: 0.3,
  noise: 0.7
};

const START_VALUES = {
  frequency: 0.2,
  stability: 0.5,
  noise: 0.3
};

export function initPlayer() {
  const canvas = document.getElementById("wave");

  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const status = document.querySelector(".status");
  const timer = document.getElementById("recordingTimer");
  const valueFrequency = document.querySelector('.stats .stat[data-stat="frequency"] .stat-value');
  const valueStability = document.querySelector('.stats .stat[data-stat="stability"] .stat-value');
  const valueNoise = document.querySelector('.stats .stat[data-stat="noise"] .stat-value');

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const transmissionFile = getTransmissionFile();

  let audioPromise = null;
  let noiseSource = null;
  let voiceSource = null;
  let bandPass = null;
  let clarityFilter = null;
  let distortion = null;
  let voiceGain = null;
  let noiseFilter = null;
  let noiseGain = null;
  let masterGain = null;
  let analyser = null;
  let animationId = null;
  let isPlaying = false;
  let startTime = 0;
  let alreadyDecoded = false;

  let knobs = {
    frequency: START_VALUES.frequency,
    stability: START_VALUES.stability,
    noise: START_VALUES.noise
  };

  if (window.decoderKnobs) {
    knobs = {
      frequency: window.decoderKnobs.frequency,
      stability: window.decoderKnobs.stability,
      noise: window.decoderKnobs.noise
    };
  }

  let state = makeState(knobs);

  function getTransmissionFile() {
    const specialMode = window.sessionStorage.getItem(SPECIAL_KEY) === "rem";

    if (specialMode) {
      window.sessionStorage.removeItem(SPECIAL_KEY);
      return SPECIAL_FILE;
    }

    return DEFAULT_FILE;
  }

  function clamp(value, min, max) {
    if (value < min) {
      return min;
    }

    if (value > max) {
      return max;
    }

    return value;
  }

  function map(value, fromMin, fromMax, toMin, toMax) {
    const part = (value - fromMin) / (fromMax - fromMin);
    return toMin + (toMax - toMin) * part;
  }

  function ease(value) {
    const safeValue = clamp(value, 0, 1);
    return safeValue * safeValue;
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function makeCurve(amount) {
    const count = 44100;
    const curve = new Float32Array(count);
    const safe = Math.max(0, amount);
    const deg = Math.PI / 180;

    for (let i = 0; i < count; i += 1) {
      const x = (i * 2) / count - 1;
      curve[i] = ((3 + safe) * x * 20 * deg) / (Math.PI + safe * Math.abs(x));
    }

    return curve;
  }

  function getMatch(value, target) {
    return clamp(1 - Math.abs(value - target) / 0.45, 0, 1);
  }

  function makeState(currentKnobs) {
    const frequencyMatch = ease(getMatch(currentKnobs.frequency, CORRECT_VALUES.frequency));
    const stabilityMatch = ease(getMatch(currentKnobs.stability, CORRECT_VALUES.stability));
    const noiseMatch = ease(getMatch(currentKnobs.noise, CORRECT_VALUES.noise));

    const distance =
      Math.abs(currentKnobs.frequency - CORRECT_VALUES.frequency) +
      Math.abs(currentKnobs.stability - CORRECT_VALUES.stability) +
      Math.abs(currentKnobs.noise - CORRECT_VALUES.noise);

    const clarity = Math.max(0, 1 - distance);
    const smoothClarity = ease(clarity);
    const rawFrequencyMatch = getMatch(currentKnobs.frequency, CORRECT_VALUES.frequency);
    const frequencyPart = Math.pow(rawFrequencyMatch, 2.4);
    let lowPenalty = 1;

    if (currentKnobs.frequency < 0.38) {
      lowPenalty = map(currentKnobs.frequency, 0, 0.38, 0.14, 1);
    }

    let voiceBoost = 1;

    if (clarity > 0.72) {
      voiceBoost = map(clarity, 0.72, 1, 1, 1.9);
    }

    let decodeBoost = 1;

    if (distance < 0.1) {
      decodeBoost = 1.4;
    }

    const voiceVolume =
      smoothClarity *
      frequencyPart *
      lowPenalty *
      voiceBoost *
      decodeBoost;

    return {
      distance,
      clarity,
      decoded: distance < 0.1,
      frequencyHz: map(currentKnobs.frequency, 0, 1, MIN_FREQUENCY, MAX_FREQUENCY),
      qValue: map(currentKnobs.frequency, 0, 1, MIN_Q, MAX_Q),
      distortionAmount: map(currentKnobs.stability, 0, 1, 5, 180) + (1 - clarity) * 220,
      voiceGain: voiceVolume * map(currentKnobs.stability, 0, 1, 0.1, 1),
      noiseGain: clamp(0.12 + Math.pow(1 - clarity, 1.35) * 0.92, 0, 1),
      highpassHz: map(currentKnobs.noise, 0, 1, 0, MAX_HIGHPASS),
      clarityCutoffHz: 260 + smoothClarity * frequencyPart * lowPenalty * 4600,
      visual: {
        frequencyMatch,
        stabilityMatch,
        noiseMatch,
        waveformChaos: 1 - frequencyMatch,
        jitterAmount: clamp(0.08 + Math.pow(1 - stabilityMatch, 0.72) * 1.18, 0, 1.26),
        noiseAmount: 1 - noiseMatch,
        lineOpacity: 0.28 + stabilityMatch * 0.54 + clarity * 0.18,
        flickerRate: 1.4 + noiseMatch * 26,
        flickerStrength: 0.03 + (1 - noiseMatch) * 0.03 + noiseMatch * 0.05
      }
    };
  }

  function getRecordTime() {
    if (!isPlaying || !voiceSource) {
      return 0;
    }

    const passed = Math.max(0, audioContext.currentTime - startTime);

    if (!voiceSource.loop || !voiceSource.buffer || !voiceSource.buffer.duration) {
      return passed;
    }

    return passed % voiceSource.buffer.duration;
  }

  function updateText() {
    if (valueFrequency) {
      valueFrequency.textContent = String(Math.round(knobs.frequency * 100));
    }

    if (valueStability) {
      valueStability.textContent = String(Math.round(knobs.stability * 100));
    }

    if (valueNoise) {
      valueNoise.textContent = String(Math.round(knobs.noise * 100));
    }

    if (timer) {
      timer.textContent = formatTime(getRecordTime());
    }

    if (!status) {
      return;
    }

    if (state.decoded) {
      status.textContent = "СИГНАЛ РАСШИФРОВАН";
      return;
    }

    if (state.clarity < 0.3) {
      status.textContent = "СИГНАЛ ПОТЕРЯН";
      return;
    }

    if (state.clarity < 0.6) {
      status.textContent = "СЛАБЫЙ СИГНАЛ";
      return;
    }

    if (state.clarity < 0.9) {
      status.textContent = "ПОЧТИ ЗАФИКСИРОВАН";
      return;
    }

    status.textContent = "СИГНАЛ ЧИСТЫЙ";
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  async function loadBuffer(file) {
    const response = await fetch(encodeURI(file));

    if (!response.ok) {
      throw new Error(`Audio request failed with status ${response.status}.`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer.slice(0));
  }

  function loadAudio() {
    if (!audioPromise) {
      audioPromise = Promise.all([
        loadBuffer(NOISE_FILE),
        loadBuffer(transmissionFile)
      ]);
    }

    return audioPromise;
  }

  function createSource(buffer) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  function createAudioGraph() {
    if (masterGain) {
      return;
    }

    bandPass = audioContext.createBiquadFilter();
    bandPass.type = "bandpass";

    clarityFilter = audioContext.createBiquadFilter();
    clarityFilter.type = "lowpass";

    distortion = audioContext.createWaveShaper();
    distortion.oversample = "4x";

    voiceGain = audioContext.createGain();
    noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseGain = audioContext.createGain();
    masterGain = audioContext.createGain();
    analyser = audioContext.createAnalyser();

    analyser.fftSize = 2048;
    analyser.minDecibels = -96;
    analyser.maxDecibels = -12;
    analyser.smoothingTimeConstant = 0.58;
    masterGain.gain.value = 1.1;

    bandPass.connect(clarityFilter);
    clarityFilter.connect(distortion);
    distortion.connect(voiceGain);
    voiceGain.connect(masterGain);

    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);

    masterGain.connect(analyser);
    masterGain.connect(audioContext.destination);
  }

  function applyState() {
    state = makeState(knobs);

    if (
      bandPass &&
      clarityFilter &&
      distortion &&
      voiceGain &&
      noiseFilter &&
      noiseGain
    ) {
      bandPass.frequency.setTargetAtTime(state.frequencyHz, audioContext.currentTime, 0.04);
      bandPass.Q.setTargetAtTime(state.qValue * (0.35 + state.clarity * 0.65), audioContext.currentTime, 0.05);
      clarityFilter.frequency.setTargetAtTime(state.clarityCutoffHz, audioContext.currentTime, 0.05);
      distortion.curve = makeCurve(state.distortionAmount);
      noiseFilter.frequency.setTargetAtTime(state.highpassHz, audioContext.currentTime, 0.04);
      voiceGain.gain.setTargetAtTime(state.voiceGain, audioContext.currentTime, 0.05);
      noiseGain.gain.setTargetAtTime(state.noiseGain, audioContext.currentTime, 0.05);
    }

    if (state.decoded && !alreadyDecoded) {
      alreadyDecoded = true;
      window.decoderLocked = true;
      document.dispatchEvent(new CustomEvent("decoder:decoded"));
    }

    if (!state.decoded) {
      alreadyDecoded = false;
    }

    updateText();
  }

  function stopSources() {
    if (noiseSource) {
      noiseSource.onended = null;
      noiseSource.stop();
      noiseSource.disconnect();
      noiseSource = null;
    }

    if (voiceSource) {
      voiceSource.onended = null;
      voiceSource.stop();
      voiceSource.disconnect();
      voiceSource = null;
    }
  }

  async function startSound() {
    await audioContext.resume();

    const buffers = await loadAudio();
    const noiseBuffer = buffers[0];
    const voiceBuffer = buffers[1];

    createAudioGraph();
    stopSources();

    noiseSource = createSource(noiseBuffer);
    voiceSource = createSource(voiceBuffer);

    noiseSource.connect(noiseFilter);
    voiceSource.connect(bandPass);

    noiseSource.start(0);
    voiceSource.start(0);

    startTime = audioContext.currentTime;
    isPlaying = true;

    applyState();
    startAnimation();
  }

  async function toggleSound() {
    if (!isPlaying || audioContext.state === "suspended") {
      await startSound();
      return;
    }

    stopSources();
    await audioContext.suspend();
    isPlaying = false;
    updateText();
  }

  function drawIdle(width, height) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Press space", width / 2, height / 2);
  }

  function getData() {
    if (!analyser || !isPlaying) {
      return null;
    }

    const wave = new Uint8Array(analyser.fftSize);
    const freq = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(wave);
    analyser.getByteFrequencyData(freq);

    return {
      wave,
      freq
    };
  }

  function drawBackground(width, height) {
    const hue = 10 + state.clarity * 115;
    const alpha = 0.08 + state.clarity * 0.18;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);

    gradient.addColorStop(0, `hsla(${hue}, 90%, 45%, 0.06)`);
    gradient.addColorStop(0.5, `hsla(${hue}, 100%, 62%, ${alpha})`);
    gradient.addColorStop(1, `hsla(${hue}, 90%, 45%, 0.06)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function buildPoints(data, width, height) {
    const list = [];
    const centerY = height / 2;
    const amplitude = height * (0.2 + state.clarity * 0.22);
    const time = performance.now() * 0.0014;

    for (let i = 0; i < data.wave.length; i += 8) {
      const part = i / (data.wave.length - 1);
      const x = part * width;
      const sample = (data.wave[i] - 128) / 128;
      const freqIndex = Math.floor(part * (data.freq.length - 1));
      const energy = data.freq[freqIndex] / 255;

      const badWave =
        Math.sin(part * 28 + time * 2.1) * (0.45 + energy * 0.9) +
        Math.sin(part * (64 + energy * 28) - time * 1.7) * 0.35;

      const mixedSample = sample * (1 - state.visual.waveformChaos) + badWave * state.visual.waveformChaos;

      const fullJitter =
        Math.sin(part * 34 - time * 4.8) * (10 + energy * 8) +
        Math.cos(part * 63 + time * 6.9) * (8 + energy * 7) +
        Math.sin(part * 108 - time * 9.7) * (5 + energy * 6);

      const smallJitter =
        Math.sin(part * 182 + time * 14.6) * 2.8 +
        Math.cos(part * 246 - time * 17.2) * 2.1;

      const waveJitter = (fullJitter + smallJitter) * state.visual.jitterAmount;
      const lift = energy * (18 + state.clarity * 26);

      list.push({
        x,
        y: centerY + mixedSample * amplitude + waveJitter - lift * 0.5
      });
    }

    return list;
  }

  function drawLine(points, width, height) {
    if (points.length < 2) {
      return;
    }

    const hue = 10 + state.clarity * 115;
    const lineOpacity = clamp(state.visual.lineOpacity, 0.18, 1);
    const blur = state.decoded ? 0 : state.visual.noiseAmount * 18;

    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = state.decoded ? 3.2 : 2.2;
    ctx.strokeStyle = `hsla(${hue}, 100%, 72%, ${lineOpacity})`;
    ctx.shadowColor = `hsla(${hue}, 100%, 70%, ${0.18 + state.clarity * 0.45})`;
    ctx.shadowBlur = blur;

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];

      if (i === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        const prev = points[i - 1];
        const middleX = (prev.x + point.x) / 2;
        const middleY = (prev.y + point.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, middleX, middleY);
      }
    }

    const last = points[points.length - 1];
    const beforeLast = points[points.length - 2];
    ctx.quadraticCurveTo(beforeLast.x, beforeLast.y, last.x, last.y);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 + state.clarity * 0.1})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.restore();

    void width;
  }

  function drawBars(data, width, height) {
    const count = 36;
    const gap = 8;
    const areaWidth = width * 0.36;
    const barWidth = Math.max(1.5, (areaWidth - gap * (count - 1)) / count);
    const startX = (width - (barWidth * count + gap * (count - 1))) / 2;
    const centerY = height * 0.9;
    const radius = Math.min(barWidth / 2, 999);

    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.16 + state.clarity * 0.22})`;

    for (let i = 0; i < count; i += 1) {
      const part = i / (count - 1);
      const freqIndex = Math.floor(part * (data.freq.length - 1));
      const waveIndex = Math.floor(part * (data.wave.length - 1));
      const energy = data.freq[freqIndex] / 255;
      const activity = Math.abs(data.wave[waveIndex] - 128) / 128;
      const total = clamp(energy * 0.8 + activity * 0.4, 0, 1);
      const barHeight = Math.max(6, Math.pow(total, 0.72) * height * 0.12);
      const x = startX + i * (barWidth + gap);
      const y = centerY - barHeight;

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight * 2, radius);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawFlash(width, height) {
    if (state.decoded) {
      return;
    }

    const time = performance.now() * 0.001;
    const pulse = (Math.sin(time * state.visual.flickerRate * Math.PI * 2) + 1) * 0.5;
    const strongPulse = (Math.sin(time * state.visual.flickerRate * Math.PI * 5.2) + 1) * 0.5;
    let alpha = pulse * (0.015 + state.visual.flickerStrength * 0.22);

    if (strongPulse > 0.72 - state.visual.noiseMatch * 0.22) {
      alpha += strongPulse * (0.03 + state.visual.noiseMatch * 0.07);
    }

    alpha = clamp(alpha, 0, 0.16);

    if (alpha <= 0.002) {
      return;
    }

    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function drawScene() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (!width || !height) {
      return;
    }

    ctx.clearRect(0, 0, width, height);
    drawBackground(width, height);

    const data = getData();

    if (!data) {
      drawIdle(width, height);
      return;
    }

    const points = buildPoints(data, width, height);
    drawLine(points, width, height);
    drawBars(data, width, height);
    drawFlash(width, height);
  }

  function animate() {
    updateText();
    drawScene();
    animationId = window.requestAnimationFrame(animate);
  }

  function startAnimation() {
    if (animationId === null) {
      animationId = window.requestAnimationFrame(animate);
    }
  }

  async function onSpace() {
    try {
      await toggleSound();
    } catch (error) {
      console.error(error);
    }
  }

  resizeCanvas();
  applyState();
  drawScene();
  startAnimation();

  window.addEventListener("resize", () => {
    resizeCanvas();
    drawScene();
  });

  window.addEventListener("decoder:change", (event) => {
    knobs = {
      frequency: event.detail.frequency,
      stability: event.detail.stability,
      noise: event.detail.noise
    };

    applyState();
  });

  document.addEventListener("control:space", onSpace);
}
