import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const files = ['admin-stats.html', 'index.html', 'app.html', 'admin.html'];

const modalHtml = `
  <!-- Profile & Account Settings Modal (Framer Motion / CSS Animated) -->
  <div id="profileModal" class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-[#1b1b1f] border border-[#5b403e]/40 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
      <button onclick="closeProfileModal()" class="absolute top-4 right-4 text-gray-400 hover:text-white">
        <span class="material-symbols-outlined text-xl">close</span>
      </button>
      <h3 class="text-lg font-bold text-white flex items-center gap-2 mb-1">
        <span class="material-symbols-outlined text-red-400">manage_accounts</span>
        Account & Profile Settings
      </h3>
      <p class="text-xs text-gray-400 mb-5 font-mono">Update your username, Gmail/email address, or master password.</p>

      <!-- Profile Form -->
      <form onsubmit="event.preventDefault(); saveProfileChanges();" class="space-y-3 pb-4 border-b border-[#292a2d]">
        <div>
          <label class="block text-xs font-semibold text-gray-300 uppercase font-mono mb-1">Username</label>
          <input id="editUsername" type="text" required class="w-full bg-[#0d0e11] border border-[#343538] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-mono">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-300 uppercase font-mono mb-1">Gmail / Email Address</label>
          <input id="editEmail" type="email" required class="w-full bg-[#0d0e11] border border-[#343538] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-mono">
        </div>
        <button type="submit" class="w-full py-2 rounded-lg bg-red-600 text-white font-semibold text-xs tracking-wider uppercase transition-all hover:bg-red-500 shadow-md">Save Profile Changes</button>
      </form>

      <!-- Password Change Form -->
      <form onsubmit="event.preventDefault(); savePasswordChanges();" class="space-y-3 pt-4">
        <h4 class="text-xs font-bold text-white uppercase tracking-wider font-mono">Change Master Password</h4>
        <div>
          <label class="block text-xs text-gray-400 font-mono mb-1">Current Password (optional for admin)</label>
          <input id="editCurrentPass" type="password" placeholder="••••••••" class="w-full bg-[#0d0e11] border border-[#343538] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-mono">
        </div>
        <div>
          <label class="block text-xs text-gray-400 font-mono mb-1">New Password</label>
          <input id="editNewPass" type="password" required placeholder="••••••••" class="w-full bg-[#0d0e11] border border-[#343538] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-mono">
        </div>
        <button type="submit" class="w-full py-2 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-white font-semibold text-xs tracking-wider uppercase transition-all">Update Password</button>
      </form>
    </div>
  </div>

  <script>
    function openProfileModal() {
      fetch(API_BASE + '/auth/me', { headers: getHeaders() })
        .then(r => r.json())
        .then(d => {
          if (d.user) {
            document.getElementById('editUsername').value = d.user.username;
            document.getElementById('editEmail').value = d.user.email;
            document.getElementById('profileModal').classList.remove('hidden');
          }
        })
        .catch(e => {
          document.getElementById('profileModal').classList.remove('hidden');
        });
    }

    function closeProfileModal() {
      document.getElementById('profileModal').classList.add('hidden');
    }

    async function saveProfileChanges() {
      const username = document.getElementById('editUsername').value.trim();
      const email = document.getElementById('editEmail').value.trim();
      try {
        const res = await fetch(API_BASE + '/auth/profile', {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ username, email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert('Profile updated successfully!');
        closeProfileModal();
        location.reload();
      } catch (err) { alert(err.message); }
    }

    async function savePasswordChanges() {
      const currentPassword = document.getElementById('editCurrentPass').value;
      const newPassword = document.getElementById('editNewPass').value;
      try {
        const res = await fetch(API_BASE + '/auth/password', {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert('Password updated successfully!');
        closeProfileModal();
      } catch (err) { alert(err.message); }
    }
  </script>
`;

for (const file of files) {
  const filePath = path.join(PUBLIC_DIR, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('id="profileModal"')) {
      content = content.replace('</body>', modalHtml + '</body>');
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Added Profile Modal to ${file}`);
    }
  }
}
