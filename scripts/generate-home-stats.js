const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_DIRS = ['docs', 'blog'];
const OUTPUT_FILE = path.join(ROOT, 'src', 'data', 'home-stats.json');

function walkMarkdownFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkMarkdownFiles(fullPath, files);
      continue;
    }

    if (/\.(md|mdx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function compactNumber(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1).replace(/\.0$/, '')}m`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  }

  return String(value);
}

function createAnimatedStat(label, rawValue, detail, suffix = '') {
  return {
    label,
    value: `${compactNumber(rawValue)}${suffix}`,
    rawValue,
    suffix,
    detail,
  };
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

const markdownFiles = TARGET_DIRS.flatMap((dir) => {
  const fullDir = path.join(ROOT, dir);
  return fs.existsSync(fullDir) ? walkMarkdownFiles(fullDir) : [];
});

const stats = markdownFiles.reduce(
  (acc, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const fileStats = fs.statSync(filePath);

    acc.fileCount += 1;
    acc.lineCount += source.split(/\r?\n/).length;
    acc.charCount += source.length;
    acc.createdAtMs = Math.min(acc.createdAtMs, fileStats.birthtimeMs || fileStats.mtimeMs);

    return acc;
  },
  {
    fileCount: 0,
    lineCount: 0,
    charCount: 0,
    createdAtMs: Number.POSITIVE_INFINITY,
  }
);

const createdAt = Number.isFinite(stats.createdAtMs) ? new Date(stats.createdAtMs) : new Date();
const ageInYears = (Date.now() - createdAt.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

const payload = {
  generatedAt: new Date().toISOString(),
  createdAt: createdAt.toISOString(),
  summary: `${stats.fileCount} markdown files, ${compactNumber(stats.lineCount)} lines, ${compactNumber(stats.charCount)} characters.`,
  stats: [
    createAnimatedStat('Created', Number(ageInYears.toFixed(1)), `Since ${formatDate(createdAt)}`, 'y'),
    createAnimatedStat('Markdown Files', stats.fileCount, `${stats.fileCount} tracked notes`),
    createAnimatedStat('Lines Written', stats.lineCount, `${compactNumber(stats.charCount)} chars total`),
  ],
};

fs.mkdirSync(path.dirname(OUTPUT_FILE), {recursive: true});
fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`Generated home stats from ${stats.fileCount} markdown files.`);
