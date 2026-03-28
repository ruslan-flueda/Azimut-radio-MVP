const NOISE_AUDIO_FILE = "Radio Static Sound Effect 4.mp3";
const TRANSMISSION_AUDIO_FILE = "Audio Conversion Mar 12 2026.mp3";

const MIN_FREQUENCY = 300;
const MAX_FREQUENCY = 3500;
const MIN_Q = 1;
const MAX_Q = 20;
const MAX_HIGHPASS = 1000;

const SECRET_COMBINATION = {
  frequency: 0.6,
  stability: 0.3,
  noise: 0.7
};

const DEFAULT_KNOBS = {
  frequency: 0.2,
  stability: 0.5,
  noise: 0.3
};

export function initPlayer() {
  const canvas = document.getElementById("wave");

  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const statusEl = document.querySelector(".status");
  const recordingTimerEl = document.getElementById("recordingTimer");
  const statEls = Array.from(document.querySelectorAll(".stats .stat"));
  const playbackContext = new (window.AudioContext || window.webkitAudioContext)();

  let audioBuffersPromise = null;
  let noiseSourceNode = null;
  let transmissionSourceNode = null;
  let bandpassNode = null;
  let clarityFilterNode = null;
  let distortionNode = null;
  let voiceGainNode = null;
  let noiseFilterNode = null;
  let noiseGainNode = null;
  let masterGainNode = null;
  let analyserNode = null;
  let animationFrameId = null;
  let isPlaying = false;
  let startedAtContextTime = 0;
  let decodedShown = false;
  let vhsGlitchUntil = 0;
  let nextVhsGlitchProbeAt = 0;

  let currentKnobs = {
    ...DEFAULT_KNOBS,
    ...(window.decoderKnobs || {})
  };

  let currentState = createInitialState();

  function createInitialState() {
    return {
      distance: 1.3,
      clarity: 0,
      decoded: false,
      frequencyHz: MIN_FREQUENCY,
      qValue: MIN_Q,
      distortionAmount: 5,
      voiceGain: 0,
      noiseGain: 1,
      highpassHz: 0,
      clarityCutoffHz: 700,
      visual: {
        frequencyMatch: 0,
        stabilityMatch: 0,
        noiseMatch: 0,
        waveformChaos: 1,
        jitterAmount: 1,
        noiseAmount: 1,
        lineOpacity: 0.5,
        flickerRate: 0.8,
        flickerStrength: 0.08
      }
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function mapRange(value, inputStart, inputEnd, outputStart, outputEnd) {
    const progress = (value - inputStart) / (inputEnd - inputStart);
    return outputStart + progress * (outputEnd - outputStart);
  }

  function easeInSquared(value) {
    return Math.pow(clamp(value, 0, 1), 2);
  }

  function formatTime(seconds) {
    const wholeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(wholeSeconds / 60);
    const secs = wholeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function getElapsedSeconds() {
    return isPlaying ? playbackContext.currentTime - startedAtContextTime : 0;
  }

  function getRecordingSeconds() {
    if (!isPlaying || !transmissionSourceNode) {
      return 0;
    }

    const elapsed = Math.max(0, playbackContext.currentTime - startedAtContextTime);

    if (!transmissionSourceNode.loop || !transmissionSourceNode.buffer) {
      return elapsed;
    }

    const duration = transmissionSourceNode.buffer.duration;

    if (!duration || !Number.isFinite(duration)) {
      return elapsed;
    }

    return elapsed % duration;
  }

  function makeDistortionCurve(amount) {
    const sampleCount = 44100;
    const curve = new Float32Array(sampleCount);
    const normalizedAmount = Math.max(0, amount);
    const deg = Math.PI / 180;

    for (let i = 0; i < sampleCount; i += 1) {
      const x = (i * 2) / sampleCount - 1;
      curve[i] = ((3 + normalizedAmount) * x * 20 * deg) / (Math.PI + normalizedAmount * Math.abs(x));
    }

    return curve;
  }

  function computeKnobMatch(knobValue, targetValue) {
    return clamp(1 - Math.abs(knobValue - targetValue) / 0.45, 0, 1);
  }

  function computeVisualState(knobs, clarity) {
    // Each knob controls its own visual layer. Nonlinear easing makes the effect
    // noticeably stronger near the correct tuning values.
    const frequencyMatch = easeInSquared(computeKnobMatch(knobs.frequency, SECRET_COMBINATION.frequency));
    const stabilityMatch = easeInSquared(computeKnobMatch(knobs.stability, SECRET_COMBINATION.stability));
    const noiseMatch = easeInSquared(computeKnobMatch(knobs.noise, SECRET_COMBINATION.noise));

    const waveformChaos = 1 - frequencyMatch;
    const jitterAmount = clamp(0.08 + Math.pow(1 - stabilityMatch, 0.72) * 1.18, 0, 1.26);
    const noiseAmount = 1 - noiseMatch;
    const lineOpacity = 0.28 + stabilityMatch * 0.54 + clarity * 0.18;
    const flickerRate = 1.4 + noiseMatch * 26;
    const flickerStrength = 0.03 + noiseAmount * 0.03 + noiseMatch * 0.05;

    return {
      frequencyMatch,
      stabilityMatch,
      noiseMatch,
      waveformChaos,
      jitterAmount,
      noiseAmount,
      lineOpacity,
      flickerRate,
      flickerStrength
    };
  }

  function computeDecoderState(knobs) {
    const distance =
      Math.abs(knobs.frequency - SECRET_COMBINATION.frequency) +
      Math.abs(knobs.stability - SECRET_COMBINATION.stability) +
      Math.abs(knobs.noise - SECRET_COMBINATION.noise);
    const clarity = Math.max(0, 1 - distance);
    const frequencyMatch = computeKnobMatch(knobs.frequency, SECRET_COMBINATION.frequency);
    const frequencyHz = mapRange(knobs.frequency, 0, 1, MIN_FREQUENCY, MAX_FREQUENCY);
    const qValue = mapRange(knobs.frequency, 0, 1, MIN_Q, MAX_Q);
    const distortionAmount = mapRange(knobs.stability, 0, 1, 5, 180) + (1 - clarity) * 220;
    const stabilityVoiceGain = mapRange(knobs.stability, 0, 1, 0.1, 1);
    const easedClarity = easeInSquared(clarity);
    const frequencyAudibility = Math.pow(frequencyMatch, 2.4);
    const lowBandPenalty = knobs.frequency < 0.38 ? mapRange(knobs.frequency, 0, 0.38, 0.14, 1) : 1;
    const voicePresenceBoost = clarity > 0.72 ? mapRange(clarity, 0.72, 1, 1, 1.9) : 1;
    const decodedVoiceBoost = distance < 0.1 ? 1.4 : 1;
    const voiceGain =
      easedClarity *
      frequencyAudibility *
      lowBandPenalty *
      voicePresenceBoost *
      decodedVoiceBoost;
    const noiseGain = clamp(0.12 + Math.pow(1 - clarity, 1.35) * 0.92, 0, 1);
    const highpassHz = mapRange(knobs.noise, 0, 1, 0, MAX_HIGHPASS);
    const clarityCutoffHz = 260 + easedClarity * frequencyAudibility * lowBandPenalty * 4600;

    return {
      distance,
      clarity,
      decoded: distance < 0.1,
      frequencyHz,
      qValue,
      distortionAmount,
      voiceGain: voiceGain * stabilityVoiceGain,
      noiseGain,
      highpassHz,
      clarityCutoffHz,
      visual: computeVisualState(knobs, clarity)
    };
  }

  function updateReadout() {
    if (statEls[0]) {
      statEls[0].textContent = `Tuning: searching ${Math.round((1 - currentState.visual.waveformChaos) * 100)}%`;
    }

    if (statEls[1]) {
      statEls[1].textContent = `Focus: stabilizing ${Math.round((1 - currentState.visual.jitterAmount) * 100)}%`;
    }

    if (statEls[2]) {
      statEls[2].textContent = `Clarity: ${Math.round((1 - currentState.visual.noiseAmount) * 100)}%`;
    }

    if (recordingTimerEl) {
      recordingTimerEl.textContent = formatTime(getRecordingSeconds());
    }

    if (currentState.decoded) {
      if (statusEl) {
        statusEl.textContent = "SIGNAL DECODED";
      }
      return;
    }

    if (!statusEl) {
      return;
    }

    if (currentState.clarity < 0.3) {
      statusEl.textContent = "SIGNAL LOST";
      return;
    }

    if (currentState.clarity < 0.6) {
      statusEl.textContent = "WEAK SIGNAL";
      return;
    }

    if (currentState.clarity < 0.9) {
      statusEl.textContent = "ALMOST LOCKED";
      return;
    }

    statusEl.textContent = "SIGNAL CLEAR";
  }

  function setupCanvasResolution() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  async function loadAudioBuffer(url) {
    const response = await fetch(encodeURI(url));

    if (!response.ok) {
      throw new Error(`Audio request failed with status ${response.status}.`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return playbackContext.decodeAudioData(arrayBuffer.slice(0));
  }

  function ensureAudioBuffers() {
    if (!audioBuffersPromise) {
      audioBuffersPromise = Promise.all([
        loadAudioBuffer(NOISE_AUDIO_FILE),
        loadAudioBuffer(TRANSMISSION_AUDIO_FILE)
      ]);
    }

    return audioBuffersPromise;
  }

  function createSource(buffer) {
    const source = playbackContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  function ensureAudioGraph() {
    if (masterGainNode) {
      return;
    }

    bandpassNode = playbackContext.createBiquadFilter();
    bandpassNode.type = "bandpass";

    clarityFilterNode = playbackContext.createBiquadFilter();
    clarityFilterNode.type = "lowpass";

    distortionNode = playbackContext.createWaveShaper();
    distortionNode.oversample = "4x";

    voiceGainNode = playbackContext.createGain();

    noiseFilterNode = playbackContext.createBiquadFilter();
    noiseFilterNode.type = "highpass";

    noiseGainNode = playbackContext.createGain();
    masterGainNode = playbackContext.createGain();
    analyserNode = playbackContext.createAnalyser();

    analyserNode.fftSize = 2048;
    analyserNode.minDecibels = -96;
    analyserNode.maxDecibels = -12;
    analyserNode.smoothingTimeConstant = 0.58;
    masterGainNode.gain.value = 1.1;

    // Voice chain: band shaping -> distortion -> voice level.
    bandpassNode.connect(clarityFilterNode);
    clarityFilterNode.connect(distortionNode);
    distortionNode.connect(voiceGainNode);
    voiceGainNode.connect(masterGainNode);

    // Noise chain: remove low frequencies -> control noise amount.
    noiseFilterNode.connect(noiseGainNode);
    noiseGainNode.connect(masterGainNode);

    // Visualizer listens to the final mixed signal.
    masterGainNode.connect(analyserNode);
    masterGainNode.connect(playbackContext.destination);
  }

  function applyDecoderState() {
    currentState = computeDecoderState(currentKnobs);

    if (bandpassNode && clarityFilterNode && distortionNode && voiceGainNode && noiseFilterNode && noiseGainNode) {
      bandpassNode.frequency.setTargetAtTime(currentState.frequencyHz, playbackContext.currentTime, 0.04);
      bandpassNode.Q.setTargetAtTime(
        currentState.qValue * (0.35 + currentState.clarity * 0.65),
        playbackContext.currentTime,
        0.05
      );
      clarityFilterNode.frequency.setTargetAtTime(currentState.clarityCutoffHz, playbackContext.currentTime, 0.05);
      distortionNode.curve = makeDistortionCurve(currentState.distortionAmount);
      noiseFilterNode.frequency.setTargetAtTime(currentState.highpassHz, playbackContext.currentTime, 0.04);
      voiceGainNode.gain.setTargetAtTime(currentState.voiceGain, playbackContext.currentTime, 0.05);
      noiseGainNode.gain.setTargetAtTime(currentState.noiseGain, playbackContext.currentTime, 0.05);
    }

    if (currentState.decoded && !decodedShown) {
      decodedShown = true;
      window.decoderLocked = true;
      document.dispatchEvent(new CustomEvent("decoder:decoded"));
    }

    if (!currentState.decoded) {
      decodedShown = false;
    }

    updateReadout();
  }

  function stopSources() {
    if (noiseSourceNode) {
      noiseSourceNode.onended = null;
      noiseSourceNode.stop();
      noiseSourceNode.disconnect();
      noiseSourceNode = null;
    }

    if (transmissionSourceNode) {
      transmissionSourceNode.onended = null;
      transmissionSourceNode.stop();
      transmissionSourceNode.disconnect();
      transmissionSourceNode = null;
    }
  }

  async function startPlayback() {
    // Resume the audio context directly inside the user-initiated action.
    // On hosted builds the network fetch can break the gesture chain if this
    // happens later, which causes playback to be blocked by the browser.
    await playbackContext.resume();

    const [noiseBuffer, transmissionBuffer] = await ensureAudioBuffers();

    ensureAudioGraph();
    stopSources();

    noiseSourceNode = createSource(noiseBuffer);
    transmissionSourceNode = createSource(transmissionBuffer);

    noiseSourceNode.connect(noiseFilterNode);
    transmissionSourceNode.connect(bandpassNode);

    noiseSourceNode.start(0);
    transmissionSourceNode.start(0);
    startedAtContextTime = playbackContext.currentTime;
    isPlaying = true;
    applyDecoderState();
    ensureAnimationRunning();
  }

  async function togglePlayback() {
    if (!isPlaying || playbackContext.state === "suspended") {
      await startPlayback();
      return;
    }

    stopSources();
    await playbackContext.suspend();
    isPlaying = false;
    updateReadout();
  }

  function drawIdleText(width, height) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Press space", width / 2, height / 2);
  }

  function drawBackground(width, height) {
    const glowHue = 10 + currentState.clarity * 115;
    const glowStrength = 0.08 + currentState.clarity * 0.18;
    const glow = ctx.createLinearGradient(0, 0, width, 0);
    glow.addColorStop(0, `hsla(${glowHue}, 90%, 45%, 0.06)`);
    glow.addColorStop(0.5, `hsla(${glowHue}, 100%, 62%, ${glowStrength})`);
    glow.addColorStop(1, `hsla(${glowHue}, 90%, 45%, 0.06)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  function getVisualData() {
    if (!analyserNode || !isPlaying) {
      return null;
    }

    const timeData = new Uint8Array(analyserNode.fftSize);
    const frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteTimeDomainData(timeData);
    analyserNode.getByteFrequencyData(frequencyData);
    return { timeData, frequencyData };
  }

  function buildWavePoints(visualData, width, height) {
    const centerY = height / 2;
    const amplitude = height * (0.2 + currentState.clarity * 0.22);
    const points = [];
    const waveChaos = currentState.visual.waveformChaos;
    const jitterAmount = currentState.visual.jitterAmount;
    const timeData = visualData.timeData;
    const frequencyData = visualData.frequencyData;
    const time = performance.now() * 0.0014;

    for (let i = 0; i < timeData.length; i += 8) {
      const progress = i / (timeData.length - 1);
      const x = progress * width;
      const sample = (timeData[i] - 128) / 128;
      const freqIndex = Math.floor(progress * (frequencyData.length - 1));
      const spectralEnergy = frequencyData[freqIndex] / 255;

      // The base line still comes from the real audio waveform. Frequency bins
      // add dynamic peaks, so the trace reacts to the actual sound content.
      const chaosWave =
        Math.sin(progress * 28 + time * 2.1) * (0.45 + spectralEnergy * 0.9) +
        Math.sin(progress * (64 + spectralEnergy * 28) - time * 1.7) * 0.35;
      const distortedSample = sample * (1 - waveChaos) + chaosWave * waveChaos;

      // Instability is layered across the full width so the whole trace keeps
      // moving; wrong tuning pushes every segment harder instead of only a few peaks.
      const mismatchDrive = clamp(1 - currentState.clarity, 0, 1);
      const fullSpanJitter =
        Math.sin(progress * 34 - time * 4.8) * (10 + spectralEnergy * 8) +
        Math.cos(progress * 63 + time * 6.9) * (8 + spectralEnergy * 7) +
        Math.sin(progress * 108 - time * 9.7) * (5 + spectralEnergy * 6);
      const microJitter =
        Math.sin(progress * 182 + time * 14.6) * 2.8 +
        Math.cos(progress * 246 - time * 17.2) * 2.1;
      const jitterEnvelope = 0.72 + 0.28 * Math.sin(progress * Math.PI);
      const jitter =
        (fullSpanJitter + microJitter) *
        jitterEnvelope *
        jitterAmount *
        (0.8 + mismatchDrive * 0.95);

      const spectralLift = spectralEnergy * (18 + currentState.clarity * 26);

      points.push({
        x,
        y: centerY + distortedSample * amplitude + jitter - spectralLift * 0.5
      });
    }

    return points;
  }

  function drawWaveLine(points, width, height) {
    const glowHue = 10 + currentState.clarity * 115;
    const opacity = clamp(currentState.visual.lineOpacity, 0.18, 1);
    const blurAmount = currentState.decoded ? 0 : currentState.visual.noiseAmount * 18;

    ctx.save();
    ctx.lineWidth = currentState.decoded ? 3.2 : 2.2;
    ctx.strokeStyle = `hsla(${glowHue}, 100%, 72%, ${opacity})`;
    ctx.shadowColor = `hsla(${glowHue}, 100%, 70%, ${0.18 + currentState.clarity * 0.45})`;
    ctx.shadowBlur = blurAmount;
    ctx.beginPath();

    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
        return;
      }

      const previous = points[index - 1];
      const controlX = (previous.x + point.x) / 2;
      ctx.quadraticCurveTo(previous.x, previous.y, controlX, (previous.y + point.y) / 2);
    });

    const lastPoint = points[points.length - 1];
    const previousPoint = points[points.length - 2];
    ctx.quadraticCurveTo(previousPoint.x, previousPoint.y, lastPoint.x, lastPoint.y);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 + currentState.clarity * 0.1})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGrain(width, height) {
    void width;
    void height;
  }

  function drawFrequencyBars(visualData, width, height) {
    const { frequencyData, timeData } = visualData;
    const barCount = 36;
    const gap = 8;
    const activeWidth = width * 0.36;
    const barWidth = Math.max(1.5, (activeWidth - gap * (barCount - 1)) / barCount);
    const startX = (width - (barWidth * barCount + gap * (barCount - 1))) / 2;
    const centerY = height * 0.90;
    const color = `rgba(255, 255, 255, ${0.16 + currentState.clarity * 0.22})`;
    const radius = Math.min(barWidth / 2, 999);
    const centerIndex = (barCount - 1) / 2;

    function sampleBandEnergy(normalizedPosition) {
      const shapedPosition = Math.pow(clamp(normalizedPosition, 0, 1), 1.6);
      const center = shapedPosition * (frequencyData.length - 1);
      const bandRadius = Math.max(3, Math.floor(frequencyData.length * 0.024));
      let total = 0;
      let count = 0;
      let peak = 0;

      for (let offset = -bandRadius; offset <= bandRadius; offset += 1) {
        const sampleIndex = Math.round(center + offset);

        if (sampleIndex < 0 || sampleIndex >= frequencyData.length) {
          continue;
        }

        const sample = frequencyData[sampleIndex];
        total += sample;
        peak = Math.max(peak, sample);
        count += 1;
      }

      if (count === 0) {
        return 0;
      }

      const average = total / count;
      return (average * 0.62 + peak * 0.38) / 255;
    }

    function sampleWaveActivity(normalizedPosition) {
      const start = Math.floor(clamp(normalizedPosition - 0.08, 0, 1) * (timeData.length - 1));
      const end = Math.floor(clamp(normalizedPosition + 0.08, 0, 1) * (timeData.length - 1));
      let total = 0;
      let count = 0;

      for (let i = start; i <= end; i += 6) {
        total += Math.abs(timeData[i] - 128) / 128;
        count += 1;
      }

      return count > 0 ? total / count : 0;
    }

    ctx.save();
    ctx.fillStyle = color;

    for (let i = 0; i < barCount; i += 1) {
      const distanceFromCenter = Math.abs(i - centerIndex) / centerIndex;
      const frequencyPosition = 1 - distanceFromCenter;
      const bandEnergy = sampleBandEnergy(frequencyPosition);
      const waveActivity = sampleWaveActivity(frequencyPosition);
      const voiceWeight = 1 - Math.abs(frequencyPosition - 0.62) / 0.38;
      const centerWeight = Math.pow(1 - distanceFromCenter, 1.8);
      const edgeWeight = Math.pow(distanceFromCenter, 0.7);
      const combinedEnergy = clamp(
        bandEnergy * (0.82 + edgeWeight * 0.18) +
        waveActivity * (0.42 + edgeWeight * 0.1) +
        Math.max(0, voiceWeight) * bandEnergy * 0.28 * (0.55 + currentState.clarity * 0.75) +
        centerWeight * (bandEnergy * 0.14 + waveActivity * 0.08),
        0,
        1
      );
      const energy = Math.pow(combinedEnergy, 0.72);
      const barHeight = Math.max(6, energy * height * 0.12);
      const x = startX + i * (barWidth + gap);
      const topY = centerY - barHeight;
      const mirroredHeight = barHeight * 2;

      ctx.beginPath();
      ctx.roundRect(x, topY, barWidth, mirroredHeight, radius);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawNoiseFlicker(width, height) {
    if (currentState.decoded) {
      return;
    }

    const time = performance.now() * 0.001;
    const rate = currentState.visual.flickerRate;
    const strength = currentState.visual.flickerStrength;
    const noiseMatch = currentState.visual.noiseMatch;
    const basePulse = (Math.sin(time * rate * Math.PI * 2) + 1) * 0.5;
    const fastPulse = (Math.sin(time * rate * Math.PI * 5.2) + 1) * 0.5;
    const strobeThreshold = 0.72 - noiseMatch * 0.22;
    const strobe = fastPulse > strobeThreshold ? fastPulse : 0;
    const alpha = clamp(basePulse * (0.015 + strength * 0.22) + strobe * (0.03 + noiseMatch * 0.07), 0, 0.16);

    if (alpha <= 0.002) {
      return;
    }

    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function drawDecodedLabel(width, height) {
    if (!currentState.decoded) {
      return;
    }
  }

  function drawScene() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (!width || !height) {
      return;
    }

    ctx.clearRect(0, 0, width, height);
    drawBackground(width, height);

    const visualData = getVisualData();

    if (!visualData) {
      drawIdleText(width, height);
      return;
    }

    const points = buildWavePoints(visualData, width, height);
    drawWaveLine(points, width, height);
    drawFrequencyBars(visualData, width, height);
    drawGrain(width, height);
    drawNoiseFlicker(width, height);
    drawDecodedLabel(width, height);
  }

  function animate() {
    updateReadout();
    drawScene();
    animationFrameId = window.requestAnimationFrame(animate);
  }

  function ensureAnimationRunning() {
    if (animationFrameId === null) {
      animationFrameId = window.requestAnimationFrame(animate);
    }
  }

  async function handleSpaceControl() {
    try {
      await togglePlayback();
    } catch (error) {
      console.error(error);
    }
  }

  setupCanvasResolution();
  applyDecoderState();
  drawScene();
  ensureAnimationRunning();

  window.addEventListener("resize", () => {
    setupCanvasResolution();
    drawScene();
  });

  window.addEventListener("decoder:change", (event) => {
    currentKnobs = {
      ...currentKnobs,
      ...event.detail
    };
    applyDecoderState();
  });

  document.addEventListener("control:space", handleSpaceControl);
}
