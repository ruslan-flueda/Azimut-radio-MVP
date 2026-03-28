const DEFAULT_VALUES = {
  frequency: 0.2,
  stability: 0.5,
  noise: 0.3
};

const KNOB_TICK_AUDIO_FILE = "Clock Ticker Sound Effect.wav";

const KNOB_CONFIG = {
  frequency: {
    labels: [
      { text: "min", position: 0 },
      { text: "max", position: 1 }
    ],
    valueText: (value) => `${Math.round(300 + value * 3200)} Hz`
  },
  stability: {
    labels: [
      { text: "min", position: 0 },
      { text: "max", position: 1 }
    ],
    valueText: (value) => `${Math.round(value * 100)}% stability`
  },
  noise: {
    labels: [
      { text: "min", position: 0 },
      { text: "max", position: 1 }
    ],
    valueText: (value) => `${Math.round(value * 100)}% reduction`
  }
};

export function initKnobs() {
  const knobEls = Array.from(document.querySelectorAll(".knob[data-knob]"));

  if (knobEls.length === 0) {
    return;
  }

  const min = 0;
  const max = 1;
  const step = 0.01;
  const minAngle = -140;
  const maxAngle = 140;
  const clamp = (nextValue, start, end) => Math.max(start, Math.min(end, nextValue));
  const snap = (nextValue) => Math.round(nextValue / step) * step;
  const angleToValue = (angle) => min + ((angle - minAngle) / (maxAngle - minAngle)) * (max - min);
  const valueToAngle = (value) => minAngle + ((value - min) / (max - min)) * (maxAngle - minAngle);
  const state = { ...DEFAULT_VALUES };
  let isLocked = Boolean(window.decoderLocked);
  const tickAudioPool = Array.from({ length: 4 }, () => {
    const audio = new Audio(encodeURI(KNOB_TICK_AUDIO_FILE));
    audio.preload = "auto";
    audio.volume = 0.08;
    return audio;
  });
  let tickAudioIndex = 0;
  let lastTickAt = 0;

  function playKnobTick() {
    const now = performance.now();

    if (now - lastTickAt < 26) {
      return;
    }

    const audio = tickAudioPool[tickAudioIndex];
    tickAudioIndex = (tickAudioIndex + 1) % tickAudioPool.length;
    audio.currentTime = 0;
    audio.playbackRate = 0.96 + Math.random() * 0.08;
    audio.play().catch(() => {});
    lastTickAt = now;
  }

  function emitChange() {
    window.decoderKnobs = { ...state };
    window.dispatchEvent(new CustomEvent("decoder:change", {
      detail: { ...state }
    }));
  }

  function buildScale(knobEl, knobName) {
    const scaleEl = knobEl.querySelector(".knob-scale");

    if (!scaleEl || scaleEl.children.length > 0) {
      return;
    }

    const labelRadius = 118;
    const labels = KNOB_CONFIG[knobName]?.labels ?? [];

    labels.forEach(({ text, position }) => {
      const angle = minAngle + position * (maxAngle - minAngle);
      const rad = ((angle - 124) * Math.PI) / 180;
      const x = Math.cos(rad) * labelRadius;
      const y = Math.sin(rad) * labelRadius;
      const span = document.createElement("span");
      span.className = "knob-label";
      span.textContent = text;
      span.style.left = `calc(50% + ${x}px)`;
      span.style.top = `calc(50% + ${y}px)`;
      scaleEl.appendChild(span);
    });
  }

  knobEls.forEach((knobEl) => {
    const knobName = knobEl.dataset.knob;

    if (!knobName || !(knobName in state)) {
      return;
    }

    let value = state[knobName];
    let displayValue = value;
    let isDragging = false;
    let activePointerId = null;

    function pointerToAngle(clientX, clientY) {
      const rect = knobEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;

      let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;

      if (angle > 180) {
        angle -= 360;
      }

      return clamp(angle, minAngle, maxAngle);
    }

    function render(nextValue, options = {}) {
      const previousValue = displayValue;
      displayValue = snap(clamp(nextValue, min, max));

      if (!isLocked) {
        value = displayValue;
        state[knobName] = value;
      }

      knobEl.style.setProperty("--knob-angle", `${valueToAngle(displayValue)}deg`);
      knobEl.setAttribute("aria-valuenow", displayValue.toFixed(2));
      knobEl.setAttribute(
        "aria-valuetext",
        KNOB_CONFIG[knobName]?.valueText?.(displayValue) ?? displayValue.toFixed(2)
      );

      if (!options.silent && Math.abs(displayValue - previousValue) >= step) {
        playKnobTick();
      }

      if (!isLocked) {
        emitChange();
      }
    }

    function handlePointerMove(event) {
      if (!isDragging || event.pointerId !== activePointerId) {
        return;
      }

      render(angleToValue(pointerToAngle(event.clientX, event.clientY)));
    }

    function stopDragging(event) {
      if (event && event.pointerId !== activePointerId) {
        return;
      }

      isDragging = false;
      activePointerId = null;
      knobEl.classList.remove("is-dragging");
    }

    buildScale(knobEl, knobName);
    render(value, { silent: true });

    knobEl.addEventListener("pointerdown", (event) => {
      activePointerId = event.pointerId;
      isDragging = true;
      knobEl.classList.add("is-dragging");
      knobEl.setPointerCapture(event.pointerId);
      render(angleToValue(pointerToAngle(event.clientX, event.clientY)));
    });

    knobEl.addEventListener("pointermove", handlePointerMove);
    knobEl.addEventListener("pointerup", stopDragging);
    knobEl.addEventListener("pointercancel", stopDragging);
    knobEl.addEventListener("lostpointercapture", stopDragging);

    knobEl.addEventListener("wheel", (event) => {
      event.preventDefault();

      const delta = event.deltaY < 0 ? step : -step;
      render(displayValue + delta);
    });
  });

  window.addEventListener("decoder:locked", () => {
    isLocked = true;
    knobEls.forEach((knobEl) => {
      knobEl.classList.remove("is-dragging");
    });
  });

  document.addEventListener("decoder:decoded", () => {
    isLocked = true;
    knobEls.forEach((knobEl) => {
      knobEl.classList.remove("is-dragging");
    });
  });

  emitChange();
}
