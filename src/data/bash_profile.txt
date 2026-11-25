# NVM (Node Version Manager) setup
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Random Emoji Generator
random_emoji() {
    local emojis=("🎮" "💾" "📀" "👻" "😸" "🐸" "🦖" "🐧" "🐥" "🧙‍♂️" "💎" "⛳" "🪄" "🧸" "🃏" "🔧" "🪛" "⚙️" "🧪" "🛡️" "🍟" "🍿" "🥨" "🍙" "🍣" "🍦" "🍪" "🥝" "🍇" "🫐" "🍋" "⛩️" "🔱" "💮")

    # Generate a random index to select an emoji from the array
    local rand_idx=$(( RANDOM % ${#emojis[@]} ))

    # Print the selected emoji without a newline
    echo -n "${emojis[$rand_idx]}"
}

# Git info for the prompt: branch name plus status markers
git_prompt_info() {
    # Print nothing when not inside a git repository
    git rev-parse --is-inside-work-tree &>/dev/null || return

    # Get the current branch name or commit hash
    local branch
    branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)

    # Get the status markers for the current git repository
    local markers=""
    local status
    status=$(git status --porcelain=v1 --branch 2>/dev/null)

    # Check for various git status markers and append them to the markers string
    grep -q '^[MADRC]' <<< "$status" && markers+="+"   # staged changes
    grep -q '^.[MD]'   <<< "$status" && markers+="*"   # unstaged changes
    grep -q '^??'      <<< "$status" && markers+="?"   # untracked files
    grep -q 'ahead'    <<< "$status" && markers+="↑"   # commits to push
    grep -q 'behind'   <<< "$status" && markers+="↓"   # commits to pull

    # Print the branch name and markers without a newline
    echo -n "${branch}${markers:+ $markers}"
}

# A builder function that sets your prompt variables
set_my_prompt() {
    local emoji=$(random_emoji) # Get a random emoji for the prompt
    local bright_red="\[\033[1;31m\]" # Bright red color for the directory
    local green="\[\033[1;32m\]" # Green color for the git branch when clean
    local yellow="\[\033[1;33m\]" # Yellow color for the git branch when there are changes
    local reset="\[\033[0m\]" # Reset color so that the emoji and the directory are in bright red, but the rest of the prompt is in default color
    local username="XDAV" # Set the username to be displayed in the prompt

    # Git section: green when clean, yellow when there are changes
    local git_part=""
    local git_info=$(git_prompt_info)
    if [ -n "$git_info" ]; then
        if [[ "$git_info" == *" "* ]]; then
            git_part=" ${yellow}(${git_info})${reset}"
        else
            git_part=" ${green}(${git_info})${reset}"
        fi
    fi

    export PS1="${emoji}${bright_red}・${username}:${reset} \w${git_part} \$ "
}

export PROMPT_COMMAND=set_my_prompt