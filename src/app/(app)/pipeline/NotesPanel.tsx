'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CornerDownRight, Loader2, X } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { createNote, deleteNote, updateNote } from '@/lib/actions/notes';
import { Avatar, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { CaseRow } from '../cases/types';

interface Note {
  id: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Admin notes for one case, in a dialog.
 *
 * Loaded on open rather than with the board — a pipeline of 200 cases should
 * not fetch every note nobody is reading.
 */
export function NotesPanel({
  caseRow,
  currentUserId,
  isAdmin,
  canWrite,
  onClose,
}: {
  caseRow: CaseRow;
  currentUserId: string;
  isAdmin: boolean;
  canWrite: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = React.useState<Note[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [body, setBody] = React.useState('');
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editBody, setEditBody] = React.useState('');
  const dialogRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error: loadError } = await supabase
      .from('admin_notes')
      .select('id, parent_id, author_id, body, created_at, updated_at, users ( full_name, email )')
      .eq('case_id', caseRow.id)
      .order('created_at');

    if (loadError) {
      setError(loadError.message);
      setNotes([]);
      return;
    }

    setNotes(
      (data ?? []).map((n) => {
        const author = n.users as unknown as { full_name: string | null; email: string } | null;
        return {
          id: n.id as string,
          parentId: (n.parent_id as string | null) ?? null,
          authorId: (n.author_id as string | null) ?? null,
          authorName: author?.full_name ?? author?.email ?? 'Unknown',
          body: n.body as string,
          createdAt: n.created_at as string,
          updatedAt: n.updated_at as string,
        };
      }),
    );
  }, [caseRow.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That did not work.');
      return;
    }
    after?.();
    await load();
    router.refresh();
  }

  const roots = (notes ?? []).filter((n) => !n.parentId);
  const repliesOf = (id: string) => (notes ?? []).filter((n) => n.parentId === id);

  return (
    <div
      className="fixed inset-0 z-overlay flex items-end justify-center bg-[color:var(--surface-overlay)] p-0 sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Notes on ${caseRow.case_number}`}
        tabIndex={-1}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-lg border border-edge bg-raised shadow-lg sm:rounded-lg"
      >
        <header className="flex items-start gap-3 border-b border-edge px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="tabular font-mono text-sm font-semibold text-ink">
              {caseRow.case_number}
            </h2>
            <p className="truncate text-xs text-ink-muted">
              Admin notes · {notes?.length ?? 0} entr{(notes?.length ?? 0) === 1 ? 'y' : 'ies'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notes"
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-ink-muted hover:bg-sunken hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {notes === null ? (
            <p className="flex items-center gap-2 py-6 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading notes…
            </p>
          ) : null}

          {notes !== null && roots.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">
              Nothing recorded yet. Notes here are for working commentary — what happened to the
              case is kept separately in the activity log, where nobody can edit it.
            </p>
          ) : null}

          {roots.map((note) => (
            <div key={note.id} className="space-y-2">
              <NoteBody
                note={note}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                canWrite={canWrite}
                busy={busy}
                editing={editing === note.id}
                editBody={editBody}
                onEditBody={setEditBody}
                onStartEdit={() => {
                  setEditing(note.id);
                  setEditBody(note.body);
                }}
                onCancelEdit={() => setEditing(null)}
                onSaveEdit={() =>
                  run(
                    () => updateNote({ noteId: note.id, caseId: caseRow.id, body: editBody }),
                    () => setEditing(null),
                  )
                }
                onDelete={() => run(() => deleteNote({ noteId: note.id, caseId: caseRow.id }))}
                onReply={() => setReplyTo(replyTo === note.id ? null : note.id)}
              />

              {repliesOf(note.id).map((reply) => (
                <div key={reply.id} className="ml-6 border-l-2 border-edge pl-3">
                  <NoteBody
                    note={reply}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    canWrite={canWrite}
                    busy={busy}
                    editing={editing === reply.id}
                    editBody={editBody}
                    onEditBody={setEditBody}
                    onStartEdit={() => {
                      setEditing(reply.id);
                      setEditBody(reply.body);
                    }}
                    onCancelEdit={() => setEditing(null)}
                    onSaveEdit={() =>
                      run(
                        () => updateNote({ noteId: reply.id, caseId: caseRow.id, body: editBody }),
                        () => setEditing(null),
                      )
                    }
                    onDelete={() => run(() => deleteNote({ noteId: reply.id, caseId: caseRow.id }))}
                  />
                </div>
              ))}

              {replyTo === note.id && canWrite ? (
                <form
                  className="ml-6 flex gap-2 border-l-2 border-edge pl-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      () => createNote({ caseId: caseRow.id, body, parentId: note.id }),
                      () => {
                        setBody('');
                        setReplyTo(null);
                      },
                    );
                  }}
                >
                  <input
                    autoFocus
                    required
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Reply…"
                    className="h-8 flex-1 rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted"
                  />
                  <Button type="submit" size="sm" loading={busy}>
                    Reply
                  </Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>

        {error ? (
          <p
            role="alert"
            className="mx-4 mb-2 flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {canWrite ? (
          <form
            className="flex gap-2 border-t border-edge px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (replyTo) return;
              run(
                () => createNote({ caseId: caseRow.id, body }),
                () => setBody(''),
              );
            }}
          >
            <input
              required
              value={replyTo ? '' : body}
              disabled={Boolean(replyTo)}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a note…"
              aria-label="New note"
              className="h-9 flex-1 rounded border border-edge-strong bg-raised px-3 text-base text-ink placeholder:text-ink-muted disabled:bg-sunken"
            />
            <Button type="submit" loading={busy} disabled={Boolean(replyTo)}>
              Add
            </Button>
          </form>
        ) : (
          <p className="border-t border-edge px-4 py-3 text-xs text-ink-muted">
            Read-only access — you can see notes but not add them.
          </p>
        )}
      </div>
    </div>
  );
}

function NoteBody({
  note,
  currentUserId,
  isAdmin,
  canWrite,
  busy,
  editing,
  editBody,
  onEditBody,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onReply,
}: {
  note: Note;
  currentUserId: string;
  isAdmin: boolean;
  canWrite: boolean;
  busy: boolean;
  editing: boolean;
  editBody: string;
  onEditBody: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onReply?: () => void;
}) {
  // Mirrors the RLS policy: author or admin. The database refuses anything else
  // regardless, so this only decides whether to draw the control.
  const mayChange = note.authorId === currentUserId || isAdmin;
  const edited = note.updatedAt !== note.createdAt;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <Avatar name={note.authorName} size="sm" />
        <span className="text-xs font-medium text-ink">{note.authorName}</span>
        <span className="tabular font-mono text-2xs text-ink-muted">
          {new Date(note.createdAt).toLocaleString()}
        </span>
        {edited ? <span className="text-2xs text-ink-muted">· edited</span> : null}
      </div>

      {editing ? (
        <div className="mt-1.5 space-y-1.5">
          <textarea
            autoFocus
            rows={3}
            value={editBody}
            onChange={(e) => onEditBody(e.target.value)}
            className="w-full rounded border border-edge-strong bg-raised px-2.5 py-1.5 text-sm text-ink"
          />
          <div className="flex gap-1.5">
            <Button size="sm" onClick={onSaveEdit} loading={busy}>
              Save
            </Button>
            <Button size="sm" variant="secondary" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className={cn('mt-1 whitespace-pre-wrap pl-8 text-sm text-ink')}>{note.body}</p>
      )}

      {!editing ? (
        <div className="mt-1 flex gap-2 pl-8">
          {onReply && canWrite ? (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex cursor-pointer items-center gap-1 text-2xs text-ink-muted hover:text-ink"
            >
              <CornerDownRight className="h-3 w-3" aria-hidden="true" />
              Reply
            </button>
          ) : null}
          {mayChange && canWrite ? (
            <>
              <button
                type="button"
                onClick={onStartEdit}
                className="cursor-pointer text-2xs text-ink-muted hover:text-ink"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="cursor-pointer text-2xs text-ink-muted hover:text-danger disabled:opacity-50"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
