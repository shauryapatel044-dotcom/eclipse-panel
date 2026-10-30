import { db } from '../database/index.js';

export class NodeController {
  // List all cluster nodes (LocalNode always present and connected)
  static async listNodes(req, res) {
    try {
      const nodes = db.prepare(`
        SELECT n.*, 
               (SELECT COUNT(*) FROM apps a WHERE a.node_id = n.id) as app_count
        FROM nodes n
        ORDER BY n.is_local DESC, n.created_at ASC
      `).all();

      return res.json({ nodes });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Create a new remote cluster node (Admin only)
  static async createNode(req, res) {
    try {
      const { name, host, port, secret_token, location, cpu_cores, ram_total_mb, disk_total_mb } = req.body;
      if (!name || !host) {
        return res.status(400).json({ error: 'Node name and host address are required' });
      }

      const id = `node_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const nodePort = port ? parseInt(port, 10) : 8090;
      const cores = cpu_cores ? parseInt(cpu_cores, 10) : 4;
      const ram = ram_total_mb ? parseInt(ram_total_mb, 10) : 8192;
      const disk = disk_total_mb ? parseInt(disk_total_mb, 10) : 102400;

      const stmt = db.prepare(`
        INSERT INTO nodes (id, name, host, port, secret_token, is_local, status, location, cpu_cores, ram_total_mb, disk_total_mb)
        VALUES (?, ?, ?, ?, ?, 0, 'online', ?, ?, ?, ?)
      `);

      stmt.run(id, name.trim(), host.trim(), nodePort, secret_token || '', location || 'Remote Cloud', cores, ram, disk);

      return res.status(201).json({
        message: `Node "${name}" registered successfully`,
        node: { id, name, host, port: nodePort, is_local: 0, status: 'online' }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Update a node
  static async updateNode(req, res) {
    try {
      const { id } = req.params;
      const { name, host, port, location, cpu_cores, ram_total_mb, disk_total_mb } = req.body;

      const stmt = db.prepare(`
        UPDATE nodes 
        SET name = COALESCE(?, name),
            host = COALESCE(?, host),
            port = COALESCE(?, port),
            location = COALESCE(?, location),
            cpu_cores = COALESCE(?, cpu_cores),
            ram_total_mb = COALESCE(?, ram_total_mb),
            disk_total_mb = COALESCE(?, disk_total_mb)
        WHERE id = ?
      `);
      stmt.run(name, host, port, location, cpu_cores, ram_total_mb, disk_total_mb, id);

      return res.json({ message: 'Node updated successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Delete node (cannot delete node_local)
  static async deleteNode(req, res) {
    try {
      const { id } = req.params;
      if (id === 'node_local') {
        return res.status(400).json({ error: 'Cannot delete the primary LocalNode' });
      }

      // Check if apps exist on this node
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM apps WHERE node_id = ?');
      const { count } = countStmt.get(id);
      if (count > 0) {
        return res.status(400).json({ error: `Cannot delete node: ${count} application(s) currently hosted on it` });
      }

      db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
      return res.json({ message: 'Node deleted successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Test Node connection ping
  static async testNode(req, res) {
    try {
      const { id } = req.params;
      const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
      if (!node) return res.status(404).json({ error: 'Node not found' });

      if (node.is_local) {
        return res.json({ status: 'online', latency_ms: 1, message: 'LocalNode is healthy and connected by default.' });
      }

      // For remote nodes, try pinging health endpoint
      const startTime = Date.now();
      try {
        const response = await fetch(`http://${node.host}:${node.port}/api/health`, { signal: AbortSignal.timeout(3000) });
        const latency = Date.now() - startTime;
        return res.json({ status: response.ok ? 'online' : 'degraded', latency_ms: latency, message: `Node ping successful (${latency}ms)` });
      } catch (e) {
        return res.json({ status: 'offline', latency_ms: -1, message: `Node unreachable: ${e.message}` });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
