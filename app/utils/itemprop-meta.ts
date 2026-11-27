type HeadInput = Exclude<Parameters<typeof useHead>[0], undefined>
type MetaArray = Extract<NonNullable<Extract<HeadInput, { meta?: unknown }>['meta']>, unknown[]>

export type HeadMetaEntry = MetaArray[number]

/**
 * Unhead v3 restricts typed meta entries to name/property/http-equiv/charset,
 * while its runtime still deduplicates tags using `key`. Providing an explicit
 * `itemprop:*` key lets child pages cleanly override the default schema.org tags.
 */
export function itempropMeta(
  itemprop: 'name' | 'description' | 'image',
  content: string | (() => string)
): HeadMetaEntry {
  return {
    key: `itemprop:${itemprop}`,
    itemprop,
    content
  } as unknown as HeadMetaEntry
}
