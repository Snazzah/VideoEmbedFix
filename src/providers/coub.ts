import { Provider } from '../types';
import { fetchAndCache } from '../util';

export const title = 'Coub';
export const domains = ['coub.com', 'c-cdn.coub.com'];
export const regex =
  /^https?:\/\/(?:coub\.com\/(?:view|embed|coubs)\/|c-cdn\.coub\.com\/fb-player\.swf\?.*\bcoub(?:ID|id)=)([\da-z]+)/;

export const extract: Provider['extract'] = async (match) => {
  const [, videoId] = match;
  const [videoResponse] = await fetchAndCache(`https://coub.com/api/v2/coubs/${videoId}.json`);
  const video: any = await videoResponse.json();
  console.log(video);

  if (video.file_versions?.share?.default)
    return {
      user: `${video.channel.title} (@${video.channel.permalink})`,
      title: video.title,
      url: `http://coub.com/view/${videoId}`,
      themeColor: '#0026ca',
      thumbnail: video.first_frame_versions.template,
      videoURL: video.file_versions.share.default,
      width: video.size.width,
      height: video.size.height
    };

  return null;
};
