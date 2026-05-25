const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_DIRS = ['docs', 'blog'];
const FILE_EXTENSIONS = new Set(['.md', '.mdx']);

const warnings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    inspectFile(fullPath);
  }
}

function inspectFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceIndent = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const lineNumber = index + 1;

    if (/^```/.test(trimmed)) {
      const currentIndent = line.length - line.trimStart().length;
      inFence = !inFence;

      if (!inFence) {
        fenceIndent = 0;
        continue;
      }

      fenceIndent = currentIndent;

      const fenceLang = trimmed.slice(3).trim();
      if (fenceLang === 'Bash' || fenceLang === 'Shell' || fenceLang === 'c++' || fenceLang === 'C++') {
        warnings.push({
          filePath,
          lineNumber,
          message: `Use a stable fence language like ${normalizeFence(fenceLang)} instead of ${fenceLang}.`,
        });
      }

      continue;
    }

    if (inFence) {
      if (trimmed && !/^```/.test(trimmed)) {
        const contentIndent = line.length - line.trimStart().length;
        if (contentIndent < fenceIndent) {
          warnings.push({
            filePath,
            lineNumber,
            message: 'Code fence content is less indented than its opening fence. Typora may tolerate this, but Docusaurus can break the following layout.',
          });
        }
      }
      continue;
    }

    if (/^<(div|p|ul|li|h[1-6])\b/i.test(trimmed)) {
      warnings.push({
        filePath,
        lineNumber,
        message: 'Block HTML can render differently in Docusaurus than in Typora. Prefer Markdown or MDX components.',
      });
    }

    if (/^(Bash|Shell|JavaScript|Python|C\+\+|C|TypeScript)\s*$/.test(trimmed)) {
      const nextLine = lines[index + 1]?.trim() ?? '';
      const prevLine = lines[index - 1]?.trim() ?? '';
      if (/^```/.test(nextLine) || /^```/.test(prevLine)) {
        warnings.push({
          filePath,
          lineNumber,
          message: 'Do not use a standalone language label line above code fences. Put the language on the fence itself.',
        });
      }
    }
  }
}

function normalizeFence(fenceLang) {
  switch (fenceLang) {
    case 'Bash':
    case 'Shell':
      return '`bash`';
    case 'c++':
    case 'C++':
      return '`cpp`';
    default:
      return '`text`';
  }
}

for (const targetDir of TARGET_DIRS) {
  const fullDir = path.join(ROOT, targetDir);
  if (fs.existsSync(fullDir)) {
    walk(fullDir);
  }
}

if (warnings.length > 0) {
  console.error('Markdown compatibility issues found:\n');
  for (const warning of warnings) {
    const relativePath = path.relative(ROOT, warning.filePath);
    console.error(`- ${relativePath}:${warning.lineNumber} ${warning.message}`);
  }
  process.exit(1);
}

console.log('Markdown compatibility check passed.');
