
# ♠ Mistress Stella's Sissy Hub

> Your personal Sissy training center PWA

## 📁 项目结构

```
vacuum-belly-pwa/
├── index.html        # 主页面
├── app.js            # 应用逻辑
├── style.css         # 样式
├── manifest.json     # PWA 配置
├── sw.js             # Service Worker（离线缓存）
├── sfx/              # 音效文件
│   ├── countdown-tick.wav
│   └── phase-end.wav
└── README.md         # 本文件
```

---

## 🚀 Git 部署流程（首次）

### 1. 创建 GitHub 仓库

1. 打开 https://github.com/new
2. 仓库名：`sissy-hub`（或自定义）
3. 选择 **Public**
4. **不要**勾选 "Add a README file"
5. 点击 **Create repository**

### 2. 初始化并推送

```bash
cd E:\BaiduNetdiskDownload\Stella\vacuum-belly-pwa

git init
git add .
git commit -m "Initial commit: Sissy Hub PWA"

# 替换 <USERNAME> 为你的 GitHub 用户名
git remote add origin https://github.com/<USERNAME>/sissy-hub.git
git branch -M main
git push -u origin main
```

### 3. 启用 GitHub Pages

1. 进入仓库 **Settings** → **Pages**
2. Source 选择 **Branch: main** / **Folder: / (root)**
3. 点击 **Save**
4. 等待 1-2 分钟后访问：`https://<USERNAME>.github.io/sissy-hub/`

---

## 🔄 日常更新流程

每次修改代码后，执行以下命令即可自动部署更新：

```bash
# 1. 查看修改了哪些文件
git status

# 2. 添加所有修改
git add .

# 3. 提交（描述本次修改内容）
git commit -m "描述本次修改内容"

# 4. 推送到 GitHub（自动触发 Pages 更新）
git push
```

### 快捷一行命令

```bash
git add . && git commit -m "update" && git push
```

---

## 📱 iOS 安装方法

1. 用 iPhone 的 **Safari** 打开 `https://<USERNAME>.github.io/sissy-hub/`
2. 点击底部 **分享按钮** ⬆️
3. 选择 **"添加到主屏幕"**
4. 完成，像原生 App 一样使用

---

## ⚠️ 注意事项

| 事项 | 说明 |
|------|------|
| HTTPS | GitHub Pages 自动提供，PWA Service Worker 需要 HTTPS |
| 仓库可见性 | 免费版需要 Public 仓库 |
| 音效交互 | iOS Safari 需要用户先点击屏幕才能播放音频 |
| 离线可用 | Service Worker 会缓存所有资源 |
| 更新缓存 | 修改 `sw.js` 中的版本号可强制刷新缓存 |
