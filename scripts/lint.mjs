#!/usr/bin/env node
// Repository linter: validates plugin manifests, skill frontmatter, and relative
// Markdown links. Run with `node scripts/lint.mjs` from the repository root.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const errors = []

/**
 * Never linted. The vendored snapshots are verbatim upstream text whose links
 * resolve against docs.adonisjs.com, not this repository.
 */
const SKIP = [
  '.git',
  'node_modules',
  join('skills', 'adonisjs-best-practices', 'references', 'llms.txt'),
  join('skills', 'adonisjs-best-practices', 'references', 'llms-full.txt'),
]

const fail = (file, message) => errors.push(`${relative(root, file)}: ${message}`)

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (SKIP.some((s) => relative(root, full) === s)) continue
    if (statSync(full).isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

const allFiles = walk(root)

// ---------------------------------------------------------------- manifests

for (const manifest of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json']) {
  const path = join(root, manifest)
  if (!existsSync(path)) {
    errors.push(`${manifest}: missing`)
    continue
  }
  try {
    JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(path, `invalid JSON — ${error.message}`)
  }
}

const plugin = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'))
const marketplace = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'))

for (const field of ['name', 'description', 'version']) {
  if (!plugin[field]) fail(join(root, '.claude-plugin/plugin.json'), `missing "${field}"`)
}

// The two manifests describe the same plugin; drift between them installs the wrong version.
const listed = (marketplace.plugins ?? []).find((p) => p.name === plugin.name)
if (!listed) {
  fail(
    join(root, '.claude-plugin/marketplace.json'),
    `does not list plugin "${plugin.name}" declared in plugin.json`
  )
} else if (listed.version !== plugin.version) {
  fail(
    join(root, '.claude-plugin/marketplace.json'),
    `version ${listed.version} disagrees with plugin.json ${plugin.version}`
  )
}

// ------------------------------------------------------------------- skills

const skillsDir = join(root, 'skills')
for (const name of readdirSync(skillsDir)) {
  const skillFile = join(skillsDir, name, 'SKILL.md')
  if (!existsSync(skillFile)) {
    errors.push(`skills/${name}: no SKILL.md`)
    continue
  }
  const source = readFileSync(skillFile, 'utf8')
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatter) {
    fail(skillFile, 'missing YAML frontmatter')
    continue
  }
  const declared = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1].trim()
  const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1].trim()

  if (!declared) fail(skillFile, 'frontmatter missing "name"')
  else if (declared !== name) fail(skillFile, `frontmatter name "${declared}" != directory "${name}"`)

  if (!description) fail(skillFile, 'frontmatter missing "description"')
  else if (description.length < 40) fail(skillFile, 'description too short to route on')
}

// ------------------------------------------------------------------- links

const linkable = allFiles.filter((f) => f.endsWith('.md') || f.endsWith('.txt'))

for (const file of linkable) {
  const source = readFileSync(file, 'utf8')
  for (const [, text, target] of source.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue
    const [path] = target.split('#')
    if (!path) continue
    if (!existsSync(resolve(dirname(file), path))) {
      fail(file, `broken link [${text}] -> ${target}`)
    }
  }
}

// ------------------------------------------------------------------ report

if (errors.length) {
  console.error(`✗ ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n`)
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}

console.log(`✓ ${linkable.length} files linted, no problems`)
