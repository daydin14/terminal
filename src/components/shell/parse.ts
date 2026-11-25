// Splits a typed line into words, like bash does.
//   echo "hello $USER" && ls ~/projects
//   -> [ ['echo','hello guest'], ['ls','/home/guest/projects'] ]  joined by '&&'
//
// Supports: 'single quotes', "double quotes", \escapes, $VAR / ${VAR}, ~, ;  &&  and # comments.

/** One command and how it is joined to the one before it. */
export interface Segment {
  words: string[]
  /** 'always' = after `;` (or the first command). 'and' = after `&&` (only runs if the last one succeeded). */
  join: 'always' | 'and'
}

export function parseLine(line: string, env: Record<string, string>): Segment[] {
  const segments: Segment[] = []
  let words: string[] = []
  let word = ''
  let inWord = false // true once we've started a word (so "" counts as an empty word)
  let join: Segment['join'] = 'always'

  const endWord = () => {
    if (inWord) words.push(word)
    word = ''
    inWord = false
  }
  const endSegment = (nextJoin: Segment['join']) => {
    endWord()
    if (words.length > 0) segments.push({ words, join })
    words = []
    join = nextJoin
  }

  /** Read a variable name after `$` starting at index i. Returns [value, newIndex]. */
  const readVar = (i: number): [string, number] => {
    if (line[i + 1] === '{') {
      const end = line.indexOf('}', i)
      if (end !== -1) return [env[line.slice(i + 2, end)] ?? '', end + 1]
    }
    const m = /^\w+/.exec(line.slice(i + 1))
    if (m) return [env[m[0]] ?? '', i + 1 + m[0].length]
    return ['$', i + 1] // a lone $ is just a dollar sign
  }

  for (let i = 0; i < line.length; ) {
    const c = line[i]
    if (c === "'") {
      // Single quotes: everything up to the next ' is literal.
      const end = line.indexOf("'", i + 1)
      word += line.slice(i + 1, end === -1 ? line.length : end)
      inWord = true
      i = end === -1 ? line.length : end + 1
    } else if (c === '"') {
      // Double quotes: spaces are kept, but $VAR still works.
      inWord = true
      i++
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && '"\\$'.includes(line[i + 1] ?? '')) {
          word += line[i + 1]
          i += 2
        } else if (line[i] === '$') {
          const [v, next] = readVar(i)
          word += v
          i = next
        } else {
          word += line[i++]
        }
      }
      i++ // skip the closing quote
    } else if (c === '\\') {
      word += line[i + 1] ?? ''
      inWord = true
      i += 2
    } else if (c === '$') {
      const [v, next] = readVar(i)
      word += v
      inWord = true
      i = next
    } else if (c === '~' && !inWord && (line[i + 1] === undefined || line[i + 1] === '/' || line[i + 1] === ' ')) {
      word += env.HOME ?? '~'
      inWord = true
      i++
    } else if (c === '#' && !inWord) {
      break // comment: ignore the rest
    } else if (c === ';') {
      endSegment('always')
      i++
    } else if (c === '&' && line[i + 1] === '&') {
      endSegment('and')
      i += 2
    } else if (c === ' ' || c === '\t') {
      endWord()
      i++
    } else {
      word += c
      inWord = true
      i++
    }
  }
  endSegment('always')
  return segments
}
