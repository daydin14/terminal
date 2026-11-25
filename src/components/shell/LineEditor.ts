// The line editor: turns raw keystrokes into an editable line of text.
//
// WHY THIS FILE EXISTS: xterm.js is only a screen. When you press a key it does
// not print anything and does not remember what you typed. It just hands us the
// key as a string (via onData). So WE must: keep the text in a buffer, print it,
// move the cursor, handle Backspace, Enter, arrows, history, paste...
import type { Shell } from './Shell'

/** Roughly how many columns a character takes on screen (emoji and CJK take 2). */
function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x300 && cp <= 0x36f)) return 0 // joiners, combining marks
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    cp >= 0x1f300
  ) {
    return 2
  }
  return 1
}
const textWidth = (chars: string[]) => chars.reduce((sum, ch) => sum + charWidth(ch), 0)
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // eslint-disable-line no-control-regex

/** Escape sequences the terminal sends for special keys. */
const KEYS: Record<string, string> = {
  '\x1b[A': 'up',
  '\x1b[B': 'down',
  '\x1b[C': 'right',
  '\x1b[D': 'left',
  '\x1b[H': 'home',
  '\x1bOH': 'home',
  '\x1b[1~': 'home',
  '\x1b[F': 'end',
  '\x1bOF': 'end',
  '\x1b[4~': 'end',
  '\x1b[3~': 'delete',
}
// A key sequence starts with ESC. This pattern grabs one whole sequence.
const ESCAPE = /^\x1b(?:\[[0-9;]*[A-Za-z~]|O[A-Za-z])/ // eslint-disable-line no-control-regex

export class LineEditor {
  private shell: Shell
  private write: (s: string) => void
  private getCols: () => number
  private buf: string[] = [] // the line, one entry per character (so emoji count as 1)
  private cursor = 0 // index into buf
  private prompt = ''
  private rowsAboveCursor = 0 // for redrawing lines that wrap onto several rows
  private histIndex = 0 // which history entry we are showing (history.length = the new line)
  private draft = '' // what you had typed before pressing Up
  private queue: Promise<void> // keystrokes wait here until the previous one is done

  constructor(shell: Shell, write: (s: string) => void, getCols: () => number) {
    this.shell = shell
    this.write = write
    this.getCols = getCols
    // The first job in the queue: start the shell (loads the profile), then show the prompt.
    this.queue = shell.start().then(() => this.newPrompt())
  }

  /** Call this with everything xterm's onData gives you. */
  handleData(data: string) {
    // Chain onto the queue so input typed during an async command is handled in order.
    this.queue = this.queue.then(() => this.process(data)).catch(() => undefined)
  }

  private async process(data: string) {
    const chars = Array.from(data) // splits by real characters, not by UTF-16 pieces
    let i = 0
    let run: string[] = [] // consecutive printable characters (a paste arrives as one big run)
    const flush = () => {
      if (run.length) {
        this.insert(run)
        run = []
      }
    }
    while (i < chars.length) {
      const ch = chars[i]
      if (ch === '\x1b') {
        flush()
        const seq = ESCAPE.exec(chars.slice(i).join(''))
        if (seq) {
          this.onKey(KEYS[seq[0]])
          i += Array.from(seq[0]).length
        } else {
          i++ // lone ESC: ignore
        }
        continue
      }
      if (ch >= ' ' && ch !== '\x7f') {
        run.push(ch) // printable: a letter, a symbol, an emoji, pasted text...
        i++
        continue
      }
      flush()
      i++
      switch (ch) {
        case '\r': // Enter (a pasted newline also arrives as \r)
        case '\n':
          await this.enter()
          break
        case '\x7f': // Backspace
        case '\b':
          this.backspace()
          break
        case '\t':
          this.tab()
          break
        case '\x03': // Ctrl+C: abandon this line
          this.cursor = this.buf.length
          this.redraw()
          this.write('^C\r\n')
          this.newPrompt()
          break
        case '\x0c': // Ctrl+L: clear screen, keep what you typed
          this.shell.clear()
          this.rowsAboveCursor = 0
          this.redraw()
          break
        case '\x01':
          this.onKey('home') // Ctrl+A
          break
        case '\x05':
          this.onKey('end') // Ctrl+E
          break
        case '\x15': // Ctrl+U: delete everything left of the cursor
          this.buf.splice(0, this.cursor)
          this.cursor = 0
          this.redraw()
          break
        case '\x0b': // Ctrl+K: delete everything right of the cursor
          this.buf.splice(this.cursor)
          this.redraw()
          break
        case '\x17': // Ctrl+W: delete the word left of the cursor
          this.deleteWord()
          break
        default:
          break // any other control key: ignore
      }
    }
    flush()
  }

  // ---------- editing ----------

  private insert(chars: string[]) {
    this.buf.splice(this.cursor, 0, ...chars)
    this.cursor += chars.length
    this.redraw()
  }

  private backspace() {
    if (this.cursor === 0) return
    this.buf.splice(this.cursor - 1, 1)
    this.cursor--
    this.redraw()
  }

  private deleteWord() {
    let start = this.cursor
    while (start > 0 && this.buf[start - 1] === ' ') start--
    while (start > 0 && this.buf[start - 1] !== ' ') start--
    this.buf.splice(start, this.cursor - start)
    this.cursor = start
    this.redraw()
  }

  private onKey(key: string | undefined) {
    const history = this.shell.history
    switch (key) {
      case 'left':
        if (this.cursor > 0) this.cursor--
        break
      case 'right':
        if (this.cursor < this.buf.length) this.cursor++
        break
      case 'home':
        this.cursor = 0
        break
      case 'end':
        this.cursor = this.buf.length
        break
      case 'delete':
        this.buf.splice(this.cursor, 1)
        break
      case 'up':
        if (this.histIndex === 0) return
        if (this.histIndex === history.length) this.draft = this.buf.join('') // remember the unfinished line
        this.histIndex--
        this.setLine(history[this.histIndex])
        return
      case 'down':
        if (this.histIndex >= history.length) return
        this.histIndex++
        this.setLine(this.histIndex === history.length ? this.draft : history[this.histIndex])
        return
      default:
        return
    }
    this.redraw()
  }

  private setLine(text: string) {
    this.buf = Array.from(text)
    this.cursor = this.buf.length
    this.redraw()
  }

  private tab() {
    const before = this.buf.slice(0, this.cursor).join('')
    const { start, options } = this.shell.complete(before)
    if (options.length === 0) return
    const word = before.slice(start)
    if (options.length === 1) {
      const done = options[0] + (options[0].endsWith('/') ? '' : ' ')
      this.replaceWord(start, done)
      return
    }
    // Several matches: complete as far as they all agree...
    let common = options[0]
    for (const o of options) while (!o.startsWith(common)) common = common.slice(0, -1)
    if (common.length > word.length) {
      this.replaceWord(start, common)
    } else {
      // ...otherwise list them, then show the prompt and the line again.
      this.cursor = this.buf.length
      this.redraw()
      this.write('\r\n' + options.map((o) => o.replace(/\/$/, '/').split('/').filter(Boolean).pop() ?? o).join('  ') + '\r\n')
      this.rowsAboveCursor = 0
      this.redraw()
    }
  }

  private replaceWord(start: number, text: string) {
    const rest = this.buf.slice(this.cursor)
    this.buf = [...this.buf.slice(0, start), ...Array.from(text), ...rest]
    this.cursor = start + Array.from(text).length
    this.redraw()
  }

  private async enter() {
    this.cursor = this.buf.length
    this.redraw() // make sure the cursor is at the end of the line first
    this.write('\r\n')
    const line = this.buf.join('')
    this.buf = []
    this.cursor = 0
    if (line.trim()) {
      const h = this.shell.history
      if (h[h.length - 1] !== line) h.push(line) // don't store the same command twice in a row
      await this.shell.run(line)
    }
    this.newPrompt()
  }

  // ---------- drawing ----------

  /** Print a fresh prompt and reset the line. */
  private newPrompt() {
    this.prompt = this.shell.prompt() // computed once per line, so the random emoji stays put while you type
    this.buf = []
    this.cursor = 0
    this.histIndex = this.shell.history.length
    this.draft = ''
    this.rowsAboveCursor = 0
    this.write(this.prompt)
  }

  /**
   * Repaint the whole line: go to the start, print prompt + text, erase leftovers,
   * then put the cursor where it belongs. Simple and reliable, even for pastes.
   */
  private redraw() {
    const cols = Math.max(this.getCols(), 1)
    const promptWidth = textWidth(Array.from(stripAnsi(this.prompt)))
    const endWidth = promptWidth + textWidth(this.buf)
    const cursorWidth = promptWidth + textWidth(this.buf.slice(0, this.cursor))

    let out = ''
    if (this.rowsAboveCursor > 0) out += `\x1b[${this.rowsAboveCursor}A` // back to the first row of the line
    out += '\r\x1b[J' + this.prompt + this.buf.join('') // \x1b[J erases from here to the bottom
    // If the text ends exactly at the right edge, push the cursor onto the next row.
    if (endWidth > 0 && endWidth % cols === 0) out += ' \r'

    const endRow = Math.floor(endWidth / cols)
    const cursorRow = Math.floor(cursorWidth / cols)
    const cursorCol = cursorWidth % cols
    if (endRow > cursorRow) out += `\x1b[${endRow - cursorRow}A`
    out += '\r'
    if (cursorCol > 0) out += `\x1b[${cursorCol}C`
    this.rowsAboveCursor = cursorRow
    this.write(out)
  }
}
