import { Provider } from '../types';
import { fetchAndCache, makeid, redirectDebug, userAgent } from '../util';

export const title = 'TikTok';
export const domains = ['tiktok.com', 'www.tiktok.com'];
export const regex = /^https?:\/\/(?:www\.)?tiktok\.com\/@([^/]+)\/video\/(\d+)/;

export const extract: Provider['extract'] = async (match, url, _, debug) => {
  const [, user, videoId] = match;
  const [page, uncache] = await fetchAndCache(`https://www.tiktok.com/@${user}/video/${videoId}`, {
    headers: {
      'user-agent': userAgent(),
      referer: 'https://www.tiktok.com/',
      cookie: `tt_webid_v2=69${makeid(17)}`
    }
  });
  const body = await page.text();
  const bodyMatch = body.match(/<script[^>]+\bid=["']__NEXT_DATA__[^>]+>\s*({.+?})\s*<\/script/);
  if (!bodyMatch) {
    await uncache();
    return redirectDebug('Body match failed', url, debug);
  }

  const data = JSON.parse(bodyMatch[1]);
  if (data.props.pageProps.statusCode === 10216) return redirectDebug('Video is private', url, debug);

  const videoData = data.props.pageProps.itemInfo.itemStruct;
  console.log(videoData);
  return {
    user: videoData.author.nickname
      ? `${videoData.author.nickname} (@${videoData.author.uniqueId})`
      : `@${videoData.author.uniqueId}`,
    title: videoData.desc,
    description: videoData.desc,
    url,
    themeColor: '#fe2c56',
    thumbnail: videoData.video.originCover,
    videoURL: videoData.video.playAddr,
    width: videoData.video.width,
    height: videoData.video.height
  };
};
