const NOISE_AUDIO_FILE = "Radio Static Sound Effect 4.mp3";
const TRANSMISSION_AUDIO_FILE = "Audio Conversion Mar 12 2026.mp3";
const MIN_FREQUENCY = 300;
const MAX_FREQUENCY = 3500;
const BAR_COUNT = 110;
const SIGNAL_STATIONS = [620, 1180, 1760, 2410, 3090];

export function initPlayer() {
  const canvas = document.getElementById("wave");

  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const timerEl = document.querySelector(".timer");
  const statEls = Array.from(document.querySelectorAll(".stats .stat"));
  const playbackContext = new (window.AudioContext || window.webkitAudioContext)();

  let audioBuffersPromise = null;
  let noiseBuffer = null;
  let transmissionBuffer = null;
  let noiseSourceNode = null;
  let transmissionSourceNode = null;
  let noiseGainNode = null;
  let transmissionGainNode = null;
  let filterNode = null;
  let clarityFilterNode = null;
  let analyserNode = null;
  let animationFrameId = null;
  let isPlaying = false;
  let playbackCompleted = false;
  let startedAtContextTime = 0;
  let pausedOffsetSeconds = 0;
  let decodeAlertShown = false;
  const targetStationFrequency = SIGNAL_STATIONS[Math.floor(Math.random() * SIGNAL_STATIONS.length)];
  let currentTune = typeof window.currentRadioTune === "number" ? window.currentRadioTune : 0.16;
  let currentFrequency = knobToFrequency(currentTune);
  let currentSignalStrength = 0;
  let currentTargetStrength = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function knobToFrequency(value) {
    return MIN_FREQUENCY + value * (MAX_FREQUENCY - MIN_FREQUENCY);
  }

  function getNearestStationDistance(frequency) {
    return SIGNAL_STATIONS.reduce((closest, stationFrequency) => {
      return Math.min(closest, Math.abs(frequency - stationFrequency));
    }, Number.POSITIVE_INFINITY);
  }

  function getSignalStrength(frequency) {
    const nearestDistance = getNearestStationDistance(frequency);
    return clamp(1 - nearestDistance / 260, 0, 1);
  }

  function getTargetStrength(frequency) {
    return clamp(1 - Math.abs(frequency - targetStationFrequency) / 150, 0, 1);
  }

  function getSignalHue(strength) {
    return 8 + strength * 112;
  }

  function setupCanvasResolution() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function updateReadout() {
    if (timerEl) {
      timerEl.textContent = formatTime(getPlaybackSeconds());
    }

    if (statEls[0]) {
      statEls[0].textContent = `Noise: ${Math.round(noiseGainNode ? noiseGainNode.gain.value * 100 : 22)}%`;
    }

    if (statEls[1]) {
      statEls[1].textContent = `Signal: ${Math.round(currentSignalStrength * 100)}%`;
    }

    if (statEls[2]) {
      statEls[2].textContent = `Bandpass: ${Math.round(currentFrequency)} Hz`;
    }
  }

  function formatTime(seconds) {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function getPlaybackSeconds() {
    if (!transmissionBuffer) {
      return 0;
    }

    if (playbackCompleted) {
      return transmissionBuffer.duration;
    }

    if (isPlaying) {
      return clamp(playbackContext.currentTime - startedAtContextTime, 0, transmissionBuffer.duration);
    }

    return clamp(pausedOffsetSeconds, 0, transmissionBuffer.duration);
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
      ]).then(([loadedNoiseBuffer, loadedTransmissionBuffer]) => {
        noiseBuffer = loadedNoiseBuffer;
        transmissionBuffer = loadedTransmissionBuffer;
        updateReadout();
        return [loadedNoiseBuffer, loadedTransmissionBuffer];
      });
    }

    return audioBuffersPromise;
  }

  function createSource(buffer, loop) {
    const source = playbackContext.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    return source;
  }
//Громкость голоса
  function applyTuning(value) {
    currentTune = clamp(value, 0, 1);
    currentFrequency = knobToFrequency(currentTune);
    currentSignalStrength = getSignalStrength(currentFrequency);
    currentTargetStrength = getTargetStrength(currentFrequency);

    if (filterNode && clarityFilterNode && transmissionGainNode && noiseGainNode) {
      filterNode.frequency.setTargetAtTime(currentFrequency, playbackContext.currentTime, 0.035);
      filterNode.Q.setTargetAtTime(2.8 - currentTargetStrength * 1.9, playbackContext.currentTime, 0.06);
      clarityFilterNode.frequency.setTargetAtTime(
        900 + currentTargetStrength * 3400,
        playbackContext.currentTime,
        0.07
      );
      transmissionGainNode.gain.setTargetAtTime(0.38 + currentTargetStrength * 0.62, playbackContext.currentTime, 0.05);
      noiseGainNode.gain.setTargetAtTime(
        Math.max(0.01, 0.16 - currentSignalStrength * 0.03 - currentTargetStrength * 0.12),
        playbackContext.currentTime,
        0.05
      );
    }

    updateReadout();

    if (currentTargetStrength >= 0.98 && !decodeAlertShown) {
      decodeAlertShown = true;
      window.setTimeout(() => {
        window.alert("вы расшифровали запись, посмотрите подробности в архиве");
      }, 80);
    }
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

  function handleTransmissionEnd() {
    playbackCompleted = true;
    isPlaying = false;
    pausedOffsetSeconds = transmissionBuffer ? transmissionBuffer.duration : 0;
    stopSources();
    updateReadout();
  }

  async function startPlayback() {
    const [loadedNoiseBuffer, loadedTransmissionBuffer] = await ensureAudioBuffers();

    if (!noiseGainNode) {
      noiseGainNode = playbackContext.createGain();
      transmissionGainNode = playbackContext.createGain();
      filterNode = playbackContext.createBiquadFilter();
      clarityFilterNode = playbackContext.createBiquadFilter();
      analyserNode = playbackContext.createAnalyser();

      filterNode.type = "bandpass";
      clarityFilterNode.type = "lowpass";
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.82;
      noiseGainNode.gain.value = 0.3;
      transmissionGainNode.gain.value = 0.5;

      noiseGainNode.connect(playbackContext.destination);
      noiseGainNode.connect(analyserNode);
      filterNode.connect(clarityFilterNode);
      clarityFilterNode.connect(transmissionGainNode);
      transmissionGainNode.connect(playbackContext.destination);
      transmissionGainNode.connect(analyserNode);
    }

    stopSources();

    noiseSourceNode = createSource(loadedNoiseBuffer, true);
    transmissionSourceNode = createSource(loadedTransmissionBuffer, false);

    noiseSourceNode.connect(noiseGainNode);
    transmissionSourceNode.connect(filterNode);

    transmissionSourceNode.onended = () => {
      if (isPlaying) {
        handleTransmissionEnd();
      }
    };

    await playbackContext.resume();
    if (playbackCompleted) {
      pausedOffsetSeconds = 0;
      playbackCompleted = false;
    }

    noiseSourceNode.start(0);
    transmissionSourceNode.start(0, pausedOffsetSeconds);
    startedAtContextTime = playbackContext.currentTime - pausedOffsetSeconds;
    isPlaying = true;
    applyTuning(currentTune);
    updateReadout();
    ensureAnimationRunning();
  }

  async function togglePlayback() {
    if (!noiseSourceNode || !transmissionSourceNode || playbackContext.state === "suspended" || playbackCompleted) {
      await startPlayback();
      return;
    }

    pausedOffsetSeconds = getPlaybackSeconds();
    await playbackContext.suspend();
    isPlaying = false;
    updateReadout();
  }

  function drawRoundedBar(x, y, width, height, radius, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function drawIdleText(width, height) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("press space to scan the band", width / 2, height / 2);
  }

  function drawScene() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (!width || !height) {
      return;
    }

    ctx.clearRect(0, 0, width, height);

    const signalColor = getSignalHue(currentTargetStrength);
    const glow = ctx.createLinearGradient(0, 0, width, 0);
    glow.addColorStop(0, `hsla(${signalColor}, 95%, 48%, 0.08)`);
    glow.addColorStop(0.5, `hsla(${signalColor}, 100%, 62%, 0.22)`);
    glow.addColorStop(1, `hsla(${signalColor}, 95%, 48%, 0.08)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const data = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    if (data && (isPlaying || pausedOffsetSeconds > 0 || playbackCompleted)) {
      analyserNode.getByteFrequencyData(data);
      const gap = width < 640 ? 5 : 7;
      const usableWidth = width * 0.985;
      const barWidth = Math.max(1.4, (usableWidth - gap * (BAR_COUNT - 1)) / BAR_COUNT);
      const totalWidth = BAR_COUNT * barWidth + (BAR_COUNT - 1) * gap;
      const startX = (width - totalWidth) / 2;
      const centerY = height / 2;
      const maxBarHeight = height * 2;
      const barColor = `hsl(${signalColor}, 90%, ${58 + currentTargetStrength * 14}%)`;
      const halfBarCount = Math.ceil(BAR_COUNT / 2);

      for (let i = 0; i < halfBarCount; i += 1) {
        const sampleIndex = Math.floor((i / halfBarCount) * data.length);
        const baseLevel = data[sampleIndex] / 255;
        const boostedLevel = Math.pow(baseLevel, 0.72) * 1.3;
        const noiseFloor = 0.03 + Math.random() * 0.025;
        const strengthBoost = currentSignalStrength * 0.016;
        const level = clamp(boostedLevel + noiseFloor + strengthBoost, 0.035, 1);
        const barHeight = Math.max(2, maxBarHeight * level);
        const y = centerY - barHeight / 2;
        const leftIndex = halfBarCount - 1 - i;
        const rightIndex = BAR_COUNT % 2 === 0 ? halfBarCount + i : halfBarCount + i - 1;
        const leftX = startX + leftIndex * (barWidth + gap);

        drawRoundedBar(leftX, y, barWidth, barHeight, Math.min(3, barWidth / 2), barColor);

        if (rightIndex !== leftIndex && rightIndex < BAR_COUNT) {
          const rightX = startX + rightIndex * (barWidth + gap);
          drawRoundedBar(rightX, y, barWidth, barHeight, Math.min(3, barWidth / 2), barColor);
        }
      }
    } else {
      drawIdleText(width, height);
    }
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
  applyTuning(currentTune);
  drawScene();
  ensureAnimationRunning();

  window.addEventListener("resize", () => {
    setupCanvasResolution();
    drawScene();
  });

  window.addEventListener("radio:tune", (event) => {
    applyTuning(event.detail.value);
  });

  document.addEventListener("control:space", handleSpaceControl);
}
