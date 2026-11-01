import type Database from 'better-sqlite3';
import { AppError } from '../../ipc/core.ts';
import type { Payment, PaymentStatus, PaymentType, ProjectForPayments } from '../../../shared/types.ts';
import { requireProject } from '../projects/index.ts';

export interface NewPayment {
  project_id: number;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  due_date?: string | null;
  notes?: string | null;
}

interface PaymentRow {
  id: number;
  project_id: number;
  amount: number;
  status: PaymentStatus;
  deleted_at: string | null;
}

const PAYMENT_SELECT = `
  SELECT p.id, p.project_id, p.amount, p.type, p.status, p.due_date, p.received_at, p.notes,
         pr.name AS project_name, pr.category AS project_category, pr.stage AS project_stage,
         pr.payment_agreed, pr.payment_received AS project_payment_received
  FROM payments p
  JOIN projects pr ON p.project_id = pr.id
`;

export function listPayments(db: Database.Database): { payments: Payment[]; projects: ProjectForPayments[] } {
  const payments = db.prepare(`${PAYMENT_SELECT}
    WHERE p.deleted_at IS NULL AND pr.deleted_at IS NULL
    ORDER BY p.due_date ASC
  `).all() as Payment[];
  const projects = db.prepare(`
    SELECT id, name, category, stage, payment_agreed, payment_received
    FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC
  `).all() as ProjectForPayments[];
  return { payments, projects };
}

function requirePayment(db: Database.Database, id: number): PaymentRow {
  const row = db.prepare('SELECT id, project_id, amount, status, deleted_at FROM payments WHERE id = ? AND deleted_at IS NULL').get(id) as PaymentRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', `Payment ${id} not found`);
  return row;
}

// A milestone created as already received counts toward the project at once — in one transaction
export function createPayment(db: Database.Database, data: NewPayment): Payment {
  return db.transaction(() => {
    requireProject(db, data.project_id);
    const received = data.status === 'received';
    const result = db.prepare(`
      INSERT INTO payments (project_id, amount, type, status, due_date, notes, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(data.project_id, data.amount, data.type, data.status, data.due_date || null, data.notes || null,
      received ? new Date().toISOString() : null);
    if (received) {
      db.prepare(`UPDATE projects SET payment_received = COALESCE(payment_received, 0) + ?, last_updated = datetime('now') WHERE id = ?`)
        .run(data.amount, data.project_id);
    }
    return db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).get(result.lastInsertRowid) as Payment;
  })();
}

// Amount and project come from the stored row, never from the renderer
export function markPaymentReceived(db: Database.Database, id: number) {
  db.transaction(() => {
    const payment = requirePayment(db, id);
    if (payment.status === 'received') throw new AppError('CONFLICT', 'This milestone is already marked received');
    db.prepare(`UPDATE payments SET status = 'received', received_at = datetime('now') WHERE id = ?`).run(id);
    db.prepare(`UPDATE projects SET payment_received = COALESCE(payment_received, 0) + ?, last_updated = datetime('now') WHERE id = ?`)
      .run(payment.amount, payment.project_id);
  })();
}

// Soft delete; a received milestone stops counting toward the project in the same transaction
export function softDeletePayment(db: Database.Database, id: number) {
  db.transaction(() => {
    const payment = requirePayment(db, id);
    db.prepare(`UPDATE payments SET deleted_at = datetime('now') WHERE id = ?`).run(id);
    if (payment.status === 'received') {
      db.prepare(`UPDATE projects SET payment_received = COALESCE(payment_received, 0) - ?, last_updated = datetime('now') WHERE id = ?`)
        .run(payment.amount, payment.project_id);
    }
  })();
}

export function restorePayment(db: Database.Database, id: number) {
  db.transaction(() => {
    const payment = db.prepare('SELECT id, project_id, amount, status, deleted_at FROM payments WHERE id = ?').get(id) as PaymentRow | undefined;
    if (!payment || !payment.deleted_at) throw new AppError('NOT_FOUND', `Payment ${id} is not in the trash`);
    db.prepare('UPDATE payments SET deleted_at = NULL WHERE id = ?').run(id);
    if (payment.status === 'received') {
      db.prepare(`UPDATE projects SET payment_received = COALESCE(payment_received, 0) + ?, last_updated = datetime('now') WHERE id = ?`)
        .run(payment.amount, payment.project_id);
    }
  })();
}
