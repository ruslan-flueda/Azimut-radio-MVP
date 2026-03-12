export function initKnob() {
  const knobEl = document.getElementById("cleanKnob");

  if (!knobEl) {
    return;
  }

  const scaleEl = knobEl.querySelector(".knob-scale");

  if (!scaleEl) {
    return;
  }

  const min = 0;
  const max = 1;
  const step = 0.01;
  const minAngle = -140;
  const maxAngle = 140;
  let value = typeof window.currentRadioTune === "number" ? window.currentRadioTune : 0.16;
  let isDragging = false;
  let activePointerId = null;

  const clamp = (nextValue, start, end) => Math.max(start, Math.min(end, nextValue));
  const snap = (nextValue) => Math.round(nextValue / step) * step;

  function valueToFrequency(nextValue) {
    return 300 + nextValue * 3200;
  }

  function emitTune(nextValue) {
    const frequency = valueToFrequency(nextValue);
    window.currentRadioTune = nextValue;
    window.dispatchEvent(new CustomEvent("radio:tune", {
      detail: {
        value: nextValue,
        frequency
      }
    }));
    knobEl.setAttribute("aria-valuetext", `${Math.round(frequency)} Hz`);
  }

  function buildScale() {
    if (scaleEl.children.length > 0) {
      return;
    }

    const labelRadius = 118;
    const labels = [
      { text: "0.3", angle: -130 },
      { text: "0.7", angle: -105 },
      { text: "1.1", angle: -82 },
      { text: "1.5", angle: -58 },
      { text: "1.9", angle: -32 },
      { text: "2.3", angle: -4 },
      { text: "2.7", angle: 28 },
      { text: "3.1", angle: 58 },
      { text: "3.5", angle: 88 }
    ];

    labels.forEach((label) => {
      const rad = (label.angle * Math.PI) / 180;
      const x = Math.cos(rad) * labelRadius;
      const y = Math.sin(rad) * labelRadius;
      const span = document.createElement("span");
      span.className = "knob-label";
      span.textContent = label.text;
      span.style.left = `calc(50% + ${x}px)`;
      span.style.top = `calc(50% + ${y}px)`;
      scaleEl.appendChild(span);
    });
  }

  function valueToAngle(nextValue) {
    const progress = (nextValue - min) / (max - min);
    return minAngle + progress * (maxAngle - minAngle);
  }

  function angleToValue(angle) {
    const progress = (angle - minAngle) / (maxAngle - minAngle);
    return min + progress * (max - min);
  }

  function setValue(nextValue) {
    value = snap(clamp(nextValue, min, max));
    knobEl.style.setProperty("--knob-angle", `${valueToAngle(value)}deg`);
    knobEl.setAttribute("aria-valuenow", value.toFixed(2));
    emitTune(value);
  }

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

  function handlePointerMove(event) {
    if (!isDragging || event.pointerId !== activePointerId) {
      return;
    }

    setValue(angleToValue(pointerToAngle(event.clientX, event.clientY)));
  }

  function stopDragging(event) {
    if (event && event.pointerId !== activePointerId) {
      return;
    }

    isDragging = false;
    activePointerId = null;
    knobEl.classList.remove("is-dragging");
  }

  buildScale();
  setValue(value);

  knobEl.addEventListener("pointerdown", (event) => {
    activePointerId = event.pointerId;
    isDragging = true;
    knobEl.classList.add("is-dragging");
    knobEl.setPointerCapture(event.pointerId);
    setValue(angleToValue(pointerToAngle(event.clientX, event.clientY)));
  });

  knobEl.addEventListener("pointermove", handlePointerMove);
  knobEl.addEventListener("pointerup", stopDragging);
  knobEl.addEventListener("pointercancel", stopDragging);
  knobEl.addEventListener("lostpointercapture", stopDragging);

  knobEl.addEventListener("wheel", (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? step : -step;
    setValue(value + delta);
  });
}
