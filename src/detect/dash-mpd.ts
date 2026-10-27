import { SaxesParser } from 'saxes';
import type { DetectionStatus, DownloadReference, DownloadResource, ManifestReference, Track } from './model';

interface Element {
  name: string;
  attrs: Record<string, string>;
  children: Element[];
  text: string;
}
export interface MpdResult {
  readonly status: DetectionStatus;
  readonly tracks: readonly Track[];
}
const namespace = 'urn:mpeg:dash:schema:mpd:2011';
const children = (node: Element, name: string) => node.children.filter(child => child.name === name);
const numeric = (value: string | undefined, rational = false): number | null => {
  if (!value || !(rational ? /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/ : /^\d+$/).test(value)) return null;
  const [n, d = '1'] = value.split('/');
  const result = Number(n) / Number(d);
  return Number.isFinite(result) && result > 0 ? result : null;
};

function resources(list: Element | undefined, base: string, unsafe: boolean): DownloadReference {
  if (unsafe) return { kind: 'unavailable', reason: 'unsafe' };
  if (!list) return { kind: 'unavailable', reason: 'unsupported' };
  const init = children(list, 'Initialization');
  if (!init.length) return { kind: 'unavailable', reason: 'missing-initialization' };
  const media = children(list, 'SegmentURL');
  if (init.length !== 1 || !media.length) return { kind: 'unavailable', reason: 'unknown' };
  const result: DownloadResource[] = [];
  for (const [index, node] of [init[0], ...media].entries()) {
    if (node.attrs.range || node.attrs.mediaRange || node.attrs.index || node.attrs.indexRange) {
      return { kind: 'unavailable', reason: 'unsupported' };
    }
    const value = node.attrs[index === 0 ? 'sourceURL' : 'media'];
    if (!value) return { kind: 'unavailable', reason: 'unknown' };
    const url = new URL(value, base);
    if (/\s|\\/.test(value) || url.protocol !== 'https:' ||
        url.username || url.password || url.hash) return { kind: 'unavailable', reason: 'unsafe' };
    result.push({ role: index === 0 ? 'initialization' : 'media', kind: 'url', url: url.href });
  }
  return { kind: 'resources', resources: result };
}

/** Pure metadata parser. The caller owns response URL authorization and fetching. */
export function parseDashMpd(xml: string, manifest: ManifestReference,
  responseUrl = manifest.url): MpdResult {
  const invalid: MpdResult = { status: 'unsupported', tracks: [] };
  try {
    if (manifest.protocol !== 'dash') return invalid;
    const parser = new SaxesParser({ xmlns: true });
    const stack: Element[] = [];
    let root: Element | undefined;
    let protectedContent = false;
    parser.on('doctype', () => { throw new Error('DTD is not allowed'); });
    parser.on('error', error => { throw error; });
    parser.on('opentag', tag => {
      const supported = tag.uri === namespace || tag.uri === '';
      const node: Element = { name: supported ? tag.local : '', attrs: {}, children: [], text: '' };
      for (const attr of Object.values(tag.attributes)) {
        if (attr.uri === '' || (attr.uri === 'http://www.w3.org/XML/1998/namespace' && attr.local === 'lang')) {
          node.attrs[attr.local] = attr.value;
        }
      }
      if (supported && tag.local === 'ContentProtection') protectedContent = true;
      if (stack.length) stack[stack.length - 1].children.push(node);
      else root = node;
      stack.push(node);
    });
    parser.on('text', text => { if (stack.length) stack[stack.length - 1].text += text; });
    parser.on('cdata', text => { if (stack.length) stack[stack.length - 1].text += text; });
    parser.on('closetag', () => { stack.pop(); });
    parser.write(xml).close();
    if (!root || root.name !== 'MPD') return invalid;
    if (protectedContent) return { status: 'protected', tracks: [] };
    const tracks: Track[] = [];
    let skipped = false;
    const visit = (node: Element, inherited: Record<string, string>, parentUrl: string,
      parentChannels: string | null, groupId: string | null, path: string,
      inheritedList?: Element, unsafe = false) => {
      const components = children(node, 'ContentComponent');
      const kinds = new Set(components.map(child => child.attrs.contentType).filter(Boolean));
      const languages = new Set(components.map(child => child.attrs.lang).filter(Boolean));
      const attrs = { ...inherited, ...node.attrs };
      if (!Object.hasOwn(node.attrs, 'lang') && languages.size === 1) {
        attrs.lang = [...languages][0];
      }
      if (!node.attrs.contentType) {
        const mimeKind = node.attrs.mimeType?.split('/')[0];
        if (mimeKind === 'audio' || mimeKind === 'video') attrs.contentType = mimeKind;
        else if (kinds.size === 1) attrs.contentType = [...kinds][0];
      }
      if (kinds.has('video') && kinds.has('audio')) attrs.contentType = 'combined';
      const base = children(node, 'BaseURL')[0]?.text.trim();
      const resolvedBase = new URL(base || parentUrl, parentUrl);
      const baseUrl = resolvedBase.href;
      unsafe ||= /\\/.test(base ?? parentUrl) || resolvedBase.protocol !== 'https:' ||
        !!resolvedBase.username || !!resolvedBase.password || !!resolvedBase.hash;
      const addressing = node.children.filter(child =>
        ['SegmentList', 'SegmentBase', 'SegmentTemplate'].includes(child.name));
      const list = addressing.length ? addressing.length === 1 && addressing[0].name === 'SegmentList'
        ? addressing[0] : undefined : inheritedList;
      const channelNode = children(node, 'AudioChannelConfiguration')[0];
      const channels = channelNode ? channelNode.attrs.value || null : parentChannels;
      if (node.name === 'AdaptationSet') groupId = node.attrs.id || null;
      if (node.name === 'Representation') {
        const mimeType = attrs.mimeType || null;
        const mediaType = attrs.contentType || mimeType?.split('/')[0];
        const kind = mediaType === 'video' || mediaType === 'audio' || mediaType === 'combined' ? mediaType : null;
        if (!kind) { skipped = true; return; }
        tracks.push({
          id: node.attrs.id || path, groupId, kind, manifest,
          download: resources(list, baseUrl, unsafe),
          codec: attrs.codecs || null, mimeType, bandwidth: numeric(attrs.bandwidth),
          width: numeric(attrs.width), height: numeric(attrs.height),
          frameRate: numeric(attrs.frameRate, true), language: attrs.lang || null, channels,
        });
        return;
      }
      node.children.forEach((child, index) => {
        if (['Period', 'AdaptationSet', 'Representation'].includes(child.name)) {
          visit(child, attrs, baseUrl, channels, groupId, `${path}/${index}`, list, unsafe);
        }
      });
    };
    visit(root, {}, new URL(responseUrl).href, null, null, 'mpd');
    return { status: skipped ? 'unsupported' : tracks.length ? 'found' : 'unavailable', tracks };
  } catch {
    return invalid;
  }
}
