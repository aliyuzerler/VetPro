'use client';

import { useRef } from 'react';
import { Download, FileText, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FileAssetMeta } from '@/lib/api-types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Hasta dosyaları — private storage (kabul kriteri): içerik yalnızca yetkili
 * indirme ucuyla akar; bileşen hiçbir zaman dış URL göstermez.
 */
export function PatientFiles({
  files,
  canManage,
  onUpload,
  onDownload,
  uploading,
  downloadingId,
}: {
  files: FileAssetMeta[];
  canManage: boolean;
  onUpload: (file: File) => void;
  onDownload: (file: FileAssetMeta) => void;
  uploading?: boolean;
  downloadingId?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3" data-testid="patient-files">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Dosya yok. PDF, resim veya metin yüklenebilir.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              data-testid={`file-row-${file.id}`}
            >
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate font-medium">{file.fileName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatBytes(file.sizeBytes)} ·{' '}
                  {new Date(file.createdAt).toLocaleDateString('tr-TR')}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onDownload(file)}
                disabled={downloadingId === file.id}
                data-testid={`file-download-${file.id}`}
              >
                {downloadingId === file.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-3.5" aria-hidden />
                )}
                İndir
              </Button>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = '';
            }}
            aria-label="Dosya seç"
            data-testid="file-input"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            data-testid="file-upload-button"
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-3.5" aria-hidden />
            )}
            Dosya yükle
          </Button>
        </div>
      ) : null}
    </div>
  );
}
