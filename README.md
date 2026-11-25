# XDAV Terminal

An interactive, browser-based terminal, built with React, TypeScript, Vite, and xterm.js.

**Live demo:** [daydin14.github.io/terminal](https://daydin14.github.io/terminal/)

## Overview

The app presents a portfolio as a small, in-browser Unix-style shell. It loads David's real Bash profile, creates a virtual project filesystem, and supports command editing, history, completion, aliases, environment variables, and read-only Git output.

The shell does not execute against the user's computer. Files and Git repositories exist only inside the browser's virtual filesystem.

## Features

- Full-viewport xterm.js terminal with responsive resizing
- Editable command line with cursor movement and paste support
- Command history with the Up and Down arrow keys
- Tab completion for commands, aliases, paths, and project folders
- Bash-style variables, quotes, `~`, comments, `;`, and `&&`
- Clickable terminal URLs
- Dynamic prompt loaded from `~/.bash_profile`
- Bundled profile fallback when GitHub is unavailable
- Virtual projects in `~/projects`
- Read-only `git status`, `git log`, and `git branch` output
- Project links that open GitHub repositories or live demos
- Keyboard shortcuts including Ctrl+C, Ctrl+L, Ctrl+A, Ctrl+E, Ctrl+U, Ctrl+K, and Ctrl+W

## Commands

| Command                       | Description                            |
| ----------------------------- | -------------------------------------- |
| `help`                        | Show the command list                  |
| `ls [-a] [-l] [path]`         | List virtual files and folders         |
| `cd [path]`                   | Change directories                     |
| `pwd`                         | Print the current directory            |
| `cat <file>`                  | Print file contents                    |
| `echo [-n] <text>`            | Print text or environment variables    |
| `clear`                       | Clear the terminal                     |
| `whoami`                      | Print the current user                 |
| `alias [name=value]`          | List or create aliases                 |
| `unalias <name>`              | Remove an alias                        |
| `env`                         | List environment variables             |
| `printenv [NAME]`             | Print an environment variable          |
| `export NAME=value`           | Set an environment variable            |
| `history`                     | Show entered commands                  |
| `git status \| log \| branch` | View emulated Git information          |
| `open [project] [repo]`       | Open a project live site or repository |
| `source ~/.bash_profile`      | Reload the profile                     |
| `exit`                        | Display the browser-shell exit message |

Example session:

```text
help
ls projects
cd projects/terminal
git status
git log --oneline -n 5
open file-converter
open JokerBlazor repo
```

## Bash Profile

On startup, the terminal fetches:

<https://raw.githubusercontent.com/daydin14/dotfiles/master/.bash_profile>

It reads supported aliases, exports, functions, emoji choices, and `PS1` prompt data. Bash is not executed in the browser. If GitHub cannot be reached, the app uses a bundled copy of the profile.

Use `source ~/.bash_profile` to reload the remote profile and virtual filesystem.

## Projects

The virtual `~/projects` directory includes:

- Portfolio
- Drink Generator
- Chalkboard Games
- Password Generator
- Joker Blazor
- File Converter
- Terminal
- Dotfiles

Each project folder contains a generated `README.md`, repository metadata, branch information, and a recent commit snapshot.

## Tech Stack

| Technology             | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| React 19               | Application rendering                         |
| TypeScript             | Shell, command, filesystem, and profile types |
| Vite 8                 | Development server and production builds      |
| xterm.js 6             | Terminal rendering and input                  |
| xterm Fit Addon        | Responsive terminal sizing                    |
| xterm Web Links Addon  | Clickable URLs                                |
| xterm Unicode 11 Addon | Unicode character rendering                   |
| ESLint                 | Code linting                                  |
| gh-pages               | GitHub Pages deployment                       |

## Project Structure

```text
terminal/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── shell/
│   │   │   ├── Shell.ts
│   │   │   ├── LineEditor.ts
│   │   │   ├── commands.ts
│   │   │   ├── fs.ts
│   │   │   ├── parse.ts
│   │   │   └── profile.ts
│   │   └── Terminal.tsx
│   ├── data/
│   │   ├── bash_profile.txt
│   │   └── projects.ts
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── types.ts
├── index.html
├── package.json
├── vite.config.ts
└── eslint.config.js
```

### Key Files

- `src/components/Terminal.tsx` initializes xterm.js, loads addons, and connects the terminal to the shell.
- `src/components/shell/Shell.ts` manages the working directory, history, environment, profile, and command execution.
- `src/components/shell/LineEditor.ts` handles keyboard input, paste, completion, history, and line redraws.
- `src/components/shell/commands.ts` defines the available shell commands.
- `src/components/shell/fs.ts` builds and resolves the virtual filesystem.
- `src/components/shell/profile.ts` downloads, parses, and renders the Bash profile.
- `src/data/projects.ts` contains project metadata and commit snapshots.
- `vite.config.ts` configures the `/terminal/` base path for GitHub Pages.

## Getting Started

### Prerequisites

- Node.js
- npm

### Installation

```bash
git clone https://github.com/daydin14/terminal.git
cd terminal
npm install
```

### Development

```bash
npm run dev
```

Vite prints the local development URL in the terminal.

### Production Build

```bash
npm run build
```

The compiled site is generated in `dist/`.

### Preview

```bash
npm run preview
```

## Available Scripts

| Command           | Description                               |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Start the Vite development server         |
| `npm run build`   | Type-check and create a production build  |
| `npm run lint`    | Run ESLint                                |
| `npm run preview` | Preview the production build locally      |
| `npm run deploy`  | Build and publish `dist/` to GitHub Pages |

## Deployment

The project is configured for GitHub Pages at `/terminal/`. Deploy it with:

```bash
npm run deploy
```

The deploy script builds the app and publishes `dist/` to the `gh-pages` branch.

## Demo Limitations

This is an intentionally small demo shell. It does not support pipes, redirects, real process execution, or arbitrary Bash scripting. Git commands are emulated from project metadata and do not modify a real repository.
