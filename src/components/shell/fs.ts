// The virtual filesystem: a tree of plain objects. Nothing touches a real disk.
//
//   /home/guest
//   ├── README.md
//   ├── .bash_profile        <- the real file from github.com/daydin14/dotfiles
//   └── projects
//       ├── file-converter   <- each one is a "git repo" (git status / git log work here)
//       └── ...
import type { DirNode, FileNode, FsNode, Profile, Project } from '../../types'

export const HOME = '/home/guest'

const file = (content: string): FileNode => ({ type: 'file', content })

/** Build the whole tree. Called at startup and again after `source ~/.bash_profile`. */
export function buildFs(projects: Project[], profile: Profile): DirNode {
  const projectDirs: Record<string, FsNode> = {}
  for (const p of projects) {
    projectDirs[p.slug] = {
      type: 'dir',
      project: p,
      children: {
        'README.md': file(
          `# ${p.name}\n\n${p.description}\n\nRepo: ${p.repo}\n` +
            (p.live ? `Live:  ${p.live}\n` : '') +
            `\nTip: type "open ${p.slug}" to open it in a new tab.\n`,
        ),
      },
    }
  }
  // The dotfiles repo really contains the .bash_profile, so show it inside too.
  const dotfiles = projectDirs['dotfiles']
  if (dotfiles?.type === 'dir') dotfiles.children['.bash_profile'] = file(profile.text)

  return {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          guest: {
            type: 'dir',
            children: {
              'README.md': file(
                'Welcome to my terminal!\n\n' +
                  'This is a pretend shell running in your browser. Try:\n' +
                  '  help                 list the commands\n' +
                  '  ls projects          see my projects\n' +
                  '  cd projects/dotfiles then: git log\n' +
                  '  cat ~/.bash_profile  the real file that styles this prompt\n' +
                  '  open file-converter  open a project in a new tab\n',
              ),
              '.bash_profile': file(profile.text),
              projects: { type: 'dir', children: projectDirs },
            },
          },
        },
      },
    },
  }
}

/**
 * Turn what the user typed into a clean absolute path.
 *   resolvePath('/home/guest', '../x')  -> '/home/x'
 *   resolvePath('/home/guest', '~/a')   -> '/home/guest/a'
 */
export function resolvePath(cwd: string, input: string): string {
  let path = input
  if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1)
  if (!path.startsWith('/')) path = `${cwd}/${path}`
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return '/' + parts.join('/')
}

/** Find the node at an absolute path, or undefined if it does not exist. */
export function getNode(root: DirNode, absPath: string): FsNode | undefined {
  let node: FsNode = root
  for (const part of absPath.split('/').filter(Boolean)) {
    if (node.type !== 'dir') return undefined
    const next: FsNode | undefined = node.children[part]
    if (!next) return undefined
    node = next
  }
  return node
}

/** The project (git repo) that contains this path, if any. Used by `git`. */
export function findRepo(root: DirNode, absPath: string): Project | undefined {
  let node: FsNode = root
  let repo: Project | undefined
  for (const part of absPath.split('/').filter(Boolean)) {
    if (node.type !== 'dir') break
    const next: FsNode | undefined = node.children[part]
    if (!next) break
    node = next
    if (node.type === 'dir' && node.project) repo = node.project
  }
  return repo
}

/** Show a path the way bash does: /home/guest/projects -> ~/projects */
export function tildePath(absPath: string): string {
  if (absPath === HOME) return '~'
  if (absPath.startsWith(HOME + '/')) return '~' + absPath.slice(HOME.length)
  return absPath
}
