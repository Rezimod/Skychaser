#!/usr/bin/env bash
#
# wt.sh — one-writer-per-folder worktree helper for parallel Claude chats.
#
# Each task gets its OWN folder + OWN branch (a git worktree), so two chats
# never edit the same checkout. They share the .git object store, so it's cheap.
#
# Worktrees are created as siblings: /Users/nika/Desktop/Stellar-<task>
# on branch task/<task>, based on the latest origin/main.
#
# node_modules (1.8G) and .env.local (gitignored) are SYMLINKED from the main
# checkout — instant, no re-install, no missing secrets. Each worktree gets its
# own dev port so `npm run dev` instances don't collide.
#
# Usage:
#   ./scripts/wt.sh new <task>      create + wire up a worktree, print next steps
#   ./scripts/wt.sh list            show worktrees, branches, and assigned ports
#   ./scripts/wt.sh done <task>     remove a worktree (refuses if it has uncommitted work)
#
set -euo pipefail

MAIN="$(git rev-parse --show-toplevel)"
PARENT="$(dirname "$MAIN")"
PREFIX="Skychaser-"   # sibling folder prefix: Skychaser-<task>
PORTDIR="$MAIN/.git/wt-ports"   # port map lives in .git, never in the worktree

die() { echo "error: $*" >&2; exit 1; }

slug() { echo "$1" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-'; }

free_port() {
  # First free TCP port from 3001 upward (skips ones already in use).
  local p=3001
  while lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; do p=$((p+1)); done
  echo "$p"
}

cmd_new() {
  local task; task="$(slug "${1:-}")"
  [ -n "$task" ] || die "usage: wt.sh new <task>"
  local dir="$PARENT/$PREFIX$task"
  local branch="task/$task"
  [ -e "$dir" ] && die "$dir already exists"

  echo "→ fetching latest origin/main…"
  git -C "$MAIN" fetch --quiet origin

  echo "→ creating worktree $dir on $branch (from origin/main)…"
  git -C "$MAIN" worktree add -b "$branch" "$dir" origin/main >/dev/null

  # Link the heavy/gitignored bits instead of copying.
  ln -s "$MAIN/node_modules" "$dir/node_modules"
  [ -f "$MAIN/.env.local" ] && ln -s "$MAIN/.env.local" "$dir/.env.local"

  local port; port="$(free_port)"
  mkdir -p "$PORTDIR"; echo "$port" > "$PORTDIR/$task"

  cat <<EOF

✓ worktree ready.

  Open a NEW Claude chat with this folder as its working directory:
      cd $dir
      claude

  Run its dev server on its own port (won't clash with other chats):
      cd $dir && npm run dev -- -p $port      # http://localhost:$port

  When the task is done, from inside the worktree:
      git add -A && git commit -m "…" && git push -u origin $branch
  then open a PR (or merge) and clean up:
      ./scripts/wt.sh done $task
EOF
}

cmd_list() {
  echo "worktrees (folder · branch · dev port):"
  git -C "$MAIN" worktree list --porcelain \
  | awk -v RS='' -v portdir="$PORTDIR" -v prefix="$PREFIX" '{
      path=""; br="";
      n=split($0, L, "\n");
      for(i=1;i<=n;i++){
        if (L[i] ~ /^worktree /){ path=substr(L[i],10) }
        if (L[i] ~ /^branch /)  { br=substr(L[i],8); sub(/^refs\/heads\//,"",br) }
      }
      base=path; sub(/.*\//,"",base); task=base; sub("^" prefix,"",task);
      port="-"; pf=portdir"/"task;
      if ((getline pl < pf)>0){ port=pl; close(pf) }
      printf "  %-45s %-22s %s\n", path, (br==""?"(detached)":br), port
    }'
}

cmd_done() {
  local task; task="$(slug "${1:-}")"
  [ -n "$task" ] || die "usage: wt.sh done <task>"
  local dir="$PARENT/$PREFIX$task"
  [ -d "$dir" ] || die "no worktree at $dir"

  if [ -n "$(git -C "$dir" status --porcelain)" ]; then
    die "$dir has uncommitted changes — commit/push or discard first"
  fi
  echo "→ removing worktree ${dir}…"
  git -C "$MAIN" worktree remove "$dir"
  rm -f "$PORTDIR/$task"
  echo "✓ removed. The branch task/$task still exists (delete after it's merged:"
  echo "    git branch -D task/$task && git push origin --delete task/$task )"
}

case "${1:-}" in
  new)  shift; cmd_new "$@";;
  list) cmd_list;;
  done) shift; cmd_done "$@";;
  *) cat <<EOF
wt.sh — parallel worktree helper

  ./scripts/wt.sh new <task>     create an isolated worktree + branch for a task
  ./scripts/wt.sh list           list worktrees, branches, dev ports
  ./scripts/wt.sh done <task>    remove a finished worktree
EOF
  ;;
esac
