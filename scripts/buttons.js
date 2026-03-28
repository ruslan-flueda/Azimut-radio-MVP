export function initButtons() {
  const tabBtn = document.getElementById("tabBtn");
  const spaceBtn = document.getElementById("spaceBtn");
  const archiveToggle = document.getElementById("archiveToggle");
  const archivePanel = document.getElementById("archivePanel");
  const archiveHint = document.getElementById("archiveHint");
  const screenEl = document.querySelector(".screen");

  if (!tabBtn || !spaceBtn || !archiveToggle || !archivePanel || !archiveHint || !screenEl) {
    return;
  }

  let isArchiveOpen = false;
  let isArchiveFocused = false;

  function renderArchiveState() {
    archiveToggle.classList.toggle("is-active", isArchiveOpen);
    archiveToggle.classList.toggle("is-focused", isArchiveFocused);
    archiveToggle.setAttribute("aria-pressed", String(isArchiveOpen));
    archivePanel.setAttribute("aria-hidden", String(!isArchiveOpen));
    screenEl.classList.toggle("is-archive-open", isArchiveOpen);
  }

  function toggleArchive() {
    isArchiveFocused = true;
    isArchiveOpen = !isArchiveOpen;
    renderArchiveState();
  }

  function handleSpacePress() {
    document.dispatchEvent(new CustomEvent("control:space"));
  }

  tabBtn.addEventListener("click", toggleArchive);
  spaceBtn.addEventListener("click", handleSpacePress);
  archiveToggle.addEventListener("click", toggleArchive);

  document.addEventListener("decoder:decoded", () => {
    archiveHint.classList.remove("is-pulsing");
    void archiveHint.offsetWidth;
    archiveHint.classList.add("is-pulsing");
  });

  document.addEventListener("keydown", (event) => {
    if (event.code === "Tab") {
      event.preventDefault();
      toggleArchive();
    }

    if (event.code === "Space") {
      event.preventDefault();
      handleSpacePress();
    }
  });

  renderArchiveState();
}
