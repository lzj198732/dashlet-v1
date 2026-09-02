# Dashlet

> Lightweight dashboard for small apps / 轻量级私人仪表盘
>
> **[Live Demo](https://jaberqayad.github.io/dashlet/)**

Dashlet is a modern, self-hosted dashboard for your homelab services, focusing on a clean code, modular styling, and robust settings management.

Dashlet 是面向家庭实验室 / 私人 NAS 的自托管仪表盘，支持中英文界面和登录访问控制。

<p align="left">
  <img src="screenshots/showcase.gif" width="600" />
</p>

## Features

- **Pure & Fast**: Built with Vanilla JS and SCSS. No heavy frameworks.
- **Chinese / English**: Switch language in the header or Settings.
- **Access Control**: First-run admin setup, login, password change, and multi-user management. `config.json` and service data stay private until you sign in.
- **Glassmorphism UI**: Modern, sleek interface with dynamic animations.
- **Config Driven**: Load settings/services from `public/config.json`.
- **Customizable**:
    - **Themes**: System, Dark, Light, Custom Accent Colors.
    - **Backgrounds**: Set custom wallpaper URLs.
    - **Dynamic Sorting**: Sort by Name, URL, Description, or Manual order.
- **Drag & Drop**: Reorder your services effortlessly in Manual mode.
    - **Header/Footer**: Clean layout with fixed controls.
    - **Custom Files**: `public/custom.css` and `public/custom.js` support.

- **纯净快速**：Vanilla JS + SCSS，无重型框架。
- **中英双语**：页头或设置中切换语言。
- **访问登录**：首次启动创建管理员，之后需登录才能看到服务列表；支持改密和用户管理。
- **毛玻璃界面**：现代简洁，带动画。
- **配置驱动**：从 `public/config.json` 加载设置和服务。

## Installation

### Local Development

1. Clone or download:
   ```bash
   git clone https://github.com/JaberQayad/dashlet.git
   cd dashlet
   ```
2. Install dependencies (for SCSS compiler):
   ```bash
   npm install
   ```
3. Run dev mode (watch SCSS and start the auth-aware server):
   ```bash
   npm run dev
   ```
   This starts the development server at `http://localhost:8989`.
   On first visit, create an admin account. After that, sign in to open the dashboard.

4. (Optional) Run production preview:
   ```bash
   npm start
   ```
   This serves the static files without live reload.

### Deployment (Netlify/Vercel)

- [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/JaberQayad/dashlet) 

- [![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/git-source?repository=https://github.com/JaberQayad/dashlet)


### Docker Deployment

Run Dashlet instantly with Docker:

```bash
docker run -d -p 8989:8989 --name dashlet jaypel/dashlet:latest
```

Or using **Docker Compose**:

> [!TIP]
> **Data Persistence**: Mount `/app/public` for `config.json` and custom assets. Mount `/app/data` to persist login users (password hashes stay on disk, never in the browser).

```yaml
services:
  dashlet:
    image: jaypel/dashlet:latest
    container_name: dashlet
    ports:
      - "8989:8989"
    volumes:
      - ./app/public:/app/public
      - ./app/data:/app/data
    restart: unless-stopped
```

## Access / 访问登录

1. Open the dashboard. The first visitor creates the admin username and password (at least 8 characters).
2. Later visits require login. Sessions last 7 days (HttpOnly cookie).
3. In **Settings > Access**, change your password or sign out.
4. Admins can add or remove extra users.

首次打开会要求创建管理员账号（密码至少 8 位）。之后必须登录才能看到服务。会话 Cookie 有效期 7 天。设置里的「访问管理」可改密、退出；管理员可增删用户。

Access control runs in the Node server (`npm start` / Docker). Static hosts such as Netlify or Vercel cannot keep the dashboard private.

登录保护由 Node 服务（`npm start` / Docker）提供。Netlify / Vercel 静态托管无法做访问控制。

Behind a HTTPS reverse proxy, set `COOKIE_SECURE=1` so the session cookie is marked Secure.

若前面有 HTTPS 反代，请设置环境变量 `COOKIE_SECURE=1`。

To reset all accounts, delete `app/data/users.json` (or the Docker volume `./app/data`) and restart.

重置账号：删除 `app/data/users.json`（Docker 则删 `./app/data` 卷）后重启。

## Configuration

You can configure Dashlet via the UI (Settings > Export Config) or by editing `public/config.json`.
Export your current settings from the UI to generate a fresh `config.json` file.

### Example `public/config.json`

```json
{
  "settings": {
        "theme": "system",
        "accentColor": "#3b82f6",
        "blur": true,
        "animations": true,
        "openNewTab": true,
        "layout": "grid",
        "wallpaper": "",
        "searchProvider": "https://duckduckgo.com/?q=",
        "sortBy": "manual",
        "customCSS": ""
    },
  "services": [
    {
      "id": "1",
      "name": "GitHub",
      "description": "Code hosting",
      "url": "https://github.com",
      "icon": "https://github.githubassets.com/favicons/favicon.png"
    },
    {
      "id": "2",
      "name": "YouTube",
      "description": "Watch videos",
      "url": "https://youtube.com",
      "icon": "https://www.youtube.com/s/desktop/10c3d9b4/img/favicon_144x144.png"
    }
  ]
}
```

## Contributing
Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
