import type Database from 'better-sqlite3';

// "Ask your pipeline" (Phase 5) gives the model an aggregated, anonymised view of the pipeline, never
// rows about single leads: one line per segment (category × city × website status × stage × score band
// × chain), with counts and averages. No names, phone numbers, owners, notes, addresses or ids.

export const SEGMENT_COLUMNS = [
  'category', 'city', 'website_status', 'stage', 'score_band', 'chain',
  'leads', 'avg_score', 'avg_rating', 'avg_reviews', 'with_phone', 'with_social', 'contacted',
] as const;

export interface PipelineDataset {
  csv: string;
  segments: number;
  leads: number;
}

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function buildPipelineDataset(db: Database.Database): PipelineDataset {
  const rows = db.prepare(`
    SELECT COALESCE(category, 'Uncategorized') AS category,
           COALESCE(city, 'Unknown') AS city,
           website_status,
           status AS stage,
           CASE WHEN score IS NULL THEN 'unscored'
                WHEN score >= 80 THEN '80-100' WHEN score >= 60 THEN '60-79'
                WHEN score >= 40 THEN '40-59' ELSE '0-39' END AS score_band,
           CASE WHEN is_chain = 1 THEN 'yes' ELSE 'no' END AS chain,
           COUNT(*) AS leads,
           ROUND(AVG(score), 1) AS avg_score,
           ROUND(AVG(rating), 2) AS avg_rating,
           ROUND(AVG(review_count), 1) AS avg_reviews,
           SUM(has_phone) AS with_phone,
           SUM(has_social) AS with_social,
           SUM(CASE WHEN last_contacted_at IS NOT NULL THEN 1 ELSE 0 END) AS contacted
    FROM leads
    WHERE deleted_at IS NULL
    GROUP BY 1, 2, 3, 4, 5, 6
    ORDER BY leads DESC, category, city
  `).all() as Record<(typeof SEGMENT_COLUMNS)[number], unknown>[];
  const lines = [SEGMENT_COLUMNS.join(','), ...rows.map((row) => SEGMENT_COLUMNS.map((c) => csvCell(row[c])).join(','))];
  return { csv: lines.join('\n'), segments: rows.length, leads: rows.reduce((sum, r) => sum + Number(r.leads), 0) };
}
