const DEFAULT_VALUES = {
  frequency: 0.2,
  stability: 0.5,
  noise: 0.3
};

const TICK_SOUND = "Clock Ticker Sound Effect.wav";

export function initKnobs() {
  const knobList = Array.from(document.querySelectorAll(".knob[data-knob]"));
  const sliderList = Array.from(document.querySelectorAll(".slider-input[data-slider-knob]"));

  if (knobList.length === 0 && sliderList.length === 0) {
    return;
  }

  const values = {
    frequency: DEFAULT_VALUES.frequency,
    stability: DEFAULT_VALUES.stability,
    noise: DEFAULT_VALUES.noise
  };

  if (window.decoderKnobs) {
    values.frequency = window.decoderKnobs.frequency;
    values.stability = window.decoderKnobs.stability;
    values.noise = window.decoderKnobs.noise;
  }

  const knobMap = {};
  const sliderMap = {};
  const sounds = [];
  let soundIndex = 0;
  let lastSoundTime = 0;
  let locked = Boolean(window.decoderLocked);

  // Делаем несколько одинаковых звуков, чтобы они не обрывались.
  for (let i = 0; i < 4; i += 1) {
    const audio = new Audio(encodeURI(TICK_SOUND));
    audio.preload = "auto";
    audio.volume = 0.08;
    sounds.push(audio);
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

  function roundValue(value) {
    return Math.round(value * 100) / 100;
  }

  function valueToAngle(value) {
    return -140 + value * 280;
  }

  function angleToValue(angle) {
    return (angle + 140) / 280;
  }

  function getValueText(name, value) {
    if (name === "frequency") {
      return `${Math.round(300 + value * 3200)} Hz`;
    }

    if (name === "stability") {
      return `${Math.round(value * 100)}% stability`;
    }

    return `${Math.round(value * 100)}% reduction`;
  }

  function playTick() {
    const now = performance.now();

    if (now - lastSoundTime < 26) {
      return;
    }

    const sound = sounds[soundIndex];
    soundIndex += 1;

    if (soundIndex >= sounds.length) {
      soundIndex = 0;
    }

    sound.currentTime = 0;
    sound.playbackRate = 0.96 + Math.random() * 0.08;
    sound.play().catch(() => {});

    lastSoundTime = now;
  }

  function sendChange() {
    window.decoderKnobs = {
      frequency: values.frequency,
      stability: values.stability,
      noise: values.noise
    };

    window.dispatchEvent(new CustomEvent("decoder:change", {
      detail: {
        frequency: values.frequency,
        stability: values.stability,
        noise: values.noise
      }
    }));
  }

  function drawOneControl(name) {
    const knob = knobMap[name];
    const slider = sliderMap[name];
    const value = values[name];
    const angle = valueToAngle(value);
    const percent = Math.round(value * 100);

    if (knob) {
      knob.style.setProperty("--knob-angle", `${angle}deg`);
      knob.setAttribute("aria-valuenow", value.toFixed(2));
      knob.setAttribute("aria-valuetext", getValueText(name, value));
    }

    if (slider) {
      slider.value = String(percent);
      slider.style.setProperty("--slider-progress", `${percent}%`);
      slider.setAttribute("aria-valuenow", String(percent));
    }
  }

  function setValue(name, newValue, playSound) {
    const safeValue = roundValue(clamp(newValue, 0, 1));

    if (!locked) {
      values[name] = safeValue;
    }

    drawOneControl(name);

    if (playSound) {
      playTick();
    }

    if (!locked) {
      sendChange();
    }
  }

  function addKnobLabels(knob, name) {
    const scale = knob.querySelector(".knob-scale");

    if (!scale || scale.children.length > 0) {
      return;
    }

    const labels = [
      { text: "min", pos: 0 },
      { text: "max", pos: 1 }
    ];

    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i];
      const angle = -140 + label.pos * 280;
      const radius = 118;
      const rad = ((angle - 124) * Math.PI) / 180;
      const x = Math.cos(rad) * radius;
      const y = Math.sin(rad) * radius;
      const span = document.createElement("span");

      span.className = "knob-label";
      span.textContent = label.text;
      span.style.left = `calc(50% + ${x}px)`;
      span.style.top = `calc(50% + ${y}px)`;

      scale.appendChild(span);
    }

    void name;
  }

  function getAngleFromPointer(knob, clientX, clientY) {
    const rect = knob.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;

    if (angle > 180) {
      angle -= 360;
    }

    return clamp(angle, -140, 140);
  }

  for (let i = 0; i < knobList.length; i += 1) {
    const knob = knobList[i];
    const name = knob.dataset.knob;

    if (!name || values[name] === undefined) {
      continue;
    }

    knobMap[name] = knob;
    addKnobLabels(knob, name);
    drawOneControl(name);

    let dragging = false;
    let pointerId = null;

    knob.addEventListener("pointerdown", (event) => {
      if (locked) {
        return;
      }

      dragging = true;
      pointerId = event.pointerId;
      knob.classList.add("is-dragging");
      knob.setPointerCapture(event.pointerId);

      const angle = getAngleFromPointer(knob, event.clientX, event.clientY);
      setValue(name, angleToValue(angle), true);
    });

    knob.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId || locked) {
        return;
      }

      const angle = getAngleFromPointer(knob, event.clientX, event.clientY);
      setValue(name, angleToValue(angle), true);
    });

    function stopDrag(event) {
      if (event && pointerId !== null && event.pointerId !== pointerId) {
        return;
      }

      dragging = false;
      pointerId = null;
      knob.classList.remove("is-dragging");
    }

    knob.addEventListener("pointerup", stopDrag);
    knob.addEventListener("pointercancel", stopDrag);
    knob.addEventListener("lostpointercapture", stopDrag);

    knob.addEventListener("wheel", (event) => {
      if (locked) {
        return;
      }

      event.preventDefault();

      if (event.deltaY < 0) {
        setValue(name, values[name] + 0.01, true);
      } else {
        setValue(name, values[name] - 0.01, true);
      }
    });
  }

  for (let i = 0; i < sliderList.length; i += 1) {
    const slider = sliderList[i];
    const name = slider.dataset.sliderKnob;

    if (!name || values[name] === undefined) {
      continue;
    }

    sliderMap[name] = slider;
    drawOneControl(name);

    slider.addEventListener("input", () => {
      if (locked) {
        return;
      }

      setValue(name, Number(slider.value) / 100, true);
    });
  }

  function lockControls() {
    locked = true;

    for (let i = 0; i < knobList.length; i += 1) {
      knobList[i].classList.remove("is-dragging");
    }

    for (let i = 0; i < sliderList.length; i += 1) {
      sliderList[i].disabled = true;
    }
  }

  window.addEventListener("decoder:locked", lockControls);
  document.addEventListener("decoder:decoded", lockControls);

  sendChange();
}
