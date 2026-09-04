'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Send one file straight from the browser to Supabase Storage.
 *
 * XHR rather than fetch, because fetch cannot report request progress, and a
 * progress bar is the whole reason bytes do not travel through a server action.
 * FormData with an empty field name is the shape the storage API expects from a
 * browser — the same one supabase-js sends.
 *
 * Shared by the case library and by the photo and file fields inside a section,
 * so there is one upload path to get right rather than two that drift.
 */
export async function uploadToStorage({
  bucket,
  path,
  file,
  onProgress,
}: {
  bucket: string;
  path: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error('Your session has expired. Sign in again.');

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        if (body.message) message = body.message;
        else if (body.error) message = body.error;
      } catch {
        /* the body was not JSON; the status is all there is */
      }
      if (xhr.status === 403) {
        message = 'Storage refused the upload. Read-only accounts cannot add files.';
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error('The connection dropped during the upload.'));
    xhr.onabort = () => reject(new Error('The upload was cancelled.'));
    xhr.send(form);
  });
}
