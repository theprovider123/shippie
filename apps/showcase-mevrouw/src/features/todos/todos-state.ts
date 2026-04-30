/**
 * Things-to-Do — shared list. Either partner can add, check off,
 * or delete.
 */
import * as Y from 'yjs';

export interface Todo {
  id: string;
  text: string;
  done_at: string | null; // ISO when checked
  done_by: string | null; // device id of whoever checked it
  added_by: string;
  created_at: string;
  watch: boolean; // "watch mode": flag for partner to notice
}

function getTodosArray(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('todos');
}

export function readTodos(doc: Y.Doc): Todo[] {
  return getTodosArray(doc)
    .toArray()
    .map((m) => readTodoMap(m))
    .sort((a, b) => {
      // Open first, then by createdAt desc
      if (!a.done_at && b.done_at) return -1;
      if (a.done_at && !b.done_at) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
}

export function readTodoMap(map: Y.Map<unknown>): Todo {
  return {
    id: (map.get('id') as string | undefined) ?? '',
    text: (map.get('text') as string | undefined) ?? '',
    done_at: (map.get('done_at') as string | null | undefined) ?? null,
    done_by: (map.get('done_by') as string | null | undefined) ?? null,
    added_by: (map.get('added_by') as string | undefined) ?? '',
    created_at: (map.get('created_at') as string | undefined) ?? new Date().toISOString(),
    watch: !!map.get('watch'),
  };
}

export function addTodo(
  doc: Y.Doc,
  addedBy: string,
  text: string,
  watch = false,
): Todo {
  const id = uuid();
  const map = new Y.Map<unknown>();
  doc.transact(() => {
    map.set('id', id);
    map.set('text', text);
    map.set('done_at', null);
    map.set('done_by', null);
    map.set('added_by', addedBy);
    map.set('created_at', new Date().toISOString());
    map.set('watch', watch);
    getTodosArray(doc).push([map]);
  });
  return readTodoMap(map);
}

export function toggleTodo(doc: Y.Doc, id: string, doneBy: string): void {
  const arr = getTodosArray(doc);
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i)!;
    if (m.get('id') !== id) continue;
    const isDone = !!m.get('done_at');
    if (isDone) {
      m.set('done_at', null);
      m.set('done_by', null);
    } else {
      m.set('done_at', new Date().toISOString());
      m.set('done_by', doneBy);
    }
    return;
  }
}

export function deleteTodo(doc: Y.Doc, id: string): void {
  const arr = getTodosArray(doc);
  for (let i = 0; i < arr.length; i++) {
    if (arr.get(i)!.get('id') === id) {
      arr.delete(i, 1);
      return;
    }
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
