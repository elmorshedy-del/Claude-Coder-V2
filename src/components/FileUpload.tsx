'use client';

import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Image, File } from 'lucide-react';
import { UploadedFile } from '@/types';

interface FileUploadProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

export default function FileUpload({
  files,
  onFilesChange,
  maxFiles = 5,
  maxSizeMB = 10,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit for images (API restriction)

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    setError(null);

    const newFiles: UploadedFile[] = [];

    for (const file of Array.from(fileList)) {
      // Check file count
      if (files.length + newFiles.length >= maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`);
        break;
      }

      // Check image size limit (5MB API restriction)
      if (file.type.startsWith('image/') && file.size > MAX_IMAGE_SIZE) {
        setError(`Image "${file.name}" exceeds 5MB limit. Please use a smaller image.`);
        continue;
      }

      // Check general file size
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File ${file.name} exceeds ${maxSizeMB}MB limit`);
        continue;
      }

      // Read file as base64
      try {
        const base64 = await readFileAsBase64(file);
        newFiles.push({
          name: file.name,
          type: file.type,
          size: file.size,
          base64,
        });
      } catch {
        setError(`Failed to read ${file.name}`);
      }
    }

    if (newFiles.length > 0) {
      onFilesChange([...files, ...newFiles]);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    onFilesChange(newFiles);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return Image;
    if (type.startsWith('text/')) return FileText;
    return File;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {/* Upload area */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed
          cursor-pointer transition-all
          ${isDragging
            ? 'border-[var(--claude-terracotta)] bg-[var(--claude-terracotta-subtle)]'
            : 'border-[var(--claude-border)] hover:border-[var(--claude-border-strong)] hover:bg-[var(--claude-surface-sunken)]'
          }
        `}
      >
        <Upload className="w-4 h-4 text-[var(--claude-text-muted)]" />
        <span className="text-sm text-[var(--claude-text-secondary)]">
          Drop files or click to upload
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          accept=".txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.css,.html,.xml,.yaml,.yml,.csv,.log,.sh,.bat,.ps1,.sql,.png,.jpg,.jpeg,.gif,.webp,.pdf"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-[var(--claude-error)]">{error}</p>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => {
            const Icon = getFileIcon(file.type);
            return (
              <div
                key={index}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--claude-surface-sunken)] border border-[var(--claude-border)]"
              >
                <Icon className="w-4 h-4 text-[var(--claude-text-muted)]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--claude-text)] truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-[var(--claude-text-muted)]">
                    {formatSize(file.size)}
                  </p>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="p-1 rounded-lg hover:bg-[var(--claude-sand-light)] text-[var(--claude-text-muted)] hover:text-[var(--claude-error)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
