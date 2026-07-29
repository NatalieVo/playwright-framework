const fs = require('fs');
const path = require('path');

const jsonPath = path.resolve(__dirname, '..', 'test-results.json');
const csvPath = path.resolve(__dirname, '..', 'test_run_report.csv');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const rows = [['File', 'Suite', 'Test Case', 'Status', 'Duration (ms)', 'Retries', 'Error Message']];

function walkSuite(suite, fileName) {
  for (const spec of suite.specs ?? []) {
    const suitePath = spec.titlePath ? spec.titlePath().slice(2, -1).join(' > ') : '';
    for (const test of spec.tests ?? []) {
      const lastResult = test.results[test.results.length - 1];
      const status = lastResult.status;
      const duration = lastResult.duration;
      const retries = test.results.length - 1;
      const errorMessage = lastResult.error?.message?.split('\n')[0] ?? '';
      rows.push([
        fileName,
        `${fileName} > ${suite.title}`,
        spec.title,
        status,
        duration,
        retries,
        errorMessage,
      ]);
    }
  }
  for (const child of suite.suites ?? []) {
    walkSuite(child, fileName);
  }
}

// The JSON reporter format nests: suites[].suites[].specs[] (file -> describe -> test)
function walkFile(fileSuite) {
  const fileName = fileSuite.title;
  for (const child of fileSuite.suites ?? []) {
    walkSuiteSimple(child, fileName);
  }
  for (const spec of fileSuite.specs ?? []) {
    walkSpec(spec, fileName, fileName);
  }
}

function walkSuiteSimple(suite, fileName, parentTitle) {
  const suiteTitle = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;
  for (const spec of suite.specs ?? []) {
    walkSpec(spec, fileName, suiteTitle);
  }
  for (const child of suite.suites ?? []) {
    walkSuiteSimple(child, fileName, suiteTitle);
  }
}

function walkSpec(spec, fileName, suiteTitle) {
  for (const test of spec.tests ?? []) {
    const lastResult = test.results[test.results.length - 1];
    const status = lastResult ? lastResult.status : 'skipped';
    const duration = lastResult ? lastResult.duration : 0;
    const retries = test.results.length > 0 ? test.results.length - 1 : 0;
    const errorMessage = stripAnsi(lastResult?.error?.message?.split('\n')[0] ?? '');
    rows.push([fileName, suiteTitle, spec.title, status, duration, retries, errorMessage]);
  }
}

for (const projectSuite of data.suites ?? []) {
  // top-level suites are per-file
  walkFile(projectSuite);
}

const csvContent = rows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
fs.writeFileSync(csvPath, csvContent, 'utf-8');

const total = rows.length - 1;
const passed = rows.filter((r) => r[3] === 'passed').length;
const failed = rows.filter((r) => r[3] === 'failed').length;
const skipped = rows.filter((r) => r[3] === 'skipped').length;
console.log(`Wrote ${total} rows to ${csvPath}`);
console.log(`passed=${passed} failed=${failed} skipped=${skipped}`);
