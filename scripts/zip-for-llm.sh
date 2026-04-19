#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
repo_name="$(basename "$repo_root")"

output_arg="${1:-${repo_name}-llm.zip}"
if [[ "$output_arg" = /* ]]; then
  output_path="$output_arg"
else
  output_path="$repo_root/$output_arg"
fi

mkdir -p "$(dirname "$output_path")"
output_path="$(cd "$(dirname "$output_path")" && pwd)/$(basename "$output_path")"

if ! command -v zip >/dev/null 2>&1; then
  echo "zip command not found. Install zip and run the script again." >&2
  exit 1
fi

declare -a ignore_patterns=()

if [[ -f "$repo_root/.gitignore" ]]; then
  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    line="${raw_line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    ignore_patterns+=("$line")
  done < "$repo_root/.gitignore"
fi

ignore_patterns+=(
  ".git/"
  ".turbo/"
  ".cache/"
  ".parcel-cache/"
  ".pnpm-store/"
  ".yarn/cache/"
  "build/"
  "coverage/"
  "out/"
  "target/"
  "*.zip"
  "*.tar"
  "*.tar.gz"
  "*.tgz"
  "*.7z"
  "*.rar"
  "*.gz"
  "*.bz2"
  "*.xz"
  "*.exe"
  "*.dll"
  "*.so"
  "*.dylib"
  "*.class"
  "*.jar"
  "*.war"
  "*.o"
  "*.a"
  "*.obj"
  "*.pdb"
  "*.pyc"
)

pattern_matches() {
  local relative_path="$1"
  local pattern="$2"
  local normalized_path="${relative_path#./}"
  local basename="${normalized_path##*/}"
  local directory_only=0

  if [[ "$pattern" == */ ]]; then
    directory_only=1
    pattern="${pattern%/}"
  fi

  if [[ -z "$pattern" ]]; then
    return 1
  fi

  if (( directory_only )); then
    [[ "$normalized_path" == "$pattern" || "$normalized_path" == "$pattern"/* || "$normalized_path" == */"$pattern"/* ]]
    return
  fi

  if [[ "$pattern" == */* ]]; then
    [[ "$normalized_path" == "$pattern" || "$normalized_path" == */"$pattern" ]]
    return
  fi

  if [[ "$pattern" == *[\*\?\[]* ]]; then
    [[ "$basename" == $pattern ]]
    return
  fi

  [[ "$basename" == "$pattern" || "$normalized_path" == "$pattern" || "$normalized_path" == */"$pattern" ]]
}

should_ignore() {
  local relative_path="$1"
  local ignored=0

  for raw_pattern in "${ignore_patterns[@]}"; do
    local pattern="$raw_pattern"
    local include_match=0

    if [[ "$pattern" == !* ]]; then
      include_match=1
      pattern="${pattern:1}"
    fi

    if pattern_matches "$relative_path" "$pattern"; then
      if (( include_match )); then
        ignored=0
      else
        ignored=1
      fi
    fi
  done

  (( ignored ))
}

declare -a candidate_files=()

if git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  while IFS= read -r -d '' file_path; do
    candidate_files+=("$file_path")
  done < <(git -C "$repo_root" ls-files -z --cached --others --exclude-standard)
else
  while IFS= read -r -d '' file_path; do
    candidate_files+=("${file_path#./}")
  done < <(cd "$repo_root" && find . -type f -print0)
fi

declare -a selected_files=()

for relative_path in "${candidate_files[@]}"; do
  relative_path="${relative_path#./}"
  [[ -z "$relative_path" ]] && continue

  full_path="$repo_root/$relative_path"
  if [[ "$full_path" == "$output_path" ]]; then
    continue
  fi

  if should_ignore "$relative_path"; then
    continue
  fi

  selected_files+=("$relative_path")
done

if (( ${#selected_files[@]} == 0 )); then
  echo "No files matched the archive rules." >&2
  exit 1
fi

rm -f "$output_path"

temp_list="$(mktemp)"
trap 'rm -f "$temp_list"' EXIT
printf '%s\n' "${selected_files[@]}" > "$temp_list"

(
  cd "$repo_root"
  zip -q -@ "$output_path" < "$temp_list"
)

echo "Created $output_path with ${#selected_files[@]} files."
