// End-to-end check of the solo timer (solo.html) in headless Chrome.
// Usage: node scripts/e2e-solo.mjs [screenshotDir]
import { chromium } from "playwright-core";
import { createServer } from "vite";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.argv[2];
const server = await createServer({ logLevel: "error", server: { port: 5298, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];
let failed = false;
const check = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failed = true;
};
const shot = async (page, name) => shots && page.screenshot({ path: `${shots}/${name}.png` });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:5298" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("http://localhost:5298/solo.html");

  const scrambleText = () => page.textContent(".solo-scramble .scramble-text");
  await page.waitForFunction(() => /^[UDRLFB]/.test(document.querySelector(".solo-scramble .scramble-text")?.textContent ?? ""), null, {
    timeout: 60_000,
  });
  const scramble1 = await scrambleText();
  check(scramble1.split(" ").length >= 15, `scramble gerado: ${scramble1}`);
  check((await page.textContent(".session-current")).includes("#1"), "sessão #1 criada no primeiro acesso");
  await shot(page, "01-inicio");

  const phase = () => page.$eval(".solo-timer", (el) => [...el.classList].find((c) => c.startsWith("phase-")));
  const rows = () => page.$$eval(".solve-list tbody tr", (trs) => trs.length);

  // Hold space: nothing starts, the screen says it is about to start and only the clock stays visible.
  await page.keyboard.down("Space");
  await page.waitForTimeout(100);
  check((await phase()) === "phase-armed", "segurar espaço arma o timer (vermelho)");
  check(await page.$eval(".solo-shell", (el) => el.classList.contains("focus")), "modo foco ao segurar espaço");
  check((await page.$eval(".solo-side", (el) => getComputedStyle(el).visibility)) === "hidden", "sidebar escondida no foco");
  await page.waitForTimeout(350);
  check((await phase()) === "phase-ready", "depois do tempo de segurar fica pronto (verde)");
  check((await page.textContent(".solo-timer .hint")).includes("Solte"), "aviso de que o tempo vai iniciar");
  await shot(page, "02-pronto");
  check((await page.textContent(".solo-timer .time")) === "0.00", "o tempo não corre enquanto segura");
  await page.keyboard.up("Space");
  await page.waitForTimeout(600);
  check((await phase()) === "phase-running", "soltar inicia o tempo");
  await page.keyboard.press("KeyA");
  await page.waitForTimeout(100);
  check((await phase()) === "phase-running", "outra tecla não para o tempo");
  await page.keyboard.down("Space");
  await page.waitForTimeout(100);
  check((await phase()) === "phase-stopped", "espaço para o tempo");
  await page.keyboard.up("Space");
  await page.waitForFunction(() => document.querySelectorAll(".solve-list tbody tr").length === 1);
  check(true, "solve aparece na lista");
  await page.waitForFunction((s) => document.querySelector(".solo-scramble .scramble-text")?.textContent !== s, scramble1);
  check(true, "novo scramble após parar");

  // Releasing too early does not start.
  await page.keyboard.down("Space");
  await page.waitForTimeout(100);
  await page.keyboard.up("Space");
  await page.waitForTimeout(100);
  check((await phase()) === "phase-idle", "soltar antes de ficar verde não inicia");

  // Two more solves.
  for (const ms of [300, 500]) {
    await page.keyboard.down("Space");
    await page.waitForTimeout(400);
    await page.keyboard.up("Space");
    await page.waitForTimeout(ms);
    await page.keyboard.down("Space");
    await page.keyboard.up("Space");
  }
  await page.waitForFunction(() => document.querySelectorAll(".solve-list tbody tr").length === 3);
  check(true, "3 solves na sessão");
  check((await page.textContent(".solo-summary")).includes("3"), "resumo atualizado");
  await shot(page, "03-solves");

  // Two-click delete.
  const del = page.locator(".solve-list tbody tr").first().locator(".delete-button");
  await del.click();
  check((await del.textContent()) === "Tem certeza?", "primeiro clique pede confirmação");
  check((await rows()) === 3, "primeiro clique não apaga");
  await del.click();
  await page.waitForFunction(() => document.querySelectorAll(".solve-list tbody tr").length === 2);
  check(true, "segundo clique apaga");

  // Scramble preview.
  await page.click("button[aria-label='Ver o embaralhamento no cubo virtual']");
  const stickers = await page.$$eval(".preview-net .net-sticker", (els) => els.map((e) => getComputedStyle(e).backgroundColor));
  check(stickers.length === 54, "prévia mostra 54 adesivos");
  check(new Set(stickers).size === 6, "prévia usa as 6 cores");
  await page.waitForSelector(".preview-cube twisty-player", { timeout: 30_000 });
  check(true, "prévia mostra o cubo virtual 3D");
  check((await page.textContent("dialog .start-position")).includes("branco embaixo"), "prévia mostra a posição inicial");
  await page.waitForTimeout(1500);
  await shot(page, "04-previa");
  await page.keyboard.press("Escape");
  check(!(await page.$("dialog[open]")), "Esc fecha a prévia");

  // New session.
  await page.click("text=Nova sessão");
  await page.waitForFunction(() => document.querySelector(".session-current")?.textContent?.includes("#2"));
  check((await rows()) === 0, "nova sessão #2 começa vazia");
  await page.click(".session-current");
  const options = await page.$$eval(".session-list button", (bs) => bs.map((b) => b.querySelector(".session-number")?.textContent));
  check(options.join(",") === "#2,#1", `dropdown lista as sessões (${options.join(",")})`);
  await shot(page, "05-dropdown");
  await page.click(".session-list button:has-text('#1')");
  await page.waitForFunction(() => document.querySelectorAll(".solve-list tbody tr").length === 2, null, { timeout: 5000 }).catch(() => {});
  check((await rows()) === 2, "voltar para a sessão #1 mostra os tempos dela");

  // Study pages: F2L, OLL and PLL from the menu.
  for (const [hash, count] of [["f2l", 41], ["oll", 57], ["pll", 21]]) {
    await page.click(`.solo-nav a[href='#${hash}']`);
    const shown = await page
      .waitForFunction((n) => document.querySelectorAll(".case-card").length === n, count, { timeout: 10_000 })
      .then(() => true, () => false);
    check(shown, `${hash.toUpperCase()} mostra ${count} casos`);
  }
  await shot(page, "08-pll");
  await page.click(".case-card:has-text('Aa')");
  await page.waitForSelector("dialog[open] .preview-cube twisty-player", { timeout: 30_000 });
  check((await page.textContent("dialog[open] .alg-moves")).includes("R'"), "estudo mostra o algoritmo e o cubo virtual");
  await page.waitForFunction(() => /^[UDRLFB]/.test(document.querySelector("dialog[open] .case-scramble")?.textContent ?? ""), null, {
    timeout: 60_000,
  });
  check(true, "estudo gera o scramble para montar o caso");
  await page.click("dialog[open] [aria-label='Status do caso'] >> text=Aprendendo");
  await page.waitForTimeout(1500);
  await shot(page, "09-estudo");
  await page.click("dialog[open] >> text=Próximo →");
  check((await page.textContent("dialog[open] h2")).includes("Ab"), "próximo caso");
  await page.keyboard.press("Escape");
  check((await page.textContent(".case-card:has-text('Aa') .status-pill")) === "Aprendendo", "status salvo no card");
  await page.click("text=Praticar todos");
  await page.waitForSelector("dialog[open] .case-diagram");
  check(!(await page.$("dialog[open] .alg-moves")), "prática esconde o algoritmo");
  await page.click("dialog[open] >> text=Mostrar algoritmo");
  check(!!(await page.$("dialog[open] .alg-moves")), "prática revela o algoritmo");
  await page.click("dialog[open] >> text=Acertei · sei");
  check((await page.textContent("dialog[open]")).includes("Placar: 1/1"), "prática conta o acerto");
  await page.keyboard.press("Escape");
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  check(!(await page.$(".solo-timer")), "espaço não aciona o timer fora da aba Timer");
  await page.keyboard.up("Space");
  await page.click(".solo-nav a[href='#timer']");
  await page.waitForSelector(".solo-timer");

  // Export.
  await page.click("button[aria-label='Configurações']");
  await page.waitForFunction(() => document.querySelector("textarea[aria-label='JSON exportado']")?.value.startsWith("{"));
  const exported = JSON.parse(await page.inputValue("textarea[aria-label='JSON exportado']"));
  check(exported.app === "cubo-solo" && exported.sessions.length === 2, "export tem as 2 sessões");
  const s1 = exported.sessions.find((s) => s.number === 1);
  check(s1.solves.length === 2 && typeof s1.endedAt === "number" && s1.updatedAt >= s1.createdAt, "sessão 1 com solves, endedAt e updatedAt");
  check(exported.algProgress.some((p) => p.key === "pll/Aa" && p.status === "aprendendo"), "export inclui o progresso dos casos");
  await page.click("text=Copiar JSON");
  check((await page.evaluate(() => navigator.clipboard.readText())).includes('"cubo-solo"'), "copiar coloca o JSON na área de transferência");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("text=Baixar JSON")]);
  check(/^cubo-solo-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), `download: ${download.suggestedFilename()}`);
  await shot(page, "06-export");

  // Import into a fresh database: delete it and reload.
  await page.close();
  const fresh = await context.newPage();
  fresh.on("pageerror", (e) => errors.push(e.message));
  await fresh.goto("http://localhost:5298/solo.html");
  await fresh.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("cubo-solo");
      req.onsuccess = req.onerror = req.onblocked = resolve;
    });
  });
  await fresh.reload();
  await fresh.waitForSelector(".session-current");
  await fresh.click("button[aria-label='Configurações']");
  await fresh.click("role=tab[name='Importar']");
  await fresh.fill("textarea[aria-label='JSON para importar']", "{ inválido");
  await fresh.click(".settings-tab button:text-is('Importar')");
  check((await fresh.textContent(".settings-tab .error")).includes("JSON válido"), "JSON inválido mostra erro");
  await fresh.fill("textarea[aria-label='JSON para importar']", JSON.stringify(exported));
  await fresh.click(".settings-tab button:text-is('Importar')");
  await fresh.waitForSelector(".settings-tab .muted:has-text('Importadas')");
  check(true, (await fresh.textContent(".settings-tab .row .muted")).trim());
  await shot(fresh, "07-import");
  await fresh.keyboard.press("Escape");
  await fresh.click(".session-current");
  const after = await fresh.$$eval(".session-list .session-number", (els) => els.map((e) => e.textContent));
  check(after.join(",") === "#2,#1", `sessões após importar mantêm os números: ${after.join(",")}`);

  // Links between the trainer and the solo timer; the trainer's timer tab also has the preview.
  await fresh.goto("http://localhost:5298/");
  await fresh.waitForFunction(() => /^[UDRLFB]/.test(document.querySelector(".scramble-text")?.textContent ?? ""), null, { timeout: 60_000 });
  check((await fresh.getAttribute("a.nav-link", "href")) === "solo.html", "trainer tem o link para o treino solo");
  check((await fresh.textContent(".scramble .start-position")).includes("verde na frente"), "timer do trainer mostra a posição inicial");
  await fresh.click("text=Ver no cubo");
  await fresh.waitForSelector("dialog[open] .preview-cube twisty-player", { timeout: 30_000 });
  check(true, "timer do trainer abre o cubo virtual do scramble");
  await fresh.keyboard.press("Escape");
  await fresh.click("a.nav-link");
  await fresh.waitForSelector(".solo-side");
  check(true, "link abre o treino solo");
  await fresh.click("a.nav-link:has-text('Trainer')");
  await fresh.waitForSelector(".app-header");
  check(true, "treino solo volta para o trainer");

  check(errors.length === 0, `sem erros no console${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
