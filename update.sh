#!/bin/bash


# 第一个参数作为 commit message，默认为 "update"
msg=${1:-"update"}

# 第二个参数为版本号（如 0.6.5）；未传则不打 tag
version=${2:-}

git add .
git commit -m "$msg"
git push origin master

if [ -z "$version" ]; then
    echo "跳过标签上传"
    exit 0
fi

# 本地已有该 tag 则先删除
if git rev-parse "$version" >/dev/null 2>&1; then
    echo "删除本地 tag: $version"
    git tag -d "$version"
fi

# 远程已有该 tag 则先删除
if git ls-remote --tags origin "refs/tags/$version" | grep -q "$version"; then
    echo "删除远程 tag: $version"
    git push origin -d "refs/tags/$version"
fi

# 创建并推送新 tag
git tag -a "$version" -m "$version"
git push origin "$version"
echo "已上传 tag: $version"
