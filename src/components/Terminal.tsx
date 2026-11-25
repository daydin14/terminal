import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import { Shell } from './shell/Shell'
import { LineEditor } from './shell/LineEditor'

export default function Terminal() {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
    // 1) The screen. xterm only DISPLAYS text; it does not run anything.
    const term = new XTerm({
        cursorBlink: true,
        allowProposedApi: true, // needed by the unicode addon
        fontFamily: '"Cascadia Code", "Fira Code", monospace',
        fontSize: 14,
        theme: { background: '#010409', foreground: '#c9d1d9' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon()) // makes URLs clickable
    term.loadAddon(new Unicode11Addon()) // so emoji take the right amount of space
    term.unicode.activeVersion = '11'

    term.open(ref.current!)
    fit.fit()
    term.focus()

    // 2) The brain (runs commands) and the keyboard handler (edits the line).
    // (`disposed` stops late output, e.g. from a download still running, after the terminal is gone.)
    let disposed = false
    const write = (s: string) => {
        if (!disposed) term.write(s)
    }
    const shell = new Shell({ write, get cols() { return term.cols } }, (url) => window.open(url, '_blank', 'noopener'))
    const editor = new LineEditor(shell, write, () => term.cols)

    // 3) The glue: every key you press (or paste) arrives here as a string.
    const keys = term.onData((data) => editor.handleData(data))

    const onResize = () => fit.fit()
    window.addEventListener('resize', onResize)
    return () => {
        window.removeEventListener('resize', onResize)
        disposed = true
        keys.dispose()
        term.dispose()
    }
    }, [])

    return (
        <>
            <div className="terminal-frame">
                <div ref={ref} className="terminal" />
            </div>
        </>
    )
}
