"use client";

import { useEffect, useId, useState } from "react";
import {
  parseOptions,
  parsePresets,
  PRESET_STORAGE_KEY,
  type SavedPreset,
} from "@/lib/preset-schema";
import { saveBlob } from "@/services/download-service";
import { setOptions, useQueueOptions } from "@/stores/queue-store";
import { DoodleIcon } from "@/components/ui/doodle-icon";

export function SavedPresets() {
  const options = useQueueOptions();
  const id = useId();
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(PRESET_STORAGE_KEY);
        if (stored) setPresets(parsePresets(JSON.parse(stored) as unknown));
      } catch {
        setMessage(
          "Saved presets could not be read. You can import a backup or save new settings.",
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  function persist(next: SavedPreset[]) {
    try {
      localStorage.setItem(
        PRESET_STORAGE_KEY,
        JSON.stringify({ version: 1, presets: next }),
      );
      setPresets(next);
      setMessage("Saved on this browser.");
    } catch {
      setMessage(
        "Your browser could not save settings. Allow local storage or export a backup.",
      );
    }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 100_000)
        throw new Error("Preset files must be smaller than 100 KB.");
      const imported = parsePresets(JSON.parse(await file.text()) as unknown);
      const next = [...presets];
      for (const preset of imported) {
        const index = next.findIndex((item) => item.id === preset.id);
        if (index < 0) next.push(preset);
        else next[index] = preset;
      }
      if (next.length > 50)
        throw new Error(
          "Delete some presets before importing. You can keep up to 50.",
        );
      persist(next);
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "This preset file could not be imported.",
      );
    }
  }
  return (
    <details className="rounded-2xl border border-line p-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
        <DoodleIcon name="folder" size={20} />
        Your saved presets
      </summary>
      <p className="my-2 text-xs leading-5 text-muted">
        Save settings for next time. Presets contain no images and stay in this
        browser. Clearing site data removes them; export a backup to keep a
        copy.
      </p>
      <label htmlFor={id} className="sr-only">
        Preset name
      </label>
      <input
        id={id}
        value={name}
        maxLength={80}
        placeholder="e.g. My product photos"
        onChange={(event) => setName(event.target.value)}
        className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm"
      />
      <button
        type="button"
        disabled={!name.trim() || presets.length >= 50}
        onClick={() => {
          persist([
            ...presets,
            {
              id: crypto.randomUUID(),
              name: name.trim(),
              options: parseOptions(options),
            },
          ]);
          setName("");
        }}
        className="my-2 min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-50"
      >
        Save current settings
      </button>
      <ul className="space-y-2">
        {presets.map((preset) => (
          <li
            key={preset.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <button
              type="button"
              className="min-h-11 truncate text-left text-accent"
              onClick={() => {
                setOptions(() => preset.options);
                setMessage(`Applied ${preset.name}.`);
              }}
            >
              {preset.name}
            </button>
            <button
              type="button"
              className="min-h-11 min-w-11"
              aria-label={`Delete ${preset.name}`}
              onClick={() =>
                persist(presets.filter((item) => item.id !== preset.id))
              }
            >
              <DoodleIcon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          disabled={!presets.length}
          className="min-h-11"
          onClick={() =>
            saveBlob(
              new Blob([JSON.stringify({ version: 1, presets }, null, 2)], {
                type: "application/json",
              }),
              "shrinkfox-presets.json",
            )
          }
        >
          Export backup
        </button>
        <label className="flex min-h-11 cursor-pointer items-center">
          Import backup
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              void importFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          disabled={!presets.length}
          className="min-h-11"
          onClick={() => persist([])}
        >
          Delete all
        </button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-xs text-muted">
          {message}
        </p>
      )}
    </details>
  );
}
