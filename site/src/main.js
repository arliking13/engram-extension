const root = document.documentElement;
const cards = document.querySelectorAll("[data-tilt]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const HEALTH_BANDS = [
  { min: 90, label: "Safe", color: "#22c55e" },
  { min: 75, label: "Good", color: "#84cc16" },
  { min: 50, label: "Fair", color: "#f59e0b" },
  { min: 25, label: "Risky", color: "#f97316" },
  { min: 0, label: "Critical", color: "#ef4444" },
];

function clampHealthScore(score) {
  return Math.max(0, Math.min(100, Number(score) || 0));
}

function healthFromScore(score) {
  const normalized = clampHealthScore(score);
  return HEALTH_BANDS.find((band) => normalized >= band.min) || HEALTH_BANDS[HEALTH_BANDS.length - 1];
}

function needleAngleFromScore(score) {
  return -90 + (clampHealthScore(score) / 100) * 180;
}

document.querySelectorAll("[data-health-score]").forEach((card) => {
  const score = Number(card.dataset.healthScore || 0);
  const angle = needleAngleFromScore(score);
  const health = healthFromScore(score);
  const needle = card.querySelector(".mock-needle");
  const status = card.querySelector(".popup-status");

  card.style.setProperty("--needle-angle", `${angle}deg`);
  card.style.setProperty("--needle-start-angle", `${angle - 26}deg`);
  card.style.setProperty("--health-color", health.color);
  if (needle) needle.style.transform = `rotate(${angle}deg)`;
  if (status) status.textContent = health.label;
});

if (!reducedMotion.matches) {
  window.addEventListener("pointermove", (event) => {
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    root.style.setProperty("--pointer-x", x.toFixed(3));
    root.style.setProperty("--pointer-y", y.toFixed(3));
  });

  cards.forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * -8;
      card.style.setProperty("--tilt-x", `${y.toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${x.toFixed(2)}deg`);
    });

    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
    });
  });
}

const revealItems = document.querySelectorAll(
  ".section-heading, .card, .solution-strip, .workflow li, .demo-flow span, .privacy-card, .platform-card, .cta-panel"
);

revealItems.forEach((item, index) => {
  item.classList.add("reveal");
  item.style.setProperty("--reveal-delay", `${Math.min(index % 8, 5) * 55}ms`);
});

if (reducedMotion.matches || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  revealItems.forEach((item) => {
    observer.observe(item);
  });
}
