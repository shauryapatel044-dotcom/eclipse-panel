import crypto from 'crypto';
import { db } from '../database/index.js';
import { supervisor } from '../daemon/supervisor.js';

export class ScheduleController {
  // List schedules for an app
  static async listSchedules(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare('SELECT * FROM app_schedules WHERE app_id = ? ORDER BY created_at DESC');
      const schedules = stmt.all(id);

      return res.json({ schedules });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Create a schedule
  static async createSchedule(req, res) {
    try {
      const { id } = req.params;
      const { name, action, command, cron_expr } = req.body;

      if (!name || !cron_expr) {
        return res.status(400).json({ error: 'Schedule name and interval/cron expression are required' });
      }

      const scheduleId = `sched_${crypto.randomBytes(4).toString('hex')}`;
      const validAction = ['restart', 'backup', 'command'].includes(action) ? action : 'restart';

      db.prepare(`
        INSERT INTO app_schedules (id, app_id, name, action, command, cron_expr, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(scheduleId, id, name.trim(), validAction, command || '', cron_expr.trim());

      return res.status(201).json({
        message: 'Scheduled task created successfully',
        schedule: { id: scheduleId, app_id: id, name, action: validAction, command, cron_expr, is_active: 1 }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Toggle or update schedule
  static async updateSchedule(req, res) {
    try {
      const { id, scheduleId } = req.params;
      const { is_active, name, action, command, cron_expr } = req.body;

      db.prepare(`
        UPDATE app_schedules
        SET is_active = COALESCE(?, is_active),
            name = COALESCE(?, name),
            action = COALESCE(?, action),
            command = COALESCE(?, command),
            cron_expr = COALESCE(?, cron_expr)
        WHERE id = ? AND app_id = ?
      `).run(is_active !== undefined ? (is_active ? 1 : 0) : null, name, action, command, cron_expr, scheduleId, id);

      return res.json({ message: 'Schedule updated successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Run schedule on-demand
  static async runScheduleNow(req, res) {
    try {
      const { id, scheduleId } = req.params;
      const sched = db.prepare('SELECT * FROM app_schedules WHERE id = ? AND app_id = ?').get(scheduleId, id);
      if (!sched) return res.status(404).json({ error: 'Schedule not found' });

      if (sched.action === 'restart') {
        await supervisor.restartApp(id);
      } else if (sched.action === 'command' && sched.command) {
        await supervisor.sendCommand(id, sched.command);
      }

      db.prepare('UPDATE app_schedules SET last_run = CURRENT_TIMESTAMP WHERE id = ?').run(scheduleId);

      return res.json({ message: `Triggered "${sched.name}" (${sched.action}) successfully!` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Delete schedule
  static async deleteSchedule(req, res) {
    try {
      const { id, scheduleId } = req.params;
      db.prepare('DELETE FROM app_schedules WHERE id = ? AND app_id = ?').run(scheduleId, id);
      return res.json({ message: 'Schedule deleted successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
