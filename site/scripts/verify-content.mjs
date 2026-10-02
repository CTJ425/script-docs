/**
 * What must be true of the repository before the site is built.
 *
 * The build itself rejects a malformed frontmatter or a README at the wrong
 * depth; this adds the rules that are about *intent* rather than shape, and that
 * would otherwise only show up as a page that is subtly wrong.
 *
 *   node scripts/verify-content.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ageOf } from '../src/lib/design.mjs';
import { REPO_ROOT, REVISION_LINE, loadScriptSources, siteIdentity } from './content-sources.mjs';

let failures = 0;
const check = (label, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');
const today = new Date();

console.log('\n=== the product has one name');
{
  const { name, tagline } = siteIdentity();
  check('the root README names the product (its H1)', name.length > 0 && name !== 'site', JSON.stringify(name));
  check('the root README opens with a tagline', tagline.length > 0, JSON.stringify(tagline));
  const root = read('README.md');
  check('the root README carries a revision date', REVISION_LINE.test(root));
}

console.log('\n=== the rules files are one file');
{
  const [a, b, c] = ['CLAUDE.md', '.cursorrules', '.windsurfrules'].map(read);
  check('CLAUDE.md, .cursorrules and .windsurfrules are byte-identical', a === b && b === c);
}

console.log('\n=== scripts: the README is the page');
{
  const scripts = loadScriptSources();
  check('at least one script is published', scripts.length > 0, `${scripts.length}`);
  for (const s of scripts) {
    const onDisk = read(s.file);
    check(`${s.slug}: loaded bytes === file on disk`, s.body === onDisk && s.bytes === Buffer.byteLength(onDisk));

    const lines = onDisk.split('\n');
    const h1 = lines.findIndex((l) => /^#\s+\S/.test(l));
    check(`${s.slug}: starts with an H1`, h1 === 0, h1 === -1 ? 'no H1' : `H1 on line ${h1 + 1}`);

    // Directly under the H1, ignoring one blank line: the dateline.
    const next = lines.slice(h1 + 1).find((l) => l.trim() !== '');
    const stamped = next !== undefined && REVISION_LINE.test(next);
    check(`${s.slug}: a "> 最後更新：YYYY-MM-DD" line sits under the H1`, stamped);

    if (s.updated) {
      const age = ageOf(s.updated, today);
      check(`${s.slug}: the revision date is real and not in the future`, age !== null && new Date(`${s.updated}T00:00:00Z`) <= today, s.updated);
    }
  }
}

console.log('\n=== posts, tools, pages: the file is the entry');
{
  const frontmatter = (src) => src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  for (const [dir, h1Rule] of [['posts', true], ['tools', true], ['pages', true]]) {
    if (!existsSync(join(REPO_ROOT, dir))) continue;
    for (const file of readdirSync(join(REPO_ROOT, dir)).filter((f) => f.endsWith('.md')).sort()) {
      const rel = `${dir}/${file}`;
      const src = read(rel);
      const m = frontmatter(src);
      check(`${rel}: has frontmatter`, Boolean(m));
      if (!m) continue;

      if (dir !== 'pages') {
        check(`${rel}: the filename is a slug (it becomes the URL)`, /^[a-z0-9][a-z0-9-]*\.md$/.test(file));
      }
      // The title comes from the frontmatter and the page template prints it as
      // the H1; a second H1 in the body would be a second title.
      if (h1Rule) check(`${rel}: the body has no H1 (the title is in the frontmatter)`, !/^#\s+\S/m.test(m[2].replace(/```[\s\S]*?```/g, '')));
      check(`${rel}: has a title`, /^title:\s*\S/m.test(m[1]));
    }
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall content checks passed');
process.exit(failures ? 1 : 0);
