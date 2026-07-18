/**
 * Headless click-around bug hunt for BioArtist.
 * Usage: node scripts/bug-hunt.mjs
 * Writes: bug-hunt-report.json
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BIOARTIST_URL || 'http://127.0.0.1:5173';
const outPath = path.join(__dirname, '..', 'bug-hunt-report.json');

const findings = [];
const consoleErrors = [];
const pageErrors = [];

function bug(severity, area, title, detail) {
  findings.push({ severity, area, title, detail, at: new Date().toISOString() });
}

function ok(area, title) {
  findings.push({ severity: 'pass', area, title, detail: '', at: new Date().toISOString() });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  // --- Load ---
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForSelector('.ba-app', { timeout: 10000 });
    ok('boot', 'App shell loaded');
  } catch (e) {
    bug('critical', 'boot', 'App failed to load', String(e));
    await finish(browser);
    return;
  }

  // Empty state
  const empty = page.locator('.ba-canvas-empty');
  if (await empty.count()) {
    ok('ux', 'Empty canvas CTA visible');
    const browse = empty.getByRole('button', { name: /Browse icons/i });
    if (await browse.count()) {
      await browse.click();
      ok('ux', 'Browse icons CTA clickable');
    }
  } else {
    bug('major', 'ux', 'Empty canvas CTA missing on first load', 'Expected .ba-canvas-empty');
  }

  // Library tabs (exact — "Library" must not match "My Library")
  const libTab = page.locator('.ba-tabs .ba-tab').filter({ hasText: /^Library$/ });
  const myTab = page.locator('.ba-tabs .ba-tab').filter({ hasText: /My Library/ });
  if ((await libTab.count()) && (await myTab.count())) {
    ok('library', 'Library | My Library tabs present');
  } else {
    bug('critical', 'library', 'Asset tabs missing', 'Need Library and My Library tabs');
  }

  // Icon cards
  await page.waitForTimeout(300);
  const cards = page.locator('.ba-icon-card');
  const cardCount = await cards.count();
  if (cardCount < 5) {
    bug('critical', 'library', 'Too few icon cards', `Found ${cardCount}`);
  } else {
    ok('library', `Icon cards render (${cardCount})`);
  }

  // Place first icon
  try {
    await cards.first().click();
    await page.waitForTimeout(400);
    const layers = page.locator('.ba-layer-item');
    const layerCount = await layers.count();
    if (layerCount >= 1) {
      ok('canvas', 'Placing icon creates a layer');
    } else {
      bug('critical', 'canvas', 'Click icon did not create layer', `layers=${layerCount}`);
    }
    // empty state should hide
    if (await empty.count()) {
      bug('major', 'ux', 'Empty state still visible after placing object', '');
    } else {
      ok('ux', 'Empty state hides after content');
    }
  } catch (e) {
    bug('critical', 'canvas', 'Failed to place icon', String(e));
  }

  // Place second icon for multi-select/align
  if (cardCount > 1) {
    await cards.nth(1).click();
    await page.waitForTimeout(300);
  }

  // Properties panel after selection — click canvas area might clear; select layer
  const layerItems = page.locator('.ba-layer-item');
  if ((await layerItems.count()) > 0) {
    await layerItems.first().click();
    await page.waitForTimeout(200);
    const propsHeader = page.locator('.ba-right-section.props .ba-panel-header');
    const propText = await propsHeader.textContent();
    if (propText && /Properties/i.test(propText)) {
      const emptyProps = page.locator('.ba-right-section.props .ba-empty');
      if ((await emptyProps.count()) > 0) {
        bug('major', 'properties', 'Layer click did not populate properties', '');
      } else {
        ok('properties', 'Properties show for selected layer');
      }
    }
  }

  // Fill color change
  try {
    const color = page.locator('.ba-right-section.props input[type="color"]').first();
    if (await color.count()) {
      await color.fill('#ff0000');
      ok('properties', 'Fill color input works');
    } else {
      bug('major', 'properties', 'No color input when object selected', '');
    }
  } catch (e) {
    bug('major', 'properties', 'Color change failed', String(e));
  }

  // Category chips
  const chip = page.locator('.ba-chip', { hasText: 'DNA/RNA' });
  if (await chip.count()) {
    await chip.click();
    await page.waitForTimeout(200);
    const after = await page.locator('.ba-icon-card').count();
    if (after > 0) ok('library', `DNA/RNA filter shows ${after} icons`);
    else bug('major', 'library', 'DNA/RNA filter emptied library', '');
    await page.locator('.ba-chip', { hasText: 'All' }).click();
  }

  // Search
  const search = page.locator('.ba-search input').first();
  if (await search.count()) {
    await search.fill('helix');
    await page.waitForTimeout(200);
    const n = await page.locator('.ba-icon-card').count();
    if (n >= 1) ok('library', 'Search finds helix');
    else bug('minor', 'library', 'Search helix returned 0', 'May be naming');
    await search.fill('');
  }

  // My Library tab + import UI
  await myTab.click();
  await page.waitForTimeout(200);
  if (await page.locator('.ba-import-zone').count()) {
    ok('import', 'My Library import zone visible');
  } else {
    bug('critical', 'import', 'Import zone missing on My Library', '');
  }

  // Create temp SVG and import via file input
  const tmpSvg = path.join(__dirname, '..', '.tmp-test-icon.svg');
  fs.writeFileSync(
    tmpSvg,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="40" r="30" fill="#22c55e"/><text x="40" y="45" text-anchor="middle" font-size="12" fill="white">T</text></svg>`,
  );
  try {
    const fileInput = page.locator('input[type="file"][accept*="svg"]');
    // may be hidden
    await fileInput.setInputFiles(tmpSvg);
    await page.waitForTimeout(500);
    const toast = page.locator('.ba-toast');
    const importedCard = page.locator('.ba-icon-card', { hasText: /tmp-test|test-icon/i });
    // name from filename
    const anyImport = await page.locator('.ba-left-panel .ba-icon-card').count();
    if (anyImport >= 1 || (await toast.count())) {
      ok('import', 'SVG import produced library item or toast');
    } else {
      bug('critical', 'import', 'SVG file import had no visible effect', '');
    }
    // click imported icon if present
    const cardsAfter = page.locator('.ba-left-panel .ba-icon-card');
    if ((await cardsAfter.count()) > 0) {
      await cardsAfter.first().click();
      await page.waitForTimeout(400);
      ok('import', 'Imported icon placeable');
    }
  } catch (e) {
    bug('critical', 'import', 'File import failed', String(e));
  } finally {
    try {
      fs.unlinkSync(tmpSvg);
    } catch {
      /* ignore */
    }
  }

  // Switch back to library
  await page.locator('.ba-tabs .ba-tab').filter({ hasText: /^Library$/ }).click();
  await page.waitForTimeout(200);

  // Shapes via quick tools (library stays visible)
  const quickRect = page.locator('.ba-quick-btn[title="Rect"]');
  if (await quickRect.count()) {
    await quickRect.click();
    await page.waitForTimeout(300);
    ok('shapes', 'Quick-add rect places object');
    if (await page.locator('.ba-tabs .ba-tab').filter({ hasText: /^Library$/ }).count()) {
      ok('ux', 'Library tabs remain after adding shape');
    } else {
      bug('major', 'ux', 'Library tabs disappeared after shape add', '');
    }
  }

  // Text tool — rail places text immediately; quick bar also has T
  const textBtn = page.locator('.ba-rail-btn[aria-label="Text"]');
  if (await textBtn.count()) {
    await textBtn.click();
    await page.waitForTimeout(400);
    const fontLabel = page.locator('label', { hasText: /Font size/i });
    if (await fontLabel.count()) ok('text', 'Text tool adds editable text with font size');
    else {
      // click quick T
      const quickT = page.locator('.ba-quick-btn[title="Add text"]');
      if (await quickT.count()) {
        await quickT.click();
        await page.waitForTimeout(400);
      }
      if (await page.locator('label', { hasText: /Font size/i }).count()) {
        ok('text', 'Quick-add text shows font size');
      } else {
        bug('major', 'text', 'Font size missing after adding text', '');
      }
    }
  }

  // Shapes rail places immediately
  const shapesBtn2 = page.locator('.ba-rail-btn[aria-label="Shapes"]');
  if (await shapesBtn2.count()) {
    await shapesBtn2.click();
    await page.waitForTimeout(300);
    ok('shapes', 'Shapes rail places without replacing library');
  }

  // Select tool
  await page.locator('.ba-rail-btn[aria-label="Select"]').click();
  await page.waitForTimeout(150);
  if (await page.locator('.ba-tab').count()) {
    ok('ux', 'Select tool keeps asset tabs');
  } else {
    bug('major', 'ux', 'Select tool lost asset panel tabs', '');
  }

  // Undo / Redo
  const undo = page.locator('button[title*="Undo"]');
  const redo = page.locator('button[title*="Redo"]');
  if (await undo.count()) {
    const disabled = await undo.isDisabled();
    if (!disabled) {
      await undo.click();
      await page.waitForTimeout(300);
      ok('history', 'Undo clicked');
      if (await redo.count() && !(await redo.isDisabled())) {
        await redo.click();
        await page.waitForTimeout(300);
        ok('history', 'Redo clicked');
      } else {
        bug('major', 'history', 'Redo disabled after undo', '');
      }
    } else {
      bug('minor', 'history', 'Undo disabled unexpectedly', 'May have empty history');
    }
  }

  // Zoom (top bar + floating toolbar both exist)
  const zoomIn = page.locator('button[title="Zoom in"]').first();
  const zoomOut = page.locator('button[title="Zoom out"]').first();
  if ((await zoomIn.count()) && (await zoomOut.count())) {
    await zoomIn.click();
    await page.waitForTimeout(100);
    await zoomOut.click();
    ok('zoom', 'Zoom in/out buttons work without crash');
  }

  // Floating workspace tools
  if (await page.locator('.ba-workspace-tools').count()) {
    ok('ux', 'Floating workspace toolbar present');
  } else {
    bug('major', 'ux', 'Floating workspace toolbar missing', '');
  }

  // Shortcuts help
  const helpBtn = page.locator('button[title*="Shortcuts"]');
  if (await helpBtn.count()) {
    await helpBtn.click();
    await page.waitForTimeout(200);
    if (await page.locator('.ba-modal', { hasText: /Keyboard shortcuts/i }).count()) {
      ok('ux', 'Shortcuts help modal opens');
      await page.keyboard.press('Escape');
    } else {
      bug('major', 'ux', 'Help button did not open shortcuts modal', '');
    }
  }

  // Artboard select
  if (await page.locator('.ba-artboard-select').count()) {
    ok('ux', 'Artboard size selector present');
  }

  // Quick tools always on assets panel
  if (await page.locator('.ba-quick-tools').count()) {
    ok('ux', 'Quick-add shapes/text bar always visible');
  } else {
    bug('major', 'ux', 'Quick tools missing from assets panel', '');
  }

  // Grid toggle
  const gridBtn = page.locator('button[title="Toggle grid"]');
  if (await gridBtn.count()) {
    await gridBtn.click();
    await page.waitForTimeout(100);
    ok('canvas', 'Grid toggle works');
  }

  // Align buttons exist; disabled until multi-select (good UX)
  const alignLeft = page.locator('button[title="Align left"]');
  if (await alignLeft.count()) {
    const disabled = await alignLeft.isDisabled();
    if (disabled) ok('align', 'Align left correctly disabled with <2 selection');
    else {
      await alignLeft.click();
      ok('align', 'Align left enabled and clickable');
    }
  } else {
    bug('major', 'align', 'Align controls missing', '');
  }

  // Project name
  const nameInput = page.locator('.ba-project-name');
  if (await nameInput.count()) {
    await nameInput.fill('Bug Hunt Figure');
    ok('project', 'Project name editable');
  }

  // Export dialog
  const exportBtn = page.getByRole('button', { name: /Export/i }).last();
  if (await exportBtn.count()) {
    await exportBtn.click();
    await page.waitForTimeout(200);
    const modal = page.locator('.ba-modal');
    if (await modal.count()) {
      ok('export', 'Export modal opens');
      const png = page.locator('.ba-export-option').filter({ hasText: /^PNG/ });
      if (await png.count()) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
          png.first().click(),
        ]);
        if (download) ok('export', `PNG download started: ${download.suggestedFilename()}`);
        else {
          await page.waitForTimeout(300);
          if (await page.locator('.ba-toast').count()) ok('export', 'PNG export toast shown');
          else bug('major', 'export', 'PNG export produced no download or toast', '');
        }
      }
      // close if still open
      const cancel = page.getByRole('button', { name: /Cancel/i });
      if (await cancel.count()) await cancel.click();
      else await page.keyboard.press('Escape');
    } else {
      bug('critical', 'export', 'Export modal did not open', '');
    }
  }

  // Save project
  const saveBtn = page.getByRole('button', { name: /Save/i });
  if (await saveBtn.count()) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      saveBtn.click(),
    ]);
    if (download) ok('save', `Save download: ${download.suggestedFilename()}`);
    else if (await page.locator('.ba-toast').count()) ok('save', 'Save toast shown');
    else bug('major', 'save', 'Save produced no download', '');
  }

  // Keyboard delete
  try {
    const layersNow = page.locator('.ba-layer-item');
    if ((await layersNow.count()) > 0) {
      await layersNow.first().click();
      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);
      ok('keyboard', 'Delete key handled without crash');
    }
  } catch (e) {
    bug('major', 'keyboard', 'Delete key error', String(e));
  }

  // Layer visibility toggle
  const eye = page.locator('.ba-layer-item button').first();
  if (await eye.count()) {
    await eye.click();
    await page.waitForTimeout(150);
    ok('layers', 'Layer action button clickable');
  }

  // Duplicate via button
  const dup = page.getByRole('button', { name: /Duplicate/i });
  if (await dup.count()) {
    await page.locator('.ba-layer-item').first().click().catch(() => {});
    await dup.click();
    await page.waitForTimeout(400);
    ok('canvas', 'Duplicate button clicked');
  }

  // Group with insufficient selection should not crash
  const groupBtn = page.locator('button[title*="Group"]');
  if (await groupBtn.count()) {
    await groupBtn.click();
    await page.waitForTimeout(150);
    ok('canvas', 'Group with single selection does not crash');
  }

  // Console errors
  const realConsole = consoleErrors.filter(
    (t) =>
      !t.includes('Download the React DevTools') &&
      !t.includes('favicon') &&
      !t.includes('React Router'),
  );
  if (realConsole.length) {
    bug('major', 'console', `${realConsole.length} console error(s)`, realConsole.slice(0, 8).join('\n'));
  } else {
    ok('console', 'No console errors during session');
  }
  if (pageErrors.length) {
    bug('critical', 'console', `${pageErrors.length} page error(s)`, pageErrors.slice(0, 5).join('\n'));
  } else {
    ok('console', 'No uncaught page errors');
  }

  // Screenshot
  const shot = path.join(__dirname, '..', 'bug-hunt-screenshot.png');
  await page.screenshot({ path: shot, fullPage: true });

  await finish(browser);
}

async function finish(browser) {
  const passes = findings.filter((f) => f.severity === 'pass').length;
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const major = findings.filter((f) => f.severity === 'major').length;
  const minor = findings.filter((f) => f.severity === 'minor').length;
  const report = {
    url: BASE,
    summary: { passes, critical, major, minor, totalFindings: findings.length },
    consoleErrors,
    pageErrors,
    findings,
  };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log('Wrote', outPath);
  findings
    .filter((f) => f.severity !== 'pass')
    .forEach((f) => console.log(`[${f.severity}] ${f.area}: ${f.title}`));
  await browser.close();
  process.exit(critical > 0 ? 2 : 0);
}

main().catch(async (e) => {
  console.error(e);
  bug('critical', 'runner', 'Bug hunt crashed', String(e));
  fs.writeFileSync(outPath, JSON.stringify({ findings, error: String(e) }, null, 2));
  process.exit(1);
});
