import { Provider } from '../types';

export const providers = new Map<string, Provider>();

// @ts-ignore
const files: Provider[] = [require('./tiktok'), require('./twitter'), require('./coub'), require('./vine')];

for (const file of files) {
  for (const domain of file.domains) providers.set(domain, file);
}
