// The command registry: a list of { name, help, run } objects.
// To add a command, add one object to the `commands` array. Nothing else to change.
//
// Every run() receives:
//   args = the words after the command name   (for "ls -a projects", args = ['-a', 'projects'])
//   ctx  = helpers: ctx.println(), ctx.cwd, ctx.fs, ctx.env ...
// Return 0 (or nothing) when it worked, or a non-zero number when it failed.
import type { Command, ShellContext } from '../../types'
import { findRepo, getNode, resolvePath, HOME } from './fs'

// ANSI color codes (xterm understands these). \x1b is the ESC character.
const BLUE = '\x1b[1;34m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

/** Print an error the way bash does and return a failing exit code. */
function fail(ctx: ShellContext, message: string, code = 1): number {
  ctx.println(`bash: ${message}`)
  return code
}

/** Look up a project by slug or by name, ignoring upper/lower case. */
function findProject(ctx: ShellContext, query: string) {
  const q = query.toLowerCase().replace(/[\s_]+/g, '-')
  return ctx.projects.find((p) => p.slug.toLowerCase() === q || p.name.toLowerCase().replace(/\s+/g, '-') === q)
}

export const commands: Command[] = [
  {
    name: 'help',
    help: 'show this list',
    run: (_args, ctx) => {
      ctx.println('Commands:')
      for (const c of commands) ctx.println(`  ${CYAN}${c.name.padEnd(10)}${RESET} ${c.help}`)
      ctx.println('')
      ctx.println(`${DIM}Tips: Tab completes, ↑/↓ shows history, Ctrl+C cancels, Ctrl+L clears.${RESET}`)
      ctx.println(`${DIM}Not supported: pipes (|), redirects (>) and scripting. This is a demo shell.${RESET}`)
      ctx.println(`${DIM}Try: ls projects, cd projects/dotfiles, git log, open file-converter${RESET}`)
    },
  },
  {
    name: 'ls',
    help: 'list files   (ls [-a] [-l] [path])',
    run: (args, ctx) => {
      const flags = args.filter((a) => a.startsWith('-')).join('')
      const paths = args.filter((a) => !a.startsWith('-'))
      let code = 0
      for (const target of paths.length ? paths : ['.']) {
        const node = getNode(ctx.fs, resolvePath(ctx.cwd, target))
        if (!node) {
          code = fail(ctx, `ls: cannot access '${target}': No such file or directory`, 2)
          continue
        }
        if (paths.length > 1) ctx.println(`${target}:`)
        if (node.type === 'file') {
          ctx.println(target)
          continue
        }
        const names = Object.keys(node.children)
          .filter((n) => flags.includes('a') || !n.startsWith('.'))
          .sort((a, b) => a.localeCompare(b))
        const label = (n: string) => {
          const child = node.children[n]
          return child.type === 'dir' ? `${BLUE}${n}${RESET}` : n
        }
        if (flags.includes('l')) {
          for (const n of names) {
            const child = node.children[n]
            const size = child.type === 'file' ? child.content.length : 4096
            ctx.println(`${child.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'} guest ${String(size).padStart(6)} ${label(n)}`)
          }
        } else {
          ctx.println(names.map(label).join('  '))
        }
      }
      return code
    },
  },
  {
    name: 'cd',
    help: 'change folder   (cd [path])',
    run: (args, ctx) => {
      const target = args[0] ?? '~'
      const path = resolvePath(ctx.cwd, target === '~' ? HOME : target)
      const node = getNode(ctx.fs, path)
      if (!node) return fail(ctx, `cd: ${target}: No such file or directory`)
      if (node.type !== 'dir') return fail(ctx, `cd: ${target}: Not a directory`)
      ctx.setCwd(path)
    },
  },
  {
    name: 'pwd',
    help: 'print the current folder',
    run: (_args, ctx) => ctx.println(ctx.cwd),
  },
  {
    name: 'cat',
    help: 'show a file   (cat ~/.bash_profile)',
    run: (args, ctx) => {
      if (args.length === 0) return fail(ctx, 'cat: missing file name')
      let code = 0
      for (const target of args) {
        const node = getNode(ctx.fs, resolvePath(ctx.cwd, target))
        if (!node) code = fail(ctx, `cat: ${target}: No such file or directory`)
        else if (node.type === 'dir') code = fail(ctx, `cat: ${target}: Is a directory`)
        else ctx.write(node.content.endsWith('\n') ? node.content : node.content + '\n')
      }
      return code
    },
  },
  {
    name: 'echo',
    help: 'print text   (echo hi $USER)',
    run: (args, ctx) => {
      const noNewline = args[0] === '-n'
      const text = (noNewline ? args.slice(1) : args).join(' ')
      if (noNewline) ctx.write(text)
      else ctx.println(text)
    },
  },
  {
    name: 'clear',
    help: 'clear the screen (or press Ctrl+L)',
    run: (_args, ctx) => ctx.clear(),
  },
  {
    name: 'whoami',
    help: 'print your user name',
    run: (_args, ctx) => ctx.println(ctx.env.USER),
  },
  {
    name: 'alias',
    help: 'list aliases from ~/.bash_profile (or alias x=\'y\')',
    run: (args, ctx) => {
      if (args.length === 0) {
        for (const [name, value] of Object.entries(ctx.aliases)) ctx.println(`alias ${name}='${value}'`)
        return
      }
      for (const arg of args) {
        const eq = arg.indexOf('=')
        if (eq > 0) ctx.aliases[arg.slice(0, eq)] = arg.slice(eq + 1)
        else if (ctx.aliases[arg] !== undefined) ctx.println(`alias ${arg}='${ctx.aliases[arg]}'`)
        else return fail(ctx, `alias: ${arg}: not found`)
      }
    },
  },
  {
    name: 'unalias',
    help: 'remove an alias   (unalias name)',
    run: (args, ctx) => {
      for (const name of args) delete ctx.aliases[name]
    },
  },
  {
    name: 'env',
    help: 'list variables from ~/.bash_profile (also: printenv NAME)',
    run: (_args, ctx) => {
      for (const [k, v] of Object.entries(ctx.env).sort()) ctx.println(`${k}=${v}`)
    },
  },
  {
    name: 'printenv',
    help: 'print one variable   (printenv HOME)',
    run: (args, ctx) => {
      if (args.length === 0) return commands.find((c) => c.name === 'env')?.run([], ctx)
      const v = ctx.env[args[0]]
      if (v === undefined) return 1
      ctx.println(v)
    },
  },
  {
    name: 'export',
    help: 'set a variable   (export NAME=value)',
    run: (args, ctx) => {
      for (const arg of args) {
        const eq = arg.indexOf('=')
        if (eq > 0) ctx.env[arg.slice(0, eq)] = arg.slice(eq + 1)
      }
    },
  },
  {
    name: 'history',
    help: 'show the commands you typed',
    run: (_args, ctx) => {
      ctx.history.forEach((line, i) => ctx.println(`${String(i + 1).padStart(4)}  ${line}`))
    },
  },
  {
    name: 'git',
    help: 'git status | git log [--oneline] [-n N] | git branch',
    run: (args, ctx) => {
      const repo = findRepo(ctx.fs, ctx.cwd)
      if (!repo) {
        ctx.println('fatal: not a git repository (try: cd ~/projects/dotfiles)')
        return 128
      }
      const sub = args[0]
      if (sub === 'status') {
        ctx.println(`On branch ${repo.branch}`)
        ctx.println(`Your branch is up to date with 'origin/${repo.branch}'.\n`)
        ctx.println('nothing to commit, working tree clean')
      } else if (sub === 'branch') {
        ctx.println(`${GREEN}* ${repo.branch}${RESET}`)
      } else if (sub === 'log') {
        const oneline = args.includes('--oneline')
        // -n 3, -3 and --max-count=3 all mean "only 3 commits"
        let limit = repo.log.length
        args.forEach((a, i) => {
          const m = /^-(\d+)$/.exec(a) ?? /^--max-count=(\d+)$/.exec(a) ?? (a === '-n' ? [a, args[i + 1]] : null)
          if (m && Number(m[1]) > 0) limit = Number(m[1])
        })
        repo.log.slice(0, limit).forEach((c, i) => {
          if (oneline) {
            ctx.println(`${YELLOW}${c.hash.slice(0, 7)}${RESET} ${c.message}`)
          } else {
            const refs = i === 0 ? ` (${CYAN}HEAD -> ${GREEN}${repo.branch}${RESET}${YELLOW}, ${RESET}\x1b[31morigin/${repo.branch}${RESET}${YELLOW})` : ''
            ctx.println(`${YELLOW}commit ${c.hash}${RESET}${refs}`)
            ctx.println(`Author: ${c.author}`)
            ctx.println(`Date:   ${c.date}\n`)
            ctx.println(`    ${c.message}\n`)
          }
        })
      } else {
        ctx.println(`git: '${sub ?? ''}' is not supported in this demo. Try: status, log, branch`)
        return 1
      }
    },
  },
  {
    name: 'open',
    help: 'open a project in a new tab   (open file-converter [repo])',
    run: (args, ctx) => {
      // With no name, open the project of the folder you are standing in.
      const query = args[0] ?? findRepo(ctx.fs, ctx.cwd)?.slug
      if (!query) {
        ctx.println('Usage: open <project> [repo]      Projects:')
        for (const p of ctx.projects) ctx.println(`  ${CYAN}${p.slug.padEnd(20)}${RESET} ${p.description}`)
        return
      }
      const project = findProject(ctx, query)
      if (!project) return fail(ctx, `open: no project called '${query}'. Type "open" to see the list.`)
      const url = args[1] === 'repo' || !project.live ? project.repo : project.live
      ctx.println(`Opening ${url}`)
      ctx.openUrl(url)
    },
  },
  {
    name: 'source',
    help: 'reload ~/.bash_profile from GitHub   (source ~/.bash_profile)',
    run: async (args, ctx) => {
      // Real bash re-runs the file. We re-download and re-read it.
      const target = args[0] ?? '~/.bash_profile'
      const node = getNode(ctx.fs, resolvePath(ctx.cwd, target))
      if (!node) return fail(ctx, `source: ${target}: No such file or directory`)
      if (node.type !== 'file' || !target.endsWith('.bash_profile')) {
        return fail(ctx, 'source: this demo can only source ~/.bash_profile')
      }
      await ctx.reloadProfile()
    },
  },
  {
    name: '.',
    help: 'same as source',
    run: (args, ctx) => commands.find((c) => c.name === 'source')?.run(args, ctx),
  },
  {
    name: 'exit',
    help: 'try it :)',
    run: (_args, ctx) => ctx.println('There is nowhere to go: this shell lives in a browser tab. Close the tab instead :)'),
  },
]

export function findCommand(name: string): Command | undefined {
  return commands.find((c) => c.name === name)
}

