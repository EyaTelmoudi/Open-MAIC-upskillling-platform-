import type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
import type { WebSearchImage } from '@/lib/types/web-search';
import { createLogger } from '@/lib/logger';
import { putObject } from '@/lib/server/object-storage';
import { searchWithTavily } from '@/lib/web-search/tavily';
import sharp from 'sharp';

const log = createLogger('SceneReferenceImages');

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SCENES_PER_COURSE = 2;

interface SceneReferenceImages {
  assignedImages: PdfImage[];
  imageMapping: ImageMapping;
}

const VISUAL_TRIGGER_PATTERNS = [
  /\bbefore\b/i,
  /\bafter\b/i,
  /\bcompare\b/i,
  /\bcomparison\b/i,
  /\bside by side\b/i,
  /\billustrat/i,
  /\bexample\b/i,
  /\breal[- ]world\b/i,
  /\bscreenshot\b/i,
  /\bdiagram\b/i,
  /\bworkflow\b/i,
  /\bprocess\b/i,
  /\barchitecture\b/i,
];

const COMPARISON_PATTERNS = [/\bcompare\b/i, /\bcomparison\b/i, /\bbefore\b/i, /\bafter\b/i];
const BLOCKED_DOMAIN_PATTERNS = [
  /shutterstock/i,
  /gettyimages/i,
  /istockphoto/i,
  /depositphotos/i,
  /alamy/i,
  /pinterest/i,
];
const BLOCKED_IMAGE_PATTERNS = [/logo/i, /icon/i, /sprite/i, /watermark/i, /thumbnail/i];

function mediaServingUrl(baseUrl: string, classroomId: string, subPath: string): string {
  return `/api/classroom-media/${classroomId}/${subPath}`;
}

function shouldSearchForVisual(outline: SceneOutline): boolean {
  if (outline.type !== 'slide') return false;
  if ((outline.suggestedImageIds?.length ?? 0) > 0) return false;
  if ((outline.mediaGenerations?.length ?? 0) > 0) return false;
  if (outline.webSearchVisual?.query) return true;

  const haystack = [outline.title, outline.description, ...(outline.keyPoints || [])].join(' ');
  return VISUAL_TRIGGER_PATTERNS.some((pattern) => pattern.test(haystack));
}

function buildSceneVisualQuery(outline: SceneOutline, requirement: string): string {
  if (outline.webSearchVisual?.query) return outline.webSearchVisual.query.trim();

  const comparisonHint = COMPARISON_PATTERNS.some((pattern) =>
    pattern.test([outline.title, outline.description, ...(outline.keyPoints || [])].join(' ')),
  )
    ? 'before after comparison'
    : 'educational illustration';

  const keyPoints = (outline.keyPoints || []).slice(0, 3).join(', ');
  return `${outline.title} ${keyPoints} ${comparisonHint} ${requirement}`.trim();
}

function scoreImageCandidate(
  image: WebSearchImage,
  outline: SceneOutline,
  query: string,
): number {
  let score = 0;
  const lowerUrl = image.url.toLowerCase();
  const lowerDescription = (image.description || '').toLowerCase();
  const lowerSceneText = [outline.title, outline.description, ...(outline.keyPoints || [])]
    .join(' ')
    .toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerDescription.includes(outline.title.toLowerCase())) score += 5;

  for (const token of lowerQuery.split(/\s+/).filter((part) => part.length > 3)) {
    if (lowerDescription.includes(token)) score += 1.5;
    if (lowerUrl.includes(token)) score += 0.5;
    if (lowerSceneText.includes(token)) score += 0.5;
  }

  if (outline.webSearchVisual?.useCase === 'comparison') {
    if (/compare|comparison|before|after|side by side/.test(lowerDescription)) score += 5;
  }

  if (BLOCKED_IMAGE_PATTERNS.some((pattern) => pattern.test(lowerDescription))) score -= 8;
  if (BLOCKED_IMAGE_PATTERNS.some((pattern) => pattern.test(lowerUrl))) score -= 8;
  if (BLOCKED_DOMAIN_PATTERNS.some((pattern) => pattern.test(lowerUrl))) score -= 10;
  if (!lowerUrl.startsWith('https://')) score -= 6;

  return score;
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large: ${contentLength} bytes`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large after download: ${buffer.byteLength} bytes`);
  }

  return { buffer, contentType };
}

async function readImageDimensions(buffer: Buffer): Promise<{ width?: number; height?: number }> {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    log.warn('Failed to read reference image dimensions:', error);
    return {};
  }
}

function extensionFromContentType(contentType: string): string {
  switch (contentType.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'png';
  }
}

export async function collectSceneReferenceImages(params: {
  outlines: SceneOutline[];
  requirement: string;
  apiKey: string;
  classroomId: string;
  baseUrl: string;
}): Promise<Map<string, SceneReferenceImages>> {
  const { outlines, requirement, apiKey, classroomId, baseUrl } = params;
  const eligibleOutlines = outlines.filter(shouldSearchForVisual).slice(0, MAX_SCENES_PER_COURSE);
  const results = new Map<string, SceneReferenceImages>();

  for (const outline of eligibleOutlines) {
    const query = buildSceneVisualQuery(outline, requirement);
    try {
      const searchResult = await searchWithTavily({
        query,
        apiKey,
        maxResults: 5,
        includeImages: true,
        includeImageDescriptions: true,
      });

      const bestImage = (searchResult.images || [])
        .map((image) => ({
          image,
          score: scoreImageCandidate(image, outline, query),
        }))
        .sort((a, b) => b.score - a.score)[0];

      if (!bestImage || bestImage.score < 2) {
        log.info(`No suitable reference image found for "${outline.title}"`);
        continue;
      }

      const { buffer, contentType } = await downloadImage(bestImage.image.url);
      const extension = extensionFromContentType(contentType);
      const dimensions = await readImageDimensions(buffer);
      const filename = `${outline.id}_reference.${extension}`;
      const objectKey = `classrooms/${classroomId}/references/${filename}`;
      await putObject(objectKey, buffer, { 'Content-Type': contentType });

      const imageId = `web_img_${outline.order}`;
      const sourceTitle =
        searchResult.sources.find((source) => {
          try {
            return bestImage.image.url.includes(new URL(source.url).hostname);
          } catch {
            return false;
          }
        })?.title || undefined;
      const description =
        bestImage.image.description ||
        `Use this image as the concrete visual example for ${outline.title}.`;
      const serveUrl = mediaServingUrl(baseUrl, classroomId, `references/${filename}`);

      results.set(outline.id, {
        assignedImages: [
          {
            id: imageId,
            src: '',
            pageNumber: 0,
            description,
            sourceType: 'web',
            sourceUrl: bestImage.image.url,
            sourceTitle,
            width: dimensions.width,
            height: dimensions.height,
          },
        ],
        imageMapping: {
          [imageId]: serveUrl,
        },
      });

      log.info(`Attached web reference image for "${outline.title}" from ${bestImage.image.url}`);
    } catch (error) {
      log.warn(`Reference image search failed for "${outline.title}":`, error);
    }
  }

  return results;
}
