export interface WebSearchSource {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface WebSearchImage {
  url: string;
  description?: string;
}

export interface WebSearchResult {
  answer: string;
  sources: WebSearchSource[];
  images?: WebSearchImage[];
  query: string;
  responseTime: number;
}
