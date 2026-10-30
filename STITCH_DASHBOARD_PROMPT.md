# 🔥 Stitch Dashboard Master Prompt: CrimsonPanel (Web)

> **Important**: When creating your project in Stitch, select **`Web`** (Desktop/Web responsive application).

Copy and paste the exact prompt below into **Stitch**:

---

```markdown
Create a high-performance, responsive Web dashboard called "CrimsonPanel" designed for managing and running Python and Node.js applications hosted on a Linux VPS.

### 🎨 Visual Theme & Aesthetic (Professional Crimson Red):
- **Color Palette**:
  - Background: Deep Obsidian / Carbon Black (`#0A0B0E`)
  - Elevated Cards / Surfaces: Dark Charcoal Glass (`#12141A`, `#181B22`) with subtle crimson border (`#2D1519` and border hover `#EF444455`)
  - Primary Brand & Accents: Crimson Red (`#EF4444`, `#DC2626`, `#991B1B`) with neon ruby glows (`box-shadow: 0 0 25px rgba(239, 68, 68, 0.25)`)
  - Status Colors: Running = Emerald Glow (`#10B981`), Stopped = Muted Slate/Red (`#6B7280`), Error/Crashed = Blazing Crimson (`#EF4444`), Building = Amber (`#F59E0B`)
  - Typography: Clean modern sans-serif (Inter / Geist) with monospace (JetBrains Mono / Fira Code) for logs, ports, and code.
- **Micro-Interactions & Framer Motion**:
  - Fluid page transitions with `AnimatePresence` (fade-in & slide-up).
  - Hover lift and subtle red aura glow on cards and buttons.
  - Animated pulsing status indicators on active applications.
  - Smooth spring animations for modals, slide-overs, and notification toasts.
  - Interactive charts for CPU and RAM monitoring.

---

### 🖥️ Page Layouts & Screens to Generate:

#### 1. Authentication (Login & Register)
- Sleek centered glassmorphic card with a glowing crimson flame/pulse logo and title "CrimsonPanel".
- Toggle between **Login** and **Register**.
- Input fields: Username/Email, Password (with show/hide eye toggle).
- "First registered user becomes SuperAdmin" informative badge.
- Store JWT token in localStorage and redirect to `/dashboard`.

#### 2. Navigation & Sidebar
- Left sidebar with logo: "CRIMSON" in bold with glowing red flame icon.
- Navigation links:
  - 📊 **Overview** (Global system stats & quick actions)
  - 🚀 **Applications** (List of Node.js & Python apps)
  - 🖥️ **Live Terminal** (Real-time log viewer across services)
  - 📁 **File Manager / Editor** (In-browser code editor)
  - 🛡️ **Admin Center** (Only visible to admin role: user management & VPS load)
- Bottom bar: Current logged-in user card with role badge (`ADMIN` or `USER`), and Logout button.

#### 3. Overview Dashboard
- **Top Metrics Row** (3 animated cards):
  - VPS CPU Load gauge (live percentage & core count).
  - VPS Memory Usage ring / progress bar (used MB vs total MB).
  - Active Applications counter (e.g. `5 / 6 Running`).
- **Quick Deploy Header Action**:
  - "+ New Application" button opening a Framer Motion modal.
  - Wizard selects **Runtime**: [Node.js 22 LTS] or [Python 3.12].
  - Fields: App Name, Port (optional, e.g. 3000 or 8000), Entrypoint file (`index.js` or `main.py`), and Auto-Restart toggle.
- **Applications Grid / Table**:
  - Cards displaying App Name, Type (Node.js or Python badge with official icon), Port, Uptime, Status badge.
  - Quick action pill buttons: Start (Green), Stop (Red), Restart (Amber), Open Terminal, and Delete.

#### 4. Application Details & Control Center (Tabs)
When clicking an app, open its control center with:
- **Action Bar**: Big Start, Stop, Restart buttons, and "📦 Install Dependencies" (`npm install` or `pip install` with live output).
- **Tab 1: 🖥️ Live Terminal & Logs**:
  - Monospace terminal with dark carbon background and red accent header.
  - Real-time log streaming over WebSocket (`ws://<VPS_IP>:4000/ws`).
  - Stream color differentiation: `stdout` in clean white/green, `stderr` in red, `system` messages in cyan.
  - Controls: "Auto-scroll" switch, "Clear Logs", "Download Log", and Search input filter.
- **Tab 2: 📝 Code & File Editor**:
  - Left pane: File tree of the app workspace (`main.py`, `package.json`, `.env`, etc.).
  - Right pane: Code editor with line numbers, syntax highlighting, and a "Save Changes" button.
- **Tab 3: ⚙️ Environment Variables & Config**:
  - Interactive Key-Value table for environment variables (e.g. `PORT`, `DATABASE_URL`, `API_KEY`).
  - "Add Variable" row, reveal/mask value button, and "Apply & Restart" button.
- **Tab 4: 📈 Resource Metrics**:
  - Live charts showing process CPU % and Memory footprint over time.

#### 5. Admin Center (Admin Role Only)
- **User Management**: Table of all registered users (ID, Username, Email, Role, Created Date, Total Apps owned).
  - Actions: Change role (`admin` <-> `user`), Delete user.
- **VPS Host Diagnostics**:
  - Operating System, kernel version, hostname, uptime in days/hours.
  - Full CPU model, CPU cores, RAM distribution.

---

### 🔌 API & WebSocket Integration:
Configure the API client with Axios or Fetch using:
```javascript
export const API_BASE = "http://YOUR_VPS_IP:4000/api";
export const WS_BASE = "ws://YOUR_VPS_IP:4000/ws";

// Set Authorization header: `Bearer ${localStorage.getItem('token')}`
```

#### Key Endpoints:
- `POST /api/auth/login` & `POST /api/auth/register` & `GET /api/auth/me`
- `GET /api/apps` & `POST /api/apps` & `GET /api/apps/:id` & `PUT /api/apps/:id` & `DELETE /api/apps/:id`
- `POST /api/apps/:id/action/:action` (action = `start` | `stop` | `restart` | `install`)
- `GET /api/apps/:id/logs` & `GET /api/apps/:id/stats`
- `GET /api/files/:id/list` & `GET /api/files/:id/content?file=main.py` & `POST /api/files/:id/content`
- `GET /api/admin/system` & `GET /api/admin/users` & `PUT /api/admin/users/:id/role`
- **WebSocket Protocol**:
  - Connect to `ws://YOUR_VPS_IP:4000/ws?token=<JWT>`
  - Send: `{"type": "subscribe", "channel": "logs:<appId>"}` to receive live output
  - Receive: `{"type": "log", "appId": "...", "stream": "stdout", "message": "..."}`
  - Receive: `{"type": "system_stats", "data": {...}}` for live CPU/RAM meters
```

---

### 💡 Pro-Tips for Stitch:
1. Ensure **Web** is selected in the platform toggle.
2. In Stitch, set the primary accent color to **Crimson Red (`#EF4444`)** and dark theme background to **`#0A0B0E`**.
3. Once generated, replace `YOUR_VPS_IP` with your actual VPS public IP address (e.g. `http://123.45.67.89:4000`).
