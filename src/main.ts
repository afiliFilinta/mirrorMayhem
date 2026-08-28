import p5 from "p5";
import "./style.css";
import { Game } from "./game/Game";
import { AudioDirector } from "./audio/AudioDirector";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("App root bulunamadı.");

app.innerHTML = `
  <section class="game-stage">
    <div id="canvas-wrap" class="canvas-wrap" aria-label="Mirror Mayhem büyülü malikâne oyun alanı"></div>
    <div id="start-screen" class="start-screen">
      <button id="panel-toggle" class="panel-toggle" type="button" aria-expanded="true">PANELİ GİZLE ‹</button>
      <div class="start-card">
        <div class="start-copy">
          <p class="eyebrow">Büyülü Malikâne Düellosu</p>
          <h1>Mirror Mayhem</h1>
          <p class="intro">Objeyi seçip sürükle. Seçili ayna veya mobilyayı <strong>Q / E</strong> ile döndür.</p>
        </div>
        <form id="setup-form" class="setup-panel">
          <div class="setup-heading">
            <div><span class="step">DÜELLO KURULUMU</span><h2>Arenanı düzenle</h2></div>
            <button id="reroll-button" class="reroll-button" type="button">↻ YERLEŞİMİ YENİLE</button>
          </div>
          <label class="select-field">Yerleşim tarzı
            <select id="layout-input">
              <option value="MAZE">Koridorlu labirent</option>
              <option value="BALANCED">Dengeli</option>
              <option value="OPEN">Açık alan</option>
              <option value="CHAOTIC">Kaotik</option>
            </select>
          </label>
          <div class="rotation-control" aria-label="Seçili objeyi döndür">
            <span>Seçili objeyi döndür</span>
            <button id="rotate-left" type="button" aria-label="Seçili objeyi sola döndür">↶</button>
            <button id="rotate-right" type="button" aria-label="Seçili objeyi sağa döndür">↷</button>
          </div>
          <div class="object-actions" aria-label="Arena objeleri">
            <button id="add-mirror" type="button">+ AYNA</button>
            <button id="add-furniture" type="button">+ OBJE</button>
            <button id="delete-object" class="delete-object" type="button">SEÇİLİYİ SİL</button>
          </div>
          <div class="setting-row">
            <label for="mirror-count">Ayna sayısı</label><output id="mirror-count-value">6</output>
            <input id="mirror-count" type="range" min="0" max="12" step="1" value="6">
          </div>
          <div class="setting-row">
            <label for="furniture-count">Engel sayısı</label><output id="furniture-count-value">6</output>
            <input id="furniture-count" type="range" min="0" max="10" step="1" value="6">
          </div>
          <div class="setting-row">
            <label for="mirror-scale">Ayna ölçeği</label><output id="mirror-scale-value">100%</output>
            <input id="mirror-scale" type="range" min="75" max="135" step="5" value="100">
          </div>
          <div class="setting-row">
            <label for="furniture-scale">Engel ölçeği</label><output id="furniture-scale-value">100%</output>
            <input id="furniture-scale" type="range" min="75" max="135" step="5" value="100">
          </div>
          <div class="setting-row">
            <label for="layout-spread">Alan yayılımı</label><output id="layout-spread-value">100%</output>
            <input id="layout-spread" type="range" min="80" max="115" step="5" value="100">
          </div>
          <button id="start-button" class="start-button" type="submit">DÜELLOYU BAŞLAT</button>
          <button id="audio-toggle" class="audio-toggle" type="button" aria-pressed="false">SES AÇIK · M</button>
        </form>
      </div>
    </div>
  </section>
`;

const audio = new AudioDirector();
const audioToggle = document.querySelector<HTMLButtonElement>("#audio-toggle");
const startScreen = document.querySelector<HTMLElement>("#start-screen");
const setupForm = document.querySelector<HTMLFormElement>("#setup-form");
const panelToggle = document.querySelector<HTMLButtonElement>("#panel-toggle");
panelToggle?.addEventListener("click", () => {
  const collapsed = startScreen?.classList.toggle("is-collapsed") ?? false;
  panelToggle.textContent = collapsed ? "PANELİ AÇ ›" : "PANELİ GİZLE ‹";
  panelToggle.setAttribute("aria-expanded", String(!collapsed));
});
const refreshAudioButton = (muted: boolean) => {
  if (!audioToggle) return;
  audioToggle.textContent = muted ? "SES KAPALI · M" : "SES AÇIK · M";
  audioToggle.setAttribute("aria-pressed", String(muted));
};
audioToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  refreshAudioButton(audio.toggleMuted());
});
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "m" || event.repeat) return;
  refreshAudioButton(audio.toggleMuted());
});

new p5((p: p5) => {
  const game = new Game(p, audio);
  const rangeSettings = [
    { id: "mirror-count", key: "mirrorCount", percent: false },
    { id: "furniture-count", key: "furnitureCount", percent: false },
    { id: "mirror-scale", key: "mirrorScale", percent: true },
    { id: "furniture-scale", key: "furnitureScale", percent: true },
    { id: "layout-spread", key: "layoutSpread", percent: true },
  ] as const;

  for (const setting of rangeSettings) {
    const input = document.querySelector<HTMLInputElement>(`#${setting.id}`);
    const output = document.querySelector<HTMLOutputElement>(`#${setting.id}-value`);
    if (input) {
      const control = document.createElement("div");
      control.className = "range-control";
      const decrease = document.createElement("button");
      decrease.type = "button";
      decrease.className = "range-step";
      decrease.textContent = "−";
      decrease.setAttribute("aria-label", `${input.labels?.[0]?.textContent ?? setting.id} azalt`);
      const increase = document.createElement("button");
      increase.type = "button";
      increase.className = "range-step";
      increase.textContent = "+";
      increase.setAttribute("aria-label", `${input.labels?.[0]?.textContent ?? setting.id} artır`);
      input.before(control);
      control.append(decrease, input, increase);
      const step = (direction: -1 | 1) => {
        if (direction < 0) input.stepDown();
        else input.stepUp();
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      decrease.addEventListener("click", () => step(-1));
      increase.addEventListener("click", () => step(1));
    }
    input?.addEventListener("input", () => {
      const value = Number(input.value);
      if (output) output.value = setting.percent ? `${value}%` : String(value);
      game.configureArena({ [setting.key]: setting.percent ? value / 100 : value });
    });
  }
  document.querySelector<HTMLSelectElement>("#layout-input")?.addEventListener("change", (event) => {
    game.configureArena({ layout: (event.currentTarget as HTMLSelectElement).value as "MAZE" | "BALANCED" | "OPEN" | "CHAOTIC" });
  });
  document.querySelector<HTMLButtonElement>("#reroll-button")?.addEventListener("click", () => game.rerollArena());
  document.querySelector<HTMLButtonElement>("#rotate-left")?.addEventListener("click", () => game.rotateEditorSelection(-1));
  document.querySelector<HTMLButtonElement>("#rotate-right")?.addEventListener("click", () => game.rotateEditorSelection(1));
  const syncArenaCounts = () => {
    const counts = game.getArenaCounts();
    for (const [id, value] of [["mirror-count", counts.mirrorCount], ["furniture-count", counts.furnitureCount]] as const) {
      const input = document.querySelector<HTMLInputElement>(`#${id}`);
      const output = document.querySelector<HTMLOutputElement>(`#${id}-value`);
      if (input) input.value = String(value);
      if (output) output.value = String(value);
    }
  };
  document.querySelector<HTMLButtonElement>("#add-mirror")?.addEventListener("click", () => { game.addEditorObject("mirror"); syncArenaCounts(); });
  document.querySelector<HTMLButtonElement>("#add-furniture")?.addEventListener("click", () => { game.addEditorObject("wall"); syncArenaCounts(); });
  document.querySelector<HTMLButtonElement>("#delete-object")?.addEventListener("click", () => { game.deleteEditorSelection(); syncArenaCounts(); });

  const startGame = () => {
    if (startScreen?.classList.contains("is-hidden")) return;
    game.start();
    startScreen?.classList.add("is-hidden");
    window.setTimeout(() => startScreen?.remove(), 500);
  };

  setupForm?.addEventListener("submit", (event) => { event.preventDefault(); startGame(); });
  window.addEventListener("keydown", (event) => {
    if (event.repeat || !["Enter", " "].includes(event.key) || startScreen?.classList.contains("is-hidden")) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startGame();
  }, { capture: true });

  p.setup = () => game.setup();
  p.draw = () => game.updateAndDraw();
  p.mousePressed = (event) => game.handleMousePressed(event as Event);
  p.mouseDragged = () => game.handleMouseDragged();
  p.mouseReleased = () => game.handleMouseReleased();
  p.keyPressed = () => game.handleKeyPressed();
});
