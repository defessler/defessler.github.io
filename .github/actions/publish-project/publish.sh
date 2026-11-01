#!/usr/bin/env bash
# Called by action.yml. Inputs arrive as INPUT_SLUG, INPUT_PATH and INPUT_DEPLOY_KEY.
# Test hooks: PUBLISH_REMOTE overrides the clone URL, PUBLISH_SKIP_HOSTKEYS=1 skips the
# api.github.com host key fetch, PUBLISH_BACKOFF sets the retry delay unit in seconds.
set -euo pipefail
umask 077

slug="${INPUT_SLUG:-}"
src="${INPUT_PATH:-}"
key="${INPUT_DEPLOY_KEY:-}"
remote="${PUBLISH_REMOTE:-git@github.com:defessler/defessler.github.io.git}"
backoff="${PUBLISH_BACKOFF:-5}"
work="${RUNNER_TEMP:?RUNNER_TEMP is not set}/publish-project"

fail() { echo "::error::$*" >&2; exit 1; }

[[ "$slug" =~ ^[a-z0-9-]+$ ]] || fail "slug must match ^[a-z0-9-]+\$ (got '$slug')"
[[ -n "$key" ]] || fail "deploy-key is empty"
[[ -d "$src" ]] || fail "path '$src' is not an existing folder"
src="$(cd "$src" && pwd)"
[[ -n "$(find "$src" -type f -name '*.html' -print -quit)" ]] || fail "path '$src' holds no .html file"
bad="$(find "$src" -mindepth 1 -name '_*' -print -quit)"
[[ -z "$bad" ]] || fail "'${bad#"$src"/}' starts with '_'. Jekyll on the root site drops such paths"
bad="$(find "$src" -type f \( -iname '*.md' -o -iname '*.markdown' -o -iname '*.mkdown' -o -iname '*.mkdn' -o -iname '*.mkd' -o -iname '*.textile' \) -print -quit)"
[[ -z "$bad" ]] || fail "'${bad#"$src"/}': the root site is a Jekyll build and would render it. Publish built HTML only"
bad="$(python3 -I - "$src" <<'PY'
import pathlib, sys
for p in sorted(pathlib.Path(sys.argv[1]).rglob("*")):
    if p.is_file() and not p.is_symlink():
        with p.open("rb") as f:
            first = f.readline().rstrip(b"\r\n")
        if first.removeprefix(b"\xef\xbb\xbf") == b"---":
            print(p.relative_to(sys.argv[1]).as_posix())
            break
PY
)"
[[ -z "$bad" ]] || fail "'$bad' starts with front matter (---): the root site is a Jekyll build and would render it. Publish built HTML only"
bad="$(find "$src" -type l -print -quit)"
[[ -z "$bad" ]] || fail "'${bad#"$src"/}' is a symlink. Symlinks are not published"
bad="$(find "$src" -mindepth 1 -name '.git' -print -quit)"
[[ -z "$bad" ]] || fail "'${bad#"$src"/}' is named .git, which git would commit as a gitlink"

rm -rf "$work"  # a reused self-hosted slot may hold a stale clone
mkdir -p "$work"
chmod 700 "$work"
keyfile="$work/deploy_key"
hostsfile="$work/known_hosts"
printf '%s\n' "$key" > "$keyfile"
chmod 600 "$keyfile"
unset INPUT_DEPLOY_KEY key

if [[ "${PUBLISH_SKIP_HOSTKEYS:-}" == "1" ]]; then
  : > "$hostsfile"
else
  meta="$(curl -fsSL --max-time 30 https://api.github.com/meta)" \
    || fail "could not fetch https://api.github.com/meta for the GitHub host keys"
  printf '%s' "$meta" | python3 -I -c 'import json,sys
for k in json.load(sys.stdin)["ssh_keys"]:
    print("github.com " + k)' > "$hostsfile" 2>/dev/null \
    || fail "could not read ssh_keys from api.github.com/meta"
  [[ -s "$hostsfile" ]] || fail "api.github.com/meta returned no ssh_keys"
fi
chmod 600 "$hostsfile"
export GIT_SSH_COMMAND="ssh -i '$keyfile' -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile='$hostsfile'"

repo="$work/repo"
git clone --quiet --depth 1 --branch master "$remote" "$repo"
cd "$repo"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

target="projects/$slug"
sha="${GITHUB_SHA:-0000000}"
changed=0

# Replace the target with the source, tag the pages, commit. Sets changed=1 when a
# commit was made. Failures abort the script (the function is called as a plain statement).
build() {
  changed=0
  mkdir -p projects
  [[ ! -e "$target" ]] || git rm -rq --ignore-unmatch "$target"
  mkdir -p "$target"
  cp -R "$src"/. "$target"/

  python3 -I - "$target" <<'PY'
import pathlib, sys
ga = b"G-YQB4BCN1CH"
tag = (b'<script async src="https://www.googletagmanager.com/gtag/js?id=' + ga + b'"></script>'
       b"<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}"
       b"gtag('js',new Date());gtag('config','" + ga + b"');</script>"
       b'<script src="/js/insights.js" defer></script>')
n = 0
had = 0
for p in pathlib.Path(sys.argv[1]).rglob("*.html"):
    s = p.read_bytes()
    if ga in s:
        had += 1
        continue
    low = s.lower()
    i = low.find(b"</head>")
    if i < 0:  # head-less fragment page: tag it right after </title> instead
        j = low.find(b"</title>")
        if j < 0:
            print(f"::warning::{p}: no </head> or </title>, not tagged")
            continue
        i = j + 8
    p.write_bytes(s[:i] + tag + s[i:])
    n += 1
print(f"GA tag injected into {n} page(s), {had} already had it")
if not n and not had:
    sys.exit("::error::no pages were tagged")
PY

  git add -A -- "$target"
  if ! git diff --cached --quiet; then
    git commit --quiet -m "$slug: publish from ${GITHUB_REPOSITORY:-unknown}@${sha::7}"
    changed=1
  fi
}

# Last writer wins: on a rejected push, drop our commit, take the new master and redo it.
for attempt in 1 2 3 4 5; do
  build
  if [[ "$changed" != 1 ]]; then
    echo "No change to $target, nothing to publish."
    exit 0
  fi
  if git push --quiet origin HEAD:master; then
    echo "Pushed $slug on attempt $attempt."
    exit 0
  fi
  echo "Push attempt $attempt was rejected, refetching master."
  sleep $((attempt * backoff))
  git fetch --quiet --depth 1 origin master && git reset --quiet --hard FETCH_HEAD \
    || fail "could not refetch master after a rejected push"
done
fail "push to master failed after 5 attempts"
