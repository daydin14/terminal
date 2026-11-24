export interface ShellContext {
  cwd: string
  setCwd: (path: string) => void
  write: (text: string) => void
}
export interface Command {
  name: string
  help: string
  run: (args: string[], ctx: ShellContext) => void | Promise<void>
}