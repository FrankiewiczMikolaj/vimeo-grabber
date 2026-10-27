import { SaxesParser } from 'saxes';
import type { DetectionStatus, ManifestReference, Track } from './model';

interface Element {
  name: string;
  attrs: Record<string, string>;
  children: Element[];
  text: string;
}
export interface MpdTrack extends Track {
  /** Resolved first BaseURL at each level; not a segment or download URL. */
  readonly baseUrl: string;
}
export interface MpdResult {
  readonly status: DetectionStatus;
  readonly tracks: readonly MpdTrack[];
}
const namespace = 'urn:mpeg:dash:schema:mpd:2011';
const children = (node: Element, name: string) => node.children.filter(child => child.name === name);
const numeric = (value: string | undefined, rational = false): number | null => {
  if (!value || !(rational ? /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/ : /^\d+$/).test(value)) return null;
  const [n, d = '1'] = value.split('/');
  const result = Number(n) / Number(d);
  return Number.isFinite(result) && result > 0 ? result : null;
};

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
    const tracks: MpdTrack[] = [];
    let skipped = false;
    const visit = (node: Element, inherited: Record<string, string>, parentUrl: string,
      parentChannels: string | null, groupId: string | null, path: string) => {
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
      const baseUrl = base ? new URL(base, parentUrl).href : parentUrl;
      const channelNode = children(node, 'AudioChannelConfiguration')[0];
      const channels = channelNode ? channelNode.attrs.value || null : parentChannels;
      if (node.name === 'AdaptationSet') groupId = node.attrs.id || null;
      if (node.name === 'Representation') {
        const mimeType = attrs.mimeType || null;
        const mediaType = attrs.contentType || mimeType?.split('/')[0];
        const kind = mediaType === 'video' || mediaType === 'audio' || mediaType === 'combined' ? mediaType : null;
        if (!kind) { skipped = true; return; }
        tracks.push({
          id: node.attrs.id || path, groupId, kind, manifest, baseUrl,
          codec: attrs.codecs || null, mimeType, bandwidth: numeric(attrs.bandwidth),
          width: numeric(attrs.width), height: numeric(attrs.height),
          frameRate: numeric(attrs.frameRate, true), language: attrs.lang || null, channels,
        });
        return;
      }
      node.children.forEach((child, index) => {
        if (['Period', 'AdaptationSet', 'Representation'].includes(child.name)) {
          visit(child, attrs, baseUrl, channels, groupId, `${path}/${index}`);
        }
      });
    };
    visit(root, {}, new URL(responseUrl).href, null, null, 'mpd');
    return { status: skipped ? 'unsupported' : tracks.length ? 'found' : 'unavailable', tracks };
  } catch {
    return invalid;
  }
}
