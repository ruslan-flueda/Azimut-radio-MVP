export function initButtons() {
  const SPECIAL_KEY = "decoder.specialTransmission";

  const tabButton = document.getElementById("tabBtn");
  const shiftButton = document.getElementById("shiftBtn");
  const spaceButton = document.getElementById("spaceBtn");
  const screen = document.querySelector(".screen");
  const archivePanel = document.getElementById("archivePanel");
  const archiveList = document.querySelector(".archive-panel__list");
  const decodedCounter = document.getElementById("decodedCounter");
  const decodedOverlay = document.getElementById("decodedOverlay");
  const undecodedOverlay = document.getElementById("undecodedOverlay");
  const overlayArchiveButton = document.getElementById("overlayArchiveBtn");
  const overlayNextButton = document.getElementById("overlayNextBtn");
  const nextSection = document.getElementById("nextRecordSection");
  const nextContent = nextSection?.querySelector(".next-record-section__content") || null;
  const nextForm = document.getElementById("nextRecordForm");
  const nextFormPanel = document.getElementById("nextRecordFormPanel");
  const nextResultPanel = document.getElementById("nextRecordResultPanel");
  const nextInput = document.getElementById("nextRecordNameInput");
  const nextName = document.getElementById("nextRecordNameValue");
  const restartButton = document.getElementById("nextRecordRestartBtn");
  const footer = document.getElementById("nextRecordFooter");
  const footerName = document.getElementById("nextRecordFooterName");
  const specialButton = document.getElementById("nextRecordSpecialBtn");

  if (
    !tabButton ||
    !shiftButton ||
    !spaceButton ||
    !screen ||
    !archivePanel ||
    !archiveList ||
    !decodedCounter ||
    !decodedOverlay ||
    !undecodedOverlay ||
    !overlayArchiveButton ||
    !overlayNextButton
  ) {
    return;
  }

  let archiveOpen = false;
  let decodedOpen = false;
  let undecodedOpen = false;
  let overlayChoice = "next";
  let selectedCard = 0;
  let expandedCard = -1;
  let addedNewDecodedCard = false;
  let restoreDecodedAfterArchive = false;
  let nextSectionUnlocked = false;
  let counterTimer = 0;
  let overlayTimer = 0;

  const keyMap = {
    Tab: tabButton,
    ShiftLeft: shiftButton,
    ShiftRight: shiftButton,
    Space: spaceButton
  };

  function isDeviceLocked() {
    return document.body.classList.contains("is-device-locked");
  }

  function getCards() {
    return Array.from(archiveList.querySelectorAll(".archive-card"));
  }

  function drawArchive() {
    screen.classList.toggle("is-archive-open", archiveOpen);
    drawArchiveSelection();
  }

  function drawDecodedOverlay() {
    screen.classList.toggle("is-decoded-overlay-open", decodedOpen);
    decodedOverlay.classList.toggle("is-visible", decodedOpen);
    decodedOverlay.setAttribute("aria-hidden", String(!decodedOpen));
    overlayArchiveButton.classList.toggle("is-selected", overlayChoice === "archive");
    overlayNextButton.classList.toggle("is-selected", overlayChoice === "next");
  }

  function drawUndecodedOverlay() {
    screen.classList.toggle("is-undecoded-overlay-open", undecodedOpen);
    undecodedOverlay.classList.toggle("is-visible", undecodedOpen);
    undecodedOverlay.setAttribute("aria-hidden", String(!undecodedOpen));
  }

  function drawArchiveSelection() {
    const cards = getCards();

    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i];
      const isSelected = i === selectedCard;
      const isExpanded = i === expandedCard;

      card.classList.toggle("is-selected", isSelected);
      card.classList.toggle("is-expanded", isExpanded);
    }
  }

  function drawAll() {
    drawArchive();
    drawDecodedOverlay();
    drawUndecodedOverlay();
  }

  function openArchive(restoreDecoded) {
    archiveOpen = true;
    decodedOpen = false;
    undecodedOpen = false;
    restoreDecodedAfterArchive = Boolean(restoreDecoded);

    if (selectedCard < 0) {
      selectedCard = 0;
    }

    drawAll();
  }

  function closeArchive() {
    archiveOpen = false;

    if (restoreDecodedAfterArchive) {
      decodedOpen = true;
      restoreDecodedAfterArchive = false;
    }

    drawAll();
  }

  function toggleArchive() {
    if (isDeviceLocked()) {
      return;
    }

    if (archiveOpen) {
      closeArchive();
      return;
    }

    openArchive(false);
  }

  function nextArchiveCard() {
    if (!archiveOpen) {
      return;
    }

    const cards = getCards();

    if (cards.length === 0) {
      return;
    }

    selectedCard += 1;

    if (selectedCard >= cards.length) {
      selectedCard = 0;
    }

    drawArchiveSelection();
  }

  function toggleCurrentCard() {
    if (!archiveOpen) {
      return;
    }

    const cards = getCards();
    const card = cards[selectedCard];

    if (!card) {
      return;
    }

    if (card.classList.contains("archive-card--failure")) {
      showUndecoded();
      return;
    }

    if (expandedCard === selectedCard) {
      expandedCard = -1;
    } else {
      expandedCard = selectedCard;
    }

    drawArchiveSelection();
  }

  function addDecodedCard() {
    if (addedNewDecodedCard) {
      return;
    }

    const article = document.createElement("article");
    article.className = "archive-card archive-card--success archive-card--new";
    article.innerHTML = `
      <div class="archive-card__header">
        <div class="archive-card__status">
          <img class="archive-card__status-icon" src="./Icons/Decoded.svg" alt="Расшифровано">
        </div>
        <div class="archive-card__duration">
          <img class="archive-card__clock" src="./Icons/Clock.svg" alt="Время">
          <span>00:24</span>
        </div>
        <div class="archive-card__badge">новая</div>
        <div class="archive-card__arrow" aria-hidden="true">
          <img class="archive-card__arrow-icon" src="./Icons/Arrow Down.svg" alt="">
        </div>
      </div>
      <div class="archive-card__details">
        <p class="archive-card__details-text">"...если кто-то ещё слушает... это не передача. оно реагирует. мы пытались изолировать сигнал, но - [помехи] - каждый раз при настройке он немного меняется. Будто понимает. не выравнивайте все три параметра. повторяю - НЕ ВЫРАВНИВАЙТЕ ВСЕ ТРИ - [сигнал потерян]"</p>
      </div>
    `;

    archiveList.prepend(article);
    selectedCard = 0;
    expandedCard = -1;
    addedNewDecodedCard = true;
    drawArchiveSelection();
  }

  function showDecoded() {
    archiveOpen = false;
    undecodedOpen = false;
    decodedOpen = true;
    overlayChoice = "next";
    drawAll();
  }

  function hideDecoded() {
    decodedOpen = false;
    drawDecodedOverlay();
  }

  function showUndecoded() {
    archiveOpen = false;
    decodedOpen = false;
    undecodedOpen = true;
    restoreDecodedAfterArchive = false;
    drawAll();
  }

  function hideUndecoded() {
    undecodedOpen = false;
    drawUndecodedOverlay();
  }

  function resetFinalSection() {
    if (
      !nextFormPanel ||
      !nextResultPanel ||
      !nextInput ||
      !nextName ||
      !footerName
    ) {
      return;
    }

    nextFormPanel.classList.add("is-visible");
    nextResultPanel.classList.remove("is-visible");
    nextFormPanel.setAttribute("aria-hidden", "false");
    nextResultPanel.setAttribute("aria-hidden", "true");
    nextInput.value = "";
    nextName.textContent = "оператор";
    footerName.textContent = "Руслан Хайруллин";

    if (nextContent) {
      nextContent.classList.remove("is-footer-visible");
    }

    if (footer) {
      footer.setAttribute("aria-hidden", "true");
    }
  }

  function showFinalResult(name) {
    if (!nextFormPanel || !nextResultPanel || !nextName) {
      return;
    }

    nextName.textContent = name;

    if (footerName) {
      footerName.textContent = "Руслан Хайруллин";
    }

    nextFormPanel.classList.remove("is-visible");
    nextResultPanel.classList.add("is-visible");
    nextFormPanel.setAttribute("aria-hidden", "true");
    nextResultPanel.setAttribute("aria-hidden", "false");

    window.setTimeout(() => {
      if (nextContent) {
        nextContent.classList.add("is-footer-visible");
      }

      if (footer) {
        footer.setAttribute("aria-hidden", "false");
      }
    }, 180);
  }

  function openNextSection() {
    if (!nextSectionUnlocked || !nextSection) {
      return;
    }

    decodedOpen = false;
    drawAll();
    resetFinalSection();

    nextSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    window.setTimeout(() => {
      nextInput?.focus();
    }, 420);
  }

  function activateOverlayChoice() {
    if (overlayChoice === "archive") {
      openArchive(true);
      return;
    }

    openNextSection();
  }

  function changeOverlayChoice() {
    if (!decodedOpen) {
      return;
    }

    if (overlayChoice === "archive") {
      overlayChoice = "next";
    } else {
      overlayChoice = "archive";
    }

    drawDecodedOverlay();
  }

  function pressMainSpace() {
    if (isDeviceLocked()) {
      return;
    }

    document.dispatchEvent(new CustomEvent("control:space"));
  }

  function setPressed(code, isPressed) {
    const button = keyMap[code];

    if (!button) {
      return;
    }

    button.classList.toggle("is-pressed", isPressed);
  }

  function reloadNormal() {
    window.location.reload();
  }

  function reloadSpecial() {
    window.sessionStorage.setItem(SPECIAL_KEY, "rem");
    window.location.reload();
  }

  tabButton.addEventListener("click", () => {
    if (decodedOpen) {
      changeOverlayChoice();
      return;
    }

    if (archiveOpen) {
      nextArchiveCard();
    }
  });

  shiftButton.addEventListener("click", () => {
    if (undecodedOpen) {
      hideUndecoded();
      openArchive(false);
      return;
    }

    if (decodedOpen && !archiveOpen) {
      return;
    }

    toggleArchive();
  });

  spaceButton.addEventListener("click", () => {
    if (undecodedOpen) {
      return;
    }

    if (decodedOpen) {
      activateOverlayChoice();
      return;
    }

    if (archiveOpen) {
      toggleCurrentCard();
      return;
    }

    pressMainSpace();
  });

  overlayArchiveButton.addEventListener("click", () => {
    overlayChoice = "archive";
    activateOverlayChoice();
  });

  overlayNextButton.addEventListener("click", () => {
    overlayChoice = "next";
    activateOverlayChoice();
  });

  nextForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    const value = nextInput?.value.trim() || "";

    if (!value) {
      nextInput?.focus();
      return;
    }

    showFinalResult(value);
  });

  restartButton?.addEventListener("click", reloadNormal);
  specialButton?.addEventListener("click", reloadSpecial);

  document.addEventListener("decoder:decoded", () => {
    window.clearTimeout(counterTimer);
    window.clearTimeout(overlayTimer);

    nextSectionUnlocked = true;
    document.body.classList.add("is-next-record-unlocked");
    addDecodedCard();

    decodedCounter.classList.remove("is-visible");
    void decodedCounter.offsetWidth;
    decodedCounter.classList.add("is-visible");

    counterTimer = window.setTimeout(() => {
      decodedCounter.classList.remove("is-visible");
    }, 3000);

    overlayTimer = window.setTimeout(() => {
      showDecoded();
    }, 4000);
  });

  document.addEventListener("keydown", (event) => {
    setPressed(event.code, true);

    if (undecodedOpen) {
      if (event.code === "Tab" && event.shiftKey) {
        event.preventDefault();
        hideUndecoded();
        openArchive(false);
      }

      if (event.code === "Space") {
        event.preventDefault();
      }

      return;
    }

    if (archiveOpen) {
      if (event.code === "Tab" && event.shiftKey) {
        event.preventDefault();
        toggleArchive();
        return;
      }

      if (event.code === "Tab") {
        event.preventDefault();
        nextArchiveCard();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        toggleCurrentCard();
      }

      return;
    }

    if (decodedOpen) {
      if (event.code === "Tab") {
        event.preventDefault();
        changeOverlayChoice();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        activateOverlayChoice();
      }

      return;
    }

    if (isDeviceLocked()) {
      if (event.code === "Tab" || event.code === "Space") {
        event.preventDefault();
      }
      return;
    }

    if (event.code === "Tab" && event.shiftKey) {
      event.preventDefault();
      toggleArchive();
    }

    if (event.code === "Space") {
      event.preventDefault();
      pressMainSpace();
    }
  });

  document.addEventListener("keyup", (event) => {
    setPressed(event.code, false);
  });

  window.addEventListener("blur", () => {
    tabButton.classList.remove("is-pressed");
    shiftButton.classList.remove("is-pressed");
    spaceButton.classList.remove("is-pressed");
  });

  drawAll();
}
