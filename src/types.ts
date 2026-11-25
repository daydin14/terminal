// Shared types. Keeping them in one file makes the rest of the code easier to read.

/** One git commit shown by `git log`. */
export interface Commit {
  hash: string // full 40-character id
  date: string // YYYY-MM-DD
  author: string
  message: string
}

/** One of David's projects. Each one becomes a git repo folder in ~/projects. */
export interface Project {
  slug: string // folder name and what you type after `open`, e.g. "file-converter"
  name: string // nice display name
  description: string
  repo: string // GitHub URL
  live?: string // live site URL, if there is one
  branch: string
  log: Commit[] // newest first
}

/** A file in the virtual filesystem. */
export interface FileNode {
  type: 'file'
  content: string
}

/** A folder in the virtual filesystem. `project` is set when the folder is a git repo. */
export interface DirNode {
  type: 'dir'
  children: Record<string, FsNode>
  project?: Project
}

export type FsNode = FileNode | DirNode

/** Everything we learned by reading ~/.bash_profile (see shell/profile.ts). */
export interface Profile {
  text: string // the raw file
  aliases: Record<string, string> // alias ll='ls -la'  ->  { ll: 'ls -la' }
  env: Record<string, string> // export FOO=bar        ->  { FOO: 'bar' }
  functions: string[] // names of functions the file defines
  emojis: string[] // the emoji list inside random_emoji()
  ps1: string | null // the PS1 template (still has ${var} and \w in it)
  ps1Locals: Record<string, string> // `local x="..."` values next to PS1
  source: 'github' | 'bundled' // where the text came from
}

/** What a command is allowed to use. Passed to every command's run(). */
export interface ShellContext {
  cwd: string // absolute path like /home/guest/projects
  setCwd: (path: string) => void
  /** Print text. "\n" is converted to "\r\n" for you. No newline is added. */
  write: (text: string) => void
  /** Print text followed by a newline. */
  println: (text?: string) => void
  env: Record<string, string>
  aliases: Record<string, string>
  history: string[]
  fs: DirNode // root of the virtual filesystem
  projects: Project[]
  clear: () => void
  reloadProfile: () => Promise<void>
  openUrl: (url: string) => void
  commandNames: () => string[]
}

export interface Command {
  name: string
  help: string // one line, shown by `help`
  /** Return 0 (or nothing) for success, a non-zero number for failure. `&&` uses this. */
  run: (args: string[], ctx: ShellContext) => number | void | Promise<number | void>
}
