import { Provider } from '../types';
import { fetchAndCache } from '../util';

export const title = 'Vine';
export const domains = ['vine.co', 'www.vine.co'];
export const regex = /^https?:\/\/(?:www\.)?vine\.co\/(?:v|oembed)\/(\w+)/;

export const extract: Provider['extract'] = async (match) => {
  const [, videoId] = match;
  const [videoResponse] = await fetchAndCache(`https://archive.vine.co/posts/${videoId}.json`);
  const video = await videoResponse.json();
  console.log(video);

  return {
    user: video.username,
    title: video.description,
    description: video.description,
    url: video.permalinkUrl,
    themeColor: '#00bf8f',
    thumbnail: video.thumbnailUrl,
    videoURL: video.videoUrl,
    width: 500,
    height: 500
  };
};
