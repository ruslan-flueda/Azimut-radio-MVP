import { initButtons } from "./buttons.js";
import { initKnobs } from "./knob.js";
import { initPlayer } from "./player.js";

// Сначала запускаем основные части сайта.
initPlayer();
initKnobs();
initButtons();

const hero = document.getElementById("landingHero");
const heroCanvas = document.getElementById("landingHeroBg");
const startButton = document.getElementById("heroStartButton");
const deviceSection = document.getElementById("deviceSection");
const preintro = document.getElementById("devicePreintro");
const knobIntro = document.getElementById("deviceKnobintro");
const startIntro = document.getElementById("deviceIntro");
const mobileSpaceButton = document.getElementById("spaceBtn");

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

window.scrollTo(0, 0);

// Рисуем простой фон из частиц на первом экране.
function initHeroBackground() {
  if (!hero || !(heroCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  const ctx = heroCanvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const particles = [];
  const mouse = {
    x: -1000,
    y: -1000
  };

  let frameId = 0;

  function resizeCanvas() {
    const rect = hero.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    heroCanvas.width = Math.round(rect.width * dpr);
    heroCanvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    createParticles();
  }

  function createParticles() {
    const dpr = window.devicePixelRatio || 1;
    const width = heroCanvas.width / dpr;
    const height = heroCanvas.height / dpr;
    const count = Math.round((width * height) / 12000);

    particles.length = 0;

    for (let i = 0; i < count; i += 1) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speedX: (Math.random() - 0.5) * 0.6,
        speedY: (Math.random() - 0.5) * 0.6,
        size: 1 + Math.random() * 2,
        alpha: 0.15 + Math.random() * 0.25
      });
    }
  }

  function updateParticle(particle, width, height) {
    const dx = particle.x - mouse.x;
    const dy = particle.y - mouse.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 140) {
      const power = (140 - distance) / 140;
      particle.speedX += (dx / (distance || 1)) * power * 0.4;
      particle.speedY += (dy / (distance || 1)) * power * 0.4;
    }

    particle.speedX *= 0.98;
    particle.speedY *= 0.98;
    particle.x += particle.speedX;
    particle.y += particle.speedY;

    if (particle.x < 0 || particle.x > width) {
      particle.speedX *= -1;
    }

    if (particle.y < 0 || particle.y > height) {
      particle.speedY *= -1;
    }
  }

  function drawParticles(width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];

      updateParticle(particle, width, height);

      ctx.beginPath();
      ctx.fillStyle = `rgba(0, 0, 0, ${particle.alpha})`;
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLines() {
    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const first = particles[i];
        const second = particles[j];
        const dx = first.x - second.x;
        const dy = first.y - second.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 100) {
          continue;
        }

        ctx.beginPath();
        ctx.strokeStyle = `rgba(0, 0, 0, ${(1 - distance / 100) * 0.12})`;
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(second.x, second.y);
        ctx.stroke();
      }
    }
  }

  function animate() {
    const dpr = window.devicePixelRatio || 1;
    const width = heroCanvas.width / dpr;
    const height = heroCanvas.height / dpr;

    drawParticles(width, height);
    drawLines();

    frameId = window.requestAnimationFrame(animate);
  }

  hero.addEventListener("pointermove", (event) => {
    const rect = hero.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });

  hero.addEventListener("pointerleave", () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", () => {
    window.cancelAnimationFrame(frameId);
  });

  resizeCanvas();
  animate();
}

// Управление первым экраном и вступительными сообщениями.
function initIntro() {
  if (!hero || !startButton || !deviceSection) {
    return;
  }

  let heroHidden = false;
  let introStep = "preintro";

  document.body.classList.add("is-hero-active");
  document.body.classList.add("is-device-locked");

  if (knobIntro) {
    knobIntro.classList.add("is-pending");
  }

  if (startIntro) {
    startIntro.classList.add("is-pending");
  }

  function hideHero() {
    hero.classList.add("is-hidden");
    document.body.classList.remove("is-hero-active");
    heroHidden = true;
    window.scrollTo(0, 0);
  }

  function goToDevice() {
    if (heroHidden) {
      return;
    }

    document.body.classList.remove("is-hero-active");
    deviceSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    window.setTimeout(hideHero, 850);
  }

  function blockScrollBeforeStart(event) {
    if (!heroHidden) {
      event.preventDefault();
    }
  }

  function blockKeysBeforeStart(event) {
    if (heroHidden) {
      return;
    }

    const code = event.code;
    const needBlock =
      code === "ArrowDown" ||
      code === "ArrowUp" ||
      code === "PageDown" ||
      code === "PageUp" ||
      code === "Space" ||
      code === "Home" ||
      code === "End";

    if (needBlock) {
      event.preventDefault();
    }
  }

  function nextIntroStep() {
    if (!heroHidden) {
      return;
    }

    if (introStep === "preintro") {
      if (preintro) {
        preintro.classList.add("is-hidden");
      }
      if (knobIntro) {
        knobIntro.classList.remove("is-pending");
      }
      introStep = "knobintro";
      return;
    }

    if (introStep === "knobintro") {
      if (knobIntro) {
        knobIntro.classList.add("is-hidden");
      }
      if (startIntro) {
        startIntro.classList.remove("is-pending");
      }
      introStep = "intro";
      return;
    }

    if (introStep === "intro") {
      if (startIntro) {
        startIntro.classList.add("is-hidden");
      }

      document.body.classList.remove("is-device-locked");
      introStep = "started";

      // Автоматически запускаем запись после конца вступления.
      document.dispatchEvent(new CustomEvent("control:space"));
    }
  }

  startButton.addEventListener("click", goToDevice);

  window.addEventListener("wheel", blockScrollBeforeStart, { passive: false });
  window.addEventListener("touchmove", blockScrollBeforeStart, { passive: false });
  window.addEventListener("keydown", blockKeysBeforeStart);

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") {
      return;
    }

    if (
      introStep === "preintro" ||
      introStep === "knobintro" ||
      introStep === "intro"
    ) {
      event.preventDefault();
      nextIntroStep();
    }
  });

  if (mobileSpaceButton) {
    mobileSpaceButton.addEventListener("click", () => {
      if (
        introStep === "preintro" ||
        introStep === "knobintro" ||
        introStep === "intro"
      ) {
        nextIntroStep();
      }
    });
  }
}

initHeroBackground();
initIntro();
