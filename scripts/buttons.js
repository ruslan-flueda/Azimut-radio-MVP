export function initButtons() {
  const tabBtn = document.getElementById("tabBtn");
  const spaceBtn = document.getElementById("spaceBtn");
  const modes = Array.from(document.querySelectorAll(".mode-switch .mode"));

  if (!tabBtn || !spaceBtn || modes.length === 0) {
    return;
  }

  let activeIndex = modes.findIndex((mode) => mode.classList.contains("mode-active"));

  if (activeIndex === -1) {
    activeIndex = 0;
  }

  let focusIndex = activeIndex;

  function renderModes() {
    modes.forEach((mode, index) => {
      const isActive = index === activeIndex;
      const isFocused = index === focusIndex;

      mode.classList.toggle("mode-active", isActive);
      mode.classList.toggle("mode-idle", !isActive);
      mode.classList.toggle("mode-focused", isFocused);
    });
  }

  function handleTabPress() {
    focusIndex = (focusIndex + 1) % modes.length;
    renderModes();
  }

  function handleSpacePress() {
    activeIndex = focusIndex;
    renderModes();
    document.dispatchEvent(new CustomEvent("control:space"));
  }

  tabBtn.addEventListener("click", handleTabPress);
  spaceBtn.addEventListener("click", handleSpacePress);

  document.addEventListener("keydown", (event) => {
    if (event.code === "Tab") {
      event.preventDefault();
      handleTabPress();
    }

    if (event.code === "Space") {
      event.preventDefault();
      handleSpacePress();
    }
  });

  renderModes();
}
