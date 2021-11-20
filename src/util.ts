export function cutoffText(text: string, limit = 2000) {
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

export function makeid(len: number) {
  let text = '';
  const char_list = '0123456789';
  for (let i = 0; i < len; i += 1) {
    text += char_list.charAt(Math.floor(Math.random() * char_list.length));
  }
  return text;
}

export function userAgent() {
  const os = [
    'Macintosh; Intel Mac OS X 10_15_7',
    'Macintosh; Intel Mac OS X 10_15_5',
    'Macintosh; Intel Mac OS X 10_11_6',
    'Macintosh; Intel Mac OS X 10_6_6',
    'Macintosh; Intel Mac OS X 10_9_5',
    'Macintosh; Intel Mac OS X 10_10_5',
    'Macintosh; Intel Mac OS X 10_7_5',
    'Macintosh; Intel Mac OS X 10_11_3',
    'Macintosh; Intel Mac OS X 10_10_3',
    'Macintosh; Intel Mac OS X 10_6_8',
    'Macintosh; Intel Mac OS X 10_10_2',
    'Macintosh; Intel Mac OS X 10_10_3',
    'Macintosh; Intel Mac OS X 10_11_5',
    'Windows NT 10.0; Win64; x64',
    'Windows NT 10.0; WOW64',
    'Windows NT 10.0'
  ];

  return `Mozilla/5.0 (${os[Math.floor(Math.random() * os.length)]}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${
    Math.floor(Math.random() * 3) + 87
  }.0.${Math.floor(Math.random() * 190) + 4100}.${Math.floor(Math.random() * 50) + 140} Safari/537.36`;
}

export function redirectDebug(message: string, url: string, debug: boolean) {
  console.log(message);
  if (debug)
    return new Response(`<html><body><h1>${message}</h1><p>URL: ${url}</p></body></html>`, {
      headers: {
        'content-type': 'text/html;charset=UTF-8'
      }
    });
  else return Response.redirect(url, 302);
}

export async function fetchAndCache(
  url: string,
  options: RequestInit = {},
  includeOptions = false
): Promise<[Response, () => Promise<boolean>]> {
  const cache = await caches.open('fetch');
  const cacheKey = new Request(url, includeOptions ? options : {});
  const uncache = cache.delete.bind(cache, cacheKey);
  const cached = await cache.match(cacheKey);
  if (cached) return [cached, uncache];
  const response = await fetch(url, options);
  const cacheResponse = response.clone();
  cacheResponse.headers.set('cache-control', 'public, no-transform, max-age=86400');
  await cache.put(cacheKey, cacheResponse);
  return [response, uncache];
}
