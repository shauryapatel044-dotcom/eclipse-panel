import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

// 1. REPLACE PANE-NETWORK
const netIdx = html.indexOf('<div id="pane-network"');
const netEnd = html.indexOf('<div id="pane-team"', netIdx);

const newNetHtml = `<div id="pane-network" style="display: none;">
            <!-- Section Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
              <div>
                <h2 style="font-size: 22px; font-weight: 800; color: #FFF; margin: 0; letter-spacing: -0.02em;">Network & Domain Allocations</h2>
                <p style="font-size: 13px; color: #94A3B8; margin-top: 4px;">Manage process port allocations and map custom domains/subdomains with live DNS verification.</p>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; margin-bottom: 24px;">
              <!-- Left: Primary Hardware Allocation -->
              <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 22px 24px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                  <span style="font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em;">PRIMARY NETWORK ALLOCATION</span>
                  <span class="feature-badge badge-cyan" style="font-size: 11px; padding: 4px 10px;">Primary Route</span>
                </div>

                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
                  <div style="width: 52px; height: 52px; border-radius: 12px; background: rgba(6, 182, 212, 0.12); display: flex; align-items: center; justify-content: center; color: #06B6D4; font-size: 24px;">
                    <i class="bi bi-diagram-3-fill"></i>
                  </div>
                  <div>
                    <div style="font-size: 11px; color: #94A3B8; font-weight: 600;">HOST IP & DEDICATED PORT</div>
                    <div style="font-size: 20px; font-weight: 800; color: #FFF; font-family: var(--font-mono); margin-top: 2px;">
                      <span id="net-alloc-ip">127.0.0.1</span>:<span id="net-alloc-port" style="color: #22D3EE;">3000</span>
                    </div>
                  </div>
                </div>

                <div style="background: rgba(0,0,0,0.3); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; font-size: 12px; color: #CBD5E1; line-height: 1.5;">
                  <i class="bi bi-info-circle" style="color: #06B6D4; margin-right: 6px;"></i>
                  All application sockets, HTTP servers, and container listeners must bind to this assigned port.
                </div>

                <button type="button" class="btn-secondary" style="border-radius: 20px; padding: 8px 16px; font-size: 12px; display: inline-flex; align-items: center; gap: 8px;" onclick="copyAddressToClipboard(document.getElementById('net-alloc-ip').innerText + ':' + document.getElementById('net-alloc-port').innerText)">
                  <i class="bi bi-clipboard"></i> Copy Address & Port
                </button>
              </div>

              <!-- Right: Custom Domain / Subdomain Reverse Proxy Mapping -->
              <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 22px 24px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                  <span style="font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em;">CUSTOM DOMAIN & SUBDOMAIN</span>
                  <span id="domain-status-badge" class="feature-badge" style="background: rgba(255,255,255,0.06); color: #94A3B8; font-size: 11px;">Not Configured</span>
                </div>

                <div style="margin-bottom: 16px;">
                  <label style="font-size: 12px; color: #CBD5E1; display: block; margin-bottom: 6px; font-weight: 600;">Your Domain / Subdomain</label>
                  <div style="display: flex; gap: 8px;">
                    <input type="text" id="net-domain-input" class="form-control" placeholder="e.g. play.mydomain.com or web.mysite.com" style="font-family: var(--font-mono); font-size: 13px;" oninput="updateDnsInstructions(this.value)">
                    <button type="button" class="btn-primary" onclick="saveDomainConfig()" style="border-radius: 20px; padding: 8px 18px; font-size: 12px; flex-shrink: 0;">
                      Attach Domain
                    </button>
                  </div>
                </div>

                <!-- DNS Instructions Card -->
                <div id="dns-instructions-card" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 16px; margin-bottom: 16px;">
                  <div style="font-size: 12px; font-weight: 700; color: #22D3EE; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <i class="bi bi-hdd-network"></i> DNS Configuration Required
                  </div>
                  <div style="font-size: 11px; color: #94A3B8; margin-bottom: 10px; line-height: 1.4;">
                    Add the following DNS record at your domain provider (Cloudflare, Namecheap, etc.):
                  </div>
                  <div style="display: grid; grid-template-columns: 80px 1fr 1fr; gap: 8px; background: rgba(255,255,255,0.03); padding: 8px 10px; border-radius: 6px; font-family: var(--font-mono); font-size: 11px;">
                    <div><span style="color: #64748B;">Type:</span> <strong style="color: #FFF;">A</strong></div>
                    <div><span style="color: #64748B;">Host:</span> <strong style="color: #22D3EE;" id="dns-record-host">@</strong></div>
                    <div><span style="color: #64748B;">Points to:</span> <strong style="color: #FFF;" id="dns-record-ip">127.0.0.1</strong></div>
                  </div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                  <button type="button" id="btn-verify-dns" class="btn-secondary" style="border-radius: 20px; padding: 8px 18px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;" onclick="verifyDomainDns()">
                    <i class="bi bi-shield-check"></i> Verify DNS & Activate Reverse Proxy
                  </button>
                  <span id="dns-verify-msg" style="font-size: 11px; font-family: var(--font-mono); color: #94A3B8;"></span>
                </div>
              </div>
            </div>
          </div>

          `;

html = html.slice(0, netIdx) + newNetHtml + html.slice(netEnd);
console.log('Replaced pane-network');

// 2. REPLACE PANE-TEAM (Sub-Users page matching Nebula)
const teamIdx = html.indexOf('<div id="pane-team"');
const teamEnd = html.indexOf('<div id="pane-startup"', teamIdx);

const newTeamHtml = `<div id="pane-team" style="display: none;">
            <!-- Header matching Nebula Sub-Users -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
              <div>
                <h2 style="font-size: 22px; font-weight: 800; color: #FFF; margin: 0; letter-spacing: -0.02em;">Sub-Users</h2>
                <p style="font-size: 13px; color: #94A3B8; margin-top: 4px;">Manage secondary users who have access to this server.</p>
              </div>
              <button type="button" class="btn-primary" onclick="openAddCollaboratorModal()" style="border-radius: 20px; padding: 9px 22px; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                <i class="bi bi-person-plus-fill"></i> New User
              </button>
            </div>

            <!-- Sub-Users Cards Container -->
            <div id="collaborators-card-list" style="display: flex; flex-direction: column; gap: 12px;">
              <!-- Rendered dynamically -->
              <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 48px 24px; text-align: center;">
                <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(6, 182, 212, 0.1); color: #06B6D4; display: flex; align-items: center; justify-content: center; font-size: 26px; margin: 0 auto 16px auto;">
                  <i class="bi bi-people-fill"></i>
                </div>
                <div style="font-size: 15px; font-weight: 700; color: #FFF; margin-bottom: 6px;">It looks like you have no subusers.</div>
                <p style="font-size: 13px; color: #94A3B8; max-width: 420px; margin: 0 auto 20px auto; line-height: 1.5;">Invite operators to your server and assign granular permissions for terminal, file management, power controls, and databases.</p>
                <button type="button" class="btn-primary" onclick="openAddCollaboratorModal()" style="border-radius: 20px; padding: 8px 20px; font-size: 12px;">
                  Invite Sub-User
                </button>
              </div>
            </div>
          </div>

          `;

html = html.slice(0, teamIdx) + newTeamHtml + html.slice(teamEnd);
console.log('Replaced pane-team');

fs.writeFileSync('public/app.html', html, 'utf8');
console.log('Patch DOM part 1 applied');
