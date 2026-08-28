import p5 from "p5";
import "./style.css";
import { Game } from "./game/Game";
import { AudioDirector } from "./audio/AudioDirector";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("App root bulunamadı.");

app.innerHTML = `
  <main class="game-shell">
    <header class="marquee" aria-label="Oyun başlığı">
      <span>Tek Oyunculu</span>
      <strong>Mirror Mayhem</strong>
      <span>Ayna · Açı · İsabet</span>
    </header>
    <section class="game-stage">
      <div id="canvas-wrap" class="canvas-wrap" aria-label="Mirror Mayhem oyun alanı"></div>
      <div id="start-screen" class="start-screen">
        <div class="start-card">
          <p class="chapter">AYNA DÜELLOSU</p>
          <h1>Aynadan sektir.<br>Rakibini şaşırt.</h1>
          <p class="intro">Hareket et, nişan al; aynaya yaklaşınca açıyı değiştir.</p>
          <div class="controls" aria-label="Kontroller">
            <span><b>WASD</b> hareket</span>
            <span><b>FARE</b> nişan</span>
            <span><b>Q / E</b> ayna</span>
          </div>
          <section class="stage-editor" aria-label="Oyun alanı ayarları">
            <div class="editor-title"><strong>OYUN ALANI</strong><small>YERLEŞİM</small></div>
            <div class="editor-body">
              <p class="editor-hint">Bir objeyi seçip sürükle. <b>Q / E</b> ile döndür.</p>
              <label class="editor-field">Yerleşim
                <select id="layout-input">
                  <option value="BALANCED">Dengeli</option>
                  <option value="MAZE">Koridorlu</option>
                  <option value="OPEN">Açık</option>
                  <option value="CHAOTIC">Sürprizli</option>
                </select>
              </label>
              <div class="editor-actions">
                <button id="reroll-button" type="button">↻ YENİLE</button>
                <button id="rotate-left" type="button" aria-label="Seçili objeyi sola döndür">↶</button>
                <button id="rotate-right" type="button" aria-label="Seçili objeyi sağa döndür">↷</button>
              </div>
              <div class="editor-actions editor-actions--objects">
                <button id="add-mirror" type="button">+ AYNA</button>
                <button id="add-furniture" type="button">+ OBJE</button>
                <button id="delete-object" class="delete-object" type="button">SEÇİLİYİ SİL</button>
              </div>
              <label class="range-field"><span>Ayna <output id="mirror-count-value">3</output></span><input id="mirror-count" type="range" min="0" max="12" step="1" value="3"></label>
              <label class="range-field"><span>Dekor <output id="furniture-count-value">6</output></span><input id="furniture-count" type="range" min="0" max="10" step="1" value="6"></label>
              <label class="range-field"><span>Ayna ölçeği <output id="mirror-scale-value">100%</output></span><input id="mirror-scale" type="range" min="75" max="135" step="5" value="100"></label>
              <label class="range-field"><span>Engel ölçeği <output id="furniture-scale-value">100%</output></span><input id="furniture-scale" type="range" min="75" max="135" step="5" value="100"></label>
              <label class="range-field"><span>Yayılım <output id="layout-spread-value">100%</output></span><input id="layout-spread" type="range" min="80" max="115" step="5" value="100"></label>
              <div class="mirror-key" aria-label="Ayna özellikleri">
                <span><i class="mirror-dot standard"></i>Sektirir</span>
                <span><i class="mirror-dot splitter"></i>Böler</span>
                <span><i class="mirror-dot explosive"></i>Patlar</span>
              </div>
              <p class="decor-key">DEKORLAR · KOLTUK · SERVİS MASASI · BAGAJ ARABASI</p>
            </div>
          </section>
          <button id="start-button" class="start-button" type="button">OYUNA BAŞLA</button>
          <button id="audio-toggle" class="audio-toggle" type="button" aria-pressed="false">SES AÇIK · M</button>
        </div>
      </div>
    </section>
    <footer class="stage-note"><span>WASD / OK TUŞLARI</span><span>FAREYLE ATEŞ ET · Q/E İLE YAKIN AYNAYI ÇEVİR</span><span>M · SES</span></footer>
  </main>
`;

const audio = new AudioDirector();
const audioToggle = document.querySelector<HTMLButtonElement>("#audio-toggle");
const startScreen = document.querySelector<HTMLElement>("#start-screen");
const startButton = document.querySelector<HTMLButtonElement>("#start-button");

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
    window.setTimeout(() => startScreen?.remove(), 450);
  };

  startButton?.addEventListener("click", startGame);
  window.addEventListener("keydown", (event) => {
    if (event.repeat || !["Enter", " "].includes(event.key) || startScreen?.classList.contains("is-hidden")) return;
    if (event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    startGame();
  }, { capture: true });

  p.setup = () => game.setup();
  p.draw = () => game.updateAndDraw();
  p.mousePressed = (event) => game.handleMousePressed(event as Event);
  p.mouseDragged = () => game.handleMouseDragged();
  p.mouseReleased = () => game.handleMouseReleased();
  p.keyPressed = () => game.handleKeyPressed();
});
