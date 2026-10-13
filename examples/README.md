# Examples

`records/` 是一份**虚构的示例台账**（一个给内部工具加 SSO 登录的小场景），用来：

1. 让你在 clone 之后直接看到"填好的样子"，而不是一堆空目录；
2. 供 **GitHub Pages** 工作流生成在线看板 demo（`.github/workflows/pages.yml`）。

用法（生成一个带示例数据的临时实例）：

```bash
node bin/wb.mjs init .demo --agent=none --no-build
cp -r examples/records/* .demo/workbench/
node bin/wb.mjs build .demo
# 打开 .demo/workbench/index/dashboard.html
```

> 这里的内容全部是示例，与任何真实项目无关。
