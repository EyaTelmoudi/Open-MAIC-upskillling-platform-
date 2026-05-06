import { NextRequest, NextResponse } from 'next/server';
import { isValidClassroomId } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';
import { getObject, statObject } from '@/lib/server/object-storage';

const log = createLogger('ClassroomMedia');

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classroomId: string; path: string[] }> },
) {
  const { classroomId, path: pathSegments } = await params;

  // Validate classroomId
  if (!isValidClassroomId(classroomId)) {
    return NextResponse.json({ error: 'Invalid classroom ID' }, { status: 400 });
  }

  // Validate path segments — no traversal
  const joined = pathSegments.join('/');
  if (joined.includes('..') || pathSegments.some((s) => s.includes('\0'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Only allow media/ and audio/ subdirectories
  const subDir = pathSegments[0];
  if (subDir !== 'media' && subDir !== 'audio') {
    return NextResponse.json({ error: 'Invalid path' }, { status: 404 });
  }

  const objectKey = `classrooms/${classroomId}/${pathSegments.join('/')}`;

  try {
    const stat = await statObject(objectKey);
    const ext = objectKey.slice(objectKey.lastIndexOf('.')).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const stream = await getObject(objectKey);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer | string) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        (stream as { destroy?: () => void }).destroy?.();
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    if (
      (error as { code?: string }).code === 'NotFound' ||
      (error as { code?: string }).code === 'NoSuchKey' ||
      (error as { code?: string }).code === 'ENOENT'
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    log.error(
      `Classroom media serving failed [classroomId=${classroomId}, objectKey=${objectKey}]:`,
      error,
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
