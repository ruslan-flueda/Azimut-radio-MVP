import { initButtons } from "./buttons.js";
import { initKnobs } from "./knob.js";
import { initPlayer } from "./player.js";

initPlayer();
initKnobs();
initButtons();

const introOverlay = document.getElementById("introOverlay");

if (introOverlay) {
  introOverlay.addEventListener("click", () => {
    introOverlay.classList.add("is-hidden");
    document.dispatchEvent(new CustomEvent("control:space"));
  }, { once: true });
}
