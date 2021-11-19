declare const VEF_CACHE: KVNamespace;

export interface Provider {
  title: string;
  domains: string[];
  regex: RegExp;
  extract(
    match: RegExpExecArray,
    url: string,
    event: FetchEvent,
    debug: boolean,
    hostURL: URL
  ): Promise<ProviderResponse | Response | null>;
}

export interface ProviderResponse {
  user: string;
  title: string;
  description?: string;
  telegramTitle?: string;
  url: string;
  thumbnail: string;
  videoURL: string;
  themeColor?: string;
  width?: number;
  height?: number;
  mediaType?: string;
}
