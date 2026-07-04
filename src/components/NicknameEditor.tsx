"use client";

import { useState } from "react";

export function NicknameEditor({
  address,
  nickname,
  onSaved,
}: {
  address: string;
  nickname: string | null;
  onSaved?: (nickname: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nickname ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/wallets/${address}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: value }),
      });
      if (res.ok) {
        const data = await res.json();
        onSaved?.(data.nickname);
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left font-medium hover:underline"
        title="Click to edit nickname"
      >
        {nickname || <span className="text-neutral-500 italic">add nickname</span>}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        disabled={saving}
        className="w-36 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-sm"
      />
    </form>
  );
}
