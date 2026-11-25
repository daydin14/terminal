// The Shell is the "brain": it remembers where you are (cwd), runs the line you
// typed, builds the prompt, and loads ~/.bash_profile. It never touches xterm
// directly, only the tiny `Output` interface below. That keeps it easy to test.
import type { DirNode, Profile, ShellContext } from '../../types'
import { projects } from '../../data/projects'
import { buildFs, findRepo, getNode, HOME, resolvePath, tildePath } from './fs'
import { commands, findCommand } from './commands'
import { parseLine } from './parse'
import { DEFAULT_ENV, loadProfile, renderPrompt } from './profile'

/** The only things the shell needs from the screen. xterm's Terminal already has all three. */
export interface Output {
  write: (data: string) => void
  readonly cols: number
}

export class Shell {
  cwd = HOME
  history: string[] = []
  env: Record<string, string> = { ...DEFAULT_ENV }
  aliases: Record<string, string> = {}
  profile: Profile | null = null
  fs: DirNode
  private out: Output
  private openUrl: (url: string) => void

  constructor(out: Output, openUrl: (url: string) => void) {
    this.out = out
    this.openUrl = openUrl
    // Start with the bundled profile's data; start() replaces it with the GitHub version.
    this.fs = { type: 'dir', children: {} }
  }

  /** Show the banner and load the profile. The line editor waits for this to finish. */
  async start() {
    this.println('\x1b[1mXDAV terminal\x1b[0m  (a pretend shell, running in your browser)')
    this.write('Loading ~/.bash_profile from github.com/daydin14/dotfiles ... ')
    await this.applyProfile()
    this.println('Type \x1b[36mhelp\x1b[0m to get started.\n')
  }

  /** Download + parse the profile, then copy its aliases/env into the shell. */
  private async applyProfile() {
    const profile = await loadProfile()
    this.profile = profile
    this.env = { ...DEFAULT_ENV, ...profile.env }
    this.aliases = { ...profile.aliases }
    this.fs = buildFs(projects, profile)
    const where = profile.source === 'github' ? 'loaded from GitHub' : 'GitHub unreachable, used the bundled copy'
    this.println(`${where}.`)
    this.println(
      `  ${Object.keys(profile.aliases).length} aliases, ${Object.keys(profile.env).length} exports, ` +
        `prompt ${profile.ps1 ? 'found' : 'not found (using default)'}`,
    )
  }

  // ---- output helpers (convert \n to \r\n, because a terminal needs both) ----
  write = (text: string) => this.out.write(text.replace(/\r?\n/g, '\r\n'))
  println = (text = '') => this.write(text + '\n')
  clear = () => this.out.write('\x1b[3J\x1b[H\x1b[2J') // wipe scrollback, go home, wipe screen

  /** Build the text printed before each command, e.g. "🎮・XDAV: ~/projects (master) $ ". */
  prompt(): string {
    if (!this.profile) return '$ '
    const repo = findRepo(this.fs, this.cwd)
    return renderPrompt(this.profile, {
      cwd: this.cwd,
      tildeCwd: tildePath(this.cwd),
      env: this.env,
      branch: repo ? repo.branch : null,
    })
  }

  private makeContext(): ShellContext {
    return {
      cwd: this.cwd,
      setCwd: (path) => {
        this.cwd = path
        this.env.PWD = path
      },
      write: this.write,
      println: this.println,
      env: this.env,
      aliases: this.aliases,
      history: this.history,
      fs: this.fs,
      projects,
      clear: this.clear,
      reloadProfile: async () => {
        this.write('Reloading ~/.bash_profile ... ')
        await this.applyProfile()
      },
      openUrl: this.openUrl,
      commandNames: () => commands.map((c) => c.name),
    }
  }

  /** Run one line of input (it may contain several commands joined by ; or &&). */
  async run(line: string): Promise<void> {
    let lastCode = 0
    for (const seg of parseLine(line, this.env)) {
      if (seg.join === 'and' && lastCode !== 0) continue // `a && b`: skip b if a failed

      let words = seg.words
      // Alias: if the first word is an alias, swap it for its text (once, so no loops).
      const aliasText = this.aliases[words[0]]
      if (aliasText !== undefined) {
        const first = parseLine(aliasText, this.env)[0]
        words = [...(first ? first.words : []), ...words.slice(1)]
      }
      if (words.length === 0) continue

      const [name, ...args] = words
      const command = findCommand(name)
      if (!command) {
        this.println(`bash: ${name}: command not found`)
        lastCode = 127
        continue
      }
      try {
        lastCode = (await command.run(args, this.makeContext())) ?? 0
      } catch (err) {
        this.println(`bash: ${name}: ${err instanceof Error ? err.message : 'something went wrong'}`)
        lastCode = 1
      }
    }
  }

  /**
   * Tab completion. `before` is the text left of the cursor.
   * Returns where the word being completed starts and every full replacement for it.
   */
  complete(before: string): { start: number; options: string[] } {
    const start = before.lastIndexOf(' ') + 1
    const word = before.slice(start)
    const prior = before.slice(0, start).trim()
    const isFirstWord = prior === '' || /(;|&&)$/.test(prior)

    if (isFirstWord) {
      const names = [...commands.map((c) => c.name), ...Object.keys(this.aliases)]
      return { start, options: [...new Set(names)].filter((n) => n.startsWith(word)).sort() }
    }
    if (prior === 'open') {
      return { start, options: projects.map((p) => p.slug).filter((s) => s.startsWith(word)) }
    }
    // Otherwise complete file and folder names.
    const slash = word.lastIndexOf('/')
    const dirPart = word.slice(0, slash + 1) // "projects/" or "" or "~/"
    const namePart = word.slice(slash + 1)
    const dir = getNode(this.fs, resolvePath(this.cwd, dirPart || '.'))
    if (!dir || dir.type !== 'dir') return { start, options: [] }
    const options = Object.keys(dir.children)
      .filter((n) => n.startsWith(namePart) && (namePart.startsWith('.') || !n.startsWith('.')))
      .sort()
      .map((n) => dirPart + n + (dir.children[n].type === 'dir' ? '/' : ''))
    return { start, options }
  }
}
