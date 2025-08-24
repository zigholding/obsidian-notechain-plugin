#!/bin/bash


# 第一个参数作为 commit message，默认为 "update"
msg=${1:-"update"}

# 第二个参数，控制是否上传 tag（true/false），默认为 false
upload_tag=${2:-false}

git add .
git commit -m "$msg"
git push origin master

# 如果第二个参数为 true，则推送 tag
if [ "$upload_tag" = "true" ]; then
    # 删除远程和本地 tag（如果存在）
    git tag -d 1.2.2 2>/dev/null
    git push origin -d tag 1.2.2 2>/dev/null

    # 重新创建本地 tag
    git tag -a 1.2.2 -m "1.2.2"
    git push origin 1.2.2
else
    echo "跳过标签上传"
fi