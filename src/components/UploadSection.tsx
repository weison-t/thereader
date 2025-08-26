"use client";

import { useId, useRef, useState } from "react";

type UploadSectionProps = {
  title: string;
  description?: string;
  allowedExtensions?: string[];
  maxSizeMB?: number;
  onFilesSelected?: (files: FileList) => void;
};

export const UploadSection = ({
  title,
  description,
  allowedExtensions,
  maxSizeMB,
  onFilesSelected,
}: UploadSectionProps) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      setSelectedNames([]);
      setErrors([]);
      return;
    }
    const extensionList = (allowedExtensions ?? []).map((ext) => ext.trim().toLowerCase());
    const maxBytes = typeof maxSizeMB === "number" ? maxSizeMB * 1024 * 1024 : undefined;

    const isAllowedExt = (name: string) => {
      if (extensionList.length === 0) return true;
      const lower = name.toLowerCase();
      return extensionList.some((ext) => lower.endsWith(ext));
    };

    const isAllowedSize = (size: number) => {
      if (typeof maxBytes !== "number") return true;
      return size <= maxBytes;
    };

    const invalids: string[] = [];
    Array.from(files).forEach((file) => {
      const problems: string[] = [];
      if (!isAllowedExt(file.name)) {
        problems.push(`invalid type`);
      }
      if (!isAllowedSize(file.size)) {
        problems.push(`exceeds ${maxSizeMB} MB`);
      }
      if (problems.length > 0) {
        invalids.push(`${file.name} (${problems.join(", ")})`);
      }
    });

    if (invalids.length > 0) {
      setErrors([`Please fix file issues:`, ...invalids]);
      // reset input to avoid submitting invalid files
      e.target.value = "";
      setSelectedNames([]);
      return;
    }

    setErrors([]);
    setSelectedNames(Array.from(files).map((f) => f.name));
    onFilesSelected?.(files);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-3">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Upload files for ${title}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="group flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-gray-300 p-6 text-center hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-gray-700 dark:hover:border-gray-600"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span className="mt-2 text-xs text-gray-600 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-gray-200">
          Click to choose files or press Enter
        </span>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={(allowedExtensions ?? []).join(",")}
          className="hidden"
          onChange={handleChange}
        />
      </div>
      {errors.length > 0 ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <ul className="list-disc space-y-1 pl-5">
            {errors.map((err, idx) => (
              <li key={`${err}-${idx}`}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {selectedNames.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-300">
          {selectedNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

export default UploadSection;

