import * as _ from 'lodash';

import { targetProps } from './common';
import { Target } from './lib/types';

export function generateTargetId(
  orgId: string,
  integrationId: string,
  target: Target,
): string {
  const targetData =  _.pick(target, ...targetProps)
  return `${orgId}:${integrationId}:${Object.values(targetData).join(':')}`;
}
