// Reads David's real ~/.bash_profile and turns it into data our fake shell can use.
//
// IMPORTANT idea for learners: the browser cannot run bash. So we do NOT execute
// the file. We READ it (with regular expressions) and pull out the parts we
// understand: alias lines, export lines, and the prompt (PS1) template.
import type { Profile } from '../../types'
import bundledText from '../../data/bash_profile.txt?raw' // copy of the file, built into the app
import { HOME } from './fs'

// Always the newest version on GitHub (raw.githubusercontent.com allows browser requests).
export const PROFILE_URL = 'https://raw.githubusercontent.com/daydin14/dotfiles/master/.bash_profile'

/** Variables every shell has, even before the profile runs. */
export const DEFAULT_ENV: Record<string, string> = {
  HOME,
  USER: 'guest',
  HOSTNAME: 'xdav',
  SHELL: '/bin/bash',
  TERM: 'xterm-256color',
  LANG: 'en_US.UTF-8',
}

const FALLBACK_EMOJIS = ['🎮', '💾', '👻', '🐸', '🎲']

/** Download the profile. If GitHub is slow or offline, use the bundled copy instead. */
export async function loadProfile(): Promise<Profile> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000) // give up after 5 seconds
    const res = await fetch(PROFILE_URL, { signal: controller.signal, cache: 'no-cache' })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parseProfile(await res.text(), 'github')
  } catch {
    return parseProfile(bundledText, 'bundled')
  }
}

/**
 * Read one value after the `=` sign, the way bash would.
 *   'ls -la'   -> single quotes: literal text
 *   "a \$ b"   -> double quotes: a few backslash escapes (\$ \" \\ ) are removed
 *   plain      -> up to the first space or # comment
 */
function readValue(raw: string): { value: string; literal: boolean } {
  const s = raw.trim()
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1)
    return { value: s.slice(1, end === -1 ? undefined : end), literal: true }
  }
  if (s.startsWith('"')) {
    let out = ''
    for (let i = 1; i < s.length; i++) {
      const c = s[i]
      if (c === '"') break
      // Inside double quotes bash only removes the backslash before $ ` " \
      if (c === '\\' && '$`"\\'.includes(s[i + 1] ?? '')) {
        out += s[++i]
      } else {
        out += c
      }
    }
    return { value: out, literal: false }
  }
  return { value: s.split(/\s+#/)[0].split(/\s/)[0], literal: false }
}

/** Replace $NAME and ${NAME} using a lookup table. Unknown names become "". */
function expandVars(text: string, lookup: (name: string) => string | undefined): string {
  return text.replace(/\$\{(\w+)\}|\$(\w+)/g, (_m, a: string | undefined, b: string | undefined) => {
    return lookup((a ?? b) as string) ?? ''
  })
}

export function parseProfile(text: string, source: Profile['source']): Profile {
  const profile: Profile = {
    text,
    aliases: {},
    env: {},
    functions: [],
    emojis: [],
    ps1: null,
    ps1Locals: {},
    source,
  }

  // 1) Find every `name() { ... }` function. Its closing } is at the start of a line.
  const fnPattern = /^([A-Za-z_]\w*)\s*\(\)\s*\{\n([\s\S]*?)^\}/gm
  for (const m of text.matchAll(fnPattern)) {
    const [, name, body] = m
    profile.functions.push(name)

    // The emoji picker keeps its choices in a bash array: local emojis=("🎮" "💾" ...)
    const arr = /emojis=\(([^)]*)\)/.exec(body)
    if (arr) profile.emojis = [...arr[1].matchAll(/"([^"]*)"/g)].map((x) => x[1])

    // The function that does `export PS1="..."` is the one that builds the prompt.
    // Grab its `local color="..."` lines too, because the PS1 template uses them.
    if (/^\s*export\s+PS1=/m.test(body)) {
      for (const line of body.split('\n')) {
        const local = /^\s*local\s+(\w+)=(.*)$/.exec(line)
        if (local && !local[2].trim().startsWith('$(')) {
          profile.ps1Locals[local[1]] = readValue(local[2]).value
        }
        const ps1 = /^\s*export\s+PS1=(.*)$/.exec(line)
        if (ps1) profile.ps1 = readValue(ps1[1]).value
      }
    }
  }

  // 2) Everything outside functions: alias and export lines.
  const topLevel = text.replace(fnPattern, '')
  const lookup = (name: string) => profile.env[name] ?? DEFAULT_ENV[name]
  for (const line of topLevel.split('\n')) {
    const alias = /^\s*alias\s+([\w.-]+)=(.*)$/.exec(line)
    if (alias) {
      profile.aliases[alias[1]] = readValue(alias[2]).value
      continue
    }
    const exp = /^\s*(?:export\s+)?([A-Za-z_]\w*)=(.*)$/.exec(line)
    if (exp) {
      const { value, literal } = readValue(exp[2])
      if (exp[1] === 'PS1') profile.ps1 = value
      else profile.env[exp[1]] = literal ? value : expandVars(value, lookup)
    }
  }

  // 3) No emoji list found? Use a small default so the prompt still works.
  if (profile.emojis.length === 0) profile.emojis = FALLBACK_EMOJIS
  return profile
}

/** Things the prompt needs to know about the current moment. */
export interface PromptInfo {
  cwd: string // absolute path
  tildeCwd: string // same, shortened (~/projects)
  env: Record<string, string>
  branch: string | null // git branch if the cwd is inside a repo
}

/** Turn the PS1 template into the final text we print before you type. */
export function renderPrompt(profile: Profile, info: PromptInfo): string {
  const template = profile.ps1 ?? '\\u@\\h:\\w\\$ '
  const locals = profile.ps1Locals

  // Step A: fill in ${variables}.
  let out = expandVars(template, (name) => {
    if (name === 'emoji') {
      // In the real file this is `local emoji=$(random_emoji)`. We do the same thing: pick one.
      return profile.emojis[Math.floor(Math.random() * profile.emojis.length)]
    }
    if (name === 'git_part') {
      // In the real file this is built by git_prompt_info(). Our repos are always clean,
      // so we use the "clean" color (green) like the real prompt would.
      if (!info.branch) return ''
      const color = locals.green ?? ''
      const reset = locals.reset ?? ''
      return ` ${color}(${info.branch})${reset}`
    }
    return locals[name] ?? info.env[name] ?? ''
  })

  // Step B: bash prompt escapes. \w = folder, \u = user, \h = host, \033 = the ESC character.
  // \[ and \] only tell bash "this part takes no space", so we just remove them.
  const base = info.tildeCwd.split('/').pop() || info.tildeCwd
  out = out.replace(/\\(\[|\]|u|h|H|w|W|\$|n|r|e|a|\\|033|x1b)/g, (_m, c: string) => {
    switch (c) {
      case '[':
      case ']':
      case 'a':
        return ''
      case 'u':
        return info.env.USER
      case 'h':
      case 'H':
        return info.env.HOSTNAME
      case 'w':
        return info.tildeCwd
      case 'W':
        return base
      case '$':
        return '$'
      case 'n':
        return '\r\n'
      case 'r':
        return '\r'
      case '\\':
        return '\\'
      default:
        return '\x1b' // \e, \033, \x1b
    }
  })
  return out
}
