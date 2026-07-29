const fs = require('fs');
const path = require('path');

// Playwright auto-generates its own nested step for every locator.fill() call (e.g.
// `Fill "111111Aa" locator('#password')`) independently of any custom test.step() wrapper placed
// around it — masking the value in our own step title (see BasePage.fillSecret /
// FileListPage.fillDialogInputSecret) does not stop Playwright's own instrumentation from echoing
// the raw value one level deeper. Since changing how the value is actually entered into the field
// (e.g. via page.evaluate()) risks breaking real app behavior for framework-controlled inputs, this
// sanitizes the already-generated Allure result JSON instead — a reporting-only fix with zero
// effect on test execution.
const RESULTS_DIR = path.resolve(__dirname, '..', 'allure-results');
const MASKED_PARENT_PATTERN = /\(value masked for security\)/;
const FILL_STEP_PATTERN = /^(Fill\s+)"(.*)"(\s+.*)$/s;

function redactStepTree(step, insideMaskedParent) {
  const isMaskedParent = insideMaskedParent || MASKED_PARENT_PATTERN.test(step.name ?? '');
  if (isMaskedParent && typeof step.name === 'string') {
    const match = step.name.match(FILL_STEP_PATTERN);
    if (match) {
      step.name = `${match[1]}"••••••"${match[3]}`;
    }
  }
  for (const child of step.steps ?? []) {
    redactStepTree(child, isMaskedParent);
  }
}

function main() {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.log(`No allure-results directory at ${RESULTS_DIR} — nothing to redact.`);
    return;
  }

  const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('-result.json'));
  let redactedCount = 0;

  for (const file of files) {
    const filePath = path.join(RESULTS_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const before = JSON.stringify(data);
    for (const step of data.steps ?? []) {
      redactStepTree(step, false);
    }
    const after = JSON.stringify(data);
    if (before !== after) {
      fs.writeFileSync(filePath, after, 'utf-8');
      redactedCount++;
    }
  }

  console.log(`Redacted masked-password values in ${redactedCount} of ${files.length} Allure result file(s).`);
}

main();
