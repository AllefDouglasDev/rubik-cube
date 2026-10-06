// End-to-end check of Phase 1 in Chrome: keyboard timer, cancel/discard, virtual cube, history.
// Usage: node scripts/e2e.mjs [screenshotDir]
import { chromium } from "playwright-core";
import { createServer } from "vite";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.argv[2];
const server = await createServer({ logLevel: "error", server: { port: 5299, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--enable-unsafe-webgpu"] });
const errors = [];
let failed = false;
const check = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failed = true;
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // Fake webcam: a canvas stream that draws window.__face (9 colors, camera view) in the guide, with uneven light.
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    window.__face = Array(9).fill("#000000");
    const light = [1.08, 1.0, 0.92, 1.04, 1.0, 0.95, 1.0, 0.97, 0.88];
    const shade = (hex, k) => {
      const n = parseInt(hex.slice(1), 16);
      const ch = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
      return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
    };
    // window.__pose moves the face out of the guide (for the face locator): offset, scale, rotation.
    window.__pose = null;
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#606060";
      ctx.fillRect(0, 0, 1280, 720);
      const size = Math.round(720 * 0.55);
      const x0 = Math.round((1280 - size) / 2);
      const y0 = Math.round((720 - size) / 2);
      const cell = size / 3;
      const pose = window.__pose;
      if (pose) {
        ctx.translate(640 + pose.dx, 360 + pose.dy);
        ctx.rotate((pose.angle * Math.PI) / 180);
        ctx.scale(pose.scale, pose.scale);
        ctx.translate(-640, -360);
      }
      ctx.fillStyle = "#151515";
      ctx.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
      window.__face.forEach((hex, i) => {
        ctx.fillStyle = shade(hex, light[i]);
        ctx.fillRect(x0 + (i % 3) * cell + 8, y0 + Math.floor(i / 3) * cell + 8, cell - 16, cell - 16);
      });
      requestAnimationFrame(draw);
    };
    draw();
    // A new stream per call, like a real camera (the app stops the tracks when a page closes the camera).
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30);
    navigator.mediaDevices.enumerateDevices = async () => [];
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("http://localhost:5299/");
  await page.waitForFunction(() => /^[UDRLFB]/.test(document.querySelector(".scramble-text")?.textContent ?? ""), null, { timeout: 60_000 });
  const scramble1 = await page.textContent(".scramble-text");
  check(scramble1.split(" ").length >= 15, `scramble gerado: ${scramble1}`);
  await page.waitForSelector("twisty-player", { timeout: 30_000 });
  check(true, "cubo 3D montado");

  // Inspection off for speed.
  await page.uncheck("text=Inspeção de 15 s");
  const count = () => page.$eval(".stats-count, .panel h2 .muted", (el) => el.textContent);

  async function solve(ms) {
    await page.keyboard.down("Space");
    await page.waitForTimeout(400);
    await page.keyboard.up("Space");
    await page.waitForTimeout(ms);
    await page.keyboard.press("a");
    await page.waitForTimeout(150);
  }

  await solve(300);
  check((await count()).includes("1 solves"), `após 1 solve: ${await count()}`);
  check((await page.textContent(".scramble-text")) !== scramble1, "scramble avançou após o solve");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check((await count()).includes("0 solves"), `Esc descartou o solve: ${await count()}`);

  // Early release must not start.
  await page.keyboard.down("Space");
  await page.waitForTimeout(100);
  await page.keyboard.up("Space");
  check((await page.textContent(".timer-display .hint")).includes("Segure"), "soltar cedo não inicia");

  // Cancel while running saves nothing.
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  await page.keyboard.up("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check((await count()).includes("0 solves"), "Esc durante o solve não salva");

  for (const ms of [500, 300, 700, 400, 600]) await solve(ms);
  check((await count()).includes("5 solves"), `5 solves: ${await count()}`);
  const ao5 = await page.$eval(".stats div:nth-child(2) strong", (el) => el.textContent);
  check(/^\d+\.\d\d$/.test(ao5), `ao5 calculada: ${ao5}`);

  await page.click("button:has-text('+2')");
  await page.waitForTimeout(200);
  check((await page.textContent(".last-solve strong")).endsWith("+"), "penalidade +2 aplicada");

  // Virtual cube: R then R' via buttons, then T-perm twice.
  await page.click(".move-grid button:has-text(\"R'\")");
  await page.fill(".move-pad input", "R U R' U' R' F R2 U' R' U' R U R' F' R U R' U' R' F R2 U' R' U' R U R' F'");
  await page.click("text=Aplicar");
  await page.waitForTimeout(300);
  check((await page.textContent(".timer-side .panel:nth-child(2) h2")).includes("29 movimentos"), "movimentos aplicados no cubo");
  await page.fill(".move-pad input", "R (U");
  await page.click("text=Aplicar");
  check((await page.textContent(".move-pad .error")).includes("inválida"), "notação inválida rejeitada");
  if (shots) await page.screenshot({ path: `${shots}/timer.png` });

  await page.click("role=tab[name='Histórico']");
  await page.waitForSelector(".chart svg path");
  check((await page.$$("tbody tr")).length === 5, "histórico lista 5 solves");
  const box = await page.$eval(".chart svg rect[fill='transparent']", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width * 0.75, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  check(await page.isVisible(".tooltip"), "tooltip do gráfico aparece");
  if (shots) await page.screenshot({ path: `${shots}/history.png` });

  // Solve analysis with a pasted reconstruction (solver solution for the newest solve's scramble).
  const { experimentalSolve3x3x3IgnoringCenters } = await import("cubing/search");
  const { cube3x3x3 } = await import("cubing/puzzles");
  const newestScramble = await page.textContent("tbody tr:first-child .scramble-cell");
  const kpuzzle = await cube3x3x3.kpuzzle();
  const solution = await experimentalSolve3x3x3IgnoringCenters(kpuzzle.defaultPattern().applyAlg(newestScramble));
  await page.click("tbody tr:first-child >> text=Analisar");
  await page.fill(".analysis textarea", solution.toString());
  await page.click(".analysis >> text=Analisar");
  check((await page.textContent(".analysis")).includes("Resolvido"), "análise reconhece a reconstrução como resolvida");
  check((await page.$$(".analysis .tip")).length > 0, "análise mostra dicas");
  await page.click("text=Salvar reconstrução");
  await page.waitForSelector("tbody tr:first-child >> text=Análise ✓");
  check(true, "reconstrução salva no solve");
  check((await page.textContent(".insights")).includes("1 solves analisados"), "resumo da sessão inclui o solve analisado");
  if (shots) await page.screenshot({ path: `${shots}/analysis.png` });
  await page.click(".analysis >> text=Fechar");

  const [download] = await Promise.all([page.waitForEvent("download"), page.click("text=Exportar (csTimer)")]);
  const exported = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
  check(exported.session1?.length === 5 && exported.session1[4][0][0] === 2000, "export csTimer com 5 solves e o +2");

  await page.emulateMedia({ colorScheme: "dark" });
  if (shots) await page.screenshot({ path: `${shots}/history-dark.png` });
  await page.emulateMedia({ colorScheme: "light" });

  // Curriculum: levels, progress, case preview.
  await page.click("role=tab[name='Currículo']");
  await page.waitForSelector(".level-card");
  check((await page.$$(".level-card")).length === 3, "currículo mostra 3 níveis");
  await page.click(".level-card:nth-child(2)");
  await page.selectOption("select[aria-label='Status de OLL 2-look: arestas']", "aprendido");
  await page.waitForTimeout(200);
  check((await page.textContent(".level-card:nth-child(2)")).includes("1 de 8"), "progresso do nível atualiza");
  await page.click("li:has-text('Sune') >> text=Ver caso");
  await page.waitForSelector(".alg-preview twisty-player");
  check(true, "prévia do caso abre o cubo com o algoritmo");
  if (shots) await page.screenshot({ path: `${shots}/curriculum.png`, fullPage: false });

  // Trainer: one timed attempt marked as right.
  await page.click("role=tab[name='Treino']");
  await page.waitForFunction(() => /^[UDRLFB]/.test(document.querySelector(".trainer .scramble-text")?.textContent ?? ""), null, { timeout: 30_000 });
  check(true, "trainer gera o scramble do caso");
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  await page.keyboard.up("Space");
  await page.waitForTimeout(300);
  await page.keyboard.press("a");
  await page.waitForTimeout(100);
  check((await page.textContent(".trainer .timer-display .hint")).includes("Enter"), "trainer pede certo/errei após parar");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll(".trainer .timer-side tbody tr")].some((tr) => tr.textContent?.includes("0/1")), null, { timeout: 10_000 });
  check(true, "tentativa registrada nas estatísticas do caso");
  if (shots) await page.screenshot({ path: `${shots}/trainer.png` });

  // Camera scan with the fake webcam: calibrate, scan the timer's scramble, validate, send to the timer.
  const HEX = { W: "#e8e8e2", Y: "#f2d02a", R: "#b8202a", O: "#f06a1e", B: "#1c4fae", G: "#1f9a55" };
  await page.click("role=tab[name='Timer']");
  const timerScramble = await page.textContent(".scramble-text");
  await page.click("role=tab[name='Câmera']");
  await page.click("text=Abrir câmera");
  await page.waitForTimeout(500);
  for (const [color, name] of Object.entries({ W: "Branco", Y: "Amarelo", R: "Vermelho", O: "Laranja", B: "Azul", G: "Verde" })) {
    await page.evaluate((hex) => (window.__face = Array(9).fill(hex)), HEX[color]);
    await page.waitForTimeout(150);
    await page.click(`.scan button:has-text("${name}")`);
    await page.waitForSelector(`.scan button:has-text("✓ ${name}")`, { timeout: 10_000 });
  }
  check(true, "calibração das 6 cores pela câmera");
  const net = await page.evaluate(async (scramble) => {
    const { FaceletCube } = await import("/src/analysis/facelets.ts");
    const { netOf } = await import("/src/vision/cubeNet.ts");
    return netOf(FaceletCube.solved().apply(scramble), { U: "W", D: "Y", F: "G", B: "B", R: "R", L: "O" });
  }, timerScramble);
  await page.evaluate((colors) => (window.__face = colors), net.F.map((c) => HEX[c]));
  await page.waitForTimeout(200);
  await page.click("text=Começar a escanear");
  for (const [i, face] of ["F", "R", "B", "L", "U", "D"].entries()) {
    await page.evaluate((colors) => (window.__face = colors), net[face].map((c) => HEX[c]));
    await page.waitForFunction((n) => !document.querySelector(".scan")?.textContent?.includes(`Face ${n} de 6`), i + 1, { timeout: 15_000 });
  }
  await page.waitForSelector("text=Estado válido", { timeout: 15_000 }).catch(async (e) => {
    console.log((await page.textContent(".scan .timer-side")).slice(0, 600));
    if (shots) await page.screenshot({ path: `${shots}/scan-fail.png` });
    throw e;
  });
  check(true, "6 faces escaneadas e estado válido");
  check(await page.isVisible("text=O cubo está exatamente no scramble do timer."), "escaneamento confere com o scramble do timer");
  await page.waitForSelector(".scan .cube-view twisty-player");
  if (shots) await page.screenshot({ path: `${shots}/scan.png` });
  await page.click("text=Usar este estado no timer");
  await page.waitForSelector(".tabs button.selected:has-text('Timer')");
  const newScramble = await page.textContent(".scramble-text");
  const sameState = await page.evaluate(async ([a, b]) => {
    const { FaceletCube, FACES } = await import("/src/analysis/facelets.ts");
    const x = FaceletCube.solved().apply(a);
    const y = FaceletCube.solved().apply(b);
    return FACES.every((f) => x.faceColors(f).join() === y.faceColors(f).join());
  }, [timerScramble, newScramble]);
  check(sameState, "timer recebe o estado escaneado");

  // Tracking (experimental) with the fake webcam.
  const frontFaces = (scramble, moves) =>
    page.evaluate(
      async ([scramble, moves]) => {
        const { FaceletCube } = await import("/src/analysis/facelets.ts");
        const { applyMove, stateFromCube, visibleFace, SLOT_FACES } = await import("/src/tracking/stickerModel.ts");
        const color = { U: "W", D: "Y", F: "G", B: "B", R: "R", L: "O" };
        let s = stateFromCube(FaceletCube.solved().apply(scramble));
        const out = [];
        for (const m of moves) {
          s = applyMove(s, m);
          out.push(visibleFace(s).map((i) => color[SLOT_FACES[i]]));
        }
        return out;
      },
      [scramble, moves],
    );
  const show = async (colors) => {
    await page.evaluate((hexes) => (window.__face = hexes), colors.map((c) => HEX[c]));
    await page.waitForTimeout(900); // slow mode: about one move per second
  };
  await page.evaluate(() => (window.__face = Array(9).fill("#1f9a55")));
  await page.click("role=tab[name='Rastreamento']");
  await page.click(".tracking >> text=Abrir câmera");
  await page.click(".tracking button:has-text('Guiado')");
  await page.selectOption(".tracking select[aria-label='Algoritmo']", { label: "OLL 2-look: cantos · Sune" });
  await page.click(".tracking >> text=Iniciar");
  await page.waitForTimeout(300);
  for (const face of await frontFaces("", ["R", "U", "R'", "U", "R", "U2", "R'"])) await show(face);
  await page.click(".tracking >> text=Concluir");
  await page.waitForSelector(".tracking >> text=Acerto por giro");
  const guided = await page.textContent(".tracking .moves-line + p");
  check(guided.includes("100%"), `guiado decodifica o Sune: ${guided.slice(0, 80)}`);

  // Hand masking: the MediaPipe worker must load inside the app (the fake camera has no hands to find).
  await page.check(".tracking >> text=Ignorar adesivos cobertos pelas mãos");
  await page.waitForTimeout(5000);
  check(!(await page.textContent(".tracking")).includes("Detecção de mãos indisponível"), "detecção de mãos (MediaPipe) carrega no app");
  await page.uncheck(".tracking >> text=Ignorar adesivos cobertos pelas mãos");

  // Same guided run with the face away from the guide (shifted, smaller, rotated): the face locator finds it.
  await page.check(".tracking >> text=Localizar a face automaticamente");
  await page.evaluate(() => (window.__pose = { dx: -230, dy: 60, angle: 18, scale: 0.7 }));
  await page.evaluate(() => (window.__face = Array(9).fill("#1f9a55")));
  await page.waitForTimeout(2500); // OpenCV.js loads in the worker
  await page.click(".tracking >> text=Iniciar");
  await page.waitForTimeout(300);
  for (const face of await frontFaces("", ["R", "U", "R'", "U", "R", "U2", "R'"])) await show(face);
  await page.click(".tracking >> text=Concluir");
  await page.waitForSelector(".tracking >> text=Acerto por giro");
  const located = await page.textContent(".tracking .moves-line + p");
  check(located.includes("100%"), `localizador automático (face fora do guia, girada 18°): ${located.slice(0, 60)}`);
  if (shots) await page.screenshot({ path: `${shots}/tracking-auto.png` });
  await page.uncheck(".tracking >> text=Localizar a face automaticamente");
  await page.evaluate(() => (window.__pose = null));

  // Timed solve with the camera: apply the solver's solution of the timer scramble, then reconstruct from video.
  await page.click(".tracking button:has-text('Solve com câmera')");
  await page.check(".tracking >> text=Gravar vídeo");
  const solveScramble = await page.textContent(".tracking code.alg-code");
  const { cube3x3x3: c3 } = await import("cubing/puzzles");
  const solMoves = (await experimentalSolve3x3x3IgnoringCenters((await c3.kpuzzle()).defaultPattern().applyAlg(solveScramble))).toString().split(" ");
  const faces = await frontFaces(solveScramble, solMoves);
  await page.evaluate((hexes) => (window.__face = hexes), (await frontFaces(solveScramble, []))[0] ?? []);
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  await page.keyboard.up("Space");
  await page.waitForTimeout(300);
  for (const face of faces) await show(face);
  await page.keyboard.press("a");
  await page.waitForSelector(".tracking >> text=Solve salvo no histórico", { timeout: 15_000 }).catch(async (e) => {
    console.log("DEBUG errors:", errors.join(" | ").slice(0, 1500));
    if (shots) await page.screenshot({ path: `${shots}/tracking-fail.png` });
    throw e;
  });
  const live = (await page.textContent(".tracking .moves-line")).trim().split(/\s+/);
  // Opposite faces commute (F B = B F), so compare the resulting state and the move count, not the order.
  const liveSolves = await page.evaluate(async ([scr, moves]) => {
    const { FaceletCube } = await import("/src/analysis/facelets.ts");
    return FaceletCube.solved().apply(`${scr} ${moves}`).isSolved();
  }, [solveScramble, live.join(" ")]);
  check(liveSolves && Math.abs(live.length - solMoves.length) <= 1, `solve com câmera decodifica ao vivo (${live.length}/${solMoves.length} giros, resolve o scramble)`);
  if (!liveSolves) console.log("  esperado:   ", solMoves.join(" "), "\n  decodificado:", live.join(" "));
  await page.click(".tracking >> text=Reconstruir do vídeo");
  await page.waitForSelector(".tracking >> text=Reconstruído do vídeo", { timeout: 120_000 });
  const rec = await page.textContent(".tracking .moves-line + p");
  check(rec.includes("termina resolvido") && !rec.includes("não termina"), `reconstrução do vídeo: ${rec.slice(0, 70)}`);
  if (shots) await page.screenshot({ path: `${shots}/tracking.png` });

  check(errors.length === 0, `sem erros no console${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
