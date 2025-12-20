/**
 * Type definition for AT Protocol rich text facets
 * Compatible with @atproto/api RichText.facets
 */
export interface RichTextFacet {
  index: {
    byteStart: number;
    byteEnd: number;
  };
  features: Array<{
    $type: string;
    uri?: string;
    did?: string;
    tag?: string;
  }>;
}
