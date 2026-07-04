"use client";

import { useState } from "react";

// Rough heuristic for "probably wraps past 2 lines at this column width" —
// no layout measurement needed, just avoids showing the toggle for short notes.
const PREVIEW_CHAR_THRESHOLD = 120;

export function CommentsCell({
  collectorId,
  notes,
  onSaved,
}: {
  collectorId: number | null;
  notes: string | null;
  onSaved?: (notes: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (collectorId == null) {
    return (
      <span className="text-xs italic text-neutral-600">
        add a nickname first
      </span>
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/collectors/${collectorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
      if (res.ok) {
        const data = await res.json();
        onSaved?.(data.notes);
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        disabled={saving}
        rows={3}
        placeholder="Add a comment..."
        className="w-56 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
      />
    );
  }

  if (!notes) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs italic text-neutral-500 hover:underline"
      >
        add comment
      </button>
    );
  }

  const isLong = notes.length > PREVIEW_CHAR_THRESHOLD;

  return (
    <div className="max-w-xs text-xs text-neutral-300">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to edit"
        className={`block whitespace-pre-wrap text-left hover:underline ${
          expanded ? "" : "line-clamp-2"
        }`}
      >
        {notes}
      </button>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-neutral-500 hover:underline"
        >
          {expanded ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
}
