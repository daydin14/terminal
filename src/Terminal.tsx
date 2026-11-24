import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

export default function Terminal() {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const term = new XTerm({
            cursorBlink: true,
            allowProposedApi: true,
            fontFamily: '"Cascadia Code", "Fira Code", monospace',
            fontSize: 14,
            theme: { background: '#010409', foreground: '#c9d1d9' },
        })
        const fit = new FitAddon()
        term.loadAddon(fit)
        term.loadAddon(new WebLinksAddon())
        term.loadAddon(new Unicode11Addon())
        term.unicode.activeVersion = '11'

        term.open(ref.current!)
        fit.fit()
        term.writeln('Initializing XDAV shell environment...')

        const onResize = () => fit.fit()
        window.addEventListener('resize', onResize)
        return () => {
            window.removeEventListener('resize', onResize)
            term.dispose()
        }
    }, [])

    return <div ref={ref} className="terminal" />
}