import { describe, expect, test } from 'bun:test';
import { planMigration, ENSURE_SHADOW_TABLE_SQL, type DeclaredMigrations } from './migration.ts';
import type { NormalizedColumn } from './schema.ts';

const col = (name: string, baseType: string, constraints = ''): NormalizedColumn => ({
  name,
  type: baseType as never,
  baseType,
  constraints,
});

describe('planMigration — additive', () => {
  test('adds columns missing from local', () => {
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text', 'PRIMARY KEY'), col('title', 'text'), col('prep_time', 'integer')],
      local: [col('id', 'text', 'PRIMARY KEY'), col('title', 'text')],
    });
    expect(plan.additive.length).toBe(1);
    const op = plan.additive[0]!;
    expect(op.kind).toBe('add_column');
    if (op.kind === 'add_column') {
      expect(op.column).toBe('prep_time');
      expect(op.sql).toContain('ADD COLUMN "prep_time" integer');
    }
    expect(plan.blocked.length).toBe(0);
  });

  test('preserves declared constraints in ADD COLUMN', () => {
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text', 'PRIMARY KEY'), col('tags', 'text', "DEFAULT '[]'")],
      local: [col('id', 'text', 'PRIMARY KEY')],
    });
    const op = plan.additive[0]!;
    expect(op.sql).toContain("DEFAULT '[]'");
  });

  test('no work when schemas match', () => {
    const same = [col('id', 'text', 'PRIMARY KEY'), col('title', 'text')];
    const plan = planMigration({ table: 'recipes', declared: same, local: same });
    expect(plan.additive.length).toBe(0);
    expect(plan.destructive.length).toBe(0);
    expect(plan.blocked.length).toBe(0);
  });
});

describe('planMigration — blocked destructive', () => {
  test('column removed from declared schema is BLOCKED without declaration', () => {
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text')],
      local: [col('id', 'text'), col('old_notes', 'text')],
    });
    expect(plan.blocked.length).toBe(1);
    const blocked = plan.blocked[0]!;
    expect(blocked.intent).toBe('drop');
    expect(blocked.column).toBe('old_notes');
    expect(blocked.reason).toContain('migrations.drop');
  });

  test('type change without transform declaration is BLOCKED', () => {
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text'), col('rating', 'real')],
      local: [col('id', 'text'), col('rating', 'integer')],
    });
    expect(plan.blocked.some((b) => b.intent === 'type_change' && b.column === 'rating')).toBe(true);
  });

  test('shadow / metadata columns (_origin, _userModified) are ignored', () => {
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text')],
      local: [col('id', 'text'), col('_origin', 'text'), col('_userModified', 'integer')],
    });
    expect(plan.blocked.length).toBe(0);
  });
});

describe('planMigration — declared drop', () => {
  test('declared drop produces destructive op + shadow capture', () => {
    const migrations: DeclaredMigrations = { drop: ['old_notes'] };
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text')],
      local: [col('id', 'text'), col('old_notes', 'text')],
      migrations,
    });
    expect(plan.blocked.length).toBe(0);
    expect(plan.destructive.length).toBe(1);
    const op = plan.destructive[0]!;
    expect(op.kind).toBe('drop_column');
    expect(plan.summary.droppedToShadow).toBe(1);
    if (op.kind === 'drop_column') {
      expect(op.shadowSql).toContain('_shippie_shadow_drops');
      expect(op.shadowSql).toContain('json_object');
    }
  });
});

describe('planMigration — declared rename', () => {
  test('rename emits RENAME COLUMN and re-aliases for further diff', () => {
    const migrations: DeclaredMigrations = { rename: { title: 'name' } };
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text'), col('name', 'text')],
      local: [col('id', 'text'), col('title', 'text')],
      migrations,
    });
    expect(plan.destructive.length).toBe(1);
    const op = plan.destructive[0]!;
    expect(op.kind).toBe('rename_column');
    expect(plan.blocked.length).toBe(0); // not a drop after the rename
  });

  test('rename to existing column name is BLOCKED', () => {
    const migrations: DeclaredMigrations = { rename: { title: 'name' } };
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text'), col('name', 'text')],
      local: [col('id', 'text'), col('title', 'text'), col('name', 'text')],
      migrations,
    });
    expect(plan.blocked.some((b) => b.intent === 'destructive_rename' && b.column === 'title')).toBe(true);
  });
});

describe('planMigration — declared transform', () => {
  test('transform with copy emits INSERT OR IGNORE', () => {
    const migrations: DeclaredMigrations = { transform: { old_title: { to: 'name', copy: true } } };
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text'), col('name', 'text')],
      local: [col('id', 'text'), col('old_title', 'text')],
      migrations,
    });
    const op = plan.destructive.find((o) => o.kind === 'transform_column');
    expect(op?.kind).toBe('transform_column');
    if (op && op.kind === 'transform_column') {
      expect(op.copy).toBe(true);
      expect(op.sql).toContain('INSERT OR IGNORE');
    }
  });

  test('transform without copy emits UPDATE', () => {
    const migrations: DeclaredMigrations = { transform: { old_title: { to: 'name' } } };
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text'), col('name', 'text'), col('old_title', 'text')],
      local: [col('id', 'text'), col('name', 'text'), col('old_title', 'text')],
      migrations,
    });
    const op = plan.destructive.find((o) => o.kind === 'transform_column');
    if (op && op.kind === 'transform_column') {
      expect(op.sql).toContain('UPDATE');
    }
  });
});

describe('planMigration — summary', () => {
  test('summary counts match plan', () => {
    const plan = planMigration({
      table: 'recipes',
      declared: [col('id', 'text'), col('name', 'text'), col('prep_time', 'integer'), col('tags', 'text')],
      local: [col('id', 'text'), col('title', 'text'), col('old_notes', 'text')],
      migrations: { rename: { title: 'name' }, drop: ['old_notes'] },
    });
    expect(plan.summary.added).toBe(2); // prep_time, tags
    expect(plan.summary.renamed).toBe(1);
    expect(plan.summary.droppedToShadow).toBe(1);
    expect(plan.summary.blocked).toBe(0);
  });
});

describe('ENSURE_SHADOW_TABLE_SQL', () => {
  test('creates the shadow table idempotently', () => {
    expect(ENSURE_SHADOW_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS');
    expect(ENSURE_SHADOW_TABLE_SQL).toContain('_shippie_shadow_drops');
    expect(ENSURE_SHADOW_TABLE_SQL).toContain('value_json');
  });
});
