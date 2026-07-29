declare module 'word-extractor' {
  interface ExtractedWordDocument {
    getBody(): string
    getFootnotes(): string
    getEndnotes(): string
    getAnnotations(): string
  }

  export default class WordExtractor {
    extract(input: string | Buffer): Promise<ExtractedWordDocument>
  }
}
