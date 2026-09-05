#!/bin/bash

# 用法:
#   ./update.sh
#   ./update.sh "commit message"
#   ./update.sh "commit message" 2.1.7
#   ./update.sh "commit message" 2.1.7 "Release 说明"
# 多行说明:
#   ./update.sh "chore: 2.1.7" 2.1.7 "$(cat <<'EOF'
#   ## 2.1.7
#   - …
#   EOF
#   )"
# 第三参数会写入 annotated tag，GitHub Actions 用它作为 Release notes。
# 未传第三参数时，workflow 回退为 --generate-notes。

msg=${1:-"update"}
version=${2:-}
notes=${3:-}

git add .
git commit -m "$msg"
git push origin master

if [ -z "$version" ]; then
    echo "跳过标签上传"
    exit 0
fi

if git rev-parse "$version" >/dev/null 2>&1; then
    echo "删除本地 tag: $version"
    git tag -d "$version"
fi

if git ls-remote --tags origin "refs/tags/$version" | grep -q "$version"; then
    echo "删除远程 tag: $version"
    git push origin -d "refs/tags/$version"
fi

if [ -n "$notes" ]; then
    printf '%s\n' "$notes" | git tag -a "$version" -F -
else
    git tag -a "$version" -m "$version"
fi
git push origin "$version"
echo "已上传 tag: $version"
